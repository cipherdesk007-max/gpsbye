/*
 * FMLAB Monsters — logica delle sfide (stanze, turni, classifica)
 *
 * Lo stesso file gira in tre posti:
 *  - su Google Apps Script (server vero, dati in PropertiesService)
 *  - nel gioco, in "modalità locale" (dati in localStorage, per provare senza server)
 *  - nei test Node
 * Il server risolve lui ogni turno con il motore: i telefoni mandano solo la mossa.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FMLABServerCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
  const ONLINE_MS = 90 * 1000;          // visto negli ultimi 90 secondi = online
  const PRESENCE_TTL_MS = 10 * 60 * 1000;
  const INVITE_TTL_MS = 10 * 60 * 1000;
  const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // niente 0/O, 1/I

  /**
   * storage: { get(key)->string|null, set(key, string), del(key), keys()->[string], lock(fn), now()->ms, random()->0..1 }
   */
  function createServer(storage, E) {
    function load(code) {
      const raw = storage.get('room_' + code);
      return raw ? JSON.parse(raw) : null;
    }
    function save(room) { storage.set('room_' + room.code, JSON.stringify(room)); }

    function cleanName(name) {
      return String(name || '').replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 16);
    }

    function newCode() {
      for (let tries = 0; tries < 20; tries++) {
        let c = '';
        for (let i = 0; i < 5; i++) c += CODE_ALPHABET[Math.floor(storage.random() * CODE_ALPHABET.length)];
        if (!load(c)) return c;
      }
      throw new Error('Impossibile creare un codice');
    }

    function cleanup() {
      const now = storage.now();
      storage.keys().filter((k) => k.indexOf('room_') === 0).forEach((k) => {
        try {
          const r = JSON.parse(storage.get(k));
          if (!r || now - r.updated > ROOM_TTL_MS) storage.del(k);
        } catch (e) { storage.del(k); }
      });
    }

    function cleanPid(pid) { const v = String(pid || ''); return /^[a-z0-9]{8,16}$/.test(v) ? v : ''; }
    function readInvites(pid) {
      let list = [];
      try { list = JSON.parse(storage.get('inv_' + pid) || '[]'); } catch (e) { list = []; }
      const now = storage.now();
      return list.filter((i) => now - i.t < INVITE_TTL_MS && (() => { const r = load(i.code); return r && r.status === 'waiting'; })());
    }

    function parseTeam(json) {
      let team;
      try { team = typeof json === 'string' ? JSON.parse(json) : json; } catch (e) { return { error: 'Squadra non leggibile.' }; }
      if (!Array.isArray(team)) return { error: 'Squadra non valida.' };
      // 1) la squadra ricevuta deve essere onesta (statistiche coerenti col livello, mosse imparate)
      const err = E.validateTeam(team);
      if (err) return { error: err };
      // 2) il server usa comunque una copia ricalcolata, a vita piena
      return { team: E.teamSnapshot(team) };
    }

    function publicState(room, side) {
      const b = room.battle;
      return {
        ok: true,
        code: room.code,
        status: room.status,
        you: side,
        names: room.players.map((p) => p.name),
        turn: b ? b.turn : 0,
        winner: room.winner,
        waitingFor: room.status === 'playing'
          ? [0, 1].filter((i) => !(room.pending && room.pending[i] != null))
          : [],
        sides: b ? b.sides.map((s) => ({ name: s.name, active: s.active, team: s.team })) : null,
        lastEvents: room.lastEvents || [],
        history: (room.history || []).slice(-24),
      };
    }

    function updateLeaderboard(winnerName, loserName) {
      const raw = storage.get('leaderboard');
      const lb = raw ? JSON.parse(raw) : {};
      lb[winnerName] = lb[winnerName] || { wins: 0, losses: 0 };
      lb[loserName] = lb[loserName] || { wins: 0, losses: 0 };
      lb[winnerName].wins += 1;
      lb[loserName].losses += 1;
      storage.set('leaderboard', JSON.stringify(lb));
    }

    const actions = {
      ping() { return { ok: true, server: 'FMLAB Monsters', time: storage.now() }; },

      create(p) {
        const name = cleanName(p.name);
        if (!name) return { ok: false, error: 'Scegli un nome.' };
        const t = parseTeam(p.team);
        if (t.error) return { ok: false, error: t.error };
        cleanup();
        const code = newCode();
        const room = {
          code, seed: Math.floor(storage.random() * 4294967295) >>> 0,
          status: 'waiting', created: storage.now(), updated: storage.now(),
          players: [{ name, team: t.team }], pending: {}, battle: null, winner: null, lastEvents: [], history: [],
        };
        save(room);
        return publicState(room, 0);
      },

      join(p) {
        const code = String(p.code || '').toUpperCase().trim();
        const room = load(code);
        if (!room) return { ok: false, error: 'Stanza non trovata. Controlla il codice.' };
        if (room.status !== 'waiting') return { ok: false, error: 'La sfida è già iniziata.' };
        const name = cleanName(p.name);
        if (!name) return { ok: false, error: 'Scegli un nome.' };
        if (name === room.players[0].name) return { ok: false, error: 'Usa un nome diverso dal tuo amico.' };
        const t = parseTeam(p.team);
        if (t.error) return { ok: false, error: t.error };
        room.players.push({ name, team: t.team });
        room.battle = E.createBattle(room.seed, room.players.map((pl) => ({ name: pl.name, team: pl.team })));
        // le squadre ora vivono nella lotta: niente doppioni (limite 9 KB per stanza su Google)
        room.players = room.players.map((pl) => ({ name: pl.name }));
        room.status = 'playing';
        room.updated = storage.now();
        save(room);
        return publicState(room, 1);
      },

      move(p) {
        const room = load(String(p.code || '').toUpperCase());
        if (!room) return { ok: false, error: 'Stanza non trovata.' };
        if (room.status !== 'playing') return publicState(room, Number(p.side));
        const side = Number(p.side);
        if (side !== 0 && side !== 1) return { ok: false, error: 'Lato non valido.' };
        if (Number(p.turn) !== room.battle.turn + 1) return publicState(room, side); // mossa vecchia o doppia
        let action;
        // la mossa viaggia nel parametro "act" ("action" è il nome dell'operazione)
        try { action = typeof p.act === 'string' ? JSON.parse(p.act) : p.act; } catch (e) { return { ok: false, error: 'Mossa non leggibile.' }; }
        if (!action || !action.kind) return { ok: false, error: 'Mossa mancante.' };
        const mySide = room.battle.sides[side];
        const me = mySide.team[mySide.active];
        if (action.kind === 'move' && !me.moves.includes(action.move)) return { ok: false, error: 'Mossa non disponibile.' };
        if (action.kind === 'switch' && !(mySide.team[action.to] && mySide.team[action.to].hp > 0)) return { ok: false, error: 'Cambio non valido.' };
        if (action.kind === 'forfeit') {
          room.status = 'ended';
          room.winner = 1 - side;
          room.lastEvents = [{ t: 'forfeit', side }, { t: 'end', winner: room.winner }];
          updateLeaderboard(room.players[room.winner].name, room.players[side].name);
          room.updated = storage.now();
          save(room);
          return publicState(room, side);
        }
        room.pending = room.pending || {};
        room.pending[side] = action;
        if (room.pending[0] != null && room.pending[1] != null) {
          const events = E.resolveTurn(room.battle, [room.pending[0], room.pending[1]]);
          room.battle.log = []; // lo stato resta piccolo: teniamo solo l'ultimo turno
          room.lastEvents = events;
          room.history = (room.history || []).concat(events).slice(-24);
          room.pending = {};
          if (room.battle.winner != null) {
            room.status = 'ended';
            room.winner = room.battle.winner;
            if (room.winner === 0 || room.winner === 1) {
              updateLeaderboard(room.players[room.winner].name, room.players[1 - room.winner].name);
            }
          }
        }
        room.updated = storage.now();
        save(room);
        return publicState(room, side);
      },

      state(p) {
        const room = load(String(p.code || '').toUpperCase());
        if (!room) return { ok: false, error: 'Stanza non trovata.' };
        return publicState(room, Number(p.side));
      },

      /** Sala Online: "ci sono" + chi altro c'è + inviti per me, in una sola chiamata. */
      hello(p) {
        const pid = cleanPid(p.pid), name = cleanName(p.name);
        if (!pid || !name) return { ok: false, error: 'Giocatore non valido.' };
        const now = storage.now();
        const lead = E.SPECIES[p.lead] ? p.lead : null;
        storage.set('pres_' + pid, JSON.stringify({ name, lead, lv: Math.max(1, Math.min(100, Number(p.lv) || 1)), zone: cleanName(p.zone).slice(0, 12), t: now }));
        const online = [];
        storage.keys().filter((k) => k.indexOf('pres_') === 0).forEach((k) => {
          let v = null;
          try { v = JSON.parse(storage.get(k)); } catch (e) { /* rotto */ }
          if (!v || now - v.t > PRESENCE_TTL_MS) { storage.del(k); return; }
          const other = k.slice(5);
          if (other !== pid && now - v.t <= ONLINE_MS) online.push({ pid: other, name: v.name, lead: v.lead, lv: v.lv, zone: v.zone });
        });
        online.sort((a, b) => a.name.localeCompare(b.name));
        return { ok: true, online: online.slice(0, 30), invites: readInvites(pid) };
      },

      invite(p) {
        const from = cleanPid(p.pid), to = cleanPid(p.to), name = cleanName(p.name);
        if (!from || !to || !name || from === to) return { ok: false, error: 'Invito non valido.' };
        const code = String(p.code || '').toUpperCase().trim();
        const room = load(code);
        if (!room || room.status !== 'waiting' || room.players[0].name !== name) return { ok: false, error: 'Crea prima una sfida.' };
        if (!storage.get('pres_' + to)) return { ok: false, error: 'Il tuo amico non è più online.' };
        const list = readInvites(to).filter((i) => i.fromPid !== from);
        list.push({ from: name, fromPid: from, code, t: storage.now() });
        storage.set('inv_' + to, JSON.stringify(list.slice(-5)));
        return { ok: true };
      },

      decline(p) {
        const pid = cleanPid(p.pid), code = String(p.code || '').toUpperCase().trim();
        if (!pid) return { ok: false, error: 'Giocatore non valido.' };
        storage.set('inv_' + pid, JSON.stringify(readInvites(pid).filter((i) => i.code !== code)));
        return { ok: true };
      },

      leaderboard() {
        const raw = storage.get('leaderboard');
        const lb = raw ? JSON.parse(raw) : {};
        const rows = Object.keys(lb).map((name) => ({ name, wins: lb[name].wins, losses: lb[name].losses }))
          .sort((a, b) => b.wins - a.wins || a.losses - b.losses).slice(0, 20);
        return { ok: true, rows };
      },
    };

    function handle(params) {
      const fn = actions[params && params.action];
      if (!fn) return { ok: false, error: 'Azione sconosciuta.' };
      try {
        return storage.lock(() => fn(params));
      } catch (e) {
        return { ok: false, error: 'Errore del server: ' + (e && e.message ? e.message : e) };
      }
    }

    return { handle };
  }

  return { createServer };
});
