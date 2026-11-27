/*
 * FMLAB Monsters — motore di gioco
 * Creature, tipi e mosse ORIGINALI. Nessun dato o grafica di altri giochi.
 *
 * Il motore è deterministico: con lo stesso seme e le stesse scelte, due
 * telefoni calcolano esattamente la stessa lotta (serve per le sfide online).
 * Funziona sia nel browser (window.FMLABEngine) sia in Node (require).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FMLABEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- Generatore casuale con seme (mulberry32) ----------
  function makeRng(seed) {
    let a = seed >>> 0;
    const rng = function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    rng.state = function () { return a; };
    return rng;
  }

  function hashString(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }

  // ---------- Tipi ----------
  const TYPES = {
    fuoco:   { name: 'Fuoco',   color: '#ff6b35', dark: '#c2410c' },
    acqua:   { name: 'Acqua',   color: '#3b9dff', dark: '#1d4ed8' },
    erba:    { name: 'Erba',    color: '#4cc96b', dark: '#15803d' },
    elettro: { name: 'Elettro', color: '#2fd6ff', dark: '#0e7490' },
    roccia:  { name: 'Roccia',  color: '#b08d57', dark: '#78350f' },
    ombra:   { name: 'Ombra',   color: '#8b5cf6', dark: '#4c1d95' },
  };

  // efficacia[attacco][difesa]: 2 = superefficace, 0.5 = poco efficace
  const CHART = {
    fuoco:   { erba: 2, acqua: 0.5, roccia: 0.5, fuoco: 0.5 },
    acqua:   { fuoco: 2, roccia: 2, erba: 0.5, acqua: 0.5 },
    erba:    { acqua: 2, roccia: 2, fuoco: 0.5, erba: 0.5 },
    elettro: { acqua: 2, ombra: 2, roccia: 0.5, erba: 0.5, elettro: 0.5 },
    roccia:  { fuoco: 2, elettro: 2, erba: 0.5 },
    ombra:   { ombra: 2, erba: 2, roccia: 0.5 },
  };

  function effectiveness(atkType, defType) {
    const row = CHART[atkType] || {};
    return row[defType] != null ? row[defType] : 1;
  }

  // ---------- Mosse ----------
  const MOVES = {
    botta:       { name: 'Botta',        type: null,      power: 40, acc: 100 },
    scatto:      { name: 'Scatto',       type: null,      power: 55, acc: 95 },
    tizzone:     { name: 'Tizzone',      type: 'fuoco',   power: 40, acc: 100 },
    vampata:     { name: 'Vampata',      type: 'fuoco',   power: 70, acc: 90 },
    inferno:     { name: 'Inferno',      type: 'fuoco',   power: 95, acc: 80 },
    spruzzo:     { name: 'Spruzzo',      type: 'acqua',   power: 40, acc: 100 },
    onda:        { name: 'Onda',         type: 'acqua',   power: 70, acc: 90 },
    maremoto:    { name: 'Maremoto',     type: 'acqua',   power: 95, acc: 80 },
    fogliolama:  { name: 'Fogliolama',   type: 'erba',    power: 40, acc: 100 },
    radici:      { name: 'Radici',       type: 'erba',    power: 70, acc: 90 },
    foresta:     { name: 'Foresta',      type: 'erba',    power: 95, acc: 80 },
    scossa:      { name: 'Scossa',       type: 'elettro', power: 40, acc: 100 },
    saetta:      { name: 'Saetta',       type: 'elettro', power: 70, acc: 90 },
    tempesta:    { name: 'Tempesta',     type: 'elettro', power: 95, acc: 80 },
    sassata:     { name: 'Sassata',      type: 'roccia',  power: 40, acc: 100 },
    frana:       { name: 'Frana',        type: 'roccia',  power: 75, acc: 85 },
    ombrapugno:  { name: 'Ombrapugno',   type: 'ombra',   power: 40, acc: 100 },
    eclissi:     { name: 'Eclissi',      type: 'ombra',   power: 75, acc: 90 },
  };

  // ---------- Creature (15, originali) ----------
  // stats base: hp, atk, def, spd. evo: {to, level}
  const SPECIES = {
    fiammino: { name: 'Fiammino', type: 'fuoco',   base: [39, 52, 43, 65], evo: { to: 'braciolo', level: 12 }, stage: 1,
                learn: [[1, 'botta'], [1, 'tizzone'], [9, 'scatto'], [14, 'vampata'], [26, 'inferno']] },
    braciolo: { name: 'Braciolo', type: 'fuoco',   base: [58, 64, 58, 80], evo: { to: 'vulkarn', level: 24 }, stage: 2,
                learn: [[1, 'botta'], [1, 'tizzone'], [9, 'scatto'], [14, 'vampata'], [26, 'inferno']] },
    vulkarn:  { name: 'Vulkarn',  type: 'fuoco',   base: [78, 84, 78, 100], stage: 3,
                learn: [[1, 'tizzone'], [1, 'vampata'], [1, 'scatto'], [26, 'inferno']] },
    goccino:  { name: 'Goccino',  type: 'acqua',   base: [44, 48, 65, 43], evo: { to: 'ondaro', level: 12 }, stage: 1,
                learn: [[1, 'botta'], [1, 'spruzzo'], [9, 'scatto'], [14, 'onda'], [26, 'maremoto']] },
    ondaro:   { name: 'Ondaro',   type: 'acqua',   base: [59, 63, 80, 58], evo: { to: 'abissaro', level: 24 }, stage: 2,
                learn: [[1, 'botta'], [1, 'spruzzo'], [9, 'scatto'], [14, 'onda'], [26, 'maremoto']] },
    abissaro: { name: 'Abissaro', type: 'acqua',   base: [79, 83, 100, 78], stage: 3,
                learn: [[1, 'spruzzo'], [1, 'onda'], [1, 'scatto'], [26, 'maremoto']] },
    semino:   { name: 'Semino',   type: 'erba',    base: [45, 49, 49, 45], evo: { to: 'fogliardo', level: 12 }, stage: 1,
                learn: [[1, 'botta'], [1, 'fogliolama'], [9, 'scatto'], [14, 'radici'], [26, 'foresta']] },
    fogliardo:{ name: 'Fogliardo',type: 'erba',    base: [60, 62, 63, 60], evo: { to: 'silvatron', level: 24 }, stage: 2,
                learn: [[1, 'botta'], [1, 'fogliolama'], [9, 'scatto'], [14, 'radici'], [26, 'foresta']] },
    silvatron:{ name: 'Silvatron',type: 'erba',    base: [80, 82, 83, 80], stage: 3,
                learn: [[1, 'fogliolama'], [1, 'radici'], [1, 'scatto'], [26, 'foresta']] },
    voltino:  { name: 'Voltino',  type: 'elettro', base: [35, 55, 40, 90], evo: { to: 'fulmix', level: 16 }, stage: 1,
                learn: [[1, 'botta'], [1, 'scossa'], [8, 'scatto'], [13, 'saetta'], [22, 'tempesta']] },
    fulmix:   { name: 'Fulmix',   type: 'elettro', base: [60, 90, 55, 110], stage: 2,
                learn: [[1, 'scossa'], [1, 'saetta'], [1, 'scatto'], [22, 'tempesta']] },
    sassetto: { name: 'Sassetto', type: 'roccia',  base: [55, 70, 90, 30], evo: { to: 'granitor', level: 18 }, stage: 1,
                learn: [[1, 'botta'], [1, 'sassata'], [10, 'scatto'], [16, 'frana']] },
    granitor: { name: 'Granitor', type: 'roccia',  base: [80, 100, 120, 45], stage: 2,
                learn: [[1, 'sassata'], [1, 'scatto'], [1, 'frana']] },
    ombrino:  { name: 'Ombrino',  type: 'ombra',   base: [40, 60, 40, 80], evo: { to: 'spettrax', level: 18 }, stage: 1,
                learn: [[1, 'botta'], [1, 'ombrapugno'], [10, 'scatto'], [16, 'eclissi']] },
    spettrax: { name: 'Spettrax', type: 'ombra',   base: [65, 95, 60, 105], stage: 2,
                learn: [[1, 'ombrapugno'], [1, 'scatto'], [1, 'eclissi']] },
  };

  const STARTERS = ['fiammino', 'goccino', 'semino'];

  // Creature selvatiche per zona: [specie, livello min, livello max]
  const ZONES = {
    prato:  [['semino', 2, 5], ['voltino', 2, 5], ['sassetto', 3, 5], ['goccino', 2, 4], ['fiammino', 2, 4]],
    bosco:  [['ombrino', 5, 9], ['voltino', 5, 9], ['fogliardo', 12, 14], ['sassetto', 6, 9]],
    grotta: [['sassetto', 9, 14], ['ombrino', 9, 14], ['granitor', 18, 20], ['spettrax', 18, 20]],
    fiume:  [['goccino', 5, 9], ['voltino', 5, 9], ['semino', 5, 8], ['ondaro', 12, 14], ['fiammino', 5, 8]],
  };

  // ---------- Statistiche ----------
  function statsFor(speciesId, level) {
    const sp = SPECIES[speciesId];
    const [bhp, batk, bdef, bspd] = sp.base;
    return {
      maxhp: Math.floor((2 * bhp * level) / 100) + level + 10,
      atk: Math.floor((2 * batk * level) / 100) + 5,
      def: Math.floor((2 * bdef * level) / 100) + 5,
      spd: Math.floor((2 * bspd * level) / 100) + 5,
    };
  }

  function movesFor(speciesId, level) {
    const learned = SPECIES[speciesId].learn.filter(([l]) => l <= level).map(([, m]) => m);
    const unique = [...new Set(learned)];
    return unique.slice(-4);
  }

  function xpForLevel(level) { return Math.floor(Math.pow(level, 3) * 0.8); }

  function createMonster(speciesId, level, idSeed) {
    const st = statsFor(speciesId, level);
    return {
      uid: idSeed != null ? String(idSeed) : String(Date.now()) + Math.floor(Math.random() * 1e6),
      species: speciesId,
      name: SPECIES[speciesId].name,
      level,
      xp: xpForLevel(level),
      hp: st.maxhp,
      ...st,
      moves: movesFor(speciesId, level),
    };
  }

  function recalc(mon) {
    const st = statsFor(mon.species, mon.level);
    const lost = mon.maxhp - mon.hp;
    Object.assign(mon, st);
    mon.hp = Math.max(0, Math.min(st.maxhp, st.maxhp - lost));
    mon.name = SPECIES[mon.species].name;
    return mon;
  }

  /** Aggiunge esperienza: ritorna gli eventi (livello, nuove mosse, evoluzione). */
  function gainXp(mon, amount) {
    const events = [];
    mon.xp += amount;
    while (mon.level < 50 && mon.xp >= xpForLevel(mon.level + 1)) {
      mon.level += 1;
      const before = mon.moves.slice();
      recalc(mon);
      mon.hp = Math.min(mon.maxhp, mon.hp + 5);
      events.push({ kind: 'level', level: mon.level });
      const sp = SPECIES[mon.species];
      if (sp.evo && mon.level >= sp.evo.level) {
        const from = sp.name;
        mon.species = sp.evo.to;
        recalc(mon);
        events.push({ kind: 'evolve', from, to: SPECIES[mon.species].name });
      }
      const now = movesFor(mon.species, mon.level);
      const added = now.filter((m) => !before.includes(m));
      mon.moves = now;
      added.forEach((m) => events.push({ kind: 'move', move: MOVES[m].name }));
    }
    return events;
  }

  function xpReward(defeated) {
    const sp = SPECIES[defeated.species];
    return Math.floor((40 + 20 * sp.stage) * defeated.level / 5);
  }

  // ---------- Danno ----------
  function damage(attacker, defender, moveId, rng) {
    const mv = MOVES[moveId];
    const atkType = SPECIES[attacker.species].type;
    const defType = SPECIES[defender.species].type;
    if (rng() * 100 >= mv.acc) return { hit: false, dmg: 0, eff: 1, crit: false };
    const type = mv.type || null;
    const eff = type ? effectiveness(type, defType) : 1;
    const stab = type && type === atkType ? 1.5 : 1;
    const crit = rng() < 1 / 16;
    const roll = 0.85 + rng() * 0.15;
    const base = Math.floor(Math.floor((2 * attacker.level) / 5 + 2) * mv.power * attacker.atk / defender.def / 50) + 2;
    const dmg = Math.max(1, Math.floor(base * stab * eff * roll * (crit ? 1.5 : 1)));
    return { hit: true, dmg, eff, crit };
  }

  /** Probabilità di cattura (0..1): più la creatura è ferita, più è facile. */
  function catchChance(mon) {
    const sp = SPECIES[mon.species];
    const hpRatio = mon.hp / mon.maxhp;
    const rarity = sp.stage === 1 ? 1 : sp.stage === 2 ? 0.6 : 0.35;
    return Math.max(0.05, Math.min(0.95, (1 - hpRatio * 0.85) * rarity + 0.05));
  }

  // ---------- Lotta (deterministica) ----------
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /**
   * Crea lo stato di una lotta.
   * sides: [{name, team:[mon...]}, {name, team:[...]}]
   */
  function createBattle(seed, sides) {
    return {
      seed: seed >>> 0,
      rngState: seed >>> 0,
      turn: 0,
      sides: sides.map((s) => ({ name: s.name, team: clone(s.team), active: firstAlive(s.team) })),
      log: [],
      winner: null,
    };
  }

  function firstAlive(team) {
    const i = team.findIndex((m) => m.hp > 0);
    return i < 0 ? 0 : i;
  }

  function activeMon(side) { return side.team[side.active]; }

  /**
   * Risolve un turno. actions: [azione lato 0, azione lato 1]
   * azione = {kind:'move', move:'tizzone'} | {kind:'switch', to:2} | {kind:'none'}
   * Ritorna gli eventi del turno (anche aggiunti a state.log).
   */
  function resolveTurn(state, actions) {
    if (state.winner != null) return [];
    const rng = makeRng(state.rngState);
    const events = [];
    state.turn += 1;
    events.push({ t: 'turn', n: state.turn });

    // 1) cambi di creatura prima di tutto
    [0, 1].forEach((i) => {
      const a = actions[i];
      if (a && a.kind === 'switch') {
        const side = state.sides[i];
        if (side.team[a.to] && side.team[a.to].hp > 0 && a.to !== side.active) {
          side.active = a.to;
          events.push({ t: 'switch', side: i, to: a.to, name: activeMon(side).name });
        }
      }
    });

    // 2) ordine delle mosse: velocità, a parità decide il caso
    const movers = [0, 1].filter((i) => actions[i] && actions[i].kind === 'move');
    movers.sort((x, y) => {
      const sx = activeMon(state.sides[x]).spd, sy = activeMon(state.sides[y]).spd;
      if (sx !== sy) return sy - sx;
      return 0;
    });
    if (movers.length === 2 && activeMon(state.sides[0]).spd === activeMon(state.sides[1]).spd && rng() < 0.5) {
      movers.reverse();
    }

    for (const i of movers) {
      const side = state.sides[i], foe = state.sides[1 - i];
      const me = activeMon(side), them = activeMon(foe);
      if (me.hp <= 0 || them.hp <= 0) continue;
      let moveId = actions[i].move;
      if (!me.moves.includes(moveId)) moveId = me.moves[0];
      const r = damage(me, them, moveId, rng);
      events.push({ t: 'move', side: i, name: me.name, move: MOVES[moveId].name });
      if (!r.hit) { events.push({ t: 'miss', side: i }); continue; }
      them.hp = Math.max(0, them.hp - r.dmg);
      events.push({ t: 'hit', side: 1 - i, dmg: r.dmg, eff: r.eff, crit: r.crit, hp: them.hp, maxhp: them.maxhp });
      if (them.hp <= 0) {
        events.push({ t: 'faint', side: 1 - i, name: them.name });
      }
    }

    // 3) creature esauste: entra la prossima disponibile, oppure fine lotta
    [0, 1].forEach((i) => {
      const side = state.sides[i];
      if (activeMon(side).hp <= 0) {
        const next = side.team.findIndex((m) => m.hp > 0);
        if (next >= 0) {
          side.active = next;
          events.push({ t: 'switch', side: i, to: next, name: activeMon(side).name, forced: true });
        }
      }
    });
    const out = [0, 1].map((i) => state.sides[i].team.every((m) => m.hp <= 0));
    if (out[0] || out[1]) {
      state.winner = out[0] && out[1] ? -1 : out[0] ? 1 : 0;
      events.push({ t: 'end', winner: state.winner });
    }

    state.rngState = rng.state();
    state.log.push(...events);
    return events;
  }

  /** Scelta dell'avversario controllato dal telefono: mossa che fa più danno atteso. */
  function aiChoose(state, sideIndex, rngSeed) {
    const me = activeMon(state.sides[sideIndex]);
    const them = activeMon(state.sides[1 - sideIndex]);
    const defType = SPECIES[them.species].type;
    const atkType = SPECIES[me.species].type;
    let best = me.moves[0], bestScore = -1;
    const rng = makeRng(rngSeed >>> 0);
    for (const m of me.moves) {
      const mv = MOVES[m];
      const eff = mv.type ? effectiveness(mv.type, defType) : 1;
      const stab = mv.type && mv.type === atkType ? 1.5 : 1;
      const score = mv.power * eff * stab * (mv.acc / 100) * (0.9 + rng() * 0.2);
      if (score > bestScore) { bestScore = score; best = m; }
    }
    return { kind: 'move', move: best };
  }

  /** Versione compatta della squadra da mandare al server (niente dati inutili). */
  function teamSnapshot(team) {
    // creature a vita piena, con le statistiche ricalcolate dal livello
    return team.slice(0, 6).map((m) => {
      const fresh = createMonster(m.species, m.level, m.uid);
      fresh.moves = m.moves.slice(0, 4);
      return fresh;
    });
  }

  /** Controlla che una squadra ricevuta sia valida (anti-imbroglio). */
  function validateTeam(team) {
    if (!Array.isArray(team) || team.length < 1 || team.length > 6) return 'La squadra deve avere da 1 a 6 creature.';
    for (const m of team) {
      if (!SPECIES[m.species]) return 'Creatura sconosciuta.';
      if (!(m.level >= 1 && m.level <= 50)) return 'Livello non valido.';
      const allowed = new Set(SPECIES[m.species].learn.filter(([l]) => l <= m.level).map(([, mv]) => mv));
      if (!Array.isArray(m.moves) || m.moves.length < 1 || m.moves.length > 4 || m.moves.some((mv) => !allowed.has(mv))) {
        return 'Mosse non valide per ' + SPECIES[m.species].name + '.';
      }
      const st = statsFor(m.species, m.level);
      if (m.maxhp !== st.maxhp || m.atk !== st.atk || m.def !== st.def || m.spd !== st.spd) {
        return 'Statistiche modificate per ' + SPECIES[m.species].name + '.';
      }
    }
    return null;
  }

  return {
    TYPES, CHART, MOVES, SPECIES, STARTERS, ZONES,
    makeRng, hashString, effectiveness, statsFor, movesFor, xpForLevel,
    createMonster, recalc, gainXp, xpReward, damage, catchChance,
    createBattle, resolveTurn, aiChoose, activeMon, teamSnapshot, validateTeam, clone,
  };
});
