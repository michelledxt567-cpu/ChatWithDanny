// Camera-roll photos for the album strip / camera thumbnail (video 2).
// Painted procedurally (the sandbox is offline): deterministic, so every render worker gets identical pixels.
// window.PHOTOS.make() -> { dog, payment, kebab, beach, sunset } as JPEG data URLs (420x420).
(function () {
  const S = 420;
  function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function noise(seed) {
    const r = rng(seed); const P = new Float32Array(65536); for (let i = 0; i < P.length; i++) P[i] = r();
    const at = (x, y) => P[((y & 255) << 8) | (x & 255)];
    const n = (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y); let fx = x - xi, fy = y - yi;
      fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
      const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
      return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
    };
    const fbm = (x, y, o = 5) => { let s = 0, a = 0.5, f = 1, t = 0; for (let i = 0; i < o; i++) { s += a * n(x * f + i * 17.3, y * f + i * 9.1); t += a; f *= 2.03; a *= 0.5; } return s / t; };
    return { n, fbm };
  }
  const mix = (a, b, k) => a + (b - a) * k;
  const mix3 = (a, b, k) => [mix(a[0], b[0], k), mix(a[1], b[1], k), mix(a[2], b[2], k)];
  const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const cv = (w = S, h = S) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

  // phone-camera look: slight softness, sensor noise, vignette, JPEG
  function finish(c, seed, { grain = 7, vig = 0.22, soft = 0.55 } = {}) {
    const o = cv(), x = o.getContext('2d');
    x.filter = `blur(${soft}px)`; x.drawImage(c, 0, 0); x.filter = 'none';
    const im = x.getImageData(0, 0, S, S), d = im.data, r = rng(seed);
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      const px = p % S, py = (p / S) | 0;
      const dx = px / S - 0.5, dy = py / S - 0.5;
      const v = 1 - vig * (dx * dx + dy * dy) * 2;
      const g = (r() + r() - 1) * grain;
      d[i] = d[i] * v + g; d[i + 1] = d[i + 1] * v + g; d[i + 2] = d[i + 2] * v + g * 1.1;
    }
    x.putImageData(im, 0, 0);
    return o.toDataURL('image/jpeg', 0.9);
  }

  // ---------------- beach, mid-afternoon ----------------
  function beach() {
    const c = cv(), x = c.getContext('2d'), im = x.createImageData(S, S), d = im.data, N = noise(11), r = rng(12);
    const hz = 0.42;
    for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
      const u = px / S, v = py / S + (u - 0.5) * 0.02; // hand-held: horizon a little tilted
      const shore = 0.655 + 0.012 * Math.sin(u * 6.5 + 1.2) + 0.03 * (N.fbm(u * 3, 4.2) - 0.5);
      let col;
      if (v < hz) {
        const k = v / hz;
        col = mix3([52, 112, 192], [186, 214, 236], Math.pow(k, 1.7));
        const cl = N.fbm(u * 2.6 + 3, v * 9.5, 6);
        const cloud = sstep(0.5, 0.7, cl) * (0.25 + 0.75 * k);
        const shade = sstep(0.55, 0.8, N.fbm(u * 2.6 + 3.05, v * 9.5 + 0.35, 5));
        col = mix3(col, mix3([250, 251, 252], [196, 204, 214], shade * 0.6), cloud);
      } else if (v < shore) {
        const k = (v - hz) / (shore - hz);
        col = mix3([22, 78, 118], [44, 156, 170], Math.pow(k, 1.3));
        const sw = N.fbm(u * (5 + 10 * (1 - k)), v * 150 / (0.4 + k), 4);
        col = col.map((c0) => c0 + (sw - 0.5) * 46);
        const glint = sstep(0.8, 0.92, N.n(u * 110 / (0.3 + k), v * 520)) * (1 - k) * 0.7;
        col = mix3(col, [240, 246, 250], glint);
        for (const [vc, s] of [[0.56, 1], [0.6, 2], [0.625, 3]]) {
          const yc = vc + 0.006 * Math.sin(u * 10 + s) + 0.012 * (N.fbm(u * 5, s * 7) - 0.5);
          const band = Math.exp(-Math.pow((v - yc) / 0.0055, 2)) * sstep(0.35, 0.65, N.fbm(u * 14, s * 5.3));
          col = mix3(col, [242, 246, 246], band * 0.95);
        }
        const lace = sstep(shore - 0.035, shore - 0.004, v) * sstep(0.45, 0.62, N.fbm(u * 30, v * 90, 4));
        col = mix3(col, [236, 240, 238], lace * 0.9);
      } else if (v < shore + 0.075) {
        const k = (v - shore) / 0.075;
        col = mix3([128, 128, 120], [178, 156, 124], k);
        col = mix3(col, [170, 196, 214], (1 - k) * 0.35);
        col = col.map((c0) => c0 + (N.n(u * 120, v * 300) - 0.5) * 14);
      } else {
        const k = (v - shore - 0.075) / (1 - shore);
        col = mix3([210, 186, 150], [228, 208, 172], N.fbm(u * 3, v * 6));
        col = col.map((c0) => c0 * (0.94 + 0.06 * k) + (r() - 0.5) * 22);
        const ripple = Math.sin((v * 95 + N.fbm(u * 4, v * 4) * 6)) * 0.5 + 0.5;
        col = col.map((c0) => c0 - ripple * 9 * (1 - k));
      }
      const i = (py * S + px) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
    }
    x.putImageData(im, 0, 0);
    // footprints in dry sand
    for (let i = 0; i < 16; i++) {
      const fx = 120 + i * 9 + r() * 10 + (i % 2) * 14, fy = 405 - i * 7.5;
      x.fillStyle = 'rgba(120,98,70,0.35)'; x.beginPath(); x.ellipse(fx, fy, 5 - i * 0.18, 2.6 - i * 0.08, -0.5, 0, Math.PI * 2); x.fill();
    }
    return finish(c, 13, { grain: 6, vig: 0.18 });
  }

  // ---------------- white dog (samoyed) in the park ----------------
  function dog() {
    const c = cv(), x = c.getContext('2d'), r = rng(5);
    // background: park, heavily defocused
    const bg = cv(S + 60, S + 60), b = bg.getContext('2d');
    let g = b.createLinearGradient(0, 0, 0, S + 60);
    g.addColorStop(0, '#8fa76a'); g.addColorStop(0.35, '#4d6a32'); g.addColorStop(0.55, '#5f7f35'); g.addColorStop(1, '#7f9a44');
    b.fillStyle = g; b.fillRect(0, 0, S + 60, S + 60);
    for (let i = 0; i < 60; i++) { b.fillStyle = `rgba(${25 + r() * 40},${55 + r() * 45},${18 + r() * 20},0.55)`; b.beginPath(); b.ellipse(r() * 480, r() * 230, 20 + r() * 50, 15 + r() * 40, 0, 0, 7); b.fill(); }
    for (let i = 0; i < 28; i++) { b.fillStyle = `rgba(240,248,215,${0.18 + r() * 0.25})`; b.beginPath(); b.arc(r() * 480, r() * 200, 5 + r() * 14, 0, 7); b.fill(); }
    for (let i = 0; i < 900; i++) { const gx = r() * 480, gy = 230 + r() * 250; b.strokeStyle = `rgba(${70 + r() * 60},${110 + r() * 60},${30 + r() * 30},0.6)`; b.lineWidth = 2; b.beginPath(); b.moveTo(gx, gy); b.lineTo(gx + (r() - 0.5) * 8, gy - 10 - r() * 14); b.stroke(); }
    x.filter = 'blur(10px)'; x.drawImage(bg, -30, -30); x.filter = 'none';

    // silhouette
    const sil = new Path2D();
    const oval = (cx, cy, rx, ry) => { const p = new Path2D(); p.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); sil.addPath(p); };
    oval(210, 410, 175, 140);                 // chest
    oval(210, 262, 142, 96);                  // cheek ruff
    oval(210, 200, 116, 98);                  // skull
    const ear = (s) => { const p = new Path2D(); p.moveTo(210 + s * 50, 128); p.quadraticCurveTo(210 + s * 98, 30, 210 + s * 112, 44);
      p.quadraticCurveTo(210 + s * 128, 108, 210 + s * 112, 160); p.closePath(); return p; };
    sil.addPath(ear(-1)); sil.addPath(ear(1));
    // base coat with soft daylight from upper left
    g = x.createRadialGradient(170, 150, 20, 210, 260, 290);
    g.addColorStop(0, '#fdfcf8'); g.addColorStop(0.55, '#ece8e0'); g.addColorStop(1, '#b9b3a8');
    x.fillStyle = g; x.fill(sil);
    // ear insides
    for (const s of [-1, 1]) { x.fillStyle = 'rgba(196,170,160,0.75)'; x.beginPath(); x.moveTo(210 + s * 66, 124); x.quadraticCurveTo(210 + s * 98, 56, 210 + s * 106, 64); x.quadraticCurveTo(210 + s * 112, 112, 210 + s * 104, 142); x.closePath(); x.fill(); }
    // collar under the ruff
    x.strokeStyle = '#b8322a'; x.lineWidth = 14; x.beginPath(); x.ellipse(210, 318, 112, 30, 0, 0.15, Math.PI - 0.15); x.stroke();
    x.fillStyle = '#d9b44a'; x.beginPath(); x.arc(210, 352, 8, 0, 7); x.fill();
    // fur strokes
    const shadeAt = (px, py) => {
      let s = 0;
      s += sstep(250, 330, Math.hypot((px - 210) * 1.2, py - 40)) * 40;            // falloff from light
      s += Math.exp(-Math.pow((py - 312) / 26, 2)) * sstep(170, 40, Math.abs(px - 210)) * 55; // under the chin
      return s;
    };
    for (let i = 0; i < 26000; i++) {
      const px = 20 + r() * 380, py = 20 + r() * 400;
      if (!x.isPointInPath(sil, px, py)) continue;
      const dx = px - 210, dy = py - 225, len = Math.hypot(dx, dy) + 1e-3;
      let ax = dx / len, ay = dy / len * 0.8 + 0.35; const al = Math.hypot(ax, ay); ax /= al; ay /= al;
      const near = len < 55; // short smooth fur on the muzzle
      const L = (near ? 4 : 7) + r() * (near ? 4 : 13);
      const sh = shadeAt(px, py) + (r() - 0.5) * 26;
      const v = 248 - sh;
      x.strokeStyle = `rgba(${v},${v - 3},${v - 9},${0.25 + r() * 0.35})`;
      x.lineWidth = 0.8 + r() * 1.4;
      x.beginPath(); x.moveTo(px, py);
      x.quadraticCurveTo(px + ax * L * 0.5 + (r() - 0.5) * 3, py + ay * L * 0.5 + (r() - 0.5) * 3, px + ax * L, py + ay * L); x.stroke();
    }
    // stray fluffy hairs past the outline
    for (let i = 0; i < 2600; i++) {
      const a = r() * Math.PI * 2, px = 210 + Math.cos(a) * (120 + r() * 40), py = 240 + Math.sin(a) * (110 + r() * 40);
      if (!x.isPointInPath(sil, px, py)) continue;
      const L = 8 + r() * 14;
      x.strokeStyle = `rgba(245,243,238,${0.2 + r() * 0.3})`; x.lineWidth = 0.8;
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * L, py + Math.sin(a) * L); x.stroke();
    }
    // eyes
    for (const s of [-1, 1]) {
      const ex = 210 + s * 40, ey = 196;
      g = x.createRadialGradient(ex, ey, 4, ex, ey, 26); g.addColorStop(0, 'rgba(90,80,72,0.55)'); g.addColorStop(1, 'rgba(90,80,72,0)');
      x.fillStyle = g; x.beginPath(); x.arc(ex, ey, 26, 0, 7); x.fill();
      x.fillStyle = '#1a120e'; x.beginPath(); x.ellipse(ex, ey, 13, 10, s * 0.22, 0, 7); x.fill();
      x.fillStyle = '#3b2a20'; x.beginPath(); x.ellipse(ex + s * 1, ey + 1, 8, 7, 0, 0, 7); x.fill();
      x.fillStyle = '#0c0807'; x.beginPath(); x.arc(ex + s * 1, ey + 1, 4.5, 0, 7); x.fill();
      x.fillStyle = 'rgba(255,255,255,0.85)'; x.beginPath(); x.arc(ex + 4, ey - 3, 2.6, 0, 7); x.fill();
    }
    // nose
    g = x.createRadialGradient(205, 240, 2, 210, 248, 24); g.addColorStop(0, '#3a3431'); g.addColorStop(1, '#0d0b0a');
    x.fillStyle = g; x.beginPath(); x.moveTo(190, 238); x.quadraticCurveTo(210, 228, 230, 238); x.quadraticCurveTo(232, 252, 214, 262);
    x.quadraticCurveTo(210, 264, 206, 262); x.quadraticCurveTo(188, 252, 190, 238); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.35)'; x.beginPath(); x.ellipse(206, 238, 8, 3, -0.2, 0, 7); x.fill();
    // smiling open mouth + tongue
    x.fillStyle = '#4b1f22'; x.beginPath(); x.moveTo(176, 274); x.quadraticCurveTo(210, 286, 244, 274); x.quadraticCurveTo(236, 306, 210, 312); x.quadraticCurveTo(184, 306, 176, 274); x.fill();
    g = x.createLinearGradient(0, 284, 0, 326); g.addColorStop(0, '#d9707e'); g.addColorStop(1, '#f2a0aa');
    x.fillStyle = g; x.beginPath(); x.ellipse(210, 304, 17, 22, 0, 0, 7); x.fill();
    x.strokeStyle = 'rgba(160,60,72,0.6)'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(210, 290); x.lineTo(210, 318); x.stroke();
    x.strokeStyle = '#3b2b28'; x.lineWidth = 2.6; x.lineCap = 'round';
    x.beginPath(); x.moveTo(210, 262); x.lineTo(210, 276); x.stroke();
    x.beginPath(); x.moveTo(170, 268); x.quadraticCurveTo(190, 284, 210, 276); x.quadraticCurveTo(230, 284, 250, 268); x.stroke();
    // warm sunlight
    g = x.createRadialGradient(80, 40, 10, 80, 40, 360); g.addColorStop(0, 'rgba(255,236,200,0.18)'); g.addColorStop(1, 'rgba(255,236,200,0)');
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    return finish(c, 6, { grain: 6, vig: 0.2, soft: 0.6 });
  }

  // ---------------- doner kebab plate, shot from above at a restaurant ----------------
  function kebab() {
    const c = cv(), x = c.getContext('2d'), r = rng(21), N = noise(22);
    // dark wood table
    const im = x.createImageData(S, S), d = im.data;
    for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
      const gr = N.fbm(px * 0.004, py * 0.06, 4), fine = N.n(px * 0.03, py * 0.6);
      const v = 0.75 + 0.35 * gr + 0.12 * fine;
      const i = (py * S + px) * 4; d[i] = 92 * v; d[i + 1] = 60 * v; d[i + 2] = 38 * v; d[i + 3] = 255;
    }
    x.putImageData(im, 0, 0);
    // plate shadow, plate, rim
    x.save(); x.filter = 'blur(14px)'; x.fillStyle = 'rgba(0,0,0,0.55)'; x.beginPath(); x.ellipse(222, 238, 204, 178, 0, 0, 7); x.fill(); x.restore();
    let g = x.createRadialGradient(180, 170, 30, 210, 220, 220); g.addColorStop(0, '#fbfaf7'); g.addColorStop(0.8, '#e6e4df'); g.addColorStop(1, '#c9c6c0');
    x.fillStyle = g; x.beginPath(); x.ellipse(210, 222, 200, 176, 0, 0, 7); x.fill();
    x.strokeStyle = 'rgba(160,156,150,0.6)'; x.lineWidth = 2; x.beginPath(); x.ellipse(210, 224, 160, 140, 0, 0, 7); x.stroke();
    // lavash / pide wedges at the top-left
    for (const [bx, by, a] of [[105, 120, -0.6], [150, 95, -0.2]]) {
      x.save(); x.translate(bx, by); x.rotate(a);
      g = x.createLinearGradient(0, -30, 0, 30); g.addColorStop(0, '#e8c58e'); g.addColorStop(1, '#c79a5c');
      x.fillStyle = g; x.beginPath(); x.moveTo(-60, 20); x.quadraticCurveTo(-10, -42, 62, -18); x.quadraticCurveTo(40, 30, -60, 20); x.fill();
      for (let i = 0; i < 26; i++) { x.fillStyle = `rgba(${120 + r() * 30},${70 + r() * 20},30,${0.3 + r() * 0.4})`; x.beginPath(); x.ellipse((r() - 0.4) * 90, (r() - 0.5) * 30, 2 + r() * 5, 1.5 + r() * 3, r() * 3, 0, 7); x.fill(); }
      x.restore();
    }
    // rice bed
    for (let i = 0; i < 2600; i++) {
      const a = r() * Math.PI * 2, rr = Math.sqrt(r());
      const px = 250 + Math.cos(a) * rr * 105, py = 290 + Math.sin(a) * rr * 62;
      const v = 232 + r() * 20;
      x.fillStyle = `rgba(${v},${v - 14},${v - 48},0.95)`;
      x.beginPath(); x.ellipse(px, py, 4.2, 1.7, r() * Math.PI, 0, 7); x.fill();
      if (r() < 0.25) { x.fillStyle = 'rgba(150,120,70,0.25)'; x.beginPath(); x.ellipse(px + 1, py + 1.5, 4, 1.4, r() * Math.PI, 0, 7); x.fill(); }
    }
    // doner meat: broad, thin, curled shavings piled up, charred at the edges
    x.save(); x.fillStyle = '#4a2512'; x.filter = 'blur(3px)'; x.beginPath(); x.ellipse(182, 218, 104, 76, -0.1, 0, 7); x.fill(); x.restore();
    for (let i = 0; i < 190; i++) {
      const a = r() * Math.PI * 2, rr = Math.sqrt(r());
      const cx = 182 + Math.cos(a) * rr * 98, cy = 218 + Math.sin(a) * rr * 70;
      const ang = r() * Math.PI, L = 24 + r() * 26, W = 13 + r() * 12;
      x.save(); x.translate(cx, cy); x.rotate(ang);
      const pts = [];
      for (let k = 0; k < 12; k++) { const t = k / 12 * Math.PI * 2; const j = 0.75 + 0.35 * r(); pts.push([Math.cos(t) * L / 2 * j, Math.sin(t) * W / 2 * j]); }
      const shp = new Path2D(); shp.moveTo(pts[0][0], pts[0][1]);
      for (let k = 0; k < 12; k++) { const p0 = pts[k], p1 = pts[(k + 1) % 12]; shp.quadraticCurveTo(p0[0], p0[1], (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2); }
      x.save(); x.translate(1.5, 2.5); x.fillStyle = 'rgba(30,12,4,0.45)'; x.fill(shp); x.restore();
      const tone = r();
      g = x.createRadialGradient(-L * 0.1, -W * 0.15, 1, 0, 0, L * 0.6);
      g.addColorStop(0, tone < 0.4 ? '#b8784a' : '#a5633a'); g.addColorStop(0.55, tone < 0.5 ? '#86471f' : '#7a4120'); g.addColorStop(1, '#3f1e0c');
      x.fillStyle = g; x.fill(shp);
      // fibres and grill char
      x.save(); x.clip(shp);
      for (let k = 0; k < 6; k++) { x.strokeStyle = `rgba(${r() < 0.5 ? '60,28,12' : '210,150,105'},${0.18 + r() * 0.2})`; x.lineWidth = 0.8;
        const yy = (r() - 0.5) * W; x.beginPath(); x.moveTo(-L / 2, yy); x.quadraticCurveTo(0, yy + (r() - 0.5) * 5, L / 2, yy + (r() - 0.5) * 4); x.stroke(); }
      for (let k = 0; k < 3; k++) { x.fillStyle = `rgba(28,12,5,${0.3 + r() * 0.35})`; x.beginPath(); x.ellipse((r() - 0.5) * L, (r() < 0.5 ? -1 : 1) * W * 0.4, 3 + r() * 5, 1.5 + r() * 2, 0, 0, 7); x.fill(); }
      x.restore();
      if (r() < 0.5) { x.fillStyle = 'rgba(255,225,190,0.28)'; x.beginPath(); x.ellipse(-L * 0.15, -W * 0.15, L * 0.18, 1.6, 0, 0, 7); x.fill(); }
      x.restore();
    }
    // parsley flakes
    for (let i = 0; i < 70; i++) { x.fillStyle = `rgba(${40 + r() * 30},${100 + r() * 50},${30 + r() * 20},0.9)`; x.beginPath(); x.ellipse(110 + r() * 150, 165 + r() * 110, 1.5 + r() * 1.8, 1 + r(), r() * 3, 0, 7); x.fill(); }
    // salad on the right: lettuce, tomato, red onion
    for (let i = 0; i < 380; i++) {
      const px = 300 + (r() - 0.5) * 110, py = 175 + (r() - 0.5) * 170;
      if (Math.hypot((px - 300) / 58, (py - 175) / 88) > 1) continue;
      const gg = 120 + r() * 80;
      x.strokeStyle = `rgba(${gg * 0.55},${gg + 20},${gg * 0.3},0.9)`; x.lineWidth = 2.5 + r() * 3; x.lineCap = 'round';
      const a = r() * Math.PI, L = 8 + r() * 16;
      x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + Math.cos(a) * L * 0.5 + 3, py + Math.sin(a) * L * 0.5, px + Math.cos(a) * L, py + Math.sin(a) * L); x.stroke();
    }
    for (let i = 0; i < 7; i++) {
      const px = 285 + (r() - 0.5) * 80, py = 120 + i * 24 + (r() - 0.5) * 10, a = r() * 6;
      x.save(); x.translate(px, py); x.rotate(a);
      g = x.createRadialGradient(0, 0, 2, 0, 0, 17); g.addColorStop(0, '#f3826a'); g.addColorStop(0.6, '#d8392c'); g.addColorStop(1, '#a51f17');
      x.fillStyle = g; x.beginPath(); x.moveTo(-16, 0); x.arc(0, 0, 16, Math.PI, 0); x.closePath(); x.fill();
      x.fillStyle = 'rgba(245,215,120,0.8)'; for (let k = 0; k < 5; k++) { x.beginPath(); x.ellipse(-9 + k * 4.5, -6 + (r() - 0.5) * 3, 1.6, 1, 0, 0, 7); x.fill(); }
      x.restore();
    }
    for (let i = 0; i < 12; i++) {
      const px = 300 + (r() - 0.5) * 90, py = 170 + (r() - 0.5) * 150, rr = 10 + r() * 12, a0 = r() * 6;
      x.strokeStyle = '#8e3a6e'; x.lineWidth = 3.2; x.beginPath(); x.arc(px, py, rr, a0, a0 + 1.6 + r() * 1.5); x.stroke();
      x.strokeStyle = 'rgba(235,210,228,0.9)'; x.lineWidth = 1.3; x.beginPath(); x.arc(px, py, rr - 2.2, a0, a0 + 1.6); x.stroke();
    }
    // garlic yogurt sauce + chili sauce drizzled over the meat
    const drizzle = (col, w, pts) => {
      x.strokeStyle = col; x.lineWidth = w; x.lineCap = 'round'; x.lineJoin = 'round';
      x.beginPath(); x.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length - 1; i++) x.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2); x.stroke();
    };
    const zz = (y0, amp, n, x0, x1) => Array.from({ length: n }, (_, i) => [x0 + (x1 - x0) * i / (n - 1), y0 + (i % 2 ? amp : -amp) + (r() - 0.5) * 8]);
    const p1 = zz(200, 26, 9, 95, 265), p2 = zz(225, 18, 7, 110, 250);
    drizzle('rgba(120,110,95,0.35)', 8, p1.map(([a, b2]) => [a + 1.5, b2 + 2.5]));
    drizzle('#f6f1e4', 6, p1);
    drizzle('rgba(255,255,255,0.7)', 2, p1.map(([a, b2]) => [a - 1, b2 - 1.5]));
    drizzle('#a8241b', 3.5, p2);
    // lemon wedge at the rim
    x.save(); x.translate(345, 330); x.rotate(0.6);
    x.fillStyle = '#e8c82a'; x.beginPath(); x.ellipse(0, 0, 30, 14, 0, 0, Math.PI); x.fill();
    x.fillStyle = '#f7ea9a'; x.beginPath(); x.ellipse(0, 1, 25, 10, 0, 0, Math.PI); x.fill();
    x.restore();
    // warm overhead restaurant light
    g = x.createRadialGradient(200, 160, 40, 210, 220, 330); g.addColorStop(0, 'rgba(255,214,160,0.12)'); g.addColorStop(1, 'rgba(40,20,0,0.25)');
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    return finish(c, 23, { grain: 7, vig: 0.28 });
  }

  // ---------------- payment-sent screenshot (crisp, no camera processing) ----------------
  function payment() {
    const c = cv(), x = c.getContext('2d');
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, S, S);
    x.fillStyle = '#f2f3f5'; x.fillRect(0, 0, S, 44);
    x.fillStyle = '#6b7280'; x.font = '600 17px "Noto Sans"'; x.textAlign = 'center'; x.fillText('Payment complete', S / 2, 29);
    x.fillStyle = '#00b85c'; x.beginPath(); x.arc(S / 2, 112, 44, 0, 7); x.fill();
    x.strokeStyle = '#fff'; x.lineWidth = 9; x.lineCap = 'round'; x.lineJoin = 'round';
    x.beginPath(); x.moveTo(S / 2 - 20, 113); x.lineTo(S / 2 - 5, 128); x.lineTo(S / 2 + 22, 98); x.stroke();
    x.fillStyle = '#111827'; x.font = '700 62px "Noto Sans"'; x.fillText('$14.50', S / 2, 226);
    x.fillStyle = '#374151'; x.font = '500 21px "Noto Sans"'; x.fillText('Paid to Istanbul D\u00f6ner Grill', S / 2, 264);
    x.fillStyle = '#9ca3af'; x.font = '400 17px "Noto Sans"'; x.fillText('Nov 12, 6:47 PM  \u00b7  Visa \u2022\u2022\u2022\u2022 4821', S / 2, 294);
    x.fillStyle = '#e5e7eb'; x.fillRect(40, 318, S - 80, 1);
    x.fillStyle = '#6b7280'; x.font = '400 16px "Noto Sans"'; x.textAlign = 'left'; x.fillText('Note', 40, 346);
    x.fillStyle = '#111827'; x.textAlign = 'right'; x.fillText('d\u00f6ner w/ jake', S - 40, 346);
    x.fillStyle = '#1d6cf2'; x.beginPath(); x.roundRect(40, 366, S - 80, 50, 25); x.fill();
    x.fillStyle = '#fff'; x.font = '600 19px "Noto Sans"'; x.textAlign = 'center'; x.fillText('Done', S / 2, 398);
    return c.toDataURL('image/png');
  }

  // ---------------- sunset over the neighbourhood ----------------
  function sunset() {
    const c = cv(), x = c.getContext('2d'), im = x.createImageData(S, S), d = im.data, N = noise(31), r = rng(32);
    for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
      const u = px / S, v = py / S;
      const stops = [[0, [36, 42, 88]], [0.3, [104, 62, 118]], [0.55, [222, 102, 104]], [0.72, [246, 168, 92]], [0.82, [255, 214, 140]]];
      let col = stops[stops.length - 1][1];
      for (let i = 0; i < stops.length - 1; i++) if (v <= stops[i + 1][0]) { col = mix3(stops[i][1], stops[i + 1][1], (v - stops[i][0]) / (stops[i + 1][0] - stops[i][0])); break; }
      const sun = Math.exp(-Math.pow(Math.hypot(u - 0.68, (v - 0.8) * 1.4) / 0.16, 2));
      col = mix3(col, [255, 236, 190], sun * 0.8);
      const cl = sstep(0.52, 0.72, N.fbm(u * 3, v * 22, 5)) * sstep(0.1, 0.35, v) * sstep(0.75, 0.55, v);
      col = mix3(col, mix3([120, 60, 96], [250, 150, 120], sstep(0.3, 0.7, v)), cl * 0.75);
      const i = (py * S + px) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
    }
    x.putImageData(im, 0, 0);
    const ink = '#140e15';
    x.fillStyle = ink;
    // rooftops and trees along the street
    x.beginPath(); x.moveTo(0, S);
    let hx = 0;
    while (hx < S) {
      const w = 40 + r() * 50, h = 330 - r() * 30;
      if (r() < 0.4) { x.lineTo(hx, h + 10); x.lineTo(hx + w / 2, h - 22); x.lineTo(hx + w, h + 10); }
      else { x.lineTo(hx, h); x.lineTo(hx + w, h); }
      hx += w;
    }
    x.lineTo(S, S); x.closePath(); x.fill();
    for (let i = 0; i < 160; i++) { const tx = (i < 90 ? 20 + r() * 120 : 300 + r() * 110), ty = 250 + r() * 90; x.beginPath(); x.arc(tx, ty, 6 + r() * 16, 0, 7); x.fill(); }
    // utility pole + wires
    x.fillRect(84, 120, 7, 300); x.fillRect(58, 138, 60, 5); x.fillRect(64, 160, 48, 4);
    x.strokeStyle = ink; x.lineWidth = 1.4;
    for (const [y0, y1, sag] of [[140, 158, 34], [146, 166, 40], [162, 182, 30]]) { x.beginPath(); x.moveTo(-10, y0 + 20); x.quadraticCurveTo(40, y0 + sag * 0.6, 88, y0); x.quadraticCurveTo(260, y1 + sag, S + 10, y1); x.stroke(); }
    // street lamp
    x.fillRect(352, 220, 4, 200); x.fillRect(332, 220, 24, 3);
    x.fillStyle = 'rgba(255,220,150,0.9)'; x.beginPath(); x.arc(334, 226, 3, 0, 7); x.fill();
    // road
    const g = x.createLinearGradient(0, 360, 0, S); g.addColorStop(0, '#2a1d22'); g.addColorStop(1, '#0d090c');
    x.fillStyle = g; x.fillRect(0, 362, S, 60);
    x.fillStyle = 'rgba(250,170,110,0.25)'; x.fillRect(0, 362, S, 2);
    return finish(c, 33, { grain: 9, vig: 0.3 });
  }

  window.PHOTOS = { make: () => ({ dog: dog(), payment: payment(), kebab: kebab(), beach: beach(), sunset: sunset() }) };
})();
