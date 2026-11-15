// node wavtrim.mjs <in.wav> <out.wav> <startSec>  -> decode, resample to 48 kHz stereo 16-bit, trim, 10 ms fade-in
import { createRequire } from 'module'; import fs from 'fs';
const require = createRequire(import.meta.url);
const { chromium } = require('/root/.nvm/versions/node/v22.23.4/lib/node_modules/@playwright/mcp/node_modules/playwright-core');
const [inp, out, start] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/inner_container/opt/playwright/chromium_headless_shell-1232/chrome-headless-shell-linux64/chrome-headless-shell', args: ['--no-sandbox'] });
const p = await b.newPage(); await p.goto('about:blank');
const res = await p.evaluate(async ({ b64, start }) => {
  const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const ctx = new OfflineAudioContext(2, 48000, 48000);
  const buf = await ctx.decodeAudioData(u.buffer);
  const s0 = Math.round(start * 48000), n = buf.length - s0, fade = 480;
  const out = new Int16Array(n * 2);
  const L = buf.getChannelData(0), R = buf.getChannelData(buf.numberOfChannels > 1 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const g = i < fade ? i / fade : 1;
    out[2 * i] = Math.max(-32768, Math.min(32767, Math.round(L[s0 + i] * g * 32767)));
    out[2 * i + 1] = Math.max(-32768, Math.min(32767, Math.round(R[s0 + i] * g * 32767)));
  }
  let s = ''; const by = new Uint8Array(out.buffer); for (let i = 0; i < by.length; i += 8192) s += String.fromCharCode(...by.subarray(i, i + 8192));
  return { rate: buf.sampleRate, len: buf.length, ch: buf.numberOfChannels, n, b64: btoa(s) };
}, { b64: fs.readFileSync(inp).toString('base64'), start: +start });
await b.close();
const data = Buffer.from(res.b64, 'base64'), h = Buffer.alloc(44);
h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16);
h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(48000, 24); h.writeUInt32LE(192000, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34);
h.write('data', 36); h.writeUInt32LE(data.length, 40);
fs.writeFileSync(out, Buffer.concat([h, data]));
console.log(`decoded ${res.ch}ch ${res.len} samples @${res.rate}; wrote ${(res.n / 48000).toFixed(3)} s`);
