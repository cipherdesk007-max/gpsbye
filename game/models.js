/*
 * FMLAB Monsters — modelli e animazioni di personaggi e creature.
 * Si aggancia al motore 3D tramite FMLAB3D.hooks (vedi gl3d.js, "ganci per i modelli").
 *
 * Ogni creatura è uno "scheletro" di pezzi (corpo, testa, occhi, bocca, zampe, coda, fiamme…)
 * costruiti una volta sola. A ogni fotogramma si calcola solo la posa di ogni pezzo
 * (respiro, sguardo, battito di palpebre, camminata, attacco, colpo, KO, sonno) e lo si disegna.
 * Stessa cosa per i personaggi umani: bacino, busto, testa con viso, braccia con gomiti,
 * gambe con ginocchia, capelli e cappelli diversi per ogni aspetto.
 *
 * Tutti i design sono originali FMLAB.
 */
(function (root) {
  'use strict';
  const G3 = root.FMLAB3D;
  if (!G3 || !G3.kit) return;
  const K = G3.kit, E = root.FMLABEngine;
  const { Builder, mat, mmul, hex, shade, mix, ico, cone, cyl, box, mesh } = K;
  const WHITE = [1, 1, 1];
  const clamp01 = (v) => Math.max(0, Math.min(1, v));

  // ---------- ombreggiatura morbida ----------
  // Se il motore sa già fare le superfici lisce (opzione smooth), lo lasciamo fare a lui;
  // altrimenti mediamo noi le normali dei vertici che coincidono, pezzo per pezzo.
  const NATIVE_SMOOTH = /smooth/.test(String(Builder.prototype.add));
  const STRIDE = (() => { const b = new Builder(1); b.tri([0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 1], {}); return b.d.length / 3; })();
  function smoothFrom(b, start) {
    if (NATIVE_SMOOTH) return;
    const d = b.d, acc = new Map();
    const key = (i) => Math.round(d[i] * 4000) + ',' + Math.round(d[i + 1] * 4000) + ',' + Math.round(d[i + 2] * 4000);
    for (let i = start; i < d.length; i += STRIDE) {
      const k = key(i); let a = acc.get(k);
      if (!a) acc.set(k, (a = [0, 0, 0]));
      a[0] += d[i + 3]; a[1] += d[i + 4]; a[2] += d[i + 5];
    }
    for (let i = start; i < d.length; i += STRIDE) {
      const a = acc.get(key(i)), l = Math.hypot(a[0], a[1], a[2]) || 1;
      d[i + 3] = a[0] / l; d[i + 4] = a[1] / l; d[i + 5] = a[2] / l;
    }
  }
  function addShape(b, g, m, col, o) {
    o = o || {};
    const start = b.d.length, smooth = o.smooth !== false;
    b.add(g, m, col, Object.assign({ jit: smooth ? 0.012 : 0.06 }, o, { smooth }));
    if (smooth) smoothFrom(b, start);
  }

  // ---------- costruzione di un pezzo in coordinate della creatura ----------
  // Si scrive in coordinate assolute (piedi a y=0, muso verso +Z); il pezzo viene centrato sul suo perno.
  function PB(pivot, seed) { this.b = new Builder(seed || 7); this.p = pivot; }
  PB.prototype.M = function (c, r, s) { return mat([c[0] - this.p[0], c[1] - this.p[1], c[2] - this.p[2]], r || null, s); };
  // dettaglio automatico in base alla grandezza: le forme grandi più tonde, quelle piccole più leggere
  let DETAIL_BIAS = 0;     // alzato se una creatura supera il suo budget di triangoli
  const autoSub = (s) => { const v = [s[0], s[1], s[2]].sort((a, b) => b - a), m = v[1]; const k = 1 + DETAIL_BIAS * 0.22; return m > 0.175 * k ? 2 : m > 0.062 * k ? 1 : 0; };
  PB.prototype.ell = function (c, s, col, o) { o = o || {}; addShape(this.b, ico(o.sub == null ? autoSub(s) : Math.min(o.sub, autoSub(s) + (o.force ? 2 : 0))), this.M(c, o.rot, s), col, o); return this; };
  PB.prototype.cone = function (c, s, col, o) { o = o || {}; addShape(this.b, cone(Math.min(o.seg || 7, Math.max(s[0], s[2]) > 0.15 ? 12 : 7)), this.M(c, o.rot, s), col, o); return this; };
  PB.prototype.cyl = function (c, s, col, o) { o = o || {}; addShape(this.b, cyl(Math.min(o.seg || 8, Math.max(s[0], s[2]) > 0.12 ? 14 : 8)), this.M(c, o.rot, s), col, o); return this; };
  PB.prototype.box = function (c, s, col, o) { o = o || {}; addShape(this.b, box(), this.M(c, o.rot, s), col, Object.assign({ smooth: false }, o)); return this; };

  // orientamento che porta l'asse +Z del pezzo sulla direzione n
  function faceTo(n) { return [Math.atan2(n[0], n[2]), -Math.asin(Math.max(-1, Math.min(1, n[1]))), 0]; }
  // punto e normale sulla superficie di un ellissoide (centro c, raggi r), visto da davanti
  function onSurface(c, r, x, y) {
    const k = 1 - (x / r[0]) ** 2 - (y / r[1]) ** 2;
    const z = r[2] * Math.sqrt(Math.max(0.02, k));
    const p = [c[0] + x, c[1] + y, c[2] + z];
    const n = [x / (r[0] * r[0]), y / (r[1] * r[1]), z / (r[2] * r[2])], l = Math.hypot(n[0], n[1], n[2]);
    return { p, n: [n[0] / l, n[1] / l, n[2] / l] };
  }
  const along = (p, n, d) => [p[0] + n[0] * d, p[1] + n[1] * d, p[2] + n[2] * d];

  // ---------- scheletro ----------
  function Rig(id) { this.id = id; this.parts = []; this.by = {}; this.tris = 0; }
  /** part(nome, padre, perno, ruolo, opzioni, costruzione) */
  Rig.prototype.part = function (name, parent, pivot, role, o, build) {
    const pb = new PB(pivot, E.hashString(this.id + name));
    build(pb);
    const P = Object.assign({ name, parent: parent || null, pivot, role, builder: pb.b, key: 'mdl:' + this.id + ':' + name }, o || {});
    P.tris = pb.b.d.length / STRIDE / 3;
    this.tris += P.tris;
    this.parts.push(P); this.by[name] = P;
    return P;
  };

  // ---------- pezzi riutilizzabili ----------
  const IRIS = { fuoco: '#ffb02e', acqua: '#1e88e5', erba: '#2e9d4a', elettro: '#00b8d9', roccia: '#8d5a3b', ombra: null };
  /** due occhi sulla superficie di un ellissoide (testa o corpo). */
  function eyes(rig, parent, P, head, o) {
    o = o || {};
    const er = (o.r || 0.1) * 1.12, ex = o.x || 0.16, ey = o.y || 0.08;
    [-1, 1].forEach((s) => {
      const S = onSurface(head.c, head.r, s * ex, ey);
      const c = along(S.p, S.n, -er * 0.35), rot = faceTo(S.n);
      rig.part(s < 0 ? 'eyeL' : 'eyeR', parent, c, 'eye', { side: s }, (pb) => {
        if (o.glow) {
          pb.ell(c, [er * 0.95, er * 1.2, er * 0.55], hex(P.acc.eye || '#fff6a0'), { rot, emis: 0.95, gloss: 1, sub: 1, force: true });
          pb.ell(along(c, S.n, er * 0.42), [er * 0.22, er * 0.75, er * 0.2], hex('#1a0b33'), { rot, sub: 1 });
          return;
        }
        const irisC = hex(o.iris || IRIS[P.type] || '#3b2a20');
        pb.ell(c, [er, er * 1.15, er * 0.6], hex('#fbfcff'), { rot, gloss: 0.9, emis: 0.12, sub: 1, force: true });
        pb.ell(along(c, S.n, er * 0.36), [er * 0.86, er * 0.96, er * 0.32], shade(irisC, -55), { rot, sub: 1, gloss: 0.8, force: true });
        pb.ell(along(c, S.n, er * 0.42), [er * 0.75, er * 0.86, er * 0.3], irisC, { rot, sub: 1, gloss: 0.8, force: true });
        pb.ell([c[0], c[1] - er * 0.2, c[2]].map((v, k) => v + S.n[k] * er * 0.5), [er * 0.5, er * 0.42, er * 0.2], mix(irisC, WHITE, 0.35), { rot, sub: 0, emis: 0.2 });
        pb.ell(along(c, S.n, er * 0.6), [er * 0.4, er * 0.48, er * 0.2], hex('#0b0b16'), { rot, sub: 1, gloss: 1 });
        const hl = along(c, S.n, er * 0.72);
        pb.ell([hl[0] - s * er * 0.28 + er * 0.06, hl[1] + er * 0.34, hl[2]], [er * 0.26, er * 0.26, er * 0.1], WHITE, { rot, sub: 1, emis: 1 });
        pb.ell([hl[0] + s * er * 0.2, hl[1] - er * 0.32, hl[2]], [er * 0.11, er * 0.11, er * 0.05], WHITE, { rot, sub: 0, emis: 1 });
        if (o.brow) pb.box([c[0] - s * er * 0.1, c[1] + er * 1.25, c[2] + er * 0.2], [er * 1.6, er * 0.3, er * 0.35], hex(o.browCol || P.dkHex), { rot: [rot[0], rot[1], s * (o.brow === 'fierce' ? 0.38 : -0.12)] });
      });
    });
  }
  function mouth(rig, parent, P, head, o) {
    o = o || {};
    const S = onSurface(head.c, head.r, 0, o.y == null ? -0.08 : o.y), rot = faceTo(S.n);
    const w = o.w || 0.09, c = along(S.p, S.n, -0.012);
    rig.part('mouth', parent, c, 'mouth', {}, (pb) => {
      pb.ell(c, [w, w * 0.55, 0.035], hex(o.col || '#3a1020'), { rot, sub: 1 });
      pb.ell(along([c[0], c[1] - w * 0.22, c[2]], S.n, 0.008), [w * 0.55, w * 0.25, 0.02], hex('#ff7b93'), { rot, sub: 1 });
      if (o.fang) [-1, 1].forEach((s) => pb.cone([c[0] + s * w * 0.45, c[1] + w * 0.32, c[2] + 0.02], [0.016, 0.035, 0.016], WHITE, { rot: [0, Math.PI, 0], seg: 5 }));
    });
  }
  function blush(pb, P, head, o) {
    o = o || {};
    [-1, 1].forEach((s) => {
      const S = onSurface(head.c, head.r, s * (o.x || 0.27), o.y || -0.02);
      pb.ell(along(S.p, S.n, -0.006), [0.06, 0.035, 0.02], mix(P.c, hex('#ff6f91'), 0.55), { rot: faceTo(S.n), sub: 1 });
    });
  }
  /** fiammella: 3 coni uno dentro l'altro, luminosi e mossi */
  function flame(pb, base, h, w, P, o) {
    o = o || {};
    const rot = o.rot || [0, 0, 0];
    pb.cone(base, [w, h, w], hex(P.acc.flame), { rot, emis: 0.7, anim: 0.03, seg: 7 });
    pb.cone([base[0], base[1] + h * 0.05, base[2] + w * 0.15], [w * 0.62, h * 0.74, w * 0.62], hex(P.acc.flame2), { rot, emis: 0.9, anim: 0.03, seg: 6 });
    pb.cone([base[0], base[1] + h * 0.08, base[2] + w * 0.3], [w * 0.3, h * 0.45, w * 0.3], hex(P.acc.flame3 || '#fff3b0'), { rot, emis: 1, seg: 5 });
  }
  /** foglia: ellissoide piatto con nervatura */
  function leaf(pb, c, len, wid, col, rot, P) {
    pb.ell(c, [wid, len, 0.018], col, { rot, sub: len < 0.1 ? 0 : 1, gloss: 0.35 });
    pb.box(c, [0.012, len * 1.6, 0.022], shade(col, -40), { rot });
  }
  /** cristallo sfaccettato luminoso */
  function crystal(pb, c, h, w, col, rot) {
    pb.cone(c, [w, h, w], col, { rot, seg: 5, smooth: false, emis: 0.55, gloss: 1 });
    pb.cone(c, [w, h * 0.4, w], col, { rot: [rot ? rot[0] : 0, (rot ? rot[1] : 0) + Math.PI, rot ? rot[2] : 0], seg: 5, smooth: false, emis: 0.45 });
  }
  /** zampa corta e tonda con dita */
  function paw(pb, c, r, col, toes) {
    pb.ell(c, [r, r * 0.62, r * 1.25], col);
    if (toes) [-1, 0, 1].forEach((k) => pb.ell([c[0] + k * r * 0.55, c[1] - r * 0.12, c[2] + r * 1.05], [r * 0.3, r * 0.28, r * 0.3], shade(col, 25), { sub: 1 }));
  }

  // ---------- colori ----------
  function colors(id, shiny) {
    const Art = root.FMLABArt, sp = E.SPECIES[id];
    const pal = Art && Art.palette ? Art.palette(id, !!shiny) : { body: E.TYPES[sp.type].color, dark: E.TYPES[sp.type].dark, acc: {} };
    const acc = Object.assign({ flame: '#ff8a1f', flame2: '#ffd23f', flame3: '#fff3b0', leaf: '#7ee08f', leaf2: '#5fcf74', petal: '#ff8fb3', core: '#ffd23f', orb: '#eaffff', eye: '#fff6a0' }, pal.acc || {});
    const c = hex(pal.body), dk = hex(pal.dark);
    return { c, dk, dkHex: pal.dark, lt: mix(c, WHITE, 0.55), belly: mix(c, hex('#fff6e5'), 0.62), acc, type: sp.type, stage: sp.stage, shiny: !!shiny };
  }

  // =====================================================================
  //                         LE 15 CREATURE
  // =====================================================================
  const SPECIES = {};

  // ---------- FUOCO ----------
  // Fiammino: cucciolo rotondo a pera, muso morbido, ciuffo di fiamma e codina accesa.
  SPECIES.fiammino = (R, P) => {
    R.kind = 'blob';
    const head = { c: [0, 0.52, 0.02], r: [0.42, 0.44, 0.4] };
    R.part('body', null, [0, 0.1, 0], 'body', {}, (pb) => {
      pb.ell(head.c, head.r, P.c, { gloss: 0.25 });
      pb.ell([0, 0.36, 0.2], [0.27, 0.25, 0.22], P.belly);
      pb.ell([0, 0.42, 0.36], [0.16, 0.11, 0.1], mix(P.belly, WHITE, 0.3));      // muso
      pb.ell([0, 0.47, 0.455], [0.035, 0.026, 0.02], hex('#3a1f1f'), { sub: 1, gloss: 1 }); // nasino
      blush(pb, P, head, { x: 0.26, y: -0.06 });
    });
    eyes(R, 'body', P, head, { r: 0.095, x: 0.15, y: 0.08 });
    mouth(R, 'body', P, { c: [0, 0.42, 0.36], r: [0.16, 0.11, 0.1] }, { y: -0.05, w: 0.06 });
    R.part('crest', 'body', [0, 0.92, -0.02], 'flame', { ph: 0 }, (pb) => {
      flame(pb, [0, 0.88, 0.0], 0.36, 0.14, P, { rot: [0, -0.2, 0] });
      flame(pb, [0.09, 0.86, -0.04], 0.24, 0.09, P, { rot: [0, -0.15, -0.4] });
      flame(pb, [-0.09, 0.86, -0.04], 0.24, 0.09, P, { rot: [0, -0.15, 0.4] });
    });
    R.part('tail', 'body', [0, 0.28, -0.34], 'tail', {}, (pb) => {
      pb.ell([0, 0.32, -0.46], [0.07, 0.07, 0.16], P.c, { rot: [0, 0.6, 0] });
      flame(pb, [0, 0.38, -0.57], 0.2, 0.09, P, { rot: [0, -0.5, 0] });
    });
    [-1, 1].forEach((s) => {
      R.part(s < 0 ? 'armL' : 'armR', 'body', [s * 0.36, 0.42, 0.12], 'arm', { side: s }, (pb) => pb.ell([s * 0.4, 0.34, 0.16], [0.08, 0.11, 0.08], P.c));
      R.part(s < 0 ? 'legL' : 'legR', null, [s * 0.19, 0.14, 0.06], 'leg', { side: s }, (pb) => paw(pb, [s * 0.19, 0.07, 0.12], 0.12, shade(P.c, -18), true));
    });
  };
  // Braciolo: bipede agile con criniera di fiamme, muso allungato e coda lunga accesa.
  SPECIES.braciolo = (R, P) => {
    R.kind = 'biped';
    const head = { c: [0, 1.0, 0.06], r: [0.24, 0.23, 0.23] };
    R.part('body', null, [0, 0.36, 0], 'body', {}, (pb) => {
      pb.ell([0, 0.62, 0], [0.27, 0.32, 0.24], P.c, { gloss: 0.25 });
      pb.ell([0, 0.58, 0.13], [0.18, 0.24, 0.14], P.belly);
      pb.ell([0, 0.36, -0.02], [0.22, 0.13, 0.19], shade(P.c, -10));
    });
    R.part('head', 'body', [0, 0.86, 0.02], 'head', {}, (pb) => {
      pb.ell(head.c, head.r, P.c, { gloss: 0.25 });
      pb.ell([0, 0.95, 0.28], [0.12, 0.085, 0.17], P.c, { gloss: 0.25 });
      pb.ell([0, 0.92, 0.3], [0.1, 0.06, 0.15], mix(P.belly, WHITE, 0.2));
      pb.ell([0, 0.99, 0.445], [0.04, 0.03, 0.025], hex('#3a1f1f'), { sub: 1, gloss: 1 });
      [-1, 1].forEach((s) => pb.cone([s * 0.13, 1.18, 0.02], [0.035, 0.11, 0.035], shade(P.c, -35), { rot: [0, -0.6, -s * 0.35], seg: 6 }));
      blush(pb, P, head, { x: 0.18, y: -0.05 });
    });
    eyes(R, 'head', P, head, { r: 0.075, x: 0.11, y: 0.05, brow: 'soft' });
    mouth(R, 'head', P, { c: [0, 0.92, 0.3], r: [0.1, 0.06, 0.15] }, { y: -0.03, w: 0.06, fang: true });
    R.part('mane', 'head', [0, 1.14, -0.02], 'flame', { ph: 1 }, (pb) => {
      for (let i = 0; i < 7; i++) { const u = i / 6, z = 0.14 - u * 0.36, y = 1.16 + Math.sin(u * Math.PI) * 0.06 - u * 0.1; flame(pb, [0, y, z], 0.36 - Math.abs(u - 0.35) * 0.25, 0.1, P, { rot: [0, -0.35 - u * 0.9, 0] }); }
      [-1, 1].forEach((s) => flame(pb, [s * 0.17, 1.02, -0.08], 0.22, 0.08, P, { rot: [0, -0.8, -s * 0.9] }));
    });
    R.part('tail', 'body', [0, 0.42, -0.2], 'tail', {}, (pb) => {
      pb.ell([0, 0.36, -0.38], [0.08, 0.08, 0.22], P.c, { rot: [0, 0.35, 0] });
      pb.ell([0, 0.44, -0.6], [0.06, 0.06, 0.13], P.c, { rot: [0, -0.4, 0] });
      flame(pb, [0, 0.52, -0.7], 0.3, 0.11, P, { rot: [0, -0.7, 0] });
    });
    [-1, 1].forEach((s) => {
      R.part(s < 0 ? 'armL' : 'armR', 'body', [s * 0.25, 0.78, 0.02], 'arm', { side: s }, (pb) => {
        pb.ell([s * 0.29, 0.64, 0.04], [0.07, 0.15, 0.07], P.c);
        pb.ell([s * 0.3, 0.48, 0.07], [0.065, 0.06, 0.065], shade(P.c, -12));
        [-1, 0, 1].forEach((k) => pb.cone([s * 0.3 + k * 0.03, 0.44, 0.12], [0.014, 0.04, 0.014], WHITE, { rot: [0, 1.4, 0], seg: 4 }));
      });
      R.part(s < 0 ? 'legL' : 'legR', null, [s * 0.14, 0.36, 0], 'leg', { side: s }, (pb) => {
        pb.ell([s * 0.15, 0.24, 0], [0.09, 0.15, 0.1], P.c);
        paw(pb, [s * 0.15, 0.06, 0.07], 0.1, shade(P.c, -18), true);
      });
    });
  };
  // Vulkarn: colosso vulcanico con placche di roccia, crepe di lava, corna di fuoco.
  SPECIES.vulkarn = (R, P) => {
    R.kind = 'biped';
    const rock = mix(P.dk, hex('#2a2320'), 0.55), lava = hex(P.acc.flame2);
    const head = { c: [0, 1.12, 0.12], r: [0.24, 0.21, 0.23] };
    R.part('body', null, [0, 0.42, 0], 'body', {}, (pb) => {
      pb.ell([0, 0.68, 0], [0.4, 0.4, 0.33], P.c, { gloss: 0.2 });
      pb.ell([0, 0.62, 0.18], [0.25, 0.28, 0.17], P.belly, { sub: 1 });
      [-1, 1].forEach((s) => {
        pb.ell([s * 0.33, 0.92, -0.02], [0.2, 0.15, 0.2], rock, { smooth: false, sub: 1, noise: 0.18 });
        pb.box([s * 0.33, 0.95, 0.16], [0.18, 0.02, 0.02], lava, { emis: 1, rot: [0, 0, s * 0.3] });
      });
      pb.ell([0, 0.86, -0.25], [0.3, 0.24, 0.12], rock, { smooth: false, sub: 1, noise: 0.15 });
      for (let i = 0; i < 3; i++) pb.cone([(i - 1) * 0.14, 0.98 - Math.abs(i - 1) * 0.06, -0.3], [0.07, 0.22, 0.07], rock, { rot: [0, -0.9, (i - 1) * 0.3], seg: 5, smooth: false });
    });
    R.part('head', 'body', [0, 1.0, 0.06], 'head', {}, (pb) => {
      pb.ell(head.c, head.r, P.c, { gloss: 0.2 });
      pb.ell([0, 1.06, 0.31], [0.16, 0.1, 0.11], mix(P.belly, WHITE, 0.1));
      pb.ell([0, 1.02, 0.29], [0.15, 0.06, 0.1], shade(P.c, -25));
      [-1, 1].forEach((s) => pb.cone([s * 0.17, 1.24, 0.04], [0.065, 0.24, 0.065], rock, { rot: [0, -0.5, -s * 0.55], seg: 6, smooth: false }));
    });
    eyes(R, 'head', P, head, { r: 0.065, x: 0.11, y: 0.06, brow: 'fierce', browCol: '#1b1210' });
    mouth(R, 'head', P, { c: [0, 1.04, 0.31], r: [0.16, 0.08, 0.11] }, { y: -0.03, w: 0.08, fang: true, col: '#2a0a06' });
    R.part('crest', 'head', [0, 1.3, 0.0], 'flame', { ph: 2 }, (pb) => {
      flame(pb, [0, 1.26, 0.02], 0.5, 0.17, P, { rot: [0, -0.35, 0] });
      flame(pb, [0.12, 1.24, -0.04], 0.34, 0.11, P, { rot: [0, -0.4, -0.45] });
      flame(pb, [-0.12, 1.24, -0.04], 0.34, 0.11, P, { rot: [0, -0.4, 0.45] });
    });
    R.part('tail', 'body', [0, 0.5, -0.26], 'tail', {}, (pb) => {
      pb.ell([0, 0.42, -0.5], [0.13, 0.12, 0.3], P.c, { rot: [0, 0.3, 0], sub: 1 });
      pb.ell([0, 0.46, -0.82], [0.09, 0.09, 0.17], rock, { smooth: false, sub: 1 });
      flame(pb, [0, 0.54, -0.95], 0.42, 0.15, P, { rot: [0, -0.8, 0] });
    });
    [-1, 1].forEach((s) => {
      R.part(s < 0 ? 'armL' : 'armR', 'body', [s * 0.38, 0.86, 0.02], 'arm', { side: s }, (pb) => {
        pb.ell([s * 0.45, 0.68, 0.05], [0.12, 0.21, 0.12], P.c);
        pb.ell([s * 0.48, 0.45, 0.1], [0.12, 0.1, 0.12], rock, { smooth: false, sub: 1, noise: 0.1 });
        [-1, 0, 1].forEach((k) => pb.cone([s * 0.48 + k * 0.05, 0.4, 0.2], [0.02, 0.07, 0.02], hex('#f5efe0'), { rot: [0, 1.4, 0], seg: 4 }));
      });
      R.part(s < 0 ? 'legL' : 'legR', null, [s * 0.2, 0.42, 0], 'leg', { side: s }, (pb) => {
        pb.ell([s * 0.21, 0.28, 0], [0.14, 0.18, 0.15], P.c);
        paw(pb, [s * 0.21, 0.07, 0.08], 0.14, rock, true);
      });
    });
  };

  // ---------- ACQUA ----------
  // Goccino: goccia viva con punta in testa, pinnette laterali e codina a ventaglio.
  SPECIES.goccino = (R, P) => {
    R.kind = 'blob';
    const head = { c: [0, 0.46, 0.02], r: [0.42, 0.42, 0.39] };
    R.part('body', null, [0, 0.1, 0], 'body', {}, (pb) => {
      pb.ell(head.c, head.r, P.c, { gloss: 0.75 });
      pb.cone([0, 0.74, -0.03], [0.24, 0.36, 0.22], P.c, { rot: [0, -0.18, 0], seg: 12, gloss: 0.75 });
      pb.ell([0, 0.3, 0.2], [0.27, 0.22, 0.21], P.belly, { gloss: 0.5 });
      blush(pb, P, head, { x: 0.26, y: -0.07 });
      for (let i = 0; i < 3; i++) pb.ell([0.18 - i * 0.04, 0.72 - i * 0.12, 0.25], [0.035, 0.035, 0.02], mix(P.c, WHITE, 0.8), { sub: 1, emis: 0.3 });
    });
    eyes(R, 'body', P, head, { r: 0.1, x: 0.15, y: 0.06 });
    mouth(R, 'body', P, head, { y: -0.1, w: 0.075 });
    R.part('crest', 'body', [0, 0.95, -0.06], 'sway', { axis: 2, amp: 0.12, freq: 2.1 }, (pb) => pb.cone([0, 0.92, -0.08], [0.03, 0.22, 0.16], hex(P.acc.fin || '#bfe9ff'), { rot: [0, -0.45, 0], seg: 4, gloss: 0.9 }));
    R.part('tail', 'body', [0, 0.25, -0.33], 'tail', {}, (pb) => {
      pb.ell([0, 0.27, -0.44], [0.05, 0.06, 0.12], P.c, { gloss: 0.7 });
      [-1, 1].forEach((s) => pb.ell([s * 0.1, 0.32, -0.56], [0.12, 0.03, 0.1], hex(P.acc.fin || '#bfe9ff'), { rot: [s * 0.4, 0, s * 0.3], gloss: 0.9 }));
    });
    [-1, 1].forEach((s) => {
      R.part(s < 0 ? 'armL' : 'armR', 'body', [s * 0.38, 0.38, 0.05], 'arm', { side: s, flipper: true }, (pb) => pb.ell([s * 0.47, 0.3, 0.07], [0.15, 0.04, 0.09], shade(P.c, 12), { rot: [0, 0, s * 0.55], gloss: 0.8 }));
      R.part(s < 0 ? 'legL' : 'legR', null, [s * 0.17, 0.12, 0.05], 'leg', { side: s }, (pb) => pb.ell([s * 0.18, 0.05, 0.13], [0.11, 0.05, 0.14], shade(P.c, -15), { gloss: 0.6 }));
    });
  };
  // Ondaro: lontra-foca slanciata a quattro pinne, orecchie-pinna e coda a timone.
  SPECIES.ondaro = (R, P) => {
    R.kind = 'quad';
    const head = { c: [0, 0.74, 0.42], r: [0.2, 0.19, 0.2] };
    R.part('body', null, [0, 0.3, 0], 'body', {}, (pb) => {
      pb.ell([0, 0.48, 0.02], [0.27, 0.26, 0.46], P.c, { gloss: 0.8 });
      pb.ell([0, 0.38, 0.12], [0.2, 0.17, 0.36], P.belly, { gloss: 0.5 });
      pb.cone([0, 0.68, -0.08], [0.03, 0.2, 0.2], hex(P.acc.fin || '#bfe9ff'), { rot: [0, -0.5, 0], seg: 4, gloss: 0.9 });
      pb.ell([0, 0.62, 0.3], [0.15, 0.16, 0.16], P.c, { gloss: 0.8 });
    });
    R.part('head', 'body', [0, 0.68, 0.32], 'head', {}, (pb) => {
      pb.ell(head.c, head.r, P.c, { gloss: 0.8 });
      pb.ell([0, 0.7, 0.58], [0.12, 0.08, 0.09], mix(P.belly, WHITE, 0.3), { gloss: 0.5 });
      pb.ell([0, 0.74, 0.665], [0.035, 0.025, 0.02], hex('#132235'), { sub: 1, gloss: 1 });
      [-1, 1].forEach((s) => pb.ell([s * 0.06, 0.69, 0.66], [0.04, 0.004, 0.004], hex('#e8f4ff'), { rot: [s * 0.3, 0, 0], sub: 0 }));
    });
    [-1, 1].forEach((s) => R.part(s < 0 ? 'earL' : 'earR', 'head', [s * 0.16, 0.8, 0.36], 'sway', { axis: 0, amp: 0.16, freq: 2.3, ph: s }, (pb) => {
      pb.cone([s * 0.17, 0.8, 0.36], [0.022, 0.2, 0.09], mix(P.c, hex(P.acc.fin || '#bfe9ff'), 0.6), { rot: [s * 0.5, -2.2, -s * 0.5], seg: 6, gloss: 0.9 });
    }));
    eyes(R, 'head', P, head, { r: 0.065, x: 0.09, y: 0.05 });
    mouth(R, 'head', P, { c: [0, 0.7, 0.58], r: [0.12, 0.08, 0.09] }, { y: -0.035, w: 0.05 });
    R.part('tail', 'body', [0, 0.45, -0.42], 'tail', {}, (pb) => {
      pb.ell([0, 0.42, -0.6], [0.1, 0.08, 0.2], P.c, { gloss: 0.8 });
      [-1, 1].forEach((s) => pb.ell([s * 0.12, 0.42, -0.8], [0.15, 0.025, 0.1], hex(P.acc.fin || '#bfe9ff'), { rot: [s * 0.5, 0, 0], gloss: 0.9 }));
    });
    const flip = mix(P.c, hex(P.acc.fin || '#bfe9ff'), 0.45);
    [[-1, 0.26], [1, 0.26], [-1, -0.26], [1, -0.26]].forEach(([s, z], i) => R.part('leg' + i, null, [s * 0.18, 0.32, z], 'leg', { side: s, back: z < 0 }, (pb) => {
      pb.ell([s * 0.2, 0.2, z], [0.085, 0.13, 0.09], P.c, { gloss: 0.6 });
      pb.ell([s * 0.23, 0.045, z + 0.06], [0.11, 0.04, 0.15], flip, { gloss: 0.8, rot: [s * 0.25, 0, s * 0.15] });
    }));
  };
  // Abissaro: titano degli abissi, mezzo balena e mezzo drago marino, con macchie luminose.
  SPECIES.abissaro = (R, P) => {
    R.kind = 'quad';
    const fin = hex(P.acc.fin || '#bfe9ff'), glow = hex(P.acc.orb || '#eaffff');
    const head = { c: [0, 0.86, 0.5], r: [0.27, 0.24, 0.27] };
    R.part('body', null, [0, 0.36, 0], 'body', {}, (pb) => {
      pb.ell([0, 0.58, 0], [0.4, 0.36, 0.6], P.c, { gloss: 0.85 });
      pb.ell([0, 0.45, 0.12], [0.31, 0.24, 0.48], P.belly, { gloss: 0.5, sub: 1 });
      pb.cone([0, 0.86, -0.06], [0.04, 0.36, 0.34], fin, { rot: [0, -0.55, 0], seg: 4, gloss: 0.9 });
      for (let i = 0; i < 5; i++) [-1, 1].forEach((s) => pb.ell([s * 0.37, 0.62 - (i % 2) * 0.05, 0.34 - i * 0.16], [0.03, 0.03, 0.03], glow, { sub: 1, emis: 1 }));
      pb.ell([0, 0.76, 0.36], [0.22, 0.2, 0.2], P.c, { gloss: 0.85 });
    });
    R.part('head', 'body', [0, 0.82, 0.38], 'head', {}, (pb) => {
      pb.ell(head.c, head.r, P.c, { gloss: 0.85 });
      pb.ell([0, 0.78, 0.72], [0.18, 0.1, 0.12], mix(P.belly, WHITE, 0.15), { gloss: 0.5 });
      [-1, 1].forEach((s) => pb.cone([s * 0.14, 1.04, 0.42], [0.05, 0.28, 0.05], fin, { rot: [0, -0.7, -s * 0.35], seg: 6, gloss: 0.9 }));
      pb.cone([0, 1.08, 0.48], [0.04, 0.22, 0.04], glow, { rot: [0, -0.3, 0], seg: 6, emis: 0.7 });
      pb.ell([0, 1.27, 0.55], [0.045, 0.045, 0.045], glow, { emis: 1, sub: 1 });
    });
    eyes(R, 'head', P, head, { r: 0.07, x: 0.13, y: 0.06, brow: 'fierce', browCol: '#0b1e3a' });
    mouth(R, 'head', P, { c: [0, 0.78, 0.72], r: [0.18, 0.1, 0.12] }, { y: -0.04, w: 0.09, fang: true, col: '#0b1730' });
    R.part('tail', 'body', [0, 0.55, -0.55], 'tail', {}, (pb) => {
      pb.ell([0, 0.55, -0.8], [0.15, 0.13, 0.3], P.c, { gloss: 0.85, sub: 1 });
      [-1, 1].forEach((s) => pb.ell([s * 0.2, 0.6, -1.08], [0.24, 0.035, 0.13], fin, { rot: [s * 0.45, 0.1, 0], gloss: 0.9 }));
    });
    [[-1, 0.32], [1, 0.32], [-1, -0.3], [1, -0.3]].forEach(([s, z], i) => R.part('leg' + i, null, [s * 0.28, 0.38, z], 'leg', { side: s, back: z < 0 }, (pb) => {
      pb.ell([s * 0.31, 0.24, z], [0.13, 0.17, 0.14], P.c, { gloss: 0.7 });
      pb.ell([s * 0.36, 0.06, z + 0.08], [0.16, 0.05, 0.19], mix(P.c, fin, 0.45), { rot: [s * 0.3, 0, s * 0.2], gloss: 0.85 });
    }));
  };

  // ---------- ERBA ----------
  // Semino: seme-ghianda con cappuccio, germoglio a due foglie e radichette per piedi.
  SPECIES.semino = (R, P) => {
    R.kind = 'blob';
    const cap = mix(P.dk, hex('#6b4a2a'), 0.55);
    const head = { c: [0, 0.48, 0.01], r: [0.4, 0.42, 0.38] };
    R.part('body', null, [0, 0.1, 0], 'body', {}, (pb) => {
      pb.ell(head.c, head.r, P.c, { gloss: 0.3 });
      pb.ell([0, 0.33, 0.18], [0.25, 0.23, 0.2], P.belly);
      pb.ell([0, 0.78, -0.01], [0.38, 0.17, 0.36], cap, { gloss: 0.15 });
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; pb.ell([Math.cos(a) * 0.33, 0.73, Math.sin(a) * 0.31], [0.05, 0.03, 0.05], shade(cap, -20), { sub: 1 }); }
      pb.cyl([0, 0.88, -0.01], [0.03, 0.12, 0.03], shade(cap, -25), { seg: 6 });
      blush(pb, P, head, { x: 0.25, y: -0.07 });
    });
    eyes(R, 'body', P, head, { r: 0.095, x: 0.15, y: 0.04 });
    mouth(R, 'body', P, head, { y: -0.12, w: 0.06 });
    R.part('sprout', 'body', [0, 0.98, -0.01], 'sway', { axis: 2, amp: 0.18, freq: 1.6 }, (pb) => {
      pb.cyl([0, 0.97, -0.01], [0.018, 0.12, 0.018], hex(P.acc.leaf2), { seg: 6 });
      leaf(pb, [0.12, 1.12, 0], 0.13, 0.08, hex(P.acc.leaf), [0, 0.15, -1.0], P);
      leaf(pb, [-0.1, 1.1, 0], 0.11, 0.07, hex(P.acc.leaf2), [0, -0.1, 1.05], P);
    });
    [-1, 1].forEach((s) => {
      R.part(s < 0 ? 'armL' : 'armR', 'body', [s * 0.36, 0.42, 0.06], 'arm', { side: s }, (pb) => leaf(pb, [s * 0.45, 0.36, 0.08], 0.11, 0.06, hex(P.acc.leaf2), [0, 0, s * 1.0], P));
      R.part(s < 0 ? 'legL' : 'legR', null, [s * 0.16, 0.12, 0.05], 'leg', { side: s }, (pb) => {
        pb.ell([s * 0.16, 0.06, 0.08], [0.1, 0.07, 0.12], shade(cap, 10));
        [-1, 1].forEach((k) => pb.cone([s * 0.16 + k * 0.05, 0.02, 0.17], [0.025, 0.08, 0.025], shade(cap, -10), { rot: [0, 1.3, k * 0.4], seg: 4 }));
      });
    });
  };
  // Fogliardo: cerbiatto del sottobosco con orecchie-foglia, palchi di rametti e coda a ciuffo.
  SPECIES.fogliardo = (R, P) => {
    R.kind = 'quad';
    const bark = mix(P.dk, hex('#5a3d22'), 0.6), head = { c: [0, 0.92, 0.34], r: [0.16, 0.16, 0.18] };
    R.part('body', null, [0, 0.46, 0], 'body', {}, (pb) => {
      pb.ell([0, 0.58, -0.02], [0.24, 0.23, 0.38], P.c, { gloss: 0.3 });
      pb.ell([0, 0.5, 0.06], [0.17, 0.15, 0.3], P.belly, { sub: 1 });
      pb.ell([0, 0.75, 0.22], [0.1, 0.17, 0.1], P.c, { rot: [0, 0.5, 0] });     // collo
      for (let i = 0; i < 4; i++) pb.ell([(i % 2 ? 1 : -1) * 0.09, 0.78, -0.1 - i * 0.07], [0.03, 0.03, 0.03], mix(P.c, WHITE, 0.7), { sub: 1 });
    });
    R.part('head', 'body', [0, 0.86, 0.26], 'head', {}, (pb) => {
      pb.ell(head.c, head.r, P.c, { gloss: 0.3 });
      pb.ell([0, 0.87, 0.49], [0.08, 0.07, 0.09], P.belly);
      pb.ell([0, 0.9, 0.575], [0.03, 0.022, 0.018], hex('#2a1a14'), { sub: 1, gloss: 1 });
      [-1, 1].forEach((s) => {
        pb.cyl([s * 0.07, 1.04, 0.3], [0.016, 0.16, 0.016], bark, { rot: [0, -0.2, -s * 0.35], seg: 5 });
        pb.cyl([s * 0.12, 1.15, 0.28], [0.012, 0.1, 0.012], bark, { rot: [0, -0.5, s * 0.5], seg: 5 });
        leaf(pb, [s * 0.15, 1.24, 0.27], 0.07, 0.045, hex(P.acc.leaf), [0, 0, -s * 0.3], P);
        leaf(pb, [s * 0.04, 1.26, 0.25], 0.06, 0.04, hex(P.acc.leaf2), [0, 0, s * 0.4], P);
      });
    });
    [-1, 1].forEach((s) => R.part(s < 0 ? 'earL' : 'earR', 'head', [s * 0.13, 0.98, 0.3], 'sway', { axis: 2, amp: 0.2, freq: 1.9, ph: s * 2 }, (pb) => leaf(pb, [s * 0.24, 1.0, 0.29], 0.1, 0.06, hex(P.acc.leaf2), [0, 0, -s * 1.25], P)));
    eyes(R, 'head', P, head, { r: 0.058, x: 0.085, y: 0.03 });
    mouth(R, 'head', P, { c: [0, 0.87, 0.49], r: [0.08, 0.07, 0.09] }, { y: -0.035, w: 0.035 });
    R.part('tail', 'body', [0, 0.62, -0.38], 'tail', {}, (pb) => {
      leaf(pb, [0, 0.72, -0.46], 0.1, 0.06, hex(P.acc.leaf), [0, -0.7, 0], P);
      leaf(pb, [0.05, 0.68, -0.48], 0.08, 0.05, hex(P.acc.leaf2), [0.5, -0.9, -0.4], P);
    });
    [[-1, 0.22], [1, 0.22], [-1, -0.24], [1, -0.24]].forEach(([s, z], i) => R.part('leg' + i, null, [s * 0.13, 0.48, z], 'leg', { side: s, back: z < 0 }, (pb) => {
      pb.ell([s * 0.14, 0.34, z], [0.06, 0.14, 0.07], P.c);
      pb.ell([s * 0.14, 0.14, z], [0.035, 0.12, 0.035], shade(P.c, -12));
      pb.ell([s * 0.14, 0.03, z + 0.01], [0.04, 0.035, 0.05], bark, { sub: 1 });
    }));
  };
  // Silvatron: grande cervo-foresta, schiena di muschio fiorito e palchi a chioma.
  SPECIES.silvatron = (R, P) => {
    R.kind = 'quad';
    const bark = mix(mix(P.dk, hex('#8a6440'), 0.7), P.c, 0.12), moss = mix(P.c, WHITE, 0.08), petal = hex(P.acc.petal), core = hex(P.acc.core);
    const head = { c: [0, 1.08, 0.48], r: [0.2, 0.19, 0.22] };
    R.part('body', null, [0, 0.58, 0], 'body', {}, (pb) => {
      pb.ell([0, 0.72, -0.02], [0.36, 0.32, 0.55], bark, { gloss: 0.15 });
      pb.ell([0, 0.86, -0.05], [0.35, 0.22, 0.53], moss, { gloss: 0.25, sub: 1 });
      [-1, 1].forEach((k) => pb.ell([k * 0.3, 0.78, 0.05], [0.08, 0.12, 0.3], moss, { sub: 1 }));
      pb.ell([0, 0.62, 0.08], [0.25, 0.2, 0.42], mix(bark, WHITE, 0.25), { sub: 1 });
      pb.ell([0, 0.95, 0.32], [0.14, 0.22, 0.14], bark, { rot: [0, 0.5, 0] });
      for (let i = 0; i < 4; i++) {
        const x = (i % 2 ? 1 : -1) * 0.14, z = 0.22 - Math.floor(i / 2) * 0.36;
        for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; pb.ell([x + Math.cos(a) * 0.045, 1.04, z + Math.sin(a) * 0.045], [0.035, 0.015, 0.035], petal, { sub: 1 }); }
        pb.ell([x, 1.05, z], [0.025, 0.02, 0.025], core, { sub: 1, emis: 0.4 });
      }
    });
    R.part('head', 'body', [0, 1.02, 0.38], 'head', {}, (pb) => {
      pb.ell(head.c, head.r, bark, { gloss: 0.15 });
      pb.ell([0, 1.04, 0.72], [0.1, 0.08, 0.1], mix(bark, WHITE, 0.3));
      pb.ell([0, 1.07, 0.815], [0.035, 0.025, 0.02], hex('#1a120c'), { sub: 1, gloss: 1 });
      pb.ell([0, 1.22, 0.46], [0.16, 0.06, 0.16], moss);
    });
    [-1, 1].forEach((s) => R.part(s < 0 ? 'antL' : 'antR', 'head', [s * 0.1, 1.22, 0.42], 'sway', { axis: 2, amp: 0.05, freq: 1.1, ph: s }, (pb) => {
      pb.cyl([s * 0.1, 1.22, 0.42], [0.025, 0.3, 0.025], bark, { rot: [0, -0.15, -s * 0.45], seg: 6 });
      pb.cyl([s * 0.2, 1.42, 0.4], [0.018, 0.2, 0.018], bark, { rot: [0, -0.6, s * 0.4], seg: 5 });
      pb.cyl([s * 0.24, 1.46, 0.4], [0.018, 0.22, 0.018], bark, { rot: [0, 0.3, -s * 0.7], seg: 5 });
      [[0.26, 1.62, 0.32], [0.42, 1.6, 0.42], [0.2, 1.56, 0.54]].forEach(([x, y, z], k) => {
        for (let j = 0; j < 3; j++) { const a = j * 2.1 + k; leaf(pb, [s * x + Math.cos(a) * 0.05, y + Math.sin(a) * 0.03, z + Math.sin(a) * 0.05], 0.08, 0.05, j % 2 ? hex(P.acc.leaf) : hex(P.acc.leaf2), [a, 0.6, Math.cos(a) * 0.8], P); }
        pb.ell([s * x + 0.02, y + 0.05, z + 0.03], [0.028, 0.014, 0.028], petal, { sub: 0 });
      });
    }));
    eyes(R, 'head', P, head, { r: 0.06, x: 0.11, y: 0.04, brow: 'soft', browCol: '#1a120c' });
    mouth(R, 'head', P, { c: [0, 1.04, 0.72], r: [0.1, 0.08, 0.1] }, { y: -0.035, w: 0.045 });
    R.part('tail', 'body', [0, 0.82, -0.55], 'tail', {}, (pb) => {
      pb.ell([0, 0.86, -0.64], [0.12, 0.1, 0.1], hex(P.acc.leaf), { sub: 1, gloss: 0.3 });
      pb.ell([0.06, 0.9, -0.7], [0.08, 0.07, 0.07], hex(P.acc.leaf2), { sub: 1 });
    });
    [[-1, 0.34], [1, 0.34], [-1, -0.34], [1, -0.34]].forEach(([s, z], i) => R.part('leg' + i, null, [s * 0.22, 0.6, z], 'leg', { side: s, back: z < 0 }, (pb) => {
      pb.ell([s * 0.24, 0.44, z], [0.12, 0.2, 0.13], bark);
      pb.ell([s * 0.25, 0.17, z], [0.085, 0.15, 0.09], shade(bark, -10));
      pb.ell([s * 0.25, 0.03, z + 0.02], [0.08, 0.04, 0.09], shade(bark, -30), { smooth: false, sub: 0 });
    }));
  };

  // ---------- ELETTRO ----------
  // Voltino: palla a molla con antenne-sfera, ciuffo a saetta e coda a spirale.
  SPECIES.voltino = (R, P) => {
    R.kind = 'blob';
    const orb = hex(P.acc.orb), head = { c: [0, 0.48, 0.02], r: [0.39, 0.4, 0.37] };
    R.part('body', null, [0, 0.1, 0], 'body', {}, (pb) => {
      pb.ell(head.c, head.r, P.c, { gloss: 0.45 });
      pb.ell([0, 0.32, 0.19], [0.24, 0.21, 0.19], P.belly);
      [[0.02, 0.86, 0.12, 0.5], [-0.03, 0.96, 0.1, -0.6], [0.03, 1.05, 0.08, 0.5]].forEach(([x, y, z, r]) => pb.box([x, y, z], [0.05, 0.13, 0.05], orb, { rot: [0, 0, r], emis: 0.9 }));
      [-1, 1].forEach((s) => pb.ell([s * 0.33, 0.5, 0.22], [0.04, 0.09, 0.02], shade(P.c, -35), { rot: faceTo([s * 0.7, 0, 0.7]), sub: 1 }));
    });
    eyes(R, 'body', P, head, { r: 0.1, x: 0.15, y: 0.07 });
    mouth(R, 'body', P, head, { y: -0.08, w: 0.07 });
    [-1, 1].forEach((s) => {
      R.part(s < 0 ? 'antL' : 'antR', 'body', [s * 0.14, 0.82, 0], 'sway', { axis: 2, amp: 0.16, freq: 3.2, ph: s * 1.5 }, (pb) => {
        pb.cyl([s * 0.14, 0.82, 0], [0.022, 0.32, 0.022], shade(P.dk, 0), { rot: [0, 0, -s * 0.42], seg: 6 });
        const tip = [s * (0.14 + Math.sin(0.42) * 0.32), 0.82 + Math.cos(0.42) * 0.32, 0];
        pb.ell(tip, [0.075, 0.075, 0.075], orb, { emis: 0.95, gloss: 1 });
        pb.ell(tip, [0.04, 0.04, 0.04], P.c, { emis: 1, sub: 1 });
      });
      R.part(s < 0 ? 'armL' : 'armR', 'body', [s * 0.35, 0.42, 0.08], 'arm', { side: s }, (pb) => pb.ell([s * 0.4, 0.35, 0.12], [0.075, 0.1, 0.075], P.c));
      R.part(s < 0 ? 'legL' : 'legR', null, [s * 0.17, 0.12, 0.05], 'leg', { side: s }, (pb) => paw(pb, [s * 0.17, 0.06, 0.1], 0.1, shade(P.c, -18), false));
    });
    R.part('tail', 'body', [0, 0.3, -0.34], 'tail', { spring: true }, (pb) => {
      for (let i = 0; i < 16; i++) {
        const u = i / 15, a = u * Math.PI * 5;
        pb.ell([0.08 * Math.sin(a), 0.28 + u * 0.55, -0.4 - u * 0.12 + 0.08 * Math.cos(a)], [0.05 - u * 0.012, 0.05 - u * 0.012, 0.05 - u * 0.012], mix(P.c, orb, 0.35), { sub: 1, emis: 0.35 });
      }
      pb.ell([0, 0.88, -0.52], [0.06, 0.06, 0.06], orb, { emis: 1, sub: 1 });
    });
  };
  // Fulmix: furetto-lampo lungo e scattante, coda a zig-zag luminosa e antenne a frusta.
  SPECIES.fulmix = (R, P) => {
    R.kind = 'quad';
    const orb = hex(P.acc.orb), head = { c: [0, 0.66, 0.5], r: [0.18, 0.16, 0.2] };
    R.part('body', null, [0, 0.3, 0], 'body', {}, (pb) => {
      pb.ell([0, 0.44, 0], [0.2, 0.19, 0.46], P.c, { gloss: 0.45 });
      pb.ell([0, 0.36, 0.08], [0.14, 0.12, 0.36], P.belly);
      for (let i = 0; i < 3; i++) pb.box([0, 0.62, 0.2 - i * 0.2], [0.03, 0.09, 0.06], orb, { emis: 0.9, rot: [0, 0, i % 2 ? 0.5 : -0.5] });
      pb.ell([0, 0.56, 0.36], [0.12, 0.13, 0.13], P.c, { gloss: 0.45 });
    });
    R.part('head', 'body', [0, 0.6, 0.4], 'head', {}, (pb) => {
      pb.ell(head.c, head.r, P.c, { gloss: 0.45 });
      pb.ell([0, 0.62, 0.68], [0.08, 0.06, 0.08], P.belly);
      pb.ell([0, 0.645, 0.755], [0.028, 0.02, 0.016], hex('#0b1a22'), { sub: 1, gloss: 1 });
      [-1, 1].forEach((s) => pb.ell([s * 0.15, 0.62, 0.55], [0.06, 0.03, 0.06], shade(P.c, -35), { rot: faceTo([s, 0, 0.6]), sub: 1 }));
    });
    [-1, 1].forEach((s) => R.part(s < 0 ? 'antL' : 'antR', 'head', [s * 0.07, 0.78, 0.46], 'sway', { axis: 1, amp: 0.2, freq: 3.6, ph: s }, (pb) => {
      pb.cyl([s * 0.07, 0.78, 0.46], [0.014, 0.3, 0.014], shade(P.dk, 0), { rot: [0, -0.55, -s * 0.35], seg: 5 });
      const tip = [s * (0.07 + Math.sin(0.35) * 0.27), 0.78 + 0.22, 0.46 - 0.16];
      pb.ell(tip, [0.055, 0.055, 0.055], orb, { emis: 0.95, gloss: 1 });
    }));
    eyes(R, 'head', P, head, { r: 0.06, x: 0.085, y: 0.04, brow: 'fierce', browCol: '#0a2530' });
    mouth(R, 'head', P, { c: [0, 0.62, 0.68], r: [0.08, 0.06, 0.08] }, { y: -0.03, w: 0.04, fang: true });
    R.part('tail', 'body', [0, 0.5, -0.42], 'tail', {}, (pb) => {
      const pts = [[0, 0.5, -0.45], [0.08, 0.66, -0.58], [-0.06, 0.8, -0.66], [0.07, 0.95, -0.74], [-0.02, 1.08, -0.78]];
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
        const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(d[0], d[1], d[2]);
        pb.ell(m, [0.05 - i * 0.006, l * 0.58, 0.05 - i * 0.006], i % 2 ? orb : P.c, { rot: [Math.atan2(d[0], d[2]), Math.acos(d[1] / l), 0], emis: i % 2 ? 0.8 : 0.1, sub: 1 });
      }
      pb.ell(pts[4], [0.06, 0.06, 0.06], orb, { emis: 1, sub: 1 });
    });
    [[-1, 0.28], [1, 0.28], [-1, -0.28], [1, -0.28]].forEach(([s, z], i) => R.part('leg' + i, null, [s * 0.12, 0.32, z], 'leg', { side: s, back: z < 0 }, (pb) => {
      pb.ell([s * 0.13, 0.2, z], [0.055, 0.12, 0.06], P.c);
      paw(pb, [s * 0.13, 0.05, z + 0.03], 0.065, shade(P.c, -20), false);
    }));
  };

  // ---------- ROCCIA ----------
  // Sassetto: masso vivo sfaccettato con sopracciglia di pietra e un cristallo in testa.
  SPECIES.sassetto = (R, P) => {
    R.kind = 'blob';
    const spike = hex(P.acc.spike || '#c9f3ff'), head = { c: [0, 0.46, 0.04], r: [0.42, 0.4, 0.38] };
    R.part('body', null, [0, 0.1, 0], 'body', {}, (pb) => {
      pb.ell(head.c, head.r, P.c, { smooth: false, sub: 1, noise: 0.13, seed: 4, gloss: 0.1 });
      pb.ell([0, 0.3, 0.2], [0.26, 0.2, 0.2], mix(P.c, WHITE, 0.25), { smooth: false, sub: 1, noise: 0.1, seed: 9 });
      [[0.22, 0.62, -0.2], [-0.25, 0.55, -0.15], [0.05, 0.3, -0.32]].forEach(([x, y, z]) => pb.ell([x, y, z], [0.1, 0.08, 0.08], shade(P.c, -25), { smooth: false, sub: 0 }));
      crystal(pb, [0.06, 0.8, -0.02], 0.28, 0.08, spike, [0, -0.1, -0.2]);
      crystal(pb, [-0.08, 0.78, 0.02], 0.18, 0.06, spike, [0, 0.1, 0.4]);
    });
    eyes(R, 'body', P, head, { r: 0.085, x: 0.15, y: 0.06, brow: 'fierce', browCol: P.dkHex });
    mouth(R, 'body', P, head, { y: -0.1, w: 0.075, col: '#2a1a10' });
    [-1, 1].forEach((s) => {
      R.part(s < 0 ? 'armL' : 'armR', 'body', [s * 0.38, 0.45, 0.06], 'arm', { side: s }, (pb) => pb.ell([s * 0.46, 0.36, 0.1], [0.11, 0.1, 0.1], shade(P.c, -10), { smooth: false, sub: 1, noise: 0.12 }));
      R.part(s < 0 ? 'legL' : 'legR', null, [s * 0.18, 0.12, 0.05], 'leg', { side: s }, (pb) => pb.ell([s * 0.18, 0.06, 0.1], [0.12, 0.07, 0.13], shade(P.c, -20), { smooth: false, sub: 1, noise: 0.1 }));
    });
  };
  // Granitor: golem di granito a spalle enormi, braccia-macigno e una corona di cristalli.
  SPECIES.granitor = (R, P) => {
    R.kind = 'biped';
    const spike = hex(P.acc.spike || '#c9f3ff'), dark = shade(P.c, -30), head = { c: [0, 1.06, 0.16], r: [0.2, 0.17, 0.18] };
    R.part('body', null, [0, 0.4, 0], 'body', {}, (pb) => {
      pb.ell([0, 0.7, 0], [0.42, 0.38, 0.32], P.c, { smooth: false, sub: 1, noise: 0.12, seed: 2, gloss: 0.1 });
      pb.ell([0, 0.62, 0.2], [0.26, 0.24, 0.16], mix(P.c, WHITE, 0.2), { smooth: false, sub: 1, noise: 0.1 });
      [-1, 1].forEach((s) => {
        pb.ell([s * 0.4, 0.92, 0], [0.22, 0.17, 0.22], dark, { smooth: false, sub: 1, noise: 0.15, seed: 5 });
        crystal(pb, [s * 0.44, 1.02, -0.04], 0.32, 0.08, spike, [0, -0.2, -s * 0.45]);
        crystal(pb, [s * 0.32, 1.02, -0.12], 0.22, 0.06, spike, [0, -0.5, -s * 0.2]);
      });
      crystal(pb, [0, 0.92, -0.26], 0.3, 0.08, spike, [0, -0.8, 0]);
    });
    R.part('head', 'body', [0, 0.98, 0.12], 'head', {}, (pb) => {
      pb.ell(head.c, head.r, P.c, { smooth: false, sub: 1, noise: 0.1 });
      pb.box([0, 1.13, 0.3], [0.3, 0.05, 0.08], dark, { rot: [0, 0.2, 0] });
    });
    eyes(R, 'head', P, head, { r: 0.05, x: 0.08, y: 0.0, glow: P.shiny ? false : false });
    mouth(R, 'head', P, head, { y: -0.08, w: 0.06, col: '#1b120c' });
    [-1, 1].forEach((s) => {
      R.part(s < 0 ? 'armL' : 'armR', 'body', [s * 0.46, 0.9, 0.02], 'arm', { side: s }, (pb) => {
        pb.ell([s * 0.52, 0.66, 0.04], [0.13, 0.22, 0.13], P.c, { smooth: false, sub: 1, noise: 0.12 });
        pb.ell([s * 0.55, 0.38, 0.1], [0.17, 0.15, 0.17], dark, { smooth: false, sub: 1, noise: 0.15 });
      });
      R.part(s < 0 ? 'legL' : 'legR', null, [s * 0.2, 0.4, 0], 'leg', { side: s }, (pb) => {
        pb.ell([s * 0.21, 0.24, 0], [0.14, 0.18, 0.15], P.c, { smooth: false, sub: 1, noise: 0.12 });
        pb.ell([s * 0.22, 0.06, 0.06], [0.15, 0.07, 0.18], dark, { smooth: false, sub: 1, noise: 0.1 });
      });
    });
  };

  // ---------- OMBRA ----------
  // Ombrino: fiammella d'ombra con cornetti, occhi che brillano e coda di fumo a ricciolo.
  SPECIES.ombrino = (R, P) => {
    R.kind = 'ghost';
    const horn = hex(P.acc.horn || P.dkHex), head = { c: [0, 0.62, 0.02], r: [0.38, 0.36, 0.35] };
    R.part('body', null, [0, 0.4, 0], 'body', {}, (pb) => {
      pb.ell(head.c, head.r, P.c, { gloss: 0.4 });
      [-1, 1].forEach((s) => pb.cone([s * 0.15, 0.88, -0.02], [0.07, 0.2, 0.07], horn, { rot: [0, -0.15, -s * 0.4], seg: 6 }));
      pb.ell([0, 0.52, 0.2], [0.22, 0.16, 0.16], mix(P.c, hex('#000010'), 0.25));
    });
    eyes(R, 'body', P, head, { r: 0.1, x: 0.14, y: 0.06, glow: true });
    mouth(R, 'body', P, head, { y: -0.12, w: 0.08, fang: true, col: '#12051f' });
    R.part('wisp', 'body', [0, 0.36, -0.02], 'wisp', { alpha: 0.85 }, (pb) => {
      pb.cone([0, 0.38, -0.02], [0.3, 0.32, 0.28], shade(P.c, -12), { rot: [0, Math.PI, 0], seg: 10, anim: 0.04 });
      pb.ell([0.1, 0.1, -0.12], [0.08, 0.08, 0.08], shade(P.c, -20), { sub: 1 });
      pb.ell([0.17, 0.12, -0.2], [0.05, 0.05, 0.05], shade(P.c, -25), { sub: 1 });
    });
    [-1, 1].forEach((s) => R.part(s < 0 ? 'armL' : 'armR', 'body', [s * 0.33, 0.56, 0.06], 'arm', { side: s, float: true }, (pb) => pb.cone([s * 0.42, 0.5, 0.08], [0.07, 0.16, 0.07], shade(P.c, -10), { rot: [0, 0, s * 1.9], seg: 7 })));
  };
  // Spettrax: spettro incappucciato con artigli, corona di corna e mantello di nebbia.
  SPECIES.spettrax = (R, P) => {
    R.kind = 'ghost';
    const horn = hex(P.acc.horn || '#ffd23f'), dark = mix(P.c, hex('#05010f'), 0.45), head = { c: [0, 1.06, 0.06], r: [0.26, 0.25, 0.25] };
    R.part('body', null, [0, 0.6, 0], 'body', {}, (pb) => {
      pb.ell([0, 0.78, 0], [0.34, 0.36, 0.3], P.c, { gloss: 0.4 });
      pb.ell([0, 0.74, 0.16], [0.22, 0.25, 0.16], dark);
      pb.ell([0, 0.96, -0.02], [0.4, 0.14, 0.34], dark, { gloss: 0.3 });
    });
    R.part('head', 'body', [0, 0.98, 0.04], 'head', {}, (pb) => {
      pb.ell(head.c, head.r, P.c, { gloss: 0.4 });
      pb.ell([0, 1.12, -0.04], [0.3, 0.27, 0.27], dark, { gloss: 0.3 });           // cappuccio
      for (let i = 0; i < 5; i++) { const a = -0.9 + i * 0.45; pb.cone([Math.sin(a) * 0.2, 1.28 + Math.cos(a) * 0.05, -0.04], [0.045, 0.2 - Math.abs(a) * 0.05, 0.045], horn, { rot: [0, -0.2, -a * 0.8], seg: 6, gloss: 0.8 }); }
    });
    eyes(R, 'head', P, head, { r: 0.085, x: 0.11, y: 0.02, glow: true });
    mouth(R, 'head', P, head, { y: -0.12, w: 0.1, fang: true, col: '#0b0216' });
    R.part('wisp', 'body', [0, 0.52, 0], 'wisp', { alpha: 0.82 }, (pb) => {
      pb.cone([0, 0.56, 0], [0.34, 0.48, 0.3], shade(P.c, -15), { rot: [0, Math.PI, 0], seg: 12, anim: 0.05 });
      [-1, 1].forEach((s) => pb.cone([s * 0.22, 0.5, -0.05], [0.12, 0.36, 0.12], shade(P.c, -22), { rot: [0, Math.PI, s * 0.35], seg: 8, anim: 0.05 }));
    });
    R.part('cape', 'body', [0, 0.98, -0.18], 'sway', { axis: 1, amp: 0.08, freq: 1.4, alpha: 0.85 }, (pb) => pb.ell([0, 0.7, -0.3], [0.38, 0.38, 0.05], dark, { gloss: 0.2, anim: 0.03 }));
    [-1, 1].forEach((s) => R.part(s < 0 ? 'armL' : 'armR', 'body', [s * 0.33, 0.92, 0.04], 'arm', { side: s, float: true }, (pb) => {
      pb.ell([s * 0.42, 0.74, 0.08], [0.09, 0.2, 0.09], P.c);
      pb.ell([s * 0.45, 0.54, 0.12], [0.08, 0.07, 0.08], dark);
      [-1, 0, 1].forEach((k) => pb.cone([s * 0.45 + k * 0.035, 0.5, 0.17], [0.018, 0.11, 0.018], horn, { rot: [0, 1.6, k * 0.25], seg: 4 }));
    }));
  };

  // ---------- costruzione e cache ----------
  const RIGS = new Map();
  const TRI_BUDGET = { 1: 2300, 2: 2600, 3: 3000 };
  function rigFor(id, shiny) {
    const key = id + (shiny ? '*' : '');
    let r = RIGS.get(key);
    if (r) return r;
    if (!SPECIES[id]) return null;
    const P = colors(id, shiny), limit = TRI_BUDGET[P.stage] || 2500;
    for (DETAIL_BIAS = 0; DETAIL_BIAS <= 8; DETAIL_BIAS++) {
      r = new Rig(key);
      SPECIES[id](r, P);
      if (r.tris <= limit) break;
    }
    r.detailBias = Math.min(DETAIL_BIAS, 8);
    DETAIL_BIAS = 0;
    // altezza reale del modello (per chi la vuole sapere)
    let top = 0;
    r.parts.forEach((p) => { const d = p.builder.d; for (let i = 1; i < d.length; i += STRIDE) top = Math.max(top, d[i] + p.pivot[1]); });
    r.top = top;
    r.hash = E.hashString(key);
    RIGS.set(key, r);
    return r;
  }

  // ---------- pose ----------
  const I3 = [0, 0, 0], ONE = [1, 1, 1];
  function creatureState(rig, anim) {
    const A = anim.action || 'idle', t = anim.t || 0, ph = (anim.phase || 0) + (rig.hash % 100) * 0.07, since = anim.since || 0;
    const period = 3.4 + (rig.hash % 23) / 10, bt = (t + ph * 0.61) % period;
    let blink = bt < 0.15 ? Math.sin((Math.PI * bt) / 0.15) : 0;
    const sleep = A === 'sleep', faint = A === 'faint' ? clamp01(since / 0.7) : 0;
    if (sleep || A === 'faint') blink = 1;
    return {
      A, t, ph, blink, sleep, faint,
      br: Math.sin(t * (sleep ? 1.1 : 2.3) + ph),
      atk: A === 'attack' ? Math.sin(Math.PI * clamp01(since / 0.5)) : 0,
      wind: A === 'attack' ? Math.max(0, 1 - since / 0.12) : 0,
      hit: A === 'hit' ? Math.sin(Math.PI * clamp01(since / 0.55)) : 0,
      squint: A === 'hit' ? 1 - clamp01(since / 0.55) : 0,
      walk: A === 'walk', w: A === 'walk' ? t * 10 + ph : 0,
      lookY: Math.sin(t * 0.45 + ph) * 0.32 + Math.sin(t * 1.7 + ph * 2) * 0.05,
      lookP: Math.sin(t * 0.31 + ph * 1.3) * 0.12,
    };
  }
  function rootPose(rig, s) {
    const k = rig.kind;
    let ty = 0, sx = 1, sy = 1, pitch = 0, roll = 0;
    sy += s.br * (s.sleep ? 0.03 : 0.014); sx -= s.br * 0.007;
    if (s.walk) {
      if (k === 'blob') { ty = Math.abs(Math.sin(s.w)) * 0.08; sy += Math.cos(2 * s.w) * 0.05; sx -= Math.cos(2 * s.w) * 0.025; roll = Math.sin(s.w) * 0.06; }
      else if (k === 'ghost') { ty = Math.sin(s.w * 0.5) * 0.04; pitch = 0.08; }
      else { ty = Math.abs(Math.sin(s.w)) * 0.03; roll = Math.sin(s.w) * 0.03; }
    }
    if (k === 'ghost') { ty += Math.sin(s.t * 1.6 + s.ph) * 0.03; roll += Math.sin(s.t * 1.1 + s.ph) * 0.04; }
    pitch += s.atk * 0.3 - s.wind * 0.12 - s.hit * 0.28 + (s.sleep ? 0.08 : 0);
    if (s.faint) { roll += s.faint * (k === 'quad' ? 0.25 : 1.2) * (s.ph % 2 > 1 ? 1 : -1); sy *= 1 - s.faint * 0.22; pitch += s.faint * 0.25; }
    return { t: [0, ty, 0], r: [0, pitch, roll], s: [sx, sy, sx] };
  }
  function partPose(p, s, rig) {
    const sd = p.side || 1;
    switch (p.role) {
      case 'head': return { r: [s.lookY * 0.45, s.lookP * 0.6 + s.atk * 0.18 - s.hit * 0.25 + (s.sleep ? 0.32 : 0) + s.faint * 0.4, s.sleep ? 0.12 : 0] };
      case 'eye': {
        const closed = Math.max(s.blink, s.squint * 0.8);
        return { r: [s.lookY * 0.8, -s.lookP, 0], s: [1 + s.squint * 0.1, Math.max(0.09, 1 - 0.93 * closed), 1], closed: closed > 0.55 };
      }
      case 'mouth': { const o = Math.max(s.atk, s.hit * 0.85, s.sleep ? 0 : 0); return { s: [1 + o * 0.15, 0.32 + o * 0.95 + (s.sleep ? 0 : 0.03 * s.br), 1] }; }
      case 'arm': {
        if (p.float) return { r: [Math.sin(s.t * 1.8 + sd) * 0.12 - s.atk * 0.9, 0, sd * (Math.sin(s.t * 1.3 + sd) * 0.1 + s.hit * 0.5)] };
        if (p.flipper) return { r: [0, 0, sd * (Math.sin(s.t * 2 + sd) * 0.1 + (s.walk ? Math.sin(s.w * 2) * 0.35 : 0) - s.atk * 0.4 + s.hit * 0.4)] };
        let pitch = -s.atk * 1.15 + s.wind * 0.4, roll = sd * (0.06 + s.br * 0.03 + s.hit * 0.55);
        if (s.walk) pitch += Math.sin(s.w) * 0.6 * sd;
        if (rig.kind === 'blob' && s.walk) roll += sd * Math.abs(Math.sin(s.w)) * 0.35;
        if (s.faint) roll += sd * s.faint * 0.6;
        return { r: [0, pitch, roll] };
      }
      case 'leg': {
        if (!s.walk) return { r: [0, s.faint * -0.2, 0] };
        const off = rig.kind === 'quad' ? (p.back ? Math.PI : 0) : 0;
        const sw = Math.sin(s.w + off) * sd;
        return { r: [0, -sw * (rig.kind === 'blob' ? 0.3 : 0.55), 0], t: [0, Math.max(0, -Math.cos(s.w + off) * sd) * (rig.kind === 'blob' ? 0.02 : 0.04), 0] };
      }
      case 'tail': {
        const wag = Math.sin(s.t * (s.walk ? 6 : 2.4) + s.ph) * (s.walk ? 0.35 : 0.22);
        return { r: [wag, 0.06 * s.br - s.atk * 0.35 + s.hit * 0.3 + (p.spring ? Math.sin(s.t * 5) * 0.08 : 0), 0], s: p.spring ? [1, 1 + Math.sin(s.t * 5 + s.ph) * 0.06, 1] : ONE };
      }
      case 'sway': {
        const v = Math.sin(s.t * (p.freq || 2) + (p.ph || 0) + s.ph) * (p.amp || 0.1) * (s.walk ? 1.6 : 1) + s.hit * 0.2;
        const r = [0, 0, 0]; r[p.axis == null ? 2 : p.axis] = v; return { r };
      }
      case 'flame': {
        const f = Math.sin(s.t * 13 + (p.ph || 0)) * 0.12 + Math.sin(s.t * 21 + 1) * 0.06;
        return { r: [Math.sin(s.t * 6) * 0.08, s.walk ? -0.15 : 0, Math.sin(s.t * 4.3) * 0.07], s: [1 - f * 0.4, 1 + f + s.atk * 0.35 - (s.sleep ? 0.3 : 0) - s.faint * 0.6, 1 - f * 0.4] };
      }
      case 'wisp': return { r: [Math.sin(s.t * 1.3 + s.ph) * 0.15, Math.sin(s.t * 2.1) * 0.1 + (s.walk ? -0.25 : 0), Math.sin(s.t * 1.7) * 0.12] };
      default: return null;
    }
  }
  function compose(parentM, p, pose, parentPivot) {
    const t = pose && pose.t ? pose.t : I3;
    const pp = parentPivot || I3;
    return mmul(parentM, mat([p.pivot[0] - pp[0] + t[0], p.pivot[1] - pp[1] + t[1], p.pivot[2] - pp[2] + t[2]], pose && pose.r ? pose.r : null, pose && pose.s ? pose.s : null));
  }
  const CLOSED_TINT = [0.16, 0.12, 0.14];
  function drawRig(R, rig, model, drawOpts, s) {
    const rp = rootPose(rig, s);
    const rootM = mmul(model, mat(rp.t, rp.r, rp.s));
    const world = {};
    for (const p of rig.parts) {
      const parent = p.parent ? rig.by[p.parent] : null;
      const pm = parent ? world[parent.name] : rootM;
      const pose = partPose(p, s, rig);
      const M = compose(pm, p, pose, parent ? parent.pivot : null);
      world[p.name] = M;
      const o = Object.assign({}, drawOpts);
      if (p.alpha) { o.alpha = (o.alpha == null ? 1 : o.alpha) * p.alpha; o.blend = true; }
      if (pose && pose.closed) o.tint = CLOSED_TINT;
      R.draw(mesh(p.key, () => p.builder), M, o);
    }
  }

  // creatura in un pezzo (posa di riposo), per chi chiede il modello intero
  function bakedCreature(id, shiny) {
    const rig = rigFor(id, shiny);
    if (!rig) return null;
    const out = new Builder(rig.hash), world = {};
    for (const p of rig.parts) {
      const parent = p.parent ? rig.by[p.parent] : null;
      const M = compose(parent ? world[parent.name] : mat(), p, null, parent ? parent.pivot : null);
      world[p.name] = M;
      const start = out.d.length;
      out.addBuilder(p.builder, M);
      if (p.role !== 'leg' || true) smoothFromIfSmooth(out, start, p);
    }
    return out;
  }
  function smoothFromIfSmooth(b, start, p) { if (!/sassetto|granitor/.test(p.key)) smoothFrom(b, start); }

  // =====================================================================
  //                           PERSONAGGI
  // =====================================================================
  const HUMAN_EXTRA = {
    hero: { hair: '#4a2f1f', shoe: '#ef4444' },
    nonna: { hat: 'none', hair: '#d6d3d1', hairStyle: 'bun', shoe: '#6b4226', glasses: true, skirt: '#7c3aed' },
    pescatore: { hat: 'bucket', hair: '#3a2a20', beard: '#9ca3af', shoe: '#14532d', boots: true },
    bimba: { hair: '#7c3f1d', hairStyle: 'pigtails', shoe: '#facc15', skirt: '#f43f5e' },
    rivale: { shoe: '#111827' },
    prof: { hairStyle: 'side', shoe: '#3f3f46' },
    guardiano_prato: { hair: '#7c4a1e', shoe: '#5b3a1a' },
    guardiano_fiume: { hair: '#1e3a5f', shoe: '#0c4a6e', boots: true },
    guardiano_bosco: { hair: '#2a1f14', shoe: '#3f2d1c', boots: true },
    guardiano_grotta: { hair: '#2b2b2b', shoe: '#44403c', boots: true },
    campione: { hairStyle: 'long', shoe: '#1e1b4b', boots: true },
  };
  function lookOf(name) {
    const L = Object.assign({ shirt: '#1f2937', band: '#22c55e', cap: '#3b82f6', pants: '#334155', skin: '#ffd7b5', hair: '#3b2a20' }, K.LOOKS[name] || K.LOOKS.hero, HUMAN_EXTRA[name] || {});
    return L;
  }
  const HUMANS = new Map();
  function humanFor(name) {
    if (HUMANS.has(name)) return HUMANS.get(name);
    const L = lookOf(name), r = new Rig('umano:' + name);
    r.kind = 'human';
    const skin = hex(L.skin), shirt = hex(L.shirt), pants = hex(L.pants), hair = hex(L.hair || '#3b2a20'), band = hex(L.band), shoe = hex(L.shoe || '#2b2b2b');
    const capC = hex(L.cap || '#3b82f6'), hat = L.hat || 'cap', coat = L.coat ? hex(L.coat) : null;
    const sleeve = coat || shirt;
    // bacino e gambe
    r.part('hips', null, [0, 0.44, 0], 'hips', {}, (pb) => {
      pb.ell([0, 0.45, 0], [0.12, 0.075, 0.085], pants);
      if (L.skirt) pb.cone([0, 0.5, 0], [0.16, 0.2, 0.13], hex(L.skirt), { rot: [0, Math.PI, 0], seg: 12, anim: 0.01 });
    });
    [-1, 1].forEach((s) => {
      const th = r.part(s < 0 ? 'thighL' : 'thighR', 'hips', [s * 0.062, 0.42, 0], 'thigh', { side: s }, (pb) => pb.ell([s * 0.062, 0.31, 0], [0.054, 0.125, 0.06], pants, { sub: 1 }));
      r.part(s < 0 ? 'shinL' : 'shinR', th.name, [s * 0.062, 0.22, 0], 'shin', { side: s }, (pb) => {
        pb.ell([s * 0.062, 0.21, 0], [0.047, 0.035, 0.051], pants, { sub: 1 });
        pb.ell([s * 0.062, 0.13, 0], [0.045, 0.105, 0.05], L.boots ? shoe : pants, { sub: 1 });
        pb.ell([s * 0.062, 0.035, 0.03], [0.052, 0.038, 0.085], shoe, { sub: 1, gloss: 0.5 });
        pb.ell([s * 0.062, 0.012, 0.03], [0.054, 0.014, 0.088], hex('#f5f5f4'), { sub: 1 });
      });
    });
    // busto
    r.part('torso', 'hips', [0, 0.47, 0], 'torso', {}, (pb) => {
      pb.ell([0, 0.58, 0], [0.13, 0.14, 0.09], coat ? shirt : shirt, {});
      pb.cyl([0, 0.465, 0], [0.122, 0.035, 0.088], band, { seg: 12 });
      if (!coat) {
        pb.cyl([0, 0.66, 0], [0.07, 0.03, 0.055], shade(shirt, 25), { seg: 12 });              // colletto
        const Bd = onSurface([0, 0.58, 0], [0.13, 0.14, 0.09], -0.055, 0.035);
        pb.cyl(along(Bd.p, Bd.n, 0.001), [0.026, 0.006, 0.026], band, { rot: [faceTo(Bd.n)[0], faceTo(Bd.n)[1] + Math.PI / 2, 0], seg: 10, emis: 0.15, smooth: false });  // stemma FMLAB
        pb.box([0, 0.57, 0.088], [0.008, 0.16, 0.006], shade(shirt, -25));               // cerniera
      }
      if (coat) {
        [-1, 1].forEach((k) => pb.ell([k * 0.07, 0.56, 0.035], [0.075, 0.15, 0.07], coat, { rot: [0, 0, k * 0.08] }));
        pb.ell([0, 0.58, -0.03], [0.14, 0.15, 0.075], coat);
        pb.cone([0, 0.47, 0], [0.16, 0.24, 0.12], coat, { rot: [0, Math.PI, 0], seg: 12, anim: 0.01 });
        if (L.tie) pb.box([0, 0.6, 0.088], [0.025, 0.1, 0.01], hex(L.tie));
      }
      if (L.scarf) { pb.cyl([0, 0.66, 0], [0.1, 0.035, 0.08], hex(L.scarf), { seg: 12 }); pb.ell([0.05, 0.6, 0.085], [0.025, 0.06, 0.012], hex(L.scarf), { sub: 1 }); }
      if (L.pack && !coat) {
        pb.ell([0, 0.58, -0.115], [0.1, 0.11, 0.055], hex(L.pack));
        pb.ell([0, 0.53, -0.16], [0.075, 0.05, 0.02], shade(hex(L.pack), -25), { sub: 1 });
        [-1, 1].forEach((k) => pb.box([k * 0.075, 0.63, 0.0], [0.022, 0.012, 0.19], shade(hex(L.pack), -30)));
      }
    });
    if (L.cape) r.part('cape', 'torso', [0, 0.68, -0.07], 'cape', {}, (pb) => {
      pb.ell([0, 0.47, -0.1], [0.17, 0.23, 0.018], hex(L.cape), { anim: 0.015 });
      if (L.capeTrim) pb.ell([0, 0.47, -0.108], [0.18, 0.24, 0.012], hex(L.capeTrim), {});
      pb.ell([0, 0.67, -0.06], [0.15, 0.03, 0.06], hex(L.cape), { sub: 1 });
    });
    // braccia: spalla, gomito, mano
    [-1, 1].forEach((s) => {
      const up = r.part(s < 0 ? 'armL' : 'armR', 'torso', [s * 0.145, 0.665, 0], 'uarm', { side: s }, (pb) => {
        pb.ell([s * 0.15, 0.665, 0], [0.05, 0.045, 0.05], sleeve, { sub: 1 });
        pb.ell([s * 0.16, 0.6, 0], [0.04, 0.075, 0.042], sleeve, { sub: 1 });
      });
      r.part(s < 0 ? 'foreL' : 'foreR', up.name, [s * 0.165, 0.53, 0], 'farm', { side: s }, (pb) => {
        pb.ell([s * 0.165, 0.47, 0.005], [0.034, 0.07, 0.036], coat ? sleeve : skin, { sub: 1 });
        pb.ell([s * 0.165, 0.39, 0.012], [0.038, 0.042, 0.034], skin, { sub: 1 });
        pb.ell([s * 0.152, 0.4, 0.04], [0.014, 0.024, 0.014], skin, { sub: 0 });
      });
    });
    // testa con viso, capelli e cappello
    const hc = [0, 0.81, 0.01], hr = [0.135, 0.135, 0.125];
    r.part('head', 'torso', [0, 0.69, 0], 'hhead', {}, (pb) => {
      pb.cyl([0, 0.66, 0], [0.04, 0.06, 0.04], skin, { seg: 8 });
      pb.ell(hc, hr, skin, { gloss: 0.15 });
      [-1, 1].forEach((s) => pb.ell([s * 0.132, 0.8, 0.0], [0.022, 0.035, 0.02], shade(skin, -10), { sub: 1 }));
      pb.ell([0, 0.785, 0.137], [0.016, 0.014, 0.012], shade(skin, -18), { sub: 1 });
      [-1, 1].forEach((s) => {
        const S = onSurface(hc, hr, s * 0.085, -0.035);
        pb.ell(along(S.p, S.n, -0.003), [0.022, 0.014, 0.006], mix(skin, hex('#ff8fa3'), 0.45), { rot: faceTo(S.n), sub: 1 });
        const B = onSurface(hc, hr, s * 0.048, 0.058);
        pb.box(along(B.p, B.n, 0.002), [0.04, 0.009, 0.01], shade(hair, -10), { rot: [faceTo(B.n)[0], faceTo(B.n)[1], s * -0.12] });
      });
      if (L.beard) pb.ell([0, 0.735, 0.1], [0.08, 0.05, 0.05], hex(L.beard), { sub: 1 });
      const Mo = onSurface(hc, hr, 0, -0.06);
      pb.ell(along(Mo.p, Mo.n, -0.002), [0.024, 0.007, 0.006], hex('#7a2e2e'), { rot: faceTo(Mo.n), sub: 1 });
      if (L.glasses) [-1, 1].forEach((s) => {
        const G = onSurface(hc, hr, s * 0.048, 0.012);
        pb.cyl(along(G.p, G.n, 0.012), [0.034, 0.006, 0.034], hex('#1f2937'), { rot: [faceTo(G.n)[0], faceTo(G.n)[1] + Math.PI / 2, 0], seg: 12, smooth: false });
        pb.cyl(along(G.p, G.n, 0.017), [0.028, 0.004, 0.028], hex('#dbeafe'), { rot: [faceTo(G.n)[0], faceTo(G.n)[1] + Math.PI / 2, 0], seg: 12, emis: 0.25, gloss: 1, smooth: false });
      });
      // capelli
      const style = L.hairStyle || 'short';
      if (hat !== 'helmet' && hat !== 'hood' && hat !== 'beanie') {
        const hatted = hat !== 'none' && hat !== 'crown';
        pb.ell([0, hatted ? 0.825 : 0.84, -0.03], [0.145, hatted ? 0.11 : 0.125, 0.125], hair, { gloss: 0.35 });
        const covered = hat === 'cap' || hat === 'backcap' || hat === 'bucket';
        if (style !== 'spiky') [[-0.06, covered ? 0.865 : 0.9, 0.1], [0.0, covered ? 0.87 : 0.91, 0.11], [0.06, covered ? 0.865 : 0.9, 0.1]].forEach(([x, y, z], k) => pb.ell([x, y, z], [0.05, covered ? 0.022 : 0.03, 0.03], hair, { sub: 1, rot: [0, 0.3, (k - 1) * 0.4] }));
      }
      if (style === 'spiky') for (let i = 0; i < 6; i++) { const a = -1 + i * 0.4; pb.cone([Math.sin(a) * 0.1, 0.87, 0.09 + Math.cos(a) * 0.02], [0.032, 0.11, 0.032], hair, { rot: [a * 0.4, -1.25, -a * 0.7], seg: 5 }); }
      if (style === 'bun') pb.ell([0, 0.93, -0.08], [0.06, 0.055, 0.06], hair, { sub: 1 });
      if (style === 'pigtails') [-1, 1].forEach((s) => { pb.ell([s * 0.15, 0.76, -0.04], [0.04, 0.08, 0.04], hair, { sub: 1, rot: [0, 0.2, s * 0.3] }); pb.ell([s * 0.13, 0.84, -0.03], [0.025, 0.02, 0.025], hex('#f43f5e'), { sub: 0 }); });
      if (style === 'long') pb.ell([0, 0.72, -0.08], [0.13, 0.16, 0.06], hair, { gloss: 0.35 });
      if (style === 'side') pb.ell([0.05, 0.91, 0.05], [0.09, 0.03, 0.06], hair, { sub: 1, rot: [0, 0.2, -0.3] });
      // cappelli
      const capTop = (c, r2, col) => pb.ell(c, r2, col, { gloss: 0.3 });
      if (hat === 'cap') { capTop([0, 0.885, -0.005], [0.148, 0.075, 0.14], capC); pb.ell([0, 0.87, 0.125], [0.105, 0.014, 0.08], capC, { sub: 1 }); pb.ell([0, 0.955, 0], [0.018, 0.012, 0.018], shade(capC, -25), { sub: 0 }); }
      if (hat === 'backcap') { capTop([0, 0.885, -0.01], [0.148, 0.075, 0.14], capC); pb.ell([0, 0.865, -0.14], [0.1, 0.014, 0.075], capC, { sub: 1 }); }
      if (hat === 'straw') { pb.cyl([0, 0.875, 0], [0.26, 0.016, 0.26], capC, { seg: 16 }); pb.cyl([0, 0.875, 0], [0.13, 0.085, 0.13], capC, { seg: 14 }); pb.cyl([0, 0.9, 0], [0.133, 0.02, 0.133], hex(L.band), { seg: 14 }); }
      if (hat === 'beanie') { capTop([0, 0.86, -0.01], [0.15, 0.12, 0.145], capC); pb.cyl([0, 0.8, -0.01], [0.152, 0.04, 0.147], shade(capC, -20), { seg: 14 }); pb.ell([0, 0.99, -0.01], [0.04, 0.04, 0.04], WHITE, { sub: 1 }); }
      if (hat === 'hood') { pb.ell([0, 0.84, -0.05], [0.17, 0.17, 0.16], capC, { gloss: 0.15 }); pb.ell([0, 0.88, 0.1], [0.12, 0.04, 0.03], shade(capC, -25), { sub: 1 }); }
      if (hat === 'helmet') { capTop([0, 0.875, -0.005], [0.155, 0.105, 0.15], capC); pb.cyl([0, 0.84, 0], [0.17, 0.014, 0.165], shade(capC, -15), { seg: 16 }); pb.ell([0, 0.9, 0.14], [0.03, 0.03, 0.02], hex('#fff7c2'), { emis: 1, sub: 1 }); }
      if (hat === 'bucket') { pb.cyl([0, 0.86, 0], [0.205, 0.014, 0.205], capC, { seg: 16 }); pb.cyl([0, 0.86, 0], [0.145, 0.08, 0.145], capC, { seg: 14 }); }
      if (hat === 'crown') {
        pb.cyl([0, 0.91, -0.01], [0.105, 0.045, 0.1], capC, { seg: 14, gloss: 0.9 });
        for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; pb.cone([Math.sin(a) * 0.1, 0.955, -0.01 + Math.cos(a) * 0.095], [0.022, 0.06, 0.022], capC, { seg: 5, gloss: 0.9 }); }
        pb.ell([0, 0.935, 0.092], [0.02, 0.02, 0.012], hex('#ef4444'), { sub: 1, emis: 0.6, gloss: 1 });
      }
    });
    // occhi (a parte, per battere le palpebre)
    [-1, 1].forEach((s) => {
      const S = onSurface(hc, hr, s * 0.048, 0.008), c = along(S.p, S.n, -0.004), rot = faceTo(S.n);
      r.part(s < 0 ? 'heyeL' : 'heyeR', 'head', c, 'heye', { side: s }, (pb) => {
        pb.ell(c, [0.022, 0.028, 0.01], hex('#fbfcff'), { rot, sub: 1, gloss: 0.8 });
        pb.ell(along(c, S.n, 0.005), [0.015, 0.02, 0.007], hex('#2b1d14'), { rot, sub: 1, gloss: 1 });
        pb.ell(along([c[0] + 0.005, c[1] + 0.008, c[2]], S.n, 0.01), [0.005, 0.005, 0.003], WHITE, { rot, sub: 0, emis: 1 });
      });
    });
    r.hash = E.hashString('umano:' + name);
    HUMANS.set(name, r);
    return r;
  }
  function humanPose(p, s) {
    const sd = p.side || 1, w = s.w, mv = s.walk;
    switch (p.role) {
      case 'hips': return { t: [0, mv ? Math.abs(Math.sin(w)) * 0.022 - 0.008 : s.br * 0.002, 0], r: [mv ? Math.sin(w) * 0.06 : 0, 0, mv ? Math.sin(w) * 0.03 : 0] };
      case 'thigh': return { r: [0, mv ? -Math.sin(w) * 0.6 * sd : 0, 0] };
      case 'shin': return { r: [0, mv ? 0.08 + Math.max(0, Math.sin(w * 1 + (sd > 0 ? 0 : Math.PI) - 1.3)) * 0.95 : 0.03, 0] };
      case 'torso': return { r: [mv ? -Math.sin(w) * 0.1 : Math.sin(s.t * 0.35 + s.ph) * 0.04, mv ? 0.06 : 0, 0], s: [1, 1 + s.br * 0.012, 1 + s.br * 0.01] };
      case 'uarm': return { r: [0, mv ? Math.sin(w) * 0.55 * sd : Math.sin(s.t * 1.1 + sd) * 0.03, sd * (0.08 + (mv ? 0.04 : s.br * 0.02))] };
      case 'farm': return { r: [0, mv ? -0.35 - Math.max(0, Math.sin(w) * sd) * 0.45 : -0.12, 0] };
      case 'hhead': return { r: [mv ? Math.sin(w) * 0.04 : s.lookY * 0.5, mv ? 0.05 : s.lookP * 0.5, 0] };
      case 'heye': return { r: [s.lookY * 0.3, 0, 0], s: [1, Math.max(0.1, 1 - 0.92 * s.blink), 1], closed: s.blink > 0.55 };
      case 'cape': return { r: [0, (mv ? 0.35 + Math.sin(w * 2) * 0.08 : 0.05 + Math.sin(s.t * 1.2) * 0.03), Math.sin(s.t * 0.9) * 0.03] };
      default: return null;
    }
  }
  function drawHuman(R, name, pos, yaw, walk, moving, scale, t) {
    const rig = humanFor(name);
    const s = creatureState(rig, { t, action: moving ? 'walk' : 'idle', phase: (E.hashString(name) % 50) * 0.3 });
    if (moving) s.w = walk;
    K.softShadow(R, pos[0], pos[1] + 0.012, pos[2], 0.3, 0.25, 0.36);
    const base = mat(pos, [yaw, 0, 0], scale || 1.25);
    const world = {};
    for (const p of rig.parts) {
      const parent = p.parent ? rig.by[p.parent] : null;
      const pose = humanPose(p, s);
      const M = compose(parent ? world[parent.name] : base, p, pose, parent ? parent.pivot : null);
      world[p.name] = M;
      R.draw(mesh(p.key, () => p.builder), M, pose && pose.closed ? { tint: CLOSED_TINT } : {});
    }
    return true;
  }

  // ---------- aggancio al motore ----------
  const H = G3.hooks;
  H.creature = (id, shiny) => bakedCreature(id, shiny);
  H.drawCreature = (R, id, shiny, model, drawOpts, anim) => {
    const rig = rigFor(id, shiny);
    if (!rig) return false;
    drawRig(R, rig, model, drawOpts || {}, creatureState(rig, anim || {}));
    return true;
  };
  H.trainer = (R, look, pos, yaw, walk, moving, scale, t) => drawHuman(R, look, pos, yaw, walk, moving, scale, t);

  root.FMLABModels = {
    species: Object.keys(SPECIES),
    looks: Object.keys(HUMAN_EXTRA),
    /** triangoli per modello (per i controlli di prestazioni) */
    trisOf(key) { const P = String(key); if (P.indexOf('umano:') === 0) return humanFor(P.slice(6)).tris; const m = K.parseMon(P); const r = rigFor(m.id, m.shiny); return r ? r.tris : 0; },
    rigFor, humanFor, NATIVE_SMOOTH,
  };
})(typeof self !== 'undefined' ? self : this);
