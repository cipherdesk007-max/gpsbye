/*
 * FMLAB Monsters — musica ed effetti sonori generati dal codice (Web Audio, nessun file audio).
 *
 * API usata dal gioco:
 *   FMLABAudio.unlock()            al primo tocco (iOS e Chrome lo richiedono)
 *   FMLABAudio.music(tema)         cambia brano con dissolvenza (titolo, borgo, percorso, bosco, grotta,
 *                                  notte, lotta, lotta-guardiano, vittoria, evoluzione, orda)
 *   FMLABAudio.sfx(nome)           effetto sonoro (vedi SFX più sotto)
 *   FMLABAudio.stop()              ferma la musica
 *   FMLABAudio.setMusic(v) / setSfx(v) / setVibra(b)   volumi 0..1 salvati nel telefono
 *   FMLABAudio.buzz(ms|schema)     vibrazione (Android), se attiva
 * Per i test: .current (brano chiesto), .playing (brano che suona davvero), .unlocked, .count, .log
 *
 * I brani sono composizioni originali: la melodia nasce da motivi brevi costruiti sugli accordi
 * di ogni pezzo (sempre le stesse note per lo stesso brano), con basso, accordi, arpeggi e batteria.
 * Se il telefono non ha Web Audio tutto resta muto senza errori.
 */
(function (root) {
  'use strict';
  const LS_KEY = 'fmlab-audio';
  const AC = root.AudioContext || root.webkitAudioContext;
  const A = {
    supported: !!AC, unlocked: false, current: null, playing: null, count: 0, log: [],
    musicVol: 0.6, sfxVol: 0.8, vibra: true, errors: 0,
  };
  try {
    const p = JSON.parse(root.localStorage.getItem(LS_KEY) || '{}');
    if (typeof p.music === 'number') A.musicVol = p.music;
    if (typeof p.sfx === 'number') A.sfxVol = p.sfx;
    if (typeof p.vibra === 'boolean') A.vibra = p.vibra;
  } catch (e) { /* niente salvataggio: valori di base */ }
  const savePrefs = () => { try { root.localStorage.setItem(LS_KEY, JSON.stringify({ music: A.musicVol, sfx: A.sfxVol, vibra: A.vibra })); } catch (e) { /* ok */ } };

  let ctx = null, musicBus = null, sfxBus = null, noiseBuf = null, theme = null;

  function boot() {
    if (ctx || !AC) return !!ctx;
    try {
      ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
      comp.connect(ctx.destination);
      musicBus = ctx.createGain(); musicBus.gain.value = A.musicVol * 0.55; musicBus.connect(comp);
      sfxBus = ctx.createGain(); sfxBus.gain.value = A.sfxVol * 0.9; sfxBus.connect(comp);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      return true;
    } catch (e) { A.errors++; ctx = null; return false; }
  }

  /** Va chiamata dentro un tocco/clic: sblocca l'audio e fa partire il brano richiesto. */
  A.unlock = function () {
    if (!AC) return false;
    if (!boot()) return false;
    try {
      if (ctx.state === 'suspended') ctx.resume().then(afterUnlock, () => {});
      // un suono vuoto: iOS vuole che qualcosa parta dentro il gesto
      const b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource();
      s.buffer = b; s.connect(ctx.destination); s.start(0);
    } catch (e) { A.errors++; }
    afterUnlock();
    return true;
  };
  function afterUnlock() {
    if (!ctx || ctx.state !== 'running') return;
    A.unlocked = true;
    if (A.current && A.playing !== A.current) startTheme(A.current);
  }
  ['pointerdown', 'touchend', 'keydown', 'click'].forEach((ev) => root.addEventListener && root.addEventListener(ev, () => { if (!A.unlocked) A.unlock(); }, true));
  if (root.document) root.document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    try { if (root.document.hidden) ctx.suspend(); else if (A.unlocked) ctx.resume(); } catch (e) { /* ok */ }
  });

  // ---------- strumenti ----------
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  function env(g, t, a, peak, d, sus, rel, end) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * sus), t + a + d);
    g.gain.setValueAtTime(Math.max(0.0001, peak * sus), end);
    g.gain.exponentialRampToValueAtTime(0.0001, end + rel);
  }
  function voice(out, o) {
    // o: { f, wave, t, dur, vol, a, d, sus, rel, cutoff, q, vib, detune, f1 }
    const t = o.t, end = t + o.dur;
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = o.wave || 'triangle';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), end);
    if (o.detune) osc.detune.value = o.detune;
    let node = osc;
    if (o.cutoff) {
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.cutoff; f.Q.value = o.q || 0.7;
      if (o.sweep) { f.frequency.setValueAtTime(o.cutoff * 0.35, t); f.frequency.exponentialRampToValueAtTime(o.cutoff, t + Math.min(o.dur, o.sweep)); }
      node.connect(f); node = f;
    }
    if (o.vib && o.dur > 0.25) {
      const l = ctx.createOscillator(), lg = ctx.createGain();
      l.frequency.value = 5.2; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(o.f * 0.007 * o.vib, t + 0.25);
      l.connect(lg); lg.connect(osc.frequency); l.start(t); l.stop(end + (o.rel || 0.1) + 0.05);
    }
    node.connect(g); g.connect(out);
    env(g, t, o.a || 0.01, o.vol, o.d || 0.1, o.sus == null ? 0.6 : o.sus, o.rel || 0.12, end);
    osc.start(t); osc.stop(end + (o.rel || 0.12) + 0.05);
  }
  function noiseHit(out, o) {
    // o: { t, dur, vol, type:'highpass'|'lowpass'|'bandpass', freq, q, f1 }
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuf; src.loop = true;
    f.type = o.type || 'highpass'; f.frequency.setValueAtTime(o.freq || 1000, o.t); f.Q.value = o.q || 0.8;
    if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, o.t + o.dur);
    src.connect(f); f.connect(g); g.connect(out);
    g.gain.setValueAtTime(0.0001, o.t);
    g.gain.linearRampToValueAtTime(o.vol, o.t + (o.a || 0.003));
    g.gain.exponentialRampToValueAtTime(0.0001, o.t + o.dur);
    src.start(o.t, Math.random() * 0.5); src.stop(o.t + o.dur + 0.05);
  }
  const drum = {
    kick(out, t, v) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(155, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.9 * v, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.32);
    },
    snare(out, t, v) {
      noiseHit(out, { t, dur: 0.16, vol: 0.42 * v, type: 'highpass', freq: 1400 });
      voice(out, { f: 196, f1: 150, wave: 'triangle', t, dur: 0.05, vol: 0.25 * v, a: 0.002, d: 0.04, sus: 0.2, rel: 0.05 });
    },
    hat(out, t, v) { noiseHit(out, { t, dur: 0.045, vol: 0.14 * v, type: 'highpass', freq: 7500 }); },
    shaker(out, t, v) { noiseHit(out, { t, dur: 0.07, vol: 0.09 * v, type: 'bandpass', freq: 6000, q: 1.2, a: 0.02 }); },
    tom(out, t, v) { voice(out, { f: 130, f1: 80, wave: 'sine', t, dur: 0.18, vol: 0.5 * v, a: 0.003, d: 0.12, sus: 0.2, rel: 0.1 }); },
  };

  // ---------- composizione ----------
  const SCALES = {
    major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10],
    lydian: [0, 2, 4, 6, 7, 9, 11], harmonic: [0, 2, 3, 5, 7, 8, 11], mixo: [0, 2, 4, 5, 7, 9, 10],
  };
  const deg2midi = (rootN, scale, deg) => { const o = Math.floor(deg / 7), i = ((deg % 7) + 7) % 7; return rootN + o * 12 + scale[i]; };
  const RHYTHMS = {
    calm: [[0, 4], [4, 2], [6, 2], [8, 6], [14, 2]],
    flow: [[0, 3], [3, 1], [4, 2], [6, 2], [8, 4], [12, 2], [14, 2]],
    hop: [[0, 2], [2, 2], [4, 3], [7, 1], [8, 2], [10, 2], [12, 4]],
    drive: [[0, 2], [2, 2], [4, 1], [5, 1], [6, 2], [8, 2], [10, 2], [12, 3], [15, 1]],
    sparse: [[0, 6], [6, 2], [8, 8]],
    lilt: [[0, 3], [3, 3], [6, 2], [8, 3], [11, 3], [14, 2]],
    cad: [[0, 4], [4, 4], [8, 8]],
  };
  // ogni brano: tonalità, scala, giro di accordi (gradi della scala, una battuta ciascuno), carattere
  const THEMES = {
    titolo: { bpm: 92, root: 60, scale: 'major', prog: [0, 4, 5, 3, 0, 4, 3, 4, 5, 3, 0, 4, 5, 3, 1, 4], rA: 'calm', rB: 'flow', lead: { wave: 'triangle', oct: 12, vol: 0.13, vib: 1, cutoff: 3200 }, pad: { vol: 0.05, cutoff: 1500 }, bass: 'R.......F.......', drums: { kick: 'x.......x.......', snare: '....x.......x...', hat: '..o...o...o...o.' }, arp: null, delay: [0.33, 0.28, 0.22] },
    borgo: { bpm: 96, root: 65, scale: 'major', prog: [0, 5, 3, 4, 0, 5, 1, 4, 3, 4, 2, 5, 1, 4, 0, 4], rA: 'lilt', rB: 'hop', lead: { wave: 'square', oct: 0, vol: 0.06, vib: 0.4, cutoff: 2200 }, pad: { vol: 0.035, cutoff: 1100 }, bass: 'R...F...R...F...', drums: { kick: 'x.......x.......', snare: '....x.......x...', hat: 'o.o.o.o.o.o.o.o.' }, arp: { wave: 'triangle', vol: 0.035, pat: [0, 2, 4, 2], every: 2, oct: 12 }, delay: null },
    percorso: { bpm: 126, root: 67, scale: 'major', prog: [0, 3, 4, 0, 0, 3, 1, 4, 5, 3, 0, 4, 5, 3, 1, 4], rA: 'hop', rB: 'drive', lead: { wave: 'square', oct: 0, vol: 0.07, vib: 0.5, cutoff: 2600 }, pad: { vol: 0.03, cutoff: 1300 }, bass: 'R.R.F.R.R.R.F.O.', drums: { kick: 'x...x...x...x...', snare: '....x.......x..o', hat: 'o.o.o.o.o.o.o.o.' }, arp: null, delay: [0.24, 0.2, 0.15] },
    bosco: { bpm: 100, root: 62, scale: 'dorian', prog: [0, 6, 3, 6, 0, 6, 3, 4, 2, 3, 0, 6, 2, 3, 4, 4], rA: 'flow', rB: 'calm', lead: { wave: 'sine', oct: 12, vol: 0.12, vib: 1.4, cutoff: 0 }, pad: { vol: 0.04, cutoff: 900 }, bass: 'R.......R...F...', drums: { kick: 'x.........x.....', snare: '........x.......', hat: '', shaker: 'o.o.o.o.o.o.o.o.' }, arp: { wave: 'triangle', vol: 0.03, pat: [0, 4, 2, 4], every: 2, oct: 0 }, delay: [0.45, 0.32, 0.25] },
    grotta: { bpm: 80, root: 57, scale: 'minor', prog: [0, 5, 3, 4, 0, 5, 6, 4, 3, 0, 5, 4, 3, 1, 4, 4], rA: 'sparse', rB: 'calm', lead: { wave: 'triangle', oct: 12, vol: 0.1, vib: 0.8, cutoff: 1600 }, pad: { vol: 0.05, cutoff: 700 }, bass: 'R...............', drums: { kick: 'x.......x.......', snare: '', hat: '......o.......o.', tom: '............x...' }, arp: null, delay: [0.56, 0.42, 0.35] },
    notte: { bpm: 70, root: 63, scale: 'lydian', prog: [0, 1, 0, 1, 5, 3, 0, 1, 0, 1, 5, 3, 2, 1, 3, 4], rA: 'sparse', rB: 'calm', lead: { wave: 'sine', oct: 12, vol: 0.1, vib: 1, cutoff: 0 }, pad: { vol: 0.05, cutoff: 800 }, bass: 'R...............', drums: { kick: '', snare: '', hat: '' }, arp: { wave: 'sine', vol: 0.03, pat: [0, 2, 4, 7, 4, 2], every: 2, oct: 12 }, delay: [0.62, 0.4, 0.35] },
    lotta: { bpm: 152, root: 64, scale: 'minor', prog: [0, 0, 5, 6, 0, 0, 3, 4, 5, 6, 0, 0, 5, 3, 4, 4], rA: 'drive', rB: 'hop', lead: { wave: 'sawtooth', oct: 0, vol: 0.06, vib: 0.4, cutoff: 2400, sweep: 0.08 }, pad: null, bass: 'RRORRROR RRORFFOF'.replace(/ /g, ''), drums: { kick: 'x...x...x...x.x.', snare: '....x.......x...', hat: 'oooooooooooooooo' }, arp: { wave: 'square', vol: 0.025, pat: [0, 2, 4, 7], every: 1, oct: 12 }, delay: null },
    'lotta-guardiano': { bpm: 160, root: 60, scale: 'harmonic', prog: [0, 5, 3, 4, 0, 5, 1, 4, 5, 6, 0, 0, 3, 4, 4, 4], rA: 'drive', rB: 'drive', lead: { wave: 'sawtooth', oct: 0, vol: 0.07, vib: 0.6, cutoff: 2800, sweep: 0.06 }, pad: { vol: 0.03, cutoff: 1800 }, bass: 'RORORORORORORFOF', drums: { kick: 'x.x.x...x.x.x..x', snare: '....x.......x.xx', hat: 'oooooooooooooooo' }, arp: null, delay: null },
    evoluzione: { bpm: 108, root: 57, scale: 'lydian', prog: [0, 1, 0, 1, 5, 3, 4, 4], rA: 'calm', rB: 'calm', lead: { wave: 'triangle', oct: 12, vol: 0.1, vib: 1.2, cutoff: 3000 }, pad: { vol: 0.05, cutoff: 1600 }, bass: 'R.......R.......', drums: { kick: 'x...............', snare: '', hat: '..o...o...o...o.' }, arp: { wave: 'sine', vol: 0.045, pat: [0, 2, 4, 7, 9, 7, 4, 2], every: 1, oct: 12 }, delay: [0.28, 0.35, 0.3] },
    orda: { bpm: 172, root: 57, scale: 'minor', prog: [0, 0, 5, 5, 3, 3, 4, 4, 0, 0, 5, 5, 3, 4, 0, 4], rA: 'drive', rB: 'hop', lead: { wave: 'square', oct: 12, vol: 0.055, vib: 0.3, cutoff: 3000 }, pad: null, bass: 'RRRRRRRRRRRRFFOO', drums: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'oxoxoxoxoxoxoxox' }, arp: { wave: 'sawtooth', vol: 0.022, pat: [0, 4, 2, 7], every: 1, oct: 12 }, delay: null },
    // fanfara breve, suonata una volta sola
    vittoria: { bpm: 132, root: 60, scale: 'major', prog: [0, 3, 4, 0], once: true, fixed: [[0, 0, 4, 2], [0, 4, 4, 2], [0, 6, 4, 2], [0, 8, 7, 6], [0, 14, 4, 2], [1, 0, 8, 4], [1, 4, 7, 2], [1, 6, 8, 2], [1, 8, 9, 8], [2, 0, 7, 4], [2, 4, 8, 4], [2, 8, 9, 2], [2, 10, 10, 6], [3, 0, 11, 16]], lead: { wave: 'square', oct: 0, vol: 0.08, vib: 0.6, cutoff: 3200 }, pad: { vol: 0.05, cutoff: 1800 }, bass: 'R...F...R...F...', drums: { kick: 'x.......x.......', snare: '....x...x.x.x...', hat: 'o.o.o.o.o.o.o.o.' }, arp: null, delay: [0.22, 0.2, 0.15] },
  };
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  /** Motivo di una battuta: ritmo + note rispetto all'accordo (forti = note dell'accordo). */
  function makeBar(r, rhythm, prev) {
    const out = [];
    let cur = prev;
    rhythm.forEach(([step, len]) => {
      const strong = step % 4 === 0;
      const cands = strong ? [0, 2, 4, 7, -3] : [1, 3, 5, -1, 2, 4, 6];
      // movimento per gradi: si preferisce la nota più vicina alla precedente
      cands.sort((a, b) => Math.abs(a - cur) - Math.abs(b - cur) + (r() - 0.5) * 3.2);
      const off = cands[0];
      out.push({ step, len, off });
      cur = off;
    });
    return out;
  }
  function compose(name, T) {
    const r = rng(hashStr('fmlab-' + name));
    const bars = T.prog.length, mel = [];
    if (T.fixed) {
      for (let b = 0; b < bars; b++) mel.push([]);
      T.fixed.forEach(([bar, step, deg, len]) => mel[bar].push({ step, len, abs: deg }));
      return mel;
    }
    const A1 = makeBar(r, RHYTHMS[T.rA], 2), A2 = makeBar(r, RHYTHMS[T.rB], A1[A1.length - 1].off);
    const B1 = makeBar(r, RHYTHMS[T.rB], 4), B2 = makeBar(r, RHYTHMS[T.rA], B1[B1.length - 1].off);
    const CAD = RHYTHMS.cad.map(([step, len], i) => ({ step, len, off: [2, 1, 0][i] }));
    // frasi di 4 battute: A A' B A''
    const plan = bars >= 16
      ? [A1, A2, A1, CAD, A1, A2, B1, B2, B1, B2, A1, A2, A1, A2, B2, CAD]
      : [A1, A2, A1, CAD, B1, B2, A1, CAD];
    for (let b = 0; b < bars; b++) mel.push(plan[b % plan.length]);
    return mel;
  }

  // ---------- riproduzione ----------
  function startTheme(name) {
    if (!ctx) return;
    const T = THEMES[name];
    if (!T) return;
    const old = theme;
    const now = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, now);
    out.gain.exponentialRampToValueAtTime(1, now + (old ? 0.9 : 0.25));
    out.connect(musicBus);
    let wet = null;
    if (T.delay) {
      const dl = ctx.createDelay(1.5), fb = ctx.createGain(), mixG = ctx.createGain(), lp = ctx.createBiquadFilter();
      dl.delayTime.value = T.delay[0]; fb.gain.value = T.delay[1]; mixG.gain.value = T.delay[2];
      lp.type = 'lowpass'; lp.frequency.value = 2200;
      dl.connect(lp); lp.connect(fb); fb.connect(dl); dl.connect(mixG); mixG.connect(out);
      wet = dl;
    }
    const me = { name, T, out, wet, mel: compose(name, T), step: 0, next: now + 0.08, timer: null, sp: 60 / T.bpm / 4, scale: SCALES[T.scale] };
    me.timer = setInterval(() => schedule(me), 25);
    schedule(me);
    theme = me;
    A.playing = name;
    if (old) fadeOut(old);
  }
  function fadeOut(th) {
    try {
      const t = ctx.currentTime;
      th.out.gain.cancelScheduledValues(t);
      th.out.gain.setValueAtTime(Math.max(0.0001, th.out.gain.value), t);
      th.out.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    } catch (e) { /* ok */ }
    clearInterval(th.timer);
    setTimeout(() => { try { th.out.disconnect(); } catch (e) { /* ok */ } }, 1400);
  }
  function schedule(me) {
    if (!ctx || theme !== me) { clearInterval(me.timer); return; }
    const T = me.T, total = T.prog.length * 16;
    while (me.next < ctx.currentTime + 0.14) {
      if (T.once && me.step >= total) {
        clearInterval(me.timer);
        if (theme === me) { A.playing = null; setTimeout(() => { if (theme === me) { fadeOut(me); theme = null; } }, 1500); }
        return;
      }
      playStep(me, me.step % total, me.next);
      me.next += me.sp * (me.step % 2 === 1 && T.swing ? 1 - T.swing : me.step % 2 === 0 && T.swing ? 1 + T.swing : 1);
      me.step++;
    }
  }
  function playStep(me, s, t) {
    const T = me.T, bar = Math.floor(s / 16), pos = s % 16, chord = T.prog[bar], sp = me.sp, out = me.out;
    const sendW = (node) => { if (me.wet) node.connect(me.wet); };
    try {
      // accordi
      if (T.pad && pos === 0) {
        [0, 2, 4].forEach((k) => {
          const m = deg2midi(T.root - 12, me.scale, chord + k);
          [-7, 7].forEach((dt) => voice(out, { f: mtof(m), wave: 'sawtooth', t, dur: sp * 15.5, vol: T.pad.vol, a: 0.35, d: 0.4, sus: 0.8, rel: 0.5, cutoff: T.pad.cutoff, detune: dt }));
        });
      }
      // basso
      const bc = T.bass && T.bass[pos];
      if (bc && bc !== '.') {
        const off = bc === 'F' ? 4 : 0, oc = bc === 'O' ? 12 : 0;
        voice(out, { f: mtof(deg2midi(T.root - 24, me.scale, chord + off) + oc), wave: 'triangle', t, dur: sp * 1.7, vol: 0.2, a: 0.005, d: 0.08, sus: 0.6, rel: 0.06, cutoff: 900 });
      }
      // arpeggio
      if (T.arp && pos % T.arp.every === 0) {
        const k = T.arp.pat[(pos / T.arp.every) % T.arp.pat.length];
        voice(out, { f: mtof(deg2midi(T.root + T.arp.oct - 12, me.scale, chord + k)), wave: T.arp.wave, t, dur: sp * 0.9, vol: T.arp.vol, a: 0.004, d: 0.06, sus: 0.3, rel: 0.08, cutoff: 3500 });
      }
      // melodia
      const ev = me.mel[bar].find((e) => e.step === pos);
      if (ev) {
        const m = ev.abs != null ? deg2midi(T.root, me.scale, ev.abs) : deg2midi(T.root + T.lead.oct, me.scale, chord + ev.off);
        const g = ctx.createGain(); g.gain.value = 1; g.connect(out); sendW(g);
        voice(g, { f: mtof(m), wave: T.lead.wave, t, dur: sp * ev.len * 0.92, vol: T.lead.vol, a: 0.012, d: 0.12, sus: 0.55, rel: 0.14, cutoff: T.lead.cutoff || 0, vib: T.lead.vib, sweep: T.lead.sweep });
      }
      // batteria
      const D = T.drums || {};
      const hit = (pat, fn, v) => { const c = pat && pat[pos]; if (c === 'x') fn(out, t, v); else if (c === 'o') fn(out, t, v * 0.55); };
      hit(D.kick, drum.kick, 1); hit(D.snare, drum.snare, 1); hit(D.hat, drum.hat, 1); hit(D.shaker, drum.shaker, 1); hit(D.tom, drum.tom, 1);
    } catch (e) { A.errors++; }
  }

  A.music = function (name) {
    if (name === A.current && (A.playing === name || !A.unlocked)) return;
    if (name === A.current && THEMES[name] && THEMES[name].once) return;
    A.current = name;
    if (!ctx || ctx.state !== 'running') return;     // partirà allo sblocco
    if (!name) { A.stop(); return; }
    startTheme(name);
  };
  A.stop = function () {
    A.current = null; A.playing = null;
    if (theme && ctx) fadeOut(theme);
    theme = null;
  };

  // ---------- effetti ----------
  const N = (m) => mtof(m);
  const SFX = {
    tasto: (o, t) => voice(o, { f: 880, f1: 1320, wave: 'square', t, dur: 0.035, vol: 0.07, a: 0.002, d: 0.02, sus: 0.4, rel: 0.03, cutoff: 3500 }),
    indietro: (o, t) => voice(o, { f: 620, f1: 380, wave: 'square', t, dur: 0.05, vol: 0.06, a: 0.002, d: 0.03, sus: 0.4, rel: 0.03, cutoff: 3000 }),
    passo: (o, t) => noiseHit(o, { t, dur: 0.05, vol: 0.09, type: 'lowpass', freq: 380 }),
    erba: (o, t) => { noiseHit(o, { t, dur: 0.14, vol: 0.09, type: 'bandpass', freq: 3200, q: 1.1, a: 0.02 }); noiseHit(o, { t: t + 0.05, dur: 0.09, vol: 0.06, type: 'bandpass', freq: 4500, q: 1.4 }); },
    incontro: (o, t) => {
      voice(o, { f: 180, f1: 1400, wave: 'sawtooth', t, dur: 0.32, vol: 0.09, a: 0.01, d: 0.2, sus: 0.6, rel: 0.05, cutoff: 3000 });
      noiseHit(o, { t, dur: 0.35, vol: 0.12, type: 'bandpass', freq: 800, f1: 5000, q: 1 });
      [0, 3, 7].forEach((k, i) => voice(o, { f: N(64 + k), wave: 'square', t: t + 0.36 + i * 0.09, dur: 0.08, vol: 0.08, a: 0.003, d: 0.05, sus: 0.5, rel: 0.05, cutoff: 3000 }));
    },
    attacco: (o, t) => noiseHit(o, { t, dur: 0.22, vol: 0.12, type: 'bandpass', freq: 500, f1: 3500, q: 1.3, a: 0.04 }),
    'colpo-normale': (o, t) => { noiseHit(o, { t, dur: 0.12, vol: 0.35, type: 'lowpass', freq: 1500 }); voice(o, { f: 190, f1: 55, wave: 'sine', t, dur: 0.16, vol: 0.45, a: 0.002, d: 0.1, sus: 0.3, rel: 0.05 }); },
    'colpo-fuoco': (o, t) => {
      noiseHit(o, { t, dur: 0.4, vol: 0.3, type: 'lowpass', freq: 4000, f1: 300 });
      for (let i = 0; i < 6; i++) noiseHit(o, { t: t + 0.04 + Math.random() * 0.3, dur: 0.02, vol: 0.12, type: 'highpass', freq: 3000 });
      voice(o, { f: 140, f1: 60, wave: 'sine', t, dur: 0.2, vol: 0.3, a: 0.003, d: 0.1, sus: 0.3, rel: 0.05 });
    },
    'colpo-acqua': (o, t) => {
      [0, 0.07, 0.15].forEach((d, i) => voice(o, { f: 1100 - i * 150, f1: 320, wave: 'sine', t: t + d, dur: 0.12, vol: 0.2, a: 0.003, d: 0.06, sus: 0.4, rel: 0.05 }));
      noiseHit(o, { t, dur: 0.3, vol: 0.14, type: 'highpass', freq: 1800, a: 0.02 });
    },
    'colpo-erba': (o, t) => {
      noiseHit(o, { t, dur: 0.28, vol: 0.18, type: 'bandpass', freq: 2500, f1: 6000, q: 1.5, a: 0.03 });
      voice(o, { f: 1300, f1: 1700, wave: 'triangle', t: t + 0.05, dur: 0.12, vol: 0.08, a: 0.005, d: 0.06, sus: 0.4, rel: 0.05 });
      voice(o, { f: 160, f1: 70, wave: 'sine', t, dur: 0.14, vol: 0.3, a: 0.002, d: 0.08, sus: 0.3, rel: 0.05 });
    },
    'colpo-elettro': (o, t) => {
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = 'square';
      for (let i = 0; i < 16; i++) osc.frequency.setValueAtTime(600 + Math.random() * 1800, t + i * 0.016);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.12, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      osc.connect(g); g.connect(o); osc.start(t); osc.stop(t + 0.3);
      noiseHit(o, { t, dur: 0.12, vol: 0.2, type: 'highpass', freq: 4000 });
    },
    'colpo-roccia': (o, t) => {
      voice(o, { f: 120, f1: 38, wave: 'sine', t, dur: 0.26, vol: 0.6, a: 0.002, d: 0.15, sus: 0.3, rel: 0.08 });
      noiseHit(o, { t, dur: 0.22, vol: 0.38, type: 'lowpass', freq: 700 });
      noiseHit(o, { t: t + 0.08, dur: 0.1, vol: 0.15, type: 'bandpass', freq: 1800, q: 1 });
    },
    'colpo-ombra': (o, t) => {
      [-12, 12].forEach((dt) => voice(o, { f: 420, f1: 110, wave: 'sawtooth', t, dur: 0.42, vol: 0.08, a: 0.06, d: 0.2, sus: 0.6, rel: 0.1, cutoff: 1400, detune: dt }));
      noiseHit(o, { t, dur: 0.4, vol: 0.08, type: 'lowpass', freq: 900, a: 0.12 });
    },
    critico: (o, t) => { voice(o, { f: 1760, wave: 'square', t, dur: 0.05, vol: 0.08, a: 0.002, d: 0.03, sus: 0.5, rel: 0.05, cutoff: 5000 }); voice(o, { f: 2637, wave: 'square', t: t + 0.05, dur: 0.07, vol: 0.07, a: 0.002, d: 0.04, sus: 0.5, rel: 0.06, cutoff: 5000 }); },
    superefficace: (o, t) => [0, 4, 7, 12].forEach((k, i) => voice(o, { f: N(72 + k), wave: 'square', t: t + i * 0.055, dur: 0.06, vol: 0.07, a: 0.002, d: 0.03, sus: 0.6, rel: 0.05, cutoff: 4000 })),
    pocoefficace: (o, t) => [0, -3].forEach((k, i) => voice(o, { f: N(67 + k), wave: 'triangle', t: t + i * 0.09, dur: 0.09, vol: 0.08, a: 0.004, d: 0.05, sus: 0.5, rel: 0.05 })),
    esausto: (o, t) => voice(o, { f: 620, f1: 110, wave: 'triangle', t, dur: 0.65, vol: 0.2, a: 0.01, d: 0.3, sus: 0.6, rel: 0.12, vib: 1.5 }),
    stato: (o, t) => voice(o, { f: 520, f1: 380, wave: 'sine', t, dur: 0.4, vol: 0.14, a: 0.02, d: 0.2, sus: 0.6, rel: 0.1, vib: 3 }),
    lancio: (o, t) => { noiseHit(o, { t, dur: 0.32, vol: 0.12, type: 'bandpass', freq: 400, f1: 3000, q: 1.2, a: 0.05 }); voice(o, { f: 380, f1: 900, wave: 'triangle', t, dur: 0.3, vol: 0.08, a: 0.01, d: 0.2, sus: 0.6, rel: 0.05 }); },
    oscillazione: (o, t) => { voice(o, { f: 320, wave: 'square', t, dur: 0.03, vol: 0.08, a: 0.002, d: 0.02, sus: 0.4, rel: 0.02, cutoff: 1500 }); voice(o, { f: 480, wave: 'square', t: t + 0.07, dur: 0.03, vol: 0.06, a: 0.002, d: 0.02, sus: 0.4, rel: 0.02, cutoff: 1500 }); },
    cattura: (o, t) => {
      [0, 4, 7, 12, 16].forEach((k, i) => voice(o, { f: N(67 + k), wave: i < 4 ? 'square' : 'triangle', t: t + i * 0.08, dur: i < 4 ? 0.08 : 0.5, vol: 0.075, a: 0.003, d: 0.05, sus: 0.6, rel: 0.12, cutoff: 3600 }));
      for (let i = 0; i < 5; i++) voice(o, { f: N(96 + (i % 3) * 3), wave: 'sine', t: t + 0.45 + i * 0.05, dur: 0.06, vol: 0.04, a: 0.002, d: 0.03, sus: 0.4, rel: 0.05 });
    },
    uscita: (o, t) => { noiseHit(o, { t, dur: 0.1, vol: 0.2, type: 'bandpass', freq: 1200, q: 1 }); voice(o, { f: 760, f1: 280, wave: 'triangle', t, dur: 0.2, vol: 0.12, a: 0.003, d: 0.1, sus: 0.5, rel: 0.05 }); },
    fuga: (o, t) => noiseHit(o, { t, dur: 0.35, vol: 0.12, type: 'bandpass', freq: 3000, f1: 400, q: 1.2, a: 0.02 }),
    livello: (o, t) => [0, 2, 4, 7, 9, 12].forEach((k, i) => voice(o, { f: N(69 + k), wave: 'square', t: t + i * 0.06, dur: i === 5 ? 0.3 : 0.06, vol: 0.07, a: 0.003, d: 0.04, sus: 0.6, rel: 0.1, cutoff: 3500 })),
    evoluzione: (o, t) => {
      [0, 4, 7, 11, 14].forEach((k, i) => voice(o, { f: N(57 + k), wave: 'sawtooth', t: t + i * 0.12, dur: 1.8 - i * 0.12, vol: 0.045, a: 0.3, d: 0.5, sus: 0.8, rel: 0.6, cutoff: 3000, sweep: 1.4, detune: i % 2 ? 6 : -6 }));
      for (let i = 0; i < 10; i++) voice(o, { f: N(84 + [0, 4, 7, 11, 12][i % 5]), wave: 'sine', t: t + 0.6 + i * 0.1, dur: 0.12, vol: 0.035, a: 0.003, d: 0.05, sus: 0.5, rel: 0.1 });
    },
    cura: (o, t) => [62, 66, 69, 74, 71, 74, 78].forEach((m, i) => {
      voice(o, { f: N(m + 12), wave: 'sine', t: t + i * 0.11, dur: i === 6 ? 0.6 : 0.16, vol: 0.09, a: 0.003, d: 0.1, sus: 0.4, rel: 0.25 });
      voice(o, { f: N(m + 24), wave: 'sine', t: t + i * 0.11, dur: 0.1, vol: 0.025, a: 0.003, d: 0.05, sus: 0.3, rel: 0.15 });
    }),
    oggetto: (o, t) => [79, 86].forEach((m, i) => { voice(o, { f: N(m), wave: 'sine', t: t + i * 0.1, dur: 0.18, vol: 0.1, a: 0.003, d: 0.1, sus: 0.4, rel: 0.25 }); voice(o, { f: N(m + 12), wave: 'triangle', t: t + i * 0.1, dur: 0.08, vol: 0.03, a: 0.003, d: 0.05, sus: 0.3, rel: 0.1 }); }),
    dialogo: (o, t) => voice(o, { f: 760 + Math.random() * 160, wave: 'square', t, dur: 0.022, vol: 0.035, a: 0.002, d: 0.015, sus: 0.4, rel: 0.015, cutoff: 2600 }),
    invito: (o, t) => [81, 88, 93].forEach((m, i) => voice(o, { f: N(m), wave: 'sine', t: t + i * 0.13, dur: 0.22, vol: 0.09, a: 0.003, d: 0.1, sus: 0.5, rel: 0.3 })),
    errore: (o, t) => voice(o, { f: 180, wave: 'square', t, dur: 0.16, vol: 0.06, a: 0.003, d: 0.08, sus: 0.6, rel: 0.05, cutoff: 1200 }),
    medaglia: (o, t) => [0, 7, 12, 16, 19, 24].forEach((k, i) => voice(o, { f: N(60 + k), wave: i % 2 ? 'triangle' : 'square', t: t + i * 0.1, dur: i === 5 ? 0.9 : 0.12, vol: 0.07, a: 0.004, d: 0.06, sus: 0.6, rel: 0.2, cutoff: 3200 })),
  };
  A.SFX_NAMES = Object.keys(SFX);
  A.THEME_NAMES = Object.keys(THEMES);
  const lastAt = {};
  A.sfx = function (name) {
    A.count++;
    A.log.push(name); if (A.log.length > 60) A.log.shift();
    if (!ctx || ctx.state !== 'running' || !SFX[name] || A.sfxVol <= 0) return;
    const now = ctx.currentTime;
    // gli stessi suoni a raffica non si accavallano (passi, lettere dei dialoghi)
    if (lastAt[name] && now - lastAt[name] < (name === 'dialogo' ? 0.045 : 0.03)) return;
    lastAt[name] = now;
    try { SFX[name](sfxBus, now + 0.005); } catch (e) { A.errors++; }
  };
  A.setMusic = function (v) { A.musicVol = Math.max(0, Math.min(1, Number(v) || 0)); if (musicBus) musicBus.gain.setTargetAtTime(A.musicVol * 0.55, ctx.currentTime, 0.05); savePrefs(); };
  A.setSfx = function (v) { A.sfxVol = Math.max(0, Math.min(1, Number(v) || 0)); if (sfxBus) sfxBus.gain.setTargetAtTime(A.sfxVol * 0.9, ctx.currentTime, 0.05); savePrefs(); };
  A.setVibra = function (b) { A.vibra = !!b; savePrefs(); };
  A.buzz = function (p) { try { if (A.vibra && root.navigator && root.navigator.vibrate) root.navigator.vibrate(p); } catch (e) { /* ok */ } };
  Object.defineProperty(A, 'state', { get: () => (ctx ? ctx.state : 'none') });
  root.FMLABAudio = A;
})(typeof self !== 'undefined' ? self : this);
