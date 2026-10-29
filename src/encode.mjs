// Encodes rendered JPEG frames (+ optional WAV) to MP4: H.264 video + Opus audio, using Chrome's
// WebCodecs encoders and a minimal ISO-BMFF muxer.
// usage: node encode.mjs <framesDir> <out.mp4> [audio.wav]
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);
const PW = process.env.PW_CORE || '/root/.nvm/versions/node/v22.23.4/lib/node_modules/@playwright/mcp/node_modules/playwright-core';
const CHROME = process.env.CHROME_FULL || '/inner_container/opt/playwright/chromium-1232/chrome-linux64/chrome';
const { chromium } = require(PW);

const [framesDir, outFile, wavFile] = process.argv.slice(2);
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
const t0 = Date.now();

// ---------------- video ----------------
await page.evaluate(async ({ W, H, fps }) => {
  window.chunks = [];
  let resolveDesc; window.descP = new Promise((r) => (resolveDesc = r));
  window.enc = new VideoEncoder({
    output: (chunk, md) => {
      if (md && md.decoderConfig && md.decoderConfig.description) resolveDesc(Array.from(new Uint8Array(md.decoderConfig.description)));
      const buf = new Uint8Array(chunk.byteLength); chunk.copyTo(buf);
      window.chunks.push({ key: chunk.type === 'key', ts: chunk.timestamp, data: buf });
    },
    error: (e) => { window.encErr = String(e); },
  });
  window.enc.configure({ codec: 'avc1.640033', width: W, height: H, bitrate: 40_000_000, framerate: fps,
    bitrateMode: 'constant', latencyMode: 'quality', avc: { format: 'avc' } });
  window.canvas = new OffscreenCanvas(W, H);
  window.ctx = window.canvas.getContext('2d');
}, { W, H, fps });

const vSamples = [];
async function drain() {
  const got = await page.evaluate(() => {
    const out = window.chunks.splice(0).map((c) => ({ key: c.key, ts: c.ts, b64: btoa(Array.from(c.data, (x) => String.fromCharCode(x)).join('')) }));
    return { out, err: window.encErr || null };
  });
  if (got.err) throw new Error(got.err);
  for (const c of got.out) vSamples.push({ key: c.key, ts: c.ts, data: Buffer.from(c.b64, 'base64') });
}
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
  if (i % 600 === 599) console.log(`video ${i + 1}/${total} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
await page.evaluate(() => window.enc.flush());
await drain();
const avcC = Buffer.from(await page.evaluate(() => window.descP));
if (vSamples.length !== total) throw new Error(`expected ${total} video samples, got ${vSamples.length}`);
vSamples.sort((a, b) => a.ts - b.ts);

// ---------------- audio (Opus) ----------------
let aSamples = [], preSkip = 312;
if (wavFile) {
  const wav = fs.readFileSync(wavFile);
  const dataOff = wav.indexOf('data') + 8;
  const frames = (wav.length - dataOff) / 4;
  const pcm = new Float32Array(frames * 2); // planar L then R
  for (let n = 0; n < frames; n++) {
    pcm[n] = wav.readInt16LE(dataOff + n * 4) / 32768;
    pcm[frames + n] = wav.readInt16LE(dataOff + n * 4 + 2) / 32768;
  }
  await page.evaluate(() => {
    window.achunks = [];
    let res; window.adescP = new Promise((r) => (res = r));
    window.aenc = new AudioEncoder({
      output: (chunk, md) => {
        if (md && md.decoderConfig && md.decoderConfig.description) res(Array.from(new Uint8Array(md.decoderConfig.description)));
        const b = new Uint8Array(chunk.byteLength); chunk.copyTo(b);
        window.achunks.push({ ts: chunk.timestamp, dur: chunk.duration, data: b });
      },
      error: (e) => { window.aerr = String(e); },
    });
    window.aenc.configure({ codec: 'opus', sampleRate: 48000, numberOfChannels: 2, bitrate: 192000, opus: { frameDuration: 20000 } });
    setTimeout(() => res(null), 60000);
  });
  const BLOCK = 48000;
  for (let off = 0; off < frames; off += BLOCK) {
    const n = Math.min(BLOCK, frames - off);
    const block = new Float32Array(n * 2);
    block.set(pcm.subarray(off, off + n), 0);
    block.set(pcm.subarray(frames + off, frames + off + n), n);
    await page.evaluate(({ b64, n, off }) => {
      const bin = atob(b64); const u = new Uint8Array(bin.length);
      for (let k = 0; k < bin.length; k++) u[k] = bin.charCodeAt(k);
      const d = new AudioData({ format: 'f32-planar', sampleRate: 48000, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(off * 1e6 / 48000), data: new Float32Array(u.buffer) });
      window.aenc.encode(d); d.close();
    }, { b64: Buffer.from(block.buffer).toString('base64'), n, off });
  }
  await page.evaluate(() => window.aenc.flush());
  const got = await page.evaluate(() => ({ err: window.aerr || null, c: window.achunks.map((c) => ({ ts: c.ts, dur: c.dur, b64: btoa(Array.from(c.data, (x) => String.fromCharCode(x)).join('')) })) }));
  if (got.err) throw new Error(got.err);
  aSamples = got.c.map((c) => ({ ts: c.ts, dur: c.dur, data: Buffer.from(c.b64, 'base64') })).sort((a, b) => a.ts - b.ts);
  const desc = await page.evaluate(() => window.adescP);
  if (desc && desc.length >= 12 && String.fromCharCode(...desc.slice(0, 8)) === 'OpusHead') preSkip = desc[10] | (desc[11] << 8);
  console.log(`audio: ${aSamples.length} opus packets, preskip ${preSkip}`);
}
await browser.close();

// ---------------- MP4 muxing ----------------
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0); return b; };
const s16 = (n) => { const b = Buffer.alloc(2); b.writeInt16BE(n); return b; };
const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16BE(n); return b; };
const u8 = (n) => Buffer.from([n]);
const box = (type, ...parts) => { const body = Buffer.concat(parts); return Buffer.concat([u32(body.length + 8), Buffer.from(type, 'ascii'), body]); };
const full = (type, version, flags, ...parts) => box(type, u8(version), Buffer.from([(flags >> 16) & 255, (flags >> 8) & 255, flags & 255]), ...parts);
const zeros = (n) => Buffer.alloc(n);
const matrix = Buffer.concat([u32(0x10000), u32(0), u32(0), u32(0), u32(0x10000), u32(0), u32(0), u32(0), u32(0x40000000)]);
const MV_TS = 1000;

const vTimescale = fps * 1000, vDelta = 1000, vDur = total * vDelta;
const durMs = Math.round(total * 1000 / fps);
const AFRAME = 960;
const aDurSamples = aSamples.length * AFRAME;
const aDurMs = Math.round((aDurSamples - preSkip) / 48);

function stbl(sampleEntry, sttsEntries, sizes, offsets, keys) {
  const stsd = full('stsd', 0, 0, u32(1), sampleEntry);
  const stts = full('stts', 0, 0, u32(sttsEntries.length), ...sttsEntries.flatMap(([c, d]) => [u32(c), u32(d)]));
  const parts = [stsd, stts];
  if (keys) parts.push(full('stss', 0, 0, u32(keys.length), ...keys.map(u32)));
  parts.push(full('stsc', 0, 0, u32(1), u32(1), u32(1), u32(1)));
  parts.push(full('stsz', 0, 0, u32(0), u32(sizes.length), ...sizes.map(u32)));
  parts.push(full('co64', 0, 0, u32(offsets.length), ...offsets.flatMap((o) => [u32(Math.floor(o / 2 ** 32)), u32(o % 2 ** 32)])));
  return box('stbl', ...parts);
}
function trak(id, kind, durMv, timescale, mediaDur, sampleEntry, sttsEntries, sizes, offsets, keys, edit) {
  const isV = kind === 'vide';
  const tkhd = full('tkhd', 0, 3, u32(0), u32(0), u32(id), u32(0), u32(durMv), zeros(8), u16(0), u16(isV ? 0 : 1), u16(isV ? 0 : 0x100), u16(0), matrix,
    u32(isV ? W << 16 : 0), u32(isV ? H << 16 : 0));
  const edts = edit ? box('edts', full('elst', 0, 0, u32(1), u32(durMv), u32(edit), u32(0x10000))) : Buffer.alloc(0);
  const mdhd = full('mdhd', 0, 0, u32(0), u32(0), u32(timescale), u32(mediaDur), u16(0x55c4), u16(0));
  const hdlr = full('hdlr', 0, 0, u32(0), Buffer.from(kind), zeros(12), Buffer.from(isV ? 'VideoHandler\0' : 'SoundHandler\0'));
  const mh = isV ? full('vmhd', 0, 1, zeros(8)) : full('smhd', 0, 0, u16(0), u16(0));
  const dinf = box('dinf', full('dref', 0, 0, u32(1), full('url ', 0, 1)));
  const minf = box('minf', mh, dinf, stbl(sampleEntry, sttsEntries, sizes, offsets, keys));
  return box('trak', tkhd, edts, box('mdia', mdhd, hdlr, minf));
}
function moov(vOff, aOff) {
  const durAll = Math.max(durMs, aSamples.length ? aDurMs : 0);
  const mvhd = full('mvhd', 0, 0, u32(0), u32(0), u32(MV_TS), u32(durAll), u32(0x10000), u16(0x100), zeros(10), matrix, zeros(24), u32(aSamples.length ? 3 : 2));
  const avc1 = box('avc1', zeros(6), u16(1), zeros(16), u16(W), u16(H), u32(0x480000), u32(0x480000), u32(0), u16(1),
    zeros(32), u16(0x18), Buffer.from([0xff, 0xff]), box('avcC', avcC), box('colr', Buffer.from('nclx'), u16(1), u16(1), u16(1), u8(0)));
  const keys = vSamples.map((s, i) => (s.key ? i + 1 : 0)).filter(Boolean);
  const parts = [mvhd, trak(1, 'vide', durMs, vTimescale, vDur, avc1, [[total, vDelta]], vSamples.map((s) => s.data.length), vOff, keys, 0)];
  if (aSamples.length) {
    const dOps = box('dOps', u8(0), u8(2), u16(preSkip), u32(48000), s16(0), u8(0));
    const opus = box('Opus', zeros(6), u16(1), zeros(8), u16(2), u16(16), zeros(4), u32(48000 << 16), dOps);
    parts.push(trak(2, 'soun', aDurMs, 48000, aDurSamples, opus, [[aSamples.length, AFRAME]], aSamples.map((s) => s.data.length), aOff, null, preSkip));
  }
  return box('moov', ...parts);
}
const ftyp = box('ftyp', Buffer.from('isom'), u32(512), Buffer.from('isomiso2avc1mp41Opus'));
const moovSize = moov(new Array(vSamples.length).fill(0), new Array(aSamples.length).fill(0)).length;
let off = ftyp.length + moovSize + 16;
const vOff = vSamples.map((s) => { const o = off; off += s.data.length; return o; });
const aOff = aSamples.map((s) => { const o = off; off += s.data.length; return o; });
const mdatBody = Buffer.concat([...vSamples.map((s) => s.data), ...aSamples.map((s) => s.data)]);
const mdatHdr = Buffer.concat([u32(1), Buffer.from('mdat'), u32(0), u32(mdatBody.length + 16)]);
const out = Buffer.concat([ftyp, moov(vOff, aOff), mdatHdr, mdatBody]);
fs.writeFileSync(outFile, out);
console.log(`wrote ${outFile}: ${(out.length / 1e6).toFixed(1)} MB, ${total} video frames${aSamples.length ? `, ${(aDurMs / 1000).toFixed(2)}s audio` : ''}, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
