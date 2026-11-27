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
    // mosse con effetti di stato e mosse veloci (priorità)
    fiammella:   { name: 'Fiammella',    type: 'fuoco',   power: 55, acc: 95,  effect: { status: 'brn', chance: 20 } },
    ustione:     { name: 'Ustione',      type: 'fuoco',   power: 0,  acc: 85,  effect: { status: 'brn', chance: 100 } },
    corrente:    { name: 'Corrente',     type: 'elettro', power: 55, acc: 95,  effect: { status: 'par', chance: 25 } },
    ronzio:      { name: 'Ronzio',       type: 'elettro', power: 0,  acc: 90,  effect: { status: 'par', chance: 100 } },
    lampo:       { name: 'Lampo',        type: 'elettro', power: 40, acc: 100, priority: 1 },
    spine:       { name: 'Spine',        type: 'erba',    power: 50, acc: 100, effect: { status: 'psn', chance: 25 } },
    polline:     { name: 'Polline',      type: 'erba',    power: 0,  acc: 75,  effect: { status: 'slp', chance: 100 } },
    ninnananna:  { name: 'Ninnananna',   type: 'ombra',   power: 0,  acc: 70,  effect: { status: 'slp', chance: 100 } },
    fiele:       { name: 'Fiele',        type: 'ombra',   power: 55, acc: 95,  effect: { status: 'psn', chance: 30 } },
    getto:       { name: 'Getto Rapido', type: 'acqua',   power: 40, acc: 100, priority: 1 },
    guizzo:      { name: 'Guizzo',       type: null,      power: 40, acc: 100, priority: 1 },
    scheggia:    { name: 'Scheggia',     type: 'roccia',  power: 40, acc: 100, priority: 1 },
  };

  // ---------- Stati alterati, caratteri, rarità ----------
  const STATUS_NAMES = { brn: 'Bruciatura', par: 'Paralisi', slp: 'Sonno', psn: 'Veleno' };
  // un tipo non subisce lo "suo" stato: il fuoco non si brucia, l'elettro non si paralizza
  const STATUS_IMMUNE = { brn: 'fuoco', par: 'elettro' };
  const SHINY_RATE = 1 / 512;
  // +10% a una statistica, -10% a un'altra (atk, def, spd); i neutri non cambiano nulla
  const NATURES = {
    docile:     { name: 'Docile',     up: null,  down: null },
    serio:      { name: 'Serio',      up: null,  down: null },
    tranquillo: { name: 'Tranquillo', up: null,  down: null },
    allegro:    { name: 'Allegro',    up: null,  down: null },
    audace:     { name: 'Audace',     up: 'atk', down: 'spd' },
    tenace:     { name: 'Tenace',     up: 'atk', down: 'def' },
    calmo:      { name: 'Calmo',      up: 'def', down: 'atk' },
    prudente:   { name: 'Prudente',   up: 'def', down: 'spd' },
    svelto:     { name: 'Svelto',     up: 'spd', down: 'def' },
    vivace:     { name: 'Vivace',     up: 'spd', down: 'atk' },
  };
  const NATURE_IDS = Object.keys(NATURES);
  const DEFAULT_TALENTS = [8, 8, 8, 8];
  const DEFAULT_NATURE = 'docile';

  // ---------- Creature (15, originali) ----------
  // stats base: hp, atk, def, spd. evo: {to, level}
  const SPECIES = {
    fiammino: { name: 'Fiammino', type: 'fuoco',   base: [39, 52, 43, 65], evo: { to: 'braciolo', level: 12 }, stage: 1,
                learn: [[1, 'botta'], [1, 'tizzone'], [5, 'guizzo'], [7, 'fiammella'], [9, 'scatto'], [14, 'vampata'], [18, 'ustione'], [26, 'inferno']] },
    braciolo: { name: 'Braciolo', type: 'fuoco',   base: [58, 64, 58, 80], evo: { to: 'vulkarn', level: 24 }, stage: 2,
                learn: [[1, 'botta'], [1, 'tizzone'], [5, 'guizzo'], [7, 'fiammella'], [9, 'scatto'], [14, 'vampata'], [18, 'ustione'], [26, 'inferno']] },
    vulkarn:  { name: 'Vulkarn',  type: 'fuoco',   base: [78, 84, 78, 100], stage: 3,
                learn: [[1, 'tizzone'], [1, 'fiammella'], [1, 'vampata'], [1, 'scatto'], [18, 'ustione'], [26, 'inferno']] },
    goccino:  { name: 'Goccino',  type: 'acqua',   base: [44, 48, 65, 43], evo: { to: 'ondaro', level: 12 }, stage: 1,
                learn: [[1, 'botta'], [1, 'spruzzo'], [7, 'getto'], [9, 'scatto'], [14, 'onda'], [26, 'maremoto']] },
    ondaro:   { name: 'Ondaro',   type: 'acqua',   base: [59, 63, 80, 58], evo: { to: 'abissaro', level: 24 }, stage: 2,
                learn: [[1, 'botta'], [1, 'spruzzo'], [7, 'getto'], [9, 'scatto'], [14, 'onda'], [26, 'maremoto']] },
    abissaro: { name: 'Abissaro', type: 'acqua',   base: [79, 83, 100, 78], stage: 3,
                learn: [[1, 'spruzzo'], [1, 'getto'], [1, 'onda'], [1, 'scatto'], [26, 'maremoto']] },
    semino:   { name: 'Semino',   type: 'erba',    base: [45, 49, 49, 45], evo: { to: 'fogliardo', level: 12 }, stage: 1,
                learn: [[1, 'botta'], [1, 'fogliolama'], [7, 'spine'], [9, 'scatto'], [11, 'polline'], [14, 'radici'], [26, 'foresta']] },
    fogliardo:{ name: 'Fogliardo',type: 'erba',    base: [60, 62, 63, 60], evo: { to: 'silvatron', level: 24 }, stage: 2,
                learn: [[1, 'botta'], [1, 'fogliolama'], [7, 'spine'], [9, 'scatto'], [11, 'polline'], [14, 'radici'], [26, 'foresta']] },
    silvatron:{ name: 'Silvatron',type: 'erba',    base: [80, 82, 83, 80], stage: 3,
                learn: [[1, 'fogliolama'], [1, 'spine'], [1, 'radici'], [1, 'polline'], [26, 'foresta']] },
    voltino:  { name: 'Voltino',  type: 'elettro', base: [35, 55, 40, 90], evo: { to: 'fulmix', level: 16 }, stage: 1,
                learn: [[1, 'botta'], [1, 'scossa'], [4, 'lampo'], [6, 'ronzio'], [8, 'scatto'], [10, 'corrente'], [13, 'saetta'], [22, 'tempesta']] },
    fulmix:   { name: 'Fulmix',   type: 'elettro', base: [60, 90, 55, 110], stage: 2,
                learn: [[1, 'scossa'], [1, 'lampo'], [1, 'ronzio'], [1, 'corrente'], [1, 'saetta'], [22, 'tempesta']] },
    sassetto: { name: 'Sassetto', type: 'roccia',  base: [55, 70, 90, 30], evo: { to: 'granitor', level: 18 }, stage: 1,
                learn: [[1, 'botta'], [1, 'sassata'], [5, 'scheggia'], [10, 'scatto'], [16, 'frana']] },
    granitor: { name: 'Granitor', type: 'roccia',  base: [80, 100, 120, 45], stage: 2,
                learn: [[1, 'sassata'], [1, 'scheggia'], [1, 'scatto'], [1, 'frana']] },
    ombrino:  { name: 'Ombrino',  type: 'ombra',   base: [40, 60, 40, 80], evo: { to: 'spettrax', level: 18 }, stage: 1,
                learn: [[1, 'botta'], [1, 'ombrapugno'], [7, 'ninnananna'], [10, 'scatto'], [12, 'fiele'], [16, 'eclissi']] },
    spettrax: { name: 'Spettrax', type: 'ombra',   base: [65, 95, 60, 105], stage: 2,
                learn: [[1, 'ombrapugno'], [1, 'ninnananna'], [1, 'fiele'], [1, 'scatto'], [1, 'eclissi']] },
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
  /**
   * Statistiche dal livello, dai talenti (0..15, 8 = medio) e dal carattere.
   * Con talenti 8 e carattere neutro il risultato è identico alla prima versione
   * del gioco: le creature dei salvataggi vecchi non cambiano.
   */
  function statsFor(speciesId, level, talents, nature) {
    const sp = SPECIES[speciesId];
    const [bhp, batk, bdef, bspd] = sp.base;
    const t = validTalents(talents) ? talents : DEFAULT_TALENTS;
    const nat = NATURES[nature] || NATURES[DEFAULT_NATURE];
    const raw = (b, i) => Math.floor(((2 * b + 2 * (t[i] - 8)) * level) / 100);
    const mul = (stat, v) => (nat.up === stat ? Math.floor(v * 1.1) : nat.down === stat ? Math.floor(v * 0.9) : v);
    return {
      maxhp: raw(bhp, 0) + level + 10,
      atk: mul('atk', raw(batk, 1) + 5),
      def: mul('def', raw(bdef, 2) + 5),
      spd: mul('spd', raw(bspd, 3) + 5),
    };
  }
  function validTalents(t) { return Array.isArray(t) && t.length === 4 && t.every((v) => Number.isInteger(v) && v >= 0 && v <= 15); }

  function movesFor(speciesId, level) {
    const learned = SPECIES[speciesId].learn.filter(([l]) => l <= level).map(([, m]) => m);
    const unique = [...new Set(learned)];
    return unique.slice(-4);
  }

  function xpForLevel(level) { return Math.floor(Math.pow(level, 3) * 0.8); }

  /**
   * Nuova creatura. opts facoltativo: { shiny, talents, nature, rng }.
   * Senza opts: rara (shiny) 1 volta su 512, talenti e carattere a caso.
   */
  function createMonster(speciesId, level, idSeed, opts) {
    opts = opts || {};
    const rand = typeof opts.rng === 'function' ? opts.rng : Math.random;
    const shiny = typeof opts.shiny === 'boolean' ? opts.shiny : rand() < SHINY_RATE;
    const talents = validTalents(opts.talents) ? opts.talents.slice() : [0, 0, 0, 0].map(() => Math.floor(rand() * 16));
    const nature = NATURES[opts.nature] ? opts.nature : NATURE_IDS[Math.floor(rand() * NATURE_IDS.length)];
    const st = statsFor(speciesId, level, talents, nature);
    return {
      uid: idSeed != null ? String(idSeed) : String(Date.now()) + Math.floor(Math.random() * 1e6),
      species: speciesId,
      name: SPECIES[speciesId].name,
      level,
      xp: xpForLevel(level),
      hp: st.maxhp,
      ...st,
      moves: movesFor(speciesId, level),
      shiny, talents, nature, status: null,
    };
  }

  function recalc(mon) {
    const st = statsFor(mon.species, mon.level, mon.talents, mon.nature);
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
    if (!mv.power) return { hit: true, dmg: 0, eff: 1, crit: false, statusOnly: true };
    const type = mv.type || null;
    const eff = type ? effectiveness(type, defType) : 1;
    const stab = type && type === atkType ? 1.5 : 1;
    const crit = rng() < 1 / 16;
    const roll = 0.85 + rng() * 0.15;
    // la bruciatura dimezza l'attacco
    const atk = attacker.status === 'brn' ? attacker.atk * 0.5 : attacker.atk;
    const base = Math.floor(Math.floor((2 * attacker.level) / 5 + 2) * mv.power * atk / defender.def / 50) + 2;
    const dmg = Math.max(1, Math.floor(base * stab * eff * roll * (crit ? 1.5 : 1)));
    return { hit: true, dmg, eff, crit };
  }

  /** Probabilità di cattura (0..1): più la creatura è ferita, più è facile. */
  function catchChance(mon) {
    const sp = SPECIES[mon.species];
    const hpRatio = mon.hp / mon.maxhp;
    const rarity = sp.stage === 1 ? 1 : sp.stage === 2 ? 0.6 : 0.35;
    const st = mon.status === 'slp' ? 2 : mon.status ? 1.5 : 1;
    return Math.max(0.05, Math.min(0.95, ((1 - hpRatio * 0.85) * rarity + 0.05) * st));
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

    // 2) ordine delle mosse: prima la priorità, poi la velocità (paralisi = metà), a parità decide il caso
    const movers = [0, 1].filter((i) => actions[i] && actions[i].kind === 'move');
    const chosen = (i) => { const me = activeMon(state.sides[i]); return me.moves.includes(actions[i].move) ? actions[i].move : me.moves[0]; };
    const prio = (i) => MOVES[chosen(i)].priority || 0;
    movers.sort((x, y) => {
      if (prio(x) !== prio(y)) return prio(y) - prio(x);
      return effSpeed(activeMon(state.sides[y])) - effSpeed(activeMon(state.sides[x]));
    });
    if (movers.length === 2 && prio(0) === prio(1) && effSpeed(activeMon(state.sides[0])) === effSpeed(activeMon(state.sides[1])) && rng() < 0.5) {
      movers.reverse();
    }

    for (const i of movers) {
      const side = state.sides[i], foe = state.sides[1 - i];
      const me = activeMon(side), them = activeMon(foe);
      if (me.hp <= 0 || them.hp <= 0) continue;
      // sonno e paralisi possono impedire di muoversi
      if (me.status === 'slp') {
        if ((me.slpT || 0) > 0) { me.slpT -= 1; events.push({ t: 'cant', side: i, reason: 'slp', name: me.name }); continue; }
        me.status = null; delete me.slpT;
        events.push({ t: 'wake', side: i, name: me.name });
      }
      if (me.status === 'par' && rng() < 0.25) { events.push({ t: 'cant', side: i, reason: 'par', name: me.name }); continue; }
      const moveId = chosen(i);
      const mv = MOVES[moveId];
      const r = damage(me, them, moveId, rng);
      events.push({ t: 'move', side: i, name: me.name, move: mv.name });
      if (!r.hit) { events.push({ t: 'miss', side: i }); continue; }
      if (r.statusOnly) {
        // mossa di stato: fallisce se il bersaglio ha già uno stato o ne è immune
        if (!inflict(them, mv.effect.status, rng, events, 1 - i)) events.push({ t: 'miss', side: i });
        continue;
      }
      them.hp = Math.max(0, them.hp - r.dmg);
      events.push({ t: 'hit', side: 1 - i, dmg: r.dmg, eff: r.eff, crit: r.crit, hp: them.hp, maxhp: them.maxhp });
      if (them.hp <= 0) {
        events.push({ t: 'faint', side: 1 - i, name: them.name });
      } else if (mv.effect && rng() * 100 < mv.effect.chance) {
        inflict(them, mv.effect.status, rng, events, 1 - i);
      }
    }

    // 2b) fine turno: bruciatura e veleno tolgono vita
    [0, 1].forEach((i) => {
      const mon = activeMon(state.sides[i]);
      if (mon.hp <= 0 || (mon.status !== 'brn' && mon.status !== 'psn')) return;
      const dmg = Math.max(1, Math.floor(mon.maxhp / (mon.status === 'brn' ? 16 : 8)));
      mon.hp = Math.max(0, mon.hp - dmg);
      events.push({ t: 'statusDmg', side: i, status: mon.status, hp: mon.hp, maxhp: mon.maxhp });
      if (mon.hp <= 0) events.push({ t: 'faint', side: i, name: mon.name });
    });

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

  function effSpeed(mon) { return mon.status === 'par' ? Math.floor(mon.spd / 2) : mon.spd; }

  /** Infligge uno stato se possibile. Ritorna true se è riuscito. */
  function inflict(mon, status, rng, events, side) {
    if (!status || mon.hp <= 0 || mon.status) return false;
    if (STATUS_IMMUNE[status] && SPECIES[mon.species].type === STATUS_IMMUNE[status]) return false;
    mon.status = status;
    if (status === 'slp') mon.slpT = 1 + Math.floor(rng() * 3);   // dorme da 1 a 3 turni
    events.push({ t: 'status', side, status, name: mon.name });
    return true;
  }
  function canInflict(mon, status) {
    return !!status && !mon.status && !(STATUS_IMMUNE[status] && SPECIES[mon.species].type === STATUS_IMMUNE[status]);
  }

  /** Danno medio atteso di una mossa (senza caso): serve all'IA. */
  function expectedDamage(attacker, defender, moveId) {
    const mv = MOVES[moveId];
    if (!mv.power) return 0;
    const atkType = SPECIES[attacker.species].type, defType = SPECIES[defender.species].type;
    const eff = mv.type ? effectiveness(mv.type, defType) : 1;
    const stab = mv.type && mv.type === atkType ? 1.5 : 1;
    const atk = attacker.status === 'brn' ? attacker.atk * 0.5 : attacker.atk;
    const base = Math.floor(Math.floor((2 * attacker.level) / 5 + 2) * mv.power * atk / defender.def / 50) + 2;
    return base * stab * eff * 0.925 * (1 + 0.5 / 16) * (mv.acc / 100);
  }
  function bestDamage(attacker, defender) {
    return Math.max(0, ...attacker.moves.map((m) => expectedDamage(attacker, defender, m)));
  }

  /**
   * Scelta dell'avversario controllato dal telefono.
   * level: 'facile' (mosse a caso), 'normale' (la più forte sul tipo), 'esperto'
   * (danno atteso vero, colpo di grazia sicuro, mosse di stato quando conviene, cambi).
   */
  function aiChoose(state, sideIndex, rngSeed, level) {
    level = level || 'normale';
    const mySide = state.sides[sideIndex];
    const me = activeMon(mySide);
    const them = activeMon(state.sides[1 - sideIndex]);
    const defType = SPECIES[them.species].type;
    const atkType = SPECIES[me.species].type;
    const rng = makeRng(rngSeed >>> 0);
    if (level === 'facile') return { kind: 'move', move: me.moves[Math.floor(rng() * me.moves.length)] };
    if (level !== 'esperto') {
      let best = me.moves[0], bestScore = -1;
      for (const m of me.moves) {
        const mv = MOVES[m];
        const eff = mv.type ? effectiveness(mv.type, defType) : 1;
        const stab = mv.type && mv.type === atkType ? 1.5 : 1;
        let score = mv.power * eff * stab * (mv.acc / 100) * (0.9 + rng() * 0.2);
        if (!mv.power) score = canInflict(them, mv.effect && mv.effect.status) && them.hp / them.maxhp > 0.6 ? 38 * (mv.acc / 100) : 0;
        if (score > bestScore) { bestScore = score; best = m; }
      }
      return { kind: 'move', move: best };
    }
    // ----- esperto -----
    // 1) cambio se la creatura in campo è molto svantaggiata e c'è di meglio in panchina
    const threat = bestDamage(them, me) / Math.max(1, me.hp);
    const myBest = bestDamage(me, them) / Math.max(1, them.hp);
    if (threat >= 0.9 && myBest < 0.5 && me.hp / me.maxhp > 0.35) {
      let pick = -1, pickScore = myBest - threat;
      mySide.team.forEach((m, i) => {
        if (i === mySide.active || m.hp <= 0) return;
        const sc = bestDamage(m, them) / Math.max(1, them.hp) - bestDamage(them, m) / Math.max(1, m.hp);
        if (sc > pickScore + 0.35) { pickScore = sc; pick = i; }
      });
      if (pick >= 0) return { kind: 'switch', to: pick };
    }
    // 2) colpo di grazia: tra le mosse che lo mettono KO scegli la più precisa (priorità se serve)
    const iAmFaster = effSpeed(me) >= effSpeed(them);
    let best = null, bestScore = -1;
    for (const m of me.moves) {
      const mv = MOVES[m];
      const exp = expectedDamage(me, them, m);
      const raw = exp / (mv.acc / 100);
      let score;
      if (mv.power && raw * 0.85 >= them.hp) score = 1000 + mv.acc + ((mv.priority || 0) > 0 && !iAmFaster ? 50 : 0);
      else if (!mv.power) {
        const st = mv.effect && mv.effect.status;
        if (!canInflict(them, st) || them.hp / them.maxhp < 0.5) score = 0;
        else {
          const k = st === 'slp' ? 1.7 : st === 'par' ? (iAmFaster ? 0.7 : 1.3) : st === 'brn' ? (them.atk >= them.def ? 1.3 : 0.9) : 1.0;
          score = bestDamage(me, them) * k * (mv.acc / 100);
        }
      } else {
        score = exp;
        if (mv.effect && canInflict(them, mv.effect.status)) score *= 1 + mv.effect.chance / 250;
      }
      score *= 0.97 + rng() * 0.06;
      if (score > bestScore) { bestScore = score; best = m; }
    }
    return { kind: 'move', move: best || me.moves[0] };
  }

  /** Versione compatta della squadra da mandare al server (niente dati inutili). */
  function teamSnapshot(team) {
    // creature a vita piena, con le statistiche ricalcolate dal livello
    return team.slice(0, 6).map((m) => {
      const fresh = createMonster(m.species, m.level, m.uid, {
        shiny: m.shiny === true,
        talents: validTalents(m.talents) ? m.talents : DEFAULT_TALENTS,
        nature: NATURES[m.nature] ? m.nature : DEFAULT_NATURE,
      });
      fresh.moves = m.moves.slice(0, 4);
      fresh.status = null;               // in sfida si parte sempre sani
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
      if (m.talents != null && !validTalents(m.talents)) return 'Talenti non validi per ' + SPECIES[m.species].name + '.';
      if (m.nature != null && !NATURES[m.nature]) return 'Carattere sconosciuto per ' + SPECIES[m.species].name + '.';
      if (m.shiny != null && typeof m.shiny !== 'boolean') return 'Dato "rara" non valido.';
      const st = statsFor(m.species, m.level, m.talents, m.nature);
      if (m.maxhp !== st.maxhp || m.atk !== st.atk || m.def !== st.def || m.spd !== st.spd) {
        return 'Statistiche modificate per ' + SPECIES[m.species].name + '.';
      }
    }
    return null;
  }

  return {
    TYPES, CHART, MOVES, SPECIES, STARTERS, ZONES, NATURES, STATUS_NAMES, SHINY_RATE,
    makeRng, hashString, effectiveness, statsFor, movesFor, xpForLevel,
    createMonster, recalc, gainXp, xpReward, damage, catchChance,
    createBattle, resolveTurn, aiChoose, activeMon, teamSnapshot, validateTeam, clone, expectedDamage,
  };
});
