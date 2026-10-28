// Encodes rendered JPEG frames to H.264 MP4 using Chrome's WebCodecs encoder + a minimal MP4 muxer.
// usage: node encode.mjs <framesDir> <out.mp4>
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);
const PW = process.env.PW_CORE || '/root/.nvm/versions/node/v22.23.4/lib/node_modules/@playwright/mcp/node_modules/playwright-core';
const CHROME = process.env.CHROME_FULL || '/inner_container/opt/playwright/chromium-1232/chrome-linux64/chrome';
const { chromium } = require(PW);

const [framesDir, outFile] = process.argv.slice(2);
const meta = JSON.parse(fs.readFileSync(path.join(framesDir, 'meta.json'), 'utf8'));
const { fps, total } = meta;
const W = 886, H = 1920;

const work = path.resolve(framesDir, '..');
fs.writeFileSync(path.join(work, 'enc.html'), '<!doctype html><html><body></body></html>');
const browser = await chromium.launch({
  executablePath: CHROME, timeout: 60000,
  args: ['--no-sandbox', '--disable-crash-reporter', '--disable-crashpad-for-testing', '--disable-gpu', '--disable-software-rasterizer', '--no-zygote', '--single-process'],
  env: { ...process.env, HOME: work },
});
const page = await browser.newPage();
await page.goto('file://' + path.join(work, 'enc.html'));

const desc = await page.evaluate(async ({ W, H, fps }) => {
  window.chunks = [];
  let resolveDesc; const descP = new Promise((r) => (resolveDesc = r));
  window.enc = new VideoEncoder({
    output: (chunk, md) => {
      if (md && md.decoderConfig && md.decoderConfig.description) {
        resolveDesc(Array.from(new Uint8Array(md.decoderConfig.description)));
      }
      const buf = new Uint8Array(chunk.byteLength); chunk.copyTo(buf);
      window.chunks.push({ key: chunk.type === 'key', ts: chunk.timestamp, data: buf });
    },
    error: (e) => { window.encErr = String(e); },
  });
  window.enc.configure({ codec: 'avc1.640033', width: W, height: H, bitrate: 40_000_000, framerate: fps,
    bitrateMode: 'constant', latencyMode: 'quality', avc: { format: 'avc' } });
  window.canvas = new OffscreenCanvas(W, H);
  window.ctx = window.canvas.getContext('2d');
  window.descP = descP;
  return true;
}, { W, H, fps });

const samples = [];
let avcC = null;
async function drain() {
  const got = await page.evaluate(() => {
    const out = window.chunks.splice(0).map((c) => ({ key: c.key, ts: c.ts, b64: btoa(Array.from(c.data, (x) => String.fromCharCode(x)).join('')) }));
    return { out, err: window.encErr || null, q: window.enc.encodeQueueSize };
  });
  if (got.err) throw new Error(got.err);
  for (const c of got.out) samples.push({ key: c.key, ts: c.ts, data: Buffer.from(c.b64, 'base64') });
  return got.q;
}

const t0 = Date.now();
for (let i = 0; i < total; i++) {
  const b64 = fs.readFileSync(path.join(framesDir, `f${String(i).padStart(5, '0')}.jpg`)).toString('base64');
  await page.evaluate(async ({ b64, i, fps }) => {
    const bin = atob(b64); const u = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) u[k] = bin.charCodeAt(k);
    const bmp = await createImageBitmap(new Blob([u], { type: 'image/jpeg' }));
    window.ctx.drawImage(bmp, 0, 0); bmp.close();
    const frame = new VideoFrame(window.canvas, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) });
    window.enc.encode(frame, { keyFrame: i % (fps * 2) === 0 });
    frame.close();
    while (window.enc.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 2));
  }, { b64, i, fps });
  if (i % 30 === 29) await drain();
  if (i % 600 === 599) console.log(`encoded ${i + 1}/${total} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
await page.evaluate(() => window.enc.flush());
await drain();
avcC = Buffer.from(await page.evaluate(() => window.descP));
await browser.close();
if (samples.length !== total) throw new Error(`expected ${total} samples, got ${samples.length}`);
samples.sort((a, b) => a.ts - b.ts);

// ---------------- MP4 muxing ----------------
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0); return b; };
const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16BE(n); return b; };
const u8 = (n) => Buffer.from([n]);
const box = (type, ...parts) => { const body = Buffer.concat(parts); return Buffer.concat([u32(body.length + 8), Buffer.from(type, 'ascii'), body]); };
const full = (type, version, flags, ...parts) => box(type, u8(version), Buffer.from([(flags >> 16) & 255, (flags >> 8) & 255, flags & 255]), ...parts);
const zeros = (n) => Buffer.alloc(n);
const matrix = Buffer.concat([u32(0x10000), u32(0), u32(0), u32(0), u32(0x10000), u32(0), u32(0), u32(0), u32(0x40000000)]);

const timescale = fps * 1000;
const delta = 1000;
const durTs = total * delta;
const durMs = Math.round(total * 1000 / fps);

function moov(offsets) {
  const mvhd = full('mvhd', 0, 0, u32(0), u32(0), u32(1000), u32(durMs), u32(0x10000), u16(0x100), zeros(10), matrix, zeros(24), u32(2));
  const tkhd = full('tkhd', 0, 3, u32(0), u32(0), u32(1), u32(0), u32(durMs), zeros(8), u16(0), u16(0), u16(0), u16(0), matrix, u32(W << 16), u32(H << 16));
  const mdhd = full('mdhd', 0, 0, u32(0), u32(0), u32(timescale), u32(durTs), u16(0x55c4), u16(0));
  const hdlr = full('hdlr', 0, 0, u32(0), Buffer.from('vide'), zeros(12), Buffer.from('VideoHandler\0'));
  const vmhd = full('vmhd', 0, 1, zeros(8));
  const dinf = box('dinf', full('dref', 0, 0, u32(1), full('url ', 0, 1)));
  const avc1 = box('avc1', zeros(6), u16(1), zeros(16), u16(W), u16(H), u32(0x480000), u32(0x480000), u32(0), u16(1),
    zeros(32), u16(0x18), Buffer.from([0xff, 0xff]), box('avcC', avcC),
    box('colr', Buffer.from('nclx'), u16(1), u16(1), u16(1), u8(0)));
  const stsd = full('stsd', 0, 0, u32(1), avc1);
  const stts = full('stts', 0, 0, u32(1), u32(total), u32(delta));
  const keys = samples.map((s, i) => (s.key ? i + 1 : 0)).filter(Boolean);
  const stss = full('stss', 0, 0, u32(keys.length), ...keys.map(u32));
  const stsc = full('stsc', 0, 0, u32(1), u32(1), u32(1), u32(1));
  const stsz = full('stsz', 0, 0, u32(0), u32(total), ...samples.map((s) => u32(s.data.length)));
  const stco = full('stco', 0, 0, u32(total), ...offsets.map(u32));
  const stbl = box('stbl', stsd, stts, stss, stsc, stsz, stco);
  const minf = box('minf', vmhd, dinf, stbl);
  const mdia = box('mdia', mdhd, hdlr, minf);
  const trak = box('trak', tkhd, mdia);
  return box('moov', mvhd, trak);
}
const ftyp = box('ftyp', Buffer.from('isom'), u32(512), Buffer.from('isomiso2avc1mp41'));
const moovSize = moov(new Array(total).fill(0)).length;
let off = ftyp.length + moovSize + 8;
const offsets = samples.map((s) => { const o = off; off += s.data.length; return o; });
const mdatBody = Buffer.concat(samples.map((s) => s.data));
const out = Buffer.concat([ftyp, moov(offsets), u32(mdatBody.length + 8), Buffer.from('mdat'), mdatBody]);
fs.writeFileSync(outFile, out);
console.log(`wrote ${outFile}: ${(out.length / 1e6).toFixed(1)} MB, ${total} frames, ${keys(samples)} keyframes, ${(Date.now() - t0) / 1000}s`);
function keys(s) { return s.filter((x) => x.key).length; }
