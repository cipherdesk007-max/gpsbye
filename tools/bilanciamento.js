#!/usr/bin/env node
/*
 * Prova di bilanciamento: migliaia di lotte simulate contro ogni Guardiano e il Campione,
 * con una squadra tipica (creatura iniziale + creature catturabili nelle zone già visitate).
 * Entrambi i lati giocano con l'IA "esperta". Uso: node tools/bilanciamento.js
 * Obiettivo: al livello "atteso" si vince più della metà delle volte, 2 livelli sotto è dura.
 * È lenta (circa un minuto): non gira a ogni modifica, solo nella CI settimanale.
 */
global.self = global;
const E = require('../game/engine.js'); global.FMLABEngine = E;
require('../game/world.js');
const S = require('../game/story.js');
const evo = (sp, lv) => { let s = sp; while (E.SPECIES[s].evo && lv >= E.SPECIES[s].evo.level) s = E.SPECIES[s].evo.to; return s; };
function rate(foeT, myT, N) {
  let w = 0;
  for (let i = 0; i < N; i++) {
    const my = myT.map(([s, l], k) => E.createMonster(evo(s, l), l, 'm' + k)), foe = foeT.map(([s, l], k) => E.createMonster(s, l, 'f' + k));
    const st = E.createBattle(91 + i, [{ name: 'a', team: my }, { name: 'b', team: foe }]);
    for (let t = 0; t < 200 && st.winner == null; t++) E.resolveTurn(st, [E.aiChoose(st, 0, i * 7 + t, 'esperto'), E.aiChoose(st, 1, i * 13 + t, 'esperto')]);
    if (st.winner === 0) w++;
  }
  return Math.round((w / N) * 100);
}
const teams = {
  flora: (st, lv) => [[st, lv], [st === 'fiammino' ? 'goccino' : 'fiammino', lv - 3], ['voltino', lv - 2]],
  marina: (st, lv) => [[st, lv], ['sassetto', lv - 2], ['voltino', lv - 1], ['semino', lv - 3]],
  corvino: (st, lv) => [[st, lv], ['sassetto', lv - 1], ['voltino', lv - 2], ['goccino', lv - 3]],
  petra: (st, lv) => [[st, lv], ['goccino', lv - 2], ['semino', lv - 2], ['ombrino', lv - 3]],
  aurelio: (st, lv) => [[st, lv], ['sassetto', lv - 1], ['voltino', lv - 1], ['ombrino', lv - 2], ['goccino', lv - 2], ['semino', lv - 3]],
};
const expected = { flora: 11, marina: 15, corvino: 19, petra: 23, aurelio: 30 };
const N = Number(process.env.N || 200);
let bad = 0;
for (const id of Object.keys(teams)) {
  const t = S.TRAINERS.find((x) => x.id === id);
  if (!t) { console.log('manca', id); bad++; continue; }
  const lv = expected[id];
  const at = (L) => E.STARTERS.map((s) => rate(t.team, teams[id](s, L), N));
  const hard = at(lv - 2), ok = at(lv);
  const avgOk = ok.reduce((a, b) => a + b, 0) / ok.length, avgHard = hard.reduce((a, b) => a + b, 0) / hard.length;
  const good = Math.min(...ok) >= 45 && avgHard < avgOk;
  if (!good) bad++;
  console.log(`${good ? 'PASS' : 'FAIL'} ${t.name.padEnd(8)} Lv${lv - 2}: ${hard.join('/')}%   Lv${lv}: ${ok.join('/')}%   (iniziale ${E.STARTERS.join('/')})`);
}
console.log(`\nRISULTATO: ${5 - bad} PASS, ${bad} FAIL`);
process.exit(bad ? 1 : 0);
