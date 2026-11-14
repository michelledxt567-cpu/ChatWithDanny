// Danny's dad's old house outside Vernonia, Oregon, at 8:23 PM on a mid-November night, as seen by the
// protagonist's phone camera. WebGL2, everything procedural.
//
// The house geometry is unchanged from the earlier version (porch with square columns, arched double
// doors, clapboard left wing with a railing, tall twin gothic-arch bay on the right). New:
//  - Materials: decades-old weathered wood, mottled silver-grey and brown, with black mildew, runoff
//    streaks, lichen and algae, and cracked, peeling remnants of old paint; mossy shingles; grimy old glass.
//  - November vegetation: dormant/dead lawn grass, fallen big-leaf maple leaves, bare hydrangeas with dried
//    flower heads, evergreen rhododendrons and sword ferns, dead bracken, blackberry canes, a bare mossy
//    maple and a pale alder, Douglas firs behind the house.
//  - Lighting with physical ratios: an overcast night sky (ambient, occluded by a baked sky-visibility
//    volume), a distant warm sodium yard light with a shadow map, the phone's LED flash (1/d², beam cone),
//    and thin mist (extinction, flash back-scatter).
//  - A phone camera pipeline: 4x MSAA HDR render, local tone mapping (Smart-HDR-like), white balance,
//    bloom, vignetting, sensor noise.
// SwiftShader runs every branch for every pixel, so each material group has its own shader program and a
// depth pre-pass makes sure each pixel is shaded once.
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
  const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const addv = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const UP = [0, 1, 0];

  // ---------------- materials and their shader groups ----------------
  // 0 siding, 1 trim (horizontal grain), 11 trim (vertical grain), 8 porch floor, 9 railing slats,
  // 2 door, 3 sash window, 4 bay window, 5 ground, 6 concrete path, 7 shingles,
  // 12 grass, 15 fern/bracken, 18 leaves, 19 dried flower heads, 14 bark/twigs/canes, 16 fir foliage
  const GROUPS = [[0, 1, 8, 9, 11], [2, 3, 4], [5, 6], [7], [12], [15, 18, 19], [14], [16]];
  const GROUP_OF = []; GROUPS.forEach((g, i) => g.forEach((m) => (GROUP_OF[m] = i)));
  const GRASS_GROUP = 4;
  const FSZ = 11;   // pos3 nor3 uv2 aux2 mat1
  const geo = GROUPS.map(() => []);
  function V(p, n, u, v, mat, aux = [0, 0]) { geo[GROUP_OF[mat]].push(p[0], p[1], p[2], n[0], n[1], n[2], u, v, aux[0], aux[1], mat); }

  // ---------------- house geometry (identical layout to the previous version) ----------------
  function quad(p0, p1, p2, p3, n, mat, aux) {
    const uv = [[0, 0], [1, 0], [1, 1], [0, 1]], P = [p0, p1, p2, p3];
    for (const i of [0, 1, 2, 0, 2, 3]) V(P[i], n, uv[i][0], uv[i][1], mat, aux);
  }
  function box(x0, y0, z0, x1, y1, z1, mat, opt = {}) {
    if (mat === 1 && (y1 - y0) > 1.5 * Math.max(x1 - x0, z1 - z0)) mat = 11;
    const m = (face) => (opt.faces && opt.faces[face] !== undefined ? opt.faces[face] : mat);
    quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], m('front'));
    quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], m('back'));
    quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], m('left'));
    quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], m('right'));
    quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], m('top'));
    quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], m('bottom'));
  }
  const panelZ = (x0, y0, x1, y1, z, mat) => quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], [0, 0, 1], mat);
  function tri(a, b, c, mat, aux) {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = norm(cross(e1, e2));
    for (const p of [a, b, c]) V(p, n, 0, 0, mat, aux);
  }
  function slope(a, b, c, d, mat) { tri(a, b, c, mat); tri(a, c, d, mat); }

  function buildHouse() {
    const SID = 0, TRIM = 1, DOOR = 2, WIN = 3, BAY = 4, GROUND = 5, PATH = 6, ROOF = 7, FLOOR = 8, RAIL = 9;
    // ground (larger now, so the trees behind stand on it) + path
    for (let x = -60; x < 60; x += 20) for (let z = -60; z < 60; z += 20) quad([x, 0, z + 20], [x + 20, 0, z + 20], [x + 20, 0, z], [x, 0, z], [0, 1, 0], GROUND);
    quad([-1.6, 0.005, 14], [1.6, 0.005, 14], [1.6, 0.005, 2.9], [-1.6, 0.005, 2.9], [0, 1, 0], PATH);
    quad([-7.5, 0.006, 3.4], [7.5, 0.006, 3.4], [7.5, 0.006, 2.6], [-7.5, 0.006, 2.6], [0, 1, 0], PATH);
    // porch deck + steps
    box(-2.3, 0, 0, 2.3, 0.46, 2.3, TRIM, { faces: { top: FLOOR } });
    box(-1.5, 0, 2.3, 1.5, 0.31, 2.62, TRIM, { faces: { top: FLOOR } });
    box(-1.5, 0, 2.62, 1.5, 0.155, 2.94, TRIM, { faces: { top: FLOOR } });
    // facade behind porch
    box(-2.3, 0.46, -0.35, 2.3, 6.6, 0, SID);
    // door surround + doors
    box(-0.86, 0.46, 0, 0.86, 2.98, 0.07, TRIM);
    panelZ(-0.72, 0.46, -0.03, 2.86, 0.075, DOOR);
    panelZ(0.03, 0.46, 0.72, 2.86, 0.075, DOOR);
    box(-0.04, 0.46, 0.07, 0.04, 2.9, 0.1, TRIM);
    // porch side walls with windows
    panelZ(-2.0, 1.15, -1.25, 2.6, 0.012, WIN); box(-2.07, 1.08, 0, -1.18, 1.15, 0.08, TRIM);
    panelZ(1.25, 1.15, 2.0, 2.6, 0.012, WIN); box(1.18, 1.08, 0, 2.07, 1.15, 0.08, TRIM);
    // columns: base, shaft, capital
    for (const x of [-1.95, 1.95]) {
      box(x - 0.25, 0.46, 1.8, x + 0.25, 1.05, 2.3, TRIM);
      box(x - 0.17, 1.05, 1.88, x + 0.17, 2.95, 2.22, TRIM);
      box(x - 0.26, 2.95, 1.79, x + 0.26, 3.12, 2.31, TRIM);
      box(x - 0.2, 1.05, 1.84, x + 0.2, 1.14, 2.26, TRIM);
    }
    // porch roof: entablature + soffit + low-slope roof
    box(-2.45, 3.12, -0.1, 2.45, 3.48, 2.48, TRIM);
    box(-2.6, 3.48, -0.1, 2.6, 3.58, 2.65, TRIM);
    slope([-2.6, 3.58, 2.65], [2.6, 3.58, 2.65], [2.6, 3.95, -0.1], [-2.6, 3.95, -0.1], ROOF);
    box(-0.07, 2.98, 1.0, 0.07, 3.12, 1.14, TRIM); // old light fixture (unlit)
    // upper floor of main block: window + gable
    box(-1.0, 4.3, 0, 1.0, 4.38, 0.1, TRIM);
    panelZ(-0.9, 4.38, 0.9, 5.75, 0.012, WIN);
    box(-1.0, 5.75, 0, 1.0, 5.9, 0.12, TRIM);
    box(-2.5, 6.6, -0.5, 2.5, 6.8, 0.2, TRIM);
    tri([-2.5, 6.8, 0.0], [2.5, 6.8, 0.0], [0, 8.5, 0.0], SID);
    slope([-2.8, 6.65, 0.25], [0, 8.75, 0.25], [0, 8.75, -6], [-2.8, 6.65, -6], ROOF);
    slope([0, 8.75, 0.25], [2.8, 6.65, 0.25], [2.8, 6.65, -6], [0, 8.75, -6], ROOF);
    // ---- left wing (projects forward, clapboard side visible) ----
    box(-8.5, 0.3, -2.0, -2.3, 3.7, 0.9, SID);
    box(-8.5, 0.0, -2.0, -2.3, 0.3, 0.95, TRIM);
    panelZ(-5.1, 1.25, -3.6, 3.0, 0.902, WIN);
    box(-5.22, 1.12, 0.9, -3.48, 1.25, 1.02, TRIM); box(-5.22, 3.0, 0.9, -3.48, 3.12, 1.02, TRIM);
    panelZ(-7.6, 1.25, -6.4, 3.0, 0.902, WIN);
    box(-7.72, 1.12, 0.9, -6.28, 1.25, 1.02, TRIM);
    box(-8.6, 3.7, -2.0, -2.3, 3.92, 1.35, TRIM);
    slope([-8.6, 3.92, 1.35], [-2.3, 3.92, 1.35], [-2.3, 5.4, -2.0], [-8.6, 5.4, -2.0], ROOF);
    box(-2.42, 0.3, 0.75, -2.3, 3.7, 0.92, TRIM); // corner board
    box(-2.62, 0.3, 1.2, -2.54, 3.85, 1.28, TRIM); // gutter/downspout
    // railing in front of left wing
    box(-8.2, 0.0, 2.35, -2.6, 0.08, 2.5, TRIM);
    quad([-8.2, 0.08, 2.43], [-2.6, 0.08, 2.43], [-2.6, 1.0, 2.43], [-8.2, 1.0, 2.43], [0, 0, 1], RAIL);
    box(-8.2, 1.0, 2.33, -2.6, 1.1, 2.53, TRIM);
    for (const x of [-8.2, -5.4, -2.7]) box(x, 0, 2.32, x + 0.14, 1.18, 2.54, TRIM);
    // ---- right bay / tower ----
    box(2.3, 0.0, -1.0, 6.2, 0.55, 0.85, TRIM);
    box(2.3, 0.55, -1.0, 6.2, 8.2, 0.6, SID);
    panelZ(2.8, 1.25, 5.7, 4.95, 0.605, BAY);
    box(2.66, 1.1, 0.6, 5.84, 1.25, 0.82, TRIM);
    box(2.66, 4.95, 0.6, 5.84, 5.15, 0.75, TRIM);
    box(4.18, 1.25, 0.6, 4.32, 4.6, 0.7, TRIM);
    box(2.66, 1.25, 0.6, 2.8, 5.0, 0.7, TRIM); box(5.7, 1.25, 0.6, 5.84, 5.0, 0.7, TRIM);
    for (let i = 0; i < 3; i++) panelZ(2.7 + i * 1.07, 0.15, 3.62 + i * 1.07, 0.48, 0.852, TRIM);
    panelZ(3.3, 5.7, 5.2, 7.4, 0.605, WIN);
    box(2.2, 8.2, -1.2, 6.35, 8.45, 0.8, TRIM);
  }

  // ---------------- November vegetation ----------------
  const R = rng(1114);
  function cyl(a, b, r0, r1, n, mat, aux) {
    const ax = norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
    const t = norm(Math.abs(ax[1]) < 0.95 ? cross(ax, UP) : cross(ax, [1, 0, 0])), bt = cross(t, ax);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const ring = (c, r, i) => { const g = i / n * TAU, d = addv(addv([0, 0, 0], t, Math.cos(g)), bt, Math.sin(g)); return [addv(c, d, r), d]; };
    for (let i = 0; i < n; i++) {
      const [p0, n0] = ring(a, r0, i), [p1, n1] = ring(a, r0, i + 1), [q0] = ring(b, r1, i), [q1] = ring(b, r1, i + 1);
      V(p0, n0, i / n, 0, mat, aux); V(p1, n1, (i + 1) / n, 0, mat, aux); V(q1, n1, (i + 1) / n, len, mat, aux);
      V(p0, n0, i / n, 0, mat, aux); V(q1, n1, (i + 1) / n, len, mat, aux); V(q0, n0, i / n, len, mat, aux);
    }
  }
  // a flat card facing `n` with half sizes (w along `u`, h along `v`), uv -1..1
  function card(c, u, v, w, h, mat, aux) {
    const n = norm(cross(u, v)), P = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => addv(addv(c, u, a * w), v, b * h));
    const uv = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (const i of [0, 1, 2, 0, 2, 3]) V(P[i], n, uv[i][0], uv[i][1], mat, aux);
  }
  const insideHouse = (x, z) => (x > -2.4 && x < 2.4 && z < 2.98) || (x > -8.6 && x < -2.3 && z < 1.0) || (x > 2.25 && x < 6.3 && z < 0.9);
  const onPath = (x, z) => (Math.abs(x) < 1.6 && z > 2.9 && z < 14) || (Math.abs(x) < 7.5 && z > 2.6 && z < 3.4);

  // dormant lawn: tufts of mostly dead, straw-coloured grass with some green left at the base
  function grassTuft(x, z, h, dead) {
    const nb = 5 + Math.floor(R() * 6), seed = R();
    for (let i = 0; i < nb; i++) {
      const ang = R() * TAU, d = [Math.cos(ang), 0, Math.sin(ang)], side = [-d[2], 0, d[0]];
      const hh = h * (0.45 + 0.75 * R()), bend = 0.15 + 0.55 * R(), w = 0.006 + 0.007 * R();
      const o = [x + d[0] * 0.03 * R(), 0, z + d[2] * 0.03 * R()];
      const mid = [o[0] + d[0] * hh * bend * 0.35, hh * 0.55, o[2] + d[2] * hh * bend * 0.35];
      const tip = [o[0] + d[0] * hh * bend, hh * (1 - 0.35 * bend * bend), o[2] + d[2] * hh * bend];
      const n = norm([d[0], 0.7, d[2]]), aux = [seed + i * 0.13, R() < dead ? 1 : 0];
      const a0 = addv(o, side, -w), a1 = addv(o, side, w), m0 = addv(mid, side, -w * 0.7), m1 = addv(mid, side, w * 0.7);
      V(a0, n, 0, 0, 12, aux); V(a1, n, 1, 0, 12, aux); V(m1, n, 1, 0.55, 12, aux);
      V(a0, n, 0, 0, 12, aux); V(m1, n, 1, 0.55, 12, aux); V(m0, n, 0, 0.55, 12, aux);
      V(m0, n, 0, 0.55, 12, aux); V(m1, n, 1, 0.55, 12, aux); V(tip, n, 0.5, 1, 12, aux);
    }
  }
  // sword fern (evergreen) or dead bracken: arching fronds, leaflets cut in the shader
  function fern(x, z, size, dead) {
    const nf = 9 + Math.floor(R() * 8), rot = R() * TAU;
    for (let i = 0; i < nf; i++) {
      const ang = rot + i / nf * TAU + (R() - 0.5) * 0.4, len = size * (0.6 + 0.5 * R()), rise = 0.6 + 0.6 * R();
      const d = [Math.cos(ang), 0, Math.sin(ang)], side = [-d[2], 0, d[0]];
      const aux = [R(), dead ? 1 : 0];
      let prev = null;
      for (let k = 0; k <= 5; k++) {
        const f = k / 5, w = 0.1 * size * Math.sin(Math.PI * Math.min(0.97, f * 0.9 + 0.08));
        const droop = dead ? 1.1 : 0.85;
        const p = [x + d[0] * len * f, len * (rise * f - (rise + 0.35) * f * f * droop) + 0.02, z + d[2] * len * f];
        const n = norm([d[0] * -0.3, 1, d[2] * -0.3]);
        const cur = [addv(p, side, -w), addv(p, side, w), f];
        if (prev) {
          V(prev[0], n, -1, prev[2], 15, aux); V(prev[1], n, 1, prev[2], 15, aux); V(cur[1], n, 1, f, 15, aux);
          V(prev[0], n, -1, prev[2], 15, aux); V(cur[1], n, 1, f, 15, aux); V(cur[0], n, -1, f, 15, aux);
        }
        prev = cur;
      }
    }
  }
  // recursive bare branches; calls leafFn at twig tips
  function branch(a, d, len, r, depth, aux, spread, tipFn) {
    const bend = norm(addv(d, [(R() - 0.5) * 0.3, (R() - 0.5) * 0.15 + 0.05, (R() - 0.5) * 0.3]));
    const b = addv(a, bend, len);
    cyl(a, b, r, r * 0.68, depth > 2 ? 6 : (depth > 0 ? 4 : 3), 14, aux);
    if (depth === 0 || r < 0.004) { if (tipFn) tipFn(b, bend); return; }
    const nk = depth > 2 ? 3 : 2 + (R() < 0.5 ? 1 : 0);
    for (let k = 0; k < nk; k++) {
      const t = norm(Math.abs(bend[1]) < 0.95 ? cross(bend, UP) : [1, 0, 0]), bt = cross(t, bend), g = R() * TAU;
      const sd = norm(addv(addv(bend, t, Math.cos(g) * spread), bt, Math.sin(g) * spread));
      branch(b, norm(addv(sd, UP, 0.12)), len * (0.62 + 0.2 * R()), r * 0.62, depth - 1, aux, spread, tipFn);
    }
  }
  // bare hydrangea: arching stems with papery brown flower heads left from summer
  function hydrangea(x, z, size) {
    const ns = 9 + Math.floor(R() * 6);
    for (let i = 0; i < ns; i++) {
      const g = R() * TAU, d = norm([Math.cos(g) * 0.45, 1, Math.sin(g) * 0.45]);
      branch([x + Math.cos(g) * 0.08, 0, z + Math.sin(g) * 0.08], d, size * (0.35 + 0.15 * R()), 0.009, 2, [3, R()], 0.55, (p, dd) => {
        if (R() < 0.4) {
          const c = addv(p, dd, 0.03), s = 0.05 + 0.04 * R(), a = R() * TAU;
          const u = [Math.cos(a), 0, Math.sin(a)];
          card(c, u, UP, s, s * 0.85, 19, [R(), 0]); card(c, [-u[2], 0, u[0]], UP, s, s * 0.85, 19, [R(), 0]); card(c, u, [-u[2], 0, u[0]], s, s, 19, [R(), 1]);
        }
      });
    }
  }
  // evergreen rhododendron: leathery leaves clustered at branch tips
  function rhodo(x, z, size) {
    const ns = 6 + Math.floor(R() * 4);
    for (let i = 0; i < ns; i++) {
      const g = R() * TAU, d = norm([Math.cos(g) * 0.6, 1, Math.sin(g) * 0.6]);
      branch([x, 0, z], d, size * 0.32, 0.018, 2, [3, R()], 0.7, (p, dd) => {
        const nl = 7 + Math.floor(R() * 5);
        for (let k = 0; k < nl; k++) {
          const a = k / nl * TAU + R() * 0.4, out = norm([Math.cos(a), 0.25 + 0.4 * R(), Math.sin(a)]);
          const L = 0.08 + 0.05 * R(), c = addv(p, out, L);
          const v = out, u = norm(cross(v, UP));
          card(c, u, v, 0.028 + 0.01 * R(), L, 18, [0, R()]);
        }
      });
    }
  }
  // blackberry: long arching canes, a few dark leaves hanging on
  function bramble(x, z, n) {
    for (let i = 0; i < n; i++) {
      const g = R() * TAU, len = 1.2 + 1.3 * R(), h = 0.6 + 0.8 * R();
      let prev = [x + (R() - 0.5) * 0.8, 0, z + (R() - 0.5) * 0.6];
      const d = [Math.cos(g), 0, Math.sin(g)];
      for (let k = 1; k <= 8; k++) {
        const f = k / 8, p = [prev[0] + d[0] * len / 8, Math.max(0.02, h * Math.sin(Math.PI * f * 0.85)), prev[2] + d[2] * len / 8];
        cyl(prev, p, 0.008, 0.007, 3, 14, [4, R()]);
        if (R() < 0.35) { const u = norm([R() - 0.5, -0.4, R() - 0.5]); card(addv(p, u, 0.05), norm(cross(u, UP)), u, 0.03, 0.045, 18, [1, R()]); }
        prev = p;
      }
    }
  }
  // Douglas fir: trunk + stacked jagged branch whorls (same construction as the dash cam forest)
  function fir(x, z, H, crownBase, Rmax, whorls) {
    const base = [x, -0.3, z], lean = [(R() - 0.5) * 0.02 * H, 0, (R() - 0.5) * 0.02 * H];
    const top = [x + lean[0], H, z + lean[2]];
    cyl(base, addv(top, UP, -H * 0.15), 0.15 + 0.012 * H, 0.05, 7, 14, [0, R()]);
    const K = 10;
    for (let w = 0; w < whorls; w++) {
      const f0 = w / whorls, y0 = crownBase + (H - crownBase) * f0, span = (H - crownBase) * 2.3 / whorls, ya = Math.min(H, y0 + span);
      const r = Rmax * Math.pow(1 - f0, 0.85) * (0.8 + 0.35 * R()) + 0.35;
      const ctr = (y) => { const k = y / H; return [x + lean[0] * k, y, z + lean[2] * k]; };
      const rot = R() * TAU, ring = [];
      for (let k = 0; k <= K; k++) {
        const kk = k % K, ang = rot + kk / K * TAU, rr = r * (0.7 + 0.55 * ((kk * 7919 + w * 104729) % 97) / 97);
        const d = [Math.cos(ang), 0, Math.sin(ang)];
        ring.push([addv(ctr(y0 - rr * (0.22 + 0.2 * R())), d, rr), norm([d[0] * 0.8, 0.55, d[2] * 0.8]), k / K * 3]);
      }
      const apex = ctr(ya), under = ctr(y0 + r * 0.25), aux = [R(), 0];
      for (let k = 0; k < K; k++) {
        V(apex, UP, 0, 0, 16, aux); V(ring[k][0], ring[k][1], ring[k][2], 1, 16, aux); V(ring[k + 1][0], ring[k + 1][1], ring[k + 1][2], 1, 16, aux);
        V(under, [0, -1, 0], 0, 0.15, 16, aux); V(ring[k + 1][0], ring[k + 1][1], ring[k + 1][2], 1, 16, aux); V(ring[k][0], ring[k][1], ring[k][2], 1, 16, aux);
      }
    }
  }
  // bare deciduous tree (big-leaf maple: mossy; red alder: pale lichen bark)
  function bareTree(x, z, H, r, kind) {
    const lean = norm([(R() - 0.5) * 0.15, 1, (R() - 0.5) * 0.15]);
    const fork = addv([x, 0, z], lean, H * 0.38);
    cyl([x, -0.2, z], fork, r, r * 0.8, 9, 14, [kind, R()]);
    const nl = kind === 1 ? 4 : 3;
    for (let i = 0; i < nl; i++) {
      const g = i / nl * TAU + R() * 0.8, d = norm([Math.cos(g) * 0.55, 1, Math.sin(g) * 0.55]);
      branch(fork, d, H * 0.24, r * 0.55, 4, [kind, R()], 0.6, null);
    }
  }

  function buildVegetation() {
    // lawn, unmown since the summer: taller along the house, railing and path edges
    const lawn = (x, z) => {
      if (insideHouse(x, z)) return;
      const edgePath = onPath(x, z);
      if (edgePath && !(Math.abs(Math.abs(x) - 1.6) < 0.12 || Math.abs(z - 2.6) < 0.08 || Math.abs(z - 3.4) < 0.08)) return;
      const nearHouse = (z < 3.4 && !onPath(x, z)) || Math.abs(z - 2.43) < 0.35;
      const h = edgePath ? 0.08 + 0.1 * R() : (nearHouse ? 0.3 + 0.45 * R() : 0.14 + 0.28 * R());
      grassTuft(x, z, h, 0.72);
    };
    for (let i = 0; i < 4500; i++) lawn(-13 + 26 * R(), -2 + 12.5 * R());
    for (let i = 0; i < 9000; i++) { const sd = R() < 0.5 ? -1 : 1; lawn(sd * (1.55 + 6.5 * R()), 2.4 + 7 * R()); }   // what the camera sees
    // a few far tufts on the sides
    for (let i = 0; i < 700; i++) {
      const x = (R() < 0.5 ? -1 : 1) * (8 + 10 * R()), z = -9 + 9 * R();
      if (!insideHouse(x, z)) grassTuft(x, z, 0.3 + 0.4 * R(), 0.8);
    }
    // bare hydrangeas each side of the steps, rhododendrons under the bay window
    hydrangea(-2.05, 2.72, 0.95); hydrangea(2.08, 2.7, 0.85);
    rhodo(3.35, 1.4, 1.05); rhodo(5.0, 1.35, 0.95); rhodo(6.7, 0.9, 1.3);
    // sword ferns and dead bracken along the foundations
    for (const [x, z, s, d] of [[-7.9, 1.35, 0.7, 0], [-6.8, 1.3, 0.55, 1], [-5.9, 1.4, 0.65, 0], [-3.1, 1.35, 0.6, 1], [-2.75, 2.0, 0.5, 0],
      [-1.75, 3.15, 0.45, 1], [1.8, 3.2, 0.4, 0], [2.6, 1.15, 0.5, 1], [6.5, 1.6, 0.7, 0], [-9.3, 0.4, 0.8, 0], [-10.2, 2.2, 0.75, 1], [7.6, 2.4, 0.7, 1]]) fern(x, z, s, d);
    // blackberry tangle past the end of the railing
    bramble(-9.4, 2.4, 14); bramble(8.6, 0.8, 8);
    // bare big-leaf maple (left, mossy) and red alder (right)
    bareTree(-12.0, -2.2, 16, 0.42, 1); bareTree(10.6, -3.8, 13, 0.26, 2);
    // second-growth Douglas firs behind the house
    for (const [x, z, H] of [[-19, -12, 36], [-11, -15, 41], [-4, -13, 33], [3.5, -16, 44], [9, -12, 31], [15, -14, 38], [22, -10, 30], [-26, -7, 34],
      [-7, -22, 40], [12, -23, 42], [0, -27, 39], [-17, -24, 37], [19, -20, 35], [27, -16, 33], [-30, -15, 36]]) fir(x, z, H, H * (0.12 + 0.12 * R()), H * 0.13, 9);
    for (const [x, z, H] of [[11.5, 1.5, 6.5], [-14, -1, 7.5], [13.5, -1.5, 9]]) fir(x, z, H, 0.4, H * 0.24, 7);   // young firs / hemlocks
  }

  // ---------------- GLSL ----------------
  const HEAD = `#version 300 es
  precision highp float; precision highp int; precision highp sampler3D; precision highp sampler2DShadow; precision highp sampler2DArrayShadow;
  uniform sampler2D uNoise;
  float sq(float x) { return x * x; }
  uint hu(uint x) { x ^= x >> 16; x *= 0x7feb352du; x ^= x >> 15; x *= 0x846ca68bu; x ^= x >> 16; return x; }
  float h2(vec2 p) { uvec2 q = uvec2(ivec2(floor(p)) + ivec2(1048576)); return float(hu(q.x * 0x9E3779B1u ^ hu(q.y + 0x632BE5ABu))) * (1.0 / 4294967296.0); }
  // value noise from a mipmapped random texture (the mip chain filters detail that is finer than a pixel)
  float vn(vec2 p) { return texture(uNoise, p * (1.0 / 256.0)).r; }
  float fbm3(vec2 p) { return vn(p) * 0.57 + vn(p * 2.03 + 7.1) * 0.29 + vn(p * 4.1 + 3.3) * 0.14; }
  float fbm5(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * vn(p); p = p * 2.03 + 1.7; a *= 0.5; } return s / 0.97; }
  float aaf(float w) { return 1.0 - smoothstep(0.3, 0.9, w); }
  // cellular noise: x = F1, y = F2, z = id of the nearest cell
  vec3 cell2(vec2 p) {
    vec2 i = floor(p), f = fract(p); float d1 = 9.0, d2 = 9.0, id = 0.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(x, y), o = vec2(h2(i + g), h2(i + g + 17.3)), r = g + o - f; float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; id = h2(i + g + 5.1); } else if (d < d2) d2 = d;
    }
    return vec3(sqrt(d1), sqrt(d2), id);
  }
  `;

  const VS = `#version 300 es
  layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor; layout(location=2) in vec2 aUv; layout(location=3) in vec2 aAux; layout(location=4) in float aMat;
  uniform mat4 uVP;
  invariant gl_Position;
  out vec3 vPos; out vec3 vNor; out vec2 vUv; out vec2 vAux; flat out int vMat;
  void main() { vPos = aPos; vNor = aNor; vUv = aUv; vAux = aAux; vMat = int(aMat + 0.5); gl_Position = uVP * vec4(aPos, 1.0); }`;

  // cut-outs, shared by the depth pre-pass, the shadow map and the sky-visibility bake
  const CUTOUT = `
  bool cutout(int m, vec2 uv, vec3 p, vec2 aux) {
    if (m == 9) { return fract(uv.x * 22.0) > 0.55 && uv.y > 0.08 && uv.y < 0.88; }
    if (m == 15) { float x = abs(uv.x), y = uv.y, seg = fract(y * (aux.y > 0.5 ? 11.0 : 16.0));
      float leaf = (1.0 - y * 0.6) * (0.3 + 0.7 * smoothstep(0.0, 0.5, seg) * smoothstep(1.0, 0.6, seg));
      return x > 0.1 && x > leaf; }
    if (m == 16) { float rim = uv.y, fray = vn(vec2(uv.x * 14.0, rim * 3.0) + aux * 37.0); return rim > 0.6 && rim > 0.72 + 0.3 * fray; }
    if (m == 18) { float y = uv.y * 0.5 + 0.5; float w = sin(3.14159 * pow(y, 0.8)) * (aux.x > 0.5 ? 0.95 : 0.9); return abs(uv.x) > w; }
    if (m == 19) { vec3 f = cell2(uv * 4.5 + aux.x * 37.0);
      return length(uv) > 0.78 + 0.2 * vn(uv * 4.0 + aux * 50.0) || f.x > 0.36 + 0.12 * f.z; }
    return false;
  }`;
  const PRE_FS = HEAD + CUTOUT + `
  in vec3 vPos; in vec3 vNor; in vec2 vUv; in vec2 vAux; flat in int vMat; out vec4 o;
  void main() { if (cutout(vMat, vUv, vPos, vAux)) discard; o = vec4(0.0); }`;

  // ---- per-group material code; each sets Surf S ----
  const LIB = `
  in vec3 vPos; in vec3 vNor; in vec2 vUv; in vec2 vAux; flat in int vMat;
  struct Surf { vec3 alb; vec3 n; float spec; float gloss; float trans; float occ; float glass; vec3 inside; };
  // perturb a normal by the screen-space gradient of a height field (metres)
  vec3 bumpN(vec3 n, float h) {
    vec3 dpx = dFdx(vPos), dpy = dFdy(vPos); float dhx = dFdx(h), dhy = dFdy(h);
    vec3 r1 = cross(dpy, n), r2 = cross(n, dpx); float det = dot(dpx, r1);
    if (abs(det) < 1e-12) return n;
    vec3 g = sign(det) * (dhx * r1 + dhy * r2);
    return normalize(abs(det) * n - g);
  }
  `;

  // weathered wood with mottling, mildew, lichen, algae and peeling old paint
  const WOOD = `
  // a.x along the grain, a.y across it (metres); sh = shelter from rain (0 open, 1 under the porch roof)
  vec3 wood(vec2 a, vec3 p, float tone, float sh, float paintAmt, vec3 pcol, inout float h, out float wet) {
    float w = max(fwidth(a.y), 1e-4);
    float g1 = fbm3(vec2(a.x * 0.55, a.y * 26.0));
    float rings = mix(0.5, vn(vec2(a.x * 0.8, a.y * 120.0) + 3.0), aaf(w * 120.0));
    float fibre = mix(0.5, vn(vec2(a.x * 1.6, a.y * 300.0) + 9.0), aaf(w * 300.0));
    // exposed wood bleaches to silver-grey; under the porch roof it stays brown
    float silver = clamp(0.8 - 0.65 * sh + 0.5 * (fbm3(vec2(a.x * 0.35, a.y * 3.0) + p.z * 0.3) - 0.5), 0.0, 1.0);
    vec3 brown = mix(vec3(0.045, 0.031, 0.021), vec3(0.165, 0.112, 0.070), g1);
    vec3 grey = mix(vec3(0.070, 0.066, 0.060), vec3(0.235, 0.222, 0.200), g1);
    vec3 c = mix(brown, grey, silver) * tone * 0.8;
    c *= 0.75 + 0.5 * rings; c *= 0.85 + 0.3 * fibre;
    h += (g1 - 0.5) * 0.0012 + (rings - 0.5) * 0.0008 + (fibre - 0.5) * 0.0004;
    // splits along the grain
    float sy = a.y * 9.0 + 0.5 * vn(vec2(a.x * 0.7, a.y * 3.0));
    float split = (1.0 - smoothstep(0.0, max(0.025, fwidth(sy) * 1.3), abs(fract(sy) - 0.5))) * step(0.68, vn(vec2(a.x * 1.2, floor(sy) * 3.7)));
    c *= 1.0 - 0.6 * split * aaf(w * 9.0); h -= split * 0.0015;
    // 斑驳: large blotches of lighter and darker weathering
    float mot = fbm3(vec2(p.x + p.z, p.y) * 1.4 + 3.0);
    c *= 0.62 + 0.75 * mot;
    // runoff streaks under sills and eaves, black mildew colonies
    float st = smoothstep(0.5, 0.85, vn(vec2((p.x + p.z) * 6.0, p.y * 0.3) + 11.0)) * (1.0 - 0.7 * sh);
    c *= 1.0 - 0.45 * st;
    float mil = smoothstep(0.58, 0.78, fbm3(vec2(p.x + p.z, p.y) * 3.3 + 21.0));
    mil *= 0.55 + 0.45 * smoothstep(0.4, 0.7, vn(vec2(p.x + p.z, p.y) * 28.0));
    c = mix(c, vec3(0.022, 0.022, 0.019), mil * 0.75);
    // pale grey-green lichen rosettes on exposed wood
    vec2 lq = vec2(p.x + p.z, p.y);
    float lich = smoothstep(0.7, 0.78, fbm3(lq * 6.0 + 2.0)) * smoothstep(0.35, 0.7, vn(lq * 45.0 + 9.0)) * (1.0 - sh);
    c = mix(c, vec3(0.16, 0.17, 0.135), lich * 0.45); h += lich * 0.0003;
    // green algae and moss low down, where splash-back keeps the wood damp
    float low = smoothstep(0.9, 0.05, p.y) * smoothstep(0.35, 0.75, fbm3(vec2(p.x + p.z, p.y) * 3.0 + 5.0));
    c = mix(c, c * vec3(0.5, 0.68, 0.42), low);
    c *= 1.0 - 0.5 * smoothstep(0.5, 0.0, p.y) * (0.6 + 0.4 * vn(vec2(p.x + p.z, p.y) * 8.0));   // mud splash and grime at the bottom
    wet = low * 0.7 + st * 0.3;
    // remnants of old paint, peeled into curled flakes with cracks between them
    vec2 pq = vec2(p.x + p.z, p.y);
    // paint lets go across the grain first, so what is left survives as ragged strips along it
    float survive = fbm3(vec2(a.x * 1.3, a.y * 11.0) + 30.0) * 0.6 + fbm3(pq * 1.1 + 8.0) * 0.4 + vn(vec2(a.x * 6.0, a.y * 40.0)) * 0.12 - (0.85 - 0.38 * paintAmt);
    float keep = smoothstep(0.0, max(0.012, fwidth(survive) * 1.5), survive);
    float paint = 0.0, edge = 0.0;
    if (keep > 0.0) {
      vec3 fl = cell2(a * vec2(9.0, 30.0) + 4.0);       // checking: cracks mostly across the strips
      float cw = max(0.01, fwidth(fl.y - fl.x) * 1.2);
      float crack = (1.0 - smoothstep(0.0, cw, fl.y - fl.x)) * aaf(w * 30.0) * 0.7;
      float lost = step(0.82, fl.z) * smoothstep(0.0, 0.06, survive);   // single flakes already fallen out
      paint = keep * (1.0 - 0.85 * crack) * (1.0 - lost);
      edge = keep * (1.0 - smoothstep(0.0, 0.035, survive)) * 0.6;
    }
    vec3 pc = pcol * (0.62 + 0.4 * fbm3(pq * 5.0)) * (1.0 - 0.55 * mil) * (1.0 - 0.35 * st);
    pc = mix(pc, pc * vec3(0.85, 0.82, 0.7), low);   // yellowed and dirty low down
    pc = mix(pc, c * 1.6, 0.3);                      // chalked, dirt ground into the paint film
    c = mix(c, pc, paint);
    c *= 1.0 - 0.35 * edge;
    h += paint * 0.0004;
    return c;
  }
  float edgeWear(vec2 uv) {
    vec2 px = min(uv, 1.0 - uv) / max(fwidth(uv), vec2(1e-5));
    float e = min(px.x, px.y);
    return 1.0 + 0.25 * (1.0 - smoothstep(0.5, 2.5, e)) - 0.12 * smoothstep(2.5, 6.0, e) * (1.0 - smoothstep(6.0, 14.0, e));
  }
  float shelter(vec3 p) {   // under the porch roof / deep eaves
    float porch = step(-2.4, p.x) * step(p.x, 2.4) * step(p.z, 2.5) * step(p.y, 3.5);
    return clamp(porch * (0.55 + 0.45 * smoothstep(2.3, 0.0, p.z)), 0.0, 1.0);
  }
  `;
  const PAINT_W = 'vec3(0.29, 0.28, 0.25)';   // old off-white house paint

  const MAT = [
    // ---------------- 0: wood ----------------
    LIB + WOOD + `
  void material(inout Surf S) {
    vec3 p = vPos; float h = 0.0, wet; float sh = shelter(p);
    if (vMat == 0) {   // clapboard siding
      float y = p.y / 0.19, f = fract(y), row = floor(y), along = p.x + p.z;
      float bl = 2.2 + 1.4 * h2(vec2(row, 3.0)), off = h2(vec2(row, 7.0));
      float seg = floor(along / bl + off), joint = abs(fract(along / bl + off) - 0.5) * bl;
      S.alb = wood(vec2(along + seg * 5.3, p.y + seg * 0.37), p, 0.8 + 0.35 * h2(vec2(row, seg)), sh, 0.05 + 0.3 * sh, ${PAINT_W}, h, wet);
      float fw = fwidth(y);
      // each board is thicker at its butt (bottom); the butt of the board above overhangs this one
      h += 0.014 * (1.0 - f) * smoothstep(0.0, max(0.04, fw * 2.0), f);
      S.occ = mix(0.55, 1.0, smoothstep(0.0, max(0.06, fw * 2.0), f)) * mix(1.0, 0.7, smoothstep(0.75, 1.0, f));
      S.alb *= joint > bl * 0.5 - 0.01 ? 0.45 : 1.0;
      S.alb *= 1.0 - 0.3 * step(0.9, h2(vec2(row, seg + 11.0))) * (1.0 - f);   // the odd warped board
      S.alb *= f < 0.035 ? 0.5 : 1.0;
      S.gloss = 10.0; S.spec = 0.02 + 0.05 * wet;
    } else if (vMat == 1 || vMat == 11) {   // trim boards, columns, deck sides, steps
      float across = vMat == 11 ? p.x + p.z : (abs(vNor.y) > 0.5 ? p.z : p.y);
      vec2 a = vMat == 11 ? vec2(p.y, across) : vec2(p.x + p.z, across);
      S.alb = wood(a, p, 1.0, sh, (0.25 + 0.3 * sh) * smoothstep(0.45, 0.9, p.y), ${PAINT_W}, h, wet) * edgeWear(vUv);
      S.gloss = 12.0; S.spec = 0.02 + 0.06 * wet;
    } else if (vMat == 8) {   // porch floor and step treads: grey boards, worn path, fallen leaves, grit
      float b = p.x / 0.12, bi = floor(b), bf = fract(b);
      S.alb = wood(vec2(p.z + bi * 3.1, p.x), p, 0.75 + 0.3 * h2(vec2(bi, 2.0)), 0.3, 0.0, ${PAINT_W}, h, wet);
      float fw = fwidth(b);
      S.alb *= mix(0.25, 1.0, smoothstep(0.03, 0.03 + fw * 1.5 + 0.02, bf) * smoothstep(0.03, 0.03 + fw * 1.5 + 0.02, 1.0 - bf));
      h += 0.003 * sin(3.14159 * bf);                    // cupped boards
      float worn = exp(-sq(p.x / 0.6)) * smoothstep(0.0, 1.5, p.z);
      S.alb = mix(S.alb, S.alb * 1.25 + 0.01, worn * 0.4);
      // leaves blown under the porch, piled against the wall and in corners
      vec3 lc = cell2(p.xz * vec2(5.5, 7.0) + 13.0);
      float pile = smoothstep(1.3, 0.2, p.z) * 0.6 + smoothstep(1.6, 2.25, abs(p.x)) * 0.5 + (p.y < 0.4 ? 0.45 : 0.0);
      float leaf = step(1.0 - 0.6 * pile, lc.z) * smoothstep(0.42, 0.28, lc.x);
      vec3 lcol = mix(vec3(0.16, 0.085, 0.03), vec3(0.24, 0.15, 0.05), h2(vec2(lc.z * 97.0, 1.0))) * (0.6 + 0.6 * vn(p.xz * 40.0));
      S.alb = mix(S.alb, lcol, leaf); h += leaf * 0.002;
      S.gloss = 14.0; S.spec = 0.03;
    } else {   // 9: railing slats
      S.alb = wood(vec2(p.y, p.x), p, 0.95, 0.0, 0.25, ${PAINT_W}, h, wet);
      S.gloss = 10.0; S.spec = 0.02;
    }
    S.n = bumpN(S.n, h);
  }`,
    // ---------------- 1: door, sash windows, bay window ----------------
    LIB + WOOD + `
  // old glass: dark interior with curtains, grime toward the edges, faint waviness
  void glassy(inout Surf S, vec2 q, vec3 inside) {
    S.glass = 1.0; S.spec = 1.0; S.gloss = 6000.0;
    float grime = smoothstep(0.25, 0.5, max(abs(q.x - 0.5), abs(q.y - 0.5))) * 0.6 + 0.4 * fbm3(q * 7.0 + vPos.xy * 3.0);
    S.alb = vec3(0.05, 0.048, 0.04) * grime;     // dirt film on the glass catches light
    S.inside = inside;
    S.n = normalize(S.n + vec3(vn(vPos.xy * 6.0) - 0.5, vn(vPos.xy * 6.0 + 40.0) - 0.5, 0.0) * 0.006);
  }
  void material(inout Surf S) {
    vec3 p = vPos; vec2 q = vUv; float h = 0.0, wet; float sh = shelter(p);
    if (vMat == 2) {   // arched door with glass upper half: old dark green paint mostly peeled off
      S.alb = wood(vec2(p.y, q.x * 1.5), p, 0.75, sh, 0.55, vec3(0.08, 0.13, 0.09), h, wet);
      if (q.y > 0.07 && q.y < 0.33 && q.x > 0.14 && q.x < 0.86) {
        float b = min(min(q.y - 0.07, 0.33 - q.y) * 3.0, min(q.x - 0.14, 0.86 - q.x));
        S.alb *= b < 0.03 ? 0.6 : 0.95; h -= b < 0.03 ? 0.004 : 0.0;
      }
      float r = 0.36; vec2 c = vec2(0.5, 0.78);
      bool inArch = (q.y > 0.42 && q.y < 0.78 && abs(q.x - 0.5) < r) || (q.y >= 0.78 && length((q - c) * vec2(1.0, 1.55)) < r);
      if (inArch) {
        float gx = abs(fract((q.x - 0.14) / 0.24) - 0.5), gy = abs(fract((q.y - 0.42) / 0.12) - 0.5);
        if (gx > 0.45 || gy > 0.43) { S.alb *= 1.1; }
        else {
          float curtain = 0.5 + 0.5 * sin(q.x * 70.0 + fbm3(q * 9.0) * 4.0);
          glassy(S, vec2(fract((q.x - 0.14) / 0.24), fract((q.y - 0.42) / 0.12)), vec3(0.012) + vec3(0.07, 0.062, 0.05) * curtain * smoothstep(0.5, 0.95, q.y));
          return;
        }
      }
      S.n = bumpN(S.n, h); return;
    }
    if (vMat == 3) {   // sash window, 2x3 panes
      float fx = abs(fract(q.x * 2.0) - 0.5), fy = abs(fract(q.y * 3.0) - 0.5);
      if (q.x < 0.05 || q.x > 0.95 || q.y < 0.04 || q.y > 0.96 || fx > 0.46 || fy > 0.44) {
        S.alb = wood(vec2(p.x + p.y, p.y + p.x), p, 1.1, sh, 0.5, ${PAINT_W}, h, wet); S.n = bumpN(S.n, h); return;
      }
      float curtain = smoothstep(0.35, 0.0, abs(q.x - 0.18)) + smoothstep(0.3, 0.0, abs(q.x - 0.84));
      glassy(S, vec2(fract(q.x * 2.0), fract(q.y * 3.0)), vec3(0.006) + vec3(0.06, 0.055, 0.045) * curtain * (0.6 + 0.4 * sin(q.x * 90.0)));
      // one cracked pane
      if (q.x > 0.5 && q.y < 0.33 && vPos.z > 0.5) { float cr = abs(vn(q * 30.0) - 0.5); S.alb += vec3(0.25) * (1.0 - smoothstep(0.0, 0.02, cr)) * step(0.4, q.y * 3.0); }
      return;
    }
    // 4: tall twin gothic-arch bay window
    float lx = fract(q.x * 2.0), side = step(0.5, q.x), top = 0.80;
    bool inL = (q.y < top && abs(lx - 0.5) < 0.42) || (q.y >= top && length((vec2(lx, q.y) - vec2(0.5, top)) * vec2(1.0, 2.2)) < 0.42);
    float gx = abs(fract(lx * 2.0) - 0.5), gy = abs(fract(q.y * 6.0) - 0.5);
    if (!inL || q.y < 0.03 || (gx > 0.47 && q.y < top) || gy > 0.46) {
      S.alb = wood(vec2(p.y, p.x + p.z), p, 1.05, sh, 0.45, ${PAINT_W}, h, wet); S.n = bumpN(S.n, h); return;
    }
    vec3 inside = vec3(0.008, 0.009, 0.01);
    float shelf = step(0.82, fract(q.y * 9.0)), books = step(0.4, h2(vec2(floor(q.x * 60.0), floor(q.y * 9.0))));
    inside += vec3(0.045, 0.032, 0.022) * books * (1.0 - shelf) * step(q.y, 0.7) * (0.5 + h2(vec2(floor(q.x * 60.0), 3.0)));
    vec2 lp = vec2((q.x - 0.80) * 1.2, q.y - 0.27);
    if (side > 0.5 && lp.y > 0.0 && lp.y < 0.07 && abs(lp.x) < 0.06 - lp.y * 0.45) inside = vec3(0.13, 0.105, 0.075);
    glassy(S, vec2(fract(lx * 2.0), fract(q.y * 6.0)), inside);
  }`,
    // ---------------- 2: ground and path ----------------
    LIB + `
  // fallen big-leaf maple leaves: large, lobed, brown to ochre, darker and glossy when wet
  float leafLitter(vec2 xz, float dens, out vec3 col, out float hgt) {
    float acc = 0.0; col = vec3(0.0); hgt = 0.0;
    for (int k = 0; k < 2; k++) {
      vec2 q = xz * (k == 0 ? 5.5 : 9.0) + float(k) * 31.0;
      vec2 ci = floor(q), cf = fract(q);
      float id = h2(ci + 5.1), ang = id * 40.0, cs = cos(ang), sn = sin(ang);
      vec2 o = (cf - vec2(0.3 + 0.4 * h2(ci), 0.3 + 0.4 * h2(ci + 17.3))) * mat2(cs, -sn, sn, cs);
      o.y *= 1.35;                                                   // longer than wide
      float th = atan(o.y, o.x), rr = length(o);
      // five-lobed maple outline, curled and torn; most are half rotted by mid-November
      float r = (0.2 + 0.08 * h2(ci + 3.0)) * (0.72 + 0.28 * pow(abs(cos(th * 2.5)), 0.6)) * (0.8 + 0.4 * vn(q * 6.0 + id * 50.0));
      vec3 lc = vec3(rr, 0.0, id);
      float m = step(1.0 - dens, id) * smoothstep(r, r - 0.025, rr) * step(0.0, 0.4 - max(abs(o.x), abs(o.y)));
      vec3 c = mix(vec3(0.085, 0.05, 0.022), vec3(0.20, 0.12, 0.045), h2(vec2(lc.z * 97.0, float(k))));
      c = mix(c, vec3(0.05, 0.035, 0.02), step(0.7, h2(vec2(lc.z * 53.0, 9.0))));   // rotting black ones
      c *= 0.75 + 0.5 * vn(xz * 45.0);
      float vein = 1.0 - smoothstep(0.0, 0.08, abs(fract(th * 0.796 + 0.5) - 0.5));
      c *= 1.0 - 0.15 * vein;
      col = mix(col, c, m); acc = max(acc, m); hgt = max(hgt, m * 0.002);
    }
    return acc;
  }
  void material(inout Surf S) {
    vec3 p = vPos; vec2 xz = p.xz; float h = 0.0;
    if (vMat == 5) {   // ground under the lawn: thatch, moss, mud, leaf litter
      float g = fbm3(xz * 1.2), m = smoothstep(0.45, 0.7, fbm3(xz * 0.7 + 9.0));
      vec3 c = mix(vec3(0.085, 0.07, 0.042), vec3(0.17, 0.14, 0.08), g);   // flattened dead grass / thatch
      c = mix(c, vec3(0.045, 0.055, 0.028), m * 0.45);                       // moss
      float mud = smoothstep(0.62, 0.75, fbm3(xz * 0.9 + 21.0));
      c = mix(c, vec3(0.045, 0.036, 0.028), mud);
      c *= 0.75 + 0.5 * vn(xz * 30.0);
      vec3 lc; float lh;
      float dens = 0.18 + 0.35 * smoothstep(5.0, 0.0, length(xz - vec2(-11.0, -2.0)) * 0.5) + 0.15 * smoothstep(3.6, 2.0, p.z);
      float lf = leafLitter(xz, dens, lc, lh);
      S.alb = mix(c, lc, lf); h += lh + (g - 0.5) * 0.01;
      S.spec = 0.02 + 0.08 * (mud + lf * 0.5); S.gloss = 30.0;
    } else {           // concrete slabs: stained, cracked, moss in the joints, leaves stuck to them
      vec2 s = xz / vec2(1.4, 1.1);
      float j = min(abs(fract(s.x) - 0.5), abs(fract(s.y) - 0.5));
      vec3 c = mix(vec3(0.075, 0.075, 0.07), vec3(0.17, 0.165, 0.155), fbm3(xz * 1.6)) * (0.8 + 0.35 * vn(xz * 14.0));
      c *= 0.82 + 0.25 * h2(floor(s));
      c = mix(c, vec3(0.05, 0.05, 0.045), smoothstep(0.5, 0.7, fbm3(xz * 2.6 + 11.0)) * 0.7);   // damp, dark patches
      vec3 lc0 = cell2(xz * 9.0 + 3.0);
      float lich = step(0.9, lc0.z) * smoothstep(0.3, 0.15, lc0.x);
      c = mix(c, vec3(0.22, 0.22, 0.17), lich * 0.6);
      float fw = fwidth(s.x) + fwidth(s.y);
      float joint = smoothstep(0.475 - fw, 0.49, j);
      c = mix(c, vec3(0.03, 0.05, 0.02), joint * 0.9);
      float crack = (1.0 - smoothstep(0.0, 0.012 + fw * 0.3, abs(vn(xz * 3.0 + floor(s) * 7.0) - 0.5))) * step(0.5, h2(floor(s) + 4.0));
      c = mix(c, vec3(0.02), crack * 0.8); h -= crack * 0.003 + joint * 0.004;
      float edge = smoothstep(1.2, 1.6, abs(p.x)) * step(2.9, p.z) + 0.3;
      vec3 lc; float lh; float lf = leafLitter(xz, 0.06 + 0.2 * edge, lc, lh);
      S.alb = mix(c, lc, lf); h += lh;
      S.spec = 0.05 + 0.1 * smoothstep(0.5, 0.7, fbm3(xz * 2.6 + 11.0)); S.gloss = 40.0;
    }
    S.n = bumpN(S.n, h);
  }`,
    // ---------------- 3: roof ----------------
    LIB + `
  void material(inout Surf S) {
    // old asphalt shingles, curling at the edges, thick with moss (Coast Range rain), needles and leaf debris
    vec3 p = vPos; float along = p.x + p.z * 0.0001;
    float rowF = p.y / 0.12, row = floor(rowF), f = fract(rowF);
    float tab = fract(along / 0.33 + h2(vec2(row, 1.0)) * 0.5), tabId = floor(along / 0.33 + h2(vec2(row, 1.0)) * 0.5);
    vec3 c = mix(vec3(0.055, 0.052, 0.05), vec3(0.12, 0.11, 0.10), h2(vec2(row, tabId)));
    c *= 0.8 + 0.4 * vn(vec2(along, p.y) * 30.0);
    float fw = fwidth(rowF);
    float h = 0.006 * (1.0 - f) + 0.004 * smoothstep(0.0, 0.1, f) - 0.004;
    c *= mix(0.45, 1.0, smoothstep(0.0, max(0.08, fw * 2.0), f));
    c *= 1.0 - 0.5 * (1.0 - smoothstep(0.0, max(0.02, fwidth(tab) * 1.5), min(tab, 1.0 - tab))) * step(0.4, f);
    // moss: fuzzy, raised clumps along the shingle butts, heavier low on the slopes
    float mz = fbm3(vec2(along, p.y) * 2.5 + 7.0) + 0.25 * smoothstep(7.0, 4.0, p.y);
    float moss = smoothstep(0.52, 0.7, mz) * (0.6 + 0.4 * smoothstep(0.6, 0.0, f));
    vec3 mc = mix(vec3(0.035, 0.055, 0.02), vec3(0.08, 0.10, 0.035), vn(vec2(along, p.y) * 60.0));
    c = mix(c, mc, moss); h += moss * 0.01 * vn(vec2(along, p.y) * 25.0);
    float deb = step(0.82, vn(vec2(along, p.y) * 14.0)) * 0.7;
    c = mix(c, vec3(0.13, 0.07, 0.03), deb);
    S.alb = c; S.spec = 0.03; S.gloss = 20.0;
    S.n = bumpN(S.n, h);
  }`,
    // ---------------- 4: grass ----------------
    LIB + `
  void material(inout Surf S) {
    float dead = vAux.y, r = h2(vec2(vAux.x * 997.0, 3.0));
    vec3 straw = mix(vec3(0.20, 0.16, 0.085), vec3(0.30, 0.25, 0.14), r);
    vec3 green = mix(vec3(0.05, 0.075, 0.03), vec3(0.08, 0.11, 0.04), r);
    float y = vUv.y;
    vec3 c = dead > 0.5 ? mix(green * 0.8, straw, smoothstep(0.0, 0.35, y)) : mix(green * 0.6, green, y);
    c *= 0.45 + 0.65 * y;                      // dark, damp base of each tuft
    S.alb = c; S.trans = 0.35; S.spec = 0.05; S.gloss = 25.0;
    S.occ = 0.35 + 0.65 * smoothstep(0.0, 0.8, y);
  }`,
    // ---------------- 5: ferns, leaves, flower heads ----------------
    LIB + `
  void material(inout Surf S) {
    float r = h2(vec2(vAux.x * 997.0, 5.0));
    if (vMat == 15) {
      S.alb = vAux.y > 0.5 ? mix(vec3(0.17, 0.085, 0.035), vec3(0.24, 0.13, 0.05), r) : mix(vec3(0.03, 0.065, 0.022), vec3(0.05, 0.095, 0.03), r);
      S.trans = vAux.y > 0.5 ? 0.15 : 0.3; S.spec = vAux.y > 0.5 ? 0.02 : 0.08; S.gloss = 40.0;
      S.alb *= 0.7 + 0.3 * smoothstep(0.0, 0.5, vUv.y);
    } else if (vMat == 18) {
      if (vAux.x < 0.5) {   // rhododendron: dark, leathery, glossy; a few yellowing
        S.alb = mix(vec3(0.025, 0.05, 0.02), vec3(0.04, 0.075, 0.03), r);
        S.alb = mix(S.alb, vec3(0.20, 0.17, 0.05), step(0.93, vAux.y));
        S.spec = 0.25; S.gloss = 70.0; S.trans = 0.1;
      } else {              // blackberry leaves hanging on: purple-green, blotched
        S.alb = mix(vec3(0.05, 0.035, 0.03), vec3(0.07, 0.06, 0.03), r); S.spec = 0.08; S.gloss = 40.0; S.trans = 0.2;
      }
      float mid = 1.0 - smoothstep(0.0, 0.08, abs(vUv.x));
      S.alb *= 1.0 - 0.25 * mid;
    } else {                // dried hydrangea heads: papery, tan to rust, some silvery
      vec3 f = cell2(vUv * 4.5 + vAux.x * 37.0);
      S.alb = mix(vec3(0.12, 0.085, 0.055), vec3(0.22, 0.15, 0.09), f.z) * (0.6 + 0.5 * smoothstep(0.4, 0.0, f.x));
      S.trans = 0.3; S.spec = 0.02; S.gloss = 10.0;
    }
  }`,
    // ---------------- 6: bark, twigs, canes ----------------
    LIB + `
  void material(inout Surf S) {
    float kind = vAux.x; vec2 q = vec2(vUv.x * 6.0, vUv.y * 1.3); float h = 0.0;
    if (kind < 0.5) {         // Douglas fir: deep furrowed dark brown bark
      float fur = vn(vec2(vUv.x * 20.0, vUv.y * 0.7 + vAux.y * 30.0));
      S.alb = vec3(0.07, 0.052, 0.04) * (0.5 + 0.8 * fur); h = fur * 0.02;
    } else if (kind < 1.5) {  // big-leaf maple: grey-brown bark wrapped in moss and licorice ferns
      float moss = smoothstep(0.35, 0.65, fbm3(q + vAux.y * 9.0)) * smoothstep(12.0, 0.0, vPos.y) + 0.25;
      S.alb = mix(vec3(0.05, 0.045, 0.04) * (0.7 + 0.5 * vn(q * 3.0)), vec3(0.03, 0.05, 0.02) * (0.6 + 0.6 * vn(q * 9.0)), clamp(moss, 0.0, 1.0));
      h = moss * 0.01 * vn(q * 12.0);
    } else if (kind < 2.5) {  // red alder: pale, blotched with white lichen
      float l = fbm3(vec2(vUv.x * 5.0, vUv.y * 2.0) + vAux.y * 17.0);
      S.alb = mix(vec3(0.17, 0.17, 0.155), vec3(0.36, 0.36, 0.33), smoothstep(0.35, 0.65, l));
      S.alb *= 1.0 - 0.55 * smoothstep(0.72, 0.82, vn(vec2(vUv.x * 9.0, vUv.y * 9.0) + 2.0));
      S.alb = mix(S.alb, vec3(0.04, 0.07, 0.03), smoothstep(1.5, 0.0, vPos.y) * 0.7);
    } else if (kind < 3.5) {  // shrub twigs: grey
      S.alb = vec3(0.10, 0.09, 0.08) * (0.7 + 0.5 * vAux.y);
    } else {                  // blackberry canes: dull red-brown
      S.alb = vec3(0.10, 0.045, 0.035);
    }
    S.spec = 0.02; S.gloss = 10.0;
    S.n = bumpN(S.n, h);
  }`,
    // ---------------- 7: fir foliage ----------------
    LIB + `
  void material(inout Surf S) {
    float tone = 0.7 + 0.6 * h2(vec2(vAux.x * 997.0, 1.0));
    float needles = mix(0.5, vn(vPos.xz * 7.0 + vPos.y * 5.0), aaf(length(fwidth(vPos)) * 7.0));
    S.alb = vec3(0.028, 0.045, 0.026) * tone * (0.6 + 0.8 * needles) * (vUv.y > 0.1 ? 1.0 : 0.6);
    S.trans = 0.25; S.spec = 0.03; S.gloss = 15.0;
  }`,
  ];

  // lighting, shared by all material groups
  const MAIN = `
  uniform vec3 uCam, uCamF, uFlashPos, uLamp, uAOmin, uAOsize;
  uniform float uFlash, uSky, uLampI, uFogK;
  uniform highp sampler3D uAO;
  uniform highp sampler2DShadow uShadow;
  uniform mat4 uLampVP;
  layout(location=0) out vec4 oCol;
  const vec3 LAMP_C = vec3(1.0, 0.60, 0.27);     // high-pressure sodium
  const vec3 FLASH_C = vec3(1.0, 0.95, 0.88);
  const vec3 SKY_C = vec3(0.78, 0.82, 0.95);
  float lampShadow(vec3 p) {
    vec4 c = uLampVP * vec4(p, 1.0); vec3 q = c.xyz / c.w * 0.5 + 0.5;
    if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0 || c.w < 0.0) return 1.0;
    float s = 0.0, tx = 1.0 / 2048.0;
    for (int i = 0; i < 5; i++) {
      vec2 o = i == 0 ? vec2(0) : vec2(i == 1 ? 1.0 : (i == 2 ? -1.0 : 0.0), i == 3 ? 1.0 : (i == 4 ? -1.0 : 0.0)) * 1.2;
      s += texture(uShadow, vec3(q.xy + o * tx, q.z - 0.0008));
    }
    return s / 5.0;
  }
  float flashCone(vec3 dir) { float c = dot(dir, uCamF); return mix(0.12, 1.0, smoothstep(0.72, 0.985, c)) * step(0.0, c); }
  void main() {
    vec3 n = normalize(vNor);
    vec3 V = uCam - vPos; float dist = length(V); V /= dist;
    if (vMat >= 12 && dot(n, V) < 0.0) n = -n;
    Surf S = Surf(vec3(0.5), n, 0.03, 10.0, 0.0, 1.0, 0.0, vec3(0.0));
    material(S);
    n = S.n;
    // sky light, occluded by the house and trees (baked visibility volume)
    float vis = texture(uAO, (vPos + vNor * 0.17 - uAOmin) / uAOsize).r;
    vis = vis * (0.6 + 0.4 * vis);
    vec3 Eamb = SKY_C * uSky * 3.14159 * (0.6 + 0.4 * n.y) * vis * S.occ;
    // sodium yard light
    vec3 Ld = uLamp - vPos; float ld2 = dot(Ld, Ld); vec3 l = Ld * inversesqrt(ld2);
    float shl = lampShadow(vPos + vNor * 0.03);
    float El = uLampI / ld2 * shl;
    float ndl = dot(n, l);
    // phone LED flash
    vec3 Fd = uFlashPos - vPos; float fd2 = max(dot(Fd, Fd), 0.05); vec3 fl = Fd * inversesqrt(fd2);
    float Ef = uFlash / fd2 * flashCone(-fl);
    float ndf = dot(n, fl);
    vec3 diff = S.alb / 3.14159 * (Eamb + LAMP_C * El * (max(ndl, 0.0) + S.trans * max(-ndl, 0.0)) * mix(1.0, S.occ, 0.5)
              + FLASH_C * Ef * (max(ndf, 0.0) + S.trans * max(-ndf, 0.0)) * mix(1.0, S.occ, 0.3));
    // flash light bouncing off the porch floor / ground onto nearby surfaces
    diff += S.alb / 3.14159 * FLASH_C * Ef * 0.12 * vis * S.occ;
    // specular (normalised Blinn-Phong) with Schlick fresnel
    vec3 spec = vec3(0.0);
    vec3 hl = normalize(l + V), hf = normalize(fl + V);
    float nv = max(dot(n, V), 0.0), fr = S.spec + (1.0 - S.spec) * pow(1.0 - nv, 5.0) * (S.glass > 0.5 ? 1.0 : 0.25);
    float norm_ = min((S.gloss + 8.0) / 25.13, 30.0);
    spec += LAMP_C * El * max(ndl, 0.0) * pow(max(dot(n, hl), 0.0), S.gloss) * norm_ * fr;
    if (S.glass > 0.5) {
      // the LED is a tiny source: its mirror image in the glass is a small hard dot (the post bloom adds the glow)
      float ca = dot(reflect(-V, n), fl), ang2 = max(2.0 * (1.0 - ca), 0.0);
      spec += FLASH_C * Ef * max(ndf, 0.0) * fr * (30.0 * exp(-ang2 / 1.6e-5) + 0.15 * exp(-ang2 / 6e-4));
    } else {
      spec += FLASH_C * Ef * max(ndf, 0.0) * pow(max(dot(n, hf), 0.0), S.gloss) * norm_ * fr;
    }
    vec3 L = diff * (1.0 - S.glass * 0.92) + spec;
    if (S.glass > 0.5) {
      // reflection of the overcast sky and the dark tree line, and the dim room behind
      vec3 r = reflect(-V, n);
      float skyR = smoothstep(-0.05, 0.4, r.y) * 0.9;
      L += SKY_C * uSky * skyR * (0.04 + 0.96 * pow(1.0 - nv, 5.0)) * 0.6;
      L += S.inside * (Eamb * 0.15 + FLASH_C * Ef * 0.08 + LAMP_C * El * 0.1) * (1.0 - fr);
    }
    // mist: extinction, sky airlight, and LED flash back-scatter between the lens and the surface
    float T = exp(-uFogK * dist);
    L = L * T + SKY_C * uSky * 0.35 * (1.0 - T) + LAMP_C * uLampI * 0.0004 * (1.0 - T);
    L += FLASH_C * uFlash * flashCone(-V) * uFogK * 0.004 * (1.0 / 0.7 - 1.0 / max(dist, 0.7));
    oCol = vec4(L, 1.0);
  }`;

  const VS_FS = `#version 300 es
  layout(location=0) in vec2 aP; out vec2 vUv;
  void main() { vUv = aP * 0.5 + 0.5; gl_Position = vec4(aP, 1.0, 1.0); }`;

  const SKY_FS = HEAD + `
  in vec2 vUv; out vec4 oCol;
  uniform mat4 uInvVP; uniform vec3 uCam, uCamF; uniform float uSky, uFlash, uFogK, uLampI;
  const vec3 SKY_C = vec3(0.78, 0.82, 0.95);
  void main() {
    vec4 a = uInvVP * vec4(vUv * 2.0 - 1.0, -1.0, 1.0), b = uInvVP * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
    vec3 d = normalize(b.xyz / b.w - a.xyz / a.w);
    // low overcast: cloud base faintly lit by the glow of Vernonia and Portland, brighter toward the horizon
    vec2 cp = d.xz / (max(d.y, 0.0) + 0.12) * 1.3 + vec2(7.0, 3.0);
    float cl = fbm5(cp * 0.5);
    float glow = exp(-max(d.y, 0.0) * 4.0);
    vec3 c = mix(SKY_C, vec3(0.9, 0.8, 0.7), glow * 0.2 * (0.5 + 0.5 * smoothstep(-0.5, 0.8, d.x)));
    c *= (0.55 + 0.45 * glow) * (0.65 + 0.7 * cl);
    vec3 L = c * uSky;
    L += vec3(1.0, 0.95, 0.88) * uFlash * smoothstep(0.62, 0.95, dot(d, uCamF)) * uFogK * 0.004 / 0.7;
    L += vec3(1.0, 0.6, 0.27) * uLampI * 0.0004;
    oCol = vec4(L, 1.0);
  }`;

  // sky-visibility bake: for one z-slice of the volume, the fraction of 32 directions that reach the sky
  const BAKE_FS = `#version 300 es
  precision highp float; precision highp sampler2DArrayShadow;
  in vec2 vUv; out vec4 o;
  uniform highp sampler2DArrayShadow uMaps; uniform mat4 uDirVP[32]; uniform float uW[32];
  uniform vec3 uAOmin, uAOsize; uniform float uZ;
  void main() {
    vec3 p = uAOmin + vec3(vUv.x, vUv.y, uZ) * uAOsize;
    float v = 0.0, ws = 0.0;
    for (int k = 0; k < 32; k++) {
      vec4 c = uDirVP[k] * vec4(p, 1.0); vec3 q = c.xyz * 0.5 + 0.5;
      float s = (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) ? 1.0 : texture(uMaps, vec4(q.xy, float(k), q.z - 0.004));
      v += s * uW[k]; ws += uW[k];
    }
    o = vec4(v / ws, 0.0, 0.0, 1.0);
  }`;

  const DOWN_FS = `#version 300 es
  precision highp float; in vec2 vUv; uniform sampler2D uSrc; uniform vec2 uTexel; out vec4 oCol;
  void main() {
    vec3 c = texture(uSrc, vUv + uTexel * vec2(-1, -1)).rgb + texture(uSrc, vUv + uTexel * vec2(1, -1)).rgb
           + texture(uSrc, vUv + uTexel * vec2(-1, 1)).rgb + texture(uSrc, vUv + uTexel * vec2(1, 1)).rgb;
    oCol = vec4(c * 0.25, 1.0);
  }`;

  // phone image pipeline: exposure, local tone mapping, white balance, bloom, tone curve, sharpening, noise
  const POST_FS = `#version 300 es
  precision highp float; precision highp int;
  in vec2 vUv; out vec4 oCol;
  uniform sampler2D uHdr, uB1, uB2, uB3, uB4, uB5;
  uniform vec2 uRes; uniform float uGain, uLocal, uGrain, uDesat, uSeed, uSharp; uniform vec3 uWB;
  uint hu(uint x) { x ^= x >> 16; x *= 0x7feb352du; x ^= x >> 15; x *= 0x846ca68bu; x ^= x >> 16; return x; }
  float hf(vec2 p, float k) { uvec2 q = uvec2(ivec2(floor(p)) + 4096); return float(hu(q.x * 1973u + q.y * 9277u + uint(k) * 26699u)) / 4294967296.0; }
  float gn(vec2 p, float k) { return (hf(p, k) + hf(p, k + 101.0) + hf(p, k + 211.0) - 1.5) * 2.0; }
  float vnz(vec2 p, float k) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(gn(i, k), gn(i + vec2(1, 0), k), f.x), mix(gn(i + vec2(0, 1), k), gn(i + vec2(1, 1), k), f.x), f.y); }
  float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
  vec3 tone(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
  void main() {
    vec2 px = vUv * uRes;
    vec3 c = texture(uHdr, vUv).rgb;
    // unsharp mask (phones sharpen hard)
    vec2 t = 1.0 / uRes;
    vec3 bl4 = (texture(uHdr, vUv + vec2(t.x, 0)).rgb + texture(uHdr, vUv - vec2(t.x, 0)).rgb + texture(uHdr, vUv + vec2(0, t.y)).rgb + texture(uHdr, vUv - vec2(0, t.y)).rgb) * 0.25;
    c = max(c + (c - bl4) * uSharp, 0.0);
    c += texture(uB2, vUv).rgb * 0.02 + texture(uB3, vUv).rgb * 0.02 + texture(uB5, vUv).rgb * 0.02;
    c *= uGain * uWB;
    // local tone mapping: lift dark regions, hold back bright ones, relative to the blurred neighbourhood
    float Yl = lum((texture(uB4, vUv).rgb * 0.6 + texture(uB5, vUv).rgb * 0.4) * uGain * uWB);
    c *= clamp(pow(max(Yl, 1e-4) / 0.18, -uLocal), 0.45, uLocal > 0.21 ? 1.25 : 1.7);
    float rr = length(vUv - 0.5) * 1.4;
    c *= 1.0 - 0.35 * rr * rr;
    float Y = lum(c);
    c = mix(vec3(Y) * vec3(0.95, 0.99, 1.06), c, 1.0 - uDesat);
    c = tone(c * 1.1);
    c = pow(c, vec3(1.0 / 2.2));
    // sensor noise after the phone's denoiser: fine luma grain + soft blotchy chroma, stronger in shadows
    float y = lum(c);
    float g = gn(px, uSeed) * 0.5 + vnz(px / 2.3, uSeed + 7.0) * 0.7;
    c += g * uGrain * (0.45 + 0.7 * (1.0 - smoothstep(0.05, 0.7, y)));
    c += vec3(vnz(px / 3.5, uSeed + 13.0), vnz(px / 3.5, uSeed + 29.0) * 0.6, vnz(px / 3.5, uSeed + 41.0)) * uGrain * 0.35 * (1.0 - y);
    oCol = vec4(clamp(c, 0.0, 1.0), 1.0);
  }`;

  // ---------------- WebGL plumbing ----------------
  function compile(gl, vs, fs) {
    const mk = (type, src) => { const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) + '\n' + src.split('\n').map((l, i) => (i + 1) + ': ' + l).join('\n'));
      return sh; };
    const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const loc = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const nm = gl.getActiveUniform(p, i).name.replace(/\[0\]$/, ''); loc[nm] = gl.getUniformLocation(p, nm); }
    return { p, loc };
  }
  function tex2(gl, w, h, fmt, mip) {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    const levels = mip ? Math.floor(Math.log2(Math.max(w, h))) + 1 : 1;
    gl.texStorage2D(gl.TEXTURE_2D, levels, fmt, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  function fboTex(gl, t, depthTex) {
    const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    if (t) gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    if (depthTex) gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTex, 0);
    if (!t) { gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE); }
    const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER); if (st !== gl.FRAMEBUFFER_COMPLETE) throw new Error('fbo incomplete ' + st);
    return f;
  }

  // matrices (column-major)
  function perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
  }
  function ortho(l, r, b, t, n, f) { return [2 / (r - l), 0, 0, 0, 0, 2 / (t - b), 0, 0, 0, 0, -2 / (f - n), 0, -(r + l) / (r - l), -(t + b) / (t - b), -(f + n) / (f - n), 1]; }
  function lookAt(e, c, up) {
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const z = norm(sub(e, c)), x = norm(cross(up, z)), y = cross(z, x);
    return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1];
  }
  function mul(a, b) { const o = new Array(16).fill(0); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) o[j * 4 + i] += a[k * 4 + i] * b[j * 4 + k]; return o; }
  function inv(a) {
    const o = new Array(16);
    const b00 = a[0] * a[5] - a[1] * a[4], b01 = a[0] * a[6] - a[2] * a[4], b02 = a[0] * a[7] - a[3] * a[4], b03 = a[1] * a[6] - a[2] * a[5];
    const b04 = a[1] * a[7] - a[3] * a[5], b05 = a[2] * a[7] - a[3] * a[6], b06 = a[8] * a[13] - a[9] * a[12], b07 = a[8] * a[14] - a[10] * a[12];
    const b08 = a[8] * a[15] - a[11] * a[12], b09 = a[9] * a[14] - a[10] * a[13], b10 = a[9] * a[15] - a[11] * a[13], b11 = a[10] * a[15] - a[11] * a[14];
    const d = 1 / (b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06);
    o[0] = (a[5] * b11 - a[6] * b10 + a[7] * b09) * d; o[1] = (a[2] * b10 - a[1] * b11 - a[3] * b09) * d; o[2] = (a[13] * b05 - a[14] * b04 + a[15] * b03) * d; o[3] = (a[10] * b04 - a[9] * b05 - a[11] * b03) * d;
    o[4] = (a[6] * b08 - a[4] * b11 - a[7] * b07) * d; o[5] = (a[0] * b11 - a[2] * b08 + a[3] * b07) * d; o[6] = (a[14] * b02 - a[12] * b05 - a[15] * b01) * d; o[7] = (a[8] * b05 - a[10] * b02 + a[11] * b01) * d;
    o[8] = (a[4] * b10 - a[5] * b08 + a[7] * b06) * d; o[9] = (a[1] * b08 - a[0] * b10 - a[3] * b06) * d; o[10] = (a[12] * b04 - a[13] * b02 + a[15] * b00) * d; o[11] = (a[9] * b02 - a[8] * b04 - a[11] * b00) * d;
    o[12] = (a[5] * b07 - a[4] * b09 - a[6] * b06) * d; o[13] = (a[0] * b09 - a[1] * b07 + a[2] * b06) * d; o[14] = (a[13] * b01 - a[12] * b03 - a[14] * b00) * d; o[15] = (a[8] * b03 - a[9] * b01 + a[10] * b00) * d;
    return o;
  }

  // scene constants
  const LAMP = [-11.0, 5.5, 9.0];
  const AO_MIN = [-17, -0.3, -10], AO_SIZE = [30, 12.6, 22], AO_RES = [150, 63, 110];
  let BUILT = false, AO_DATA = null;

  function create(canvas) {
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false, alpha: false, depth: false });
    if (!gl) throw new Error('no webgl2');
    if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('no float render targets');
    gl.getExtension('OES_texture_float_linear');
    if (!BUILT) { buildHouse(); buildVegetation(); BUILT = true; }
    const W = canvas.width, H = canvas.height;

    const progs = MAT.map((lib) => compile(gl, VS, HEAD + lib + MAIN));
    const pre = compile(gl, VS, PRE_FS), sky = compile(gl, VS_FS, SKY_FS), down = compile(gl, VS_FS, DOWN_FS), post = compile(gl, VS_FS, POST_FS);
    const meshes = geo.map((arr) => {
      const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
      const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.STATIC_DRAW);
      [[0, 3, 0], [1, 3, 12], [2, 2, 24], [3, 2, 32], [4, 1, 40]].forEach(([i, n, o]) => { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, n, gl.FLOAT, false, FSZ * 4, o); });
      return { vao, n: arr.length / FSZ };
    });
    gl.bindVertexArray(null);
    const quadVao = gl.createVertexArray(); gl.bindVertexArray(quadVao);
    const qb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, qb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.bindVertexArray(null);
    const fsDraw = () => { gl.bindVertexArray(quadVao); gl.drawArrays(gl.TRIANGLES, 0, 3); };
    const drawGeo = (pr, VP, skipGrass) => {
      gl.uniformMatrix4fv(pr.loc.uVP, false, VP);
      meshes.forEach((m, g) => { if (m.n && !(skipGrass && g === GRASS_GROUP)) { gl.bindVertexArray(m.vao); gl.drawArrays(gl.TRIANGLES, 0, m.n); } });
    };

    // noise texture (unit 7)
    const NZ = 256, nr = rng(77), raw = new Float32Array(NZ * NZ), nb = new Uint8Array(NZ * NZ);
    for (let i = 0; i < raw.length; i++) raw[i] = nr();
    for (let y = 0; y < NZ; y++) for (let x = 0; x < NZ; x++) {
      let a = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) a += raw[((y + dy + NZ) % NZ) * NZ + ((x + dx + NZ) % NZ)] * (dx === 0 && dy === 0 ? 4 : (dx === 0 || dy === 0 ? 2 : 1));
      nb[y * NZ + x] = Math.round(clamp((a / 16 - 0.5) * 2.2 + 0.5, 0, 1) * 255);
    }
    const noiseT = gl.createTexture(); gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D, noiseT);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, NZ, NZ, 0, gl.RED, gl.UNSIGNED_BYTE, nb); gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    const setNoise = (pr) => { if (pr.loc.uNoise) gl.uniform1i(pr.loc.uNoise, 7); };

    gl.disable(gl.CULL_FACE);
    // ---- static lamp shadow map (unit 8) ----
    const SM = 2048, smT = gl.createTexture(); gl.activeTexture(gl.TEXTURE8); gl.bindTexture(gl.TEXTURE_2D, smT);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, SM, SM);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const smF = fboTex(gl, null, smT);
    const LAMP_VP = mul(perspective(62 * Math.PI / 180, 1, 2, 70), lookAt(LAMP, [-1.5, 2.5, -1.5], UP));
    gl.viewport(0, 0, SM, SM); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.clearDepth(1); gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1.5, 3.0);
    gl.useProgram(pre.p); setNoise(pre); drawGeo(pre, LAMP_VP, true);
    gl.disable(gl.POLYGON_OFFSET_FILL);

    // ---- sky-visibility volume (unit 9), baked once and shared between canvases ----
    if (!AO_DATA) {
      const K = 32, DM = 512;
      const maps = gl.createTexture(); gl.activeTexture(gl.TEXTURE10); gl.bindTexture(gl.TEXTURE_2D_ARRAY, maps);
      gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.DEPTH_COMPONENT24, DM, DM, K);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
      const dirVP = [], wts = [];
      const ctr = AO_MIN.map((m, i) => m + AO_SIZE[i] / 2), rad = Math.hypot(...AO_SIZE) / 2;
      const f = gl.createFramebuffer();
      for (let k = 0; k < K; k++) {
        // cosine-weighted hemisphere directions (Fibonacci spiral), plus a few just above the horizon
        const u = (k + 0.5) / K, cosT = Math.sqrt(1 - u * 0.97), sinT = Math.sqrt(1 - cosT * cosT), ph = k * 2.39996;
        const d = [sinT * Math.cos(ph), cosT, sinT * Math.sin(ph)];
        const eye = addv(ctr, d, rad + 40);
        const up = Math.abs(d[1]) > 0.99 ? [1, 0, 0] : UP;
        const vp = mul(ortho(-rad, rad, -rad, rad, 1, rad * 2 + 80), lookAt(eye, ctr, up));
        dirVP.push(...vp); wts.push(1);
        gl.bindFramebuffer(gl.FRAMEBUFFER, f);
        gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, maps, 0, k);
        gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
        gl.viewport(0, 0, DM, DM); gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1.5, 3.0);
        drawGeo(pre, vp, true);
        gl.disable(gl.POLYGON_OFFSET_FILL);
      }
      const bake = compile(gl, VS_FS, BAKE_FS);
      const [RX, RY, RZ] = AO_RES;
      const st = tex2(gl, RX, RY, gl.RGBA8, false), sf = fboTex(gl, st, null);
      gl.disable(gl.DEPTH_TEST);
      gl.useProgram(bake.p);
      gl.activeTexture(gl.TEXTURE10); gl.bindTexture(gl.TEXTURE_2D_ARRAY, maps); gl.uniform1i(bake.loc.uMaps, 10);
      gl.uniformMatrix4fv(bake.loc.uDirVP, false, new Float32Array(dirVP)); gl.uniform1fv(bake.loc.uW, new Float32Array(wts));
      gl.uniform3fv(bake.loc.uAOmin, AO_MIN); gl.uniform3fv(bake.loc.uAOsize, AO_SIZE);
      AO_DATA = new Uint8Array(RX * RY * RZ);
      const px = new Uint8Array(RX * RY * 4);
      for (let z = 0; z < RZ; z++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, sf); gl.viewport(0, 0, RX, RY);
        gl.uniform1f(bake.loc.uZ, (z + 0.5) / RZ); fsDraw();
        gl.readPixels(0, 0, RX, RY, gl.RGBA, gl.UNSIGNED_BYTE, px);
        for (let i = 0; i < RX * RY; i++) AO_DATA[z * RX * RY + i] = px[i * 4];
      }
      gl.deleteTexture(maps); gl.deleteTexture(st); gl.deleteFramebuffer(sf); gl.deleteFramebuffer(f);
    }
    const aoT = gl.createTexture(); gl.activeTexture(gl.TEXTURE9); gl.bindTexture(gl.TEXTURE_3D, aoT);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.R8, AO_RES[0], AO_RES[1], AO_RES[2], 0, gl.RED, gl.UNSIGNED_BYTE, AO_DATA);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    for (const w of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, w, gl.CLAMP_TO_EDGE);

    // ---- frame targets: 4x MSAA HDR, resolved into a mipmapped texture ----
    const msC = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, msC); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, 4, gl.RGBA16F, W, H);
    const msD = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, msD); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, 4, gl.DEPTH_COMPONENT24, W, H);
    const msF = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, msF);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, msC); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, msD);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('msaa fbo incomplete');
    const hdrT = tex2(gl, W, H, gl.RGBA16F, false), hdrF = fboTex(gl, hdrT, null);
    const levels = []; let lw = W, lh = H;
    for (let i = 0; i < 5; i++) { lw = Math.max(1, lw >> 1); lh = Math.max(1, lh >> 1); const t = tex2(gl, lw, lh, gl.RGBA16F, false); levels.push({ t, f: fboTex(gl, t, null), w: lw, h: lh }); }

    // opts: {cam, target, roll, fov(deg), flash 0..1, exposure, grain, seed, desat, moon}
    return function draw(o) {
      const r = o.roll || 0;
      const view = lookAt(o.cam, o.target, [Math.sin(r), Math.cos(r), 0]);
      const VP = mul(perspective((o.fov || 62) * Math.PI / 180, W / H, 0.1, 400), view);
      const F = norm([o.target[0] - o.cam[0], o.target[1] - o.cam[1], o.target[2] - o.cam[2]]);
      const flash = o.flash || 0, skyI = 0.00055 * (o.moon ?? 1);
      gl.bindFramebuffer(gl.FRAMEBUFFER, msF); gl.viewport(0, 0, W, H);
      gl.clearColor(0, 0, 0, 1); gl.clearDepth(1); gl.depthMask(true); gl.colorMask(true, true, true, true);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
      // 1. depth only (with the cut-outs)
      gl.depthFunc(gl.LESS); gl.colorMask(false, false, false, false);
      gl.useProgram(pre.p); setNoise(pre); drawGeo(pre, VP, false);
      // 2. shade each visible sample once, one program per material group
      gl.depthFunc(gl.EQUAL); gl.depthMask(false); gl.colorMask(true, true, true, true);
      progs.forEach((pr, g) => {
        if (!meshes[g].n) return;
        const L = pr.loc;
        gl.useProgram(pr.p); setNoise(pr);
        gl.uniformMatrix4fv(L.uVP, false, VP);
        gl.uniform3fv(L.uCam, o.cam); gl.uniform3fv(L.uCamF, F); gl.uniform3fv(L.uFlashPos, [o.cam[0] + 0.012, o.cam[1] + 0.035, o.cam[2]]);
        gl.uniform3fv(L.uLamp, LAMP); gl.uniform3fv(L.uAOmin, AO_MIN); gl.uniform3fv(L.uAOsize, AO_SIZE);
        gl.uniform1f(L.uFlash, flash * 1.0); gl.uniform1f(L.uSky, skyI); gl.uniform1f(L.uLampI, 1.6); gl.uniform1f(L.uFogK, 0.012);
        gl.uniform1i(L.uAO, 9); gl.uniform1i(L.uShadow, 8); gl.uniformMatrix4fv(L.uLampVP, false, LAMP_VP);
        gl.bindVertexArray(meshes[g].vao); gl.drawArrays(gl.TRIANGLES, 0, meshes[g].n);
      });
      // 3. sky where nothing was drawn
      gl.depthFunc(gl.LEQUAL);
      gl.useProgram(sky.p); setNoise(sky);
      gl.uniformMatrix4fv(sky.loc.uInvVP, false, inv(VP)); gl.uniform3fv(sky.loc.uCam, o.cam); gl.uniform3fv(sky.loc.uCamF, F);
      gl.uniform1f(sky.loc.uSky, skyI); gl.uniform1f(sky.loc.uFlash, flash); gl.uniform1f(sky.loc.uFogK, 0.012); gl.uniform1f(sky.loc.uLampI, 1.6);
      fsDraw();
      gl.disable(gl.DEPTH_TEST);
      // 4. resolve MSAA, bloom / local-exposure pyramid
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, msF); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, hdrF);
      gl.blitFramebuffer(0, 0, W, H, 0, 0, W, H, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      let src = hdrT, sw = W, sh = H;
      gl.useProgram(down.p);
      for (const lv of levels) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, lv.f); gl.viewport(0, 0, lv.w, lv.h);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src); gl.uniform1i(down.loc.uSrc, 0);
        gl.uniform2f(down.loc.uTexel, 1 / sw, 1 / sh); fsDraw();
        src = lv.t; sw = lv.w; sh = lv.h;
      }
      // 5. the phone's image pipeline
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H);
      gl.useProgram(post.p);
      const units = [hdrT, ...levels.map((l) => l.t)];
      ['uHdr', 'uB1', 'uB2', 'uB3', 'uB4', 'uB5'].forEach((nm, i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, units[i]); gl.uniform1i(post.loc[nm], i); });
      const ex = o.exposure || 1;
      gl.uniform2f(post.loc.uRes, W, H);
      gl.uniform1f(post.loc.uGain, ex * (flash > 0.5 ? 125 : 75));
      gl.uniform1f(post.loc.uLocal, flash > 0.5 ? 0.22 : 0.2);
      gl.uniform1f(post.loc.uGrain, (o.grain || 0) * (flash > 0.5 ? 0.8 : 0.7));
      gl.uniform1f(post.loc.uDesat, o.desat || 0);
      gl.uniform1f(post.loc.uSeed, (o.seed || 0) % 977);
      gl.uniform1f(post.loc.uSharp, flash > 0.5 ? 0.6 : 0.25);
      // auto white balance: with the flash it balances for the LED; without, it pulls the sodium light toward neutral
      const wb = flash > 0.5 ? [1.0, 1.0, 1.04] : [0.82, 1.0, 1.45];
      gl.uniform3fv(post.loc.uWB, wb);
      fsDraw();
      gl.activeTexture(gl.TEXTURE0);
    };
  }

  // hand-held camera pose at time t (seconds) — slow drift + breathing sway + small tremor
  function handheld(t, base, amp = 1) {
    const s = (f, p) => Math.sin(2 * Math.PI * f * t + p);
    const dx = (0.05 * s(0.13, 1) + 0.025 * s(0.37, 2) + 0.006 * s(3.1, 0.3) + 0.004 * s(5.3, 1.7)) * amp;
    const dy = (0.035 * s(0.21, 0.5) + 0.03 * s(0.27, 2.2) + 0.005 * s(2.7, 1.1) + 0.004 * s(6.1, 0.2)) * amp;
    const roll = (0.012 * s(0.17, 0.8) + 0.004 * s(1.9, 2.0)) * amp;
    return { cam: [base.cam[0] + dx * 0.4, base.cam[1] + dy * 0.3, base.cam[2]], target: [base.target[0] + dx * 2.2, base.target[1] + dy * 2.0, base.target[2]], roll, fov: base.fov };
  }

  window.HOUSE3D = { create, handheld, tris: () => geo.reduce((a, g) => a + g.length / FSZ / 3, 0) };
})();
