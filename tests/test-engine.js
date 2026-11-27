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
function playMatch(seed) {
  const a = [E.createMonster('fiammino', 15, 'p1a'), E.createMonster('voltino', 14, 'p1b')];
  const b = [E.createMonster('goccino', 15, 'p2a'), E.createMonster('sassetto', 14, 'p2b')];
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

console.log(`\nRISULTATO: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
