/*
 * FMLAB Monsters — il gioco (schermate, mappa, lotte, sfide)
 */
(function () {
  'use strict';
  const E = window.FMLABEngine, Art = window.FMLABArt, G3 = window.FMLAB3D, ST = window.FMLABStory;
  // 3D se il telefono ha WebGL; ?2d nell'indirizzo forza la grafica piatta
  const use3D = !!(G3 && G3.supported() && !/[?&]2d\b/.test(location.search));
  let mapScene = null, battleScene = null;
  const mount3D = (id, scene) => { const el = document.getElementById(id); return !!(use3D && el && G3.mount(el, scene)); };
  const app = document.getElementById('app');
  const SAVE_KEY = 'fmlab-monsters-save-v1';
  const ENCOUNTER_RATE = 0.13;

  // ---------- Salvataggio (localStorage, con riserva in memoria) ----------
  const mem = {};
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return k in mem ? mem[k] : null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { mem[k] = v; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { delete mem[k]; } },
    keys(prefix) {
      try {
        const out = [];
        for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.indexOf(prefix) === 0) out.push(k); }
        return out;
      } catch (e) { return Object.keys(mem).filter((k) => k.indexOf(prefix) === 0); }
    },
  };

  let save = null;
  let screen = 'title';
  const debug = { catchLuck: null, encounterRate: null, fast: false, hour: null, noLife: false, weather: null, noStory: !!window.__FMLAB_NOSTORY };
  const storyOn = () => !!(ST && save && !debug.noStory);

  // ---------- Audio, vibrazione, impostazioni ----------
  const AU = window.FMLABAudio || { sfx() {}, music() {}, unlock() {}, stop() {}, buzz() {}, setMusic() {}, setSfx() {}, setVibra() {} };
  const sfx = (n) => { try { AU.sfx(n); } catch (e) { /* muto */ } };
  const buzz = (p) => { if (!debug.fast) try { AU.buzz(p); } catch (e) { /* ok */ } };
  const fx = { damage: 0, banners: 0, wipes: 0, evolutions: 0, victories: 0, shakes: 0 };
  function defaultSettings() { return { music: AU.musicVol != null ? AU.musicVol : 0.6, sfx: AU.sfxVol != null ? AU.sfxVol : 0.8, vibra: AU.vibra !== false, quality: 'auto', fastText: false }; }
  function applySettings() {
    if (!save) return;
    // si completa l'oggetto esistente (chi lo tiene in mano, come la schermata Impostazioni, lo vede aggiornato)
    const def = defaultSettings();
    save.settings = save.settings || {};
    Object.keys(def).forEach((k) => { if (save.settings[k] == null) save.settings[k] = def[k]; });
    const st0 = save.settings;
    AU.setMusic(st0.music); AU.setSfx(st0.sfx); AU.setVibra(st0.vibra);
    if (G3 && use3D) G3.quality = st0.quality === 'auto' ? 'auto' : st0.quality;
  }
  function musicForMap() {
    if (!save) return;
    const z = zoneAt(save.pos.y), h = hourNow(), night = h >= 20.5 || h < 5.5;
    AU.music(z === 'grotta' ? 'grotta' : night ? 'notte' : z === 'citta' ? 'borgo' : z === 'bosco' ? 'bosco' : 'percorso');
  }
  setInterval(() => { if (screen === 'map') musicForMap(); }, 60000);
  // suono dei tasti (le mosse e le frecce hanno i loro)
  document.addEventListener('click', (e) => {
    const b = e.target && e.target.closest && e.target.closest('button');
    if (!b || b.classList.contains('move') || b.closest('.dpad')) return;
    sfx(b.id === 'back' || b.id === 'ccClose' || b.id === 'invNo' ? 'indietro' : 'tasto');
  }, true);

  function defaultSave(name) {
    return { v: 2, settings: defaultSettings(), name, team: [], box: [], capsules: 5, pos: { x: Wd.start.x, y: Wd.start.y }, items: {}, gift: '', pid: newPid(), story: newStory(), serverUrl: '', seen: {}, caught: {}, steps: 0, wins: 0, losses: 0 };
  }
  function newStory() { return { intro: false, beaten: {}, badges: {}, starter: null, playMs: 0 }; }
  function newPid() { let s0 = ''; while (s0.length < 12) s0 += Math.random().toString(36).slice(2); return s0.replace(/[^a-z0-9]/g, '').slice(0, 12); }
  function loadSave() {
    try {
      const raw = store.get(SAVE_KEY);
      if (!raw) return null;
      const s0 = JSON.parse(raw);
      // salvataggi della prima versione: il mondo è cambiato, si riparte dal Borgo con la stessa squadra
      if (!s0.v || s0.v < 2) { s0.v = 2; s0.pos = { x: Wd.start.x, y: Wd.start.y }; s0.items = {}; s0.gift = ''; }
      const t = MAP[s0.pos.y] && MAP[s0.pos.y][s0.pos.x];
      if (!t || SOLID.has(t)) s0.pos = { x: Wd.start.x, y: Wd.start.y };
      if (!s0.pid) s0.pid = newPid();
      s0.story = Object.assign(newStory(), s0.story || {});
      if (!s0.story.starter && s0.team && s0.team[0]) s0.story.starter = s0.team[0].species;
      return s0;
    } catch (e) { return null; }
  }
  function persist() { if (save) store.set(SAVE_KEY, JSON.stringify(save)); }

  // ---------- Utilità ----------
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sleep = (ms) => new Promise((r) => setTimeout(r, debug.fast ? 5 : ms));
  const typeOf = (mon) => E.SPECIES[mon.species].type;
  const pill = (type) => `<span class="pill" style="background:${E.TYPES[type].color}">${E.TYPES[type].name}</span>`;
  const hpCls = (r) => (r > 0.5 ? '' : r > 0.2 ? 'mid' : 'low');
  const STATUS_TAG = { brn: ['BRU', '#f97316'], par: ['PAR', '#eab308'], slp: ['SON', '#94a3b8'], psn: ['VEL', '#a855f7'] };
  const STATUS_TXT = { brn: 'è bruciato', par: 'è paralizzato', slp: 'si è addormentato', psn: 'è avvelenato' };
  const statusTag = (st0) => (st0 && STATUS_TAG[st0] ? `<span class="stag" style="background:${STATUS_TAG[st0][1]}">${STATUS_TAG[st0][0]}</span>` : '');
  const shinyMark = (m) => (m && m.shiny ? '<span class="shiny" title="Shiny">✨</span>' : '');
  const hpBar = (hp, max) => `<div class="hpbar"><i class="${hpCls(hp / max)}" style="width:${Math.max(0, (hp / max) * 100)}%"></i></div>`;
  function xpPct(mon) {
    const a = E.xpForLevel(mon.level), b = E.xpForLevel(mon.level + 1);
    return Math.max(0, Math.min(100, ((mon.xp - a) / (b - a)) * 100));
  }
  function healAll() {
    save.team.forEach((m) => { m.hp = m.maxhp; });
    save.box.forEach((m) => { m.hp = m.maxhp; });
    if (save.capsules < 5) save.capsules = 5;
  }

  // ---------- Mappa (generata, sempre uguale) ----------
  const Wd = window.FMLABWorld;
  const MAP_W = Wd.W, MAP_H = Wd.H, MAP = Wd.grid, ZONE_NAMES = Wd.ZONE_NAMES, zoneAt = Wd.zoneAt;
  const SOLID = Wd.SOLID;
  const isEncounter = Wd.isEncounter;
  function clockText() { const h = hourNow(), hh = Math.floor(h), mm = Math.floor((h - hh) * 60); return (weatherNow() === 'pioggia' ? '🌧️ ' : h >= 6.5 && h < 19.5 ? '☀️ ' : '🌙 ') + String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0'); }
  /** Meteo del giorno: uguale per tutti gli amici (dipende solo dalla data e dall'ora). */
  function weatherNow() {
    if (debug.weather) return debug.weather;
    const d = new Date(), key = d.toISOString().slice(0, 10) + ':' + Math.floor(d.getHours() / 3);
    return E.hashString(key) % 100 < 22 ? 'pioggia' : 'sole';
  }
  const hourNow = () => { if (debug.hour != null) return debug.hour; const d = new Date(); return d.getHours() + d.getMinutes() / 60; };

  const VIEW_W = 11, VIEW_H = 13, T = 32;
  function drawMap() {
    const canvas = document.getElementById('map');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = VIEW_W * T; canvas.height = VIEW_H * T;
    const cx = Math.min(Math.max(save.pos.x - Math.floor(VIEW_W / 2), 0), MAP_W - VIEW_W);
    const cy = Math.min(Math.max(save.pos.y - Math.floor(VIEW_H / 2), 0), MAP_H - VIEW_H);
    for (let vy = 0; vy < VIEW_H; vy++) for (let vx = 0; vx < VIEW_W; vx++) {
      drawTile(ctx, cx + vx, cy + vy, vx * T, vy * T);
    }
    drawPlayer(ctx, (save.pos.x - cx) * T, (save.pos.y - cy) * T);
  }
  function drawTile(ctx, x, y, px, py) {
    const t = MAP[y][x], z = zoneAt(y);
    const ground = { citta: '#d8c9a2', prato: '#cdb88a', fiume: '#c9c08a', bosco: '#8f7f57', grotta: '#5a5248' }[z];
    const fill = (c, ox = 0, oy = 0, w = T, h = T) => { ctx.fillStyle = c; ctx.fillRect(px + ox, py + oy, w, h); };
    const rnd = E.makeRng(x * 131 + y * 977);
    switch (t) {
      case '.': fill(ground); for (let i = 0; i < 3; i++) fill('rgba(0,0,0,.06)', rnd() * 28, rnd() * 28, 3, 3); break;
      case ',': case ';': {
        fill(t === ',' ? '#5fbf5a' : '#3d8a4c');
        ctx.strokeStyle = t === ',' ? '#3f9a3e' : '#24653a'; ctx.lineWidth = 2;
        for (let i = 0; i < 5; i++) { const bx = px + 3 + rnd() * 24, by = py + 10 + rnd() * 18; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + 3, by - 9); ctx.moveTo(bx + 4, by); ctx.lineTo(bx + 8, by - 7); ctx.stroke(); }
        break;
      }
      case ':': fill('#5a5248'); for (let i = 0; i < 4; i++) fill('#4a433b', rnd() * 26, rnd() * 26, 5, 4); break;
      case '#': fill('#5a5248'); ctx.fillStyle = '#3b3530'; ctx.beginPath(); ctx.moveTo(px + 2, py + T); ctx.lineTo(px + 8, py + 6); ctx.lineTo(px + 22, py + 3); ctx.lineTo(px + 30, py + T); ctx.fill(); fill('#6b625a', 9, 7, 10, 4); break;
      case 'T': fill(z === 'bosco' ? '#3d8a4c' : '#5fbf5a'); fill('#6b4423', 13, 20, 6, 10);
        ctx.fillStyle = z === 'bosco' ? '#1f5c33' : '#2f7d3a'; ctx.beginPath(); ctx.arc(px + 16, py + 14, 13, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.beginPath(); ctx.arc(px + 12, py + 10, 5, 0, Math.PI * 2); ctx.fill(); break;
      case '~': fill('#3b8fd9'); ctx.strokeStyle = '#8cc6ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px + 4, py + 12); ctx.quadraticCurveTo(px + 10, py + 7, px + 16, py + 12); ctx.moveTo(px + 14, py + 22); ctx.quadraticCurveTo(px + 20, py + 17, px + 26, py + 22); ctx.stroke(); break;
      case 'H': case 'D': {
        fill(ground);
        if (y === 47) { fill('#e0483e', 0, 6); fill('#b8322a', 0, 24, T, 8); }
        else { fill('#f1ece4'); fill('#d9d2c6', 0, 26, T, 6); }
        if (t === 'D') { fill('#7a4b2a', 7, 6, 18, 26); fill('#ffd23f', 20, 18, 3, 3); }
        if (x === 20 && y === 48) { ctx.fillStyle = '#e0483e'; ctx.font = 'bold 10px system-ui'; ctx.textAlign = 'center'; ctx.fillText('FMLAB', px + 16, py + 18); }
        break;
      }
      case 'K': case 'L': fill(ground); fill(t === 'L' ? '#7a4b2a' : '#3b82f6', t === 'L' ? 9 : 0, t === 'L' ? 8 : 4, t === 'L' ? 14 : T, t === 'L' ? 24 : T - 4); break;
      case 'M': fill(ground); fill('#f3ede2', 0, 10, T, T - 10); fill('#f59e0b', 0, 0, T, 12); break;
      case 'F': fill(ground); fill('#a8754a', 0, 12, T, 3); fill('#a8754a', 0, 20, T, 3); fill('#7a4b2a', 14, 8, 4, 20); break;
      case 'P': fill('#e6d6a8'); ctx.fillStyle = '#c9c2b6'; ctx.beginPath(); ctx.arc(px + 16, py + 16, 14, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#4fa6e6'; ctx.beginPath(); ctx.arc(px + 16, py + 16, 10, 0, Math.PI * 2); ctx.fill(); break;
      case 's': fill('#e6d39a'); break;
      case 'r': fill('#7fae58'); ctx.strokeStyle = '#6f8a3a'; ctx.lineWidth = 2; for (let i = 0; i < 4; i++) { const bx = px + 4 + rnd() * 24; ctx.beginPath(); ctx.moveTo(bx, py + 30); ctx.lineTo(bx + 2, py + 4); ctx.stroke(); } break;
      case '=': fill('#3b8fd9'); for (let i = 0; i < 4; i++) fill(i % 2 ? '#9a6b42' : '#a8754a', 0, i * 8, T, 7); break;
      case 'o': fill(ground); for (let i = 0; i < 4; i++) fill(['#fff', '#ffd23f', '#ff8fb3', '#a78bfa'][i], 4 + rnd() * 22, 4 + rnd() * 22, 5, 5); break;
      default: fill(ground);
    }
  }
  function drawPlayer(ctx, px, py) {
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(px + 16, py + 28, 10, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1f2937'; ctx.fillRect(px + 10, py + 18, 12, 10);
    ctx.fillStyle = '#ffd7b5'; ctx.beginPath(); ctx.arc(px + 16, py + 13, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3b82f6'; ctx.beginPath(); ctx.arc(px + 16, py + 10, 7.5, Math.PI, 0); ctx.fill(); ctx.fillRect(px + 16, py + 8, 10, 3);
    ctx.fillStyle = '#22c55e'; ctx.fillRect(px + 10, py + 18, 12, 4);
  }

  // ---------- Titolo ----------
  // "Tocca per iniziare": nei browser automatici (test) si salta, a meno di window.__FMLAB_SPLASH
  let titleTapped = false;
  function showTitle() {
    screen = 'title';
    const existing = loadSave();
    const splash = !titleTapped && (!navigator.webdriver || window.__FMLAB_SPLASH);
    const letters = (t, cls) => t.split('').map((c, i) => `<span class="${cls}" style="--i:${i}">${c === ' ' ? '&nbsp;' : esc(c)}</span>`).join('');
    app.innerHTML = `<div class="screen title${splash ? ' splash' : ''}" id="titleScreen">
      <div class="stars"></div>
      <h1 class="sr">FMLAB Monsters</h1>
      <div class="logo" aria-hidden="true"><div class="big">${letters('FMLAB', 'l1')}</div><div class="big2">${letters('MONSTERS', 'l2')}</div><div class="sub">Cattura, allena, sfida i tuoi amici</div></div>
      ${use3D ? '<div class="hero3d" id="hero3d"></div>' : `<div class="hero">${Art.monsterSVG('fiammino', { size: 112 })}${Art.monsterSVG('goccino', { size: 112 })}${Art.monsterSVG('semino', { size: 112 })}</div>`}
      ${splash ? '<button class="tapStart" id="tapStart">Tocca per iniziare</button>' : ''}
      <div class="titleMenu" id="titleMenu">
        ${existing ? `<button class="btn green" id="cont">Continua — ${esc(existing.name)}</button>` : ''}
        <div class="card"><div class="mut" style="margin-bottom:8px">${existing ? 'Oppure ricomincia da capo' : 'Come ti chiami?'}</div>
          <input class="field" id="name" maxlength="16" placeholder="Il tuo nome" autocomplete="off"></div>
        <button class="btn${existing ? ' sec' : ''}" id="new">${existing ? 'Nuova avventura' : 'Inizia'}</button>
        <div class="err" id="err"></div>
      </div>
      <div class="mut foot">Creature, mondo e regole originali FMLAB</div>
    </div>`;
    AU.music('titolo');
    mount3D('hero3d', G3 && G3.createShowcase(E.STARTERS, { gap: 1.5 }));
    if (splash) {
      const ts = document.getElementById('titleScreen');
      const go = (e) => {
        if (e) e.preventDefault();
        if (titleTapped) return;
        titleTapped = true;
        AU.unlock(); sfx('medaglia'); buzz(30);
        ts.classList.remove('splash'); ts.classList.add('opened');
        const tb = document.getElementById('tapStart'); if (tb) tb.remove();
      };
      document.getElementById('tapStart').addEventListener('click', go);
      ts.addEventListener('pointerdown', (e) => { if (!e.target.closest('#titleMenu')) go(e); });
    }
    if (existing) document.getElementById('cont').onclick = () => { save = existing; applySettings(); showMap(); };
    const btn = document.getElementById('new');
    btn.onclick = () => {
      const name = document.getElementById('name').value.trim();
      if (!name) { document.getElementById('err').textContent = 'Scrivi il tuo nome.'; return; }
      if (existing && btn.dataset.armed !== '1') {
        btn.dataset.armed = '1';
        btn.textContent = 'Tocca di nuovo: i progressi di ' + existing.name + ' verranno cancellati';
        btn.classList.add('red');
        return;
      }
      showStarter(name);
    };
  }

  // ---------- Scelta iniziale ----------
  function showStarter(name) {
    screen = 'starter';
    let pick = E.STARTERS[0], pickScene = null;
    const draw = () => {
      app.innerHTML = `<div class="screen">
        <h2>Ciao ${esc(name)}! Scegli il tuo compagno</h2>
        <div class="mut">Ti seguirà per tutta l'avventura. Fuoco batte Erba, Erba batte Acqua, Acqua batte Fuoco.</div>
        ${use3D ? '<div class="pick3d" id="pick3d"></div>' : ''}
        <div class="starters">${E.STARTERS.map((id) => {
          const sp = E.SPECIES[id];
          return `<button class="starter${id === pick ? ' sel' : ''}" data-id="${id}">${Art.monsterSVG(id, { size: 104 })}<div class="n">${sp.name}</div>${pill(sp.type)}</button>`;
        }).join('')}</div>
        <div class="card">${starterText(pick)}</div>
        <button class="btn green" id="go">Scegli ${E.SPECIES[pick].name}</button>
      </div>`;
      if (use3D) { if (!pickScene) pickScene = G3.createShowcase([pick], { spin: true, size: 1.15 }); pickScene.ids = [pick]; mount3D('pick3d', pickScene); }
      app.querySelectorAll('.starter').forEach((b) => { b.onclick = () => { pick = b.dataset.id; draw(); }; });
      document.getElementById('go').onclick = () => newGame(name, pick);
    };
    draw();
  }
  function starterText(id) {
    return {
      fiammino: '<b>Fiammino</b> — coraggioso e veloce. Diventa Braciolo al livello 12 e Vulkarn al 24.',
      goccino: '<b>Goccino</b> — resistente e calmo. Diventa Ondaro al livello 12 e Abissaro al 24.',
      semino: '<b>Semino</b> — equilibrato e paziente. Diventa Fogliardo al livello 12 e Silvatron al 24.',
    }[id];
  }
  function newGame(name, starter) {
    save = defaultSave(name);
    applySettings();
    const mon = E.createMonster(starter, 5);
    save.team.push(mon);
    save.seen[starter] = true; save.caught[starter] = true;
    save.story.starter = starter;
    persist();
    if (storyOn()) showMap(); // il Prof. Ferri parla appena si apre la mappa
    else showMap(`Benvenuto nel Borgo FMLAB, ${name}! Nell'erba alta si nascondono creature selvatiche. Il Centro FMLAB (tetto rosso) cura la squadra.`);
  }

  // ---------- Mappa ----------
  let toastTimer = null;
  function toast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg; el.style.display = 'block';
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.style.display = 'none'; }, debug.fast ? 50 : 4200);
  }
  function showMap(message) {
    screen = 'map';
    const lead = save.team[0];
    app.innerHTML = `<div class="screen${use3D ? ' full' : ''}">
      <div class="hud"><div class="grow"><div class="zone" id="zone">${ZONE_NAMES[zoneAt(save.pos.y)]}</div><div class="mut"><span id="clock">${clockText()}</span> · Capsule <b id="caps">${save.capsules}</b> · ${Object.keys(save.caught).length}/15</div></div>
        <div style="width:104px;flex:none">${lead ? `<div class="row" style="justify-content:space-between"><b>${esc(lead.name)}${shinyMark(lead)}</b><span class="mut">Lv ${lead.level}</span></div>${hpBar(lead.hp, lead.maxhp)}` : ''}</div>
        <button class="ico" id="mPod" aria-label="FMLAB Pod: amici online">📱<i class="dot" id="podDot"></i></button>
        ${use3D ? `<button class="ico" id="mRot" aria-label="Gira la visuale">⟳</button>${canFullscreen() ? '<button class="ico" id="mFull" aria-label="Schermo intero">⛶</button>' : ''}` : ''}</div>
      <div class="invite" id="invite"></div><div class="centercard" id="centerCard"></div>
      <div class="mapwrap">${use3D ? '<div class="map3d" id="map3d"></div>' : '<canvas id="map"></canvas>'}<div class="toast" id="toast"></div></div>
      <div class="controls">
        <div class="dpad"><span></span><button data-d="0,-1" aria-label="Su">▲</button><span></span>
          <button data-d="-1,0" aria-label="Sinistra">◀</button><span></span><button data-d="1,0" aria-label="Destra">▶</button>
          <span></span><button data-d="0,1" aria-label="Giù">▼</button><span></span></div>
        <div class="menu"><button class="btn sec" id="mTeam">Squadra</button><button class="btn sec" id="mDex">Archivio</button><button class="btn sec" id="mDiary">Diario</button><button class="btn" id="mPvp">Sfide</button><button class="btn orda" id="mHorde">🔥 Orda</button><button class="btn sec" id="mSet">⚙️ Opzioni</button></div>
      </div>
    </div>`;
    if (use3D) {
      if (!mapScene) mapScene = G3.createMapScene({ world: Wd, getHour: hourNow, getWeather: weatherNow });
      mapScene.setQuarter(save.camQ || 0);
      mapScene.setPlayer(save.pos.x, save.pos.y, true);
      mapScene.setFollower(lead && lead.species);
      mount3D('map3d', mapScene);
      layout3D();
      startLife();
      document.getElementById('mRot').onclick = () => { mapScene.rotate(1); save.camQ = mapScene.quarter; persist(); };
      const fb = document.getElementById('mFull'); if (fb) fb.onclick = toggleFullscreen;
    } else drawMap();
    bindDpad();
    document.getElementById('mTeam').onclick = showTeam;
    document.getElementById('mDex').onclick = showDex;
    document.getElementById('mPvp').onclick = showPvp;
    document.getElementById('mHorde').onclick = startHorde;
    document.getElementById('mSet').onclick = showSettings;
    document.getElementById('mDiary').onclick = showDiary;
    document.getElementById('mPod').onclick = () => showLounge(false);
    renderInvite();
    startPresence();
    if (message) toast(message);
    persist();
    if (!use3D) startLife();
    if (storyOn() && !save.story.intro) playIntro();
    musicForMap();
  }
  let holdTimer = null;
  function bindDpad() {
    app.querySelectorAll('.dpad button').forEach((b) => {
      const [dx, dy] = b.dataset.d.split(',').map(Number);
      const start = (e) => { e.preventDefault(); stop(); inputStep(dx, dy); holdTimer = setInterval(() => inputStep(dx, dy), 170); };
      const stop = () => { clearInterval(holdTimer); holdTimer = null; };
      b.addEventListener('pointerdown', start);
      ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => b.addEventListener(ev, stop));
    });
  }
  document.addEventListener('keydown', (e) => {
    const k = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] }[e.key];
    if (k && screen === 'map') { e.preventDefault(); inputStep(k[0], k[1]); }
  });
  /** Le frecce seguono la visuale: "su" va sempre verso il fondo dello schermo. */
  function inputStep(ix, iy) {
    if (use3D && mapScene) { const w = mapScene.screenToWorld(ix, iy); step(w[0], w[1]); } else step(ix, iy);
  }
  // ---------- Schermo intero e adattamento alla rotazione ----------
  function canFullscreen() { const d = document.documentElement; return !!(d.requestFullscreen || d.webkitRequestFullscreen); }
  function toggleFullscreen() {
    const d = document.documentElement;
    if (document.fullscreenElement || document.webkitFullscreenElement) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
    const req = d.requestFullscreen || d.webkitRequestFullscreen;
    Promise.resolve(req.call(d)).then(() => { try { window.screen.orientation && window.screen.orientation.lock && window.screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* non supportato */ } }).catch(() => {});
  }
  /** Dice alla scena 3D quale parte dello schermo è libera dai comandi. */
  function layout3D() {
    const W = window.innerWidth, H = window.innerHeight, land = W > H && H < 560;
    if (screen === 'battle' && battleScene) battleScene.view = land ? { x0: 0, y0: 0, x1: Math.max(0.45, 1 - 360 / W), y1: 1 } : { x0: 0, y0: 0, x1: 1, y1: Math.max(0.42, 1 - 285 / H) };
    if (screen === 'map' && mapScene) mapScene.view = land ? { x0: 0, y0: 0, x1: 1, y1: 1 } : { x0: 0, y0: 0, x1: 1, y1: Math.max(0.5, 1 - 120 / H) };
  }
  window.addEventListener('resize', layout3D);
  window.addEventListener('orientationchange', () => setTimeout(layout3D, 250));
  function step(dx, dy) {
    if (screen !== 'map') { clearInterval(holdTimer); return; }
    if (dlg.open || story.busy) { clearInterval(holdTimer); return; }
    const nx = save.pos.x + dx, ny = save.pos.y + dy;
    if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) return;
    const t = MAP[ny][nx];
    if (SOLID.has(t)) return;
    const face = () => { if (mapScene) mapScene.yaw = Math.atan2(dx, dy); };
    const npc = life.npcs.find((n) => n.x === nx && n.y === ny);
    if (npc) { face(); clearInterval(holdTimer); say(npc.name, [npc.lines[npc.say++ % npc.lines.length]]); return; }
    if (storyOn()) {
      const who = storyAt(nx, ny);
      if (who) { face(); clearInterval(holdTimer); talkTo(who); return; }
      const gate = ST.GATES.find((g) => !save.story.badges[g.need] && g.test(nx, ny, t));
      if (gate) { face(); clearInterval(holdTimer); say(gate.name, gate.lines); return; }
    }
    const prevZone = zoneAt(save.pos.y);
    const cc0 = document.getElementById('centerCard'); if (cc0) cc0.style.display = 'none';
    save.pos = { x: nx, y: ny };
    save.steps += 1;
    if (use3D && mapScene) mapScene.setPlayer(nx, ny, false, dx, dy); else drawMap();
    sfx(isEncounter(t) ? 'erba' : 'passo');
    const z = zoneAt(ny);
    if (z !== prevZone) { document.getElementById('zone').textContent = ZONE_NAMES[z]; toast(ZONE_NAMES[z]); musicForMap(); }
    if (t === 'D') {
      healAll(); persist();
      sfx('cura'); buzz(40);
      document.getElementById('caps').textContent = save.capsules;
      const cc = document.getElementById('centerCard');
      cc.innerHTML = `<div class="card glass"><b>Centro FMLAB</b><div class="mut" style="margin:4px 0 10px">Squadra curata e capsule ricaricate ✓</div>
        <div class="row"><button class="btn green grow" id="goLounge">⬆ Sala Online${presence.online.length ? ' (' + presence.online.length + ')' : ''}</button><button class="btn sec" id="ccClose">Esci</button></div></div>`;
      cc.style.display = 'block';
      document.getElementById('goLounge').onclick = () => showLounge(true);
      document.getElementById('ccClose').onclick = () => { cc.style.display = 'none'; };
      return;
    }
    if (t === 'L') {
      const today = new Date().toISOString().slice(0, 10);
      clearInterval(holdTimer);
      if (save.gift !== today) { save.gift = today; save.capsules = Math.min(20, save.capsules + 3); persist(); sfx('oggetto'); document.getElementById('caps').textContent = save.capsules; say('Prof. Ferri', ['Tieni, 3 capsule nuove! Torna domani per altre.']); }
      else say('Prof. Ferri', ['Le capsule di oggi te le ho già date. Prova nell\'erba alta del fiume!']);
      return;
    }
    const item = Wd.items.find((it) => it.x === nx && it.y === ny);
    if (item && !itemTaken(item)) {
      save.items[item.id] = new Date().toISOString().slice(0, 10);
      save.capsules = Math.min(20, save.capsules + 1); persist();
      sfx('oggetto'); buzz(25);
      document.getElementById('caps').textContent = save.capsules;
      toast('Hai trovato una capsula! (' + save.capsules + ')');
      syncLife();
    }
    if (save.steps % 10 === 0) persist();
    if (storyOn() && checkSight()) return;
    if (use3D && !debug.noLife) {
      const mon = life.mons.find((m) => m.x === nx && m.y === ny);
      if (mon && encountersOn()) return meetRoamer(mon);
      return;
    }
    const rate = debug.encounterRate != null ? debug.encounterRate : ENCOUNTER_RATE;
    if (isEncounter(t) && Math.random() < rate) {
      clearInterval(holdTimer);
      const list = E.ZONES[z];
      const [sp, lo, hi] = list[Math.floor(Math.random() * list.length)];
      startWild(sp, lo + Math.floor(Math.random() * (hi - lo + 1)), z);
    }
  }

  // ---------- Vita nel mondo: creature che girano nell'erba, abitanti, capsule a terra ----------
  const life = {
    mons: [], timer: null, n: 0,
    npcs: [
      { key: 'npc1', name: 'Nonna Lia', look: 'nonna', x: 6, y: 49, hx: 6, hy: 49, say: 0, lines: ['Il Centro FMLAB col tetto rosso cura la tua squadra.', 'Di notte nel bosco escono le lucciole… e le creature d\'ombra!', 'Il Prof. Ferri regala capsule ogni giorno, bussa al Laboratorio blu.'] },
      { key: 'npc2', name: 'Beppe il pescatore', look: 'pescatore', x: 23, y: 49, hx: 23, hy: 49, say: 0, lines: ['Nel canneto del fiume si nascondono le creature d\'acqua.', 'Il ponte è a nord del prato. Occhio a Ondaro, è forte!', 'Gira la visuale col tasto ⟳ se un albero ti copre.'] },
      { key: 'npc3', name: 'Gaia', look: 'bimba', x: 9, y: 53, hx: 9, hy: 53, say: 0, lines: ['Le creature selvatiche le vedi nell\'erba: toccale per lottare!', 'Ho visto brillare delle capsule per terra nella grotta…', 'Sfida i tuoi amici dal tasto Sfide, si gioca online!'] },
    ],
  };
  const encountersOn = () => debug.encounterRate == null || debug.encounterRate > 0;
  const itemTaken = (it) => save.items && save.items[it.id] === new Date().toISOString().slice(0, 10);
  const freeTile = (x, y) => MAP[y] && MAP[y][x] && !SOLID.has(MAP[y][x]) && !(save.pos.x === x && save.pos.y === y) && !life.npcs.some((n) => n.x === x && n.y === y) && !life.mons.some((m) => m.x === x && m.y === y) && !(storyOn() && storyAt(x, y));
  function syncLife() {
    if (!mapScene) return;
    const ents = [];
    life.npcs.forEach((n) => ents.push({ key: n.key, kind: 'npc', look: n.look, x: n.x, y: n.y }));
    if (!debug.noLife) life.mons.forEach((m) => ents.push({ key: m.key, kind: 'mon', id: m.species, shiny: !!m.shiny, x: m.x, y: m.y }));
    if (storyOn()) storyCast().forEach((c) => ents.push({ key: 'st_' + c.id, kind: 'npc', look: c.look, x: c.x, y: c.y, alert: story.alert === c.id, yaw: Math.atan2(c.face[0], c.face[1]) }));
    Wd.items.forEach((it) => { if (!itemTaken(it)) ents.push({ key: it.id, kind: 'item', x: it.x, y: it.y }); });
    mapScene.setEntities(ents);
  }
  function lifeTick() {
    if (screen !== 'map' || !save) return;
    const P = save.pos;
    // abitanti: due passi attorno a casa
    life.npcs.forEach((n) => {
      if (Math.random() > 0.35) return;
      const [dx, dy] = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(Math.random() * 4)];
      const nx = n.x + dx, ny = n.y + dy;
      if (Math.abs(nx - n.hx) > 2 || Math.abs(ny - n.hy) > 2 || !freeTile(nx, ny) || MAP[ny][nx] === 'D' || MAP[ny][nx] === 'L') return;
      n.x = nx; n.y = ny;
    });
    if (storyOn()) storyTick();
    if (!debug.noLife) {
      // creature: compaiono nell'erba vicino a te, girano, spariscono lontano
      life.mons = life.mons.filter((m) => Math.abs(m.x - P.x) + Math.abs(m.y - P.y) < 13);
      let tries = 0;
      while (life.mons.length < 6 && tries++ < 40) {
        const x = P.x + Math.floor(Math.random() * 15) - 7, y = P.y + Math.floor(Math.random() * 13) - 8;
        if (Math.abs(x - P.x) + Math.abs(y - P.y) < 4 || !MAP[y] || !isEncounter(MAP[y][x]) || !freeTile(x, y)) continue;
        const z = zoneAt(y), list = E.ZONES[z], night = hourNow() >= 20 || hourNow() < 6;
        let pick = list[Math.floor(Math.random() * list.length)];
        if (night && Math.random() < 0.4) pick = list.find((e) => E.SPECIES[e[0]].type === 'ombra') || pick;
        life.mons.push({ key: 'm' + (++life.n), species: pick[0], level: pick[1] + Math.floor(Math.random() * (pick[2] - pick[1] + 1)), x, y, zone: z, shiny: Math.random() < (E.SHINY_RATE || 1 / 512) });
      }
      for (const m of life.mons) {
        if (Math.random() > 0.45) continue;
        const [dx, dy] = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(Math.random() * 4)];
        const nx = m.x + dx, ny = m.y + dy;
        if (nx === P.x && ny === P.y) { if (encountersOn() && !dlg.open) { syncLife(); return meetRoamer(m); } continue; }
        if (MAP[ny] && isEncounter(MAP[ny][nx]) && zoneAt(ny) === m.zone && freeTile(nx, ny)) { m.x = nx; m.y = ny; }
      }
    }
    syncLife();
  }
  function startLife() {
    clearInterval(life.timer);
    life.timer = setInterval(lifeTick, debug.fast ? 60 : 480);
    lifeTick();
  }
  function meetRoamer(m) {
    clearInterval(holdTimer);
    life.mons = life.mons.filter((x) => x !== m);
    startWild(m.species, m.level, m.zone, { shiny: m.shiny });
  }

  // ---------- Dialoghi stile gioco ----------
  const dlg = { el: null, open: false, q: null, typing: null };
  function dialogEl() {
    if (dlg.el) return dlg.el;
    const d = document.createElement('div');
    d.className = 'dlg'; d.id = 'dlg';
    d.innerHTML = '<div class="dlgName" id="dlgName"></div><div class="dlgText" id="dlgText"></div><div class="dlgNext" id="dlgNext">▼</div>';
    d.addEventListener('pointerdown', (e) => { e.preventDefault(); advanceDialog(); });
    document.body.appendChild(d);
    dlg.el = d;
    return d;
  }
  const fillText = (t) => String(t).replace(/\{nome\}/g, save ? save.name : '');
  /** Mostra una o più battute; la promessa si risolve quando il giocatore le ha lette tutte. */
  function say(name, lines) {
    return new Promise((resolve) => {
      if (dlg.q) dlg.q.resolve();
      dlg.q = { name: name || '', lines: (lines || []).map(fillText), i: 0, resolve };
      dlg.open = true;
      const d = dialogEl();
      d.style.display = 'block';
      d.classList.toggle('sys', !name);
      showDialogLine();
    });
  }
  function showDialogLine() {
    const q = dlg.q, text = q.lines[q.i] || '';
    document.getElementById('dlgName').textContent = q.name;
    document.getElementById('dlgName').style.display = q.name ? 'inline-block' : 'none';
    const el = document.getElementById('dlgText');
    clearInterval(dlg.typing);
    if (debug.fast) { el.textContent = text; dlg.typing = null; return; }
    // la scritta compare a velocità costante (contano i millisecondi, non i giri del timer)
    const t0 = performance.now(), cps = save && save.settings && save.settings.fastText ? 170 : 70;
    let shown = 0;
    el.textContent = '';
    dlg.typing = setInterval(() => {
      const n = Math.min(text.length, Math.floor((performance.now() - t0) / 1000 * cps));
      if (n > shown) { if (/\S/.test(text.slice(shown, n)) && (n >> 1) !== (shown >> 1)) sfx('dialogo'); shown = n; }
      el.textContent = text.slice(0, n);
      if (n >= text.length) { clearInterval(dlg.typing); dlg.typing = null; }
    }, 30);
  }
  function advanceDialog() {
    const q = dlg.q;
    if (!q) return;
    if (dlg.typing) { clearInterval(dlg.typing); dlg.typing = null; document.getElementById('dlgText').textContent = q.lines[q.i]; return; }
    q.i++;
    if (q.i < q.lines.length) { showDialogLine(); return; }
    dlg.q = null; dlg.open = false;
    dlg.el.style.display = 'none';
    q.resolve();
  }
  document.addEventListener('keydown', (e) => { if (dlg.open && (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape')) { e.preventDefault(); advanceDialog(); } });

  // ---------- Storia: personaggi, vista degli allenatori, Guardiani, blocchi ----------
  const story = { busy: false, alert: null, pos: {} };
  const badgeOf = (id) => ST.BADGES.find((b) => b.id === id);
  const needsMet = (tr) => (tr.needs || []).every((n) => save.story.badges[n] || save.story.beaten[n]);
  const trainerPos = (tr) => story.pos[tr.id] || tr.pos;
  /** Chi della storia è in mappa adesso: Prof, allenatori attivi, Guardiani, guardie dei blocchi chiusi. */
  function storyCast() {
    const out = [{ id: 'prof', look: ST.PROF.look, x: ST.PROF.pos.x, y: ST.PROF.pos.y, face: ST.PROF.pos.face, role: 'prof' }];
    ST.TRAINERS.forEach((tr) => {
      const p = trainerPos(tr);
      const boss = tr.kind === 'guardian' || tr.kind === 'champion';
      if (!boss && (save.story.beaten[tr.id] || !needsMet(tr))) return;
      out.push({ id: tr.id, look: tr.look, x: p.x, y: p.y, face: p.face, role: 'trainer', tr });
    });
    ST.GATES.forEach((g) => { if (!save.story.badges[g.need]) out.push({ id: 'gate_' + g.id, look: g.look, x: g.pos.x, y: g.pos.y, face: g.pos.face, role: 'gate', gate: g }); });
    return out;
  }
  function storyAt(x, y) { return storyCast().find((c) => c.x === x && c.y === y) || null; }
  function hasLine(from, face, range, target) {
    for (let i = 1; i <= range; i++) {
      const x = from.x + face[0] * i, y = from.y + face[1] * i;
      if (!MAP[y] || SOLID.has(MAP[y][x])) return false;
      if (x === target.x && y === target.y) return true;
      if (life.npcs.some((n) => n.x === x && n.y === y) || storyCast().some((c) => c.x === x && c.y === y)) return false;
    }
    return false;
  }
  /** Un allenatore ti vede? Allora parte l'incontro. */
  function checkSight() {
    if (story.busy || dlg.open || screen !== 'map') return false;
    for (const c of storyCast()) {
      if (c.role !== 'trainer' || !c.tr.sight || save.story.beaten[c.tr.id]) continue;
      if (hasLine(c, c.face, c.tr.sight, save.pos)) { engage(c.tr); return true; }
    }
    return false;
  }
  async function engage(tr) {
    story.busy = true;
    clearInterval(holdTimer);
    story.alert = tr.id; syncLife();
    await sleep(650);
    // ti viene incontro fino alla casella accanto
    let p = Object.assign({}, trainerPos(tr));
    while (Math.abs(p.x - save.pos.x) + Math.abs(p.y - save.pos.y) > 1) {
      p = { x: p.x + p.face[0], y: p.y + p.face[1], face: p.face };
      story.pos[tr.id] = p; syncLife();
      await sleep(230);
    }
    if (mapScene) mapScene.yaw = Math.atan2(p.x - save.pos.x, p.y - save.pos.y);
    story.alert = null; syncLife();
    await say(tr.title + ' ' + tr.name, tr.intro);
    startTrainer(tr);
  }
  async function talkTo(c) {
    if (c.role === 'prof' && !save.story.intro) return playIntro();
    story.busy = true;
    try {
      if (c.role === 'prof') {
        await say(ST.PROF.name, [ST.objective(save.story), ST.PROF.hints[Math.floor(Math.random() * ST.PROF.hints.length)]]);
      } else if (c.role === 'gate') {
        await say(c.gate.name, c.gate.lines);
      } else if (c.role === 'trainer') {
        const tr = c.tr, b = tr.badge && badgeOf(tr.badge);
        if (tr.badge && save.story.badges[tr.badge]) { await say(tr.title + ' ' + tr.name, tr.after || tr.defeat); }
        else if (!needsMet(tr)) {
          const miss = (tr.needs || []).map(badgeOf).filter((x) => x && !save.story.badges[x.id]).map((x) => x.name).join(', ');
          await say(tr.title + ' ' + tr.name, [`Non sei ancora pronto. Torna quando avrai: ${miss || 'più esperienza'}.`]);
        } else {
          await say(tr.title + ' ' + tr.name, tr.intro);
          if (b) await say('', [`${tr.name} mette in palio la ${b.name} ${b.icon}`]);
          return startTrainer(tr);
        }
      }
    } finally { if (screen === 'map') story.busy = false; }
  }
  /** Allenatori in ronda: girano lo sguardo; poi controlla se ti vedono. */
  function storyTick() {
    if (story.busy || dlg.open) return;
    let turned = false;
    ST.TRAINERS.forEach((tr) => {
      if (!tr.turns || save.story.beaten[tr.id] || Math.random() > 0.12) return;
      const p = trainerPos(tr), dirs = [tr.pos.face].concat(tr.turns);
      const cur = dirs.findIndex((d) => d[0] === p.face[0] && d[1] === p.face[1]);
      story.pos[tr.id] = { x: p.x, y: p.y, face: dirs[(cur + 1) % dirs.length] };
      turned = true;
    });
    if (turned) checkSight();
  }
  async function playIntro() {
    if (story.busy) return;
    story.busy = true;
    clearInterval(holdTimer);
    await sleep(400);
    await say(ST.PROF.name, ST.PROF.intro);
    save.story.intro = true; persist();
    story.busy = false;
    toast('Obiettivo: ' + ST.objective(save.story));
  }

  // ---------- Lotte contro allenatori ----------
  function startTrainer(tr) {
    story.busy = false;
    clearInterval(holdTimer);
    const spec = typeof tr.team === 'function' ? tr.team(save.story) : tr.team;
    const team = spec.map(([sp, lv], i) => { const m = E.createMonster(sp, lv, 'tr_' + tr.id + '_' + i, { shiny: false }); m.shiny = false; save.seen[sp] = true; return m; });
    const seed = Math.floor(Math.random() * 4294967295);
    const state = E.createBattle(seed, [{ name: save.name, team: save.team }, { name: tr.name, team }]);
    const z = zoneAt(trainerPos(tr).y);
    screen = 'battle';
    B = {
      mode: 'trainer', my: 0, trainer: tr, arena: tr.kind === 'champion' ? 'pvp' : (z === 'citta' ? 'prato' : z),
      foeName: tr.name, state, view: E.clone(state), panel: 'main', msg: `${tr.title} ${tr.name} ti sfida!`,
    };
    B.act = trainerTurn;
    battleIntro(tr.kind === 'guardian' || tr.kind === 'champion' ? 'boss' : 'trainer');
    renderBattle();
  }
  async function trainerTurn(action) {
    if (B.panel === 'busy') return;
    renderActions('busy');
    const st = B.state;
    const myUid = E.activeMon(st.sides[0]).uid, foe = E.activeMon(st.sides[1]);
    const foeAct = E.aiChoose(st, 1, Math.floor(Math.random() * 1e9), B.trainer.ai);
    const events = E.resolveTurn(st, [action, foeAct]);
    await playEvents(events);
    if (events.some((e) => e.t === 'faint' && e.side === 1)) await awardXp(st, myUid, foe, 1.5);
    B.view = E.clone(st);
    renderSprites();
    if (st.winner != null) return endTrainer(st.winner === 0);
    renderActions('main');
  }
  async function endTrainer(won) {
    const tr = B.trainer;
    syncTeam(B.state.sides[0].team);
    delete story.pos[tr.id];
    if (won) {
      save.story.beaten[tr.id] = true;
      save.capsules = Math.min(20, save.capsules + (tr.reward || 1));
      setLog(`Hai battuto ${tr.title} ${tr.name}! +${tr.reward || 1} capsule`);
      showVictory('VITTORIA!'); AU.music('vittoria');
      persist();
      await say(tr.title + ' ' + tr.name, tr.defeat);
      if (tr.badge) {
        save.story.badges[tr.badge] = true; persist();
        sfx('medaglia'); buzz([50, 50, 120]);
        const b = badgeOf(tr.badge);
        await say('', [`Hai ottenuto la ${b.name} ${b.icon}!`]);
        if (tr.badge === 'campione') await say(ST.PROF.name, ['Il Cristallo Madre brilla di nuovo! Sapevo che ce l\'avresti fatta, {nome}.', 'Ora sei il Campione. Completa l\'Archivio e sfida i tuoi amici online!']);
        else { const g = ST.GATES.find((x) => x.need === tr.badge); if (g) B.after = g.ok[0]; }
      }
    } else {
      setLog(`${tr.name} ha vinto… Le tue creature corrono al Centro FMLAB.`);
      healAll();
      save.pos = { x: 20, y: 50 };
      persist();
      await say(tr.title + ' ' + tr.name, ['Torna quando sarai più forte!']);
    }
    renderActions('end');
  }

  // ---------- Diario ----------
  function playTime() { const m = Math.floor((save.story.playMs || 0) / 60000); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0'); }
  function showDiary() {
    screen = 'diary';
    const st = save.story, trainers = ST.TRAINERS.filter((t) => st.beaten[t.id]).length;
    app.innerHTML = `<div class="screen diary">
      <div class="row"><h2 class="grow">Diario di ${esc(save.name)}</h2><button class="btn sec" id="back">Mappa</button></div>
      <div class="card goal"><div class="mut">Obiettivo</div><div class="goalText" id="goal">${esc(ST.objective(st))}</div></div>
      <div class="card"><b>Medaglie</b><div class="badges">${ST.BADGES.map((b) => `<div class="badge${st.badges[b.id] ? ' got' : ''}" style="--c:${b.color}"><div class="bi">${st.badges[b.id] ? b.icon : '?'}</div><div class="bn">${st.badges[b.id] ? b.name : '???'}</div><div class="bw">${b.who}</div></div>`).join('')}</div></div>
      <div class="card stats">
        <div><span>Viste</span><b>${Object.keys(save.seen).length}/15</b></div>
        <div><span>Catturate</span><b>${Object.keys(save.caught).length}/15</b></div>
        <div><span>Allenatori battuti</span><b>${trainers}/${ST.TRAINERS.length}</b></div>
        <div><span>Sfide online</span><b>${save.wins} V · ${save.losses} S</b></div>
        <div><span>Passi</span><b>${save.steps}</b></div>
        <div><span>Tempo</span><b>${playTime()}</b></div>
      </div>
    </div>`;
    document.getElementById('back').onclick = () => showMap();
  }
  setInterval(() => { if (save && save.story && screen !== 'title' && screen !== 'starter' && !document.hidden) save.story.playMs = (save.story.playMs || 0) + 1000; }, 1000);

  // ---------- Lotta (comune a selvatici e sfide) ----------
  let B = null;

  function displayName(side, name) {
    if (side === B.my) return name;
    return B.mode === 'wild' ? name + ' selvatico' : name + ' di ' + B.foeName;
  }
  function setLog(text) { const el = document.getElementById('log'); if (el) el.textContent = text; B.msg = text; }

  // ---------- "Juice" della lotta: transizione, numeri, scritte, scosse, vittoria, evoluzione ----------
  const battleTheme = () => (B && ((B.mode === 'trainer' && B.trainer && (B.trainer.kind === 'guardian' || B.trainer.kind === 'champion')) || B.mode === 'pvp') ? 'lotta-guardiano' : 'lotta');
  function battleIntro(kind) {
    sfx('incontro'); buzz(kind === 'boss' ? [40, 40, 90] : 35);
    fx.wipes++;
    if (debug.fast) return;
    const w = document.createElement('div');
    w.className = 'wipe ' + kind;
    w.innerHTML = '<s></s>' + '<i></i>'.repeat(8) + (kind === 'boss' ? '<b>SFIDA!</b>' : kind === 'pvp' ? '<b>VS</b>' : '<u class="cm"></u>' + (kind === 'shiny' ? '<b>✨</b>' : ''));
    document.body.appendChild(w);
    // si toglie quando le strisce hanno finito (riserva: 2,5 s)
    let ended = 0;
    w.addEventListener('animationend', (e) => { if (e.target.tagName === 'I' && ++ended >= 8) w.remove(); });
    setTimeout(() => w.remove(), 2500);
  }
  /** Dove far saltare il numero: accanto al riquadro della creatura colpita (la camera della lotta
   * si muove, il riquadro resta fermo ed è sempre leggibile). In 2D, sopra il disegno. */
  function popPos(sideIdx) {
    const mine = sideIdx === B.my;
    if (!battleScene) {
      const el = document.getElementById(mine ? 'spr0' : 'spr1');
      if (el) { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * 0.25 }; }
    }
    const box = document.getElementById(mine ? 'info0' : 'info1');
    if (box) {
      const r = box.getBoundingClientRect();
      return mine ? { x: r.left + r.width * 0.5, y: r.top - 26 } : { x: r.left + r.width * 0.62, y: r.bottom + 30 };
    }
    return { x: window.innerWidth / 2, y: window.innerHeight * 0.3 };
  }
  /** Numero o parola che salta fuori sopra la creatura (danno, "Mancato!", stato). */
  function popNumber(sideIdx, text, cls) {
    fx.damage++;
    const p = popPos(sideIdx), d = document.createElement('div');
    d.className = 'dmg ' + (cls || '');
    d.textContent = text;
    d.style.left = p.x + 'px'; d.style.top = p.y + 'px';
    d.style.setProperty('--dx', ((Math.random() - 0.5) * 46).toFixed(0) + 'px');
    document.body.appendChild(d);
    setTimeout(() => d.remove(), debug.fast ? 80 : 1150);
  }
  function banner(text, cls) {
    fx.banners++;
    const d = document.createElement('div');
    d.className = 'banner ' + (cls || '');
    d.textContent = text;
    document.body.appendChild(d);
    setTimeout(() => d.remove(), debug.fast ? 80 : 1200);
  }
  function shakeScreen() {
    fx.shakes++;
    const el = document.querySelector('.battle');
    if (!el) return;
    el.classList.remove('shakeS'); void el.offsetWidth; el.classList.add('shakeS');
  }
  function showVictory(title) {
    fx.victories++;
    const ar = document.querySelector('.arena');
    if (!ar) return;
    const x = B.lastXp, up = x && x.lvTo > x.lvFrom;
    const d = document.createElement('div');
    d.className = 'victory';
    d.innerHTML = `<div class="vt">${esc(title || 'VITTORIA!')}</div>${x ? `<div class="vsub">${esc(x.name)} +${x.gain} esperienza${up ? ` · Lv ${x.lvFrom} → <b>${x.lvTo}</b>` : ''}</div><div class="vxp"><i style="width:${up ? 0 : x.from}%"></i></div>` : ''}`;
    ar.appendChild(d);
    if (x) requestAnimationFrame(() => requestAnimationFrame(() => { const i = d.querySelector('.vxp i'); if (i) i.style.width = x.to + '%'; }));
  }
  /** Sequenza dell'evoluzione: la creatura gira e brilla, lampo, ed ecco la nuova forma. */
  async function playEvolution(fromId, toId, shiny) {
    if (!E.SPECIES[fromId] || !E.SPECIES[toId]) return;
    fx.evolutions++;
    const key = (id) => id + (shiny ? '*' : '');
    const ov = document.createElement('div');
    ov.className = 'evo'; ov.id = 'evo';
    ov.innerHTML = `<div class="evoRays"></div><div class="evoStage" id="evoStage">${use3D ? '' : Art.monsterSVG(fromId, { size: 220, shiny })}</div><div class="evoText" id="evoText">Cosa? ${esc(E.SPECIES[fromId].name)} si sta evolvendo!</div>`;
    document.body.appendChild(ov);
    const prevTheme = AU.current;
    AU.music('evoluzione'); sfx('evoluzione'); buzz([30, 60, 30, 60, 30]);
    let sc = null;
    if (use3D) { sc = G3.createShowcase([key(fromId)], { spin: true, size: 1.3 }); G3.mount(document.getElementById('evoStage'), sc); }
    requestAnimationFrame(() => ov.classList.add('on'));
    await sleep(2400);
    ov.classList.add('burst');
    await sleep(230);
    if (sc) sc.ids = [key(toId)]; else document.getElementById('evoStage').innerHTML = Art.monsterSVG(toId, { size: 220, shiny });
    document.getElementById('evoText').innerHTML = `${esc(E.SPECIES[fromId].name)} si è evoluto in <b>${esc(E.SPECIES[toId].name)}</b>!`;
    ov.classList.add('done');
    sfx('livello'); buzz(120);
    await sleep(2000);
    ov.classList.add('out');
    await sleep(380);
    ov.remove();
    if (screen === 'battle' && battleScene && document.getElementById('stage3d')) mount3D('stage3d', battleScene);
    if (prevTheme && prevTheme !== 'evoluzione') AU.music(prevTheme);
  }

  function renderBattle() {
    const v = B.view;
    const me = v.sides[B.my].team[v.sides[B.my].active];
    const foe = v.sides[1 - B.my].team[v.sides[1 - B.my].active];
    app.innerHTML = `<div class="screen${use3D ? ' full' : ''}"><div class="battle">
      <div class="arena ${B.arena}${use3D ? ' arena3d' : ''}">
        ${use3D ? '<div class="stage3d" id="stage3d"></div>' : `<div class="plat" style="right:6px;top:150px;width:160px;height:30px"></div>
        <div class="plat" style="left:-10px;bottom:4px;width:210px;height:36px"></div>
        <div class="foe" id="spr1">${Art.monsterSVG(foe.species, { size: 140 })}</div>
        <div class="me" id="spr0">${Art.monsterSVG(me.species, { size: 168, back: true })}</div>`}
        <div class="infobox foeinfo" id="info1"></div>
        <div class="infobox meinfo" id="info0"></div>
        <div id="capsule"></div>
      </div>
      <div class="bpanel"><div class="log" id="log">${esc(B.msg || '')}</div>
      <div id="actions"></div></div>
    </div></div>`;
    if (use3D) {
      battleScene = G3.createBattleScene({ arena: B.arena, hour: hourNow() });
      document.getElementById('stage3d').style.background = `linear-gradient(${battleScene.sky[0]}, ${battleScene.sky[1]} 62%)`;
      battleScene.setMon('me', me.species, { fainted: me.hp <= 0, shiny: !!me.shiny });
      battleScene.setMon('foe', foe.species, { fainted: foe.hp <= 0, shiny: !!foe.shiny });
      B.shown = {};
      syncStatus3D();
      if (!mount3D('stage3d', battleScene)) battleScene = null;
      layout3D();
    }
    AU.music(battleTheme());
    renderInfo();
    renderActions();
  }
  const slot = (side) => (side === B.my ? 'me' : 'foe');
  const moveType = (name) => { const m = Object.values(E.MOVES).find((x) => x.name === name); return m ? m.type : null; };
  function renderInfo() {
    const v = B.view;
    [B.my, 1 - B.my].forEach((sideIdx) => {
      const side = v.sides[sideIdx], mon = side.team[side.active];
      const mine = sideIdx === B.my;
      const el = document.getElementById(mine ? 'info0' : 'info1');
      if (!el) return;
      const balls = B.mode === 'pvp' ? `<div style="margin-top:4px">${side.team.map((m) => `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:3px;background:${m.hp > 0 ? '#22c55e' : '#9ca3af'}"></span>`).join('')}</div>` : '';
      el.innerHTML = `<div class="nm"><span>${esc(mon.name)}${shinyMark(mon)}</span><span>Lv ${mon.level}</span></div>${pill(typeOf(mon))}${statusTag(mon.status)}
        ${hpBarAnim(mon, sideIdx)}${mine ? `<div class="hptext">${mon.hp} / ${mon.maxhp}</div>${B.mode === 'wild' ? `<div class="xpbar"><i style="width:${xpPct(mon)}%"></i></div>` : ''}` : ''}${balls}`;
      el.querySelectorAll('.hpbar.anim').forEach((bar) => {
        const to = bar.dataset.to;
        requestAnimationFrame(() => requestAnimationFrame(() => { bar.querySelector('i').style.width = to + '%'; bar.querySelector('.lag').style.width = to + '%'; }));
      });
    });
  }
  function hpBarAnim(mon, sideIdx) {
    const pct = Math.max(0, (mon.hp / mon.maxhp) * 100), key = sideIdx + ':' + mon.uid;
    B.hpPrev = B.hpPrev || {};
    const prev = B.hpPrev[key] != null ? B.hpPrev[key] : pct;
    B.hpPrev[key] = pct;
    return `<div class="hpbar anim" data-to="${pct.toFixed(1)}"><b class="lag" style="width:${prev.toFixed(1)}%"></b><i class="${hpCls(pct / 100)}" style="width:${prev.toFixed(1)}%"></i></div>`;
  }
  function renderSprites() {
    const v = B.view;
    [0, 1].forEach((sideIdx) => {
      const side = v.sides[sideIdx], mon = side.team[side.active];
      const mine = sideIdx === B.my;
      if (battleScene) { battleScene.setMon(mine ? 'me' : 'foe', mon.species, { fainted: mon.hp <= 0, shiny: !!mon.shiny }); return; }
      const el = document.getElementById(mine ? 'spr0' : 'spr1');
      if (el) { el.className = mine ? 'me' : 'foe'; el.innerHTML = Art.monsterSVG(mon.species, mine ? { size: 168, back: true } : { size: 140 }); }
    });
    syncStatus3D();
    renderInfo();
  }
  /** Effetti 3D degli stati (se la grafica li supporta): chiamati solo quando cambiano. */
  function syncStatus3D() {
    if (!battleScene || typeof battleScene.status !== 'function' || !B || !B.view) return;
    B.shown = B.shown || {};
    [0, 1].forEach((sideIdx) => {
      const sd = B.view.sides[sideIdx], mon = sd.team[sd.active], sl = sideIdx === B.my ? 'me' : 'foe';
      const key = mon.uid + ':' + (mon.status || '');
      if (B.shown[sl] !== key) { B.shown[sl] = key; battleScene.status(sl, mon.status || null); }
    });
  }
  function renderActions(mode) {
    const box = document.getElementById('actions');
    if (!box) return;
    mode = mode || B.panel || 'main';
    B.panel = mode;
    const v = B.view, side = v.sides[B.my], me = side.team[side.active];
    if (mode === 'busy') { box.innerHTML = ''; return; }
    if (mode === 'wait') {
      box.innerHTML = `<div class="card waiting"><div class="spinner"></div><div>In attesa della mossa di <b>${esc(B.foeName)}</b>…</div></div>`;
      return;
    }
    if (mode === 'end') {
      box.innerHTML = `<button class="btn green" id="endBtn" style="width:100%">${B.mode === 'pvp' ? 'Torna alle sfide' : 'Continua'}</button>`;
      document.getElementById('endBtn').onclick = B.mode === 'pvp' ? showPvp : () => showMap(B.after || undefined);
      return;
    }
    if (mode === 'switch') {
      box.innerHTML = `<div class="list">${side.team.map((m, i) => `<button class="mon${i === side.active ? ' lead' : ''}" data-i="${i}" ${m.hp <= 0 || i === side.active ? 'disabled' : ''} style="text-align:left">
          ${Art.monsterSVG(m.species, { size: 46 })}<div class="info"><div class="nm"><span>${esc(m.name)}</span><span class="mut">Lv ${m.level}</span></div>${hpBar(m.hp, m.maxhp)}</div></button>`).join('')}
        <button class="btn sec" id="back">Indietro</button></div>`;
      box.querySelectorAll('.mon').forEach((b) => { b.onclick = () => B.act({ kind: 'switch', to: Number(b.dataset.i) }); });
      document.getElementById('back').onclick = () => renderActions('main');
      return;
    }
    const moves = me.moves.map((id) => {
      const mv = E.MOVES[id], color = mv.type ? E.TYPES[mv.type].color : '#cbd5e1';
      return `<button class="move" data-m="${id}" style="background:${color}">${mv.name}<small>${mv.type ? E.TYPES[mv.type].name : 'Normale'} · Pot ${mv.power}</small></button>`;
    }).join('');
    const extra = B.mode === 'wild'
      ? `<button class="btn sec" id="aSwitch">Squadra</button><button class="btn green" id="aCatch">Capsula (${save.capsules})</button><button class="btn sec" id="aRun">Fuga</button>`
      : B.mode === 'trainer'
        ? `<button class="btn sec" id="aSwitch">Squadra</button><span class="mut" style="grid-column:span 2;align-self:center;text-align:center">Lotta contro ${esc(B.foeName)}: niente fuga!</span>`
        : `<button class="btn sec" id="aSwitch">Squadra</button><span></span><button class="btn red" id="aForfeit">Abbandona</button>`;
    box.innerHTML = `<div class="moves">${moves}</div><div class="acts" style="margin-top:8px">${extra}</div>`;
    box.querySelectorAll('.move').forEach((b) => { b.onclick = () => B.act({ kind: 'move', move: b.dataset.m }); });
    document.getElementById('aSwitch').onclick = () => renderActions('switch');
    if (B.mode === 'wild') {
      document.getElementById('aCatch').onclick = () => B.catchIt();
      document.getElementById('aRun').onclick = () => B.run();
    } else if (B.mode === 'trainer') {
      // niente da aggiungere
    } else {
      const f = document.getElementById('aForfeit');
      f.onclick = () => {
        if (f.dataset.armed !== '1') { f.dataset.armed = '1'; f.textContent = 'Sicuro?'; return; }
        B.act({ kind: 'forfeit' });
      };
    }
  }

  async function playEvents(events) {
    const v = B.view;
    for (const ev of events) {
      if (screen !== 'battle') return;
      switch (ev.t) {
        case 'move':
          B.lastType = B.lastType || {}; B.lastType[ev.side] = moveType(ev.move);
          sfx('attacco');
          setLog(`${displayName(ev.side, ev.name)} usa ${ev.move}!`);
          if (battleScene) battleScene.attack(slot(ev.side), moveType(ev.move));
          await sleep(650); break;
        case 'miss':
          setLog('Ma manca il colpo!');
          if (battleScene) battleScene.miss(slot(ev.side));
          popNumber(1 - ev.side, 'Mancato!', 'miss');
          await sleep(650); break;
        case 'hit': {
          const side = v.sides[ev.side], mon = side.team[side.active];
          const dmg = ev.dmg != null ? ev.dmg : Math.max(0, mon.hp - ev.hp);
          mon.hp = ev.hp;
          if (battleScene) battleScene.hit(slot(ev.side), { crit: ev.crit, eff: ev.eff });
          sfx('colpo-' + ((B.lastType && B.lastType[1 - ev.side]) || 'normale'));
          popNumber(ev.side, '-' + dmg, ev.crit ? 'crit' : ev.eff > 1 ? 'super' : ev.eff < 1 ? 'weak' : '');
          const tags = [];
          if (ev.crit) { tags.push('COLPO CRITICO!'); sfx('critico'); shakeScreen(); buzz(70); } else buzz(25);
          if (ev.eff > 1) { tags.push('SUPEREFFICACE!'); sfx('superefficace'); } else if (ev.eff < 1) { tags.push('Poco efficace…'); sfx('pocoefficace'); }
          if (tags.length) banner(tags.join(' '), ev.eff > 1 ? 'super' : ev.crit ? 'crit' : 'weak');
          const el = document.getElementById(ev.side === B.my ? 'spr0' : 'spr1');
          if (el) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake', 'flash'); }
          renderInfo();
          const extra = [];
          if (ev.crit) extra.push('Colpo critico!');
          if (ev.eff > 1) extra.push('È superefficace!');
          else if (ev.eff < 1) extra.push('Non è molto efficace…');
          await sleep(450);
          if (extra.length) { setLog(extra.join(' ')); await sleep(700); }
          break;
        }
        case 'faint': {
          setLog(`${displayName(ev.side, ev.name)} è esausto!`);
          if (battleScene) battleScene.faint(slot(ev.side));
          sfx('esausto'); buzz(80);
          const el = document.getElementById(ev.side === B.my ? 'spr0' : 'spr1');
          if (el) el.classList.add('faint');
          await sleep(900);
          break;
        }
        case 'switch':
          v.sides[ev.side].active = ev.to;
          sfx('lancio');
          if (battleScene) battleScene.setMon(slot(ev.side), v.sides[ev.side].team[ev.to].species, { force: true, shiny: !!v.sides[ev.side].team[ev.to].shiny });
          renderSprites();
          setLog(ev.side === B.my ? `Vai, ${ev.name}!` : (B.mode === 'wild' ? `Arriva ${ev.name}!` : `${B.foeName} manda in campo ${ev.name}!`));
          await sleep(750);
          break;
        case 'status': {
          const mon = v.sides[ev.side].team[v.sides[ev.side].active];
          if (mon) mon.status = ev.status;
          sfx('stato');
          if (STATUS_TAG[ev.status]) popNumber(ev.side, STATUS_TAG[ev.status][0], 'status st-' + ev.status);
          setLog(`${displayName(ev.side, ev.name || (mon && mon.name) || '')} ${STATUS_TXT[ev.status] || 'ha un problema'}!`);
          renderInfo(); syncStatus3D();
          await sleep(750);
          break;
        }
        case 'statusDmg': {
          const mon = v.sides[ev.side].team[v.sides[ev.side].active];
          if (mon) { const lost = Math.max(0, mon.hp - ev.hp); if (lost) popNumber(ev.side, '-' + lost, 'status st-' + ev.status); mon.hp = ev.hp; if (ev.maxhp) mon.maxhp = ev.maxhp; }
          sfx(ev.status === 'brn' ? 'colpo-fuoco' : 'colpo-ombra');
          const nm = displayName(ev.side, (mon && mon.name) || '');
          setLog(ev.status === 'brn' ? `${nm} soffre per la bruciatura!` : `${nm} soffre per il veleno!`);
          if (battleScene) battleScene.hit(slot(ev.side), { crit: false, eff: 1 });
          renderInfo();
          await sleep(650);
          break;
        }
        case 'cant':
          setLog(ev.reason === 'slp' ? `${displayName(ev.side, ev.name)} dorme profondamente…` : `${displayName(ev.side, ev.name)} è paralizzato! Non riesce a muoversi!`);
          await sleep(700);
          break;
        case 'wake': {
          const mon = v.sides[ev.side].team[v.sides[ev.side].active];
          if (mon) mon.status = null;
          setLog(`${displayName(ev.side, ev.name)} si è svegliato!`);
          renderInfo(); syncStatus3D();
          await sleep(650);
          break;
        }
        case 'forfeit':
          setLog(ev.side === B.my ? 'Hai abbandonato la sfida.' : `${B.foeName} ha abbandonato la sfida.`);
          await sleep(800);
          break;
        default: break;
      }
    }
  }

  // ---------- Lotta con creatura selvatica ----------
  function startWild(speciesId, level, zone, opts) {
    const o = opts && opts.shiny != null ? { shiny: !!opts.shiny } : undefined;
    const wild = E.createMonster(speciesId, level, undefined, o);
    if (o && o.shiny) wild.shiny = true;
    save.seen[speciesId] = true;
    const state = E.createBattle(Math.floor(Math.random() * 4294967295), [
      { name: save.name, team: save.team }, { name: 'Selvatico', team: [wild] },
    ]);
    screen = 'battle';
    B = { mode: 'wild', my: 0, arena: zone === 'citta' ? 'prato' : zone, foeName: 'Selvatico', state, view: E.clone(state), panel: 'main', msg: wild.shiny ? `✨ Un ${wild.name} selvatico (Lv ${level}) luccica nell'erba! È uno shiny!` : `Un ${wild.name} selvatico (Lv ${level}) salta fuori dall'erba!` };
    B.act = (a) => wildTurn(a);
    B.catchIt = wildCatch;
    B.run = wildRun;
    battleIntro(wild.shiny ? 'shiny' : 'wild');
    renderBattle();
  }

  async function wildTurn(action) {
    if (B.panel === 'busy') return;
    renderActions('busy');
    const st = B.state;
    const myUid = E.activeMon(st.sides[0]).uid;
    const foeAct = action.kind === 'none' && st.winner == null ? E.aiChoose(st, 1, Math.floor(Math.random() * 1e9)) : E.aiChoose(st, 1, Math.floor(Math.random() * 1e9));
    const events = E.resolveTurn(st, [action.kind === 'none' ? { kind: 'none' } : action, foeAct]);
    await playEvents(events);
    // esperienza se il selvatico è esausto
    if (events.some((e) => e.t === 'faint' && e.side === 1)) await awardXp(st, myUid, st.sides[1].team[0], 1);
    B.view = E.clone(st);
    renderSprites();
    if (st.winner != null) return endWild(st.winner === 0 ? 'win' : 'lose');
    renderActions('main');
  }

  /** Esperienza alla creatura che ha combattuto (mult 1.5 per gli allenatori). */
  async function awardXp(st, myUid, foe, mult) {
    const mon = st.sides[0].team.find((m) => m.uid === myUid) || E.activeMon(st.sides[0]);
    if (!mon || mon.hp <= 0) return;
    const gain = Math.floor(E.xpReward(foe) * mult);
    setLog(`${mon.name} guadagna ${gain} punti esperienza.`);
    await sleep(800);
    const xpFrom = xpPct(mon), lvFrom = mon.level, name0 = mon.name;
    let sp0 = mon.species;
    const evs = E.gainXp(mon, gain);
    B.lastXp = { name: name0, gain, from: xpFrom, to: xpPct(mon), lvFrom, lvTo: mon.level };
    for (const ev of evs) {
      if (ev.kind === 'level') { setLog(`${mon.name} sale al livello ${ev.level}!`); sfx('livello'); popNumber(B.my, 'Lv ' + ev.level + '!', 'lvl'); }
      if (ev.kind === 'move') setLog(`${mon.name} impara ${ev.move}!`);
      if (ev.kind === 'evolve') {
        setLog(`Cosa? ${ev.from} si evolve in ${ev.to}!`); save.seen[mon.species] = true; save.caught[mon.species] = true;
        const toId = Object.keys(E.SPECIES).find((k) => E.SPECIES[k].name === ev.to) || mon.species;
        await playEvolution(sp0, toId, !!mon.shiny);
        sp0 = toId;
      }
      B.view = E.clone(st); renderSprites();
      await sleep(1000);
    }
  }

  async function wildCatch() {
    if (B.panel === 'busy') return;
    if (save.capsules <= 0) { setLog('Non hai più capsule! Il Centro FMLAB le ricarica.'); return; }
    renderActions('busy');
    save.capsules -= 1;
    const foe = B.state.sides[1].team[0];
    setLog('Lanci una capsula…');
    const spr = document.getElementById('spr1');
    if (spr) spr.style.opacity = '0';
    if (battleScene) battleScene.throwCapsule(); else document.getElementById('capsule').innerHTML = '<div class="capsule"></div>';
    sfx('lancio');
    if (!debug.fast) [1300, 1700].forEach((ms) => setTimeout(() => { if (screen === 'battle') { sfx('oscillazione'); buzz(15); } }, ms));
    await sleep(1600);
    const chance = debug.catchLuck != null ? debug.catchLuck : E.catchChance(foe);
    const caughtIt = Math.random() < chance;
    if (battleScene) { battleScene.captureResult(caughtIt); await sleep(caughtIt ? 500 : 700); }
    if (caughtIt) {
      sfx('cattura'); buzz([40, 60, 40]);
      setLog(`Preso! ${foe.name} è entrato nella tua squadra!`);
      const caught = E.clone(foe);
      caught.uid = String(Date.now()) + Math.floor(Math.random() * 1e6);
      if (save.team.length < 6) save.team.push(caught); else { save.box.push(caught); setLog(`Preso! ${foe.name} è stato mandato nel box (squadra piena).`); }
      save.caught[foe.species] = true;
      syncTeam(B.state.sides[0].team);
      persist();
      B.panel = 'end';
      renderActions('end');
      return;
    }
    const capEl = document.getElementById('capsule');
    if (capEl) capEl.innerHTML = '';
    if (spr) spr.style.opacity = '1';
    sfx('uscita');
    setLog(`${foe.name} è uscito dalla capsula!`);
    await sleep(800);
    B.panel = 'main';
    await wildTurn({ kind: 'none' });
  }

  async function wildRun() {
    if (B.panel === 'busy') return;
    renderActions('busy');
    if (Math.random() < 0.85) {
      sfx('fuga');
      setLog('Sei scappato senza problemi.');
      syncTeam(B.state.sides[0].team); persist();
      await sleep(700);
      return showMap();
    }
    setLog('Non riesci a scappare!');
    await sleep(700);
    B.panel = 'main';
    await wildTurn({ kind: 'none' });
  }

  function syncTeam(battleTeam) {
    battleTeam.forEach((bm) => {
      const i = save.team.findIndex((m) => m.uid === bm.uid);
      if (i >= 0) save.team[i] = E.clone(bm);
    });
  }

  async function endWild(result) {
    syncTeam(B.state.sides[0].team);
    if (result === 'win') { setLog('Hai vinto la lotta!'); showVictory('VITTORIA!'); AU.music('vittoria'); }
    else {
      setLog('Le tue creature sono esauste… Corri al Centro FMLAB per curarle.');
      healAll();
      save.pos = { x: 20, y: 50 }; // davanti al Centro FMLAB
    }
    persist();
    renderActions('end');
  }

  // ---------- Squadra ----------
  function showTeam() {
    screen = 'team';
    app.innerHTML = `<div class="screen">
      <div class="row"><h2 class="grow">La tua squadra</h2><button class="btn sec" id="back">Mappa</button></div>
      <div class="mut">Tocca una creatura per metterla in testa: è quella che entra per prima in lotta.</div>
      <div class="list">${save.team.map((m, i) => monRow(m, i === 0, `data-i="${i}"`)).join('')}</div>
      ${save.box.length ? `<h2>Box (${save.box.length})</h2><div class="mut">Tocca per scambiarla con l'ultima della squadra.</div>
        <div class="list">${save.box.map((m, i) => monRow(m, false, `data-b="${i}"`)).join('')}</div>` : ''}
    </div>`;
    document.getElementById('back').onclick = () => showMap();
    app.querySelectorAll('[data-i]').forEach((el) => {
      el.onclick = () => { const i = Number(el.dataset.i); if (i > 0) { const [m] = save.team.splice(i, 1); save.team.unshift(m); persist(); showTeam(); } };
    });
    app.querySelectorAll('[data-b]').forEach((el) => {
      el.onclick = () => {
        const i = Number(el.dataset.b);
        const [m] = save.box.splice(i, 1);
        if (save.team.length < 6) save.team.push(m); else { save.box.push(save.team.pop()); save.team.push(m); }
        persist(); showTeam();
      };
    });
  }
  function monRow(m, lead, attrs) {
    return `<button class="mon${lead ? ' lead' : ''}" ${attrs} style="text-align:left">${Art.monsterSVG(m.species, { size: 64 })}
      <div class="info"><div class="nm"><span>${esc(m.name)}${shinyMark(m)} ${pill(typeOf(m))}${statusTag(m.status)}</span><span class="mut">Lv ${m.level}</span></div>
      ${hpBar(m.hp, m.maxhp)}<div class="row mut" style="justify-content:space-between;font-size:12px;margin-top:3px"><span>${m.hp}/${m.maxhp} PS</span><span>${m.moves.map((x) => E.MOVES[x].name).join(' · ')}</span></div>
      <div class="xpbar"><i style="width:${xpPct(m)}%"></i></div></div></button>`;
  }

  // ---------- Archivio ----------
  function showDex() {
    screen = 'dex';
    const ids = Object.keys(E.SPECIES);
    app.innerHTML = `<div class="screen">
      <div class="row"><h2 class="grow">Archivio FMLAB</h2><button class="btn sec" id="back">Mappa</button></div>
      <div class="mut">Visti ${Object.keys(save.seen).length} · Catturati ${Object.keys(save.caught).length} su ${ids.length}</div>
      <div class="dex">${ids.map((id, n) => {
        const caught = save.caught[id], seen = save.seen[id];
        return `<button class="dexc${caught ? ' got' : ''}" data-id="${id}" ${caught ? '' : 'disabled'}>${Art.monsterSVG(id, { size: 84, silhouette: !caught })}<div class="num">#${String(n + 1).padStart(2, '0')}</div>
          <div>${seen ? E.SPECIES[id].name : '???'}${save.team.concat(save.box).some((m) => m.species === id && m.shiny) ? ' ✨' : ''}</div>${caught ? pill(E.SPECIES[id].type) : ''}</button>`;
      }).join('')}</div>
      <div class="mut" style="text-align:center">Tocca una creatura catturata per vederla in 3D.</div>
    </div>`;
    document.getElementById('back').onclick = () => showMap();
    app.querySelectorAll('.dexc.got').forEach((b) => { b.onclick = () => showViewer(b.dataset.id); });
  }

  // ---------- Visore 3D dell'archivio ----------
  const STAT_NAMES = ['PS', 'Attacco', 'Difesa', 'Velocità'];
  function showViewer(id) {
    screen = 'viewer';
    const sp = E.SPECIES[id], n = Object.keys(E.SPECIES).indexOf(id) + 1;
    const prev = Object.keys(E.SPECIES).find((k) => E.SPECIES[k].evo && E.SPECIES[k].evo.to === id);
    const evoTxt = [prev ? `Si evolve da <b>${E.SPECIES[prev].name}</b>.` : '', sp.evo ? `Diventa <b>${E.SPECIES[sp.evo.to].name}</b> al livello ${sp.evo.level}.` : 'Forma finale.'].join(' ');
    app.innerHTML = `<div class="screen">
      <div class="row"><h2 class="grow">#${String(n).padStart(2, '0')} ${esc(sp.name)}</h2><button class="btn sec" id="back">Archivio</button></div>
      <div class="viewer3d" id="viewer3d">${use3D ? '' : Art.monsterSVG(id, { size: 220 })}</div>
      ${use3D ? '<div class="mut" style="text-align:center">Trascina per girarla</div>' : ''}
      <div class="card"><div class="row" style="justify-content:space-between">${pill(sp.type)}<span class="mut">Stadio ${sp.stage}</span></div>
        ${sp.base.map((v, i) => `<div class="stat"><span>${STAT_NAMES[i]}</span><div class="sbar"><i style="width:${Math.min(100, v / 1.2)}%;background:${E.TYPES[sp.type].color}"></i></div><b>${v}</b></div>`).join('')}
        <div class="mut" style="margin-top:8px">${evoTxt}</div></div>
    </div>`;
    document.getElementById('back').onclick = showDex;
    if (use3D) { const v = G3.createShowcase([id], { drag: true }); if (mount3D('viewer3d', v)) v.bindDrag(document.getElementById('viewer3d')); }
  }

  // ---------- Sfide tra amici ----------
  const LocalServer = window.FMLABServerCore.createServer({
    get: (k) => store.get('fmlab-srv-' + k),
    set: (k, v) => store.set('fmlab-srv-' + k, v),
    del: (k) => store.del('fmlab-srv-' + k),
    keys: () => store.keys('fmlab-srv-').map((k) => k.slice('fmlab-srv-'.length)),
    lock: (fn) => fn(),
    now: () => Date.now(),
    random: () => Math.random(),
  }, E);

  // Online: se il gioco è aperto dal link Google, parla col server con google.script.run;
  // nelle app IPA/APK usa l'URL scritto in config.js; altrimenti il server locale di prova.
  const GAS = window.google && window.google.script && window.google.script.run ? window.google.script.run : null;
  const serverMode = () => (GAS ? 'google' : (save && save.serverUrl || window.FMLAB_SERVER_URL || '').trim() ? 'url' : 'locale');
  async function api(params) {
    if (GAS) {
      return new Promise((resolve) => {
        GAS.withSuccessHandler((r) => resolve(r)).withFailureHandler((e) => resolve({ ok: false, error: 'Errore del server Google: ' + (e && e.message || e) })).apiRun(params);
      });
    }
    const url = (save && save.serverUrl || window.FMLAB_SERVER_URL || '').trim();
    if (!url) { await sleep(120); return LocalServer.handle(params); }
    try {
      const q = new URLSearchParams(params).toString();
      const res = await fetch(url + (url.indexOf('?') >= 0 ? '&' : '?') + q);
      return await res.json();
    } catch (e) {
      return { ok: false, error: 'Server non raggiungibile. Controlla l\'URL e la connessione.' };
    }
  }

  let pollTimer = null;
  function stopPoll() { clearTimeout(pollTimer); pollTimer = null; }

  async function showPvp() {
    stopPoll();
    screen = 'pvp';
    const mode = serverMode();
    const card = mode === 'google'
      ? `<div class="card"><div class="row" style="justify-content:space-between"><b>Online</b><span class="mut" id="srvState">Google ✓</span></div>
          <div class="mut" style="margin-top:6px">Stai giocando dal link Google: tu e i tuoi amici siete già sullo stesso server. Manda il link e un codice sfida.</div></div>`
      : `<div class="card">
        <div class="row" style="justify-content:space-between"><b>Server</b><span class="mut" id="srvState">${mode === 'locale' ? 'Modalità locale' : 'Google Apps Script'}</span></div>
        <input class="field" id="url" style="margin-top:8px" placeholder="URL dell'app web Apps Script (…/exec)" value="${esc(save.serverUrl || window.FMLAB_SERVER_URL || '')}" autocomplete="off">
        <div class="row" style="margin-top:8px"><button class="btn sec grow" id="saveUrl">Salva e prova</button></div>
        <div class="mut" style="margin-top:6px">${mode === 'locale' ? 'Senza URL le sfide funzionano solo su questo telefono (per provare). Per giocare con gli amici incolla l\'URL del tuo Apps Script.' : 'Le sfide passano dal tuo server Google: tu e i tuoi amici dovete usare lo stesso URL.'}</div>
      </div>`;
    app.innerHTML = `<div class="screen">
      <div class="row"><h2 class="grow">Sfide tra amici</h2><button class="btn sec" id="back">Mappa</button></div>
      ${card}
      <div class="card">
        <b>La tua squadra per la sfida</b>
        <div class="row" style="flex-wrap:wrap;gap:2px;margin-top:6px">${save.team.map((m) => `<div style="text-align:center;font-size:11px">${Art.monsterSVG(m.species, { size: 52 })}<div>Lv ${m.level}</div></div>`).join('')}</div>
        <div class="mut">In sfida tutte le creature partono a vita piena.</div>
      </div>
      <button class="btn green" id="create">Crea una sfida</button>
      <div class="row"><input class="field grow" id="code" placeholder="CODICE" maxlength="5" style="text-transform:uppercase;letter-spacing:4px" autocomplete="off"><button class="btn" id="join">Entra</button></div>
      <div class="err" id="err"></div>
      <div class="card"><b>Classifica</b><div id="lb" class="mut">Caricamento…</div></div>
    </div>`;
    document.getElementById('back').onclick = () => showMap();
    const su = document.getElementById('saveUrl');
    if (su) su.onclick = async () => {
      save.serverUrl = document.getElementById('url').value.trim();
      persist();
      const r = await api({ action: 'ping' });
      document.getElementById('srvState').textContent = r.ok ? (save.serverUrl ? 'Collegato ✓' : 'Modalità locale ✓') : 'Non raggiungibile';
      if (!r.ok) document.getElementById('err').textContent = r.error;
      loadLeaderboard();
    };
    document.getElementById('create').onclick = createRoom;
    document.getElementById('join').onclick = () => joinRoom(document.getElementById('code').value);
    loadLeaderboard();
  }
  async function loadLeaderboard() {
    const r = await api({ action: 'leaderboard' });
    const el = document.getElementById('lb');
    if (!el) return;
    if (!r.ok) { el.textContent = r.error; return; }
    el.innerHTML = r.rows.length
      ? r.rows.map((row, i) => `<div class="lb"><span>${i + 1}. ${esc(row.name)}</span><span>${row.wins} V · ${row.losses} S</span></div>`).join('')
      : 'Nessuna sfida ancora. Sii il primo!';
  }
  function pvpTeam() { return JSON.stringify(E.teamSnapshot(save.team)); }

  async function createRoom(friend) {
    const err = document.getElementById('err');
    const r = await api({ action: 'create', name: save.name, team: pvpTeam() });
    if (!r.ok) { if (err) err.textContent = r.error; return; }
    let sent = null;
    if (friend) sent = await api({ action: 'invite', pid: save.pid, to: friend.pid, name: save.name, code: r.code });
    screen = 'room';
    app.innerHTML = `<div class="screen">
      <h2>Sfida creata</h2><div class="mut">${friend ? (sent && sent.ok ? `Invito mandato a <b>${esc(friend.name)}</b>: gli arriva sul suo FMLAB Pod.` : `Invito non arrivato: ${esc(sent && sent.error || '')}. Dagli il codice.`) : 'Dai questo codice al tuo amico: lo scrive in «Entra».'}</div>
      <div class="code" id="roomCode">${r.code}</div>
      ${navigator.share ? '<button class="btn sec" id="share">Condividi il codice</button>' : ''}
      <div class="card waiting"><div class="spinner"></div><div>In attesa che il tuo amico entri…</div></div>
      <button class="btn sec" id="cancel">Annulla</button>
    </div>`;
    if (navigator.share) document.getElementById('share').onclick = () => navigator.share({ text: `Sfidami su FMLAB Monsters! Codice: ${r.code}` }).catch(() => {});
    document.getElementById('cancel').onclick = showPvp;
    const wait = async () => {
      if (screen !== 'room') return;
      const s = await api({ action: 'state', code: r.code, side: 0 });
      if (s.ok && s.status === 'playing') return startPvp(s, 0);
      pollTimer = setTimeout(wait, debug.fast ? 100 : 1500);
    };
    wait();
  }

  async function joinRoom(code) {
    const err = document.getElementById('err') || { set textContent(v) { toast(v); } };
    code = String(code || '').trim().toUpperCase();
    if (code.length !== 5) { err.textContent = 'Il codice ha 5 caratteri.'; return; }
    const r = await api({ action: 'join', code, name: save.name, team: pvpTeam() });
    if (!r.ok) { err.textContent = r.error; return; }
    startPvp(r, 1);
  }

  // ---------- Modalità Orda (game/horde.js) ----------
  // horde.js definisce window.FMLABHorde.start(ctx). Il gioco gli passa tutto quello che serve
  // e riceve il risultato alla fine (esperienza per la creatura usata, capsule, punteggio).
  function startHorde() {
    if (!window.FMLABHorde || !save || !save.team.length) { toast('Modalità Orda non disponibile.'); return; }
    stopPoll();
    clearInterval(holdTimer);
    screen = 'horde';
    window.FMLABHorde.start({
      app, save, E, G3, use3D, api, esc, debug, persist,
      audio: window.FMLABAudio,
      onExit: (result) => {
        result = result || {};
        const mon = save.team.find((m) => m.uid === result.uid) || save.team[0];
        const msgs = [];
        if (mon && result.xp > 0) {
          E.gainXp(mon, Math.round(result.xp)).forEach((ev) => {
            if (ev.kind === 'level') msgs.push(mon.name + ' sale al livello ' + ev.level + '!');
            if (ev.kind === 'evolve') { msgs.push(ev.from + ' si evolve in ' + ev.to + '!'); save.seen[mon.species] = true; save.caught[mon.species] = true; }
          });
        }
        if (result.capsules > 0) save.capsules = Math.min(20, save.capsules + result.capsules);
        save.hordeBest = Math.max(save.hordeBest || 0, result.score || 0);
        persist();
        showMap(result.score != null ? `Orda: ${result.score} punti, ondata ${result.wave || 1}.${result.xp ? ' +' + Math.round(result.xp) + ' esperienza.' : ''}${msgs.length ? ' ' + msgs.join(' ') : ''}` : null);
      },
    });
  }

  // ---------- Sala Online e FMLAB Pod: chi c'è e inviti ----------
  const presence = { online: [], invites: [], timer: null, last: 0 };
  async function hello() {
    if (!save || !save.pid) return;
    const lead = save.team[0];
    const r = await api({ action: 'hello', pid: save.pid, name: save.name, lead: lead ? lead.species : '', lv: lead ? lead.level : 1, zone: ZONE_NAMES[zoneAt(save.pos.y)] });
    if (!r || !r.ok) return;
    presence.online = r.online || []; presence.invites = r.invites || []; presence.last = Date.now();
    const dot = document.getElementById('podDot'); if (dot) dot.style.display = presence.invites.length ? 'block' : 'none';
    if (screen === 'map') renderInvite();
    if (screen === 'lounge') renderLoungeList();
  }
  function startPresence() {
    clearInterval(presence.timer);
    presence.timer = setInterval(() => { if (screen === 'map' || screen === 'lounge' || screen === 'pvp') hello(); }, debug.fast ? 300 : 9000);
    hello();
  }
  function renderInvite() {
    const el = document.getElementById('invite');
    if (!el) return;
    const inv = presence.invites[0];
    if (!inv) { el.style.display = 'none'; el.dataset.sig = ''; return; }
    el.style.display = 'block';
    if (el.dataset.sig === inv.code) return;
    el.dataset.sig = inv.code;
    sfx('invito'); buzz([40, 60, 40]);
    el.innerHTML = `<div class="card glass row"><div class="grow">🔔 <b>${esc(inv.from)}</b> ti sfida!</div><button class="btn green" id="invOk">Accetta</button><button class="btn sec" id="invNo">No</button></div>`;
    document.getElementById('invOk').onclick = () => { presence.invites.shift(); joinRoom(inv.code); };
    document.getElementById('invNo').onclick = async () => { presence.invites.shift(); renderInvite(); await api({ action: 'decline', pid: save.pid, code: inv.code }); };
  }
  function showLounge(fromCenter) {
    stopPoll();
    screen = 'lounge';
    app.innerHTML = `<div class="screen">
      <div class="row"><div class="grow"><h2>${fromCenter ? 'Sala Online' : 'FMLAB Pod'}</h2><div class="mut">${fromCenter ? 'Centro FMLAB · piano di sopra' : 'Amici online e inviti'}</div></div><button class="btn sec" id="back">Mappa</button></div>
      ${use3D ? '<div class="lounge3d" id="lounge3d"></div>' : ''}
      <div class="card"><div class="row" style="justify-content:space-between"><b>Online adesso</b><span class="mut" id="lnState">${serverMode() === 'locale' ? 'solo su questo telefono' : 'server ' + (serverMode() === 'google' ? 'Google' : 'Apps Script')}</span></div>
        <div class="list" id="lnList" style="margin-top:8px"><div class="mut">Cerco gli amici…</div></div></div>
      <div id="lnInv"></div>
      <div class="err" id="err"></div>
      <div class="mut" style="text-align:center">Tu sei <b>${esc(save.name)}</b>${save.team[0] ? ' con ' + esc(save.team[0].name) + ' Lv ' + save.team[0].level : ''}. Gli amici ti vedono finché il gioco è aperto.</div>
    </div>`;
    document.getElementById('back').onclick = () => showMap();
    renderLoungeList();
    startPresence();
  }
  let loungeScene = null;
  function renderLoungeList() {
    const box = document.getElementById('lnList');
    if (!box) return;
    const list = presence.online;
    const sig = JSON.stringify([list, presence.invites]);
    if (box.dataset.sig === sig) return;       // niente da cambiare: non ridisegnare (i tasti restano fermi)
    box.dataset.sig = sig;
    box.innerHTML = list.length ? list.map((f, i) => `<div class="mon" style="padding-right:8px">${f.lead ? Art.monsterSVG(f.lead, { size: 52 }) : ''}
        <div class="info"><div class="nm"><span>${esc(f.name)}</span><span class="mut">${f.lead ? 'Lv ' + f.lv : ''}</span></div><div class="mut" style="font-size:13px">🟢 ${esc(f.zone || 'online')}</div></div>
        <button class="btn green" data-f="${i}" style="padding:10px 14px">Sfida</button></div>`).join('')
      : '<div class="mut">Nessun amico online adesso. Manda il link del gioco: quando entrano li vedi qui.</div>';
    box.querySelectorAll('[data-f]').forEach((b0) => { b0.onclick = () => createRoom(list[Number(b0.dataset.f)]); });
    const inv = document.getElementById('lnInv');
    if (inv) {
      inv.innerHTML = presence.invites.map((x, i) => `<div class="card row" style="margin-bottom:8px"><div class="grow">🔔 <b>${esc(x.from)}</b> ti sfida</div><button class="btn green" data-i="${i}">Accetta</button></div>`).join('');
      inv.querySelectorAll('[data-i]').forEach((b0) => { b0.onclick = () => joinRoom(presence.invites[Number(b0.dataset.i)].code); });
    }
    if (use3D) {
      const ids = list.filter((f) => f.lead).slice(0, 4).map((f) => f.lead);
      if (save.team[0]) ids.unshift(save.team[0].species);
      const key = ids.join(',');
      if (!loungeScene || loungeScene.key !== key) { loungeScene = G3.createShowcase(ids.slice(0, 5), { gap: 1.35, hop: 1 }); loungeScene.key = key; }
      mount3D('lounge3d', loungeScene);
    }
  }

  function viewFromServer(s) {
    return { turn: s.turn, winner: s.winner, sides: E.clone(s.sides) };
  }

  function startPvp(s, side) {
    stopPoll();
    screen = 'battle';
    B = {
      mode: 'pvp', my: side, code: s.code, arena: 'pvp', foeName: s.names[1 - side],
      view: viewFromServer(s), panel: 'main', msg: `Sfida contro ${s.names[1 - side]}! Scegli la tua mossa.`,
    };
    B.act = pvpAct;
    battleIntro('pvp');
    renderBattle();
  }

  async function pvpAct(action) {
    if (B.panel === 'busy' || B.panel === 'wait') return;
    renderActions('busy');
    const r = await api({ action: 'move', code: B.code, side: B.my, turn: B.view.turn + 1, act: JSON.stringify(action) });
    await pvpHandle(r);
  }

  async function pvpHandle(r) {
    if (screen !== 'battle' || !B || B.mode !== 'pvp') return;
    if (!r.ok) { setLog(r.error || 'Errore.'); renderActions('main'); return; }
    if (r.turn > B.view.turn || r.status === 'ended') {
      stopPoll();
      if (r.turn > B.view.turn || (r.lastEvents || []).some((e) => e.t === 'forfeit')) await playEvents(r.lastEvents || []);
      B.view = viewFromServer(r);
      renderSprites();
      if (r.status === 'ended') return endPvp(r);
      setLog('Scegli la tua prossima mossa.');
      renderActions('main');
      return;
    }
    // l'amico non ha ancora scelto
    renderActions('wait');
    pollTimer = setTimeout(async () => {
      const s = await api({ action: 'state', code: B.code, side: B.my });
      pvpHandle(s);
    }, debug.fast ? 100 : 1500);
  }

  function endPvp(r) {
    const won = r.winner === B.my;
    if (won) save.wins += 1; else save.losses += 1;
    persist();
    setLog(r.winner === -1 ? 'Pareggio!' : won ? `Hai vinto la sfida contro ${B.foeName}!` : `${B.foeName} ha vinto la sfida.`);
    if (won) { showVictory('HAI VINTO!'); AU.music('vittoria'); }
    renderActions('end');
  }

  // ---------- Impostazioni ----------
  function showSettings() {
    screen = 'settings';
    applySettings();
    const st0 = save.settings, Q = ['auto', 'alta', 'media', 'bassa'], QN = { auto: 'Auto', alta: 'Alta', media: 'Media', bassa: 'Bassa' };
    app.innerHTML = `<div class="screen settings">
      <div class="row"><h2 class="grow">Impostazioni</h2><button class="btn sec" id="back">Mappa</button></div>
      <div class="card set">
        <label class="srow"><span>🎵 Musica</span><input type="range" id="sMusic" min="0" max="100" value="${Math.round(st0.music * 100)}"><b id="sMusicV">${Math.round(st0.music * 100)}</b></label>
        <label class="srow"><span>🔊 Effetti</span><input type="range" id="sSfx" min="0" max="100" value="${Math.round(st0.sfx * 100)}"><b id="sSfxV">${Math.round(st0.sfx * 100)}</b></label>
        <label class="srow tog"><span>📳 Vibrazione</span><input type="checkbox" id="sVibra" ${st0.vibra ? 'checked' : ''}><i></i></label>
        <label class="srow tog"><span>⚡ Testo veloce</span><input type="checkbox" id="sFast" ${st0.fastText ? 'checked' : ''}><i></i></label>
      </div>
      <div class="card set"><div class="srow"><span>🖼️ Grafica</span></div>
        <div class="seg" id="sQual">${Q.map((q) => `<button class="${st0.quality === q ? 'on' : ''}" data-q="${q}">${QN[q]}</button>`).join('')}</div>
        <div class="mut" style="margin-top:8px">${use3D ? 'Auto abbassa la qualità da sola se il telefono fatica.' : 'Questo telefono usa la grafica 2D.'}</div></div>
      <button class="btn sec" id="sTest">🔔 Prova i suoni</button>
      <div class="mut" style="text-align:center">Musica ed effetti sono composti dal gioco, nota per nota.</div>
    </div>`;
    const keep = () => { persist(); applySettings(); };
    document.getElementById('back').onclick = () => showMap();
    const range = (id, key, lbl) => document.getElementById(id).addEventListener('input', (e) => { st0[key] = Number(e.target.value) / 100; document.getElementById(lbl).textContent = e.target.value; keep(); });
    range('sMusic', 'music', 'sMusicV');
    range('sSfx', 'sfx', 'sSfxV');
    document.getElementById('sVibra').addEventListener('change', (e) => { st0.vibra = e.target.checked; keep(); buzz(60); });
    document.getElementById('sFast').addEventListener('change', (e) => { st0.fastText = e.target.checked; keep(); });
    app.querySelectorAll('#sQual button').forEach((b) => { b.onclick = () => { st0.quality = b.dataset.q; keep(); app.querySelectorAll('#sQual button').forEach((x) => x.classList.toggle('on', x === b)); }; });
    document.getElementById('sTest').onclick = () => { AU.unlock(); ['cura', 'colpo-fuoco', 'superefficace', 'cattura'].forEach((n, i) => setTimeout(() => sfx(n), i * 450)); };
  }

  // ---------- Avvio e agganci per i test ----------
  window.FMLAB = {
    debug,
    get screen() { return screen; },
    get save() { return save; },
    newGame,
    startWild: (sp, lv, zone, opts) => startWild(sp, lv, zone || 'prato', opts),
    showMap, showTeam, showDex, showPvp, showViewer, showLounge, life, world: Wd, serverMode, presence, hello,
    showDiary, story, startTrainer, say, startHorde, showSettings, playEvolution, fx, audio: AU, get titleTapped() { return titleTapped; }, get battle() { return B; }, get dialog() { return dlg; },
    get dialogLine() { return dlg.q ? (dlg.q.name ? dlg.q.name + ': ' : '') + dlg.q.lines[dlg.q.i] : ''; },
    skipDialog: () => { let n = 0; while (dlg.open && n++ < 50) { if (dlg.typing) advanceDialog(); advanceDialog(); } },
    use3D, get gl() { return G3 ? G3.stats : null; },
    step,
  };
  // con debug.fast le animazioni 3D vanno veloci quanto i testi
  let fastSeen = false;
  setInterval(() => { if (G3 && debug.fast !== fastSeen) { fastSeen = debug.fast; G3.speed = debug.fast ? 8 : 1; } }, 20);
  showTitle();
})();
