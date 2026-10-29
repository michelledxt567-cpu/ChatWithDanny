// Procedural soundtrack: ambience + phone handling sounds + breathing, driven by a cue sheet.
// usage: node audio.mjs <meta.json> <out.wav> <indoor|outdoor>
import fs from 'fs';

const [metaPath, outPath, env] = process.argv.slice(2);
const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
const SR = 48000;
const DUR = meta.duration + 0.05;
const N = Math.ceil(DUR * SR);
const L = new Float32Array(N), R = new Float32Array(N);
const dryL = new Float32Array(N), dryR = new Float32Array(N); // sent to reverb as well

// ---------- deterministic noise ----------
let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const white = () => rnd() * 2 - 1;
const gauss = () => { let s = 0; for (let i = 0; i < 4; i++) s += rnd(); return (s - 2) * 1.2; };

// biquad (RBJ)
function biquad(type, f, q, gainDb = 0) {
  const w = 2 * Math.PI * f / SR, c = Math.cos(w), s = Math.sin(w), a = s / (2 * q), A = Math.pow(10, gainDb / 40);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; a0 = 1 + a; a1 = -2 * c; a2 = 1 - a; }
  else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; a0 = 1 + a; a1 = -2 * c; a2 = 1 - a; }
  else if (type === 'bp') { b0 = a; b1 = 0; b2 = -a; a0 = 1 + a; a1 = -2 * c; a2 = 1 - a; }
  else if (type === 'peak') { b0 = 1 + a * A; b1 = -2 * c; b2 = 1 - a * A; a0 = 1 + a / A; a1 = -2 * c; a2 = 1 - a / A; }
  const B0 = b0 / a0, B1 = b1 / a0, B2 = b2 / a0, A1 = a1 / a0, A2 = a2 / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const f_ = (x) => { const y = B0 * x + B1 * x1 + B2 * x2 - A1 * y1 - A2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
  f_.set = (nf, nq = q) => { const o = biquad(type, nf, nq, gainDb); Object.assign(f_, { _o: o }); };
  return f_;
}
// time-varying filter: recompute coefficients every block
function varFilter(type, q) {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, B0, B1, B2, A1, A2;
  return (x, f, qq = q) => {
    if (x === null) {
      const w = 2 * Math.PI * Math.min(f, SR * 0.45) / SR, c = Math.cos(w), s = Math.sin(w), a = s / (2 * qq);
      let b0, b1, b2; const a0 = 1 + a, a1 = -2 * c, a2 = 1 - a;
      if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; }
      else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; }
      else { b0 = a; b1 = 0; b2 = -a; }
      B0 = b0 / a0; B1 = b1 / a0; B2 = b2 / a0; A1 = a1 / a0; A2 = a2 / a0; return 0;
    }
    const y = B0 * x + B1 * x1 + B2 * x2 - A1 * y1 - A2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y;
  };
}

function add(i, l, r, wet = 0) {
  if (i < 0 || i >= N) return;
  L[i] += l; R[i] += r;
  if (wet) { dryL[i] += l * wet; dryR[i] += r * wet; }
}
const sec = (t) => Math.round(t * SR);

// ---------- one-shot phone sounds ----------
// iOS keyboard click: short bright "tock"
function keyClick(t, g = 1, variant = 'key') {
  const i0 = sec(t + (rnd() - 0.5) * 0.004);
  const fBody = variant === 'keyDel' ? 1150 : variant === 'keyMod' ? 1450 : 1750 + rnd() * 120;
  const bp = biquad('bp', variant === 'keyDel' ? 2600 : 3900, 1.4), hp = biquad('hp', 600, 0.7);
  const amp = 0.17 * g * (0.85 + rnd() * 0.3);
  for (let n = 0; n < 0.035 * SR; n++) {
    const tt = n / SR;
    const nz = bp(white()) * Math.exp(-tt / 0.0016) * 1.6;
    const body = Math.sin(2 * Math.PI * fBody * tt) * Math.exp(-tt / 0.0045) * 0.55;
    const tick = n < 30 ? white() * (1 - n / 30) * 0.5 : 0;
    const v = hp(nz + body + tick) * amp;
    add(i0 + n, v * 0.98, v * 1.0, 0.25);
  }
}
// finger on glass: soft low tick
function tap(t, g = 1) {
  const i0 = sec(t), lp = biquad('lp', 1800, 0.7), hp = biquad('hp', 180, 0.7);
  for (let n = 0; n < 0.03 * SR; n++) {
    const tt = n / SR;
    const v = hp(lp(white() * Math.exp(-tt / 0.004) + Math.sin(2 * Math.PI * 320 * tt) * Math.exp(-tt / 0.006) * 0.6)) * 0.07 * g;
    add(i0 + n, v, v, 0.3);
  }
}
// side button: mechanical click (press + release)
function button(t, g = 1) {
  for (const [dt, a] of [[0, 1], [0.085, 0.55]]) {
    const i0 = sec(t + dt), bp = biquad('bp', 2300, 2.2), lp = biquad('lp', 5000, 0.7);
    for (let n = 0; n < 0.02 * SR; n++) {
      const tt = n / SR;
      const v = lp(bp(white()) * Math.exp(-tt / 0.0012) * 2 + Math.sin(2 * Math.PI * 780 * tt) * Math.exp(-tt / 0.003) * 0.5) * 0.16 * g * a;
      add(i0 + n, v, v, 0.3);
    }
  }
}
// thumb sliding on glass
function swipe(t, g = 1, dur = 0.28) {
  const i0 = sec(t), f = varFilter('bp', 0.9);
  for (let n = 0; n < dur * SR; n++) {
    const x = n / (dur * SR);
    if (n % 64 === 0) f(null, 900 + 2200 * x);
    const env = Math.sin(Math.PI * Math.min(1, x * 1.15)) ** 1.5;
    const v = f(white()) * env * 0.022 * g;
    add(i0 + n, v * 0.95, v, 0.2);
  }
}
// iPhone shutter: two-part mechanical "ka-chick"
function shutter(t, g = 1) {
  const parts = [[0, 2600, 0.0035, 0.55, 520], [0.052, 3400, 0.0055, 0.75, 410], [0.06, 1500, 0.009, 0.25, 0]];
  for (const [dt, fc, dec, a, body] of parts) {
    const i0 = sec(t + dt), bp = biquad('bp', fc, 1.2), hp = biquad('hp', 250, 0.7);
    for (let n = 0; n < 0.06 * SR; n++) {
      const tt = n / SR;
      const v = hp(bp(white()) * 2.2 * Math.exp(-tt / dec) + (body ? Math.sin(2 * Math.PI * body * tt) * Math.exp(-tt / 0.008) * 0.6 : 0)) * 0.42 * a * g;
      add(i0 + n, v, v, 0.35);
    }
  }
}
// WhatsApp "sent" blip
function waSent(t, g = 1) {
  const i0 = sec(t); let ph = 0;
  for (let n = 0; n < 0.09 * SR; n++) {
    const tt = n / SR, f = 700 + 900 * Math.min(1, tt / 0.03);
    ph += 2 * Math.PI * f / SR;
    const env = Math.min(1, tt / 0.004) * Math.exp(-tt / 0.025);
    const v = (Math.sin(ph) + 0.25 * Math.sin(2 * ph)) * env * 0.022 * g;
    add(i0 + n, v, v, 0.3);
  }
}
// breathing: shaped noise through moving formants
function breath(t, kind, g = 1) {
  const spec = {
    inhale: { dur: 0.95, f0: 1300, f1: 2100, a: 0.05, shape: (x) => Math.sin(Math.PI * Math.pow(x, 0.8)) ** 1.2 },
    exhale: { dur: 1.35, f0: 900, f1: 600, a: 0.06, shape: (x) => Math.min(1, x / 0.12) * Math.pow(1 - x, 1.6) },
    sigh: { dur: 1.7, f0: 1000, f1: 520, a: 0.07, shape: (x) => Math.min(1, x / 0.1) * Math.pow(1 - x, 1.3) },
    shaky: { dur: 1.1, f0: 1100, f1: 1500, a: 0.055, shape: (x) => Math.sin(Math.PI * x) * (0.75 + 0.25 * Math.sin(x * 2 * Math.PI * 7)) },
  }[kind];
  const i0 = sec(t), f = varFilter('bp', 1.1), f2 = varFilter('bp', 2.5), lp = biquad('lp', 4500, 0.7);
  const dur = spec.dur * (0.92 + rnd() * 0.16);
  for (let n = 0; n < dur * SR; n++) {
    const x = n / (dur * SR);
    if (n % 64 === 0) { f(null, spec.f0 + (spec.f1 - spec.f0) * x); f2(null, (spec.f0 + (spec.f1 - spec.f0) * x) * 2.3); }
    const w = white();
    const v = lp(f(w) + 0.35 * f2(w)) * spec.shape(x) * spec.a * g;
    add(i0 + n, v * 0.97, v, 0.15);
  }
}
// wooden porch creak (stick-slip pulse train through body resonances)
function creak(t, g = 1, dur = 0.9) {
  const i0 = sec(t), r1 = biquad('bp', 420, 6), r2 = biquad('bp', 980, 5), r3 = biquad('bp', 1900, 4);
  let next = 0, n = 0;
  for (; n < dur * SR; n++) {
    const x = n / (dur * SR);
    let imp = 0;
    if (n >= next) { imp = 1; const rate = 55 + 90 * Math.sin(Math.PI * x) + rnd() * 25; next = n + SR / rate; }
    const env = Math.sin(Math.PI * x) ** 0.7;
    const v = (r1(imp) * 1.0 + r2(imp) * 0.7 + r3(imp) * 0.35) * env * 0.5 * g;
    add(i0 + n, v * 0.7, v * 1.0, 0.8);
  }
}
// shoe shifting on gravel / concrete grit
function shuffle(t, g = 1, dur = 0.5) {
  const i0 = sec(t), hp = biquad('hp', 1500, 0.7), lp = biquad('lp', 7000, 0.7);
  for (let n = 0; n < dur * SR; n++) {
    const x = n / (dur * SR), env = Math.sin(Math.PI * x) ** 2;
    const grain = rnd() < 0.012 ? white() * 3 : 0;
    const v = lp(hp(white() * 0.25 + grain)) * env * 0.05 * g;
    add(i0 + n, v, v * 0.9, 0.4);
  }
}
// distant dog bark (heavily filtered, far)
function bark(t, g = 1) {
  for (const dt of [0, 0.32]) {
    const i0 = sec(t + dt), f1 = biquad('bp', 700, 3), f2 = biquad('bp', 1500, 4), lp = biquad('lp', 1600, 0.7);
    let ph = 0; const dur = 0.16;
    for (let n = 0; n < dur * SR; n++) {
      const x = n / (dur * SR), f0 = 420 + 160 * Math.sin(Math.PI * Math.min(1, x * 1.6));
      ph += 2 * Math.PI * f0 / SR;
      const src = (ph % (2 * Math.PI)) / Math.PI - 1 + white() * 0.4;
      const env = Math.min(1, x / 0.05) * Math.pow(1 - x, 1.5);
      const v = lp(f1(src) + 0.6 * f2(src)) * env * 0.05 * g;
      add(i0 + n, v * 0.6, v * 1.0, 1.0);
    }
  }
}

// ---------- ambience beds ----------
function roomTone() {
  // apartment in the early evening: HVAC rumble, fridge hum, distant traffic
  const lp = biquad('lp', 260, 0.6), lp2 = biquad('lp', 90, 0.6), hp = biquad('hp', 35, 0.7);
  const air = biquad('bp', 1800, 0.5);
  let brown = 0;
  for (let n = 0; n < N; n++) {
    const tt = n / SR;
    brown = brown * 0.995 + white() * 0.05;
    const rumble = hp(lp(brown)) * 0.55 + lp2(white()) * 0.25;
    const hum = (Math.sin(2 * Math.PI * 60 * tt) * 0.5 + Math.sin(2 * Math.PI * 120 * tt) * 0.3 + Math.sin(2 * Math.PI * 180 * tt) * 0.12) * 0.0045 * (0.9 + 0.1 * Math.sin(tt * 0.7));
    const hiss = air(white()) * 0.0035;
    const v = rumble * 0.011 + hum * 0.22 + hiss * 0.35;
    add(n, v, v * 0.98 + white() * 0.0004);
  }
  // distant cars passing outside the window
  for (const [t0, d] of [[6.5, 7], [24, 8.5]]) carPass(t0, d, 0.12);
}
function carPass(t0, d, g) {
  const f = varFilter('lp', 0.7), i0 = sec(t0);
  let brown = 0;
  for (let n = 0; n < d * SR; n++) {
    const x = n / (d * SR);
    if (n % 128 === 0) f(null, 220 + 500 * Math.sin(Math.PI * x));
    brown = brown * 0.99 + white() * 0.1;
    const env = Math.sin(Math.PI * x) ** 2;
    const pan = x;
    const v = f(brown + white() * 0.15) * env * 0.05 * g;
    add(i0 + n, v * (1 - 0.5 * pan), v * (0.5 + 0.5 * pan), 0.6);
  }
}
function nightOutdoor() {
  // wind with gusts, leaf rustle tied to gusts, far-off traffic wash
  const wf = varFilter('bp', 0.6), wf2 = varFilter('bp', 0.8), leafHp = biquad('hp', 2500, 0.7), leafLp = biquad('lp', 9000, 0.7);
  const far = biquad('lp', 180, 0.7);
  let gust = 0.4, gustTarget = 0.4, brown = 0;
  for (let n = 0; n < N; n++) {
    const tt = n / SR;
    if (n % 4800 === 0) gustTarget = 0.25 + Math.pow(rnd(), 2) * 0.9;
    gust += (gustTarget - gust) * 0.00004;
    if (n % 64 === 0) { wf(null, 260 + 380 * gust + 60 * Math.sin(tt * 0.9)); wf2(null, 520 + 600 * gust); }
    const w = white();
    const wind = (wf(w) * 0.9 + wf2(w) * 0.4) * (0.35 + gust) * 0.09;
    const leafDensity = Math.max(0, gust - 0.45) * 0.035;
    const leaf = rnd() < leafDensity ? white() * 4 : 0;
    const leaves = leafLp(leafHp(leaf + white() * 0.08 * gust)) * 0.03;
    brown = brown * 0.996 + white() * 0.04;
    const traffic = far(brown) * 0.1;
    const B = 0.09; // bed level: keep wind well under breathing and phone sounds
    add(n, (wind * 1.0 + leaves * 0.8 + traffic) * B, (wind * 0.9 + leaves * 1.1 + traffic) * B);
  }
  carPass(14, 9, 0.05);
}

// ---------- reverb (Freeverb-style) ----------
function reverb(size, damp, mix) {
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((d) => Math.round(d * SR / 44100 * size));
  const aps = [556, 441, 341, 225].map((d) => Math.round(d * SR / 44100));
  for (const [inp, out, spread] of [[dryL, L, 0], [dryR, R, 23]]) {
    const cb = combs.map((d) => ({ buf: new Float32Array(d + spread), i: 0, st: 0 }));
    const ab = aps.map((d) => ({ buf: new Float32Array(d + spread), i: 0 }));
    for (let n = 0; n < N; n++) {
      const x = inp[n] * 0.015;
      let s = 0;
      for (const c of cb) {
        const y = c.buf[c.i]; c.st = y * (1 - damp) + c.st * damp; c.buf[c.i] = x + c.st * 0.84; c.i = (c.i + 1) % c.buf.length; s += y;
      }
      for (const a of ab) { const b = a.buf[a.i]; const y = -s + b; a.buf[a.i] = s + b * 0.5; a.i = (a.i + 1) % a.buf.length; s = y; }
      out[n] += s * mix;
    }
  }
}

// ---------- assemble ----------
if (env === 'outdoor') nightOutdoor(); else roomTone();
const FX = { key: (c) => keyClick(c.t, c.g ?? 1, 'key'), keyDel: (c) => keyClick(c.t, c.g ?? 1, 'keyDel'), keyMod: (c) => keyClick(c.t, c.g ?? 1, 'keyMod'),
  tap: (c) => tap(c.t, c.g), button: (c) => button(c.t, c.g), swipe: (c) => swipe(c.t, c.g ?? 1, c.d), shutter: (c) => shutter(c.t, c.g),
  waSent: (c) => waSent(c.t, c.g), inhale: (c) => breath(c.t, 'inhale', c.g), exhale: (c) => breath(c.t, 'exhale', c.g),
  sigh: (c) => breath(c.t, 'sigh', c.g), shaky: (c) => breath(c.t, 'shaky', c.g), creak: (c) => creak(c.t, c.g, c.d),
  shuffle: (c) => shuffle(c.t, c.g, c.d), bark: (c) => bark(c.t, c.g) };
for (const c of meta.sounds || []) { if (!FX[c.k]) throw new Error('unknown sound ' + c.k); FX[c.k](c); }
reverb(env === 'outdoor' ? 1.25 : 0.55, env === 'outdoor' ? 0.35 : 0.5, env === 'outdoor' ? 0.5 : 0.35);

// fades, normalise to -1 dBFS peak-safe, soft clip
const fade = sec(0.25);
let peak = 0;
for (let n = 0; n < N; n++) {
  const f = Math.min(1, n / fade, (N - 1 - n) / fade);
  L[n] *= f; R[n] *= f; peak = Math.max(peak, Math.abs(L[n]), Math.abs(R[n]));
}
const gain = Math.min(4, 0.85 / peak);
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
const sc = (x) => Math.tanh(x * gain * 1.05) / Math.tanh(1.05);
for (let n = 0; n < N; n++) {
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sc(L[n]))) * 32767), 44 + n * 4);
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sc(R[n]))) * 32767), 46 + n * 4);
}
fs.writeFileSync(outPath, buf);
console.log(`wrote ${outPath}: ${DUR.toFixed(2)}s, ${(meta.sounds || []).length} cues, gain ${gain.toFixed(2)}`);
