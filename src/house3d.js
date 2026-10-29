// Low-detail WebGL2 model of an old wooden house porch at night (after the reference image):
// covered porch with square columns, arched double doors, clapboard side wing with a railing,
// tall arched bay window on the right. Lighting: weak moonlight, a distant warm street lamp,
// and an optional camera flash (point light at the lens) for the photo.
(function () {
  const VS = `#version 300 es
  in vec3 aPos; in vec3 aNor; in vec2 aUv; in float aMat;
  uniform mat4 uVP;
  out vec3 vPos; out vec3 vNor; out vec2 vUv; flat out int vMat;
  void main() { vPos = aPos; vNor = aNor; vUv = aUv; vMat = int(aMat + 0.5); gl_Position = uVP * vec4(aPos, 1.0); }`;

  const FS = `#version 300 es
  precision highp float;
  in vec3 vPos; in vec3 vNor; in vec2 vUv; flat in int vMat;
  uniform vec3 uCam; uniform vec3 uFlashPos; uniform float uFlash; uniform float uExposure;
  uniform float uSeed; uniform float uGrain; uniform vec2 uRes; uniform float uDesat; uniform float uMoon;
  out vec4 outColor;

  float ih(vec2 p, float s) { uvec3 v = uvec3(ivec3(int(p.x), int(p.y), int(s))); v = v * 1664525u + 1013904223u; v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y; v ^= v >> 16u; v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y; return float(v.x & 0xFFFFu) / 65535.0; }
  float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
  float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; } return s; }

  // returns albedo, writes glass flag & roughness
  vec3 material(int m, vec2 uv, vec3 p, out float glass, out float spec) {
    glass = 0.0; spec = 0.04;
    float n = fbm(p.xy * 3.1 + p.z * 1.7);
    if (m == 0) { // clapboard siding, weathered grey-brown paint
      float y = p.y / 0.19; float f = fract(y);
      float edge = smoothstep(0.0, 0.12, f) * (0.78 + 0.22 * f);
      vec3 paint = mix(vec3(0.36, 0.33, 0.29), vec3(0.47, 0.44, 0.38), n);
      float peel = smoothstep(0.62, 0.7, fbm(vec2(p.x + p.z, p.y) * 2.4 + 7.0));
      paint = mix(paint, vec3(0.24, 0.17, 0.11), peel * 0.8);
      paint *= 0.88 + 0.12 * h21(vec2(floor(y), floor((p.x + p.z) * 0.6)));
      return paint * edge;
    }
    if (m == 1) { // trim, dirty off-white
      vec3 c = mix(vec3(0.40, 0.38, 0.33), vec3(0.55, 0.52, 0.45), n);
      float grime = smoothstep(0.35, 0.8, fbm(vec2(p.x * 1.5 + p.z, p.y * 6.0)));
      c = mix(c, vec3(0.20, 0.18, 0.14), grime * 0.55);
      return c * (0.85 + 0.15 * vnoise(p.xy * 20.0));
    }
    if (m == 2) { // arched door with glass upper half; uv 0..1
      vec2 q = uv;
      vec3 wood = mix(vec3(0.17, 0.11, 0.07), vec3(0.26, 0.17, 0.10), fbm(vec2(q.x * 3.0, q.y * 40.0)));
      // lower recessed panel
      if (q.y > 0.07 && q.y < 0.33 && q.x > 0.14 && q.x < 0.86) {
        float b = min(min(q.y - 0.07, 0.33 - q.y) * 3.0, min(q.x - 0.14, 0.86 - q.x));
        wood *= b < 0.03 ? 0.62 : 0.92;
      }
      // arched glass: rect from y .42 to .78, half-circle above centred at x .5
      float r = 0.36; vec2 c = vec2(0.5, 0.78);
      bool inArch = (q.y > 0.42 && q.y < 0.78 && abs(q.x - 0.5) < r) || (q.y >= 0.78 && length((q - c) * vec2(1.0, 1.55)) < r);
      if (inArch) {
        float gx = abs(fract((q.x - 0.14) / 0.24) - 0.5), gy = abs(fract((q.y - 0.42) / 0.12) - 0.5);
        if (gx > 0.45 || gy > 0.43) return wood * 1.15;
        glass = 1.0; spec = 1.0;
        float curtain = 0.5 + 0.5 * sin(q.x * 70.0 + fbm(q * 9.0) * 4.0);
        return vec3(0.05, 0.05, 0.055) + vec3(0.06, 0.055, 0.05) * curtain * smoothstep(0.5, 0.95, q.y);
      }
      return wood;
    }
    if (m == 3) { // sash window, uv 0..1, 2x3 panes
      float fx = abs(fract(uv.x * 2.0) - 0.5), fy = abs(fract(uv.y * 3.0) - 0.5);
      if (uv.x < 0.05 || uv.x > 0.95 || uv.y < 0.04 || uv.y > 0.96 || fx > 0.46 || fy > 0.44) return vec3(0.6, 0.57, 0.5) * (0.8 + 0.2 * n);
      glass = 1.0; spec = 1.0;
      float curtain = smoothstep(0.35, 0.0, abs(uv.x - 0.18)) + smoothstep(0.3, 0.0, abs(uv.x - 0.84));
      return vec3(0.03, 0.035, 0.04) + vec3(0.07, 0.065, 0.055) * curtain * (0.6 + 0.4 * sin(uv.x * 90.0));
    }
    if (m == 4) { // tall twin gothic-arch bay window
      vec2 q = uv; float lx = fract(q.x * 2.0); float side = step(0.5, q.x);
      float top = 0.80;
      bool inL = (q.y < top && abs(lx - 0.5) < 0.42) || (q.y >= top && length((vec2(lx, q.y) - vec2(0.5, top)) * vec2(1.0, 2.2)) < 0.42);
      if (!inL || q.y < 0.03) return vec3(0.58, 0.55, 0.49) * (0.8 + 0.2 * n);
      float gx = abs(fract(lx * 2.0) - 0.5), gy = abs(fract(q.y * 6.0) - 0.5);
      if ((gx > 0.47 && q.y < top) || gy > 0.46) return vec3(0.5, 0.47, 0.42);
      glass = 1.0; spec = 1.0;
      vec3 inside = vec3(0.02, 0.022, 0.025);
      // shelves of books inside (only visible when lit)
      float shelf = step(0.82, fract(q.y * 9.0));
      float books = step(0.4, h21(vec2(floor(q.x * 60.0), floor(q.y * 9.0))));
      inside += vec3(0.05, 0.035, 0.025) * books * (1.0 - shelf) * step(q.y, 0.7);
      // lamp shade silhouette lower right pane
      vec2 lp = vec2((q.x - 0.80) * 1.2, q.y - 0.27);
      if (side > 0.5 && lp.y > 0.0 && lp.y < 0.07 && abs(lp.x) < 0.06 - lp.y * 0.45) inside = vec3(0.16, 0.13, 0.09);
      return inside;
    }
    if (m == 5) { // ground: dead grass, dirt, leaves
      float g = fbm(p.xz * 1.3);
      vec3 c = mix(vec3(0.11, 0.10, 0.06), vec3(0.20, 0.18, 0.10), g);
      float leaf = step(0.83, vnoise(p.xz * 9.0 + 3.0));
      c = mix(c, vec3(0.30, 0.17, 0.07), leaf * 0.7);
      return c * (0.75 + 0.25 * vnoise(p.xz * 40.0));
    }
    if (m == 6) { // concrete path slabs
      vec2 s = p.xz / vec2(1.4, 1.1);
      float j = min(abs(fract(s.x) - 0.5), abs(fract(s.y) - 0.5));
      vec3 c = mix(vec3(0.30, 0.30, 0.29), vec3(0.42, 0.41, 0.39), fbm(p.xz * 2.0));
      c *= 0.85 + 0.15 * h21(floor(s));
      c = mix(c, vec3(0.14, 0.14, 0.12), step(0.62, fbm(p.xz * 3.0 + 11.0)) * 0.5); // moss / stains
      return c * (j > 0.485 ? 0.5 : 1.0);
    }
    if (m == 7) { // shingles
      float r = fract(p.y / 0.13 + p.z * 0.0);
      vec3 c = mix(vec3(0.10, 0.09, 0.09), vec3(0.17, 0.15, 0.14), fbm(vec2(p.x * 4.0, floor(p.y / 0.13))));
      return c * (0.7 + 0.3 * r);
    }
    if (m == 8) { // porch floor boards
      float b = fract(p.x / 0.12);
      vec3 c = mix(vec3(0.24, 0.21, 0.17), vec3(0.34, 0.30, 0.24), fbm(vec2(p.x * 8.0, p.z * 1.5)));
      return c * (b < 0.06 ? 0.5 : 1.0);
    }
    if (m == 9) { // railing slats, uv.x across
      float s = fract(uv.x * 22.0);
      if (s > 0.55 && uv.y > 0.08 && uv.y < 0.88) discard;
      return vec3(0.42, 0.39, 0.34) * (0.75 + 0.25 * n);
    }
    if (m == 10) { // tree silhouettes / far bushes
      return vec3(0.03, 0.035, 0.03);
    }
    return vec3(0.5);
  }

  void main() {
    float glass, spec;
    vec3 alb = material(vMat, vUv, vPos, glass, spec);
    vec3 N = normalize(vNor);
    vec3 V = normalize(uCam - vPos);
    vec3 col = vec3(0.0);
    float dist = length(uCam - vPos);
    // moonlight (dim, cool) + sky fill
    vec3 moonDir = normalize(vec3(0.45, 0.8, 0.5));
    col += alb * vec3(0.10, 0.125, 0.20) * uMoon * (0.35 * max(dot(N, moonDir), 0.0) + 0.18 * (0.6 + 0.4 * N.y));
    // distant street lamp, warm, from front-left
    vec3 lampPos = vec3(-11.0, 5.5, 9.0);
    vec3 Ld = lampPos - vPos; float d2 = dot(Ld, Ld); vec3 Ll = Ld / sqrt(d2);
    col += alb * vec3(1.0, 0.72, 0.42) * 3.5 / d2 * max(dot(N, Ll), 0.0);
    // camera flash
    if (uFlash > 0.0) {
      vec3 Fd = uFlashPos - vPos; float f2 = dot(Fd, Fd); vec3 Fl = Fd / sqrt(f2);
      float cone = smoothstep(0.65, 0.97, dot(-Fl, normalize(vec3(0.0, -0.05, -1.0))));
      vec3 fcol = vec3(1.0, 0.97, 0.92) * uFlash * 38.0 / f2 * (0.25 + 0.75 * cone);
      col += alb * fcol * max(dot(N, Fl), 0.0);
      vec3 H = normalize(Fl + V);
      col += fcol * spec * (glass > 0.5 ? 0.9 : 0.08) * pow(max(dot(N, H), 0.0), glass > 0.5 ? 220.0 : 18.0);
    }
    if (glass > 0.5) { // sky reflection
      vec3 R = reflect(-V, N);
      col += vec3(0.015, 0.02, 0.035) * uMoon * smoothstep(-0.1, 0.6, R.y);
    }
    col *= uExposure;
    col *= exp(-dist * 0.025);
    // filmic-ish tone curve
    col = col / (1.0 + col) * 1.12;
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(col, vec3(lum) * vec3(0.92, 0.98, 1.08), uDesat);
    // sensor grain (luma + a bit of chroma), stronger in shadows
    // vignette
    vec2 uv = gl_FragCoord.xy / uRes - 0.5;
    col *= 1.0 - 0.45 * dot(uv, uv) * 1.6;
    vec3 g = pow(max(col, 0.0), vec3(1.0 / 2.2));
    // sensor grain in display space (uncorrelated integer hash, 2px cells)
    vec2 sp = floor(gl_FragCoord.xy / 2.0);
    float gn = ih(sp, uSeed * 2.0) - 0.5, gc = ih(sp, uSeed * 2.0 + 1.0) - 0.5;
    float amt = uGrain * (0.45 + 0.55 * (1.0 - smoothstep(0.05, 0.6, dot(g, vec3(0.299, 0.587, 0.114)))));
    g += vec3(gn) * amt + vec3(gc, -gc * 0.5, gc * 0.3) * amt * 0.3;
    outColor = vec4(clamp(g, 0.0, 1.0), 1.0);
  }`;

  // sky: drawn as a fullscreen quad first
  const SKY_FS = `#version 300 es
  precision highp float; uniform vec2 uRes; uniform float uSeed; uniform float uGrain; uniform float uExposure; uniform float uMoon; out vec4 o;
  float ih(vec2 p, float s) { uvec3 v = uvec3(ivec3(int(p.x), int(p.y), int(s))); v = v * 1664525u + 1013904223u; v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y; v ^= v >> 16u; v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y; return float(v.x & 0xFFFFu) / 65535.0; }
  float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  void main() { vec2 q = gl_FragCoord.xy / uRes; vec3 c = mix(vec3(0.020, 0.024, 0.036), vec3(0.004, 0.005, 0.010), q.y) * uMoon * uExposure;
    c = c / (1.0 + c); float g = (ih(floor(gl_FragCoord.xy / 2.0), uSeed * 2.0) - 0.5) * uGrain; o = vec4(clamp(pow(max(c, 0.0), vec3(1.0 / 2.2)) + g, 0.0, 1.0), 1.0); }`;
  const SKY_VS = `#version 300 es
  in vec2 aP; void main() { gl_Position = vec4(aP, 0.999, 1.0); }`;

  // ---------------- geometry ----------------
  const verts = [];
  function quad(p0, p1, p2, p3, n, mat, uvMode) {
    // p0..p3 counter-clockwise; uv either world-size or 0..1
    const uv = uvMode === 'unit' ? [[0, 0], [1, 0], [1, 1], [0, 1]] : [[0, 0], [1, 0], [1, 1], [0, 1]];
    for (const i of [0, 1, 2, 0, 2, 3]) {
      const p = [p0, p1, p2, p3][i];
      verts.push(p[0], p[1], p[2], n[0], n[1], n[2], uv[i][0], uv[i][1], mat);
    }
  }
  function box(x0, y0, z0, x1, y1, z1, mat, opt = {}) {
    const m = (face) => (opt.faces && opt.faces[face] !== undefined ? opt.faces[face] : mat);
    quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], m('front'));
    quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], m('back'));
    quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], m('left'));
    quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], m('right'));
    quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], m('top'));
    quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], m('bottom'));
  }
  const panelZ = (x0, y0, x1, y1, z, mat) => quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], [0, 0, 1], mat);
  const panelX = (z0, y0, z1, y1, x, mat, dir) => dir > 0
    ? quad([x, y0, z1], [x, y0, z0], [x, y1, z0], [x, y1, z1], [1, 0, 0], mat)
    : quad([x, y0, z0], [x, y0, z1], [x, y1, z1], [x, y1, z0], [-1, 0, 0], mat);
  function tri(a, b, c, mat) {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const l = Math.hypot(...n); n = n.map((v) => v / l);
    for (const p of [a, b, c]) verts.push(p[0], p[1], p[2], n[0], n[1], n[2], 0, 0, mat);
  }
  function slope(a, b, c, d, mat) { tri(a, b, c, mat); tri(a, c, d, mat); }

  function buildHouse() {
    const SID = 0, TRIM = 1, DOOR = 2, WIN = 3, BAY = 4, GROUND = 5, PATH = 6, ROOF = 7, FLOOR = 8, RAIL = 9, DARK = 10;
    // ground + path
    quad([-40, 0, 40], [40, 0, 40], [40, 0, -30], [-40, 0, -30], [0, 1, 0], GROUND);
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
    // gutter/downspout
    box(-2.62, 0.3, 1.2, -2.54, 3.85, 1.28, TRIM);
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
    // ---- background: trees and a dark neighbour ----
    for (const [x, z, h, w] of [[-14, -9, 11, 5], [-9, -12, 9, 4], [11, -10, 12, 6], [16, -6, 8, 4], [3, -14, 13, 7]]) box(x - w / 2, 0, z - w / 2, x + w / 2, h, z + w / 2, DARK);
    box(-14, 0, -6, -9, 4, -1, DARK);
  }

  // ---------------- matrices ----------------
  function perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
  }
  function lookAt(e, c, up) {
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const norm = (a) => { const l = Math.hypot(...a); return a.map((v) => v / l); };
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const z = norm(sub(e, c)), x = norm(cross(up, z)), y = cross(z, x);
    return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1];
  }
  function mul(a, b) { const o = new Array(16).fill(0); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) o[j * 4 + i] += a[k * 4 + i] * b[j * 4 + k]; return o; }

  // ---------------- renderer ----------------
  function compile(gl, vs, fs) {
    const p = gl.createProgram();
    for (const [t, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(p, s);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }

  function create(canvas) {
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: true });
    if (!gl) throw new Error('no webgl2');
    if (!verts.length) buildHouse();
    const prog = compile(gl, VS, FS), sky = compile(gl, SKY_VS, SKY_FS);
    const vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const st = 9 * 4;
    for (const [name, size, off] of [['aPos', 3, 0], ['aNor', 3, 12], ['aUv', 2, 24], ['aMat', 1, 32]]) {
      const loc = gl.getAttribLocation(prog, name); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, st, off);
    }
    const skyVao = gl.createVertexArray(); gl.bindVertexArray(skyVao);
    const sb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, sb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
    const sl = gl.getAttribLocation(sky, 'aP'); gl.enableVertexAttribArray(sl); gl.vertexAttribPointer(sl, 2, gl.FLOAT, false, 0, 0);
    const count = verts.length / 9;
    const U = (p, n) => gl.getUniformLocation(p, n);

    // opts: {cam:[x,y,z], target:[x,y,z], roll, fov(deg), flash 0..1, exposure, grain, seed, desat, moon}
    return function draw(o) {
      const w = canvas.width, h = canvas.height;
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      const r = o.roll || 0;
      const view = lookAt(o.cam, o.target, [Math.sin(r), Math.cos(r), 0]);
      const vp = mul(perspective((o.fov || 62) * Math.PI / 180, w / h, 0.1, 120), view);
      gl.disable(gl.DEPTH_TEST);
      gl.useProgram(sky); gl.bindVertexArray(skyVao);
      gl.uniform2f(U(sky, 'uRes'), w, h); gl.uniform1f(U(sky, 'uSeed'), o.seed || 0); gl.uniform1f(U(sky, 'uGrain'), o.grain || 0);
      gl.uniform1f(U(sky, 'uExposure'), o.exposure || 1); gl.uniform1f(U(sky, 'uMoon'), o.moon ?? 1);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.enable(gl.DEPTH_TEST);
      gl.useProgram(prog); gl.bindVertexArray(vao);
      gl.uniformMatrix4fv(U(prog, 'uVP'), false, new Float32Array(vp));
      gl.uniform3fv(U(prog, 'uCam'), o.cam);
      gl.uniform3fv(U(prog, 'uFlashPos'), [o.cam[0] + 0.02, o.cam[1] + 0.03, o.cam[2]]);
      gl.uniform1f(U(prog, 'uFlash'), o.flash || 0);
      gl.uniform1f(U(prog, 'uExposure'), o.exposure || 1);
      gl.uniform1f(U(prog, 'uSeed'), o.seed || 0);
      gl.uniform1f(U(prog, 'uGrain'), o.grain || 0);
      gl.uniform1f(U(prog, 'uDesat'), o.desat || 0);
      gl.uniform1f(U(prog, 'uMoon'), o.moon ?? 1);
      gl.uniform2f(U(prog, 'uRes'), w, h);
      gl.drawArrays(gl.TRIANGLES, 0, count);
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

  window.HOUSE3D = { create, handheld };
})();
