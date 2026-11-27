// Test del server delle sfide: node tests/test-server.js
// Simula Google Apps Script (PropertiesService, LockService, ContentService) ed esegue Code.gs vero.
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) pass++; else fail++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  [' + detail + ']' : '')); }

// --- finto ambiente Google Apps Script ---
const store = new Map();
let locks = 0, now = Date.UTC(2026, 10, 27, 10, 0, 0);
const sandbox = {
  console, JSON, Math, Date: Object.assign(function (...a) { return new Date(...a); }, { now: () => now, UTC: Date.UTC }),
  PropertiesService: { getScriptProperties: () => ({
    getProperty: (k) => (store.has(k) ? store.get(k) : null), setProperty: (k, v) => { if (v.length > 9216) throw new Error('valore troppo grande per PropertiesService: ' + v.length); store.set(k, v); },
    deleteProperty: (k) => store.delete(k), getKeys: () => [...store.keys()], deleteAllProperties: () => store.clear() }) },
  LockService: { getScriptLock: () => ({ waitLock: () => { locks++; }, releaseLock: () => {} }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ text: t, setMimeType() { return this; } }) },
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
check('Il link Google apre il gioco (Index.html)', page.file === 'Index' && page.title === 'FMLAB Monsters' && /FMLAB Monsters/.test(page.html));
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
check('Motore identico tra server e telefono (stesso file)', fs.readFileSync(path.join(dist, 'engine.gs'), 'utf8') === fs.readFileSync(path.join(__dirname, '..', 'game', 'engine.js'), 'utf8'));

console.log(`\nRISULTATO: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
