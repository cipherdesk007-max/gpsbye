/*
 * FMLAB Monsters — il mondo: mappa a caselle, zone, rilievo del terreno.
 * Generato da numeri fissi: è uguale su tutti i telefoni.
 *
 * Caselle:
 *  .  terreno / sentiero        ,  erba alta del prato (incontri)   ;  erba alta del bosco (incontri)
 *  :  suolo della grotta (incontri)   r  canneto sul fiume (incontri)
 *  s  sabbia     o  fiori     =  ponte     ~  acqua (bloccata)
 *  T  albero     #  roccia     F  recinto     P  fontana     M  casa
 *  H  Centro FMLAB   D  porta del Centro (cura)   K  Laboratorio   L  porta del Laboratorio
 */
(function (root) {
  'use strict';
  const E = root.FMLABEngine || (typeof require === 'function' ? require('./engine.js') : null);
  const W = 32, H = 56;
  const SOLID = new Set(['#', 'T', '~', 'H', 'K', 'F', 'P', 'M']);
  const ENCOUNTER = new Set([',', ';', ':', 'r']);
  const ZONE_NAMES = { grotta: 'Grotta Cupa', bosco: 'Bosco Fitto', fiume: 'Riva del Fiume', prato: 'Prato Ventoso', citta: 'Borgo FMLAB' };
  function zoneAt(y) { return y <= 12 ? 'grotta' : y <= 23 ? 'bosco' : y <= 33 ? 'fiume' : y <= 44 ? 'prato' : 'citta'; }

  // rumore morbido (stessi numeri ovunque)
  function hash2(x, y, s) { const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); }
  function noise(x, y, s) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, s) { return noise(x, y, s) * 0.55 + noise(x * 2.1, y * 2.1, s + 9) * 0.3 + noise(x * 4.3, y * 4.3, s + 21) * 0.15; }

  /** Colonna del sentiero alla riga y (largo 2: px e px+1). */
  const PATH = (() => {
    const out = [], H0 = 56;
    let x = 15;
    for (let y = H0 - 1; y >= 0; y--) {
      let target = y >= 43 ? 15 : 15 + Math.round(Math.sin(y * 0.21) * 3.2);
      if (y >= 24 && y <= 32) target = out[33] != null ? out[33] : x; // dritto sul fiume: il ponte viene diritto
      if (target > x) x++; else if (target < x) x--;          // al massimo una casella per riga
      out[y] = x;
    }
    return out;
  })();
  function pathX(y) { return PATH[Math.max(0, Math.min(PATH.length - 1, y))]; }
  /** Centro del fiume alla colonna x. */
  function riverY(x) { return 28.5 + Math.sin(x * 0.33) * 1.3; }
  const PONDS = [{ x: 6.5, y: 38.5, rx: 2.3, ry: 1.6 }, { x: 25.5, y: 41, rx: 1.6, ry: 1.2 }];

  function build() {
    const g = [];
    for (let y = 0; y < H; y++) g.push(new Array(W).fill('.'));
    const set = (x, y, t) => { if (x >= 0 && y >= 0 && x < W && y < H) g[y][x] = t; };
    const rng = E.makeRng(20261127);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const z = zoneAt(y), n1 = fbm(x * 0.22, y * 0.22, 1), n2 = fbm(x * 0.3, y * 0.3, 2), n3 = hash2(x, y, 3);
      let t = '.';
      if (z === 'grotta') t = n1 > 0.63 ? '#' : ':';
      else if (z === 'bosco') t = n1 > 0.6 || n3 < 0.06 ? 'T' : n2 > 0.36 ? ';' : '.';
      else if (z === 'fiume') {
        const d = Math.abs(y - riverY(x));
        if (d <= 1.3) t = '~';
        else if (d <= 2.4) t = 's';
        else if (d <= 3.4 && n2 > 0.4) t = 'r';
        else t = n3 < 0.05 ? 'T' : n2 > 0.47 ? ',' : '.';
      } else if (z === 'prato') {
        t = n3 < 0.05 ? 'T' : n2 > 0.43 ? ',' : n1 > 0.7 ? 'o' : '.';
        PONDS.forEach((p) => { if (((x + 0.5 - p.x) / p.rx) ** 2 + ((y + 0.5 - p.y) / p.ry) ** 2 <= 1) t = '~'; });
      } else {
        t = n3 < 0.09 && (x < 4 || x > 27) ? 'T' : '.';
      }
      g[y][x] = t;
    }
    // sentiero da sud a nord, con ponte sul fiume
    for (let y = 1; y < H - 1; y++) {
      const px = pathX(y);
      [px, px + 1].forEach((x) => { g[y][x] = g[y][x] === '~' ? '=' : zoneAt(y) === 'grotta' ? '.' : '.'; });
    }
    // radura nel bosco
    for (let y = 16; y <= 20; y++) for (let x = 22; x <= 27; x++) if ((x - 24.5) ** 2 + (y - 18) ** 2 < 6) g[y][x] = '.';
    // Borgo: recinto con cancello, edifici, fontana, case, fiori
    for (let x = 1; x < W - 1; x++) if (x !== pathX(45) && x !== pathX(45) + 1) g[45][x] = 'F';
    const buildings = [];
    const block = (kind, x0, y0, x1, y1, door, doorTile, color) => {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, kind === 'center' ? 'H' : kind === 'lab' ? 'K' : 'M');
      if (door) set(door[0], door[1], doorTile);
      buildings.push({ kind, x0, y0, x1, y1, door, color });
    };
    block('center', 18, 47, 22, 49, [20, 49], 'D');
    block('lab', 7, 47, 10, 48, [8, 48], 'L');
    block('house', 3, 51, 5, 52, null, null, '#f59e0b');
    block('house', 24, 51, 26, 52, null, null, '#8b5cf6');
    block('house', 20, 53, 22, 54, null, null, '#ef4444');
    for (let y = 50; y <= 51; y++) for (let x = 11; x <= 12; x++) g[y][x] = 'P';
    for (let y = 46; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      if (g[y][x] !== '.' || Math.abs(x - 15.5) < 2 || y === 50 && x > 15) continue;
      if (hash2(x, y, 7) < 0.11) g[y][x] = 'o';
    }
    // bordi: alberi, rocce in grotta
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) g[y][x] = y <= 12 ? '#' : 'T';
    }
    // capsule da raccogliere (una per zona selvaggia, più due nascoste)
    const items = [];
    const want = [['prato', 3], ['fiume', 2], ['bosco', 3], ['grotta', 3]];
    want.forEach(([zone, n]) => {
      let tries = 0;
      while (n > 0 && tries++ < 500) {
        const x = 1 + Math.floor(rng() * (W - 2)), y = 1 + Math.floor(rng() * (H - 2));
        if (zoneAt(y) !== zone || SOLID.has(g[y][x]) || g[y][x] === '=' || Math.abs(x - pathX(y) - 0.5) < 2.5) continue;
        if (items.some((it) => Math.abs(it.x - x) + Math.abs(it.y - y) < 5)) continue;
        items.push({ id: 'cap' + items.length, x, y }); n--;
      }
    });
    return { grid: g, buildings, items, start: { x: 15, y: 53 } };
  }
  const WORLD = build();

  function smooth(a, b, x) { const k = Math.max(0, Math.min(1, (x - a) / (b - a))); return k * k * (3 - 2 * k); }
  /** Altezza del terreno nel punto (X, Z) in unità di casella (anche fuori dalla mappa: montagne). */
  function heightAt(X, Z) {
    const zoneAmp = (z) => (z < 12 ? 0.95 : z < 23 ? 0.6 : z < 33 ? 0.3 : z < 44 ? 0.45 : 0);
    // sfuma l'ampiezza tra le zone
    const a = zoneAmp(Z - 1.5) * 0.5 + zoneAmp(Z + 1.5) * 0.5;
    let h = a * (fbm(X * 0.16, Z * 0.16, 5) - 0.38) * 1.6;
    // fiume e laghetti scavati
    if (Z > 22 && Z < 35) { const d = Math.abs(Z - riverY(X - 0.5) - 0.5); h = Math.min(h, -0.5 + (h + 0.5) * smooth(1.1, 3.2, d)); }
    PONDS.forEach((p) => { const d = Math.sqrt(((X - p.x) / p.rx) ** 2 + ((Z - p.y) / p.ry) ** 2); if (d < 2) h = Math.min(h, -0.45 + (h + 0.45) * smooth(0.85, 1.6, d)); });
    // sentiero più piano
    const pc = pathX(Math.floor(Z)) + 1;
    h *= 0.35 + 0.65 * smooth(0.9, 2.6, Math.abs(X - pc));
    // borgo piatto
    h *= 1 - smooth(43.5, 45.5, Z);
    // montagne tutto intorno
    const out = Math.max(0, -X + 0.5, X - W + 0.5, -Z + 0.5, Z - H + 0.5);
    if (out > 0) h += Math.pow(out, 1.4) * 0.55 * (0.55 + 0.9 * fbm(X * 0.09, Z * 0.09, 8)) + (Z < 14 ? out * 0.25 : 0);
    return h;
  }
  /** Altezza dove poggiano i piedi (sul ponte resti sopra l'acqua). */
  function groundY(X, Z) {
    const x = Math.floor(X), y = Math.floor(Z);
    if (y >= 0 && x >= 0 && y < H && x < W && WORLD.grid[y][x] === '=') return 0.12;
    return Math.max(heightAt(X, Z), -0.12);
  }

  const API = {
    W, H, SOLID, ENCOUNTER, ZONE_NAMES, zoneAt, pathX, riverY, heightAt, groundY, fbm,
    grid: WORLD.grid, buildings: WORLD.buildings, items: WORLD.items, start: WORLD.start,
    isSolid: (t) => SOLID.has(t), isEncounter: (t) => ENCOUNTER.has(t),
  };
  root.FMLABWorld = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof self !== 'undefined' ? self : this);
