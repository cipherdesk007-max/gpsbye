#!/usr/bin/env node
// Raid: percentuale di vittorie di gruppi di amici (2-5) con squadre tipiche di 3 creature, contro i boss del giorno.
global.self = global;
const E = require('../game/engine.js');
const S = require('../game/server-core.js');
const evo = (sp, lv) => { let s = sp; while (E.SPECIES[s].evo && lv >= E.SPECIES[s].evo.level) s = E.SPECIES[s].evo.to; return s; };
const POOL = ['fiammino', 'goccino', 'semino', 'voltino', 'sassetto', 'ombrino'];
function run(nPlayers, lv, N) {
  let won = 0;
  for (let g = 0; g < N; g++) {
    const mem = {}; let now = 1e12 + g * 1e9;
    const srv = S.createServer({ get: (k) => (k in mem ? mem[k] : null), set: (k, v) => { mem[k] = v; }, del: (k) => { delete mem[k]; }, keys: () => Object.keys(mem), lock: (f) => f(), now: () => now, random: Math.random }, E);
    const pids = [];
    let code = null;
    for (let i = 0; i < nPlayers; i++) {
      const pid = 'sim' + String(g).padStart(4, '0') + 'p' + i; pids.push(pid);
      const team = [0, 1, 2].map((k) => { const sp = POOL[(g + i * 2 + k) % POOL.length]; return E.createMonster(evo(sp, lv - k), lv - k, 'u' + i + k); });
      const res = i === 0 ? srv.handle({ action: 'raidCreate', pid, name: 'G' + i, team: JSON.stringify(E.teamSnapshot(team)) }) : srv.handle({ action: 'raidJoin', pid, name: 'G' + i, code, team: JSON.stringify(E.teamSnapshot(team)) });
      code = res.code;
    }
    let st = srv.handle({ action: 'raidStart', pid: pids[0], code });
    for (let round = 0; round < 400 && st.status === 'fight'; round++) {
      for (const pid of pids) {
        const v = srv.handle({ action: 'raidState', pid, code });
        if (v.status !== 'fight' || v.me.done) continue;
        now += 1500;
        const act = E.aiChoose({ turn: v.me.turn, winner: v.me.winner, sides: v.me.sides }, 0, round * 17 + pid.length, 'esperto');
        st = srv.handle({ action: 'raidMove', pid, code, turn: v.me.turn + 1, act: JSON.stringify(act) });
      }
    }
    if (st.status === 'won') won++;
  }
  return Math.round((won / N) * 100);
}
const N = Number(process.env.N || 40);
for (const lv of [15, 30]) console.log('Lv ' + lv + ': ' + [1, 2, 3, 4, 5].map((n) => n + ' giocatori ' + run(n, lv, N) + '%').join('   '));
