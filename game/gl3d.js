/*
 * FMLAB Monsters — motore 3D in WebGL puro (nessuna libreria esterna).
 *
 * Tutto è generato dal codice: le creature sono modelli low-poly costruiti
 * dai dati di specie e tipo, l'arena e la mappa da numeri casuali fissi.
 * Una sola tela WebGL viene spostata tra le schermate (titolo, mappa, lotta,
 * archivio), così il telefono tiene aperto un solo contesto grafico.
 */
(function (root) {
  'use strict';
  const E = root.FMLABEngine;

  // ---------- colori ----------
  function hex(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }
  function shade(c, amt) { return c.map((v) => Math.max(0, Math.min(1, v + amt / 255))); }
  function mix(a, b, k) { return a.map((v, i) => v + (b[i] - v) * k); }
  const WHITE = [1, 1, 1], BLACK = [0.04, 0.05, 0.08];

  // ---------- vettori e matrici (per colonne, come WebGL) ----------
  const V = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
    lerp: (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k],
  };
  /** T · Ry(yaw) · Rx(pitch) · Rz(roll) · S */
  function mat(t, r, s) {
    const yaw = r ? r[0] : 0, pitch = r ? r[1] : 0, roll = r ? r[2] : 0;
    const S = s == null ? [1, 1, 1] : typeof s === 'number' ? [s, s, s] : s;
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cx = Math.cos(pitch), sx = Math.sin(pitch), cz = Math.cos(roll), sz = Math.sin(roll);
    const R = [
      [cy * cz + sy * sx * sz, -cy * sz + sy * sx * cz, sy * cx],
      [cx * sz, cx * cz, -sx],
      [-sy * cz + cy * sx * sz, sy * sz + cy * sx * cz, cy * cx],
    ];
    const m = new Float32Array(16);
    for (let c = 0; c < 3; c++) for (let rr = 0; rr < 3; rr++) m[c * 4 + rr] = R[rr][c] * S[c];
    m[12] = t ? t[0] : 0; m[13] = t ? t[1] : 0; m[14] = t ? t[2] : 0; m[15] = 1;
    return m;
  }
  function mmul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
  }
  function xf(m, p) {
    return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
  }
  function perspective(fovy, asp, n, f) {
    const t = 1 / Math.tan(fovy / 2), o = new Float32Array(16);
    o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = (2 * f * n) / (n - f);
    return o;
  }
  /** Prospettiva che inquadra solo la zona libera view={x0,y0,x1,y1} (frazioni della tela). */
  function projFor(R, view, fovFor) {
    const W = R.canvas.width, H = R.canvas.height, v = view || { x0: 0, y0: 0, x1: 1, y1: 1 };
    const fw = Math.max(0.2, v.x1 - v.x0), fh = Math.max(0.2, v.y1 - v.y0);
    const freeAsp = (fw * W) / (fh * H);
    const fovFree = fovFor(freeAsp);
    const t = (1 / Math.tan(fovFree / 2)) * fh;
    const o = perspective(2 * Math.atan(1 / t), W / H, 0.1, 90);
    // il centro della zona libera diventa il centro dell'inquadratura
    o[8] = -((v.x0 + v.x1) - 1);
    o[9] = (v.y0 + v.y1) - 1;
    return o;
  }
  const smooth = (a, b, x) => { const k = clamp01((x - a) / (b - a)); return k * k * (3 - 2 * k); };
  function lookAt(e, c) {
    const z = V.norm(V.sub(e, c)), x = V.norm(V.cross([0, 1, 0], z)), y = V.cross(z, x);
    return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -V.dot(x, e), -V.dot(y, e), -V.dot(z, e), 1]);
  }
  const easeOutBack = (p) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); };
  const clamp01 = (v) => Math.max(0, Math.min(1, v));

  // ---------- forme di base (liste di triangoli) ----------
  const GEO = {};
  function geo(name, center, tris) {
    let ymin = Infinity, ymax = -Infinity;
    tris.forEach((t) => t.forEach((v) => { ymin = Math.min(ymin, v[1]); ymax = Math.max(ymax, v[1]); }));
    return { center, tris, ymin, ymax };
  }
  function ico(sub) {
    const key = 'ico' + sub;
    if (GEO[key]) return GEO[key];
    const t = (1 + Math.sqrt(5)) / 2;
    let vs = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(V.norm);
    const F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    let tris = F.map((f) => f.map((i) => vs[i]));
    for (let s = 0; s < sub; s++) {
      const out = [];
      tris.forEach(([a, b, c]) => {
        const ab = V.norm(V.lerp(a, b, 0.5)), bc = V.norm(V.lerp(b, c, 0.5)), ca = V.norm(V.lerp(c, a, 0.5));
        out.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
      });
      tris = out;
    }
    return (GEO[key] = geo(key, [0, 0, 0], tris));
  }
  function ring(seg, y, r) { const o = []; for (let i = 0; i < seg; i++) { const a = (i / seg) * Math.PI * 2; o.push([Math.cos(a) * r, y, Math.sin(a) * r]); } return o; }
  function cone(seg) {
    const key = 'cone' + seg;
    if (GEO[key]) return GEO[key];
    const rg = ring(seg, 0, 1), tris = [];
    for (let i = 0; i < seg; i++) { const a = rg[i], b = rg[(i + 1) % seg]; tris.push([a, b, [0, 1, 0]], [b, a, [0, 0, 0]]); }
    return (GEO[key] = geo(key, [0, 0.3, 0], tris));
  }
  function cyl(seg) {
    const key = 'cyl' + seg;
    if (GEO[key]) return GEO[key];
    const lo = ring(seg, 0, 1), hi = ring(seg, 1, 1), tris = [];
    for (let i = 0; i < seg; i++) {
      const j = (i + 1) % seg;
      tris.push([lo[i], lo[j], hi[j]], [lo[i], hi[j], hi[i]], [hi[i], hi[j], [0, 1, 0]], [lo[j], lo[i], [0, 0, 0]]);
    }
    return (GEO[key] = geo(key, [0, 0.5, 0], tris));
  }
  function box() {
    if (GEO.box) return GEO.box;
    const p = (x, y, z) => [x - 0.5, y - 0.5, z - 0.5];
    const q = (a, b, c, d) => [[a, b, c], [a, c, d]];
    const v = [p(0, 0, 0), p(1, 0, 0), p(1, 1, 0), p(0, 1, 0), p(0, 0, 1), p(1, 0, 1), p(1, 1, 1), p(0, 1, 1)];
    const tris = [].concat(q(v[0], v[1], v[2], v[3]), q(v[5], v[4], v[7], v[6]), q(v[4], v[0], v[3], v[7]), q(v[1], v[5], v[6], v[2]), q(v[3], v[2], v[6], v[7]), q(v[4], v[5], v[1], v[0]));
    return (GEO.box = geo('box', [0, 0, 0], tris));
  }
  function prism() {
    if (GEO.prism) return GEO.prism;
    const a = [-0.5, 0, -0.5], b = [0.5, 0, -0.5], c = [0.5, 0, 0.5], d = [-0.5, 0, 0.5], e = [-0.5, 1, 0], f = [0.5, 1, 0];
    const tris = [[a, b, f], [a, f, e], [d, e, f], [d, f, c], [a, e, d], [b, c, f], [a, d, c], [a, c, b]];
    return (GEO.prism = geo('prism', [0, 0.3, 0], tris));
  }
  function disc(seg) {
    const key = 'disc' + seg;
    if (GEO[key]) return GEO[key];
    const rg = ring(seg, 0, 1), tris = [];
    for (let i = 0; i < seg; i++) tris.push([rg[i], rg[(i + 1) % seg], [0, 0, 0]]);
    return (GEO[key] = geo(key, [0, -1, 0], tris));
  }

  // rumore stabile per vertice (stesso vertice → stesso spostamento, niente buchi)
  function vnoise(v, seed) {
    const s = Math.sin(Math.round(v[0] * 1000) * 12.9898 + Math.round(v[1] * 1000) * 78.233 + Math.round(v[2] * 1000) * 37.719 + seed * 11.13) * 43758.5453;
    return s - Math.floor(s);
  }

  // ---------- costruttore di modelli ----------
  // ogni vertice: posizione(3) normale(3) colore(3) luce propria(1) movimento(1) = 11 numeri
  function Builder(seed) { this.d = []; this.rng = E.makeRng((seed >>> 0) || 1); }
  Builder.prototype.tri = function (a, b, c, col, o, av) {
    o = o || {};
    let n = V.norm(V.cross(V.sub(b, a), V.sub(c, a)));
    const ce = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    if (o.inside) { if (V.dot(n, V.sub(ce, o.inside)) < 0) n = V.mul(n, -1); } else if (!o.keep && n[1] < 0) n = V.mul(n, -1);
    const j = o.jit == null ? 0.07 : o.jit, f = 1 + (this.rng() - 0.5) * 2 * j;
    const cc = [col[0] * f, col[1] * f, col[2] * f];
    const anims = av || [o.anim || 0, o.anim || 0, o.anim || 0];
    [a, b, c].forEach((v, i) => { this.d.push(v[0], v[1], v[2], n[0], n[1], n[2], cc[0], cc[1], cc[2], o.emis || 0, anims[i]); });
  };
  Builder.prototype.add = function (g, m, col, o) {
    o = o || {};
    const inside = xf(m, g.center), span = g.ymax - g.ymin || 1;
    const seed = o.seed || 0;
    g.tris.forEach((t) => {
      const p = t.map((v) => {
        if (!o.noise) return xf(m, v);
        const k = 1 + (vnoise(v, seed) * 2 - 1) * o.noise;
        return xf(m, [v[0] * k, v[1] * k, v[2] * k]);
      });
      let c = col;
      if (o.colorFn) c = o.colorFn([(t[0][0] + t[1][0] + t[2][0]) / 3, (t[0][1] + t[1][1] + t[2][1]) / 3, (t[0][2] + t[1][2] + t[2][2]) / 3]);
      const av = o.anim ? t.map((v) => o.anim * Math.max(0, (v[1] - g.ymin) / span)) : null;
      this.tri(p[0], p[1], p[2], c, { inside, jit: o.jit, emis: o.emis }, av);
    });
    return this;
  };
  Builder.prototype.quad = function (a, b, c, d, col, o) { this.tri(a, b, c, col, o); this.tri(a, c, d, col, o); };
  /** Copia dentro questo modello un altro modello (es. un asset GLB), spostato con la matrice m. */
  Builder.prototype.addBuilder = function (src, m) {
    const d = src.d;
    for (let i = 0; i < d.length; i += 33) {
      const p = [0, 1, 2].map((k) => xf(m, [d[i + k * 11], d[i + k * 11 + 1], d[i + k * 11 + 2]]));
      let n = V.norm(V.cross(V.sub(p[1], p[0]), V.sub(p[2], p[0])));
      // mantieni il verso della normale originale
      const on = [d[i + 3], d[i + 4], d[i + 5]], tn = V.norm([m[0] * on[0] + m[4] * on[1] + m[8] * on[2], m[1] * on[0] + m[5] * on[1] + m[9] * on[2], m[2] * on[0] + m[6] * on[1] + m[10] * on[2]]);
      if (V.dot(n, tn) < 0) n = V.mul(n, -1);
      for (let k = 0; k < 3; k++) {
        const j = i + k * 11;
        this.d.push(p[k][0], p[k][1], p[k][2], n[0], n[1], n[2], d[j + 6], d[j + 7], d[j + 8], d[j + 9], d[j + 10]);
      }
    }
    return this;
  };

  // ---------- disegno ----------
  const VS = `
attribute vec3 aPos; attribute vec3 aNrm; attribute vec4 aCol; attribute float aAnim;
uniform mat4 uProj; uniform mat4 uView; uniform mat4 uModel; uniform float uTime;
varying vec3 vN; varying vec3 vW; varying vec4 vC; varying float vWater;
void main() {
  vec3 p = aPos;
  vWater = aAnim < 0.0 ? 1.0 : 0.0;
  vec4 w0 = uModel * vec4(p, 1.0);
  float ph = w0.x * 1.7 + w0.z * 1.3;
  if (aAnim > 0.0) { p.x += sin(uTime * 3.1 + ph) * aAnim; p.z += cos(uTime * 2.3 + ph) * aAnim * 0.6; }
  else if (aAnim < 0.0) { p.y += sin(uTime * 1.6 + w0.x * 2.1 + w0.z * 1.7) * (-aAnim); }
  vec4 w = uModel * vec4(p, 1.0);
  vW = w.xyz; vN = (uModel * vec4(aNrm, 0.0)).xyz; vC = aCol;
  gl_Position = uProj * uView * w;
}`;
  const FS = `
precision mediump float;
varying vec3 vN; varying vec3 vW; varying vec4 vC; varying float vWater;
uniform vec3 uLight; uniform vec3 uSun; uniform vec3 uHemiSky; uniform vec3 uHemiGround; uniform float uAmb;
uniform vec3 uFog; uniform float uFogNear; uniform float uFogFar; uniform vec3 uCam;
uniform float uFlash; uniform float uAlpha; uniform vec3 uTint; uniform vec3 uFlashCol;
void main() {
  vec3 n = normalize(vN);
  float d = max(dot(n, -uLight), 0.0);
  vec3 hemi = mix(uHemiGround, uHemiSky, n.y * 0.5 + 0.5);
  vec3 base = vC.rgb * uTint;
  vec3 col = base * (hemi * uAmb + uSun * d * 0.85);
  vec3 vd = normalize(uCam - vW);
  float rim = pow(1.0 - max(dot(n, vd), 0.0), 3.0);
  col += rim * 0.22 * uHemiSky;
  col = mix(col, base * 1.25, vC.a);
  if (vWater > 0.5) {
    // acqua: riflesso del cielo che cresce guardando di taglio, più un luccichio del sole
    float fres = pow(1.0 - max(dot(n, vd), 0.0), 2.0);
    col = mix(col, uHemiSky * 1.02, 0.22 + 0.5 * fres);
    vec3 rl = reflect(normalize(uLight), n);
    col += uSun * pow(max(dot(rl, vd), 0.0), 28.0) * 0.55;
  }
  col = mix(col, uFlashCol, uFlash);
  float f = smoothstep(uFogNear, uFogFar, length(vW - uCam));
  col = mix(col, uFog, f);
  gl_FragColor = vec4(col, uAlpha);
}`;

  function Renderer(canvas) {
    this.canvas = canvas;
    this.init();
  }
  Renderer.prototype.init = function () {
    const gl = this.canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL non disponibile');
    this.gl = gl;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    gl.useProgram(p);
    this.p = p;
    this.a = {}; ['aPos', 'aNrm', 'aCol', 'aAnim'].forEach((n) => { this.a[n] = gl.getAttribLocation(p, n); gl.enableVertexAttribArray(this.a[n]); });
    this.u = {};
    ['uProj', 'uView', 'uModel', 'uTime', 'uLight', 'uSun', 'uHemiSky', 'uHemiGround', 'uAmb', 'uFog', 'uFogNear', 'uFogFar', 'uCam', 'uFlash', 'uAlpha', 'uTint', 'uFlashCol']
      .forEach((n) => { this.u[n] = gl.getUniformLocation(p, n); });
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    this.tris = 0;
  };
  Renderer.prototype.upload = function (b) {
    const gl = this.gl, buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(b.d), gl.STATIC_DRAW);
    return { buf, n: b.d.length / 11 };
  };
  /** env: {clear:[r,g,b,a], fog, fogNear, fogFar, light, sun, hemiSky, hemiGround, amb} */
  Renderer.prototype.begin = function (proj, view, eye, env, time) {
    const gl = this.gl, u = this.u;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    const c = env.clear || [0, 0, 0, 0];
    gl.clearColor(c[0], c[1], c[2], c[3]);
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix4fv(u.uProj, false, proj); gl.uniformMatrix4fv(u.uView, false, view);
    gl.uniform1f(u.uTime, time);
    gl.uniform3fv(u.uLight, V.norm(env.light || [-0.45, -1, -0.35]));
    gl.uniform3fv(u.uSun, env.sun || [1, 0.96, 0.88]);
    gl.uniform3fv(u.uHemiSky, env.hemiSky); gl.uniform3fv(u.uHemiGround, env.hemiGround);
    gl.uniform1f(u.uAmb, env.amb == null ? 0.6 : env.amb);
    gl.uniform3fv(u.uFog, env.fog); gl.uniform1f(u.uFogNear, env.fogNear); gl.uniform1f(u.uFogFar, env.fogFar);
    gl.uniform3fv(u.uCam, eye);
    this.tris = 0;
  };
  Renderer.prototype.draw = function (m, model, o) {
    const gl = this.gl, u = this.u, a = this.a;
    o = o || {};
    const alpha = o.alpha == null ? 1 : o.alpha;
    if (alpha <= 0.002) return;
    const blend = alpha < 1 || o.blend;
    if (blend) gl.enable(gl.BLEND); else gl.disable(gl.BLEND);
    gl.depthMask(!o.noDepth);
    gl.uniformMatrix4fv(u.uModel, false, model);
    gl.uniform1f(u.uFlash, o.flash || 0);
    gl.uniform3fv(u.uFlashCol, o.flashCol || WHITE);
    gl.uniform1f(u.uAlpha, alpha);
    gl.uniform3fv(u.uTint, o.tint || WHITE);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.buf);
    gl.vertexAttribPointer(a.aPos, 3, gl.FLOAT, false, 44, 0);
    gl.vertexAttribPointer(a.aNrm, 3, gl.FLOAT, false, 44, 12);
    gl.vertexAttribPointer(a.aCol, 4, gl.FLOAT, false, 44, 24);
    gl.vertexAttribPointer(a.aAnim, 1, gl.FLOAT, false, 44, 40);
    gl.drawArrays(gl.TRIANGLES, 0, m.n);
    this.tris += m.n / 3;
  };

  // ---------- tela unica, cache dei modelli, ciclo di disegno ----------
  const S = { canvas: null, R: null, scene: null, raf: 0, last: 0, cache: new Map(), lost: false, speed: 1, frames: 0, failed: false };
  // ---------- qualità adattiva ----------
  // alta: risoluzione piena (fino a 2x) e dettagli fino a 15 caselle; media: 1.5x e 11; bassa: 1x e 8.
  const QUALITY = {
    alta: { dpr: 2, detail: 15, far: 28 },
    media: { dpr: 1.5, detail: 11, far: 25 },
    bassa: { dpr: 1, detail: 8, far: 22 },
  };
  const QORDER = ['alta', 'media', 'bassa'];
  const Q = { level: 'alta', manual: false, fps: 60, frames: 0, t0: 0, lowFor: 0, highFor: 0, lastChange: 0 };
  function qualityTick(now) {
    if (!Q.t0) { Q.t0 = now; Q.frames = 0; return; }
    Q.frames++;
    const span = now - Q.t0;
    if (span < 1) return;
    Q.fps = Q.frames / span; Q.t0 = now; Q.frames = 0;
    if (Q.manual) return;
    if (Q.fps < 40) { Q.lowFor += span; Q.highFor = 0; } else if (Q.fps > 55) { Q.highFor += span; Q.lowFor = 0; } else { Q.lowFor = 0; Q.highFor = 0; }
    if (now - Q.lastChange < 4) return;            // al massimo un cambio ogni 4 secondi
    const i = QORDER.indexOf(Q.level);
    if (Q.lowFor >= 3 && i < QORDER.length - 1) { Q.level = QORDER[i + 1]; Q.lastChange = now; Q.lowFor = 0; }
    else if (Q.highFor >= 6 && i > 0) { Q.level = QORDER[i - 1]; Q.lastChange = now; Q.highFor = 0; }
  }
  const qual = () => QUALITY[Q.level];
  function supported() {
    if (S.R) return true;
    if (S.failed) return false;
    try { const c = document.createElement('canvas'); return !!(c.getContext('webgl')); } catch (e) { return false; }
  }
  function ensure() {
    if (S.R) return true;
    if (S.failed) return false;
    try {
      S.canvas = document.createElement('canvas');
      S.canvas.className = 'gl3d';
      S.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); S.lost = true; });
      S.canvas.addEventListener('webglcontextrestored', () => { S.cache.clear(); S.R.init(); S.lost = false; });
      S.R = new Renderer(S.canvas);
      return true;
    } catch (e) { S.failed = true; S.error = String(e && e.message || e); return false; }
  }
  function mesh(key, build) {
    let m = S.cache.get(key);
    if (!m) { m = S.R.upload(build()); S.cache.set(key, m); }
    return m;
  }
  function resize() {
    const c = S.canvas, dpr = Math.min(root.devicePixelRatio || 1, qual().dpr);
    const w = Math.max(1, Math.round(c.clientWidth * dpr)), h = Math.max(1, Math.round(c.clientHeight * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  }
  function loop() {
    S.raf = 0;
    if (!S.canvas.isConnected || !S.scene) return;
    const t = performance.now() / 1000;
    const dt = Math.min(0.05, S.last ? t - S.last : 1 / 60);
    S.last = t;
    qualityTick(t);
    resize();
    if (!S.lost) {
      const sc = S.scene;
      sc.clock = (sc.clock || 0) + dt * S.speed;
      sc.frame(S.R, sc.clock, dt * S.speed);
      S.frames++;
    }
    S.raf = requestAnimationFrame(loop);
  }
  /** Mette la tela 3D dentro container e fa partire la scena. */
  function mount(container, scene) {
    if (!container || !ensure()) return false;
    if (S.canvas.parentNode !== container) container.appendChild(S.canvas);
    S.scene = scene;
    S.last = 0;
    if (!S.raf) S.raf = requestAnimationFrame(loop);
    return true;
  }

  // ---------- creature ----------
  /** 'fiammino*' → { id: 'fiammino', shiny: true } */
  function parseMon(key, shiny) {
    const k = String(key || '');
    if (k.slice(-1) === '*') return { id: k.slice(0, -1), shiny: true };
    return { id: k, shiny: !!shiny };
  }
  const ACC_NORMAL = { flame: '#ff8a1f', flame2: '#ffd23f', leaf: '#7ee08f', leaf2: '#5fcf74', petal: '#ff8fb3', core: '#ffd23f', orb: '#eaffff', eye: '#fff6a0', horn: null, spike: null, fin: null };
  function speciesLook(id, shiny) {
    const sp = E.SPECIES[id], T = E.TYPES[sp.type];
    const Art = root.FMLABArt;
    let c, dk, acc;
    if (Art && Art.palette) { const P = Art.palette(id, !!shiny); c = hex(P.body); dk = hex(P.dark); acc = P.acc; }
    else { c = shade(hex(T.color), (E.hashString(id) % 30) - 15); dk = hex(T.dark); acc = ACC_NORMAL; }
    const st = sp.stage, rock = sp.type === 'roccia', ghost = sp.type === 'ombra';
    const by = ghost ? 0.62 : 0.55, rx = 0.5 + st * 0.03, ry = 0.52, rz = 0.47;
    return { sp, T, c, dk, lt: shade(c, 62), acc, shiny: !!shiny, st, rock, ghost, by, rx, ry, rz, top: by + ry, scale: 0.78 + st * 0.14 };
  }
  function buildCreature(id, shiny) {
    const L = speciesLook(id, shiny), b = new Builder(E.hashString(id));
    const { c, dk, lt, st, rock, ghost, by, rx, ry, rz, top } = L;
    const I1 = ico(1), I2 = ico(2);
    // corpo e pancia
    if (rock) b.add(I1, mat([0, by, 0], [0.35, 0, 0], [rx + 0.05, ry, rz + 0.04]), c, { noise: 0.15, jit: 0.12, seed: 3 });
    else b.add(I2, mat([0, by, 0], null, [rx, ry, rz]), c);
    if (!ghost) b.add(I1, mat([0, by - 0.22, 0.17], null, [0.31, 0.26, 0.28]), lt, { jit: 0.04 });
    // occhi
    const ex = 0.17, ey = 0.12;
    const zs = rz * Math.sqrt(Math.max(0, 1 - (ex / rx) ** 2 - (ey / ry) ** 2)) + (rock ? 0.05 : 0);
    [-1, 1].forEach((s) => {
      if (ghost) {
        b.add(I1, mat([s * ex, by + ey, zs - 0.02], null, [0.1, 0.13, 0.07]), hex(L.acc.eye || '#fff6a0'), { emis: 0.85, jit: 0 });
        b.add(I1, mat([s * (ex - 0.01), by + ey - 0.01, zs + 0.04], null, [0.035, 0.08, 0.03]), hex('#2a1056'), { jit: 0 });
      } else {
        b.add(I1, mat([s * ex, by + ey, zs - 0.03], null, [0.11, 0.13, 0.08]), WHITE, { jit: 0, emis: 0.25 });
        b.add(I1, mat([s * (ex - 0.005), by + ey - 0.01, zs + 0.035], null, [0.058, 0.07, 0.035]), hex('#151526'), { jit: 0 });
        b.add(ico(0), mat([s * (ex - 0.03) + 0.015, by + ey + 0.03, zs + 0.062], null, 0.018), WHITE, { emis: 1, jit: 0 });
      }
      if (st >= 3) b.add(box(), mat([s * ex, by + ey + 0.17, zs - 0.01], [0, 0, s * 0.35], [0.17, 0.035, 0.05]), dk, { jit: 0 });
    });
    // bocca
    const mz = rz * Math.sqrt(1 - (0.1 / ry) ** 2) + (rock ? 0.04 : 0);
    b.add(I1, mat([0, by - 0.1, mz - 0.005], null, [0.075, 0.022, 0.022]), ghost ? hex('#1a0b33') : shade(dk, -40), { jit: 0 });
    // piedi e braccia
    if (!ghost) [-1, 1].forEach((s) => b.add(I1, mat([s * 0.22, 0.06, 0.12], null, [0.15, 0.07, 0.19]), shade(c, -30)));
    if (st >= 2 && !ghost) [-1, 1].forEach((s) => b.add(I1, mat([s * (rx - 0.02), by - 0.08, 0.08], [0, 0, s * 0.5], [0.1, 0.19, 0.1]), shade(c, -16)));
    feature(b, L);
    return b;
  }
  function feature(b, L) {
    const { c, dk, st, rx, by, top } = L, I1 = ico(1), A = L.acc || ACC_NORMAL;
    const ac = (k, fb) => (A[k] ? hex(A[k]) : fb);
    switch (L.sp.type) {
      case 'fuoco': {
        const orange = ac('flame', hex('#ff8a1f')), yel = ac('flame2', hex('#ffd23f')), h = 0.32 + st * 0.08;
        b.add(cone(6), mat([0, top - 0.11, -0.03], [0, -0.15, 0], [0.17, h, 0.17]), orange, { emis: 0.55, anim: 0.07 });
        b.add(cone(6), mat([0, top - 0.07, 0.02], [0, -0.15, 0], [0.1, h * 0.72, 0.1]), yel, { emis: 0.9, anim: 0.07 });
        if (st >= 2) [-1, 1].forEach((s) => b.add(cone(5), mat([s * 0.12, top - 0.13, -0.05], [0, -0.1, -s * 0.45], [0.09, h * 0.62, 0.09]), orange, { emis: 0.6, anim: 0.06 }));
        if (st >= 2) {
          b.add(cone(6), mat([0, 0.32, -0.38], [0, -1.0, 0], [0.12, 0.36 + st * 0.06, 0.12]), orange, { emis: 0.6, anim: 0.08 });
          b.add(cone(5), mat([0, 0.33, -0.4], [0, -1.0, 0], [0.07, 0.28 + st * 0.05, 0.07]), yel, { emis: 0.9, anim: 0.08 });
        }
        break;
      }
      case 'acqua': {
        const fin = ac('fin', shade(c, 48));
        b.add(cone(4), mat([0, top - 0.13, -0.05], [0, -0.35, 0], [0.035, 0.34, 0.24]), fin);
        b.add(I1, mat([0, 0.33, -0.55], [0, -0.4, 0], [0.04, 0.19, 0.28]), fin, { anim: 0.03 });
        if (st >= 2) [-1, 1].forEach((s) => b.add(I1, mat([s * (rx + 0.02), by + 0.02, -0.05], [0, 0, -s * 0.7], [0.03, 0.2, 0.18]), fin));
        if (st >= 3) [-1, 1].forEach((s) => b.add(cone(4), mat([s * 0.12, top - 0.16, -0.08], [0, -0.3, -s * 0.35], [0.03, 0.28, 0.18]), ac('fin', shade(c, 30))));
        break;
      }
      case 'erba': {
        const g1 = ac('leaf', hex('#7ee08f')), g2 = ac('leaf2', hex('#5fcf74'));
        b.add(I1, mat([0.08, top + 0.16, 0], [0.5, 0, -0.35], [0.17, 0.3, 0.035]), g1, { anim: 0.04 });
        if (st >= 2) {
          b.add(I1, mat([-0.1, top + 0.12, -0.02], [-0.4, 0, 0.6], [0.15, 0.27, 0.035]), g2, { anim: 0.04 });
          [-1, 1].forEach((s) => b.add(I1, mat([s * 0.14, by + 0.22, -0.4], [s * 0.3, -1.0, 0], [0.12, 0.24, 0.03]), g2));
        }
        if (st >= 3) {
          const C = [0.0, top + 0.03, 0.14];
          for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; b.add(I1, mat([C[0] + Math.cos(a) * 0.08, C[1], C[2] + Math.sin(a) * 0.08], [a, 0, 0], [0.065, 0.03, 0.065]), ac('petal', hex('#ff8fb3'))); }
          b.add(I1, mat(C, null, [0.045, 0.04, 0.045]), ac('core', hex('#ffd23f')), { emis: 0.35 });
        }
        break;
      }
      case 'elettro': {
        [-1, 1].forEach((s) => {
          const base = [s * 0.15, top - 0.12, 0], roll = -s * 0.45, len = 0.36;
          b.add(cyl(5), mat(base, [0, 0, roll], [0.025, len, 0.025]), dk);
          const tip = [base[0] - Math.sin(roll) * len, base[1] + Math.cos(roll) * len, 0];
          b.add(I1, mat(tip, null, 0.078), ac('orb', hex('#eaffff')), { emis: 0.95, jit: 0 });
          b.add(ico(0), mat(V.add(tip, [0, 0, 0.03]), null, 0.04), c, { emis: 1, jit: 0 });
        });
        for (let i = 0; i < 14; i++) {
          const u = i / 13, a = u * Math.PI * 4;
          b.add(ico(0), mat([0.09 * Math.sin(a), 0.18 + u * 0.55, -0.42 - u * 0.18 + 0.09 * Math.cos(a)], null, 0.056 - u * 0.016), mix(c, WHITE, 0.3), { emis: 0.4 });
        }
        if (st >= 2) {
          const zig = [[0.02, top + 0.04, 0.06, 0.5], [-0.02, top + 0.15, 0.06, -0.6], [0.03, top + 0.26, 0.06, 0.5]];
          zig.forEach(([x, y, z, r]) => b.add(box(), mat([x, y, z], [0, 0, r], [0.045, 0.14, 0.045]), ac('orb', hex('#eaffff')), { emis: 0.95 }));
        }
        break;
      }
      case 'roccia': {
        const d = ac('spike', shade(c, -38)), spikeEm = A.spike ? 0.35 : 0;
        [-1, 1].forEach((s) => b.add(cone(5), mat([s * 0.16, top - 0.16, 0], [0, 0, -s * 0.3], [0.11, 0.3, 0.11]), d, { emis: spikeEm }));
        for (let i = 0; i < 3; i++) b.add(cone(5), mat([0, by + 0.28 - i * 0.2, -0.36 + i * 0.02], [0, -0.95, 0], [0.09, 0.26 - i * 0.03, 0.09]), d, { emis: spikeEm });
        if (st >= 2) [-1, 1].forEach((s) => b.add(cone(5), mat([s * (rx - 0.05), by + 0.3, 0], [0, 0, -s * 1.0], [0.12, 0.32, 0.12]), d, { emis: spikeEm }));
        break;
      }
      case 'ombra': {
        const d = ac('horn', shade(c, -45)), hornEm = A.horn ? 0.3 : 0;
        b.add(cone(8), mat([0, by - 0.28, -0.05], [0, Math.PI, 0], [0.3, 0.5, 0.28]), shade(c, -15), { anim: 0.06 });
        [-1, 1].forEach((s) => b.add(cone(6), mat([s * 0.25, by - 0.22, -0.1], [0, Math.PI, s * 0.4], [0.12, 0.3, 0.12]), shade(c, -22), { anim: 0.05 }));
        [-1, 1].forEach((s) => b.add(cone(5), mat([s * 0.13, top - 0.1, -0.05], [0, -0.2, -s * 0.35], [0.08, 0.28, 0.08]), d, { emis: hornEm }));
        if (st >= 2) [-1, 1].forEach((s) => b.add(cone(5), mat([s * 0.28, top - 0.2, -0.08], [0, -0.2, -s * 0.9], [0.07, 0.24, 0.07]), d, { emis: hornEm }));
        break;
      }
      default: break;
    }
  }
  /** Modello della creatura; la cache tiene separati normale e shiny ('mon:id' / 'mon:id*'). */
  const creatureMesh = (key, shiny) => { const P = parseMon(key, shiny); return mesh('mon:' + P.id + (P.shiny ? '*' : ''), () => buildCreature(P.id, P.shiny)); };
  /** Ombra morbida a contatto: due dischi, quello esterno più largo e più chiaro. */
  function softShadow(R, x, y, z, rx, rz, alpha, tint) {
    const sm = shadowMesh(), o = { blend: true, noDepth: true, tint };
    R.draw(sm, mat([x, y, z], null, [rx * 1.35, 1, rz * 1.35]), Object.assign({ alpha: alpha * 0.38 }, o));
    R.draw(sm, mat([x, y + 0.001, z], null, [rx * 0.85, 1, rz * 0.85]), Object.assign({ alpha: alpha * 0.7 }, o));
  }
  const particleMesh = () => mesh('fx:dot', () => new Builder(1).add(ico(0), mat(null, null, 1), WHITE, { emis: 1, jit: 0 }));
  // scintilla a 4 punte (due coni uniti), per shiny e paralisi
  const starMesh = () => mesh('fx:star', () => {
    const b = new Builder(2);
    b.add(cone(4), mat(null, null, [0.45, 1.3, 0.45]), WHITE, { emis: 1, jit: 0 });
    b.add(cone(4), mat(null, [0, Math.PI, 0], [0.45, 1.3, 0.45]), WHITE, { emis: 1, jit: 0 });
    b.add(cone(4), mat(null, [0, Math.PI / 2, 0], [0.3, 0.9, 0.3]), WHITE, { emis: 1, jit: 0 });
    b.add(cone(4), mat(null, [0, -Math.PI / 2, 0], [0.3, 0.9, 0.3]), WHITE, { emis: 1, jit: 0 });
    return b;
  });
  const shadowMesh = () => mesh('fx:shadow', () => new Builder(1).add(disc(18), mat(null, null, 1), [0, 0, 0], { emis: 1, jit: 0 }));
  function capsuleMesh() {
    return mesh('capsule', () => {
      const b = new Builder(7), g = hex('#22c55e'), w = hex('#f8fafc');
      b.add(ico(2), mat(null, null, 1), g, { colorFn: (ce) => (ce[1] >= 0 ? g : w), jit: 0.03 });
      b.add(cyl(16), mat([0, -0.08, 0], null, [1.02, 0.16, 1.02]), BLACK, { jit: 0 });
      b.add(cyl(12), mat([0, 0, 0.92], [0, Math.PI / 2, 0], [0.42, 0.12, 0.42]), BLACK, { jit: 0 });
      b.add(cyl(12), mat([0, 0, 0.96], [0, Math.PI / 2, 0], [0.3, 0.1, 0.3]), w, { emis: 0.4, jit: 0 });
      return b;
    });
  }

  // ---------- modelli GLB (glTF 2.0 binario) per i pacchetti CC0 ----------
  const ASSETS = {};
  function trsMatrix(n) {
    if (n.matrix) return Float32Array.from(n.matrix);
    const t = n.translation || [0, 0, 0], q = n.rotation || [0, 0, 0, 1], sc = n.scale || [1, 1, 1];
    const [x, y, z, w] = q;
    const R = [
      1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w),
      2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w),
      2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y),
    ];
    return new Float32Array([R[0] * sc[0], R[1] * sc[0], R[2] * sc[0], 0, R[3] * sc[1], R[4] * sc[1], R[5] * sc[1], 0, R[6] * sc[2], R[7] * sc[2], R[8] * sc[2], 0, t[0], t[1], t[2], 1]);
  }
  /**
   * Legge un file .glb e lo trasforma in un modello del motore.
   * Supporta: POSITION, indici, COLOR_0, baseColorFactor ed emissiveFactor dei materiali, nodi con matrix/TRS.
   * Le normali vengono ricalcolate piatte (stile low-poly). Le texture non sono supportate (si usa il colore base).
   * Il modello viene normalizzato: alto 1, appoggiato a y=0, centrato in x e z.
   * Ritorna { builder, tris, size:[larghezza, altezza, profondità] originali }.
   */
  function loadGLB(buf) {
    const dv = new DataView(buf);
    if (dv.getUint32(0, true) !== 0x46546C67) throw new Error('Non è un file GLB');
    if (dv.getUint32(4, true) !== 2) throw new Error('Serve glTF 2.0');
    const total = dv.getUint32(8, true);
    let off = 12, json = null, bin = null;
    while (off + 8 <= total) {
      const clen = dv.getUint32(off, true), ctype = dv.getUint32(off + 4, true), start = off + 8;
      if (ctype === 0x4E4F534A) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, start, clen)));
      else if (ctype === 0x004E4942) bin = new DataView(buf, start, clen);
      off = start + clen;
    }
    if (!json) throw new Error('GLB senza JSON');
    const COMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
    const RD = { 5126: [4, 'getFloat32', 0], 5125: [4, 'getUint32', 4294967295], 5123: [2, 'getUint16', 65535], 5122: [2, 'getInt16', 32767], 5121: [1, 'getUint8', 255], 5120: [1, 'getInt8', 127] };
    function read(i) {
      const a = json.accessors[i], bv = json.bufferViews[a.bufferView], n = COMP[a.type], [sz, fn, max] = RD[a.componentType];
      const stride = bv.byteStride || sz * n, base = (bv.byteOffset || 0) + (a.byteOffset || 0), out = new Float32Array(a.count * n);
      for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) {
        let v = bin[fn](base + k * stride + c * sz, true);
        if (a.normalized && max) v /= max;
        out[k * n + c] = v;
      }
      return { d: out, n, count: a.count };
    }
    const b = new Builder(5);
    const visit = (ni, parent) => {
      const node = json.nodes[ni], M = mmul(parent, trsMatrix(node));
      if (node.mesh != null) {
        const det = M[0] * (M[5] * M[10] - M[6] * M[9]) - M[4] * (M[1] * M[10] - M[2] * M[9]) + M[8] * (M[1] * M[6] - M[2] * M[5]);
        json.meshes[node.mesh].primitives.forEach((pr) => {
          if (pr.mode != null && pr.mode !== 4) return;               // solo triangoli
          const P = read(pr.attributes.POSITION), C = pr.attributes.COLOR_0 != null ? read(pr.attributes.COLOR_0) : null;
          const I = pr.indices != null ? read(pr.indices).d : null;
          const mat0 = pr.material != null && json.materials ? json.materials[pr.material] : {};
          const pbr = (mat0 && mat0.pbrMetallicRoughness) || {};
          const bc = pbr.baseColorFactor || [1, 1, 1, 1], em = mat0 && mat0.emissiveFactor ? Math.max.apply(null, mat0.emissiveFactor) : 0;
          const cnt = I ? I.length : P.count;
          for (let k = 0; k + 2 < cnt; k += 3) {
            let ids = I ? [I[k], I[k + 1], I[k + 2]] : [k, k + 1, k + 2];
            if (det < 0) ids = [ids[0], ids[2], ids[1]];
            const v = ids.map((q) => xf(M, [P.d[q * 3], P.d[q * 3 + 1], P.d[q * 3 + 2]]));
            let col = [bc[0], bc[1], bc[2]];
            if (C) { const avg = [0, 1, 2].map((c) => (C.d[ids[0] * C.n + c] + C.d[ids[1] * C.n + c] + C.d[ids[2] * C.n + c]) / 3); col = [col[0] * avg[0], col[1] * avg[1], col[2] * avg[2]]; }
            b.tri(v[0], v[1], v[2], col, { keep: true, jit: 0.03, emis: Math.min(1, em) });
          }
        });
      }
      (node.children || []).forEach((c) => visit(c, M));
    };
    const scene = json.scenes ? json.scenes[json.scene || 0] : { nodes: json.nodes.map((_, i) => i) };
    scene.nodes.forEach((n) => visit(n, mat()));
    // normalizza: alto 1, base a y=0, centrato
    let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < b.d.length; i += 11) for (let c = 0; c < 3; c++) { mn[c] = Math.min(mn[c], b.d[i + c]); mx[c] = Math.max(mx[c], b.d[i + c]); }
    const size = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]], k = 1 / (size[1] || 1);
    const cx = (mn[0] + mx[0]) / 2, cz = (mn[2] + mx[2]) / 2;
    for (let i = 0; i < b.d.length; i += 11) { b.d[i] = (b.d[i] - cx) * k; b.d[i + 1] = (b.d[i + 1] - mn[1]) * k; b.d[i + 2] = (b.d[i + 2] - cz) * k; }
    return { builder: b, tris: b.d.length / 33, size };
  }
  /** Registra un modello: nomi usati dal mondo 'tree_round', 'tree_pine', 'rock' (gli altri si vedono con la vetrina 'asset:nome'). */
  function registerAsset(name, buf) {
    const A = loadGLB(buf);
    ASSETS[name] = A;
    S.cache.delete('asset:' + name);
    return { name, tris: A.tris, size: A.size };
  }

  // ---------- scenografia: alberi, rocce, cristalli ----------
  function tree(b, x, z, s, kind) {
    const r = b.rng;
    const A = ASSETS[kind === 'pine' ? 'tree_pine' : 'tree_round'];
    if (A) { b.addBuilder(A.builder, mat([x, 0, z], [r() * 6, 0, 0], (kind === 'pine' ? 1.9 : 1.6) * s)); return; }
    if (kind === 'pine') {
      b.add(cyl(5), mat([x, 0, z], null, [0.12 * s, 0.45 * s, 0.12 * s]), hex('#6b4423'));
      const greens = ['#1f5c33', '#24693a', '#2a7a43'];
      for (let i = 0; i < 3; i++) b.add(cone(7), mat([x, (0.3 + i * 0.36) * s, z], [r() * 6, 0, 0], [(0.62 - i * 0.14) * s, (0.7 - i * 0.08) * s, (0.62 - i * 0.14) * s]), hex(greens[i]), { anim: 0.025 * s });
    } else {
      b.add(cyl(5), mat([x, 0, z], null, [0.12 * s, 0.6 * s, 0.12 * s]), hex('#6b4423'));
      b.add(ico(1), mat([x, 1.0 * s, z], [r() * 6, 0, 0], [0.62 * s, 0.55 * s, 0.62 * s]), hex('#2f7d3a'), { anim: 0.02 * s });
      b.add(ico(1), mat([x + 0.18 * s, 1.3 * s, z - 0.08 * s], [r() * 6, 0, 0], [0.38 * s, 0.34 * s, 0.38 * s]), hex('#3d9a48'), { anim: 0.02 * s });
    }
  }
  function rock(b, x, z, s, col) {
    if (ASSETS.rock) { b.addBuilder(ASSETS.rock.builder, mat([x, 0, z], [b.rng() * 6, 0, 0], [1.0 * s, (0.7 + b.rng() * 0.5) * s, 1.0 * s])); return; }
    b.add(ico(1), mat([x, 0.25 * s, z], [b.rng() * 6, 0, 0], [0.6 * s, (0.45 + b.rng() * 0.35) * s, 0.55 * s]), col || hex('#746a60'), { noise: 0.22, jit: 0.12, seed: Math.floor(b.rng() * 99) });
  }
  function crystal(b, x, z, s, col) {
    const yaw = b.rng() * 6, tilt = (b.rng() - 0.5) * 0.6;
    b.add(cone(4), mat([x, 0.25 * s, z], [yaw, tilt, 0], [0.12 * s, 0.55 * s, 0.12 * s]), col, { emis: 0.65 });
    b.add(cone(4), mat([x, 0.25 * s, z], [yaw, tilt + Math.PI, 0], [0.12 * s, 0.25 * s, 0.12 * s]), col, { emis: 0.65 });
  }
  function grassTuft(b, x, z, n, h, cols, sway) {
    for (let i = 0; i < n; i++) {
      const px = x + (b.rng() - 0.5) * 0.3, pz = z + (b.rng() - 0.5) * 0.3;
      b.add(cone(3), mat([px, 0, pz], [b.rng() * 6, (b.rng() - 0.5) * 0.4, (b.rng() - 0.5) * 0.4], [0.055, h * (0.75 + b.rng() * 0.5), 0.055]), hex(cols[i % cols.length]), { anim: sway, jit: 0.1 });
    }
  }

  // ---------- lotta ----------
  const ARENAS = {
    prato: { sky: ['#4fb0ff', '#dff3ff'], fog: '#d6eefc', near: 13, far: 34, ground: '#6cbf55', hill: '#5aa84a', plat: '#cfe8a0', rim: '#86b85e', hemiSky: '#d5ebff', hemiGround: '#5b7d3c', amb: 0.62, sun: [1, 0.95, 0.85] },
    bosco: { sky: ['#2b6a48', '#a9d6b2'], fog: '#9fcca8', near: 10, far: 28, ground: '#3f8a4c', hill: '#31723d', plat: '#a5cf80', rim: '#5e8f4a', hemiSky: '#c3e8cc', hemiGround: '#28462a', amb: 0.6, sun: [0.95, 1, 0.84] },
    grotta: { sky: ['#100e1a', '#3a3352'], fog: '#2b2740', near: 7, far: 22, ground: '#5c5244', hill: '#4a4136', plat: '#8f826d', rim: '#5c5244', hemiSky: '#7d70a8', hemiGround: '#2a2420', amb: 0.55, sun: [0.82, 0.76, 0.98] },
    fiume: { sky: ['#3fa9ff', '#d8f3ff'], fog: '#cdeefc', near: 14, far: 36, ground: '#e6d39a', hill: '#6cbf55', plat: '#f3e7c0', rim: '#b9a36a', hemiSky: '#d5f0ff', hemiGround: '#6b7d4c', amb: 0.64, sun: [1, 0.96, 0.86] },
    pvp: { sky: ['#120a2e', '#4b2a8a'], fog: '#3a2470', near: 13, far: 32, ground: '#2b3f82', hill: '#1d2a5c', plat: '#7486ea', rim: '#3446a6', hemiSky: '#9f8ff0', hemiGround: '#1a1840', amb: 0.6, sun: [0.92, 0.9, 1] },
  };
  const POS = { me: [-1.5, 0.12, 1.3], foe: [1.45, 0.12, -1.6] };
  function arenaEnv(kind) {
    const A = ARENAS[kind] || ARENAS.prato;
    return { clear: [0, 0, 0, 0], fog: hex(A.fog), fogNear: A.near, fogFar: A.far, hemiSky: hex(A.hemiSky), hemiGround: hex(A.hemiGround), amb: A.amb, sun: A.sun, light: [-0.5, -1, -0.45] };
  }
  function buildArena(kind) {
    const A = ARENAS[kind] || ARENAS.prato, b = new Builder(E.hashString('arena-' + kind));
    const r = b.rng;
    const wall = kind === 'grotta' ? 0.85 : kind === 'pvp' ? 0.5 : 0.22;
    const hAt = (x, z) => {
      const d = Math.hypot(x * 0.9, z + 0.2), wob = 0.7 + 0.6 * (0.5 + 0.5 * Math.sin(x * 0.7 + Math.cos(z * 0.5) * 2) * Math.cos(z * 0.6 + x * 0.2));
      if (kind === 'pvp') return d < 9 ? 0 : Math.floor((d - 9) / 1.2) * 0.45;
      if (kind === 'fiume') return d < 7.2 ? 0 : d < 15 ? Math.max(-1.0, -(d - 7.2) * 0.3) : -1.0 + Math.pow(d - 15, 1.3) * 0.5 * wob;
      return d < 6.5 ? 0 : Math.pow(d - 6.5, 1.25) * wall * wob;
    };
    const size = 40, cells = 20, st = size / cells, h0 = -size / 2;
    const g = hex(A.ground), hl = hex(A.hill);
    for (let i = 0; i < cells; i++) for (let j = 0; j < cells; j++) {
      const x0 = h0 + i * st, z0 = h0 + j * st, x1 = x0 + st, z1 = z0 + st;
      const p = (x, z) => [x, hAt(x, z), z];
      const a = p(x0, z0), bb = p(x1, z0), c = p(x1, z1), d = p(x0, z1);
      const hc = (a[1] + bb[1] + c[1] + d[1]) / 4;
      const col = kind === 'fiume' ? (hc < -0.95 && Math.hypot(x0, z0) > 14 ? mix(g, hl, clamp01((hc + 0.9) * 2)) : hc > 0.2 ? hl : g) : mix(g, hl, clamp01(hc / 2));
      b.tri(a, bb, c, col, { jit: 0.09 }); b.tri(a, c, d, col, { jit: 0.09 });
    }
    // pedane
    [['me', 1.32], ['foe', 1.18]].forEach(([k, rad]) => {
      const P = POS[k];
      b.add(cyl(20), mat([P[0], 0, P[2]], null, [rad + 0.1, 0.07, rad + 0.1]), hex(A.rim), { jit: 0.03 });
      b.add(cyl(20), mat([P[0], 0, P[2]], null, [rad, 0.12, rad]), hex(A.plat), { jit: 0.04 });
    });
    const avoid = (x, z) => Math.hypot(x - POS.me[0], z - POS.me[2]) < 1.8 || Math.hypot(x - POS.foe[0], z - POS.foe[2]) < 1.7 || Math.hypot(x + 3.1, z - 5.0) < 3.2;
    const scatter = (n, rmin, rmax, fn) => {
      for (let i = 0, k = 0; i < n && k < n * 8; k++) {
        const a = r() * Math.PI * 2, rad = rmin + r() * (rmax - rmin), x = Math.cos(a) * rad, z = Math.sin(a) * rad - 0.2;
        if (avoid(x, z)) continue;
        fn(x, z, hAt(x, z)); i++;
      }
    };
    const liftAt = (fn) => (x, z, y) => { const before = b.d.length; fn(x, z); for (let q = before + 1; q < b.d.length; q += 11) b.d[q] += y; };
    if (kind === 'fiume') {
      for (let i = -10; i < 10; i++) for (let j = -10; j < 10; j++) {
        const x0 = i * 2, z0 = j * 2 - 0.2;
        if (Math.hypot(x0 + 1, z0 + 1) < 6.5) continue;
        b.quad([x0, -0.18, z0], [x0 + 2, -0.18, z0], [x0 + 2, -0.18, z0 + 2], [x0, -0.18, z0 + 2], hex('#3b8fd9'), { emis: 0.16, anim: -0.035, jit: 0.05 });
      }
      for (let i = 0; i < 26; i++) {
        const a = r() * Math.PI * 2, rad = 6.6 + r() * 1.4, x = Math.cos(a) * rad, z = Math.sin(a) * rad - 0.2;
        if (avoid(x, z)) continue;
        lift(b, hAt(x, z), () => { for (let k = 0; k < 4; k++) b.add(cone(3), mat([x + (r() - 0.5) * 0.4, 0, z + (r() - 0.5) * 0.4], [r() * 6, 0, 0], [0.05, 0.8 + r() * 0.5, 0.05]), hex('#8a9a4a'), { anim: 0.07 }); });
      }
      scatter(8, 8, 13, (x, z) => rock(b, x, z, 0.8 + r() * 0.8, hex('#8f8a80')));
      scatter(16, 17, 22, (x, z, y) => lift(b, y, () => tree(b, x, z, 1.3 + r() * 0.6, 'round')));
      scatter(10, 2, 6, (x, z) => b.add(ico(0), mat([x, 0.03, z], [r() * 6, 0, 0], [0.07, 0.03, 0.06]), hex('#fde2e4'), { emis: 0.15 }));
    } else if (kind === 'prato') {
      scatter(18, 7.5, 15, liftAt((x, z) => tree(b, x, z, 1.1 + r() * 0.6, 'round')));
      scatter(10, 6, 11, liftAt((x, z) => b.add(ico(1), mat([x, 0.25, z], null, [0.7, 0.45, 0.6]), hex('#4ea845'), { anim: 0.02 })));
      scatter(55, 2.2, 8.5, liftAt((x, z) => grassTuft(b, x, z, 4, 0.38, ['#4fae46', '#5fbf55', '#3f9a3e'], 0.08)));
      scatter(18, 2.5, 8, liftAt((x, z) => b.add(ico(0), mat([x, 0.08, z], null, 0.07), hex(['#ffffff', '#ffd23f', '#ff8fb3'][Math.floor(r() * 3)]), { emis: 0.25 })));
    } else if (kind === 'bosco') {
      scatter(30, 6.5, 15, liftAt((x, z) => tree(b, x, z, 1.2 + r() * 0.8, 'pine')));
      scatter(40, 2.2, 8, liftAt((x, z) => grassTuft(b, x, z, 4, 0.5, ['#2e7a3c', '#3d9150'], 0.08)));
      scatter(9, 3, 7.5, liftAt((x, z) => {
        b.add(cyl(6), mat([x, 0, z], null, [0.06, 0.2, 0.06]), hex('#f1ece4'));
        b.add(ico(1), mat([x, 0.2, z], null, [0.17, 0.09, 0.17]), hex('#e0483e'));
      }));
    } else if (kind === 'grotta') {
      scatter(26, 5.5, 13, liftAt((x, z) => rock(b, x, z, 1 + r() * 1.4, hex(r() < 0.5 ? '#6b625a' : '#57504a'))));
      scatter(16, 5.5, 12, liftAt((x, z) => b.add(cone(6), mat([x, 0, z], [r() * 6, 0, 0], [0.35, 1.3 + r() * 1.4, 0.35]), hex('#5f574e'), { jit: 0.12 })));
      scatter(14, 3, 10, liftAt((x, z) => crystal(b, x, z, 0.9 + r() * 0.9, hex(r() < 0.5 ? '#a78bfa' : '#5eead4'))));
      scatter(30, 2, 7, liftAt((x, z) => b.add(ico(0), mat([x, 0.03, z], [r() * 6, 0, 0], 0.08 + r() * 0.06), hex('#4a433b'))));
    } else {
      for (let i = 0; i < 32; i++) {
        const a = (i / 32) * Math.PI * 2;
        b.add(box(), mat([Math.cos(a) * 5.2, 0.02, Math.sin(a) * 5.2 - 0.2], [-a, 0, 0], [0.18, 0.05, 0.75]), hex(i % 2 ? '#22d3ee' : '#e879f9'), { emis: 0.9, jit: 0 });
      }
      b.add(box(), mat([0, 0.012, -0.2], [-0.83, 0, 0], [0.12, 0.02, 7]), hex('#22d3ee'), { emis: 0.7, jit: 0 });
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2, x = Math.cos(a) * 10.5, z = Math.sin(a) * 10.5 - 0.2;
        if (avoid(x, z)) continue;
        const y = hAt(x, z);
        b.add(cyl(8), mat([x, y, z], null, [0.3, 2.6, 0.3]), hex('#3446a6'));
        b.add(ico(1), mat([x, y + 2.9, z], null, 0.35), hex(i % 2 ? '#22d3ee' : '#e879f9'), { emis: 1 });
      }
    }
    return b;
  }

  function createBattleScene(opts) {
    const kind = (opts && opts.arena) || 'prato';
    const hour = opts && opts.hour != null ? opts.hour : 12;
    const env = envAt(arenaEnv(kind), hour, kind === 'grotta' || kind === 'pvp' ? 0.4 : 1);
    const sc = { kind, clock: 0, actors: { me: null, foe: null }, fx: [], shake: 0, cap: null, lastType: { me: null, foe: null }, introT: 0, shot: null, view: null };
    sc.cut = function (kind2, dur) { sc.shot = { kind: kind2, t0: sc.clock, dur: dur || 1.3 }; };
    function shotCam(kind2) {
      const me = POS.me, foe = POS.foe, dir = V.norm(V.sub(foe, me));
      const side = [dir[2], 0, -dir[0]];
      if (kind2 === 'me') return { eye: V.add(V.add(me, V.mul(dir, -1.7)), V.add(V.mul(side, -0.9), [0, 1.05, 0])), tgt: V.add(foe, [0, 0.55, 0]) };
      if (kind2 === 'foe') return { eye: V.add(V.add(foe, V.mul(dir, 1.9)), V.add(V.mul(side, 1.0), [0, 1.25, 0])), tgt: V.add(me, [0, 0.55, 0]) };
      if (kind2 === 'cap') return { eye: V.add(foe, [-1.9, 1.3, 2.4]), tgt: V.add(foe, [0, 0.35, 0.2]) };
      return { eye: V.add(V.lerp(me, foe, 0.5), [-0.6, 3.2, 3.6]), tgt: V.lerp(me, foe, 0.5) };
    }
    const yawTo = (a, b) => Math.atan2(b[0] - a[0], b[2] - a[2]);
    sc.sky = skyFor(ARENAS[kind] ? ARENAS[kind].sky : ARENAS.prato.sky, kind === 'grotta' || kind === 'pvp' ? 12 : hour);
    /** setMon(slot, specie, { fainted, shiny, status, force, enter }) — specie può finire con '*' per shiny. */
    sc.setMon = function (slot, idKey, o) {
      o = o || {};
      const P = parseMon(idKey, o.shiny), id = P.id, key = id + (P.shiny ? '*' : '');
      const cur = sc.actors[slot];
      if (cur && cur.key === key && !o.force) {
        if (o.fainted && !cur.faintT) cur.faintT = sc.clock - 1;
        if (!o.fainted && cur.faintT) { cur.faintT = 0; cur.enterT = sc.clock; if (cur.shiny) cur.sparkleT = sc.clock + 0.3; }
        if (o.status !== undefined && o.status !== cur.status) sc.status(slot, o.status);
        return;
      }
      const L = speciesLook(id, P.shiny);
      const entering = o.enter !== false;
      sc.actors[slot] = {
        id, key, shiny: P.shiny, L, slot, base: POS[slot], yaw: yawTo(POS[slot], POS[slot === 'me' ? 'foe' : 'me']),
        enterT: entering ? sc.clock : -9, lungeT: -9, hitT: -9, faintT: o.fainted ? sc.clock - 1 : 0, absorbT: 0, crit: false, contact: false,
        phase: E.hashString(id + slot) % 100, status: o.status || null, statusT: -9, fxAcc: 0,
        sparkleT: P.shiny && entering && !o.fainted ? sc.clock + 0.3 : 0,
      };
    };
    const STATUS_COL = { brn: hex('#ff7a1a'), par: hex('#ffe14d'), slp: hex('#9db4ff'), psn: hex('#b44dff') };
    /** status(slot, null|'brn'|'par'|'slp'|'psn'): effetto che resta sulla creatura + lampo colorato. */
    sc.status = function (slot, st) {
      const a = sc.actors[slot];
      if (!a) return;
      st = STATUS_COL[st] ? st : null;
      if (st && st !== a.status) a.statusT = sc.clock;
      a.status = st;
    };
    const center = (a) => V.add(a.base, [0, (a.L.ghost ? 0.3 : 0) + a.L.by * a.L.scale, 0]);
    sc.attack = function (slot, type) {
      const a = sc.actors[slot], t = sc.actors[slot === 'me' ? 'foe' : 'me'];
      if (!a) return;
      a.lungeT = sc.clock; a.contact = !type;
      sc.cut(slot, 1.35);
      if (t) t.incoming = type || null;
      if (type && t) sc.fx.push({ k: 'shot', t0: sc.clock + 0.16, dur: 0.38, from: center(a), to: center(t), col: hex(E.TYPES[type].color), type });
    };
    sc.miss = function (slot) {
      const t = sc.actors[slot === 'me' ? 'foe' : 'me'];
      if (t) t.dodgeT = sc.clock;
    };
    sc.hit = function (slot, o) {
      o = o || {};
      const a = sc.actors[slot];
      if (!a) return;
      a.hitT = sc.clock; a.crit = !!o.crit;
      sc.shake = Math.max(sc.shake, o.crit ? 0.16 : o.eff > 1 ? 0.11 : 0.06);
      const type = a.incoming, col = type ? hex(E.TYPES[type].color) : [1, 0.95, 0.75];
      burst(center(a), col, o.crit ? 26 : 16, o.crit ? 3.2 : 2.4, type);
    };
    sc.faint = function (slot) { const a = sc.actors[slot]; if (a) a.faintT = sc.clock; sc.cut('wide', 1.4); };
    function burst(p, col, n, spd, type) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, s = spd * (0.4 + Math.random() * 0.8);
        const dir = [Math.cos(a) * Math.sqrt(1 - u * u), u * 0.8 + 0.5, Math.sin(a) * Math.sqrt(1 - u * u)];
        sc.fx.push({ k: 'p', p: p.slice(), v: V.mul(dir, s), life: 0.5 + Math.random() * 0.4, age: 0, col: Math.random() < 0.3 ? mix(col, WHITE, 0.6) : col, size: 0.05 + Math.random() * 0.06, g: type === 'roccia' ? 7 : type === 'ombra' ? -0.5 : 3.5 });
      }
    }
    sc.throwCapsule = function () {
      const foe = sc.actors.foe;
      if (!foe) return;
      sc.cut('cap', 3.2);
      sc.cap = { t0: sc.clock, from: V.add(POS.me, [0.4, 1.6, 0.6]), at: V.add(POS.foe, [0, 1.05 * foe.L.scale, 0.15]), ground: V.add(POS.foe, [0, 0.12 + 0.17, 0.25]), result: null, resT: 0 };
    };
    sc.captureResult = function (ok) {
      if (!sc.cap) return;
      sc.cap.result = ok ? 'ok' : 'ko';
      sc.cap.resT = Math.max(sc.clock, sc.cap.t0 + 1.35);
    };

    // effetti persistenti: scintille shiny, fiammelle, scosse, Z del sonno, bolle di veleno
    const zMesh = () => mesh('fx:z', () => {
      const b = new Builder(3);
      b.add(box(), mat([0, 0.5, 0], null, [1, 0.2, 0.14]), WHITE, { emis: 1, jit: 0 });
      b.add(box(), mat([0, -0.5, 0], null, [1, 0.2, 0.14]), WHITE, { emis: 1, jit: 0 });
      b.add(box(), mat([0, 0, 0], [0, 0, 0.785], [1.38, 0.2, 0.14]), WHITE, { emis: 1, jit: 0 });
      return b;
    });
    function actorFx(R, a, M, t, dt, eye) {
      if (M.alpha < 0.05) return;
      const c = V.add(M.pos, [0, (a.L.ghost ? 0 : 0) + a.L.by * M.s, 0]);
      const rad = 0.42 * M.s;
      const rnd = () => Math.random() - 0.5;
      if (a.sparkleT && t >= a.sparkleT) {
        a.sparkleT = 0;
        for (let i = 0; i < 22; i++) {          // pioggia di scintille dall'alto
          sc.fx.push({ k: 'p', star: true, p: V.add(c, [rnd() * 1.4, 1.1 + Math.random() * 0.8, rnd() * 1.4]), v: [rnd() * 0.3, -1.4 - Math.random(), rnd() * 0.3], life: 0.9 + Math.random() * 0.4, age: 0, col: Math.random() < 0.5 ? hex('#fff59d') : WHITE, size: 0.07 + Math.random() * 0.05, g: 0 });
        }
        for (let i = 0; i < 16; i++) {
          const ang = (i / 16) * Math.PI * 2;
          sc.fx.push({ k: 'p', star: true, p: c.slice(), v: [Math.cos(ang) * 2, 0.6 + Math.random(), Math.sin(ang) * 2], life: 0.6, age: 0, col: hex('#ffd23f'), size: 0.08, g: 1.5 });
        }
      }
      if (a.shiny && !a.faintT && ((t + a.phase) % 3.2) < dt * 1.5) {     // luccichio ogni tanto
        for (let i = 0; i < 3; i++) sc.fx.push({ k: 'p', star: true, p: V.add(c, [rnd() * rad * 2, rnd() * rad * 2 + 0.2, rnd() * rad * 2]), v: [0, 0.2, 0], life: 0.5, age: 0, col: hex('#fff59d'), size: 0.06, g: 0 });
      }
      if (!a.status || a.faintT) return;
      const rate = { brn: 22, par: 0, slp: 0, psn: 10 }[a.status];
      a.fxAcc += dt * rate;
      while (a.fxAcc >= 1) {
        a.fxAcc -= 1;
        if (a.status === 'brn') sc.fx.push({ k: 'p', p: V.add(c, [rnd() * rad * 1.8, rnd() * rad, rnd() * rad * 1.8]), v: [rnd() * 0.25, 0.8 + Math.random() * 0.6, rnd() * 0.25], life: 0.5, age: 0, col: Math.random() < 0.5 ? hex('#ff7a1a') : hex('#ffd23f'), size: 0.09 + Math.random() * 0.06, g: -0.5 });
        else sc.fx.push({ k: 'p', p: V.add(c, [rnd() * rad * 1.6, rnd() * rad * 1.2, rnd() * rad * 1.6]), v: [rnd() * 0.1, 0.35 + Math.random() * 0.3, rnd() * 0.1], life: 1.1, age: 0, col: Math.random() < 0.5 ? hex('#a855f7') : hex('#d946ef'), size: 0.07 + Math.random() * 0.07, g: -0.1, bubble: true });
      }
      if (a.status === 'par' && ((t + a.phase) % 0.8) < dt * 1.2) {
        for (let i = 0; i < 9; i++) sc.fx.push({ k: 'p', star: true, p: V.add(c, [rnd() * rad * 2.4, rnd() * rad * 2.2, rnd() * rad * 2.4]), v: [rnd() * 3, rnd() * 3, rnd() * 3], life: 0.22, age: 0, col: Math.random() < 0.3 ? WHITE : hex('#ffe14d'), size: 0.13, g: 0 });
      }
      if (a.status === 'slp') {
        const yawCam = Math.atan2(eye[0] - c[0], eye[2] - c[2]);
        for (let k = 0; k < 3; k++) {
          const u = (t * 0.42 + k / 3) % 1;
          const pz = V.add(c, [0.25 + u * 0.45, a.L.top * M.s * 0.6 + u * 0.85, 0.05]);
          R.draw(zMesh(), mat(pz, [yawCam, 0, Math.sin(t * 2 + k) * 0.2], 0.09 + u * 0.1), { tint: hex('#dbe5ff'), alpha: Math.sin(Math.PI * u), blend: true });
        }
      }
    }
    function actorModel(a, t) {
      const L = a.L;
      let pos = a.base.slice(), yaw = a.yaw, sc0 = L.scale, sx = 1, sy = 1, alpha = 1, flash = 0;
      const slow = a.status === 'slp' ? 0.45 : 1;
      const bob = Math.sin(t * 2.4 * slow + a.phase);
      if (a.status === 'par' && ((t + a.phase) % 0.8) < 0.14) pos[0] += Math.sin(t * 90) * 0.03;
      sy = 1 + bob * 0.03; sx = 1 - bob * 0.015;
      if (L.ghost) pos[1] += 0.28 + Math.sin(t * 1.8 + a.phase) * 0.08;
      else pos[1] += Math.max(0, Math.sin(t * 2.4 + a.phase)) * 0.015;
      yaw += Math.sin(t * 0.7 + a.phase) * 0.08;
      const fwd = [Math.sin(a.yaw), 0, Math.cos(a.yaw)];
      // entrata
      let p = (t - a.enterT) / 0.6;
      if (p >= 0 && p < 1) { sc0 *= Math.max(0.01, easeOutBack(p)); yaw += (1 - p) * Math.PI * 1.2; flash = Math.max(flash, (1 - p) * 0.85); }
      // attacco
      p = (t - a.lungeT) / (a.contact ? 0.5 : 0.42);
      if (p >= 0 && p < 1) { const k = Math.sin(Math.PI * p); pos = V.add(pos, V.mul(fwd, k * (a.contact ? 1.25 : 0.45))); pos[1] += k * (a.contact ? 0.28 : 0.12); sy *= 1 + k * 0.08; }
      // schivata
      p = (t - (a.dodgeT || -9)) / 0.45;
      if (p >= 0 && p < 1) { pos = V.add(pos, V.mul([Math.cos(a.yaw), 0, -Math.sin(a.yaw)], Math.sin(Math.PI * p) * 0.5)); }
      // colpito
      p = (t - a.hitT) / 0.55;
      if (p >= 0 && p < 1) {
        flash = Math.max(flash, (1 - p) * (0.55 + 0.45 * Math.cos(p * 28)));
        pos = V.sub(pos, V.mul(fwd, Math.sin(Math.PI * p) * (a.crit ? 0.5 : 0.3)));
        pos[0] += Math.sin(p * 46) * 0.05 * (1 - p);
        sx *= 1 + Math.sin(Math.PI * p) * 0.1; sy *= 1 - Math.sin(Math.PI * p) * 0.1;
      }
      // esausto
      if (a.faintT) {
        p = clamp01((t - a.faintT) / 0.85);
        pos[1] -= p * 0.55; sc0 *= 1 - p * 0.35; alpha = 1 - p; sy *= 1 - p * 0.3;
        flash = Math.max(flash, p < 0.2 ? 0.4 : 0);
      }
      // risucchiato nella capsula
      if (a.slot === 'foe' && sc.cap) {
        const c = sc.cap, ta = c.t0 + 0.62;
        if (t >= ta) {
          const broke = c.result === 'ko' && t >= c.resT;
          if (!broke) { const q = clamp01((t - ta) / 0.35); sc0 *= 1 - q; flash = Math.max(flash, q > 0 ? 1 : 0); pos = V.lerp(pos, c.at, q); if (q >= 1) alpha = 0; }
        }
      }
      return { m: mat(pos, [yaw, 0, 0], [sc0 * sx, sc0 * sy, sc0 * sx]), alpha, flash, pos, s: sc0 };
    }

    sc.frame = function (R, t, dt) {
      // camera: entrata ad arco, poi lieve oscillazione
      const intro = clamp01(t / 1.1), k = 1 - Math.pow(1 - intro, 3);
      let tgt = [0.45, 0.72, -0.5];
      // giro lento attorno al campo: la camera non resta mai dritta e ferma
      const orb = -0.18 + Math.sin(t * 0.16) * 0.14, base = [-3.15, 2.05 + Math.sin(t * 0.37) * 0.06, 5.0];
      const rel = V.sub(base, tgt);
      let eye = V.add(tgt, [rel[0] * Math.cos(orb) + rel[2] * Math.sin(orb), rel[1], -rel[0] * Math.sin(orb) + rel[2] * Math.cos(orb)]);
      eye = V.lerp([3.5, 3.6, 6.5], eye, k); tgt = V.lerp([1.45, 0.6, -1.6], tgt, k);
      if (sc.shot) {
        const q = t - sc.shot.t0, d = sc.shot.dur;
        if (q >= d) sc.shot = null;
        else {
          const w = smooth(0, 0.28, q) * (1 - smooth(d - 0.35, d, q));
          const sh = shotCam(sc.shot.kind);
          eye = V.lerp(eye, sh.eye, w); tgt = V.lerp(tgt, sh.tgt, w);
        }
      }
      if (sc.shake > 0) { const s = sc.shake; eye = V.add(eye, [(Math.random() - 0.5) * s, (Math.random() - 0.5) * s, 0]); sc.shake = Math.max(0, sc.shake - dt * 0.6); }
      R.begin(projFor(R, sc.view, (a) => (a < 0.75 ? 1.05 : a < 1 ? 0.95 : 0.8)), lookAt(eye, tgt), eye, env, t);
      R.draw(mesh('arena:' + kind, () => buildArena(kind)), mat(), {});
      const shadow = shadowMesh(), pm = particleMesh();
      ['foe', 'me'].forEach((slot) => {
        const a = sc.actors[slot];
        if (!a) return;
        const M = actorModel(a, t);
        const shR = (a.L.ghost ? 0.38 : 0.52) * M.s;
        softShadow(R, a.base[0], 0.125, a.base[2], shR, shR * 0.9, 0.34 * M.alpha * (a.L.ghost ? 0.7 : 1));
        // lampo colorato quando arriva uno stato
        let flash = M.flash, flashCol = WHITE;
        const sp = (t - a.statusT) / 0.9;
        if (a.status && sp >= 0 && sp < 1) { const f = (1 - sp) * (0.6 + 0.3 * Math.cos(sp * 22)); if (f > flash) { flash = f; flashCol = mix(STATUS_COL[a.status], WHITE, 0.15); } }
        R.draw(creatureMesh(a.id, a.shiny), M.m, { alpha: M.alpha, flash, flashCol });
        actorFx(R, a, M, t, dt, eye);
      });
      // capsula
      if (sc.cap) {
        const c = sc.cap, q = t - c.t0;
        let pos, rot = [0, 0, 0], show = true, fl = 0;
        if (q < 0.62) { const p = q / 0.62; pos = V.lerp(c.from, c.at, p); pos[1] += Math.sin(Math.PI * p) * 1.1; rot = [0, -p * 12, 0]; }
        else if (q < 0.97) { pos = c.at; fl = 0.6 * (1 - (q - 0.62) / 0.35); }
        else if (q < 1.3) { const p = (q - 0.97) / 0.33; pos = V.lerp(c.at, c.ground, p * p); }
        else {
          pos = c.ground;
          const resolved = c.result && t >= c.resT;
          if (!resolved) { const w = (q - 1.3) % 0.7; rot = [0, 0, w < 0.35 ? Math.sin((w / 0.35) * Math.PI * 2) * 0.45 : 0]; }
          else if (c.result === 'ok') {
            if (!c.fxDone) { c.fxDone = true; burst(V.add(pos, [0, 0.25, 0]), hex('#ffd23f'), 22, 2.2, 'stelle'); }
            fl = Math.max(0, 0.5 - (t - c.resT)) ;
          } else {
            if (!c.fxDone) { c.fxDone = true; burst(pos, hex('#22c55e'), 20, 2.6); burst(pos, WHITE, 10, 2); const foe = sc.actors.foe; if (foe) foe.enterT = t; }
            show = false;
            if (t - c.resT > 0.8) sc.cap = null;
          }
        }
        if (show && sc.cap) R.draw(capsuleMesh(), mat(pos, rot, 0.17), { flash: fl });
      }
      // effetti
      sc.fx = sc.fx.filter((f) => {
        if (f.k === 'shot') {
          const p = (t - f.t0) / f.dur;
          if (p < 0) return true;
          if (p >= 1) return false;
          const pos = V.lerp(f.from, f.to, p); pos[1] += Math.sin(Math.PI * p) * 0.35;
          R.draw(pm, mat(pos, [t * 9, t * 7, 0], 0.15 + Math.sin(t * 40) * 0.02), { tint: f.col });
          R.draw(pm, mat(pos, [t * 5, 0, 0], 0.24), { tint: mix(f.col, WHITE, 0.5), alpha: 0.35, noDepth: true });
          if (Math.random() < 0.9) sc.fx.push({ k: 'p', p: pos.slice(), v: [(Math.random() - 0.5) * 0.6, (Math.random() - 0.2) * 0.6, (Math.random() - 0.5) * 0.6], life: 0.35, age: 0, col: f.col, size: 0.06, g: 0 });
          return true;
        }
        f.age += dt;
        if (f.age >= f.life) return false;
        f.v[1] -= f.g * dt;
        f.p = V.add(f.p, V.mul(f.v, dt));
        const k2 = 1 - f.age / f.life;
        const sz = f.size * (f.bubble ? 1 : 0.4 + 0.6 * k2);
        R.draw(f.star ? starMesh() : pm, mat(f.p, [f.age * 8, f.star ? f.age * 2 : f.age * 5, 0], sz), { tint: f.col, alpha: Math.min(1, k2 * 1.6) * (f.bubble ? 0.75 : 1), blend: true });
        return true;
      });
    };
    return sc;
  }

  // ---------- vetrina (titolo, scelta, archivio) ----------
  function createShowcase(ids, opts) {
    opts = opts || {};
    const env = { clear: [0, 0, 0, 0], fog: [0, 0, 0], fogNear: 100, fogFar: 200, hemiSky: hex('#e3ebff'), hemiGround: hex('#3a3f55'), amb: 0.66, sun: [1, 0.97, 0.92], light: [-0.4, -0.8, -0.6] };
    const sc = { clock: 0, ids: ids.slice(), yaw: 0, drag: null, dragYaw: 0, lastInput: 0.5 };
    const gap = opts.gap || 1.55;
    sc.frame = function (R, t) {
      const n = sc.ids.length, asp = R.canvas.width / R.canvas.height;
      const isAsset = (k) => String(k).indexOf('asset:') === 0;
      const big = Math.max.apply(null, sc.ids.map((k) => (isAsset(k) ? 1.1 : speciesLook(parseMon(k).id).scale))) * (opts.size || 1);
      const fitW = (n - 1) * gap + 1.4 * big;
      const dist = Math.max(2.3 * big + 0.6, (fitW / asp) * 1.25 + 1.2) * (opts.zoom || 1);
      const tgt = [0, 0.58 * big, 0], eye = [0, tgt[1] + 0.55 + dist * 0.12, dist];
      R.begin(perspective(0.7, asp, 0.1, 50), lookAt(eye, tgt), eye, env, t);
      sc.ids.forEach((key, i) => {
        const x = (i - (n - 1) / 2) * gap, ph = i * 1.7;
        if (isAsset(key)) {            // modello GLB registrato (pacchetti CC0)
          const A = ASSETS[key.slice(6)];
          if (!A) return;
          softShadow(R, x, 0.01, 0, 0.55, 0.5, 0.32);
          R.draw(mesh('asset:' + key.slice(6), () => A.builder), mat([x, 0, 0], [t * 0.6 + ph, 0, 0], 1.1 * (opts.size || 1)), {});
          return;
        }
        const P = parseMon(key), id = P.id;
        const L = speciesLook(id, P.shiny);
        const type = L.sp.type;
        R.draw(mesh('ped:' + type, () => {
          const b = new Builder(5);
          b.add(cyl(24), mat([0, -0.06, 0], null, [0.82, 0.06, 0.82]), hex(E.TYPES[type].color), { emis: 0.7, jit: 0 });
          b.add(cyl(24), mat([0, -0.04, 0], null, [0.75, 0.08, 0.75]), hex('#222a42'), { jit: 0.03 });
          return b;
        }), mat([x, 0, 0]), {});
        let yaw = opts.spin ? t * 0.7 + ph : Math.sin(t * 0.8 + ph) * 0.45;
        if (opts.drag) yaw = sc.dragYaw + (t - sc.lastInput > 2 ? (t - sc.lastInput - 2) * 0.6 : 0);
        const bob = Math.sin(t * 2.4 + ph);
        const y = L.ghost ? 0.25 + Math.sin(t * 1.8 + ph) * 0.07 : Math.max(0, bob) * 0.03;
        const hop = opts.hop && i === opts.hop - 1 ? Math.abs(Math.sin(t * 5)) * 0.12 : 0;
        const s = L.scale * (opts.size || 1);
        softShadow(R, x, 0.045, 0, 0.5 * s, 0.45 * s, 0.36);
        R.draw(creatureMesh(id, P.shiny), mat([x, y + hop, 0], [yaw, 0, 0], [s * (1 - bob * 0.015), s * (1 + bob * 0.03), s * (1 - bob * 0.015)]), {});
        if (P.shiny) {                 // scintille che girano attorno agli shiny
          for (let k = 0; k < 4; k++) {
            const a = t * 1.3 + k * 1.57 + ph, pulse = Math.max(0, Math.sin(t * 3 + k * 2));
            R.draw(starMesh(), mat([x + Math.cos(a) * 0.62 * s, (0.35 + 0.5 * ((k % 2) + Math.sin(t + k) * 0.3)) * s, Math.sin(a) * 0.62 * s], [t * 2, 0, 0], 0.05 + pulse * 0.05), { tint: hex(k % 2 ? '#fff59d' : '#ffffff'), alpha: 0.3 + pulse * 0.7, blend: true });
          }
        }
      });
    };
    sc.bindDrag = function (el) {
      let lastX = 0;
      el.style.touchAction = 'none';
      el.addEventListener('pointerdown', (e) => { sc.drag = true; lastX = e.clientX; sc.dragYaw += Math.max(0, sc.clock - sc.lastInput - 2) * 0.6; sc.lastInput = sc.clock; });
      el.addEventListener('pointermove', (e) => { if (!sc.drag) return; sc.dragYaw += (e.clientX - lastX) * 0.012; lastX = e.clientX; sc.lastInput = sc.clock; });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => el.addEventListener(ev, () => { sc.drag = false; }));
    };
    return sc;
  }

  // ---------- mappa ----------
  const MAPENV = {
    open: { fog: hex('#bfe3f7'), fogNear: 17, fogFar: 46, hemiSky: hex('#d5ebff'), hemiGround: hex('#5b7d3c'), amb: 0.62, sun: [1, 0.95, 0.86] },
    bosco: { fog: hex('#93c29c'), fogNear: 12, fogFar: 34, hemiSky: hex('#c3e8cc'), hemiGround: hex('#28462a'), amb: 0.58, sun: [0.92, 1, 0.82] },
    grotta: { fog: hex('#2a2540'), fogNear: 10, fogFar: 28, hemiSky: hex('#8275b0'), hemiGround: hex('#2a2420'), amb: 0.52, sun: [0.74, 0.7, 0.92] },
  };
  function mixEnv(a, b, k) {
    const o = {};
    Object.keys(a).forEach((key) => { o[key] = Array.isArray(a[key]) ? mix(a[key], b[key] || a[key], k) : typeof a[key] === 'number' ? a[key] + ((b[key] == null ? a[key] : b[key]) - a[key]) * k : a[key]; });
    return o;
  }
  /** Ora del giorno → quanto è giorno (1) o notte (0) e quanto è tramonto/alba. */
  function dayParts(h) {
    h = ((h % 24) + 24) % 24;
    const day = h < 12 ? smoothR(5.2, 7.4, h) : 1 - smoothR(18.6, 20.6, h);
    const bump = (c, w) => Math.max(0, 1 - Math.abs(h - c) / w);
    return { day, dusk: Math.max(bump(6.4, 1.2), bump(19.4, 1.4)) };
  }
  function smoothR(a, b, x) { const k = Math.max(0, Math.min(1, (x - a) / (b - a))); return k * k * (3 - 2 * k); }
  function envAt(base, hour, strength) {
    const { day, dusk } = dayParts(hour), s = strength == null ? 1 : strength;
    let e = mixEnv(base, { fog: hex('#f0a37a'), hemiSky: hex('#ffcf9e'), sun: [1, 0.7, 0.48] }, dusk * 0.55 * s);
    e = mixEnv(e, { fog: hex('#0b1230'), hemiSky: hex('#4a5aa0'), hemiGround: hex('#141729'), sun: [0.32, 0.4, 0.72], amb: base.amb * 0.62 }, (1 - day) * s);
    e.night = 1 - day; e.dusk = dusk;
    return e;
  }
  function skyFor(sky, hour) {
    const { day, dusk } = dayParts(hour);
    let top = hex(sky[0]), bot = hex(sky[1]);
    top = mix(top, hex('#5b6fb8'), dusk * 0.5); bot = mix(bot, hex('#ffb07a'), dusk * 0.7);
    top = mix(top, hex('#050818'), 1 - day); bot = mix(bot, hex('#1c2756'), 1 - day);
    const css = (c) => 'rgb(' + c.map((v) => Math.round(v * 255)).join(',') + ')';
    return [css(top), css(bot)];
  }

  const lift = (b, y, fn) => { const before = b.d.length; fn(); for (let q = before + 1; q < b.d.length; q += 11) b.d[q] += y; };
  function flowers(b, x, z, n) {
    const cols = ['#ffffff', '#ffd23f', '#ff8fb3', '#a78bfa', '#ff6b6b'];
    for (let i = 0; i < n; i++) {
      const px = x + b.rng() * 0.8 + 0.1, pz = z + b.rng() * 0.8 + 0.1, h = 0.12 + b.rng() * 0.1;
      b.add(cyl(3), mat([px, 0, pz], null, [0.012, h, 0.012]), hex('#3f9a3e'), { anim: 0.03 });
      b.add(ico(0), mat([px, h, pz], [b.rng() * 6, 0, 0], [0.05, 0.03, 0.05]), hex(cols[Math.floor(b.rng() * cols.length)]), { emis: 0.22, anim: 0.03 });
    }
  }
  function house(b, B, kind) {
    const w = B.x1 - B.x0 + 1, d = B.y1 - B.y0 + 1, cx = B.x0 + w / 2, cz = B.y0 + d / 2 - 0.1;
    const wallH = kind === 'center' ? 1.5 : kind === 'lab' ? 1.3 : 1.15;
    const roofC = kind === 'center' ? hex('#e0483e') : kind === 'lab' ? hex('#3b82f6') : hex(B.color || '#f59e0b');
    const front = B.y1 + 1 - 0.12;
    b.add(box(), mat([cx, 0.12, cz], null, [w - 0.05, 0.24, d - 0.15]), hex('#d9d2c6'));
    b.add(box(), mat([cx, wallH / 2 + 0.02, cz], null, [w - 0.2, wallH, d - 0.25]), hex(kind === 'lab' ? '#efe7d6' : '#f3ede2'), { jit: 0.03 });
    b.add(prism(), mat([cx, wallH, cz], null, [w + 0.35, kind === 'house' ? 0.95 : 0.85, d + 0.25]), roofC);
    const dx = B.door ? B.door[0] + 0.5 : cx;
    const fz = cz + (d - 0.25) / 2;
    b.add(box(), mat([dx, 0.55, fz + 0.03], null, [0.7, 1.05, 0.08]), hex('#7a4b2a'));
    b.add(ico(0), mat([dx + 0.22, 0.55, fz + 0.09], null, 0.04), hex('#ffd23f'), { emis: 0.6 });
    const winY = Math.min(wallH - 0.45, 0.85);
    [-1, 1].forEach((s) => { const wx = cx + s * (w / 2 - 0.75); if (Math.abs(wx - dx) > 0.7) b.add(box(), mat([wx, winY, fz + 0.03], null, [0.6, 0.42, 0.05]), hex('#bfe3ff'), { emis: 0.45, jit: 0 }); });
    if (kind === 'center') {
      b.add(box(), mat([dx, 1.2, fz + 0.22], null, [1.25, 0.06, 0.45]), roofC);
      b.add(box(), mat([dx, 1.38, fz + 0.03], null, [1.5, 0.2, 0.04]), roofC, { emis: 0.3, jit: 0 });
      b.add(ico(2), mat([dx, wallH + 0.5, fz - 0.15], null, [0.3, 0.3, 0.12]), hex('#22c55e'), { emis: 0.35, colorFn: (ce) => (ce[1] >= 0 ? hex('#22c55e') : WHITE) });
    } else if (kind === 'lab') {
      b.add(cyl(6), mat([cx + 1, wallH + 0.4, cz], null, [0.04, 0.6, 0.04]), hex('#94a3b8'));
      b.add(ico(1), mat([cx + 1, wallH + 1.02, cz], null, 0.1), hex('#22d3ee'), { emis: 1 });
      b.add(cyl(10), mat([cx - 1.1, wallH + 0.35, cz], [0, -0.6, 0], [0.32, 0.06, 0.32]), hex('#cbd5e1'));
    } else {
      b.add(box(), mat([cx + w / 2 - 0.7, wallH + 0.7, cz - 0.2], null, [0.25, 0.6, 0.25]), hex('#8b6b5a'));
    }
  }
  function buildWorld(Wd) {
    const map = Wd.grid, H = Wd.H, W = Wd.W, r = E.makeRng(20261127), hA = Wd.heightAt, zoneAt = Wd.zoneAt;
    // il mondo è diviso in blocchi 8×8: si disegnano solo quelli vicini e davanti alla camera
    const CH = 8, chunks = new Map();
    let b = null;
    const use = (x, z) => {
      const kx = Math.floor(x / CH), kz = Math.floor(z / CH), key = kx + ',' + kz;
      let c = chunks.get(key);
      if (!c) { c = new Builder(E.hashString('ch' + key)); c.key = key; c.cx = (kx + 0.5) * CH; c.cz = (kz + 0.5) * CH; c.detail = new Builder(E.hashString('dt' + key)); chunks.set(key, c); }
      b = c; return c;
    };
    // dettagli piccoli (erba, fiori, canne, sassolini): solo vicino al giocatore
    const small = (fn) => { const base = b; b = base.detail; fn(); b = base; };
    const hg = new Float32Array((W + 1) * (H + 1));
    for (let y = 0; y <= H; y++) for (let x = 0; x <= W; x++) hg[y * (W + 1) + x] = hA(x, y);
    const hc = (x, y) => hg[y * (W + 1) + x];
    const tileH = (x, y) => (hc(x, y) + hc(x + 1, y) + hc(x, y + 1) + hc(x + 1, y + 1)) / 4;
    const isPath = (x, y) => x === Wd.pathX(y) || x === Wd.pathX(y) + 1;
    const lamps = [];
    // montagne e colline fuori dalla mappa
    const S = 2, ext = 20;
    for (let z0 = -ext; z0 < H + ext; z0 += S) for (let x0 = -ext; x0 < W + ext; x0 += S) {
      if (x0 >= 0 && z0 >= 0 && x0 + S <= W && z0 + S <= H) continue;
      use(x0 + 1, z0 + 1);
      const P = (x, z) => [x, hA(x, z), z];
      const a = P(x0, z0), bb = P(x0 + S, z0), c = P(x0 + S, z0 + S), d = P(x0, z0 + S);
      const h = (a[1] + bb[1] + c[1] + d[1]) / 4, n = Wd.fbm(x0 * 0.2, z0 * 0.2, 4);
      const cave = z0 < 13;
      let col = cave ? hex('#5f574e') : hex(z0 < 24 ? '#3f7d45' : '#5fae4f');
      if (h > 1.4 + n * 0.8) col = hex(cave ? '#6b625a' : '#7d7468');
      if (h > 4.0 + n * 1.5) col = hex('#f1f5fb');
      b.tri(a, bb, c, col, { jit: 0.08 }); b.tri(a, c, d, col, { jit: 0.08 });
      const edge = Math.max(-x0, x0 + S - W, -z0, z0 + S - H);
      if (h > 0.05 && h < 2.4 && edge < 8 && r() < (cave ? 0.2 : 0.36)) {
        const tx = x0 + 0.3 + r() * 1.4, tz = z0 + 0.3 + r() * 1.4;
        lift(b, hA(tx, tz) - 0.05, () => { if (cave) rock(b, tx, tz, 1.3 + r(), hex('#6b625a')); else tree(b, tx, tz, 1 + r() * 0.6, z0 < 24 ? 'pine' : 'round'); });
      }
    }
    // caselle
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = map[y][x], z = zoneAt(y), cx = x + 0.5, cz = y + 0.5, th = tileH(x, y), path = isPath(x, y);
      use(cx, cz);
      let g;
      if (z === 'grotta') g = t === '#' ? '#4f473e' : path ? '#6e655a' : '#5a5248';
      else if (z === 'bosco') g = t === ';' ? '#3a8248' : path && t === '.' ? '#b5a275' : '#5f9e50';
      else if (z === 'fiume') g = t === 's' ? '#e6d39a' : t === 'r' ? '#7fae58' : t === ',' ? '#5fb653' : (t === '~' || t === '=') ? '#5c7f6a' : path ? '#dcc995' : '#8fcf66';
      else if (z === 'prato') g = t === ',' ? '#5fb653' : t === '~' ? '#5c7f6a' : path && t === '.' ? '#dcc995' : '#93cf68';
      else g = (path || t === 'H' || t === 'D' || t === 'K' || t === 'L' || t === 'P' || y === 50 || y === 49 && x > 13) ? '#e6d6a8' : '#9dd46e';
      const col = shade(hex(g), Math.max(-30, Math.min(25, th * 14)));
      b.quad([x, hc(x, y), y], [x + 1, hc(x + 1, y), y], [x + 1, hc(x + 1, y + 1), y + 1], [x, hc(x, y + 1), y + 1], col, { jit: 0.05 });
      const minH = Math.min(hc(x, y), hc(x + 1, y), hc(x, y + 1), hc(x + 1, y + 1));
      if (minH < -0.08 || t === '~' || t === '=') {
        for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
          const x0 = x + i * 0.5, z0 = y + j * 0.5;
          b.quad([x0, -0.12, z0], [x0 + 0.5, -0.12, z0], [x0 + 0.5, -0.12, z0 + 0.5], [x0, -0.12, z0 + 0.5], hex('#3b8fd9'), { emis: 0.14, anim: -0.025, jit: 0.04 });
        }
      }
      const at = (fn) => lift(b, th, fn);
      switch (t) {
        case ',': small(() => at(() => { for (let i = 0; i < 3; i++) grassTuft(b, x + 0.22 + (i % 2) * 0.5 + r() * 0.1, y + 0.2 + i * 0.3, 3, 0.38, ['#3f9a3e', '#4fb04a', '#2f8a35'], 0.07); })); break;
        case ';': small(() => at(() => { for (let i = 0; i < 3; i++) grassTuft(b, x + 0.22 + (i % 2) * 0.5 + r() * 0.1, y + 0.2 + i * 0.3, 3, 0.52, ['#2e7a3c', '#3d9150', '#24653a'], 0.07); })); break;
        case 'r': small(() => at(() => {
          for (let i = 0; i < 6; i++) {
            const px = x + 0.15 + r() * 0.7, pz = y + 0.15 + r() * 0.7, hh = 0.6 + r() * 0.35;
            b.add(cone(3), mat([px, 0, pz], [r() * 6, (r() - 0.5) * 0.2, 0], [0.035, hh, 0.035]), hex(r() < 0.5 ? '#8a9a4a' : '#6f8a3a'), { anim: 0.06 });
            if (r() < 0.5) b.add(ico(0), mat([px, hh * 0.78, pz], null, [0.035, 0.09, 0.035]), hex('#7a4b2a'), { anim: 0.045 });
          }
        })); break;
        case 's': small(() => at(() => { if (r() < 0.12) b.add(ico(0), mat([x + r(), 0.03, y + r()], [r() * 6, 0, 0], [0.06, 0.03, 0.05]), hex(r() < 0.5 ? '#fde2e4' : '#fff7d6'), { emis: 0.15 }); if (r() < 0.04) b.add(cyl(5), mat([x + 0.5, 0.05, y + 0.5], [r() * 3, Math.PI / 2, 0], [0.06, 0.8, 0.06]), hex('#8b6b4a')); })); break;
        case ':': at(() => {
          if (r() < 0.6) small(() => b.add(ico(0), mat([x + r(), 0.03, y + r()], [r() * 6, 0, 0], 0.06 + r() * 0.06), hex('#463f37')));
          if (r() < 0.16) crystal(b, x + 0.3 + r() * 0.4, y + 0.3 + r() * 0.4, 0.6, hex(r() < 0.5 ? '#a78bfa' : '#5eead4'));
          if (r() < 0.05) b.add(cone(6), mat([x + 0.5, 0, y + 0.5], [r() * 6, 0, 0], [0.22, 0.8 + r() * 0.6, 0.22]), hex('#5f574e'), { jit: 0.12 });
        }); break;
        case '#': at(() => { rock(b, cx, cz, 1.0 + r() * 0.6, hex(r() < 0.5 ? '#7a7066' : '#6b625a')); if (r() < 0.22) crystal(b, cx + 0.25, cz + 0.2, 0.7, hex(r() < 0.5 ? '#a78bfa' : '#5eead4')); }); break;
        case 'T': at(() => tree(b, cx + (r() - 0.5) * 0.15, cz + (r() - 0.5) * 0.15, 0.8 + r() * 0.35, z === 'bosco' ? 'pine' : (z === 'fiume' && r() < 0.3) ? 'pine' : 'round')); break;
        case 'o': small(() => at(() => flowers(b, x, y, 5))); break;
        case '.': if (z === 'citta' && !path && r() < 0.05) small(() => at(() => flowers(b, x, y, 3))); if ((z === 'prato' || z === 'fiume') && !path && r() < 0.07) small(() => at(() => flowers(b, x, y, 2))); break;
        case 'F': {
          const wood = hex('#a8754a');
          b.add(box(), mat([cx, 0.25, cz], null, [0.09, 0.5, 0.09]), wood);
          [0.18, 0.38].forEach((yy) => b.add(box(), mat([cx, yy, cz], null, [1.02, 0.06, 0.05]), wood));
          break;
        }
        case '=': {
          for (let i = 0; i < 4; i++) b.add(box(), mat([cx, 0.08, y + 0.125 + i * 0.25], null, [1.04, 0.07, 0.22]), hex(i % 2 ? '#9a6b42' : '#a8754a'));
          [[-1, x - 1], [1, x + 1]].forEach(([s, nx]) => {
            if (nx >= 0 && nx < W && map[y][nx] === '=') return;
            const ex = cx + s * 0.48;
            b.add(box(), mat([ex, 0.3, cz], null, [0.07, 0.45, 0.07]), hex('#7a4b2a'));
            b.add(box(), mat([ex, 0.5, cz], null, [0.07, 0.06, 1.02]), hex('#7a4b2a'));
          });
          break;
        }
        default: break;
      }
    }
    // edifici, fontana, lampioni, cartelli, ingresso della grotta
    Wd.buildings.forEach((B) => { use((B.x0 + B.x1 + 1) / 2, (B.y0 + B.y1 + 1) / 2); house(b, B, B.kind); });
    const fx = 12, fz = 51, stone = hex('#c9c2b6');
    use(fx, fz);
    b.add(cyl(14), mat([fx, 0, fz], null, [0.95, 0.32, 0.95]), stone);
    b.add(cyl(14), mat([fx, 0.27, fz], null, [0.82, 0.02, 0.82]), hex('#4fa6e6'), { emis: 0.25, anim: -0.015 });
    b.add(cyl(8), mat([fx, 0, fz], null, [0.13, 0.95, 0.13]), stone);
    b.add(cyl(10), mat([fx, 0.92, fz], null, [0.38, 0.08, 0.38]), stone);
    b.add(cone(8), mat([fx, 0.98, fz], null, [0.12, 0.35, 0.12]), hex('#9fd8ff'), { emis: 0.6, anim: 0.02 });
    [[13.6, 47.5], [17.4, 47.5], [13.6, 52.5], [17.4, 52.5], [13.4, 44.3], [18.6, 44.3], [16.4, 33.5], [19.6, 25.5], [Wd.pathX(14) - 0.6, 14.5], [Wd.pathX(12) + 2.6, 12.5]].forEach(([lx, lz]) => {
      const y = hA(lx, lz);
      use(lx, lz);
      b.add(cyl(6), mat([lx, y, lz], null, [0.05, 1.15, 0.05]), hex('#334155'));
      b.add(box(), mat([lx, y + 1.17, lz], null, [0.2, 0.04, 0.2]), hex('#334155'));
      b.add(ico(1), mat([lx, y + 1.08, lz], null, 0.11), hex('#fff3b0'), { emis: 1 });
      lamps.push([lx, y + 1.08, lz]);
    });
    [[44, 'prato'], [33, 'fiume'], [23, 'bosco'], [12, 'grotta']].forEach(([yy]) => {
      const sx = Wd.pathX(yy) - 0.45, y = hA(sx, yy + 0.5);
      use(sx, yy + 0.5);
      b.add(box(), mat([sx, y + 0.35, yy + 0.5], null, [0.07, 0.7, 0.07]), hex('#7a4b2a'));
      b.add(box(), mat([sx, y + 0.62, yy + 0.5], [0.3, 0, 0], [0.5, 0.26, 0.05]), hex('#c08a57'));
    });
    // bocca della grotta a nord
    const gx = Wd.pathX(1) + 1, gy = hA(gx, 0);
    use(gx, 0.5);
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI * (i / 8);
      rockAt(b, gx + Math.cos(a) * 1.9, gy + Math.sin(a) * 1.7, -0.2, 0.9 + (i % 3) * 0.2);
    }
    b.add(disc(16), mat([gx, gy + 0.85, -0.25], [0, Math.PI / 2, 0], [1.55, 1, 1.4]), hex('#06050a'), { jit: 0 });
    return { chunks: Array.from(chunks.values()), lamps };
  }
  function rockAt(b, x, y, z, s) { b.add(ico(1), mat([x, y, z], [b.rng() * 6, 0, 0], [0.75 * s, 0.7 * s, 0.7 * s]), hex('#6b625a'), { noise: 0.2, jit: 0.12, seed: Math.floor(b.rng() * 99) }); }

  // aspetti dei personaggi: colori + cappello/capelli/mantello costruiti con le primitive
  const LOOKS = {
    hero: { shirt: '#1f2937', band: '#22c55e', cap: '#3b82f6', pack: '#22c55e', pants: '#334155', skin: '#ffd7b5' },
    nonna: { shirt: '#a855f7', band: '#f5d0fe', cap: '#e5e7eb', pack: '#a855f7', pants: '#4b5563', skin: '#f1c8a5' },
    pescatore: { shirt: '#0ea5e9', band: '#fde68a', cap: '#f59e0b', pack: '#065f46', pants: '#1e3a8a', skin: '#e0ac85' },
    bimba: { shirt: '#f43f5e', band: '#fff1f2', cap: '#fb7185', pack: '#fde047', pants: '#1f2937', skin: '#ffe0c2' },
    rivale: { shirt: '#b91c1c', band: '#111827', cap: '#111827', hat: 'backcap', hair: '#f97316', hairStyle: 'spiky', pack: '#f97316', pants: '#1f2937', skin: '#f5c9a0' },
    prof: { shirt: '#f3f4f6', band: '#60a5fa', hat: 'none', hair: '#9ca3af', coat: '#f8fafc', glasses: true, tie: '#2563eb', pack: null, pants: '#475569', skin: '#f1c8a5' },
    guardiano_prato: { shirt: '#16a34a', band: '#facc15', cap: '#eab308', hat: 'straw', pack: null, pants: '#3f6212', skin: '#e8b98f', scarf: '#facc15' },
    guardiano_fiume: { shirt: '#0284c7', band: '#e0f2fe', cap: '#38bdf8', hat: 'beanie', cape: '#0e7490', pack: null, pants: '#1e3a8a', skin: '#d9a77c' },
    guardiano_bosco: { shirt: '#166534', band: '#a3e635', cap: '#3f6212', hat: 'hood', cape: '#3f6212', pack: null, pants: '#3f2d1c', skin: '#e0b48e' },
    guardiano_grotta: { shirt: '#57534e', band: '#f97316', cap: '#facc15', hat: 'helmet', pack: '#78716c', pants: '#44403c', skin: '#d2a07a' },
    campione: { shirt: '#4c1d95', band: '#fbbf24', cap: '#fbbf24', hat: 'crown', hair: '#111827', cape: '#7c3aed', capeTrim: '#fbbf24', pack: null, pants: '#1e1b4b', skin: '#f0c49c' },
  };
  function buildTrainer(look) {
    const L = look || LOOKS.hero, b = new Builder(11);
    const skin = hex(L.skin), shirt = hex(L.shirt), band = hex(L.band), cap = hex(L.cap || '#3b82f6');
    const hat = L.hat || 'cap';
    b.add(box(), mat([0, 0.46, 0], null, [0.32, 0.3, 0.2]), shirt);
    b.add(box(), mat([0, 0.4, 0.005], null, [0.33, 0.07, 0.21]), band, { jit: 0 });
    if (L.coat) {      // camice lungo aperto davanti
      [-1, 1].forEach((s) => b.add(box(), mat([s * 0.1, 0.4, 0.01], null, [0.15, 0.46, 0.23]), hex(L.coat), { jit: 0.02 }));
      b.add(box(), mat([0, 0.58, 0.01], null, [0.36, 0.12, 0.23]), hex(L.coat), { jit: 0.02 });
    }
    if (L.tie) b.add(box(), mat([0, 0.5, 0.115], null, [0.045, 0.17, 0.02]), hex(L.tie), { jit: 0 });
    if (L.scarf) b.add(box(), mat([0, 0.63, 0], null, [0.3, 0.06, 0.22]), hex(L.scarf));
    b.add(ico(1), mat([0, 0.78, 0], null, [0.17, 0.17, 0.16]), skin, { jit: 0.03 });
    [-1, 1].forEach((s) => b.add(ico(0), mat([s * 0.06, 0.77, 0.15], null, 0.022), BLACK, { jit: 0 }));
    if (L.glasses) {
      [-1, 1].forEach((s) => b.add(box(), mat([s * 0.06, 0.775, 0.158], null, [0.07, 0.05, 0.015]), hex('#1f2937'), { jit: 0 }));
      b.add(box(), mat([0, 0.78, 0.158], null, [0.05, 0.012, 0.012]), hex('#1f2937'), { jit: 0 });
    }
    if (L.hair) {
      const hc = hex(L.hair);
      b.add(ico(1), mat([0, 0.84, -0.025], null, [0.18, 0.12, 0.17]), hc);
      if (L.hairStyle === 'spiky') for (let i = 0; i < 5; i++) {
        const a = -0.9 + i * 0.45;
        b.add(cone(4), mat([Math.sin(a) * 0.1, 0.9, -0.05 + Math.cos(a) * 0.02], [0, -0.7, -Math.sin(a) * 0.6], [0.05, 0.16, 0.05]), hc);
      }
    }
    switch (hat) {
      case 'none': break;
      case 'backcap':
        b.add(ico(1), mat([0, 0.86, -0.01], null, [0.185, 0.1, 0.18]), cap, { colorFn: (ce) => (ce[1] < -0.2 ? skin : cap) });
        b.add(box(), mat([0, 0.86, -0.16], [0, 0.15, 0], [0.2, 0.03, 0.13]), cap);
        break;
      case 'straw':
        b.add(cyl(14), mat([0, 0.88, 0], null, [0.3, 0.02, 0.3]), cap);
        b.add(cyl(12), mat([0, 0.88, 0], null, [0.16, 0.13, 0.16]), cap);
        b.add(cyl(12), mat([0, 0.9, 0], null, [0.165, 0.035, 0.165]), hex('#b91c1c'), { jit: 0 });
        break;
      case 'beanie':
        b.add(ico(1), mat([0, 0.86, -0.01], null, [0.19, 0.14, 0.185]), cap, { colorFn: (ce) => (ce[1] < -0.3 ? skin : cap) });
        b.add(ico(1), mat([0, 1.0, -0.02], null, 0.05), WHITE);
        break;
      case 'hood':
        b.add(ico(1), mat([0, 0.8, -0.075], null, [0.205, 0.21, 0.18]), cap);
        b.add(cone(5), mat([0, 0.86, -0.2], [0, -1.9, 0], [0.07, 0.16, 0.07]), cap);
        break;
      case 'helmet':
        b.add(ico(1), mat([0, 0.86, 0], null, [0.2, 0.13, 0.2]), cap, { colorFn: (ce) => (ce[1] < -0.3 ? skin : cap) });
        b.add(cyl(14), mat([0, 0.84, 0], null, [0.23, 0.02, 0.23]), cap);
        b.add(cyl(8), mat([0, 0.9, 0.17], [0, Math.PI / 2, 0], [0.045, 0.04, 0.045]), hex('#fff7c2'), { emis: 1, jit: 0 });
        break;
      case 'crown':
        b.add(cyl(10), mat([0, 0.86, 0], null, [0.16, 0.08, 0.16]), cap, { emis: 0.25 });
        for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; b.add(cone(4), mat([Math.sin(a) * 0.14, 0.94, Math.cos(a) * 0.14], null, [0.035, 0.08, 0.035]), cap, { emis: 0.3 }); }
        b.add(ico(0), mat([0, 0.9, 0.16], null, 0.03), hex('#ef4444'), { emis: 0.6, jit: 0 });
        break;
      default:
        b.add(ico(1), mat([0, 0.85, -0.01], null, [0.185, 0.11, 0.18]), cap, { colorFn: (ce) => (ce[1] < -0.2 ? skin : cap) });
        b.add(box(), mat([0, 0.85, 0.15], null, [0.22, 0.03, 0.15]), cap);
    }
    if (L.cape) {
      b.add(box(), mat([0, 0.4, -0.13], [0, 0.12, 0], [0.38, 0.52, 0.03]), hex(L.cape));
      b.add(box(), mat([0, 0.635, -0.1], null, [0.36, 0.05, 0.08]), hex(L.cape));
      if (L.capeTrim) b.add(box(), mat([0, 0.15, -0.16], [0, 0.12, 0], [0.39, 0.04, 0.035]), hex(L.capeTrim), { emis: 0.25 });
    } else if (L.pack) b.add(box(), mat([0, 0.5, -0.14], null, [0.25, 0.27, 0.1]), hex(L.pack));
    return b;
  }
  const limbMesh = (key, col, w, len) => mesh(key, () => new Builder(3).add(box(), mat([0, -len / 2, 0], null, [w, len, w]), hex(col)));
  function drawTrainer(R, lookName, pos, yaw, walk, moving, scale) {
    const L = LOOKS[lookName] || LOOKS.hero;
    const sw = moving ? Math.sin(walk) : 0;
    const bobY = moving ? Math.abs(Math.sin(walk)) * 0.04 : 0;
    const base = mat(V.add(pos, [0, bobY, 0]), [yaw, 0, 0], scale || 1.25);
    softShadow(R, pos[0], pos[1] + 0.012, pos[2], 0.3, 0.25, 0.36);
    const lk = LOOKS[lookName] ? lookName : 'hero';
    R.draw(mesh('trainer:' + lk, () => buildTrainer(L)), base, {});
    const leg = limbMesh('leg:' + L.pants, L.pants, 0.12, 0.3), arm = limbMesh('arm:' + L.shirt, L.shirt, 0.08, 0.26);
    [-1, 1].forEach((s) => {
      R.draw(leg, mmul(base, mat([s * 0.08, 0.31, 0], [0, s * sw * 0.7, 0], 1)), {});
      R.draw(arm, mmul(base, mat([s * 0.21, 0.6, 0], [0, -s * sw * 0.6, s * 0.12], 1)), {});
    });
  }
  const bangMesh = () => mesh('fx:bang', () => {
    const b = new Builder(2);
    b.add(box(), mat([0, 0.16, 0], null, [0.07, 0.22, 0.07]), hex('#ffd23f'), { emis: 1, jit: 0 });
    b.add(box(), mat([0, 0, 0], null, [0.07, 0.07, 0.07]), hex('#ffd23f'), { emis: 1, jit: 0 });
    return b;
  });

  const CHUNK_R = 6, IDENT = mat();
  function createMapScene(opts) {
    const Wd = opts.world, map = Wd.grid, H = Wd.H, W = Wd.W;
    const gy = (p) => Wd.groundY(p[0], p[2]);
    const sc = { clock: 0, p: [0, 0, 0], target: [0, 0, 0], yaw: Math.PI, walk: 0, moving: 0, follower: null, fpos: null, ftarget: null, fyaw: Math.PI, cam: null, quarter: 0, camYaw: 0.38, view: null, ents: new Map(), getHour: opts.getHour || (() => 12) };
    const TILT = 0.38;
    sc.rotate = function (dir) { sc.quarter = (sc.quarter + (dir || 1) + 4) % 4; sc.camTarget = (sc.camTarget == null ? TILT : sc.camTarget) + (dir || 1) * Math.PI / 2; };
    sc.setQuarter = function (q) { sc.quarter = ((q || 0) % 4 + 4) % 4; sc.camTarget = TILT + sc.quarter * Math.PI / 2; sc.camYaw = sc.camTarget; };
    sc.screenToWorld = function (ix, iy) {
      const th = sc.quarter * Math.PI / 2, fwd = [-Math.sin(th), -Math.cos(th)], right = [Math.cos(th), -Math.sin(th)];
      return [Math.round(ix * right[0] - iy * fwd[0]), Math.round(ix * right[1] - iy * fwd[1])];
    };
    const tileC = (x, y) => [x + 0.5, 0, y + 0.5];
    sc.setPlayer = function (x, y, instant, dx, dy) {
      const prev = sc.target.slice();
      sc.target = tileC(x, y);
      if (instant || !sc.cam) {
        sc.p = sc.target.slice();
        const cand = [[x, y + 1], [x, y - 1], [x + 1, y], [x - 1, y]].find(([fx, fy]) => fx >= 0 && fy >= 0 && fx < W && fy < H && !Wd.isSolid(map[fy][fx]));
        sc.fpos = cand ? tileC(cand[0], cand[1]) : sc.p.slice();
        sc.ftarget = sc.fpos.slice();
        sc.cam = null;
      } else sc.ftarget = prev;
      if (dx || dy) sc.yaw = Math.atan2(dx || 0, dy || 0);
    };
    /** setFollower('fiammino') o setFollower('fiammino', true) / ('fiammino*') per lo shiny. */
    sc.setFollower = function (id, shiny) { if (!id) { sc.follower = null; return; } const P = parseMon(id, shiny); sc.follower = P.id; sc.followerShiny = P.shiny; };
    /** Creature selvatiche, abitanti e oggetti:
     *  [{ key, kind:'mon', id, shiny?, x, y } | { key, kind:'npc', look, alert?, yaw?, x, y } | { key, kind:'item', x, y }] */
    sc.setEntities = function (list) {
      const keep = new Set();
      list.forEach((e) => {
        keep.add(e.key);
        const cur = sc.ents.get(e.key), tgt = tileC(e.x, e.y);
        if (!cur) sc.ents.set(e.key, Object.assign({}, e, { pos: tgt.slice(), tgt, yaw: e.yaw != null ? e.yaw : Math.random() * 6, born: sc.clock, walk: 0, moving: 0 }));
        else {
          if (tgt[0] !== cur.tgt[0] || tgt[2] !== cur.tgt[2]) cur.yaw = Math.atan2(tgt[0] - cur.tgt[0], tgt[2] - cur.tgt[2]);
          cur.tgt = tgt; cur.x = e.x; cur.y = e.y;
          cur.alert = !!e.alert; cur.shiny = !!e.shiny; cur.look = e.look || cur.look; cur.id = e.id || cur.id;
          cur.faceYaw = e.yaw;          // direzione dello sguardo quando è fermo
          if (cur.alert && !cur.alertT) cur.alertT = sc.clock; else if (!cur.alert) cur.alertT = 0;
        }
      });
      Array.from(sc.ents.keys()).forEach((k) => { if (!keep.has(k)) sc.ents.delete(k); });
    };
    const moveTo = (cur, tgt, maxStep) => { const d = V.sub(tgt, cur), l = Math.hypot(d[0], d[2]); if (l <= maxStep || l > 3) return tgt.slice(); return V.add(cur, V.mul(d, maxStep / l)); };
    let world = null;
    sc.frame = function (R, t, dt) {
      if (!world) world = buildWorld(Wd);
      const before = sc.p;
      sc.p = moveTo(sc.p, sc.target, dt * 7.5);
      const moved = Math.hypot(sc.p[0] - before[0], sc.p[2] - before[2]) > 1e-4;
      sc.moving = moved ? 0.12 : Math.max(0, sc.moving - dt);
      if (sc.moving > 0) sc.walk += dt * 13;
      if (sc.fpos) {
        const fb = sc.fpos;
        sc.fpos = moveTo(sc.fpos, sc.ftarget, dt * 7.5);
        const fd = V.sub(sc.fpos, fb);
        if (Math.hypot(fd[0], fd[2]) > 1e-4) { sc.fyaw = Math.atan2(fd[0], fd[2]); sc.fwalk = (sc.fwalk || 0) + dt * 13; }
      }
      const want = [sc.p[0], gy(sc.p), sc.p[2]];
      sc.cam = sc.cam ? V.lerp(sc.cam, want, 1 - Math.exp(-dt * 8)) : want.slice();
      if (sc.camTarget == null) sc.camTarget = TILT;
      sc.camYaw += (sc.camTarget - sc.camYaw) * (1 - Math.exp(-dt * 7));
      const cy = Math.cos(sc.camYaw), sy = Math.sin(sc.camYaw);
      const eye = V.add(sc.cam, [sy * 6.1, 5.0, cy * 6.1]), tgt = V.add(sc.cam, [-sy * 0.8, 0.3, -cy * 0.8]);
      // ai bordi la camera non deve finire dentro le montagne
      const ground = Wd.heightAt(eye[0], eye[2]) + 1.6;
      if (eye[1] < ground) eye[1] = ground;
      // atmosfera: zona + ora del giorno
      const z = sc.p[2];
      let base;
      if (z < 11) base = MAPENV.grotta;
      else if (z < 14) base = mixEnv(MAPENV.grotta, MAPENV.bosco, (z - 11) / 3);
      else if (z < 22) base = MAPENV.bosco;
      else if (z < 25) base = mixEnv(MAPENV.bosco, MAPENV.open, (z - 22) / 3);
      else base = MAPENV.open;
      const hour = sc.getHour();
      let env = envAt(base, hour, z < 12 ? 0.5 : 1);
      sc.rain = z >= 12 && opts.getWeather && opts.getWeather() === 'pioggia';
      if (sc.rain) { const n = env.night; env = mixEnv(env, { fog: hex('#7d8996'), hemiSky: hex('#a9b4bf'), hemiGround: hex('#3f4a3a'), sun: [0.42, 0.45, 0.52], amb: env.amb * 0.85 }, 0.72 * (1 - n * 0.6)); env.night = n; }
      env.clear = env.fog.concat(1); env.light = [-0.45, -1, -0.4];
      sc.night = env.night;
      R.begin(projFor(R, sc.view, (a) => (a < 0.75 ? 1.0 : a < 1.2 ? 0.88 : 0.72)), lookAt(eye, tgt), eye, env, t);
      const fwd = [-sy, -cy];
      sc.drawnChunks = 0;
      world.chunks.forEach((c) => {
        const dx = c.cx - eye[0], dz = c.cz - eye[2];
        const dist = Math.hypot(c.cx - sc.cam[0], c.cz - sc.cam[2]);
        if (dist > qual().far) return;                                  // lontano: lo copre la nebbia
        if (dx * fwd[0] + dz * fwd[1] < -CHUNK_R) return;        // dietro la camera
        R.draw(mesh('world:' + c.key, () => c), IDENT, {});
        if (dist < qual().detail && c.detail.d.length) R.draw(mesh('world:' + c.key + ':d', () => c.detail), IDENT, {});
        sc.drawnChunks++;
      });
      // giocatore e compagno
      drawTrainer(R, 'hero', [sc.p[0], gy(sc.p), sc.p[2]], sc.yaw, sc.walk, sc.moving > 0);
      if (sc.follower && sc.fpos) {
        const L = speciesLook(sc.follower, sc.followerShiny), s = L.scale * 0.5;
        const fw = sc.fwalk || 0, hop = Math.abs(Math.sin(fw)) * 0.05, fg = gy(sc.fpos);
        const fy = L.ghost ? 0.18 + Math.sin(t * 1.8) * 0.05 : hop;
        softShadow(R, sc.fpos[0], fg + 0.012, sc.fpos[2], 0.24 * L.scale, 0.2 * L.scale, 0.3);
        R.draw(creatureMesh(sc.follower, sc.followerShiny), mat([sc.fpos[0], fg + fy, sc.fpos[2]], [sc.fyaw, 0, 0], s), {});
      }
      // creature selvatiche, abitanti, oggetti
      const pm = particleMesh();
      sc.ents.forEach((e) => {
        const before2 = e.pos;
        e.pos = moveTo(e.pos, e.tgt, dt * (e.kind === 'npc' ? 2.6 : 3.2));
        const mv = Math.hypot(e.pos[0] - before2[0], e.pos[2] - before2[2]) > 1e-4;
        e.moving = mv ? 0.15 : Math.max(0, e.moving - dt);
        if (e.moving > 0) e.walk += dt * 11;
        const g0 = gy(e.pos), pop = Math.min(1, (t - e.born) / 0.4);
        if (e.kind === 'npc') {
          const yaw = e.moving > 0 || e.faceYaw == null ? e.yaw : e.faceYaw;
          drawTrainer(R, e.look, [e.pos[0], g0, e.pos[2]], yaw, e.walk, e.moving > 0, 1.2);
          if (e.alert) {        // "!" che salta fuori sopra la testa
            const pop2 = easeOutBack(clamp01((t - (e.alertT || 0)) / 0.3));
            R.draw(bangMesh(), mat([e.pos[0], g0 + 1.32 + Math.abs(Math.sin(t * 6)) * 0.05, e.pos[2]], [sc.camYaw, 0, 0], 1.5 * Math.max(0.05, pop2)), {});
          }
          return;
        }
        if (e.kind === 'item') {
          const yy = g0 + 0.22 + Math.sin(t * 2.2 + e.x) * 0.06;
          R.draw(capsuleMesh(), mat([e.pos[0], yy, e.pos[2]], [t * 1.6, 0.3, 0], 0.12 * pop), {});
          R.draw(pm, mat([e.pos[0], yy, e.pos[2]], null, 0.24 + Math.sin(t * 4) * 0.03), { tint: [1, 0.95, 0.5], alpha: 0.22, blend: true, noDepth: true });
          return;
        }
        const L = speciesLook(e.id, e.shiny), s = L.scale * 0.55 * (0.2 + 0.8 * easeOutBack(clamp01(pop)));
        const hop = e.moving > 0 ? Math.abs(Math.sin(e.walk)) * 0.12 : Math.max(0, Math.sin(t * 2.6 + e.x * 3)) * 0.03;
        const fy = L.ghost ? 0.25 + Math.sin(t * 1.8 + e.x) * 0.07 : hop;
        softShadow(R, e.pos[0], g0 + 0.012, e.pos[2], 0.26 * L.scale, 0.22 * L.scale, 0.3);
        R.draw(creatureMesh(e.id, e.shiny), mat([e.pos[0], g0 + fy, e.pos[2]], [e.yaw + Math.sin(t * 0.9 + e.x) * 0.3, 0, 0], s), {});
        if (e.shiny) {          // luccichio periodico degli shiny
          const ph = (t * 0.55 + e.x * 0.37 + e.y * 0.21) % 1;
          if (ph < 0.3) for (let k = 0; k < 3; k++) {
            const q = ph / 0.3, a = k * 2.1 + e.x;
            R.draw(starMesh(), mat([e.pos[0] + Math.cos(a) * 0.3, g0 + fy + (0.25 + k * 0.15) * L.scale, e.pos[2] + Math.sin(a) * 0.3], [t * 3, 0, 0], 0.05 * Math.sin(Math.PI * q) + 0.01), { tint: hex('#fff59d'), alpha: Math.sin(Math.PI * q), blend: true });
          }
        }
        const dist = Math.hypot(e.pos[0] - sc.p[0], e.pos[2] - sc.p[2]);
        if (dist < 2.6) R.draw(bangMesh(), mat([e.pos[0], g0 + fy + L.top * s + 0.25 + Math.abs(Math.sin(t * 6)) * 0.05, e.pos[2]], [sc.camYaw, 0, 0], 1.3), {});
      });
      // vita nell'aria: farfalle, lucciole, foglie, polvere
      drawAmbient(R, pm, t, env, sc.p, gy);
      if (env.night > 0.2) {
        const halo = mesh('fx:halo', () => new Builder(1).add(ico(2), mat(null, null, 1), WHITE, { emis: 1, jit: 0 }));
        world.lamps.forEach((L) => {
          if (Math.abs(L[0] - sc.p[0]) > 14 || Math.abs(L[2] - sc.p[2]) > 14) return;
          R.draw(halo, mat(L, null, 0.34), { tint: [1, 0.9, 0.55], alpha: 0.16 * env.night, blend: true, noDepth: true });
          R.draw(halo, mat(L, null, 0.2), { tint: [1, 0.95, 0.7], alpha: 0.25 * env.night, blend: true, noDepth: true });
          R.draw(shadowMesh(), mat([L[0], L[1] - 1.06, L[2]], null, [1.3, 1, 1.3]), { tint: [1, 0.85, 0.5], alpha: 0.12 * env.night, blend: true, noDepth: true });
        });
      }
      if (sc.rain) drawRain(R, pm, t, sc.p, gy);
    };
    function drawRain(R, pm, t, p, gy0) {
      for (let i = 0; i < 110; i++) {
        const hs = (k) => { const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };
        const x = p[0] + (hs(1) - 0.5) * 16, z = p[2] + (hs(2) - 0.7) * 16;
        const g = gy0([x, 0, z]), fall = (t * 1.6 + hs(3)) % 1;
        R.draw(pm, mat([x - fall * 0.3, g + 4.2 - fall * 4.2, z], [0, 0, 0.08], [0.007, 0.2, 0.007]), { tint: [0.82, 0.9, 1], alpha: 0.7, blend: true });
        if (fall > 0.93) R.draw(pm, mat([x - 0.28, g + 0.02, z], null, [0.06, 0.005, 0.06]), { tint: [0.85, 0.92, 1], alpha: 0.5, blend: true, noDepth: true });
      }
    }
    function drawAmbient(R, pm, t, env, p, gy0) {
      const zone = Wd.zoneAt(Math.floor(p[2]));
      const night = env.night > 0.5;
      const kind = zone === 'grotta' ? 'dust' : night ? 'firefly' : zone === 'bosco' ? 'leaf' : 'butterfly';
      if (sc.rain && kind === 'butterfly') return;
      const cell = 2.2, cx0 = Math.floor(p[0] / cell), cz0 = Math.floor(p[2] / cell);
      for (let i = -4; i <= 4; i++) for (let j = -5; j <= 3; j++) {
        const gx = cx0 + i, gz = cz0 + j;
        const hsh = (k) => { const v = Math.sin(gx * 91.3 + gz * 47.7 + k * 13.1) * 43758.5; return v - Math.floor(v); };
        if (hsh(1) > (kind === 'butterfly' ? 0.28 : kind === 'leaf' ? 0.45 : 0.55)) continue;
        const ph = hsh(2) * 20;
        let x = (gx + hsh(3)) * cell, z = (gz + hsh(4)) * cell;
        if (x < 0 || z < 0 || x > W || z > H) continue;
        const ground = gy0([x, 0, z]);
        if (kind === 'butterfly') {
          x += Math.sin(t * 0.7 + ph) * 0.8; z += Math.cos(t * 0.55 + ph) * 0.8;
          const y = ground + 0.55 + Math.sin(t * 2.1 + ph) * 0.2, flap = Math.abs(Math.sin(t * 16 + ph));
          const col = hex(['#ffffff', '#ffd23f', '#ff8fb3', '#67e8f9', '#fb923c'][Math.floor(hsh(5) * 5)]);
          R.draw(pm, mat([x, y, z], [t * 0.7 + ph, 0, 0], [0.1 * flap + 0.02, 0.012, 0.07]), { tint: col });
        } else if (kind === 'firefly') {
          x += Math.sin(t * 0.4 + ph) * 0.9; z += Math.cos(t * 0.33 + ph) * 0.9;
          const y = ground + 0.4 + Math.sin(t * 0.9 + ph) * 0.35, blink = Math.max(0, Math.sin(t * 2.3 + ph));
          R.draw(pm, mat([x, y, z], null, 0.04), { tint: [0.85, 1, 0.45], alpha: 0.35 + blink * 0.65, blend: true });
          R.draw(pm, mat([x, y, z], null, 0.14), { tint: [0.85, 1, 0.45], alpha: 0.15 * blink, blend: true, noDepth: true });
        } else if (kind === 'leaf') {
          const fall = (t * 0.22 + hsh(6)) % 1;
          x += Math.sin(t * 1.3 + ph) * 0.4; const y = ground + 3.2 - fall * 3.2;
          R.draw(pm, mat([x, y, z], [t * 2 + ph, Math.sin(t * 3 + ph), 0], [0.07, 0.012, 0.045]), { tint: hex(hsh(7) < 0.5 ? '#f59e0b' : '#84cc16'), alpha: Math.min(1, (1 - fall) * 4), blend: true });
        } else {
          const rise = (t * 0.08 + hsh(6)) % 1;
          R.draw(pm, mat([x + Math.sin(t * 0.3 + ph) * 0.4, ground + 0.2 + rise * 2.2, z], null, 0.025), { tint: [0.85, 0.82, 1], alpha: 0.5 * Math.sin(rise * Math.PI), blend: true });
        }
      }
    }
    return sc;
  }

  root.FMLAB3D = {
    loadGLB, registerAsset, get assets() { return Object.keys(ASSETS); },
    get quality() { return Q.level; },
    set quality(v) { if (v === 'auto' || v == null) { Q.manual = false; return; } if (QUALITY[v]) { Q.level = v; Q.manual = true; } },
    supported, mount, createBattleScene, createShowcase, createMapScene,
    get stats() { return { frames: S.frames, tris: S.R ? S.R.tris : 0, error: S.error || null, cached: S.cache.size, fps: Math.round(Q.fps), quality: Q.level }; },
    set speed(v) { S.speed = v; }, get speed() { return S.speed; },
    _internal: { buildCreature, buildArena, buildWorld, mat, mmul },
  };
})(typeof self !== 'undefined' ? self : this);
