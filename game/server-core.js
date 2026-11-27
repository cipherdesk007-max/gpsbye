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
  const HORDE_RATE_MS = 20 * 1000;      // Orda: al massimo un punteggio ogni 20 secondi per giocatore
  const HORDE_KEEP = 50;                // Orda: si tengono i 50 migliori (la classifica resta sotto 9 KB)
  const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // niente 0/O, 1/I

  /**
   * storage: { get(key)->string|null, set(key, string), del(key), keys()->[string], lock(fn), now()->ms, random()->0..1,
   *            cache?: { get(k), put(k, v, ttlSec), getAll([k])->{k:v}, remove(k) } }
   * Su Google la cache è CacheService: non consuma la quota giornaliera delle proprietà (50.000 letture/scritture
   * al giorno per un account Gmail), quindi presenze, inviti, Raid e letture delle stanze passano da lì.
   */
  function createServer(storage, E) {
    const C = storage.cache || fallbackCache();
    function fallbackCache() {           // modalità locale e prove: stessa logica, salvata nello storage normale
      return {
        get(k) {
          const raw = storage.get('c_' + k);
          if (!raw) return null;
          try { const o = JSON.parse(raw); if (o.e < storage.now()) { storage.del('c_' + k); return null; } return o.v; } catch (e) { return null; }
        },
        put(k, v, ttl) { storage.set('c_' + k, JSON.stringify({ v, e: storage.now() + ttl * 1000 })); },
        getAll(keys) { const o = {}; keys.forEach((k) => { const v = this.get(k); if (v != null) o[k] = v; }); return o; },
        remove(k) { storage.del('c_' + k); },
      };
    }
    function load(code) {
      const c = C.get('room_' + code);
      if (c) { try { return JSON.parse(c); } catch (e) { /* cache rovinata: si legge l'originale */ } }
      const raw = storage.get('room_' + code);
      return raw ? JSON.parse(raw) : null;
    }
    function save(room) {
      const json = JSON.stringify(room);
      storage.set('room_' + room.code, json);
      C.put('room_' + room.code, json, 21600);
    }

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
      if (C.get('cleanup_t')) return;     // al massimo una pulizia l'ora: risparmia la quota
      C.put('cleanup_t', '1', 3600);
      const now = storage.now();
      storage.keys().filter((k) => k.indexOf('room_') === 0).forEach((k) => {
        try {
          const r = JSON.parse(storage.get(k));
          if (!r || now - r.updated > ROOM_TTL_MS) { storage.del(k); C.remove(k); }
        } catch (e) { storage.del(k); }
      });
    }

    function cleanPid(pid) { const v = String(pid || ''); return /^[a-z0-9]{8,16}$/.test(v) ? v : ''; }
    function readInvites(pid) {
      let list = [];
      try { list = JSON.parse(C.get('inv_' + pid) || '[]'); } catch (e) { list = []; }
      const now = storage.now();
      return list.filter((i) => now - i.t < INVITE_TTL_MS && (() => {
        if (i.kind === 'raid') { const rd = loadRaid(i.code); return rd && rd.status === 'lobby'; }
        const r = load(i.code); return r && r.status === 'waiting';
      })());
    }
    const PRES_TTL_S = Math.round(PRESENCE_TTL_MS / 1000);
    function presenceOf(pid) { const v = C.get('pres_' + pid); try { return v ? JSON.parse(v) : null; } catch (e) { return null; } }

    // ---------- Raid cooperativo: fino a 5 amici contro un boss con la vita in comune ----------
    const RAID_LV_UP = Number(storage.raidLvUp || 2), RAID_ATK = Number(storage.raidAtk || 0.5), RAID_HP_BASE = 1.5, RAID_HP_PER = 1.4;
    const RAID_MAX = 5, RAID_TTL_S = 3600, RAID_TIME_MS = 12 * 60 * 1000, RAID_MOVE_MS = 700;
    const RAID_BOSSES = ['vulkarn', 'abissaro', 'silvatron', 'granitor', 'spettrax', 'fulmix'];
    function loadRaid(code) { const v = C.get('raid_' + code); try { return v ? JSON.parse(v) : null; } catch (e) { return null; } }
    function saveRaid(r) { r.updated = storage.now(); C.put('raid_' + r.code, JSON.stringify(r), RAID_TTL_S); }
    function newRaidCode() {
      for (let tries = 0; tries < 20; tries++) {
        let c = 'R';
        for (let i = 0; i < 4; i++) c += CODE_ALPHABET[Math.floor(storage.random() * CODE_ALPHABET.length)];
        if (!loadRaid(c)) return c;
      }
      throw new Error('Impossibile creare un codice');
    }
    function laneHp(lane) { const t = lane.sides[0].team; return t.reduce((a, m) => a + Math.max(0, m.hp), 0) / Math.max(1, t.reduce((a, m) => a + m.maxhp, 0)); }
    function raidView(r, pid, extra) {
      const me = r.players.find((x) => x.pid === pid);
      const out = {
        ok: true, code: r.code, status: r.status, host: r.host === pid, joined: !!me,
        boss: { species: r.boss.species, level: r.boss.level, hp: r.boss.hp, maxhp: r.boss.maxhp },
        players: r.players.map((x) => ({ name: x.name, lead: (x.team[0] || {}).species, hp: x.lane ? Math.round(laneHp(x.lane) * 100) : 100, dealt: x.dealt, done: x.done })),
        log: r.log, left: r.started ? Math.max(0, RAID_TIME_MS - (storage.now() - r.started)) : RAID_TIME_MS,
      };
      if (me && me.lane) out.me = { turn: me.lane.turn, winner: me.lane.winner, sides: me.lane.sides, done: me.done };
      return Object.assign(out, extra || {});
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
        const xy = (v) => { const n = Number(v); return Number.isInteger(n) && n >= 0 && n < 400 ? n : null; };
        const me = { name, lead, shiny: p.shiny === true || p.shiny === 'true', lv: Math.max(1, Math.min(100, Number(p.lv) || 1)), zone: cleanName(p.zone).slice(0, 14), x: xy(p.x), y: xy(p.y), t: now };
        C.put('pres_' + pid, JSON.stringify(me), PRES_TTL_S);
        let idx = [];
        try { idx = JSON.parse(C.get('pres_idx') || '[]'); } catch (e) { idx = []; }
        if (idx.indexOf(pid) < 0) idx.push(pid);
        const vals = C.getAll(idx.map((k) => 'pres_' + k));
        const alive = idx.filter((k) => k === pid || vals['pres_' + k]);
        C.put('pres_idx', JSON.stringify(alive.slice(-80)), PRES_TTL_S);
        const online = [];
        alive.forEach((k) => {
          if (k === pid) return;
          let v = null;
          try { v = JSON.parse(vals['pres_' + k]); } catch (e) { v = null; }
          if (v && now - v.t <= ONLINE_MS) online.push({ pid: k, name: v.name, lead: v.lead, shiny: !!v.shiny, lv: v.lv, zone: v.zone, x: v.x, y: v.y });
        });
        online.sort((a, b) => a.name.localeCompare(b.name));
        return { ok: true, online: online.slice(0, 30), invites: readInvites(pid) };
      },

      invite(p) {
        const from = cleanPid(p.pid), to = cleanPid(p.to), name = cleanName(p.name);
        if (!from || !to || !name || from === to) return { ok: false, error: 'Invito non valido.' };
        const code = String(p.code || '').toUpperCase().trim();
        const kind = p.kind === 'raid' ? 'raid' : 'sfida';
        if (kind === 'raid') {
          const rd = loadRaid(code);
          if (!rd || rd.status !== 'lobby' || !rd.players.some((x) => x.pid === from)) return { ok: false, error: 'Crea prima un Raid.' };
        } else {
          const room = load(code);
          if (!room || room.status !== 'waiting' || room.players[0].name !== name) return { ok: false, error: 'Crea prima una sfida.' };
        }
        if (!presenceOf(to)) return { ok: false, error: 'Il tuo amico non è più online.' };
        const list = readInvites(to).filter((i) => !(i.fromPid === from && i.kind === kind));
        list.push({ from: name, fromPid: from, code, kind, t: storage.now() });
        C.put('inv_' + to, JSON.stringify(list.slice(-5)), Math.round(INVITE_TTL_MS / 1000));
        return { ok: true };
      },

      decline(p) {
        const pid = cleanPid(p.pid), code = String(p.code || '').toUpperCase().trim();
        if (!pid) return { ok: false, error: 'Giocatore non valido.' };
        C.put('inv_' + pid, JSON.stringify(readInvites(pid).filter((i) => i.code !== code)), Math.round(INVITE_TTL_MS / 1000));
        return { ok: true };
      },

      raidCreate(p) {
        const pid = cleanPid(p.pid), name = cleanName(p.name);
        if (!pid || !name) return { ok: false, error: 'Giocatore non valido.' };
        const t = parseTeam(p.team);
        if (t.error) return { ok: false, error: t.error };
        const day = new Date(storage.now()).toISOString().slice(0, 10);
        const r = {
          code: newRaidCode(), host: pid, status: 'lobby', created: storage.now(), started: 0, seed: Math.floor(storage.random() * 4294967295) >>> 0,
          boss: { species: RAID_BOSSES[E.hashString('raid' + day) % RAID_BOSSES.length], level: 0, hp: 0, maxhp: 0 },
          players: [{ pid, name, team: t.team, dealt: 0, lane: null, done: false, last: 0 }], log: [],
        };
        saveRaid(r);
        return raidView(r, pid);
      },

      raidJoin(p) {
        const pid = cleanPid(p.pid), name = cleanName(p.name);
        if (!pid || !name) return { ok: false, error: 'Giocatore non valido.' };
        const r = loadRaid(String(p.code || '').toUpperCase().trim());
        if (!r) return { ok: false, error: 'Raid non trovato. Controlla il codice.' };
        if (r.players.some((x) => x.pid === pid)) return raidView(r, pid);
        if (r.status !== 'lobby') return { ok: false, error: 'Il Raid è già cominciato.' };
        if (r.players.length >= RAID_MAX) return { ok: false, error: 'Il Raid è pieno (5 giocatori).' };
        if (r.players.some((x) => x.name === name)) return { ok: false, error: 'C\'è già un giocatore con questo nome.' };
        const t = parseTeam(p.team);
        if (t.error) return { ok: false, error: t.error };
        r.players.push({ pid, name, team: t.team, dealt: 0, lane: null, done: false, last: 0 });
        saveRaid(r);
        return raidView(r, pid);
      },

      raidStart(p) {
        const pid = cleanPid(p.pid);
        const r = loadRaid(String(p.code || '').toUpperCase().trim());
        if (!r) return { ok: false, error: 'Raid non trovato.' };
        if (r.host !== pid) return { ok: false, error: 'Solo chi ha creato il Raid può farlo partire.' };
        if (r.status !== 'lobby') return raidView(r, pid);
        const n = r.players.length;
        const avg = r.players.reduce((a, x) => a + Math.max.apply(null, x.team.map((m) => m.level)), 0) / n;
        // come nei Raid veri: tanta vita in comune, colpi meno devastanti, livello poco sopra la squadra
        const level = Math.max(12, Math.min(70, Math.round(avg) + RAID_LV_UP));
        const boss = E.createMonster(r.boss.species, level, 'boss', { shiny: false, talents: [12, 12, 12, 12] });
        // forza dei colpi che cresce col livello: duro ma battibile a 15, impegnativo a 30+
        boss.atk = Math.max(5, Math.round(boss.atk * Math.max(0.45, Math.min(1, RAID_ATK + (level - 17) * 0.04))));
        const maxhp = Math.round(boss.maxhp * (RAID_HP_BASE + RAID_HP_PER * n));
        r.boss.level = level; r.boss.maxhp = maxhp; r.boss.hp = maxhp;
        r.players.forEach((x, i) => {
          const b = E.clone(boss); b.maxhp = maxhp; b.hp = maxhp; b.name = boss.name + ' Gigante';
          x.lane = E.createBattle((r.seed + i * 7919) >>> 0, [{ name: x.name, team: x.team }, { name: 'Boss', team: [b] }]);
          x.team = x.team.map((m) => ({ species: m.species, level: m.level })); // la squadra vive nella lotta
        });
        r.status = 'fight';
        r.started = storage.now();
        saveRaid(r);
        return raidView(r, pid);
      },

      raidMove(p) {
        const pid = cleanPid(p.pid);
        const r = loadRaid(String(p.code || '').toUpperCase().trim());
        if (!r) return { ok: false, error: 'Raid non trovato.' };
        const me = r.players.find((x) => x.pid === pid);
        if (!me) return { ok: false, error: 'Non sei in questo Raid.' };
        const now = storage.now();
        if (r.status === 'fight' && now - r.started > RAID_TIME_MS) { r.status = 'lost'; saveRaid(r); }
        if (r.status !== 'fight' || me.done) return raidView(r, pid);
        if (Number(p.turn) !== me.lane.turn + 1) return raidView(r, pid);
        if (now - me.last < RAID_MOVE_MS) return raidView(r, pid, { wait: true });
        let action;
        try { action = typeof p.act === 'string' ? JSON.parse(p.act) : p.act; } catch (e) { return { ok: false, error: 'Mossa non leggibile.' }; }
        const side = me.lane.sides[0], mon = side.team[side.active];
        if (!action || (action.kind !== 'move' && action.kind !== 'switch')) return { ok: false, error: 'Mossa non valida.' };
        if (action.kind === 'move' && !mon.moves.includes(action.move)) return { ok: false, error: 'Mossa non disponibile.' };
        if (action.kind === 'switch' && !(side.team[action.to] && side.team[action.to].hp > 0)) return { ok: false, error: 'Cambio non valido.' };
        const bossMon = me.lane.sides[1].team[0];
        bossMon.hp = r.boss.hp;                       // la vita del boss è in comune
        const before = r.boss.hp;
        const events = E.resolveTurn(me.lane, [action, E.aiChoose(me.lane, 1, (r.seed + now) >>> 0, 'normale')]);
        me.lane.log = [];
        const dealt = Math.max(0, before - Math.max(0, bossMon.hp));
        r.boss.hp = Math.max(0, before - dealt);
        me.dealt += dealt;
        me.last = now;
        if (dealt > 0) r.log = r.log.concat([{ n: me.name, d: dealt }]).slice(-8);
        if (r.boss.hp <= 0) r.status = 'won';
        else if (me.lane.winner === 1 || me.lane.sides[0].team.every((m) => m.hp <= 0)) {
          me.done = true;
          if (r.players.every((x) => x.done)) r.status = 'lost';
        }
        saveRaid(r);
        return raidView(r, pid, { lastEvents: events, dealt });
      },

      raidState(p) {
        const pid = cleanPid(p.pid);
        const r = loadRaid(String(p.code || '').toUpperCase().trim());
        if (!r) return { ok: false, error: 'Raid non trovato.' };
        if (r.status === 'fight' && storage.now() - r.started > RAID_TIME_MS) { r.status = 'lost'; saveRaid(r); }
        return raidView(r, pid);
      },

      /** Modalità Orda: invio del punteggio con controlli di plausibilità. */
      hordeScore(p) {
        const pid = cleanPid(p.pid), name = cleanName(p.name);
        if (!pid || !name) return { ok: false, error: 'Giocatore non valido.' };
        const wave = Number(p.wave), score = Number(p.score);
        if (!Number.isInteger(wave) || wave < 1 || wave > 300) return { ok: false, error: 'Ondata non valida.' };
        if (!Number.isInteger(score) || score < 0 || score > wave * 5000) return { ok: false, error: 'Punteggio non valido.' };
        if (!E.SPECIES[p.species]) return { ok: false, error: 'Creatura non valida.' };
        const now = storage.now();
        let rate = {};
        try { rate = JSON.parse(storage.get('horde_rate') || '{}'); } catch (e) { rate = {}; }
        Object.keys(rate).forEach((k) => { if (now - rate[k] > HORDE_RATE_MS * 3) delete rate[k]; });
        if (rate[pid] && now - rate[pid] < HORDE_RATE_MS) return { ok: false, error: 'Aspetta qualche secondo prima di inviare un altro punteggio.' };
        rate[pid] = now;
        storage.set('horde_rate', JSON.stringify(rate));
        let lb = {};
        try { lb = JSON.parse(storage.get('horde_lb') || '{}'); } catch (e) { lb = {}; }
        const prev = lb[name];
        const best = !prev || score > prev.s;
        if (best) lb[name] = { s: score, w: wave, sp: p.species, t: now };
        // si tengono solo i migliori: la chiave resta piccola
        const names = Object.keys(lb).sort((a, b) => lb[b].s - lb[a].s);
        names.slice(HORDE_KEEP).forEach((n) => delete lb[n]);
        storage.set('horde_lb', JSON.stringify(lb));
        const rank = names.indexOf(name) + 1;
        return { ok: true, best, rank: rank > 0 && rank <= HORDE_KEEP ? rank : null };
      },

      hordeTop() {
        let lb = {};
        try { lb = JSON.parse(storage.get('horde_lb') || '{}'); } catch (e) { lb = {}; }
        const rows = Object.keys(lb).map((name) => ({ name, score: lb[name].s, wave: lb[name].w, species: lb[name].sp }))
          .sort((a, b) => b.score - a.score).slice(0, 20);
        return { ok: true, rows };
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
