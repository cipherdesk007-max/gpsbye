// Test del motore: node tests/test-engine.js
const E = require('../game/engine.js');
let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) pass++; else fail++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  [' + detail + ']' : '')); }

// Dati
const ids = Object.keys(E.SPECIES);
check('15 creature originali', ids.length === 15, ids.length);
check('Ogni evoluzione porta a una creatura esistente', ids.every((id) => !E.SPECIES[id].evo || E.SPECIES[E.SPECIES[id].evo.to]));
check('Ogni mossa imparabile esiste', ids.every((id) => E.SPECIES[id].learn.every(([, m]) => E.MOVES[m])));
check('Ogni tipo ha colore', Object.values(E.TYPES).every((t) => /^#/.test(t.color)));
check('Tutte le zone usano creature esistenti', Object.values(E.ZONES).every((z) => z.every(([s]) => E.SPECIES[s])));

// Tipi
check('Fuoco batte Erba (x2)', E.effectiveness('fuoco', 'erba') === 2);
check('Acqua batte Fuoco (x2)', E.effectiveness('acqua', 'fuoco') === 2);
check('Erba batte Acqua (x2)', E.effectiveness('erba', 'acqua') === 2);
check('Fuoco contro Acqua poco efficace (x0.5)', E.effectiveness('fuoco', 'acqua') === 0.5);
check('Neutro = 1', E.effectiveness('elettro', 'fuoco') === 1);

// Creature e crescita
const f5 = E.createMonster('fiammino', 5, 'a');
check('Creatura a vita piena', f5.hp === f5.maxhp && f5.maxhp > 0, f5.maxhp);
check('Massimo 4 mosse', E.movesFor('fiammino', 50).length <= 4);
const m = E.createMonster('fiammino', 11, 'b');
const ev = E.gainXp(m, E.xpForLevel(13) - m.xp);
check('Sale di livello con l\'esperienza', m.level === 13, m.level);
check('Si evolve al livello 12 (Fiammino → Braciolo)', m.species === 'braciolo' && ev.some((e) => e.kind === 'evolve'), m.species);
check('Impara Vampata al 14? no, ancora livello 13', !m.moves.includes('vampata'));
E.gainXp(m, E.xpForLevel(14) - m.xp);
check('Impara Vampata al livello 14', m.moves.includes('vampata'), m.moves.join(','));

// Danno
const rng = E.makeRng(42);
const fire = E.createMonster('fiammino', 10, 'c'), grass = E.createMonster('semino', 10, 'd'), water = E.createMonster('goccino', 10, 'e');
let dGrass = 0, dWater = 0;
for (let i = 0; i < 200; i++) { dGrass += E.damage(fire, grass, 'tizzone', rng).dmg; dWater += E.damage(fire, water, 'tizzone', rng).dmg; }
check('Tizzone fa molto più danno a Erba che ad Acqua', dGrass > dWater * 2.5, dGrass + ' vs ' + dWater);

// Cattura
const wild = E.createMonster('semino', 4, 'w');
const full = E.catchChance(wild); wild.hp = 1; const low = E.catchChance(wild);
check('Cattura più facile con poca vita', low > full, full.toFixed(2) + ' → ' + low.toFixed(2));
check('Probabilità sempre tra 5% e 95%', full >= 0.05 && low <= 0.95);

// Determinismo (fondamentale per le sfide online)
// le squadre arrivano dal server già fissate (talenti, carattere): i due telefoni hanno le stesse
const TEAM_A = [E.createMonster('fiammino', 15, 'p1a'), E.createMonster('voltino', 14, 'p1b')];
const TEAM_B = [E.createMonster('goccino', 15, 'p2a'), E.createMonster('sassetto', 14, 'p2b')];
function playMatch(seed) {
  const a = E.clone(TEAM_A), b = E.clone(TEAM_B);
  const st = E.createBattle(seed, [{ name: 'Fra', team: a }, { name: 'Amico', team: b }]);
  let guard = 0;
  while (st.winner == null && guard++ < 200) {
    const acts = [E.aiChoose(st, 0, st.turn * 7 + 1), E.aiChoose(st, 1, st.turn * 7 + 2)];
    E.resolveTurn(st, acts);
  }
  return st;
}
const s1 = playMatch(12345), s2 = playMatch(12345), s3 = playMatch(999);
check('Stesso seme + stesse scelte = stessa lotta su due telefoni', JSON.stringify(s1) === JSON.stringify(s2));
check('Seme diverso = lotta diversa', JSON.stringify(s1.log) !== JSON.stringify(s3.log));
check('La lotta finisce con un vincitore', s1.winner === 0 || s1.winner === 1, 'vince lato ' + s1.winner + ' in ' + s1.turn + ' turni');
check('Le creature esauste vengono sostituite', s1.log.some((e) => e.t === 'switch' && e.forced));

// Cambio volontario
const st = E.createBattle(1, [{ name: 'A', team: [E.createMonster('fiammino', 10, 'x'), E.createMonster('goccino', 10, 'y')] },
                              { name: 'B', team: [E.createMonster('semino', 10, 'z')] }]);
E.resolveTurn(st, [{ kind: 'switch', to: 1 }, { kind: 'move', move: 'fogliolama' }]);
check('Il cambio avviene prima delle mosse', st.sides[0].active === 1 && st.log.findIndex((e) => e.t === 'switch') < st.log.findIndex((e) => e.t === 'move'));

// Anti-imbroglio
const good = E.teamSnapshot([E.createMonster('fiammino', 15, 'q')]);
check('Squadra valida accettata', E.validateTeam(good) === null, E.validateTeam(good));
const cheat = E.clone(good); cheat[0].atk = 999;
check('Statistiche gonfiate rifiutate', E.validateTeam(cheat) !== null, E.validateTeam(cheat));
const cheat2 = E.clone(good); cheat2[0].moves = ['inferno'];
check('Mossa non ancora imparata rifiutata', E.validateTeam(cheat2) !== null, E.validateTeam(cheat2));
const cheat3 = E.clone(good); cheat3[0].species = 'pikachu';
check('Creatura inesistente rifiutata', E.validateTeam(cheat3) !== null);
check('Più di 6 creature rifiutate', E.validateTeam(new Array(7).fill(good[0])) !== null);


// ---------- Regole avanzate: rare, talenti, caratteri, stati, IA ----------
const fixed = (sp, lv, o) => E.createMonster(sp, lv, 'x', Object.assign({ shiny: false, talents: [8, 8, 8, 8], nature: 'docile' }, o || {}));
let shinyN = 0; const N = 20000, rr = E.makeRng(77);
for (let i = 0; i < N; i++) if (E.createMonster('semino', 5, 'u' + i, { rng: rr }).shiny) shinyN++;
check('Rare (shiny) circa 1 su 512', shinyN / N > 1 / 650 && shinyN / N < 1 / 400, shinyN + ' su ' + N);
check('Creature nuove con talenti e carattere validi', (() => { const m = E.createMonster('voltino', 9); return m.talents.length === 4 && m.talents.every((t) => t >= 0 && t <= 15) && !!E.NATURES[m.nature] && m.status === null && typeof m.shiny === 'boolean'; })());
check('Almeno 10 caratteri con nome', Object.keys(E.NATURES).length >= 10 && Object.values(E.NATURES).every((n) => n.name));
const lo = fixed('fiammino', 40, { talents: [0, 0, 0, 0] }), hi = fixed('fiammino', 40, { talents: [15, 15, 15, 15] });
check('Talenti alti = statistiche più alte', hi.maxhp > lo.maxhp && hi.atk > lo.atk && hi.def > lo.def && hi.spd > lo.spd, lo.atk + ' → ' + hi.atk);
const aud = fixed('fiammino', 40, { nature: 'audace' }), neu = fixed('fiammino', 40);
check('Carattere Audace: +attacco, -velocità', aud.atk > neu.atk && aud.spd < neu.spd && aud.def === neu.def, `${neu.atk}/${neu.spd} → ${aud.atk}/${aud.spd}`);
const old = { species: 'goccino', level: 12, moves: ['botta', 'spruzzo'] };
const oldSt = { maxhp: Math.floor((2 * 44 * 12) / 100) + 12 + 10, atk: Math.floor((2 * 48 * 12) / 100) + 5 };
const oldStats = E.statsFor('goccino', 12);
check('Creature vecchie senza campi nuovi: statistiche identiche a prima', oldStats.maxhp === oldSt.maxhp && oldStats.atk === oldSt.atk);
Object.assign(old, oldStats, { hp: oldStats.maxhp });
check('Creatura vecchia accettata dal server', E.validateTeam([old]) === null, E.validateTeam([old]));
const snapOld = E.teamSnapshot([old])[0];
check('Copia per la sfida: completa i campi mancanti senza cambiare le statistiche', snapOld.nature === 'docile' && snapOld.talents.join() === '8,8,8,8' && snapOld.atk === old.atk && snapOld.shiny === false);
const sh = E.createMonster('ombrino', 10, 's', { shiny: true }); sh.status = 'psn';
const snapSh = E.teamSnapshot([sh])[0];
check('Copia per la sfida: rara resta rara, stato azzerato, talenti conservati', snapSh.shiny === true && snapSh.status === null && snapSh.talents.join() === sh.talents.join() && snapSh.atk === sh.atk);
const fake = E.clone(sh); fake.talents = [15, 15, 15, 99];
check('Talenti falsi rifiutati', /Talenti/.test(E.validateTeam([fake]) || ''));
const fake2 = E.clone(sh); fake2.talents = [15, 15, 15, 15];
check('Talenti cambiati senza ricalcolo rifiutati', /Statistiche/.test(E.validateTeam([fake2]) || ''));
const fake3 = E.clone(sh); fake3.nature = 'onnipotente';
check('Carattere inventato rifiutato', /Carattere/.test(E.validateTeam([fake3]) || ''));
check('Mosse nuove: almeno 10 con effetti o priorità', Object.values(E.MOVES).filter((m) => m.effect || m.priority).length >= 10);
check('Ogni mossa nuova è imparabile da qualcuno', Object.keys(E.MOVES).every((m) => Object.values(E.SPECIES).some((sp) => sp.learn.some(([, x]) => x === m))));

// stati: una lotta "su misura" per ogni stato
function duel(a, b, actsA, seed) {
  const st = E.createBattle(seed || 5, [{ name: 'A', team: [a] }, { name: 'B', team: [b] }]);
  const evs = [];
  for (let i = 0; i < actsA.length && st.winner == null; i++) evs.push(...E.resolveTurn(st, [actsA[i], { kind: 'none' }]));
  return { st, evs };
}
{
  const f = fixed('fiammino', 30), g = fixed('semino', 30); f.moves = ['ustione'];
  const { st, evs } = duel(f, g, [{ kind: 'move', move: 'ustione' }, { kind: 'none' }], 11);
  const burned = evs.find((e) => e.t === 'status' && e.status === 'brn');
  const dmgEv = evs.find((e) => e.t === 'statusDmg' && e.status === 'brn');
  check('Bruciatura: inflitta e toglie 1/16 a fine turno', !!burned && !!dmgEv && dmgEv.maxhp - dmgEv.hp === Math.max(1, Math.floor(g.maxhp / 16)), JSON.stringify(dmgEv));
  const g2 = E.clone(st.sides[1].team[0]), a2 = fixed('sassetto', 30); a2.moves = ['sassata'];
  const normalA = E.clone(g2); normalA.status = null;
  let dB = 0, dN = 0; const r1 = E.makeRng(3), r2 = E.makeRng(3);
  for (let i = 0; i < 300; i++) { dB += E.damage(g2, a2, 'fogliolama', r1).dmg; dN += E.damage(normalA, a2, 'fogliolama', r2).dmg; }
  check('Bruciatura dimezza l\'attacco', dB < dN * 0.62, dB + ' vs ' + dN);
  const ff = fixed('fiammino', 30); const s0 = fixed('vulkarn', 30); s0.moves = ['ustione'];
  check('Il fuoco non si brucia', !duel(s0, ff, [{ kind: 'move', move: 'ustione' }], 4).evs.some((e) => e.t === 'status'));
}
{
  const o = fixed('ombrino', 30), s = fixed('sassetto', 30); o.moves = ['fiele'];
  let poisoned = null;
  for (let seed = 1; seed < 60 && !poisoned; seed++) {
    const r = duel(E.clone(o), E.clone(s), [{ kind: 'move', move: 'fiele' }], seed);
    if (r.evs.some((e) => e.t === 'status' && e.status === 'psn')) poisoned = r;
  }
  const d = poisoned && poisoned.evs.find((e) => e.t === 'statusDmg');
  const hit = poisoned && poisoned.evs.find((e) => e.t === 'hit');
  check('Veleno: inflitto da Fiele e toglie 1/8 a fine turno', !!d && hit.hp - d.hp === Math.floor(s.maxhp / 8), JSON.stringify(d));
}
{
  const v = fixed('voltino', 30), g = fixed('goccino', 30); v.moves = ['ronzio'];
  const { st } = duel(v, g, [{ kind: 'move', move: 'ronzio' }], 2);
  const gp = st.sides[1].team[0];
  check('Paralisi: velocità dimezzata nell\'ordine dei turni', gp.status === 'par');
  let cant = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const a = E.clone(gp), b = fixed('sassetto', 30); b.moves = ['botta'];
    const bt = E.createBattle(seed, [{ name: 'A', team: [a] }, { name: 'B', team: [b] }]);
    if (E.resolveTurn(bt, [{ kind: 'move', move: a.moves[0] }, { kind: 'none' }]).some((e) => e.t === 'cant' && e.reason === 'par')) cant++;
  }
  check('Paralisi: circa 1 volta su 4 non si muove', cant > 70 && cant < 130, cant + '/400');
  const fast = fixed('granitor', 30, { talents: [8, 8, 8, 15] }); fast.moves = ['sassata'];
  const slowPar = fixed('voltino', 30); slowPar.status = 'par'; slowPar.moves = ['scossa'];
  const bt = E.createBattle(9, [{ name: 'A', team: [slowPar] }, { name: 'B', team: [fast] }]);
  check('Senza paralisi Voltino sarebbe più veloce', slowPar.spd > fast.spd && Math.floor(slowPar.spd / 2) < fast.spd, slowPar.spd + ' vs ' + fast.spd);
  const order = E.resolveTurn(bt, [{ kind: 'move', move: 'scossa' }, { kind: 'move', move: 'sassata' }]).filter((e) => e.t === 'move' || e.t === 'cant').map((e) => e.side);
  check('Voltino paralizzato agisce dopo Granitor (più lento di natura)', order[0] === 1, order.join(','));
}
{
  const o = fixed('ombrino', 30), g = fixed('goccino', 30); o.moves = ['ninnananna'];
  let res = null;
  for (let seed = 1; seed < 50 && !res; seed++) {
    const r = duel(E.clone(o), E.clone(g), [{ kind: 'move', move: 'ninnananna' }], seed);
    if (r.evs.some((e) => e.t === 'status' && e.status === 'slp')) res = r;
  }
  const target = res.st.sides[1].team[0];
  check('Sonno: dura da 1 a 3 turni', target.status === 'slp' && target.slpT >= 1 && target.slpT <= 3, 'turni ' + target.slpT);
  const turns = target.slpT, st2 = E.createBattle(3, [{ name: 'A', team: [fixed('sassetto', 30)] }, { name: 'B', team: [E.clone(target)] }]);
  st2.sides[0].team[0].moves = ['botta'];
  const evs = [];
  for (let i = 0; i <= turns; i++) evs.push(...E.resolveTurn(st2, [{ kind: 'none' }, { kind: 'move', move: 'botta' }]));
  check('Sonno: non si muove, poi si sveglia e agisce', evs.filter((e) => e.t === 'cant' && e.reason === 'slp').length === turns && evs.some((e) => e.t === 'wake') && evs.some((e) => e.t === 'move' && e.side === 1));
}
{
  const a = fixed('goccino', 20), b = fixed('fiammino', 20, { talents: [8, 8, 8, 15], nature: 'svelto' }); a.moves = ['getto']; b.moves = ['botta'];
  const bt = E.createBattle(1, [{ name: 'A', team: [a] }, { name: 'B', team: [b] }]);
  const first = E.resolveTurn(bt, [{ kind: 'move', move: 'getto' }, { kind: 'move', move: 'botta' }]).find((e) => e.t === 'move');
  check('Priorità: Getto Rapido parte per primo anche se più lento', first.side === 0);
  const m0 = fixed('semino', 10); m0.hp = Math.floor(m0.maxhp * 0.6);
  const p0 = E.catchChance(m0); m0.status = 'slp';
  check('Cattura più facile con la creatura addormentata', E.catchChance(m0) > p0, p0.toFixed(2) + ' → ' + E.catchChance(m0).toFixed(2));
}
// determinismo con gli stati: due "telefoni" con lo stesso seme
{
  const A = [fixed('ombrino', 25), fixed('voltino', 25)], B = [fixed('semino', 25), fixed('fiammino', 25)];
  const run = () => {
    const st = E.createBattle(4242, [{ name: 'A', team: E.clone(A) }, { name: 'B', team: E.clone(B) }]);
    for (let g = 0; g < 200 && st.winner == null; g++) E.resolveTurn(st, [E.aiChoose(st, 0, g * 3 + 1, 'esperto'), E.aiChoose(st, 1, g * 3 + 2, 'normale')]);
    return JSON.stringify(st);
  };
  check('Lotte con stati e IA: stesso seme = stessa lotta', run() === run());
}
// IA esperta contro facile, a pari livello e squadre identiche
{
  const ids2 = Object.keys(E.SPECIES);
  let wins = 0, games = 200;
  for (let g = 0; g < games; g++) {
    const r = E.makeRng(1000 + g);
    const team = [0, 1, 2].map((k) => E.createMonster(ids2[Math.floor(r() * ids2.length)], 20, 't' + k, { rng: r, shiny: false }));
    const expertSide = g % 2;
    const sides = [{ name: 'A', team: E.clone(team) }, { name: 'B', team: E.clone(team) }];
    const st = E.createBattle(5000 + g, sides);
    for (let t = 0; t < 300 && st.winner == null; t++) {
      const acts = [0, 1].map((i) => E.aiChoose(st, i, t * 11 + i + g * 7, i === expertSide ? 'esperto' : 'facile'));
      E.resolveTurn(st, acts);
    }
    if (st.winner === expertSide) wins++;
  }
  check('IA esperta batte la facile in almeno il 70% delle lotte', wins / games >= 0.7, wins + '/' + games);
  // livello predefinito = normale (compatibilità con la chiamata a 3 argomenti)
  const st = E.createBattle(1, [{ name: 'A', team: [fixed('fiammino', 10)] }, { name: 'B', team: [fixed('semino', 10)] }]);
  check('aiChoose a 3 argomenti = livello normale', JSON.stringify(E.aiChoose(st, 0, 5)) === JSON.stringify(E.aiChoose(st, 0, 5, 'normale')));
}
console.log(`\nRISULTATO: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
