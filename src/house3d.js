// Danny's dad's old house outside Vernonia, Oregon, at 8:23 PM on a mid-November night, as seen by the
// protagonist's phone camera. WebGL2, everything procedural.
//
// The house follows the user's wireframe reference: portico on panelled columns with a dentilled cornice, arched
// double doors, a projecting clapboard wing on the left, a tower with a cusped library window on the right, paved forecourt.
// Rooms behind the windows are drawn by interior mapping (room box plus furniture silhouettes and curtains).
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
  // wood: 0 clapboard siding, 1 trim (horizontal grain), 11 trim (vertical grain), 2 door wood, 3 window sash wood,
  //       8 porch floor boards, 9 railing slats, 13 beadboard porch ceiling
  // 4 window glass (with the rooms behind it), 5 lawn ground, 6 concrete paving slabs, 10 gravel, 7 shingles, 17 metal
  // 12 grass, 15 fern/bracken, 18 leaves, 19 dried flower heads, 14 bark/twigs/canes, 16 fir foliage
  const GROUPS = [[0, 1, 2, 3, 8, 9, 11, 13], [4], [5, 6, 10], [7, 17], [12], [15, 18, 19], [14], [16]];
  const GROUP_OF = []; GROUPS.forEach((g, i) => g.forEach((m) => (GROUP_OF[m] = i)));
  const GRASS_GROUP = 4;
  const FSZ = 11;   // pos3 nor3 uv2 aux2 mat1
  const geo = GROUPS.map(() => []);
  function V(p, n, u, v, mat, aux = [0, 0]) { geo[GROUP_OF[mat]].push(p[0], p[1], p[2], n[0], n[1], n[2], u, v, aux[0], aux[1], mat); }
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const neg = (a) => [-a[0], -a[1], -a[2]];

  // ---------------- geometry helpers ----------------
  function quad(p0, p1, p2, p3, n, mat, aux) {
    const uv = [[0, 0], [1, 0], [1, 1], [0, 1]], P = [p0, p1, p2, p3];
    for (const i of [0, 1, 2, 0, 2, 3]) V(P[i], n, uv[i][0], uv[i][1], mat, aux);
  }
  function box(x0, y0, z0, x1, y1, z1, mat, opt = {}) {
    if (mat === 1 && (y1 - y0) > 1.5 * Math.max(x1 - x0, z1 - z0)) mat = 11;
    const m = (face) => (opt.faces && opt.faces[face] !== undefined ? opt.faces[face] : mat), a = opt.aux;
    quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], m('front'), a);
    quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], m('back'), a);
    quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], m('left'), a);
    quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], m('right'), a);
    quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], m('top'), a);
    quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], m('bottom'), a);
  }
  function tri(a, b, c, mat, aux) {
    const n = norm(cross(sub(b, a), sub(c, a)));
    for (const p of [a, b, c]) V(p, n, 0, 0, mat, aux);
  }
  function slope(a, b, c, d, mat, aux) { tri(a, b, c, mat, aux); tri(a, c, d, mat, aux); }
  // oriented box along a segment: half-width hw across (perpendicular to `up`), half-height hh
  function beam(a, b, hw, hh, mat, up = UP, aux) {
    const ax = norm(sub(b, a));
    let t = cross(ax, up); if (Math.hypot(t[0], t[1], t[2]) < 1e-4) t = cross(ax, [1, 0, 0]);
    t = norm(t); const u = cross(t, ax);
    if (mat === 1 && Math.abs(ax[1]) > 0.8) mat = 11;
    const P = (p, s1, s2) => addv(addv(p, t, s1 * hw), u, s2 * hh);
    quad(P(a, 1, -1), P(b, 1, -1), P(b, 1, 1), P(a, 1, 1), t, mat, aux);
    quad(P(a, -1, 1), P(b, -1, 1), P(b, -1, -1), P(a, -1, -1), neg(t), mat, aux);
    quad(P(a, -1, 1), P(a, 1, 1), P(b, 1, 1), P(b, -1, 1), u, mat, aux);
    quad(P(a, 1, -1), P(a, -1, -1), P(b, -1, -1), P(b, 1, -1), neg(u), mat, aux);
    quad(P(a, -1, -1), P(a, 1, -1), P(a, 1, 1), P(a, -1, 1), neg(ax), mat, aux);
    quad(P(b, 1, -1), P(b, -1, -1), P(b, -1, 1), P(b, 1, 1), ax, mat, aux);
  }
  // front-facing (+z) region between y = lo(x) and y = hi(x), sampled at xs
  function regionZ(xs, lo, hi, z, mat, aux, uvFn) {
    for (let i = 0; i < xs.length - 1; i++) {
      const xa = xs[i], xb = xs[i + 1]; if (xb - xa < 1e-6) continue;
      const P = [[xa, lo(xa), z], [xb, lo(xb), z], [xb, hi(xb), z], [xa, hi(xa), z]];
      if (P[3][1] - P[0][1] < 1e-5 && P[2][1] - P[1][1] < 1e-5) continue;
      for (const k of [0, 1, 2, 0, 2, 3]) { const p = P[k], uv = uvFn ? uvFn(p) : [0, 0]; V(p, [0, 0, 1], uv[0], uv[1], mat, aux); }
    }
  }
  // surface following y = f(x) between z0 and z1; sgn -1: faces down (soffit of an arch)
  function revealZ(xs, f, z0, z1, mat, sgn, aux) {
    for (let i = 0; i < xs.length - 1; i++) {
      const xa = xs[i], xb = xs[i + 1]; if (xb - xa < 1e-6) continue;
      const ya = f(xa), yb = f(xb), n = norm([-(yb - ya) * sgn, (xb - xa) * sgn, 0]);
      quad([xa, ya, z0], [xb, yb, z0], [xb, yb, z1], [xa, ya, z1], n, mat, aux);
    }
  }
  const arcXs = (cx, r, n = 20) => { const a = []; for (let i = 0; i <= n; i++) a.push(cx + r * Math.cos(Math.PI * (1 - i / n))); return a; };
  const arcY = (cx, cy, r) => (x) => cy + Math.sqrt(Math.max(0, r * r - (x - cx) * (x - cx)));
  // half ring (semicircular arch) between radii r0 and r1, front face at z1, soffit from z0 to z1
  function archRing(cx, cy, r0, r1, z0, z1, mat, n = 24, opt = {}) {
    for (let i = 0; i < n; i++) {
      const a0 = Math.PI * i / n, a1 = Math.PI * (i + 1) / n, c0 = [Math.cos(a0), Math.sin(a0)], c1 = [Math.cos(a1), Math.sin(a1)];
      const P = (c, r, z) => [cx + c[0] * r, cy + c[1] * r, z];
      quad(P(c0, r0, z1), P(c0, r1, z1), P(c1, r1, z1), P(c1, r0, z1), [0, 0, 1], mat);
      if (opt.inner !== false) quad(P(c0, r0, z0), P(c0, r0, z1), P(c1, r0, z1), P(c1, r0, z0), norm([-(c0[0] + c1[0]), -(c0[1] + c1[1]), 0]), mat);
      if (opt.outer) quad(P(c0, r1, z0), P(c0, r1, z1), P(c1, r1, z1), P(c1, r1, z0), norm([c0[0] + c1[0], c0[1] + c1[1], 0]), mat);
    }
  }
  // raised panel facing +z: bevel from zLow at the edge to a flat field at zHigh
  function raisedPanel(x0, y0, x1, y1, zLow, zHigh, bev, mat) {
    quad([x0 + bev, y0 + bev, zHigh], [x1 - bev, y0 + bev, zHigh], [x1 - bev, y1 - bev, zHigh], [x0 + bev, y1 - bev, zHigh], [0, 0, 1], mat);
    slope([x0, y0, zLow], [x1, y0, zLow], [x1 - bev, y0 + bev, zHigh], [x0 + bev, y0 + bev, zHigh], mat);
    slope([x1, y0, zLow], [x1, y1, zLow], [x1 - bev, y1 - bev, zHigh], [x1 - bev, y0 + bev, zHigh], mat);
    slope([x1, y1, zLow], [x0, y1, zLow], [x0 + bev, y1 - bev, zHigh], [x1 - bev, y1 - bev, zHigh], mat);
    slope([x0, y1, zLow], [x0, y0, zLow], [x0 + bev, y0 + bev, zHigh], [x0 + bev, y1 - bev, zHigh], mat);
  }
  // a rectangle of small mouldings on a vertical face (centre c on the face, outward normal N)
  function moldFrame(c, N, hu, y0, y1, w, d, mat) {
    const U = cross(UP, N), at = (u, y) => addv(addv([c[0], y, c[2]], U, u), N, d / 2);
    beam(at(-hu, y0 + w / 2), at(hu, y0 + w / 2), w / 2, d / 2, mat, N);
    beam(at(-hu, y1 - w / 2), at(hu, y1 - w / 2), w / 2, d / 2, mat, N);
    beam(at(-hu + w / 2, y0 + w), at(-hu + w / 2, y1 - w), w / 2, d / 2, mat, N);
    beam(at(hu - w / 2, y0 + w), at(hu - w / 2, y1 - w), w / 2, d / 2, mat, N);
  }
  const FACES4 = [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0]];
  // glass quad in a local window frame (O lower-left on the glass plane, R right, N outward); uv = metres from the window's left edge
  function glassQuad(O, R, N, u0, v0, u1, v1, type, W, ux0 = 0) {
    const P = (u, v) => addv(addv(O, R, u), UP, v);
    const pts = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    for (const k of [0, 1, 2, 0, 2, 3]) { const [u, v] = pts[k]; V(P(u, v), N, ux0 + u, v, 4, [type, W]); }
  }
  // double-hung sash window in an axis-aligned local frame: O = lower-left corner of the opening on the wall face
  function sashWindow(O, N, w, h, rec, cols, rows, type, W = w, ux0 = 0) {
    const R = cross(UP, N);
    const lbox = (u0, v0, w0, u1, v1, w1, mat) => {
      const a = addv(addv(addv(O, R, u0), UP, v0), N, w0), b = addv(addv(addv(O, R, u1), UP, v1), N, w1);
      box(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2]), Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2]), mat);
    };
    const vm = h / 2, S = 3;
    for (const up of [false, true]) {
      const v0 = up ? vm - 0.02 : 0, v1 = up ? h : vm + 0.02, wg = up ? -rec + 0.045 : -rec, wf = wg + 0.035;
      const bot = up ? 0.04 : 0.08, top = up ? 0.055 : 0.04;
      lbox(0, v0, wg, 0.05, v1, wf, S); lbox(w - 0.05, v0, wg, w, v1, wf, S);
      lbox(0.05, v0, wg, w - 0.05, v0 + bot, wf, S); lbox(0.05, v1 - top, wg, w - 0.05, v1, wf, S);
      const gu0 = 0.05, gu1 = w - 0.05, gv0 = v0 + bot, gv1 = v1 - top;
      for (let i = 1; i < cols; i++) { const u = gu0 + (gu1 - gu0) * i / cols; lbox(u - 0.01, gv0, wg, u + 0.01, gv1, wg + 0.022, S); }
      for (let j = 1; j < rows; j++) { const v = gv0 + (gv1 - gv0) * j / rows; lbox(gu0, v - 0.01, wg, gu1, v + 0.01, wg + 0.022, S); }
      glassQuad(addv(O, N, wg), R, N, gu0, gv0, gu1, gv1, type, W, ux0);
    }
    // stops / frame inside the opening
    lbox(-0.0, 0, -rec - 0.02, 0.025, h, -rec + 0.09, S); lbox(w - 0.025, 0, -rec - 0.02, w, h, -rec + 0.09, S);
    lbox(0, h - 0.025, -rec - 0.02, w, h, -rec + 0.09, S);
  }
  // window casings on a wall face (axis-aligned local frame)
  function casing(O, N, w, h, cw, d, mat = 1) {
    const R = cross(UP, N);
    const lbox = (u0, v0, w0, u1, v1, w1) => {
      const a = addv(addv(addv(O, R, u0), UP, v0), N, w0), b = addv(addv(addv(O, R, u1), UP, v1), N, w1);
      box(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2]), Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2]), mat);
    };
    lbox(-cw, -0.02, 0, 0, h, d); lbox(w, -0.02, 0, w + cw, h, d);                      // side casings
    lbox(-cw - 0.03, h, 0, w + cw + 0.03, h + cw * 1.1, d + 0.01);                     // head casing
    lbox(-cw - 0.06, h + cw * 1.1, 0, w + cw + 0.06, h + cw * 1.1 + 0.04, d + 0.06);   // drip cap
    lbox(-cw - 0.04, -0.06, -0.06, w + cw + 0.04, 0.0, d + 0.06);                      // sill
    lbox(-cw + 0.02, -0.06 - cw * 0.9, 0, w + cw - 0.02, -0.06, d);                    // apron
  }

  // ---------------- the house, after the user's reference (Victorian entry, see work/house_ref_plan.md) ----------------
  function buildHouse() {
    const SID = 0, TRIM = 1, DOOR = 2, SASH = 3, GROUND = 5, PAVE = 6, ROOF = 7, FLOOR = 8, GRAVEL = 10, CEIL = 13, METAL = 17;
    const GALV = [0, 0], BRASS = [1, 0], IRON = [2, 0], FROST = [3, 0];
    // ground, forecourt paving, gravel strip along the left wing
    for (let x = -60; x < 60; x += 20) for (let z = -60; z < 60; z += 20) quad([x, 0, z + 20], [x + 20, 0, z + 20], [x + 20, 0, z], [x, 0, z], [0, 1, 0], GROUND);
    const flat = (x0, z0, x1, z1, y, mat) => quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0], mat);
    flat(-8, 3.55, 9, 16, 0.012, PAVE); flat(-2.25, 1.6, 9, 3.55, 0.012, PAVE); flat(4.3, -0.6, 9, 1.6, 0.012, PAVE);
    flat(-2.6, 0, -2.25, 3.55, 0.008, GRAVEL); flat(-2.25, 0, -2.0, 1.6, 0.008, GRAVEL);

    // ---- porch deck, long low step, worn stone landing ----
    box(-2.0, 0, 0, 1.70, 0.22, 2.15, TRIM, { faces: { top: FLOOR } });
    box(-2.35, 0, 2.15, 1.70, 0.115, 2.47, TRIM, { faces: { top: FLOOR } });
    box(-1.3, 0, 2.47, 1.3, 0.05, 2.85, PAVE);

    // ---- centre block: front wall (with openings), body, eave, gable, roof ----
    const WZ0 = -0.3;
    box(-2.6, 0, -6, 1.70, 7.0, WZ0, SID);
    box(-2.6, 0, WZ0, -1.30, 7.0, 0, SID); box(1.30, 0, WZ0, 1.70, 7.0, 0, SID);
    box(-1.30, 3.26, WZ0, 1.30, 4.75, 0, SID); box(-1.30, 6.30, WZ0, 1.30, 7.0, 0, SID);
    box(-1.30, 4.75, WZ0, -0.60, 6.30, 0, SID); box(1.00, 4.75, WZ0, 1.30, 6.30, 0, SID); box(0.12, 4.75, WZ0, 0.28, 6.30, 0, SID);
    // paired 2-over-2 windows over the porch
    sashWindow([-0.60, 4.75, 0], [0, 0, 1], 0.72, 1.55, 0.12, 2, 1, 3, 1.6, 0);
    sashWindow([0.28, 4.75, 0], [0, 0, 1], 0.72, 1.55, 0.12, 2, 1, 3, 1.6, 0.88);
    box(-0.74, 4.73, 0, -0.60, 6.30, 0.03, TRIM); box(1.00, 4.73, 0, 1.14, 6.30, 0.03, TRIM); box(0.09, 4.73, 0, 0.31, 6.30, 0.035, TRIM);
    box(-0.80, 6.30, 0, 1.20, 6.48, 0.05, TRIM); box(-0.88, 6.48, 0, 1.28, 6.56, 0.13, TRIM); box(-0.84, 6.56, 0, 1.24, 6.6, 0.1, TRIM);
    box(-0.82, 4.66, -0.03, 1.22, 4.75, 0.11, TRIM);
    for (const x of [-0.66, 1.06]) box(x - 0.04, 4.50, 0, x + 0.04, 4.66, 0.09, TRIM);
    // frieze band, eaves along the sides, gable wall with a vent, rake boards, roof
    box(-2.63, 6.80, -6, 1.73, 7.0, 0.03, TRIM);
    tri([-2.6, 7.0, 0], [1.70, 7.0, 0], [-0.45, 8.8, 0], SID);
    const GX = -0.45;
    for (const s of [-1, 1]) {
      const ex = s < 0 ? -2.95 : 2.05, a = [ex, 6.71, 0.4], b = [GX, 8.8, 0.4], ax = norm(sub(b, a));
      const dn = s < 0 ? [ax[1], -ax[0], 0] : [-ax[1], ax[0], 0];   // perpendicular, under the roof
      beam(addv(addv(a, dn, 0.1), [0, 0, -0.04]), addv(addv(b, dn, 0.1), [0, 0, -0.04]), 0.035, 0.12, TRIM);
      slope(s < 0 ? [ex, 6.71, 0.4] : [GX, 8.8, 0.4], s < 0 ? [GX, 8.8, 0.4] : [ex, 6.71, 0.4], s < 0 ? [GX, 8.8, -6] : [ex, 6.71, -6], s < 0 ? [ex, 6.71, -6] : [GX, 8.8, -6], ROOF);
    }
    // soffit of the gable overhang (both rakes)
    slope([-2.95, 6.70, 0.4], [GX, 8.79, 0.4], [GX, 8.79, 0.0], [-2.95, 6.70, 0.0], TRIM);
    slope([GX, 8.79, 0.4], [2.05, 6.70, 0.4], [2.05, 6.70, 0.0], [GX, 8.79, 0.0], TRIM);
    beam([GX, 8.82, 0.42], [GX, 8.82, -6], 0.06, 0.04, ROOF);
    box(-3.07, 6.56, -6, -2.95, 6.72, 0.4, METAL, { aux: GALV });
    cyl([-3.0, 6.58, 0.3], [-3.0, 5.25, 0.3], 0.04, 0.04, 8, METAL, GALV);
    // gable vent: round-headed, louvered
    archRing(GX, 7.95, 0.22, 0.29, 0, 0.06, TRIM, 16, { outer: true });
    box(GX - 0.29, 7.45, 0, GX - 0.22, 7.95, 0.06, TRIM); box(GX + 0.22, 7.45, 0, GX + 0.29, 7.95, 0.06, TRIM); box(GX - 0.33, 7.38, 0, GX + 0.33, 7.45, 0.09, TRIM);
    regionZ(arcXs(GX, 0.22, 12), () => 7.45, arcY(GX, 7.95, 0.22), 0.005, 3);
    for (let y = 7.5; y < 8.1; y += 0.075) box(GX - 0.22, y, 0.01, GX + 0.22, y + 0.025, 0.04, TRIM);

    // ---- door surround: jambs, central mullion, spandrels round two arches, archivolts, head ----
    const SPR = 2.36, LR = 0.51, SZ0 = -0.12, SZ1 = 0.06;
    box(-1.30, 0.22, SZ0, -1.12, SPR, SZ1, TRIM); box(1.12, 0.22, SZ0, 1.30, SPR, SZ1, TRIM); box(-0.10, 0.22, SZ0, 0.10, SPR, SZ1, TRIM);
    const gArch = (x) => (x > -1.12 && x < -0.10) ? arcY(-0.61, SPR, LR)(x) : (x > 0.10 && x < 1.12) ? arcY(0.61, SPR, LR)(x) : SPR;
    regionZ([-1.30, ...arcXs(-0.61, LR, 28), ...arcXs(0.61, LR, 28), 1.30], gArch, () => 3.0, SZ1, TRIM);
    for (const cx of [-0.61, 0.61]) {
      revealZ(arcXs(cx, LR, 28), arcY(cx, SPR, LR), SZ0, SZ1, TRIM, -1);
      archRing(cx, SPR, LR, LR + 0.09, SZ1, SZ1 + 0.025, TRIM, 28, { outer: true });
      box(cx - LR - 0.09, 0.50, SZ1, cx - LR, SPR, SZ1 + 0.025, TRIM); box(cx + LR, 0.50, SZ1, cx + LR + 0.09, SPR, SZ1 + 0.025, TRIM);
      box(cx - LR - 0.10, 0.22, SZ1, cx - LR + 0.005, 0.50, SZ1 + 0.04, TRIM); box(cx + LR - 0.005, 0.22, SZ1, cx + LR + 0.10, 0.50, SZ1 + 0.04, TRIM);
      box(cx - 0.065, SPR + LR - 0.03, SZ1, cx + 0.065, 3.0, SZ1 + 0.055, TRIM);   // keystone
    }
    for (const x of [-1.215, 0, 1.215]) { box(x - 0.11, SPR - 0.08, SZ1, x + 0.11, SPR, SZ1 + 0.045, TRIM); box(x - 0.05, 2.76, SZ1, x + 0.05, 2.86, SZ1 + 0.03, TRIM); }
    box(-1.30, 3.0, SZ0, 1.30, 3.18, 0.085, TRIM); box(-1.30, 3.18, SZ0, 1.30, 3.26, 0.12, TRIM);

    // ---- the two door leaves: stiles and rails, raised lower panel, arched glazing with muntins ----
    for (const cx of [-0.61, 0.61]) {
      const x0 = cx - LR, x1 = cx + LR, zb = -0.17, zf = -0.12, st = 0.13, rg = LR - st, gz = zf - 0.03;
      box(x0, 0.22, zb, x0 + st, SPR, zf, DOOR); box(x1 - st, 0.22, zb, x1, SPR, zf, DOOR);
      box(x0 + st, 0.22, zb, x1 - st, 0.52, zf, DOOR); box(x0 + st, 1.14, zb, x1 - st, 1.28, zf, DOOR);
      box(x0 + st, 0.52, zb, x1 - st, 1.14, zf - 0.022, DOOR);
      raisedPanel(x0 + st + 0.025, 0.545, x1 - st - 0.025, 1.115, zf - 0.022, zf - 0.007, 0.07, DOOR);
      for (const [a, b, c, d] of [[x0 + st, 0.52, x1 - st, 0.54], [x0 + st, 1.12, x1 - st, 1.14], [x0 + st, 0.54, x0 + st + 0.02, 1.12], [x1 - st - 0.02, 0.54, x1 - st, 1.12]]) box(a, b, zf - 0.022, c, d, zf - 0.006, DOOR);
      archRing(cx, SPR, rg, LR, zb, zf, DOOR, 24);
      const top = arcY(cx, SPR, rg), gx0 = x0 + st, gx1 = x1 - st;
      regionZ(arcXs(cx, rg, 24), () => 1.28, top, gz, 4, [0, 2.24], (p) => [p[0] + 1.12, p[1] - 1.28]);
      for (let k = 1; k < 4; k++) { const xm = gx0 + (gx1 - gx0) * k / 4; box(xm - 0.011, 1.28, gz, xm + 0.011, top(xm) - 0.004, zf - 0.006, DOOR); }
      for (let k = 1; k <= 4; k++) { const y = 1.28 + (SPR - 1.28) * k / 4; box(gx0, y - 0.011, gz, gx1, y + 0.011, zf - 0.006, DOOR); }
      archRing(cx, SPR, rg * 0.55 - 0.011, rg * 0.55 + 0.011, gz, zf - 0.006, DOOR, 16, { outer: true });
      const kx = cx < 0 ? x1 - 0.07 : x0 + 0.07;
      box(kx - 0.024, 0.93, zf, kx + 0.024, 1.17, zf + 0.006, METAL, { aux: BRASS });
      cyl([kx, 1.06, zf + 0.006], [kx, 1.06, zf + 0.055], 0.012, 0.012, 6, METAL, BRASS);
      cyl([kx, 1.06, zf + 0.045], [kx, 1.06, zf + 0.07], 0.03, 0.026, 10, METAL, BRASS);
      if (cx < 0) box(cx - 0.14, 1.185, zf, cx + 0.14, 1.235, zf + 0.008, METAL, { aux: BRASS });   // letter slot
    }

    // ---- pilasters on the wall behind the columns ----
    for (const x0 of [-1.56, 1.30]) {
      const x1 = x0 + 0.26;
      box(x0, 0.22, 0, x1, 3.36, 0.08, TRIM);
      box(x0 - 0.025, 0.22, 0, x1 + 0.025, 0.52, 0.11, TRIM); box(x0 - 0.015, 0.52, 0, x1 + 0.015, 0.56, 0.095, TRIM);
      box(x0 - 0.02, 3.10, 0, x1 + 0.02, 3.18, 0.10, TRIM); box(x0 - 0.035, 3.18, 0, x1 + 0.035, 3.36, 0.115, TRIM);
      moldFrame([x0 + 0.13, 0, 0.08], [0, 0, 1], 0.09, 0.70, 2.95, 0.02, 0.012, TRIM);
    }
    // old mailbox on the right pilaster
    box(1.34, 1.32, 0.08, 1.52, 1.64, 0.17, METAL, { aux: IRON }); box(1.33, 1.64, 0.075, 1.53, 1.67, 0.18, METAL, { aux: IRON });

    // ---- portico columns: panelled pedestal, panelled shaft, capital with brackets under the beam ----
    function bracket(bx, cz, s) {
      const y0 = 2.90, y1 = 3.30, L = 0.32, n = 10, zz = [cz - 0.04, cz + 0.04];
      const off = (y) => L * Math.pow((y - y0) / (y1 - y0), 1.8);
      for (let i = 0; i < n; i++) {
        const ya = y0 + (y1 - y0) * i / n, yb = y0 + (y1 - y0) * (i + 1) / n, oa = off(ya), ob = off(yb);
        for (const [z, nz] of [[zz[1], 1], [zz[0], -1]]) {
          const P = [[bx, ya, z], [bx + s * oa, ya, z], [bx + s * ob, yb, z], [bx, yb, z]];
          for (const k of [0, 1, 2, 0, 2, 3]) V(P[k], [0, 0, nz], 0, 0, 11);
        }
        const nn = norm([s * (yb - ya), -(ob - oa), 0]);
        quad([bx + s * oa, ya, zz[0]], [bx + s * ob, yb, zz[0]], [bx + s * ob, yb, zz[1]], [bx + s * oa, ya, zz[1]], nn, 11);
      }
      box(Math.min(bx, bx + s * L), y1, zz[0], Math.max(bx, bx + s * L), 3.36, zz[1], TRIM);
    }
    function column(cx, cz) {
      const B = (h0, h1, w) => box(cx - w, h0, cz - w, cx + w, h1, cz + w, TRIM);
      B(0.22, 0.31, 0.27); B(0.31, 0.36, 0.25); B(0.36, 0.40, 0.235); B(0.40, 1.20, 0.22);
      for (const N of FACES4) moldFrame([cx + N[0] * 0.22, 0, cz + N[2] * 0.22], N, 0.15, 0.50, 1.10, 0.025, 0.012, TRIM);
      B(1.20, 1.25, 0.235); B(1.25, 1.31, 0.255); B(1.31, 1.36, 0.27); B(1.36, 1.41, 0.19); B(1.41, 1.45, 0.165);
      B(1.45, 2.84, 0.145);
      for (const N of FACES4) moldFrame([cx + N[0] * 0.145, 0, cz + N[2] * 0.145], N, 0.10, 1.58, 2.72, 0.02, 0.01, TRIM);
      B(2.84, 2.88, 0.16); B(2.88, 2.93, 0.175); B(2.93, 3.14, 0.16); B(3.14, 3.20, 0.20); B(3.20, 3.26, 0.225); B(3.26, 3.36, 0.21);
      for (const s of [-1, 1]) bracket(cx + s * 0.16, cz, s);
    }
    column(-1.45, 1.85); column(1.45, 1.85);

    // ---- entablature over the porch: architrave beams, beadboard ceiling, frieze, dentils, corona, cyma ----
    const X0 = -2.0, X1 = 2.0, ZF = 2.08;
    box(X0, 3.36, 1.86, X1, 3.50, ZF, TRIM); box(X0, 3.36, 0, X0 + 0.22, 3.50, 1.86, TRIM);
    box(1.50, 3.36, 0, 1.70, 3.50, 1.86, TRIM); box(X0 + 0.22, 3.36, 0, 1.50, 3.50, 0.14, TRIM);
    box(X0, 3.50, 0, X1, 3.85, ZF, TRIM, { faces: { bottom: CEIL } });
    box(X0, 3.85, 0, X1, 4.10, ZF, TRIM);
    const layer = (y0, y1, pr) => {
      box(X0 - pr, y0, ZF - 0.2, X1 + pr, y1, ZF + pr, TRIM);
      box(X0 - pr, y0, 0, X0 + 0.2, y1, ZF - 0.2, TRIM);
      box(X1 - 0.2, y0, 1.6, X1 + pr, y1, ZF - 0.2, TRIM);
    };
    layer(3.48, 3.52, 0.025); layer(3.74, 3.78, 0.03); layer(3.845, 3.98, 0.17); layer(4.06, 4.10, 0.25);
    for (let x = X0 + 0.02; x < X1 - 0.04; x += 0.1) box(x, 3.78, ZF - 0.05, x + 0.05, 3.845, ZF + 0.06, TRIM);
    for (let z = 0.12; z < ZF; z += 0.1) box(X0 - 0.06, 3.78, z, X0 + 0.05, 3.845, z + 0.05, TRIM);
    for (let z = 1.66; z < ZF; z += 0.1) box(X1 - 0.05, 3.78, z, X1 + 0.06, 3.845, z + 0.05, TRIM);
    slope([X0 - 0.17, 3.98, ZF + 0.17], [X1 + 0.17, 3.98, ZF + 0.17], [X1 + 0.24, 4.06, ZF + 0.24], [X0 - 0.24, 4.06, ZF + 0.24], TRIM);
    slope([X0 - 0.17, 3.98, 0], [X0 - 0.17, 3.98, ZF + 0.17], [X0 - 0.24, 4.06, ZF + 0.24], [X0 - 0.24, 4.06, 0], TRIM);
    slope([X1 + 0.17, 3.98, ZF + 0.17], [X1 + 0.17, 3.98, 1.6], [X1 + 0.24, 4.06, 1.6], [X1 + 0.24, 4.06, ZF + 0.24], TRIM);
    // pendant lantern (unlit): canopy, rod, iron cage with frosted glass
    const LX = 0.0, LZ = 1.0;
    cyl([LX, 3.50, LZ], [LX, 3.475, LZ], 0.06, 0.05, 10, METAL, IRON);
    cyl([LX, 3.48, LZ], [LX, 3.27, LZ], 0.007, 0.007, 4, METAL, IRON);
    box(LX - 0.085, 3.0, LZ - 0.085, LX + 0.085, 3.22, LZ + 0.085, METAL, { aux: FROST });
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(LX + sx * 0.09 - 0.012, 2.99, LZ + sz * 0.09 - 0.012, LX + sx * 0.09 + 0.012, 3.23, LZ + sz * 0.09 + 0.012, METAL, { aux: IRON });
    box(LX - 0.105, 2.965, LZ - 0.105, LX + 0.105, 2.995, LZ + 0.105, METAL, { aux: IRON });
    box(LX - 0.11, 3.22, LZ - 0.11, LX + 0.11, 3.24, LZ + 0.11, METAL, { aux: IRON });
    for (const [a, b] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]])
      tri([LX + a[0] * 0.11, 3.24, LZ + a[1] * 0.11], [LX + b[0] * 0.11, 3.24, LZ + b[1] * 0.11], [LX, 3.33, LZ], METAL, IRON);
    cyl([LX, 2.965, LZ], [LX, 2.92, LZ], 0.02, 0.005, 6, METAL, IRON);

    // ---- left wing: projects 3.5 m, side wall (facing the porch) with a 6-over-6 window, hip roof, gutters ----
    const WX = -2.6, WZF = 3.5;
    box(-7.5, 0, WZ0, WX - 0.12, 2.62, WZF, SID);
    box(WX - 0.12, 0, WZ0, WX, 1.0, WZF, SID); box(WX - 0.12, 2.30, WZ0, WX, 2.62, WZF, SID);
    box(WX - 0.12, 1.0, 2.75, WX, 2.30, WZF, SID); box(WX - 0.12, 1.0, WZ0, WX, 2.30, 1.65, SID);
    sashWindow([WX, 1.0, 2.75], [1, 0, 0], 1.10, 1.30, 0.07, 3, 2, 2);
    casing([WX, 1.0, 2.75], [1, 0, 0], 1.10, 1.30, 0.1, 0.025);
    box(-7.53, 0, WZ0, WX + 0.03, 0.32, WZF + 0.03, TRIM); box(-7.55, 0.32, WZ0, WX + 0.05, 0.36, WZF + 0.05, TRIM);
    box(WX - 0.15, 0.36, WZF - 0.15, WX + 0.025, 2.62, WZF + 0.025, TRIM);   // front corner boards
    box(WX, 0.36, 0, WX + 0.025, 2.62, 0.14, TRIM);                        // corner against the main wall
    box(-7.53, 2.42, WZ0, WX + 0.025, 2.62, WZF + 0.025, TRIM);           // frieze board under the eave
    // boxed eave: soffit and fascia on the side and the front
    box(WX, 2.60, 0, -2.15, 2.64, 3.95, TRIM); box(-7.95, 2.60, WZF, WX, 2.64, 3.95, TRIM);
    box(-2.17, 2.55, 0, -2.15, 2.75, 3.97, TRIM); box(-7.97, 2.55, 3.95, -2.15, 2.75, 3.97, TRIM);
    box(-2.15, 2.56, 0, -2.04, 2.73, 4.06, METAL, { aux: GALV }); box(-7.95, 2.56, 3.97, -2.04, 2.73, 4.06, METAL, { aux: GALV });
    const RH = 2.75 + 2.9 * Math.tan(Math.PI / 6);
    slope([-2.15, 2.75, 3.95], [-2.15, 2.75, WZ0], [-5.05, RH, WZ0], [-5.05, RH, 1.05], ROOF);
    tri([-7.95, 2.75, 3.95], [-2.15, 2.75, 3.95], [-5.05, RH, 1.05], ROOF);
    slope([-7.95, 2.75, WZ0], [-7.95, 2.75, 3.95], [-5.05, RH, 1.05], [-5.05, RH, WZ0], ROOF);
    beam([-2.15, 2.77, 3.95], [-5.05, RH + 0.02, 1.05], 0.05, 0.035, ROOF); beam([-7.95, 2.77, 3.95], [-5.05, RH + 0.02, 1.05], 0.05, 0.035, ROOF);
    beam([-5.05, RH + 0.02, 1.05], [-5.05, RH + 0.02, WZ0], 0.05, 0.035, ROOF);
    // downspouts: at the junction with the main wall and at the front corner
    cyl([-2.09, 2.6, 0.25], [-2.5, 2.35, 0.25], 0.035, 0.035, 8, METAL, GALV);
    cyl([-2.5, 2.36, 0.25], [-2.5, 0.18, 0.25], 0.035, 0.035, 8, METAL, GALV);
    cyl([-2.5, 0.2, 0.25], [-2.35, 0.05, 0.42], 0.035, 0.035, 8, METAL, GALV);
    cyl([-2.09, 2.6, 4.0], [-2.62, 2.35, 3.6], 0.035, 0.035, 8, METAL, GALV);
    cyl([-2.62, 2.36, 3.6], [-2.62, 0.18, 3.6], 0.035, 0.035, 8, METAL, GALV);
    cyl([-2.62, 0.2, 3.6], [-2.45, 0.05, 3.85], 0.035, 0.035, 8, METAL, GALV);
    for (const y of [0.7, 1.6, 2.2]) { box(-2.56, y, 0.2, -2.6 + 0.0, y + 0.03, 0.3, METAL, { aux: GALV }); box(-2.68, y, 3.56, -2.6, y + 0.03, 3.64, METAL, { aux: GALV }); }

    // ---- left section behind the wing: wall with a small round-headed window, hipped roof ----
    box(-7.5, 0, -8, WX, 4.95, WZ0, SID);
    const AWX = -3.2, AWS = 4.06;
    regionZ(arcXs(AWX, 0.31, 14), () => 3.75, arcY(AWX, AWS, 0.31), WZ0 + 0.004, 4, [3, 0.62], (p) => [p[0] - (AWX - 0.31), p[1] - 3.75]);
    archRing(AWX, AWS, 0.31, 0.39, WZ0, WZ0 + 0.07, TRIM, 16, { outer: true });
    box(AWX - 0.39, 3.75, WZ0, AWX - 0.31, AWS, WZ0 + 0.07, TRIM); box(AWX + 0.31, 3.75, WZ0, AWX + 0.39, AWS, WZ0 + 0.07, TRIM);
    box(AWX - 0.43, 3.68, WZ0, AWX + 0.43, 3.75, WZ0 + 0.11, TRIM);
    box(AWX - 0.012, 3.75, WZ0, AWX + 0.012, AWS + 0.3, WZ0 + 0.03, SASH); box(AWX - 0.31, AWS - 0.012, WZ0, AWX + 0.31, AWS + 0.012, WZ0 + 0.03, SASH);
    box(AWX - 0.06, AWS + 0.36, WZ0, AWX + 0.06, AWS + 0.47, WZ0 + 0.09, TRIM);
    box(-7.53, 4.72, -8, WX, 4.95, WZ0 + 0.03, TRIM);
    box(-7.9, 4.95, -8.4, WX, 5.10, 0.10, TRIM);
    box(-7.9, 4.97, 0.10, WX, 5.12, 0.21, METAL, { aux: GALV });
    for (let x = -7.6; x < WX - 0.1; x += 0.55) box(x, 4.82, WZ0, x + 0.07, 4.95, WZ0 + 0.3, TRIM);   // eave brackets
    slope([-7.9, 5.10, 0.10], [WX, 5.10, 0.10], [WX, 7.55, -4.15], [-3.65, 7.55, -4.15], ROOF);
    tri([-7.9, 5.10, -8.4], [-7.9, 5.10, 0.10], [-3.65, 7.55, -4.15], ROOF);

    // ---- right tower: tall window with cusped heads lighting the library, panelled base, pyramid roof ----
    const TX0 = 1.70, TX1 = 4.30, TZF = 1.6, TZW = 1.45, GZ = 1.50;
    box(TX0, 0, -1.0, TX1, 7.6, TZW, SID);
    box(TX0, 0, TZW, TX1, 1.05, TZF, SID); box(TX0, 4.45, TZW, TX1, 7.6, TZF, SID);
    box(TX0, 1.05, TZW, 2.20, 4.45, TZF, SID); box(3.80, 1.05, TZW, TX1, 4.45, TZF, SID);
    const trefoil = (cx) => (x) => {
      const u = x - cx, L = 3.70 + Math.sqrt(Math.max(0, 0.0256 - (u + 0.2) * (u + 0.2))), Rr = 3.70 + Math.sqrt(Math.max(0, 0.0256 - (u - 0.2) * (u - 0.2)));
      const T = Math.abs(u) <= 0.2 ? 3.78 + Math.sqrt(Math.max(0, 0.09 - (Math.abs(u) - 0.1) * (Math.abs(u) - 0.1))) : 0;
      return Math.max(3.70, L, Rr, T);
    };
    for (const cx of [2.56, 3.44]) {
      const f = trefoil(cx), xs = []; for (let i = 0; i <= 60; i++) xs.push(cx - 0.36 + 0.72 * i / 60);
      regionZ(xs, f, () => 4.45, TZF, TRIM);
      revealZ(xs, f, GZ, TZF, TRIM, -1);
      regionZ(xs, () => 3.38, f, GZ, 4, [1, 1.6], (p) => [p[0] - 2.20, p[1] - 1.05]);
      glassQuad([cx - 0.36, 1.05, GZ], [1, 0, 0], [0, 0, 1], 0, 0, 0.72, 2.23, 1, 1.6, cx - 0.36 - 2.20);
      box(cx - 0.36, 2.17, GZ, cx + 0.36, 2.23, GZ + 0.035, SASH);
      box(cx - 0.36, 1.05, GZ, cx - 0.33, 3.28, GZ + 0.03, SASH); box(cx + 0.33, 1.05, GZ, cx + 0.36, 3.28, GZ + 0.03, SASH);
      box(cx - 0.36, 1.05, GZ, cx + 0.36, 1.10, GZ + 0.03, SASH);
    }
    box(2.92, 1.05, TZW, 3.08, 4.45, TZF - 0.005, TRIM);
    box(2.20, 3.28, TZW, 3.80, 3.38, TZF - 0.02, TRIM);
    for (const x0 of [1.80, 3.80]) {
      box(x0, 1.05, TZF, x0 + 0.40, 4.45, TZF + 0.03, TRIM);
      box(x0 + 0.08, 1.12, TZF + 0.03, x0 + 0.115, 4.38, TZF + 0.045, TRIM); box(x0 + 0.285, 1.12, TZF + 0.03, x0 + 0.32, 4.38, TZF + 0.045, TRIM);
    }
    box(1.74, 4.45, TZF, 4.26, 4.60, TZF + 0.06, TRIM); box(1.70, 4.60, TZF, 4.30, 4.68, TZF + 0.12, TRIM);
    box(2.96, 4.30, TZF, 3.04, 4.45, TZF + 0.05, TRIM);
    box(1.76, 0.97, TZF - 0.05, 4.24, 1.05, TZF + 0.13, TRIM); box(1.86, 0.84, TZF, 4.14, 0.97, TZF + 0.03, TRIM);
    for (const x of [2.0, 3.0, 4.0]) box(x - 0.04, 0.86, TZF, x + 0.04, 0.97, TZF + 0.1, TRIM);
    // panelled wainscot and plinth
    box(1.80, 0.76, TZF, 4.20, 0.84, TZF + 0.025, TRIM); box(1.80, 0.26, TZF, 4.20, 0.32, TZF + 0.025, TRIM);
    for (let i = 0; i < 4; i++) {
      const x0 = 1.80 + i * 0.6;
      box(x0, 0.32, TZF, x0 + 0.05, 0.76, TZF + 0.025, TRIM);
      raisedPanel(x0 + 0.07, 0.34, x0 + 0.58, 0.74, TZF, TZF + 0.018, 0.05, TRIM);
    }
    box(4.15, 0.32, TZF, 4.20, 0.76, TZF + 0.025, TRIM);
    box(1.68, 0, TZF - 0.1, 4.32, 0.26, TZF + 0.05, TRIM);
    box(TX0, 0.26, TZF - 0.1, TX0 + 0.1, 7.3, TZF + 0.025, TRIM); box(TX1 - 0.1, 0.26, TZF - 0.1, TX1, 7.3, TZF + 0.025, TRIM);
    box(TX0 - 0.025, 0.26, TZF - 0.12, TX0, 7.3, TZF, TRIM);
    // two round-headed windows on the upper floor of the tower
    for (const cx of [2.6, 3.4]) {
      const s2 = 6.15;
      regionZ(arcXs(cx, 0.25, 14), () => 5.2, arcY(cx, s2, 0.25), TZF + 0.004, 4, [3, 0.5], (p) => [p[0] - (cx - 0.25), p[1] - 5.2]);
      archRing(cx, s2, 0.25, 0.33, TZF, TZF + 0.07, TRIM, 16, { outer: true });
      box(cx - 0.33, 5.2, TZF, cx - 0.25, s2, TZF + 0.07, TRIM); box(cx + 0.25, 5.2, TZF, cx + 0.33, s2, TZF + 0.07, TRIM);
      box(cx - 0.37, 5.12, TZF, cx + 0.37, 5.2, TZF + 0.11, TRIM);
      box(cx - 0.012, 5.2, TZF, cx + 0.012, s2 + 0.24, TZF + 0.03, SASH); box(cx - 0.25, 5.68, TZF, cx + 0.25, 5.72, TZF + 0.035, SASH);
    }
    box(TX0 - 0.03, 7.25, -1.0, TX1 + 0.03, 7.6, TZF + 0.03, TRIM);
    box(TX0 - 0.45, 7.6, -1.45, TX1 + 0.45, 7.78, TZF + 0.45, TRIM);
    for (let x = TX0 + 0.1; x < TX1; x += 0.42) box(x, 7.36, TZF, x + 0.08, 7.6, TZF + 0.4, TRIM);
    box(TX0 - 0.47, 7.62, TZF + 0.45, TX1 + 0.47, 7.80, TZF + 0.55, METAL, { aux: GALV });
    const AP = [3.0, 10.1, 0.3], E = [[1.25, -1.45], [4.75, -1.45], [4.75, 2.05], [1.25, 2.05]];
    for (let i = 0; i < 4; i++) { const a = E[(i + 3) % 4], b = E[i]; tri([a[0], 7.78, a[1]], [b[0], 7.78, b[1]], AP, ROOF); }
    for (const e of E) beam([e[0], 7.8, e[1]], [AP[0], AP[1] + 0.02, AP[2]], 0.05, 0.035, ROOF);
    cyl(AP, addv(AP, UP, 0.55), 0.03, 0.012, 6, METAL, IRON);
    cyl(addv(AP, UP, 0.2), addv(AP, UP, 0.28), 0.05, 0.05, 8, METAL, IRON);

    // ---- right section, set back ----
    box(TX1, 0, -8, 7.5, 5.0, -0.6, SID);
    sashWindow([5.1, 1.1, -0.6], [0, 0, 1], 0.9, 1.5, 0.1, 2, 1, 3);
    casing([5.1, 1.1, -0.6], [0, 0, 1], 0.9, 1.5, 0.1, 0.025);
    box(TX1, 0, -0.6, 7.5, 0.32, -0.57, TRIM);
    box(TX1, 5.0, -8.4, 7.9, 5.15, -0.2, TRIM);
    box(TX1, 5.02, -0.2, 7.9, 5.17, -0.09, METAL, { aux: GALV });
    slope([TX1, 5.15, -0.2], [7.9, 5.15, -0.2], [7.9, 7.1, -3.6], [TX1, 7.1, -3.6], ROOF);

    // ---- porch clutter: a cracked terracotta pot with dead stems ----
    cyl([-1.72, 0.22, 0.45], [-1.72, 0.47, 0.45], 0.14, 0.18, 14, METAL, [4, 0]);
    cyl([-1.72, 0.47, 0.45], [-1.72, 0.5, 0.45], 0.19, 0.19, 14, METAL, [4, 0]);
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
  const insideHouse = (x, z) => (x > -2.65 && x < 1.75 && z < 0.1) || (x > -2.4 && x < 1.75 && z < 2.9) || (x > -7.6 && x < -2.55 && z < 3.6)
    || (x > 1.65 && x < 4.35 && z < 1.7) || (x > 4.25 && x < 7.6 && z < -0.5);
  const paved = (x, z) => (x > -8 && x < 9 && z > 3.55 && z < 16) || (x > -2.25 && x < 9 && z > 1.6 && z < 3.55) || (x > 4.3 && x < 9 && z > -0.6 && z < 1.6);
  const gravel = (x, z) => x > -2.6 && x < -2.0 && z > 0 && z < 3.55 && !(x > -2.25 && z > 1.6);

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
    // dormant lawn beyond the paved forecourt
    const lawn = (x, z, h) => { if (!insideHouse(x, z) && !paved(x, z) && !gravel(x, z)) grassTuft(x, z, h, 0.75); };
    for (let i = 0; i < 5000; i++) lawn(-16 + 32 * R(), -9 + 26 * R(), 0.15 + 0.35 * R());
    for (let i = 0; i < 2500; i++) { const sd = R() < 0.5 ? -1 : 1; lawn(sd < 0 ? -8 - 3 * R() : 9 + 3 * R(), -2 + 14 * R(), 0.2 + 0.4 * R()); }
    // weeds in the paving joints, thicker along the walls and edges where nobody walks
    for (let i = 0; i < 3800; i++) {
      const x = -4.5 + 10.5 * R(), z = -0.6 + 10.5 * R();
      if (!paved(x, z)) continue;
      const nearWall = Math.exp(-Math.max(0, z - 1.65) * 0.9) + Math.exp(-Math.abs(x + 2.25) * 2.5);
      if (R() > 0.25 + 0.75 * Math.min(1, nearWall)) continue;
      const alongX = R() < 0.5, jx = 0.05 + 0.9 * Math.round((x - 0.05) / 0.9), jz = 0.9 * Math.round(z / 0.9);
      const px = alongX ? x : jx + (R() - 0.5) * 0.02, pz = alongX ? jz + (R() - 0.5) * 0.02 : z;
      if (paved(px, pz)) grassTuft(px, pz, 0.04 + 0.12 * R() * (0.4 + nearWall), 0.85);
    }
    // gravel strip along the left wing: dead weeds, a sword fern, dead bracken
    for (let i = 0; i < 260; i++) { const x = -2.58 + 0.55 * R(), z = 0.05 + 3.45 * R(); if (gravel(x, z)) grassTuft(x, z, 0.12 + 0.3 * R(), 0.8); }
    fern(-2.42, 0.45, 0.55, 0); fern(-2.45, 3.2, 0.45, 1); fern(-2.5, 1.35, 0.35, 1);
    // shrubs beside the tower and the right section: rhododendrons, a bare hydrangea
    rhodo(4.75, 0.55, 1.15); rhodo(6.3, -0.1, 1.3); hydrangea(5.5, 0.9, 0.9);
    for (const [x, z, s, d] of [[-8.3, 3.2, 0.7, 0], [-8.6, 1.0, 0.75, 1], [7.8, -0.2, 0.7, 1], [-9.5, -1.0, 0.8, 0], [8.4, 1.4, 0.6, 0]]) fern(x, z, s, d);
    bramble(-9.6, 2.6, 14); bramble(9.4, 0.4, 8);
    // bare big-leaf maple (left, mossy) and red alder (right), above the roofs
    bareTree(-9.8, -3.6, 15.5, 0.42, 1); bareTree(8.6, -4.6, 13, 0.26, 2);
    // second-growth Douglas firs behind the house
    for (const [x, z, H] of [[-19, -12, 36], [-11, -15, 41], [-4, -13, 33], [3.5, -16, 44], [9, -12, 31], [15, -14, 38], [22, -10, 30], [-26, -7, 34],
      [-7, -22, 40], [12, -23, 42], [0, -27, 39], [-17, -24, 37], [19, -20, 35], [27, -16, 33], [-30, -15, 36]]) fir(x, z, H, H * (0.12 + 0.12 * R()), H * 0.13, 9);
    for (const [x, z, H] of [[11.5, 1.5, 6.5], [-12.5, 0.5, 7.5], [13.5, -1.5, 9]]) fir(x, z, H, 0.4, H * 0.24, 7);   // young firs / hemlocks
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
  uniform vec3 uCam, uCamF, uFlashPos, uLamp, uAOmin, uAOsize;
  uniform float uFlash, uSky, uLampI, uFogK;
  const vec3 LAMP_C = vec3(1.0, 0.60, 0.27);     // high-pressure sodium
  const vec3 FLASH_C = vec3(1.0, 0.95, 0.88);
  const vec3 SKY_C = vec3(0.78, 0.82, 0.95);
  float flashCone(vec3 dir) { float c = dot(dir, uCamF); return mix(0.12, 1.0, smoothstep(0.72, 0.985, c)) * step(0.0, c); }
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
    // large weathered zones (where sun and rain hit) decide how much is left; within them paint lets go
    // board by board and along the grain, leaving long ragged strips with sharp edges
    float zone = fbm3(pq * 0.45 + 8.0);
    float survive = zone * 0.55 + fbm3(vec2(a.x * 0.7, a.y * 4.5) + 30.0) * 0.35 + fbm3(vec2(a.x * 3.0, a.y * 26.0)) * 0.16 - (0.80 - 0.46 * paintAmt);
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
    vec3 pc = pcol * (0.55 + 0.35 * fbm3(pq * 3.0)) * (1.0 - 0.6 * mil) * (1.0 - 0.45 * st) * (0.85 + 0.15 * zone);
    pc = mix(pc, pc * vec3(0.85, 0.82, 0.7), low);   // yellowed and dirty low down
    pc = mix(pc, c * 1.5, 0.35);                     // chalked, dirt ground into the paint film
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
  float shelter(vec3 p) {   // under the porch roof (0 open to the rain, 1 fully sheltered)
    float porch = step(-2.05, p.x) * step(p.x, 1.75) * step(p.z, 2.1) * step(p.y, 3.52);
    float eave = step(p.x, -2.55) * step(-2.75, p.x) * step(p.y, 2.62) * 0.35;   // narrow eave of the left wing
    return clamp(porch * (0.5 + 0.5 * smoothstep(2.1, 0.3, p.z)) + eave, 0.0, 1.0);
  }
  `;
  const PAINT_S = 'vec3(0.30, 0.295, 0.27)';    // old white paint on the siding
  const PAINT_T = 'vec3(0.33, 0.315, 0.275)';    // cream trim paint
  const PAINT_D = 'vec3(0.055, 0.095, 0.07)';   // dark green door paint
  const PAINT_B = 'vec3(0.22, 0.29, 0.30)';     // faded "haint blue" porch ceiling

  const MAT = [
    // ---------------- 0: wood (siding, trim, door, sashes, porch floor, ceiling) ----------------
    LIB + WOOD + `
  void material(inout Surf S) {
    vec3 p = vPos; float h = 0.0, wet; float sh = shelter(p);
    vec2 a; float tone = 1.0, pAmt = 0.4, mulA = 1.0, hAdd = 0.0; vec3 pc = ${PAINT_T};
    S.gloss = 6.0; float specB = 0.012;
    if (vMat == 0) {   // clapboard siding, 14 cm exposure
      float y = p.y / 0.14, f = fract(y), row = floor(y), along = p.x + p.z;
      float bl = 2.0 + 1.6 * h2(vec2(row, 3.0)), off = h2(vec2(row, 7.0));
      float seg = floor(along / bl + off), joint = abs(fract(along / bl + off) - 0.5) * bl;
      a = vec2(along + seg * 5.3, p.y + seg * 0.37); tone = 0.8 + 0.35 * h2(vec2(row, seg));
      pAmt = 0.30 + 0.4 * sh + 0.3 * (h2(vec2(row * 0.37, seg)) - 0.5) + 0.25 * smoothstep(1.2, 0.0, abs(p.y - 6.6)); pc = ${PAINT_S};
      float fw = fwidth(y);
      hAdd = 0.010 * (1.0 - f) * smoothstep(0.0, max(0.04, fw * 2.0), f);
      S.occ = mix(0.5, 1.0, smoothstep(0.0, max(0.06, fw * 2.0), f)) * mix(1.0, 0.75, smoothstep(0.75, 1.0, f));
      mulA = (joint > bl * 0.5 - 0.008 ? 0.4 : 1.0) * (1.0 - 0.3 * step(0.9, h2(vec2(row, seg + 11.0))) * (1.0 - f)) * (f < 0.04 ? 0.45 : 1.0);
      specB = 0.012;
    } else if (vMat == 1 || vMat == 11 || vMat == 3 || vMat == 9) {   // trim boards and mouldings, window sashes, slats
      float across = vMat == 11 ? p.x + p.z : (abs(vNor.y) > 0.5 ? p.z : p.y);
      a = vMat == 11 ? vec2(p.y, across) : vec2(p.x + p.z, across);
      pAmt = (0.42 + 0.4 * sh) * smoothstep(0.2, 0.7, p.y) + 0.08; if (vMat == 3) pAmt = 0.55;
      mulA = edgeWear(vUv); specB = 0.014; S.gloss = 7.0;
    } else if (vMat == 2) {   // door: dark green paint, mostly worn off where hands and feet touch it
      a = abs(vNor.z) > 0.5 && fwidth(p.y) > 0.0 ? vec2(p.y, p.x * 1.5) : vec2(p.x, p.y);
      pAmt = 0.65 - 0.4 * smoothstep(0.7, 0.2, p.y); pc = ${PAINT_D}; specB = 0.016; S.gloss = 8.0;
    } else if (vMat == 8) {   // porch floor and step treads: grey boards running out from the wall
      float b = p.x / 0.11, bi = floor(b), bf = fract(b), fw = fwidth(b);
      a = vec2(p.z + bi * 3.1, p.x); tone = 0.75 + 0.3 * h2(vec2(bi, 2.0)); pAmt = 0.15;
      mulA = mix(0.25, 1.0, smoothstep(0.03, 0.05 + fw * 1.5, bf) * smoothstep(0.03, 0.05 + fw * 1.5, 1.0 - bf));
      hAdd = 0.003 * sin(3.14159 * bf);
      specB = 0.015; S.gloss = 8.0;
    } else {   // 13: beadboard porch ceiling, faded blue paint flaking off
      float b = p.x / 0.085, bi = floor(b), bf = fract(b), fw = fwidth(b);
      a = vec2(p.z + bi * 2.3, p.x); pAmt = 0.75; pc = ${PAINT_B};
      mulA = mix(0.35, 1.0, smoothstep(0.0, 0.06 + fw, bf) * smoothstep(0.0, 0.06 + fw, 1.0 - bf)) * (1.0 - 0.15 * (1.0 - smoothstep(0.0, 0.12, abs(bf - 0.5))));
      hAdd = -0.002 * (1.0 - smoothstep(0.0, 0.1, abs(bf - 0.5)));
      S.occ = 0.85;
    }
    S.alb = wood(a, p, tone, sh, pAmt, pc, h, wet) * mulA;
    h += hAdd;
    S.spec = specB + 0.04 * wet;
    if (vMat == 8) {   // leaves blown onto the porch, piled against the wall, in the corners and on the step
      float worn = exp(-sq(p.x / 0.6)) * smoothstep(0.0, 1.4, p.z) * step(0.2, p.y);
      S.alb = mix(S.alb, S.alb * 1.25 + 0.01, worn * 0.4);
      vec3 lc = cell2(p.xz * vec2(5.5, 7.0) + 13.0);
      float pile = smoothstep(0.9, 0.1, p.z) * 0.6 + smoothstep(1.3, 1.95, abs(p.x + 0.15)) * 0.5 + (p.y < 0.15 ? 0.35 : 0.0);
      float leaf = step(1.0 - 0.6 * pile, lc.z) * smoothstep(0.42, 0.28, lc.x);
      vec3 lcol = mix(vec3(0.16, 0.085, 0.03), vec3(0.24, 0.15, 0.05), h2(vec2(lc.z * 97.0, 1.0))) * (0.6 + 0.6 * vn(p.xz * 40.0));
      S.alb = mix(S.alb, lcol, leaf); h += leaf * 0.002;
    }
    S.n = bumpN(S.n, h);
  }`,
    // ---------------- 1: old window glass and the rooms behind it (interior mapping) ----------------
    LIB + `
  // a flat silhouette ("card") parallel to the glass at depth z inside the room
  void cardHit(inout float tb, inout vec3 alb, inout vec3 nrm, vec3 o, vec3 dl, float z, float cover, vec3 c) {
    float t = z / dl.z;
    if (cover > 0.5 && t < tb) { tb = t; alb = c; nrm = vec3(0.0, 0.0, -1.0); }
  }
  float rect(vec2 p, vec2 a, vec2 b) { return step(a.x, p.x) * step(p.x, b.x) * step(a.y, p.y) * step(p.y, b.y); }
  vec3 wallpaper(vec2 q, float type) {
    float stripe = smoothstep(0.3, 0.7, abs(fract(q.x * 6.0) - 0.5) * 2.0);
    float dam = vn(vec2(fract(q.x * 6.0) * 6.0, q.y * 7.0) + floor(q.x * 6.0) * 3.0);
    vec3 base = type < 0.5 ? vec3(0.16, 0.12, 0.08) : (type < 1.5 ? vec3(0.07, 0.10, 0.075) : vec3(0.17, 0.13, 0.11));
    vec3 c = base * (0.8 + 0.25 * stripe + 0.2 * dam);
    c *= 0.75 + 0.35 * fbm3(q * 1.7);                                       // water stains, fading
    return c * (1.0 - 0.4 * smoothstep(0.6, 0.85, fbm3(q * 3.0 + 7.0)));     // mould
  }
  void material(inout Surf S) {
    int type = int(vAux.x + 0.5); float W = vAux.y;
    vec3 N = normalize(vNor), Rt = normalize(cross(vec3(0.0, 1.0, 0.0), N));
    vec3 Vv = normalize(uCam - vPos);
    vec2 wq = vec2(dot(vPos, Rt), vPos.y);
    vec2 wav = vec2(vn(wq * 4.0) - 0.5, vn(wq * 4.0 + 40.0) - 0.5);   // old cylinder glass is wavy
    S.n = normalize(N + (Rt * wav.x + vec3(0.0, 1.0, 0.0) * wav.y) * 0.03);
    S.glass = 1.0; S.spec = 1.0; S.gloss = 6000.0;
    // dirt film: heavier in the corners of each pane and in runs from the bottom
    float grime = 0.35 + 0.65 * fbm3(wq * 6.0 + 3.0) * (0.6 + 0.6 * smoothstep(0.6, 0.0, vUv.y));
    S.alb = vec3(0.045, 0.043, 0.036) * grime;
    vec3 d = normalize(-Vv + (Rt * wav.x + vec3(0.0, 1.0, 0.0) * wav.y) * 0.02);
    vec3 dl = vec3(dot(d, Rt), d.y, max(-dot(d, N), 0.03));
    vec3 o = vec3(vUv.x, vPos.y, 0.0);
    float y0 = vPos.y - vUv.y;   // bottom of this window
    float xl, xr, D, fy, cy;
    if (type == 0) { xl = -0.9; xr = W + 0.9; D = 6.5; fy = 0.24; cy = 3.7; }          // hall behind the front doors
    else if (type == 1) { xl = -1.3; xr = W + 2.0; D = 4.4; fy = 0.30; cy = 4.0; }     // library in the tower
    else if (type == 2) { xl = -1.6; xr = W + 1.4; D = 3.8; fy = 0.40; cy = 2.55; }    // sitting room in the wing
    else { xl = -1.0; xr = W + 1.0; D = 3.2; fy = y0 - 0.7; cy = fy + 2.6; }           // upstairs rooms
    float tx = dl.x > 0.0 ? (xr - o.x) / dl.x : (xl - o.x) / min(dl.x, -1e-4);
    float ty = dl.y > 0.0 ? (cy - o.y) / dl.y : (fy - o.y) / min(dl.y, -1e-4);
    float tz = D / dl.z;
    float t = min(tz, min(tx, ty));
    vec3 hp = o + dl * t, nl, alb;
    float tpe = float(type);
    if (t == tz) {           // back wall
      nl = vec3(0.0, 0.0, -1.0); alb = wallpaper(hp.xy, tpe);
      if (type == 1 && hp.y < fy + 3.0) {   // floor-to-ceiling bookcases
        float sy = (hp.y - fy - 0.08) / 0.36, sr = floor(sy), sf = fract(sy);
        float bx = hp.x / 0.042 + sr * 7.3, bid = floor(bx);
        float bh = 0.55 + 0.4 * h2(vec2(bid, sr)), gap = step(0.9, h2(vec2(bid * 0.31, sr + 4.0)));
        vec3 bc = mix(vec3(0.10, 0.03, 0.025), vec3(0.03, 0.06, 0.04), step(0.5, h2(vec2(bid, sr + 9.0))));
        bc = mix(bc, vec3(0.13, 0.10, 0.06), step(0.75, h2(vec2(bid, sr + 2.0)))) * (0.6 + 0.6 * h2(vec2(bid, sr + 5.0)));
        bc *= 0.75 + 0.25 * smoothstep(0.0, 0.15, abs(fract(bx) - 0.5));
        alb = sf < 0.07 ? vec3(0.07, 0.045, 0.03) : (sf - 0.07 < bh * 0.93 && gap < 0.5 ? bc : vec3(0.015, 0.012, 0.01));
        if (abs(fract(hp.x / 0.95) - 0.5) > 0.47) alb = vec3(0.07, 0.045, 0.03);
      } else if (type == 0) {   // dark doorway at the end of the hall, a picture on the wall
        if (abs(hp.x - W * 0.5) < 0.5 && hp.y < fy + 2.2) alb = vec3(0.004);
        if (rect(hp.xy, vec2(W * 0.5 - 1.3, fy + 1.4), vec2(W * 0.5 - 0.75, fy + 1.9)) > 0.5) alb = vec3(0.09, 0.07, 0.04);
      } else if (type == 2) {   // a framed print and a fireplace
        if (rect(hp.xy, vec2(W * 0.5 - 0.35, fy + 1.3), vec2(W * 0.5 + 0.35, fy + 1.8)) > 0.5) alb = vec3(0.12, 0.10, 0.07) * (0.6 + 0.6 * vn(hp.xy * 9.0));
        if (rect(hp.xy, vec2(W * 0.5 - 0.6, fy), vec2(W * 0.5 + 0.6, fy + 1.05)) > 0.5) alb = rect(hp.xy, vec2(W * 0.5 - 0.35, fy), vec2(W * 0.5 + 0.35, fy + 0.7)) > 0.5 ? vec3(0.008) : vec3(0.10, 0.09, 0.08);
      }
      if (hp.y < fy + 0.15) alb = vec3(0.04, 0.03, 0.02);
    } else if (t == tx) {    // side walls: wallpaper over a wooden dado
      nl = vec3(-sign(dl.x), 0.0, 0.0); alb = wallpaper(vec2(hp.z, hp.y), tpe);
      if (hp.y < fy + 0.9) alb = vec3(0.06, 0.04, 0.025) * (0.8 + 0.3 * vn(hp.zy * 20.0));
      if (type == 1 && hp.y < fy + 3.0 && hp.z > 0.8) {   // more books on the side wall
        float sy = (hp.y - fy - 0.08) / 0.36, sf = fract(sy), bx = hp.z / 0.042 + floor(sy) * 5.1;
        alb = sf < 0.07 ? vec3(0.07, 0.045, 0.03) : vec3(0.05, 0.03, 0.02) * (0.5 + h2(vec2(floor(bx), floor(sy))));
      }
    } else if (dl.y < 0.0) { // floor: dusty boards, a rug, hall tiles
      nl = vec3(0.0, 1.0, 0.0);
      alb = vec3(0.07, 0.045, 0.028) * (0.7 + 0.5 * vn(vec2(hp.x * 0.5, hp.z * 12.0))) * (0.8 + 0.2 * step(0.04, fract(hp.x / 0.11)));
      if (type == 0) { vec2 tq = floor(hp.xz / 0.25); alb = mod(tq.x + tq.y, 2.0) < 0.5 ? vec3(0.22, 0.20, 0.17) : vec3(0.03, 0.025, 0.02); alb *= 0.6 + 0.4 * fbm3(hp.xz * 3.0); }
      if (type != 0 && rect(hp.xz, vec2(0.0, 0.7), vec2(W + 0.3, 3.0)) > 0.5) alb = vec3(0.12, 0.04, 0.03) * (0.6 + 0.5 * vn(hp.xz * 14.0)) * (0.7 + 0.3 * step(0.15, min(min(hp.x, W + 0.3 - hp.x), min(hp.z - 0.7, 3.0 - hp.z))));
    } else {                 // ceiling: stained plaster
      nl = vec3(0.0, -1.0, 0.0); alb = vec3(0.20, 0.19, 0.17) * (0.6 + 0.5 * fbm3(hp.xz * 1.3));
    }
    // furniture and fittings as silhouettes at their depths (nearest wins)
    float tb = t; vec3 ca = alb, cn = nl;
    if (type == 1) {
      float zc = 1.7, xc = W * 0.32, tc = zc / dl.z; vec2 q = (o + dl * tc).xy;   // brass chandelier
      float ch = step(abs(q.x - xc), 0.008) * step(cy - 0.62, q.y)
        + step(abs(q.x - xc), 0.035) * step(cy - 1.0, q.y) * step(q.y, cy - 0.6)
        + step(abs(q.y - (cy - 0.86) - 0.05 * sq((q.x - xc) / 0.36)), 0.018) * step(abs(q.x - xc), 0.36)
        + step(abs(abs(q.x - xc) - 0.34), 0.022) * step(cy - 0.86, q.y) * step(q.y, cy - 0.70)
        + step(abs(abs(q.x - xc) - 0.17), 0.02) * step(cy - 0.88, q.y) * step(q.y, cy - 0.74);
      cardHit(tb, ca, cn, o, dl, zc, ch, vec3(0.10, 0.075, 0.04));
      float zt = 0.75, xt = W - 0.32; tc = zt / dl.z; q = (o + dl * tc).xy;      // side table and lamp with a cloth shade
      float table = rect(q, vec2(xt - 0.33, fy + 0.70), vec2(xt + 0.33, fy + 0.75)) + step(abs(abs(q.x - xt) - 0.28), 0.022) * step(q.y, fy + 0.70);
      cardHit(tb, ca, cn, o, dl, zt, table, vec3(0.05, 0.03, 0.018));
      float lb = step(abs(q.x - xt), 0.03 + 0.05 * sin(clamp((q.y - fy - 0.75) / 0.34, 0.0, 1.0) * 3.14159)) * step(fy + 0.75, q.y) * step(q.y, fy + 1.10);
      cardHit(tb, ca, cn, o, dl, zt - 0.01, lb, vec3(0.13, 0.10, 0.06));
      float sf = clamp((q.y - fy - 1.10) / 0.28, 0.0, 1.0), shade = step(abs(q.x - xt), mix(0.21, 0.13, sf)) * step(fy + 1.10, q.y) * step(q.y, fy + 1.38);
      cardHit(tb, ca, cn, o, dl, zt - 0.02, shade, vec3(0.40, 0.34, 0.24) * (0.85 + 0.15 * sin(q.x * 160.0)));
      float zw = 1.5, xw = W * 0.72; tc = zw / dl.z; q = (o + dl * tc).xy;      // wingback chair
      float chair = step(abs(q.x - xw), 0.36) * step(fy + 0.12, q.y) * step(q.y, fy + 1.05 + 0.08 * (1.0 - sq((q.x - xw) / 0.36)));
      cardHit(tb, ca, cn, o, dl, zw, chair, vec3(0.05, 0.065, 0.045) * (0.7 + 0.4 * vn(q * 30.0)));
    } else if (type == 0) {
      float zs = 1.1; float tc = zs / dl.z; vec2 q = (o + dl * tc).xy;            // coat stand with a coat on it
      float cs = step(abs(q.x - 0.3), 0.02) * step(q.y, fy + 1.85) + step(abs(q.x - 0.36), 0.16 - 0.05 * (q.y - fy - 1.0)) * step(fy + 0.75, q.y) * step(q.y, fy + 1.7);
      cardHit(tb, ca, cn, o, dl, zs, cs, vec3(0.025, 0.022, 0.02));
      if (dl.x > 0.0) {   // staircase along the right wall: stringer and balusters
        float xs = W + 0.35, ts = (xs - o.x) / dl.x; vec3 sp = o + dl * ts;
        float rise = fy + max(0.0, sp.z - 1.8) * 0.65;
        float st = step(sp.y, rise) + step(sp.y, rise + 0.92) * step(rise + 0.1, sp.y) * step(0.7, fract(sp.z / 0.14)) + step(abs(sp.y - rise - 0.92), 0.03);
        if (st > 0.5 && ts < tb && sp.z > 1.8) { tb = ts; ca = vec3(0.06, 0.035, 0.02); cn = vec3(-1.0, 0.0, 0.0); }
      }
    } else if (type == 2) {
      float zw = 1.4, xw = W * 0.4, tc = zw / dl.z; vec2 q = (o + dl * tc).xy;
      float chair = step(abs(q.x - xw), 0.38) * step(fy + 0.1, q.y) * step(q.y, fy + 0.95 + 0.06 * (1.0 - sq((q.x - xw) / 0.38)));
      cardHit(tb, ca, cn, o, dl, zw, chair, vec3(0.09, 0.06, 0.04) * (0.7 + 0.4 * vn(q * 25.0)));
    } else {
      float zw = 1.8, tc = zw / dl.z; vec2 q = (o + dl * tc).xy;                  // a wardrobe in the dark
      cardHit(tb, ca, cn, o, dl, zw, rect(q, vec2(W * 0.5, fy), vec2(W * 0.5 + 1.0, fy + 2.0)), vec3(0.04, 0.025, 0.015));
    }
    // light reaching the room: the LED flash (through the glass twice), sky light through the windows, the sodium lamp
    float dc = length(uCam - vPos), dist = dc + tb;
    float Ef = uFlash / (dist * dist) * flashCone(d) * max(dot(cn, -dl), 0.0) * 0.72;
    vec3 E = FLASH_C * Ef + SKY_C * uSky * 0.3 * (0.35 + 0.65 * exp(-tb * 0.5)) + LAMP_C * uLampI * 0.002 * exp(-tb * 0.6);
    vec3 room = ca / 3.14159 * E;
    // curtains right behind the glass, lit from outside
    float Eg = uFlash / (dc * dc) * flashCone(d) * max(dot(N, Vv), 0.0) * 0.88;
    vec3 Eo = FLASH_C * Eg + SKY_C * uSky * 1.2 + LAMP_C * uLampI / dot(uLamp - vPos, uLamp - vPos) * max(dot(N, normalize(uLamp - vPos)), 0.0) * 0.6;
    vec2 cq = (o + dl * (0.03 / dl.z)).xy;
    float cov = 0.0; vec3 calb = vec3(0.0);
    if (type == 0) {        // lace, gathered into soft folds
      float fold = 0.5 + 0.5 * sin(cq.x * 48.0 + 2.0 * vn(cq * 3.0));
      vec3 lc = cell2(cq * vec2(55.0, 40.0));
      float lace = 0.55 + 0.35 * smoothstep(0.2, 0.45, lc.y - lc.x) + 0.2 * fold;
      cov = clamp(lace, 0.0, 0.92); calb = vec3(0.24, 0.22, 0.17) * (0.75 + 0.35 * fold) * (0.8 + 0.3 * fbm3(cq * 5.0));
    } else if (type == 1 || type == 2) {   // heavy drapes at the sides, a half-drawn roller blind in the wing
      float sideW = (type == 1 ? 0.2 : 0.3) + 0.08 * sin(cq.y * 3.0) - 0.07 * exp(-sq((cq.y - fy - 1.1) / 0.2));
      float dr = step(cq.x, sideW) + step(W - sideW, cq.x);
      float fold = 0.5 + 0.5 * sin(cq.x * 70.0 + vn(cq * 4.0) * 3.0);
      if (dr > 0.5) { cov = 1.0; calb = (type == 1 ? vec3(0.075, 0.03, 0.026) : vec3(0.09, 0.07, 0.045)) * (0.5 + 0.6 * fold); }
      if (type == 2 && cq.y > y0 + 0.72) { cov = 0.97; calb = vec3(0.17, 0.14, 0.085) * (0.75 + 0.3 * fbm3(cq * 6.0)) * (1.0 - 0.4 * smoothstep(0.02, 0.0, abs(cq.y - y0 - 0.74))); }
    } else {                // upstairs: roller blinds pulled most of the way down, one torn
      float lim = y0 + 0.25 + 0.6 * h2(floor(vPos.xz * 1.3) + 3.0);
      float torn = step(0.82, h2(floor(vPos.xz * 1.3))) * step(0.55, vn(cq * vec2(6.0, 2.0)));
      if (cq.y > lim && torn < 0.5) { cov = 0.96; calb = vec3(0.17, 0.14, 0.085) * (0.7 + 0.35 * fbm3(cq * 4.0)) * (1.0 - 0.3 * smoothstep(0.03, 0.0, abs(cq.y - lim))); }
    }
    vec3 curtain = calb / 3.14159 * Eo;
    S.inside = mix(room, curtain, cov);
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
    } else if (vMat == 6) {   // old concrete paving slabs, 0.9 m: stained, cracked, slightly sunken, moss and dead grass in the joints
      vec2 s = (xz - vec2(0.05, 0.0)) / 0.9, si = floor(s), sf = fract(s);
      float fw = fwidth(s.x) + fwidth(s.y);
      float j = min(min(sf.x, 1.0 - sf.x), min(sf.y, 1.0 - sf.y));
      vec3 c = mix(vec3(0.07, 0.07, 0.065), vec3(0.16, 0.155, 0.145), fbm3(xz * 1.4 + si * 3.0)) * (0.8 + 0.3 * vn(xz * 16.0));
      c *= 0.8 + 0.3 * h2(si);
      float damp = smoothstep(0.48, 0.72, fbm3(xz * 1.1 + 11.0) + 0.25 * smoothstep(0.12, 0.0, j));
      c = mix(c, c * 0.5, damp);
      vec3 lc0 = cell2(xz * 8.0 + 3.0);
      c = mix(c, vec3(0.20, 0.20, 0.16), step(0.88, lc0.z) * smoothstep(0.3, 0.12, lc0.x) * 0.55);   // lichen spots
      float edge = 1.0 - smoothstep(0.0, 0.035 + fw, j);                                              // chipped arrises
      float joint = 1.0 - smoothstep(0.008, 0.012 + fw * 0.8, j);
      float moss = smoothstep(0.08, 0.0, j) * smoothstep(0.35, 0.65, fbm3(xz * 3.0 + 4.0));
      c = mix(c, c * 0.65, edge * 0.6);
      c = mix(c, vec3(0.03, 0.045, 0.018) * (0.7 + 0.6 * vn(xz * 40.0)), max(joint * 0.9, moss * 0.7));
      float crack = (1.0 - smoothstep(0.0, 0.01 + fw * 0.3, abs(vn(xz * 2.5 + si * 7.0) - 0.5))) * step(0.55, h2(si + 4.0));
      c = mix(c, vec3(0.02), crack * 0.8);
      h += -0.006 * edge - 0.008 * joint - 0.003 * crack + (h2(si + 9.0) - 0.5) * 0.0 + (sf.x - 0.5) * 0.004 * (h2(si + 1.0) - 0.5) + (sf.y - 0.5) * 0.004 * (h2(si + 2.0) - 0.5);
      float wall = smoothstep(1.2, 0.0, p.z - 1.6) + smoothstep(0.6, 0.0, abs(p.x + 2.25));
      vec3 lc; float lh; float lf = leafLitter(xz, 0.10 + 0.3 * wall + 0.08 * moss, lc, lh);
      S.alb = mix(c, lc, lf); h += lh;
      S.spec = 0.04 + 0.16 * damp * (1.0 - lf); S.gloss = 45.0 + 60.0 * damp;
    } else {                  // gravel: small rounded stones, dirt and needles between them
      vec3 g = cell2(xz * 38.0);
      float st = smoothstep(0.42, 0.18, g.x);
      vec3 c = mix(vec3(0.05, 0.045, 0.035), mix(vec3(0.13, 0.12, 0.11), vec3(0.2, 0.17, 0.13), g.z) * (0.7 + 0.5 * h2(vec2(g.z * 91.0, 2.0))), st);
      c = mix(c, vec3(0.03, 0.045, 0.02), smoothstep(0.55, 0.75, fbm3(xz * 2.0)) * (1.0 - st) * 0.8);
      h += st * 0.006;
      vec3 lc; float lh; float lf = leafLitter(xz, 0.25, lc, lh);
      S.alb = mix(c, lc, lf); h += lh; S.spec = 0.05; S.gloss = 30.0;
    }
    S.n = bumpN(S.n, h);
  }`,
    // ---------------- 3: roof ----------------
    LIB + `
  void metal(inout Surf S) {
    vec3 p = vPos; float k = vAux.x, h = 0.0;
    float r = fbm3(vec2(p.x + p.z, p.y) * 6.0), streak = smoothstep(0.55, 0.8, vn(vec2((p.x + p.z) * 25.0, p.y * 1.5)));
    if (k < 0.5) {        // galvanised gutters and downspouts: dull, patchy, rust runs, moss in the gutters
      S.alb = mix(vec3(0.13, 0.13, 0.125), vec3(0.20, 0.20, 0.19), r);
      S.alb = mix(S.alb, vec3(0.09, 0.045, 0.02), clamp(streak * 0.6 + smoothstep(0.65, 0.8, r) * 0.7, 0.0, 1.0));
      S.alb *= 1.0 - 0.4 * smoothstep(0.5, 0.0, p.y);
      S.spec = 0.07; S.gloss = 14.0; h = r * 0.001;
    } else if (k < 1.5) { // tarnished brass
      S.alb = mix(vec3(0.06, 0.045, 0.025), vec3(0.12, 0.085, 0.04), r) * (1.0 - 0.5 * streak); S.spec = 0.035; S.gloss = 12.0;
    } else if (k < 2.5) { // black iron, flaking
      S.alb = mix(vec3(0.02, 0.02, 0.02), vec3(0.07, 0.04, 0.025), smoothstep(0.55, 0.75, r)); S.spec = 0.035; S.gloss = 16.0;
    } else if (k < 3.5) { // frosted lantern glass, dirty, dead insects
      S.alb = vec3(0.07, 0.065, 0.05) * (0.6 + 0.5 * r) * (1.0 - 0.6 * step(0.86, vn(p.xy * 60.0))); S.spec = 0.06; S.gloss = 40.0;
    } else {              // terracotta, white efflorescence and moss
      S.alb = mix(vec3(0.16, 0.07, 0.04), vec3(0.24, 0.12, 0.07), r);
      S.alb = mix(S.alb, vec3(0.26, 0.25, 0.22), smoothstep(0.6, 0.8, vn(vec2(atan(p.x + 1.72, p.z - 0.45) * 3.0, p.y * 20.0))) * 0.6);
      S.alb = mix(S.alb, vec3(0.03, 0.05, 0.02), smoothstep(0.35, 0.25, p.y) * 0.6);
      S.spec = 0.03; S.gloss = 10.0;
    }
    S.n = bumpN(S.n, h);
  }
  void material(inout Surf S) {
    if (vMat == 17) { metal(S); return; }
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
    vec3 straw = mix(vec3(0.15, 0.12, 0.07), vec3(0.24, 0.20, 0.115), r);
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
  uniform highp sampler3D uAO;
  uniform highp sampler2DShadow uShadow;
  uniform mat4 uLampVP;
  layout(location=0) out vec4 oCol;
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
      L += S.inside * (1.0 - (0.04 + 0.96 * pow(1.0 - nv, 5.0))) * 0.85;   // the room (and curtains) seen through dirty glass
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
  const LAMP = [9.0, 5.8, 10.0];
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
    const LAMP_VP = mul(perspective(72 * Math.PI / 180, 1, 2, 70), lookAt(LAMP, [-0.8, 2.6, 0.0], UP));
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
