// Test del server delle sfide: node tests/test-server.js
// Simula Google Apps Script (PropertiesService, LockService, ContentService) ed esegue Code.gs vero.
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) pass++; else fail++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  [' + detail + ']' : '')); }

// --- finto ambiente Google Apps Script ---
const store = new Map(), cacheStore = new Map();
let propOps = 0, cacheOps = 0;
let locks = 0, now = Date.UTC(2026, 10, 27, 10, 0, 0);
const sandbox = {
  console, JSON, Math, Date: Object.assign(function (...a) { return new Date(...a); }, { now: () => now, UTC: Date.UTC }),
  PropertiesService: { getScriptProperties: () => ({
    getProperty: (k) => { propOps++; return store.has(k) ? store.get(k) : null; }, setProperty: (k, v) => { propOps++; if (v.length > 9216) throw new Error('valore troppo grande per PropertiesService: ' + v.length); store.set(k, v); },
    deleteProperty: (k) => store.delete(k), getKeys: () => [...store.keys()], deleteAllProperties: () => store.clear() }) },
  LockService: { getScriptLock: () => ({ waitLock: () => { locks++; }, releaseLock: () => {} }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ text: t, setMimeType() { return this; } }) },
  CacheService: { getScriptCache: () => ({
    get: (k) => { const e = cacheStore.get(k); if (!e) return null; if (e.exp <= now) { cacheStore.delete(k); return null; } cacheOps++; return e.v; },
    put: (k, v, ttl) => { if (String(v).length > 100 * 1024) throw new Error('valore troppo grande per CacheService'); if (ttl > 21600) throw new Error('scadenza oltre 6 ore'); cacheStore.set(k, { v: String(v), exp: now + ttl * 1000 }); cacheOps++; },
    getAll: (keys) => { const o = {}; keys.forEach((k) => { const e = cacheStore.get(k); if (e && e.exp > now) o[k] = e.v; }); cacheOps++; return o; },
    remove: (k) => { cacheStore.delete(k); },
  }) },
  HtmlService: {
    XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' },
    createHtmlOutputFromFile: (f) => {
      const out = { file: f, meta: {}, html: fs.readFileSync(path.join(dist, f + '.html'), 'utf8') };
      out.setTitle = (t) => { out.title = t; return out; };
      out.addMetaTag = (k, v) => { out.meta[k] = v; return out; };
      out.setXFrameOptionsMode = (m) => { out.xframe = m; return out; };
      return out;
    },
  },
};
vm.createContext(sandbox);
const dist = path.join(__dirname, '..', 'backend', 'dist');
for (const f of ['engine.gs', 'servercore.gs', 'Code.gs']) vm.runInContext(fs.readFileSync(path.join(dist, f), 'utf8'), sandbox, { filename: f });
const call = (params) => JSON.parse(sandbox.doGet({ parameter: params }).text);

// il link senza ?action apre il gioco intero
const page = sandbox.doGet({ parameter: {} });
check('Il link Google apre il gioco (Index.html)', page.file === 'Index' && page.title === 'FMLAB Cristalia' && /FMLAB Cristalia/.test(page.html));
check('La pagina ha il viewport per il telefono', /width=device-width/.test(page.meta.viewport || ''));
check('Index.html contiene motore 3D, mondo e gioco in un file', /FMLAB3D/.test(page.html) && /FMLABWorld/.test(page.html) && !/<script src=/.test(page.html), Math.round(page.html.length / 1024) + ' KB');
check('google.script.run: apiRun risponde', sandbox.apiRun({ action: 'ping' }).ok === true);

const E = require('../game/engine.js');
const teamA = E.teamSnapshot([E.createMonster('fiammino', 16, 'a1'), E.createMonster('voltino', 15, 'a2')]);
const teamB = E.teamSnapshot([E.createMonster('goccino', 16, 'b1'), E.createMonster('sassetto', 15, 'b2')]);

check('ping risponde', call({ action: 'ping' }).ok === true);
check('azione sconosciuta gestita', call({ action: 'boh' }).ok === false);
const c = call({ action: 'create', name: 'Francesco', team: JSON.stringify(teamA) });
check('Crea stanza con codice di 5 caratteri', c.ok && /^[A-Z2-9]{5}$/.test(c.code), c.code);
check('Stanza in attesa dell\'amico', c.status === 'waiting');
check('Nome vuoto rifiutato', call({ action: 'create', name: '  ', team: JSON.stringify(teamA) }).ok === false);
const cheat = E.clone(teamA); cheat[0].atk = 500;
check('Squadra truccata rifiutata dal server', call({ action: 'create', name: 'Furbo', team: JSON.stringify(cheat) }).ok === false);
check('Codice sbagliato: errore chiaro', /non trovata/.test(call({ action: 'join', code: 'ZZZZZ', name: 'Luca', team: JSON.stringify(teamB) }).error || ''));
check('Stesso nome dell\'amico rifiutato', call({ action: 'join', code: c.code, name: 'Francesco', team: JSON.stringify(teamB) }).ok === false);
const j = call({ action: 'join', code: c.code.toLowerCase(), name: 'Luca', team: JSON.stringify(teamB) });
check('L\'amico entra (anche col codice minuscolo)', j.ok && j.status === 'playing' && j.you === 1, j.status);
check('Terzo giocatore non può entrare', call({ action: 'join', code: c.code, name: 'Terzo', team: JSON.stringify(teamB) }).ok === false);

// Partita: solo il primo manda la mossa → il turno non avanza
let s = call({ action: 'move', code: c.code, side: 0, turn: 1, act: JSON.stringify({ kind: 'move', move: teamA[0].moves[1] }) });
check('Con una sola mossa il turno aspetta l\'altro', s.turn === 0 && s.waitingFor.join() === '1', 'aspetta ' + s.waitingFor);
const dup = call({ action: 'move', code: c.code, side: 0, turn: 0, act: JSON.stringify({ kind: 'move', move: teamA[0].moves[0] }) });
check('Mossa vecchia ignorata', dup.turn === 0);
check('Mossa che la creatura non conosce rifiutata', call({ action: 'move', code: c.code, side: 1, turn: 1, act: JSON.stringify({ kind: 'move', move: 'inferno' }) }).ok === false);
s = call({ action: 'move', code: c.code, side: 1, turn: 1, act: JSON.stringify({ kind: 'move', move: teamB[0].moves[1] }) });
check('Con due mosse il server risolve il turno', s.turn === 1 && s.lastEvents.some((e) => e.t === 'hit'), s.lastEvents.map((e) => e.t).join(','));

// gioca fino alla fine con l'IA del motore per entrambi
let guard = 0;
while (s.status === 'playing' && guard++ < 100) {
  for (const side of [0, 1]) {
    const st = { sides: s.sides };
    const act = E.aiChoose(st, side, s.turn * 13 + side);
    s = call({ action: 'move', code: c.code, side, turn: s.turn + 1, act: JSON.stringify(act) });
  }
}
check('La sfida finisce con un vincitore', s.status === 'ended' && (s.winner === 0 || s.winner === 1), 'vince ' + s.names[s.winner] + ' al turno ' + s.turn);
const lb = call({ action: 'leaderboard' });
check('Classifica aggiornata', lb.rows.length === 2 && lb.rows[0].wins === 1, JSON.stringify(lb.rows));
check('Ogni richiesta usa il lucchetto (mosse simultanee sicure)', locks >= 10, locks + ' blocchi');
const biggest = Math.max(...[...store.values()].map((v) => v.length));
check('Stanza sotto il limite di 9 KB di Google', biggest < 9216, biggest + ' byte');

// Squadre complete 6 contro 6: la stanza deve restare sotto 9 KB per tutta la partita
const six = (p) => E.teamSnapshot(['silvatron', 'vulkarn', 'abissaro', 'fulmix', 'granitor', 'spettrax'].map((sp, i) => E.createMonster(sp, 40, p + i)));
const c6 = call({ action: 'create', name: 'Sei', team: JSON.stringify(six('x')) });
let s6 = call({ action: 'join', code: c6.code, name: 'Sette', team: JSON.stringify(six('y')) });
let max6 = 0, g6 = 0;
while (s6.status === 'playing' && g6++ < 200) {
  for (const side of [0, 1]) {
    s6 = call({ action: 'move', code: c6.code, side, turn: s6.turn + 1, act: JSON.stringify(E.aiChoose({ sides: s6.sides }, side, s6.turn + side)) });
    max6 = Math.max(max6, store.get('room_' + c6.code).length);
  }
}
check('6 contro 6: partita completa', s6.status === 'ended', s6.turn + ' turni');
check('6 contro 6: stanza sempre sotto 9 KB', max6 < 9216, max6 + ' byte al massimo');

// Regole avanzate sul server: talenti, carattere, rare
const shinyTeam = E.teamSnapshot([E.createMonster('ombrino', 20, 'sh1', { shiny: true, talents: [15, 3, 9, 12], nature: 'vivace' })]);
const cs = call({ action: 'create', name: 'Rara', team: JSON.stringify(shinyTeam) });
check('Squadra con una rara (shiny) accettata', cs.ok === true, cs.error);
const stored = JSON.parse(store.get('room_' + cs.code)).players[0].team[0];
check('Il server conserva rara, talenti e carattere', stored.shiny === true && stored.talents.join() === '15,3,9,12' && stored.nature === 'vivace' && stored.status === null);
const cheatT = E.clone(shinyTeam); cheatT[0].talents = [15, 15, 15, 15];
check('Talenti falsi rifiutati dal server', /Statistiche/.test(call({ action: 'create', name: 'Furbo', team: JSON.stringify(cheatT) }).error || ''));
const cheat2 = E.clone(shinyTeam); cheat2[0].talents = [16, 0, 0, 0];
check('Talenti fuori scala rifiutati dal server', /Talenti/.test(call({ action: 'create', name: 'Furbo', team: JSON.stringify(cheat2) }).error || ''));
const oldTeam = [{ species: 'goccino', level: 10, moves: ['botta', 'spruzzo'], ...E.statsFor('goccino', 10) }];
oldTeam[0].hp = oldTeam[0].maxhp;
check('Squadra di un salvataggio vecchio (senza campi nuovi) accettata', call({ action: 'create', name: 'Vecchio', team: JSON.stringify(oldTeam) }).ok === true);
// 6v6 con stati e mosse nuove, tutte rare: sotto 9 KB
const sixS = (p) => E.teamSnapshot(['silvatron', 'vulkarn', 'abissaro', 'fulmix', 'granitor', 'spettrax'].map((sp, i) => E.createMonster(sp, 40, p + 'long-uid-' + i, { shiny: true })));
const c7 = call({ action: 'create', name: 'Stati', team: JSON.stringify(sixS('s')) });
let s7 = call({ action: 'join', code: c7.code, name: 'Stati2', team: JSON.stringify(sixS('t')) }), max7 = 0, seenStatus = false;
for (let t = 0; t < 400 && s7.status === 'playing'; t++) {
  const room7 = JSON.parse(store.get('room_' + c7.code));
  for (const side of [0, 1]) {
    const act = E.aiChoose(room7.battle, side, t * 13 + side, 'esperto');
    s7 = call({ action: 'move', code: c7.code, side, turn: room7.battle.turn + 1, act: JSON.stringify(act) });
  }
  const raw7 = store.get('room_' + c7.code); max7 = Math.max(max7, raw7.length);
  if (/"t":"status"/.test(raw7)) seenStatus = true;
}
check('6 contro 6 con stati e IA esperta: partita completa', s7.status === 'ended', s7.turn + ' turni');
check('6 contro 6 con stati: stanza sempre sotto 9 KB', max7 < 9216, max7 + ' byte al massimo, stati visti: ' + seenStatus);

// Abbandono
const c2 = call({ action: 'create', name: 'Anna', team: JSON.stringify(teamA) });
call({ action: 'join', code: c2.code, name: 'Marco', team: JSON.stringify(teamB) });
const f = call({ action: 'move', code: c2.code, side: 1, turn: 1, act: JSON.stringify({ kind: 'forfeit' }) });
check('Abbandono: vince l\'altro', f.status === 'ended' && f.winner === 0);

// Pulizia stanze vecchie
now += 25 * 60 * 60 * 1000;
call({ action: 'create', name: 'Nuovo', team: JSON.stringify(teamA) });
check('Stanze più vecchie di 24 ore cancellate', ![...store.keys()].includes('room_' + c.code));

// Lo stesso motore sul telefono calcola la stessa lotta del server
const replay = E.createBattle(0, [{ name: 'x', team: teamA }, { name: 'y', team: teamB }]);
// Sala Online: presenza e inviti
const pidA = 'aaaaaaaa1', pidB = 'bbbbbbbb2';
let h = call({ action: 'hello', pid: pidA, name: 'Francesco', lead: 'fiammino', lv: 16, zone: 'Prato' });
check('Sala Online: entro e sono da solo', h.ok && h.online.length === 0);
h = call({ action: 'hello', pid: pidB, name: 'Luca', lead: 'goccino', lv: 15, zone: 'Bosco' });
check('Sala Online: Luca vede Francesco', h.ok && h.online.length === 1 && h.online[0].name === 'Francesco' && h.online[0].lead === 'fiammino', JSON.stringify(h.online));
check('Sala Online: id giocatore finto rifiutato', call({ action: 'hello', pid: '../x', name: 'X' }).ok === false);
const room = call({ action: 'create', name: 'Francesco', team: JSON.stringify(teamA) });
check('Invito senza sfida creata rifiutato', call({ action: 'invite', pid: pidA, to: pidB, name: 'Francesco', code: 'ZZZZZ' }).ok === false);
check('Invito mandato a Luca', call({ action: 'invite', pid: pidA, to: pidB, name: 'Francesco', code: room.code }).ok === true);
h = call({ action: 'hello', pid: pidB, name: 'Luca', lead: 'goccino', lv: 15, zone: 'Bosco' });
check('Luca riceve l\'invito col codice', h.invites.length === 1 && h.invites[0].code === room.code && h.invites[0].from === 'Francesco');
check('Rifiuto: l\'invito sparisce', call({ action: 'decline', pid: pidB, code: room.code }).ok && call({ action: 'hello', pid: pidB, name: 'Luca' }).invites.length === 0);
now += 100 * 1000;
check('Dopo 90 secondi senza segnali non sei più online', call({ action: 'hello', pid: pidB, name: 'Luca' }).online.length === 0);
now += 11 * 60 * 1000; call({ action: 'hello', pid: pidB, name: 'Luca' });
check('Presenze vecchie cancellate', !store.has('pres_' + pidA));
// Modalità Orda: classifica con controlli
const pidH = 'orda0000aa1';
check('Orda: punteggio valido accettato', call({ action: 'hordeScore', pid: pidH, name: 'Francesco', score: 12000, wave: 8, species: 'fiammino' }).ok === true);
check('Orda: secondo invio troppo presto rifiutato', call({ action: 'hordeScore', pid: pidH, name: 'Francesco', score: 13000, wave: 9, species: 'fiammino' }).ok === false);
now += 21 * 1000;
check('Orda: punteggio impossibile (oltre ondata x 5000) rifiutato', call({ action: 'hordeScore', pid: pidH, name: 'Francesco', score: 50001, wave: 10, species: 'fiammino' }).ok === false);
check('Orda: ondata fuori scala rifiutata', call({ action: 'hordeScore', pid: 'orda0000bb2', name: 'Luca', score: 10, wave: 999, species: 'goccino' }).ok === false);
check('Orda: creatura inventata rifiutata', call({ action: 'hordeScore', pid: 'orda0000bb2', name: 'Luca', score: 10, wave: 2, species: 'pikachu' }).ok === false);
check('Orda: punteggio non intero rifiutato', call({ action: 'hordeScore', pid: 'orda0000bb2', name: 'Luca', score: 10.5, wave: 2, species: 'goccino' }).ok === false);
check('Orda: Luca entra in classifica', call({ action: 'hordeScore', pid: 'orda0000bb2', name: 'Luca', score: 9000, wave: 7, species: 'goccino' }).ok === true);
now += 21 * 1000;
const worse = call({ action: 'hordeScore', pid: pidH, name: 'Francesco', score: 5000, wave: 4, species: 'fiammino' });
check('Orda: un punteggio peggiore non sostituisce il record', worse.ok && worse.best === false);
let ht = call({ action: 'hordeTop' });
check('Orda: classifica ordinata col record migliore', ht.ok && ht.rows[0].name === 'Francesco' && ht.rows[0].score === 12000 && ht.rows[1].name === 'Luca', JSON.stringify(ht.rows));
for (let k = 0; k < 70; k++) { now += 21 * 1000; call({ action: 'hordeScore', pid: 'orda' + String(k).padStart(7, '0'), name: 'Gioc' + k, score: 100 + k, wave: 3, species: 'semino' }); }
check('Orda: si tengono al massimo 50 nomi (sotto 9 KB)', Object.keys(JSON.parse(store.get('horde_lb'))).length === 50 && store.get('horde_lb').length < 9000, store.get('horde_lb').length + ' byte');
check('Orda: hordeTop restituisce 20 righe', call({ action: 'hordeTop' }).rows.length === 20);
// Quota di Google: la Sala Online non deve consumare letture/scritture delle proprietà
{
  const p0 = propOps;
  for (let k = 0; k < 20; k++) call({ action: 'hello', pid: 'quota000' + (k % 5), name: 'Q' + (k % 5), lead: 'goccino', lv: 10, zone: 'Prato', x: 15, y: 40 });
  check('Sala Online: 20 segnali di presenza senza toccare la quota delle proprietà', propOps === p0, (propOps - p0) + ' operazioni');
  const h = call({ action: 'hello', pid: 'quota0000', name: 'Q0', x: 15, y: 40 });
  check('Sala Online: si vedono gli altri con la posizione sulla mappa', h.online.length === 4 && h.online.every((o) => o.x === 15 && o.y === 40), JSON.stringify(h.online[0]));
}
// lettura dello stato di una sfida durante l'attesa: dalla cache
{
  const r = call({ action: 'create', name: 'Polli', team: JSON.stringify(teamA) });
  const p0 = propOps;
  for (let k = 0; k < 10; k++) call({ action: 'state', code: r.code, side: 0 });
  check('Attesa della mossa dell\'amico: 10 letture senza toccare la quota', propOps === p0, (propOps - p0) + ' operazioni');
}
// Raid cooperativo
{
  const mk = (sp, lv, u) => E.teamSnapshot([E.createMonster(sp, lv, u, { talents: [10, 10, 10, 10], nature: E.NATURES ? Object.keys(E.NATURES)[0] : undefined })]);
  ['raid0000a', 'raid0000b', 'raid0000c'].forEach((pid, i) => call({ action: 'hello', pid, name: 'Raider' + i }));
  const r = call({ action: 'raidCreate', pid: 'raid0000a', name: 'Raider0', team: JSON.stringify(mk('vulkarn', 30, 'r0')) });
  check('Raid creato con codice R…', r.ok && /^R[A-Z2-9]{4}$/.test(r.code) && r.status === 'lobby', r.code);
  check('Invito al Raid mandato', call({ action: 'invite', pid: 'raid0000a', to: 'raid0000b', name: 'Raider0', code: r.code, kind: 'raid' }).ok);
  const inv = call({ action: 'hello', pid: 'raid0000b', name: 'Raider1' }).invites;
  check('L\'amico riceve l\'invito al Raid', inv.length === 1 && inv[0].kind === 'raid' && inv[0].code === r.code, JSON.stringify(inv));
  check('Entra il secondo', call({ action: 'raidJoin', pid: 'raid0000b', name: 'Raider1', code: r.code, team: JSON.stringify(mk('abissaro', 30, 'r1')) }).players.length === 2);
  check('Entra il terzo', call({ action: 'raidJoin', pid: 'raid0000c', name: 'Raider2', code: r.code, team: JSON.stringify(mk('silvatron', 30, 'r2')) }).players.length === 3);
  check('Squadra truccata rifiutata nel Raid', call({ action: 'raidJoin', pid: 'raid0000d', name: 'Furbo', code: r.code, team: JSON.stringify([Object.assign(E.teamSnapshot([E.createMonster('fulmix', 30, 'x')])[0], { atk: 999 })]) }).ok === false);
  check('Solo chi crea fa partire il Raid', call({ action: 'raidStart', pid: 'raid0000b', code: r.code }).ok === false);
  let st = call({ action: 'raidStart', pid: 'raid0000a', code: r.code });
  check('Raid partito: boss con vita in comune', st.status === 'fight' && st.boss.maxhp > 200 && st.boss.hp === st.boss.maxhp, st.boss.species + ' Lv ' + st.boss.level + ' PS ' + st.boss.maxhp);
  const pids = ['raid0000a', 'raid0000b', 'raid0000c'];
  let rounds = 0, sawShared = false, maxSize = 0;
  while (st.status === 'fight' && rounds < 300) {
    for (const pid of pids) {
      const v = call({ action: 'raidState', pid, code: r.code });
      if (v.status !== 'fight' || v.me.done) continue;
      const lane = { turn: v.me.turn, winner: v.me.winner, sides: v.me.sides };
      const act = E.aiChoose(lane, 0, rounds * 31 + pid.length, 'esperto');
      const before = v.boss.hp;
      now += 1000;
      const res = call({ action: 'raidMove', pid, code: r.code, turn: v.me.turn + 1, act: JSON.stringify(act) });
      if (res.dealt > 0 && res.boss.hp === before - res.dealt) sawShared = true;
      st = res;
      maxSize = Math.max(maxSize, (cacheStore.get('raid_' + r.code) || { v: '' }).v.length);
      if (st.status !== 'fight') break;
    }
    rounds++;
  }
  check('Tutti colpiscono lo stesso boss (vita in comune)', sawShared);
  check('Il Raid finisce (vittoria o sconfitta)', st.status === 'won' || st.status === 'lost', st.status + ' dopo ' + rounds + ' giri, boss ' + st.boss.hp + '/' + st.boss.maxhp);
  check('Classifica dei danni nel Raid', st.players.length === 3 && st.players.some((x) => x.dealt > 0), st.players.map((x) => x.name + ':' + x.dealt).join(' '));
  check('Stanza del Raid sotto i 100 KB della cache Google', maxSize > 0 && maxSize < 100 * 1024, Math.round(maxSize / 1024) + ' KB');
  check('Mossa troppo veloce ignorata (anti-spam)', (() => { const r2 = call({ action: 'raidCreate', pid: 'raid0000a', name: 'Raider0', team: JSON.stringify(E.teamSnapshot(['abissaro', 'silvatron', 'fulmix'].map((sp, k) => E.createMonster(sp, 45, 'q' + k)))) }); call({ action: 'raidStart', pid: 'raid0000a', code: r2.code }); const v = call({ action: 'raidState', pid: 'raid0000a', code: r2.code }); const a1 = call({ action: 'raidMove', pid: 'raid0000a', code: r2.code, turn: v.me.turn + 1, act: JSON.stringify({ kind: 'move', move: v.me.sides[0].team[0].moves[0] }) }); const a2 = call({ action: 'raidMove', pid: 'raid0000a', code: r2.code, turn: a1.me.turn + 1, act: JSON.stringify({ kind: 'move', move: v.me.sides[0].team[0].moves[0] }) }); global.__dbg = JSON.stringify({ r2: r2.ok, e: r2.error, a1: [a1.ok, a1.error, a1.status, a1.me && a1.me.turn], a2: [a2.ok, a2.error, a2.wait, a2.status] }); return a2.wait === true; })(), global.__dbg);
}
check('Motore identico tra server e telefono (stesso file)', fs.readFileSync(path.join(dist, 'engine.gs'), 'utf8') === fs.readFileSync(path.join(__dirname, '..', 'game', 'engine.js'), 'utf8'));

console.log(`\nRISULTATO: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
