/*
 * FMLAB Monsters — Modalità Orda (survivor 3D). Definisce window.FMLABHorde.start(ctx).
 * ctx = { app, save, E, G3, use3D, api, esc, debug, persist, audio, onExit(result) }
 * result = { uid, xp, capsules, score, wave }
 *
 * Guidi una creatura della tua squadra in un'arena 3D: attacca da sola con le mosse del suo tipo,
 * arrivano ondate di creature selvatiche sempre più forti, mini-boss ogni 5 ondate e un Guardiano
 * ogni 10. Le gemme fanno salire di livello e a ogni livello scegli un potenziamento; la creatura
 * si evolve durante la partita e la barra dell'Ultimate scatena l'attacco del suo tipo.
 */
(function (root) {
  'use strict';

  // ---------- costanti di gioco ----------
  const ARENA_R = 29.5;                 // raggio calpestabile dell'arena
  const MAX_ENEMIES = 120;              // nemici normali contemporanei al massimo
  const NEAR_DETAIL = 26;               // i più vicini col modello completo, gli altri semplificati
  const WAVE_LEN = 30;                  // secondi per ondata
  const PLAYER_R = 0.45;
  const HP_MUL = 5;                     // in Orda la creatura ha più PS che in lotta

  const WEAPONS = {
    fuoco:   { name: 'Palle di fuoco', icon: '🔥', desc: 'Sfere infuocate contro il nemico più vicino.', cd: 1.0, power: 30 },
    acqua:   { name: 'Getto', icon: '💧', desc: 'Un ventaglio d\'acqua davanti a te.', cd: 1.25, power: 20 },
    erba:    { name: 'Foglie rotanti', icon: '🍃', desc: 'Foglie taglienti che ti girano attorno.', cd: 0, power: 13 },
    elettro: { name: 'Catena di fulmini', icon: '⚡', desc: 'Un fulmine che salta da un nemico all\'altro.', cd: 1.35, power: 32 },
    roccia:  { name: 'Pioggia di massi', icon: '🪨', desc: 'Massi che cadono dove ci sono più nemici.', cd: 1.7, power: 46 },
    ombra:   { name: 'Sfere spettrali', icon: '👻', desc: 'Sfere che inseguono i nemici.', cd: 1.45, power: 26 },
    normale: { name: 'Onda d\'urto', icon: '💥', desc: 'Un\'onda che respinge chi ti sta addosso.', cd: 2.1, power: 24 },
  };
  const ULTS = {
    fuoco: 'Supernova', acqua: 'Diluvio', erba: 'Giungla Furiosa', elettro: 'Tempesta Perfetta',
    roccia: 'Terremoto', ombra: 'Eclissi Totale', normale: 'Mega Botta',
  };
  const PASSIVES = {
    dmg:    { name: 'Forza', icon: '💪', desc: '+15% danno a tutti gli attacchi.', max: 5 },
    cd:     { name: 'Ritmo', icon: '⏱️', desc: 'Attacchi il 10% più spesso.', max: 5 },
    area:   { name: 'Ampiezza', icon: '🌀', desc: '+15% area degli attacchi.', max: 5 },
    regen:  { name: 'Rigenerazione', icon: '💚', desc: 'Recuperi PS nel tempo.', max: 5 },
    magnet: { name: 'Calamita', icon: '🧲', desc: 'Raccogli le gemme da più lontano.', max: 3 },
    shield: { name: 'Scudo', icon: '🛡️', desc: 'Blocca un colpo ogni pochi secondi.', max: 3 },
    speed:  { name: 'Scatto', icon: '👟', desc: '+8% velocità di movimento.', max: 4 },
    maxhp:  { name: 'Tempra', icon: '❤️', desc: '+15% PS massimi e cura.', max: 5 },
  };
  const GUARD_FALLBACK = [
    { id: 'flora', name: 'Flora', title: 'Guardiana del Prato', look: 'guardiano_prato', team: [['semino', 8], ['fogliardo', 10]] },
    { id: 'marina', name: 'Marina', title: 'Guardiana del Fiume', look: 'guardiano_fiume', team: [['goccino', 12], ['voltino', 13], ['ondaro', 15]] },
    { id: 'corvino', name: 'Corvino', title: 'Guardiano del Bosco', look: 'guardiano_bosco', team: [['ombrino', 16], ['voltino', 16], ['spettrax', 19]] },
    { id: 'petra', name: 'Petra', title: 'Guardiana della Grotta', look: 'guardiano_grotta', team: [['sassetto', 20], ['granitor', 22], ['granitor', 24]] },
  ];

  // ---------- stile (iniettato: style.css non è di questo modulo) ----------
  const CSS = `
.hz-root { position: fixed; inset: 0; z-index: 20; background: #0f1422; color: #eef2fb; overflow: hidden; touch-action: none; user-select: none; -webkit-user-select: none; font-family: -apple-system, "SF Pro Text", system-ui, Roboto, sans-serif; }
.hz-stage { position: absolute; inset: 0; }
.hz-stage canvas { display: block; width: 100%; height: 100%; }
.hz-hud { position: absolute; inset: 0; pointer-events: none; }
.hz-hud button { pointer-events: auto; font: inherit; color: inherit; border: 0; cursor: pointer; }
.hz-top { position: absolute; top: calc(8px + env(safe-area-inset-top, 0px)); left: calc(10px + env(safe-area-inset-left, 0px)); right: 64px; display: flex; flex-direction: column; gap: 5px; max-width: 460px; }
.hz-bar { position: relative; height: 14px; border-radius: 8px; background: rgba(10,14,26,.7); overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,.25); }
.hz-bar i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 8px; transition: width .15s linear; }
.hz-bar span { position: absolute; inset: 0; font-size: 10.5px; font-weight: 800; line-height: 14px; padding-left: 7px; text-shadow: 0 1px 2px #000; }
.hz-hp i { background: linear-gradient(90deg, #ef4444, #f97316 40%, #22c55e); }
.hz-xp { height: 9px; } .hz-xp i { background: linear-gradient(90deg, #38bdf8, #a78bfa); } .hz-xp span { line-height: 9px; font-size: 8.5px; }
.hz-row { display: flex; gap: 6px; flex-wrap: wrap; font-size: 12.5px; font-weight: 800; }
.hz-chip { background: rgba(10,14,26,.66); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); border-radius: 9px; padding: 3px 8px; }
.hz-weapons { display: flex; gap: 4px; flex-wrap: wrap; }
.hz-weapons span { background: rgba(10,14,26,.6); border-radius: 8px; padding: 2px 6px; font-size: 12px; font-weight: 800; }
.hz-pause { position: absolute; top: calc(8px + env(safe-area-inset-top, 0px)); right: calc(10px + env(safe-area-inset-right, 0px)); width: 46px; height: 46px; border-radius: 14px; background: rgba(10,14,26,.7) !important; font-size: 20px !important; }
.hz-ult { position: absolute; right: calc(16px + env(safe-area-inset-right, 0px)); bottom: calc(22px + env(safe-area-inset-bottom, 0px)); width: 92px; height: 92px; border-radius: 50%; background: rgba(10,14,26,.72) !important; display: flex; align-items: center; justify-content: center; flex-direction: column; font-weight: 900; font-size: 11px !important; letter-spacing: .5px; }
.hz-ult svg { position: absolute; inset: 0; transform: rotate(-90deg); }
.hz-ult .ic { font-size: 28px; line-height: 1; filter: grayscale(1) brightness(.7); }
.hz-ult.ready { animation: hzPulse 0.9s ease-in-out infinite; }
.hz-ult.ready .ic { filter: none; }
@keyframes hzPulse { 50% { transform: scale(1.08); box-shadow: 0 0 26px var(--hzc, #fbbf24); } }
.hz-boss { position: absolute; left: 50%; transform: translateX(-50%); top: calc(118px + env(safe-area-inset-top, 0px)); width: min(360px, 80vw); display: none; text-align: center; font-weight: 900; font-size: 13px; text-shadow: 0 1px 3px #000; }
.hz-boss .hz-bar { height: 12px; margin-top: 3px; } .hz-boss .hz-bar i { background: linear-gradient(90deg, #a855f7, #ef4444); }
.hz-banner { position: absolute; left: 0; right: 0; top: 36%; text-align: center; font-size: 30px; font-weight: 900; letter-spacing: .5px; text-shadow: 0 3px 14px rgba(0,0,0,.7); opacity: 0; transition: opacity .25s, transform .25s; transform: scale(.85); padding: 0 16px; }
.hz-banner small { display: block; font-size: 15px; font-weight: 700; opacity: .9; margin-top: 4px; }
.hz-banner.on { opacity: 1; transform: scale(1); }
.hz-joy { position: absolute; width: 130px; height: 130px; margin: -65px 0 0 -65px; border-radius: 50%; background: rgba(255,255,255,.08); border: 2px solid rgba(255,255,255,.22); display: none; }
.hz-knob { position: absolute; left: 50%; top: 50%; width: 56px; height: 56px; margin: -28px 0 0 -28px; border-radius: 50%; background: rgba(255,255,255,.55); box-shadow: 0 3px 10px rgba(0,0,0,.3); }
.hz-num { position: absolute; font-weight: 900; font-size: 15px; text-shadow: 0 2px 3px rgba(0,0,0,.8); white-space: nowrap; pointer-events: none; will-change: transform, opacity; }
.hz-num.big { font-size: 21px; color: #fde047; } .hz-num.weak { color: #cbd5e1; font-size: 13px; } .hz-num.heal { color: #4ade80; }
.hz-flash { position: absolute; inset: 0; opacity: 0; pointer-events: none; }
.hz-flash.go { animation: hzFlash 1.1s ease-out; }
@keyframes hzFlash { 0% { opacity: .95; } 100% { opacity: 0; } }
.hz-hurt { position: absolute; inset: 0; pointer-events: none; box-shadow: inset 0 0 90px rgba(239,68,68,.75); opacity: 0; transition: opacity .25s; }
.hz-modal { position: absolute; inset: 0; display: none; align-items: center; justify-content: center; background: rgba(5,8,16,.62); -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px); pointer-events: auto; padding: 16px; }
.hz-modal.on { display: flex; }
.hz-card { background: #161d30; border-radius: 22px; padding: 18px; width: min(440px, 100%); max-height: 92vh; overflow: auto; box-shadow: 0 20px 60px rgba(0,0,0,.5); }
.hz-card h2 { margin: 0 0 4px; font-size: 22px; }
.hz-mut { color: #93a0bb; font-size: 13.5px; }
.hz-choices { display: grid; gap: 10px; margin-top: 12px; }
.hz-choice { display: flex !important; gap: 12px; align-items: center; text-align: left; background: #222b44 !important; border-radius: 16px; padding: 12px 14px; border: 2px solid transparent !important; }
.hz-choice:active, .hz-choice:hover { border-color: #fbbf24 !important; }
.hz-choice .ic { font-size: 30px; width: 40px; text-align: center; flex: none; }
.hz-choice b { display: block; font-size: 16px; } .hz-choice small { color: #a5b1cc; font-size: 13px; }
.hz-choice .new { color: #fbbf24; font-size: 11px; font-weight: 900; letter-spacing: .4px; }
.hz-btn { display: block; width: 100%; padding: 14px; border-radius: 14px; background: #3b82f6 !important; font-weight: 800; font-size: 17px; margin-top: 10px; }
.hz-btn.sec { background: #2a3350 !important; } .hz-btn.go { background: linear-gradient(90deg, #f97316, #ef4444) !important; }
.hz-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 12px 0; }
.hz-stats div { background: #222b44; border-radius: 12px; padding: 8px 10px; } .hz-stats b { display: block; font-size: 19px; }
.hz-lb { margin-top: 8px; font-size: 14px; } .hz-lb div { display: flex; justify-content: space-between; padding: 5px 2px; border-bottom: 1px solid #263048; }
.hz-lb .me { color: #fbbf24; font-weight: 800; }
.hz-pick { position: absolute; inset: 0; overflow: auto; padding: calc(14px + env(safe-area-inset-top, 0px)) 16px calc(16px + env(safe-area-inset-bottom, 0px)); display: flex; flex-direction: column; gap: 12px; max-width: 520px; margin: 0 auto; }
.hz-title { font-size: 30px; font-weight: 900; background: linear-gradient(90deg, #f97316, #ef4444, #a855f7); -webkit-background-clip: text; color: transparent; }
.hz-show { height: 210px; border-radius: 20px; background: radial-gradient(circle at 50% 70%, #3a2a5a, #0f1422 72%); }
.hz-team { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.hz-mon { background: #1a2133 !important; border-radius: 14px; padding: 8px 4px !important; text-align: center; border: 2px solid transparent !important; font-size: 13px !important; }
.hz-mon.sel { border-color: #f97316 !important; background: #232c42 !important; }
.hz-mon svg { display: block; margin: 0 auto; }
.hz-info { background: #1a2133; border-radius: 16px; padding: 12px 14px; font-size: 14px; line-height: 1.4; }
.hz-row2 { display: flex; gap: 8px; } .hz-row2 .hz-btn { margin-top: 0; }
@media (orientation: landscape) and (max-height: 560px) {
  .hz-top { right: auto; width: min(420px, 52vw); }
  .hz-boss { top: calc(10px + env(safe-area-inset-top, 0px)); left: auto; right: 74px; transform: none; width: min(300px, 34vw); }
  .hz-banner { top: 30%; }
  .hz-ult { width: 84px; height: 84px; }
  .hz-pick { max-width: 860px; display: grid; grid-template-columns: 1fr 1fr; align-content: start; }
  .hz-pick > .full { grid-column: 1 / -1; }
  .hz-show { height: 190px; }
}`;

  // ---------- utilità ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const fmtTime = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }
  function noise2(x, z) {
    const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
    const h = (a, b) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };
    const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
    const a = h(xi, zi), b = h(xi + 1, zi), c = h(xi, zi + 1), d = h(xi + 1, zi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }

  let ctx = null, G = null, ui = null, keys = new Set(), session = null, styleDone = false;

  // ---------- ingresso: scelta della creatura ----------
  function start(c) {
    ctx = c;
    if (!styleDone) { const st = document.createElement('style'); st.id = 'hz-style'; st.textContent = CSS; document.head.appendChild(st); styleDone = true; }
    session = session && session.save === ctx.save ? session : { save: ctx.save, xp: 0, capsules: 0, best: 0, bestWave: 0, uid: null, runs: 0 };
    showPick();
  }

  function teamMons() { return ctx.save.team.filter((m) => m && ctx.E.SPECIES[m.species]); }

  function showPick(selUid) {
    if (G) cleanup();
    const E = ctx.E, esc = ctx.esc, Art = root.FMLABArt;
    const team = teamMons();
    let sel = team.find((m) => m.uid === selUid) || team.find((m) => m.uid === session.uid) || team[0];
    const draw = () => {
      const sp = E.SPECIES[sel.species], type = sp.type, w = WEAPONS[type];
      ctx.app.innerHTML = `<div class="hz-root"><div class="hz-pick">
        <div class="full" style="display:flex;align-items:center;gap:10px"><div style="flex:1"><div class="hz-title">🔥 Modalità Orda</div>
          <div class="hz-mut">Resisti alle ondate, fai evolvere la tua creatura, batti i Guardiani.</div></div>
          <button class="hz-btn sec" id="hzBack" style="width:auto;margin:0;padding:10px 14px">Mappa</button></div>
        <div class="hz-show" id="hzShow">${ctx.use3D ? '' : (Art ? Art.monsterSVG(sel.species, { size: 180, shiny: sel.shiny }) : '')}</div>
        <div>
          <div class="hz-team">${team.map((m) => `<button class="hz-mon${m.uid === sel.uid ? ' sel' : ''}" data-uid="${esc(m.uid)}">${Art ? Art.monsterSVG(m.species, { size: 56, shiny: m.shiny }) : ''}<div><b>${esc(m.name)}</b>${m.shiny ? ' ✨' : ''}</div><div class="hz-mut">Lv ${m.level}</div></button>`).join('')}</div>
          <div class="hz-info" style="margin-top:10px">${w.icon} <b>${w.name}</b> — ${w.desc}<br>⭐ Ultimate: <b>${ULTS[type]}</b>${sp.evo ? `<br>🧬 Si evolve in <b>${esc(E.SPECIES[sp.evo.to].name)}</b> quando arriva al livello ${sp.evo.level} durante la partita.` : ''}
            <div class="hz-mut" style="margin-top:6px">Record: <b>${Math.max(ctx.save.hordeBest || 0, session.best)}</b> punti${session.runs ? ` · in questa sessione: ${Math.round(session.xp)} esperienza, ${session.capsules} capsule` : ''}</div></div>
          <button class="hz-btn go" id="hzGo">Inizia con ${esc(sel.name)}</button>
          <div class="hz-row2" style="margin-top:8px"><button class="hz-btn sec" id="hzTop">Classifica</button><button class="hz-btn sec" id="hzHelp">Come si gioca</button></div>
          <div id="hzPickMsg" class="hz-mut" style="margin-top:8px"></div>
        </div></div></div>`;
      if (ctx.use3D) {
        const sc = ctx.G3.createShowcase([sel.species + (sel.shiny ? '*' : '')], { spin: true, size: 1.15 });
        ctx.G3.mount(document.getElementById('hzShow'), sc);
      }
      ctx.app.querySelectorAll('.hz-mon').forEach((b) => { b.onclick = () => { sel = team.find((m) => m.uid === b.dataset.uid) || sel; draw(); }; });
      document.getElementById('hzBack').onclick = exitToMap;
      document.getElementById('hzGo').onclick = () => { session.uid = sel.uid; begin(sel); };
      document.getElementById('hzTop').onclick = () => showTop(document.getElementById('hzPickMsg'));
      document.getElementById('hzHelp').onclick = () => {
        document.getElementById('hzPickMsg').innerHTML = 'Trascina il dito sullo schermo per muoverti (su computer: WASD o frecce). Gli attacchi partono da soli. Raccogli le gemme per salire di livello e scegli un potenziamento. Quando il cerchio è pieno tocca <b>ULTIMATE</b> (o barra spaziatrice). Ogni 5 ondate arriva un mini-boss, ogni 10 un Guardiano.';
      };
    };
    draw();
  }

  async function showTop(el, mine) {
    if (!el) return;
    el.innerHTML = 'Carico la classifica…';
    const r = await ctx.api({ action: 'hordeTop' });
    if (!r || !r.ok) { el.textContent = (r && r.error) || 'Classifica non raggiungibile.'; return; }
    el.innerHTML = '<div class="hz-lb">' + (r.rows.length ? r.rows.slice(0, 10).map((x, i) => `<div class="${x.name === ctx.save.name ? 'me' : ''}"><span>${i + 1}. ${ctx.esc(x.name)} <span class="hz-mut">${ctx.esc((ctx.E.SPECIES[x.species] || {}).name || '')}</span></span><span>${x.score} · ond. ${x.wave}</span></div>`).join('') : '<div>Nessun punteggio ancora: fai il primo!</div>') + '</div>' + (mine || '');
  }

  function exitToMap() {
    cleanup();
    const res = { uid: session.uid || (teamMons()[0] || {}).uid, xp: Math.round(session.xp), capsules: session.capsules, score: session.runs ? session.best : null, wave: session.bestWave || 1 };
    const cb = ctx.onExit;
    session = null;
    if (cb) cb(session === null && res.score == null ? {} : res);
  }

  // ---------- partita ----------
  function begin(mon) {
    const E = ctx.E;
    cleanup();
    const sp = E.SPECIES[mon.species];
    G = {
      mon, species: mon.species, shiny: !!mon.shiny, type: sp.type, baseLevel: mon.level,
      x: 0, z: 0, yaw: Math.PI, vx: 0, vz: 0, moving: false, walk: 0,
      level: 1, xp: 0, next: xpNeed(1), effLevel: mon.level,
      hp: 1, maxhp: 1, atk: 1, def: 1, iframe: 0, shieldT: 0, hurtT: 0,
      weapons: [{ type: sp.type, lvl: 1, t: 0.4 }], passive: {},
      enemies: [], shots: [], rocks: [], chains: [], rings: [], gems: [], fx: [], nums: [],
      wave: 1, waveT: 0, time: 0, spawnT: 0, kills: 0, score: 0, ult: 0, xpRaw: 0,
      paused: false, over: false, pendingLevels: 0, modal: null, shake: 0, flashT: 0,
      boss: null, guardianIdx: 0, trainers: [], nextUid: 1, camX: 0, camZ: 0, leafA: 0,
      joy: { id: null, ox: 0, oy: 0, dx: 0, dy: 0 }, last: 0, ended: false,
    };
    recalc(true);
    buildHud();
    bindInput();
    if (ctx.audio && ctx.audio.music) try { ctx.audio.music('orda'); } catch (e) { /* audio facoltativo */ }
    sfx('orda-start');
    banner('Ondata 1', 'Sopravvivi!');
    if (ctx.use3D) {
      G.scene = { clock: 0, frame: frame3D };
      ctx.G3.mount(ui.stage, G.scene);
    } else {
      G.cv = document.createElement('canvas'); ui.stage.appendChild(G.cv);
      G.raf = requestAnimationFrame(loop2D);
    }
  }

  function xpNeed(lv) { return Math.round(5 + lv * 4.5 + lv * lv * 0.35); }
  function pv(k) { return (G.passive[k] || 0); }
  function recalc(heal) {
    const E = ctx.E, m = G.mon;
    const st = E.statsFor(G.species, G.effLevel, m.talents, m.nature);
    const ratio = G.maxhp > 1 ? G.hp / G.maxhp : 1;
    G.maxhp = Math.round(st.maxhp * HP_MUL * (1 + 0.15 * pv('maxhp')));
    G.atk = st.atk; G.def = st.def;
    G.speed = (4.1 + st.spd / 90) * (1 + 0.08 * pv('speed'));
    G.hp = heal ? G.maxhp : Math.max(1, Math.round(G.maxhp * ratio));
  }
  const dmgMul = () => 1 + 0.15 * pv('dmg');
  const cdMul = () => Math.pow(0.9, pv('cd'));
  const areaMul = () => 1 + 0.15 * pv('area');
  const magnetR = () => 2.3 * (1 + 0.4 * pv('magnet'));

  function sfx(name) { if (ctx && ctx.audio && ctx.audio.sfx) try { ctx.audio.sfx(name); } catch (e) { /* audio facoltativo */ } }

  // ---------- interfaccia ----------
  function buildHud() {
    const c = ctx.E.TYPES[G.type] ? ctx.E.TYPES[G.type].color : '#fbbf24';
    ctx.app.innerHTML = `<div class="hz-root" id="hzRoot" style="--hzc:${c}">
      <div class="hz-stage" id="hzStage"></div>
      <div class="hz-hud">
        <div class="hz-top">
          <div class="hz-bar hz-hp"><i id="hzHp"></i><span id="hzHpT"></span></div>
          <div class="hz-bar hz-xp"><i id="hzXp"></i><span id="hzLv"></span></div>
          <div class="hz-row"><span class="hz-chip" id="hzWave"></span><span class="hz-chip" id="hzTime"></span><span class="hz-chip" id="hzKills"></span><span class="hz-chip" id="hzScore"></span></div>
          <div class="hz-weapons" id="hzWeap"></div>
        </div>
        <button class="hz-pause" id="hzPause" aria-label="Pausa">⏸</button>
        <div class="hz-boss" id="hzBoss"><span id="hzBossN"></span><div class="hz-bar"><i id="hzBossHp"></i></div></div>
        <div class="hz-banner" id="hzBanner"></div>
        <div class="hz-joy" id="hzJoy"><div class="hz-knob" id="hzKnob"></div></div>
        <div id="hzNums"></div>
        <div class="hz-hurt" id="hzHurt"></div>
        <div class="hz-flash" id="hzFlash"></div>
        <button class="hz-ult" id="hzUlt" aria-label="Ultimate"><svg viewBox="0 0 92 92" width="100%" height="100%"><circle cx="46" cy="46" r="41" stroke="rgba(255,255,255,.15)" stroke-width="7" fill="none"/><circle id="hzUltRing" cx="46" cy="46" r="41" stroke="${c}" stroke-width="7" fill="none" stroke-linecap="round" stroke-dasharray="257.6" stroke-dashoffset="257.6"/></svg><span class="ic">${WEAPONS[G.type].icon}</span><span>ULTIMATE</span></button>
        <div class="hz-modal" id="hzModal"></div>
      </div></div>`;
    const $ = (id) => document.getElementById(id);
    ui = { root: $('hzRoot'), stage: $('hzStage'), hp: $('hzHp'), hpT: $('hzHpT'), xp: $('hzXp'), lv: $('hzLv'), wave: $('hzWave'), time: $('hzTime'), kills: $('hzKills'), score: $('hzScore'),
      weap: $('hzWeap'), boss: $('hzBoss'), bossN: $('hzBossN'), bossHp: $('hzBossHp'), banner: $('hzBanner'), joy: $('hzJoy'), knob: $('hzKnob'), nums: $('hzNums'), hurt: $('hzHurt'), flash: $('hzFlash'),
      ult: $('hzUlt'), ultRing: $('hzUltRing'), modal: $('hzModal'), pause: $('hzPause'), numPool: [], last: {} };
    for (let i = 0; i < 28; i++) { const d = document.createElement('div'); d.className = 'hz-num'; d.style.display = 'none'; ui.nums.appendChild(d); ui.numPool.push({ el: d, life: 0 }); }
    ui.pause.onclick = () => openPause();
    ui.ult.onclick = (e) => { e.stopPropagation(); fireUlt(); };
    renderWeapons();
  }
  function setText(el, key, v) { if (ui.last[key] !== v) { ui.last[key] = v; el.textContent = v; } }
  function updateHud() {
    if (!ui) return;
    const hpP = Math.max(0, G.hp / G.maxhp) * 100;
    if (ui.last.hpP !== Math.round(hpP)) { ui.last.hpP = Math.round(hpP); ui.hp.style.width = hpP + '%'; }
    setText(ui.hpT, 'hpT', Math.max(0, Math.ceil(G.hp)) + ' / ' + G.maxhp + (pv('shield') ? (G.shieldT <= 0 ? '  🛡️' : '') : ''));
    const xpP = Math.round(Math.min(1, G.xp / G.next) * 100);
    if (ui.last.xpP !== xpP) { ui.last.xpP = xpP; ui.xp.style.width = xpP + '%'; }
    setText(ui.lv, 'lv', 'Lv ' + G.level + ' · ' + ctx.E.SPECIES[G.species].name + ' Lv ' + G.effLevel);
    setText(ui.wave, 'wave', '🌊 Ondata ' + G.wave);
    setText(ui.time, 'time', '⏱ ' + fmtTime(G.time));
    setText(ui.kills, 'kills', '💀 ' + G.kills);
    setText(ui.score, 'score', '⭐ ' + G.score);
    const off = Math.round(257.6 * (1 - G.ult));
    if (ui.last.ult !== off) { ui.last.ult = off; ui.ultRing.setAttribute('stroke-dashoffset', off); ui.ult.classList.toggle('ready', G.ult >= 1); }
    if (G.boss && G.boss.hp > 0) {
      ui.boss.style.display = 'block';
      setText(ui.bossN, 'bossN', G.boss.title);
      const bp = Math.round(G.boss.hp / G.boss.maxhp * 100);
      if (ui.last.bossP !== bp) { ui.last.bossP = bp; ui.bossHp.style.width = bp + '%'; }
    } else if (ui.boss.style.display !== 'none') ui.boss.style.display = 'none';
    ui.hurt.style.opacity = G.hurtT > 0 ? Math.min(1, G.hurtT * 2.5) : (G.hp / G.maxhp < 0.25 ? 0.35 + Math.sin(G.time * 6) * 0.15 : 0);
  }
  function renderWeapons() {
    if (!ui) return;
    ui.weap.innerHTML = G.weapons.map((w) => `<span>${WEAPONS[w.type].icon} ${w.lvl}</span>`).join('') +
      Object.keys(G.passive).map((k) => `<span>${PASSIVES[k].icon} ${G.passive[k]}</span>`).join('');
  }
  let bannerTimer = null;
  function banner(title, sub, ms) {
    if (!ui) return;
    ui.banner.innerHTML = ctx.esc(title) + (sub ? '<small>' + ctx.esc(sub) + '</small>' : '');
    ui.banner.classList.add('on');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => ui && ui.banner.classList.remove('on'), ms || 1700);
  }
  function screenFlash(color) {
    if (!ui) return;
    ui.flash.style.background = `radial-gradient(circle at 50% 55%, rgba(255,255,255,.95), ${color} 55%, transparent 100%)`;
    ui.flash.classList.remove('go'); void ui.flash.offsetWidth; ui.flash.classList.add('go');
  }
  function addNum(x, y, z, text, cls) {
    if (!ui) return;
    let slot = ui.numPool.find((n) => n.life <= 0);
    if (!slot) slot = ui.numPool.reduce((a, b) => (a.life < b.life ? a : b));
    slot.life = 0.75; slot.x = x + rnd(-0.3, 0.3); slot.y = y; slot.z = z; slot.vy = 1.6;
    slot.el.className = 'hz-num' + (cls ? ' ' + cls : '');
    slot.el.textContent = text;
    slot.el.style.display = 'block';
  }
  function updateNums(dt) {
    if (!ui) return;
    const W = ui.stage.clientWidth, H = ui.stage.clientHeight;
    ui.numPool.forEach((n) => {
      if (n.life <= 0) return;
      n.life -= dt; n.y += n.vy * dt;
      if (n.life <= 0) { n.el.style.display = 'none'; return; }
      const p = project(n.x, n.y, n.z, W, H);
      if (!p) { n.el.style.display = 'none'; return; }
      n.el.style.transform = `translate(${p[0].toFixed(1)}px, ${p[1].toFixed(1)}px) translate(-50%, -50%) scale(${(0.8 + Math.min(0.4, (0.75 - n.life) * 3)).toFixed(2)})`;
      n.el.style.opacity = Math.min(1, n.life * 3).toFixed(2);
    });
  }
  function project(x, y, z, W, H) {
    const m = G.PV;
    if (!m) return [W / 2 + (x - G.camX) * 26, H / 2 + (z - G.camZ) * 26 - y * 26];
    const cx = m[0] * x + m[4] * y + m[8] * z + m[12], cy = m[1] * x + m[5] * y + m[9] * z + m[13], cw = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (cw <= 0.01) return null;
    return [(cx / cw * 0.5 + 0.5) * W, (1 - (cy / cw * 0.5 + 0.5)) * H];
  }

  // ---------- comandi ----------
  function bindInput() {
    const el = ui.root;
    const isButton = (t) => t && t.closest && t.closest('button, .hz-modal.on');
    el.addEventListener('pointerdown', (e) => {
      if (isButton(e.target) || G.paused) return;
      if (G.joy.id != null) return;
      G.joy.id = e.pointerId; G.joy.ox = e.clientX; G.joy.oy = e.clientY; G.joy.dx = 0; G.joy.dy = 0;
      ui.joy.style.display = 'block'; ui.joy.style.left = e.clientX + 'px'; ui.joy.style.top = e.clientY + 'px';
      ui.knob.style.transform = '';
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* vecchi browser */ }
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== G.joy.id) return;
      let dx = e.clientX - G.joy.ox, dy = e.clientY - G.joy.oy;
      const l = Math.hypot(dx, dy), max = 52;
      if (l > max) { dx *= max / l; dy *= max / l; }
      G.joy.dx = dx / max; G.joy.dy = dy / max;
      ui.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    });
    const up = (e) => { if (e.pointerId !== G.joy.id) return; G.joy.id = null; G.joy.dx = 0; G.joy.dy = 0; ui.joy.style.display = 'none'; };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    G.onKey = (e) => {
      const k = e.key.toLowerCase();
      if (e.type === 'keydown') {
        if (k === ' ' && !G.paused) { e.preventDefault(); fireUlt(); return; }
        if ((k === 'escape' || k === 'p') && !G.over) { e.preventDefault(); if (G.modal === 'pause') closeModal(); else if (!G.modal) openPause(); return; }
        if (G.modal === 'level' && /^[123]$/.test(k)) { choose(Number(k) - 1); return; }
        keys.add(k);
      } else keys.delete(k);
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    };
    window.addEventListener('keydown', G.onKey); window.addEventListener('keyup', G.onKey);
    G.onVis = () => { if (document.hidden && G && !G.over && !G.modal) openPause(); };
    document.addEventListener('visibilitychange', G.onVis);
  }
  function inputVec() {
    let x = G.joy.dx, y = G.joy.dy;
    if (keys.has('a') || keys.has('arrowleft')) x -= 1;
    if (keys.has('d') || keys.has('arrowright')) x += 1;
    if (keys.has('w') || keys.has('arrowup')) y -= 1;
    if (keys.has('s') || keys.has('arrowdown')) y += 1;
    if (debug.move) { x = debug.move[0]; y = debug.move[1]; }
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return [x, y];
  }
  function cleanup() {
    if (G) {
      if (G.onKey) { window.removeEventListener('keydown', G.onKey); window.removeEventListener('keyup', G.onKey); }
      if (G.onVis) document.removeEventListener('visibilitychange', G.onVis);
      if (G.raf) cancelAnimationFrame(G.raf);
      G.ended = true;
    }
    keys.clear();
    clearTimeout(bannerTimer);
    G = null; ui = null;
  }

  // ---------- finestre: livello, pausa, risultati ----------
  function openModal(kind, html) {
    G.modal = kind; G.paused = true;
    G.joy.id = null; G.joy.dx = 0; G.joy.dy = 0; if (ui) ui.joy.style.display = 'none';
    ui.modal.innerHTML = '<div class="hz-card">' + html + '</div>';
    ui.modal.classList.add('on');
  }
  function closeModal() {
    if (!ui) return;
    ui.modal.classList.remove('on'); ui.modal.innerHTML = '';
    G.modal = null; G.paused = false;
    if (G.pendingLevels > 0) setTimeout(() => { if (G && !G.modal && !G.over) openLevel(); }, 120);
  }
  function openPause() {
    if (!G || G.over || G.modal) return;
    openModal('pause', `<h2>Pausa</h2><div class="hz-mut">Ondata ${G.wave} · ${fmtTime(G.time)} · ${G.score} punti</div>
      <div class="hz-stats"><div><span class="hz-mut">Livello</span><b>${G.level}</b></div><div><span class="hz-mut">Sconfitti</span><b>${G.kills}</b></div></div>
      <button class="hz-btn go" id="hzResume">Riprendi</button><button class="hz-btn sec" id="hzQuit">Termina la partita</button>`);
    document.getElementById('hzResume').onclick = closeModal;
    document.getElementById('hzQuit').onclick = () => { ui.modal.classList.remove('on'); G.modal = null; gameOver(true); };
  }
  function upgradeChoices() {
    const opts = [];
    G.weapons.forEach((w) => { if (w.lvl < 6) opts.push({ kind: 'weapon', type: w.type, w: 3 }); });
    if (G.weapons.length < 4) Object.keys(WEAPONS).forEach((t) => { if (!G.weapons.some((w) => w.type === t)) opts.push({ kind: 'new', type: t, w: t === G.type ? 0 : 1.2 }); });
    Object.keys(PASSIVES).forEach((k) => { if (pv(k) < PASSIVES[k].max) opts.push({ kind: 'passive', key: k, w: k === 'regen' && G.hp / G.maxhp < 0.5 ? 2.5 : 1.4 }); });
    const out = [];
    while (out.length < 3 && opts.length) {
      const tot = opts.reduce((a, o) => a + o.w, 0);
      let r = Math.random() * tot, i = 0;
      for (; i < opts.length - 1; i++) { r -= opts[i].w; if (r <= 0) break; }
      out.push(opts.splice(i, 1)[0]);
    }
    if (!out.length) out.push({ kind: 'heal' });
    return out;
  }
  function choiceHtml(o) {
    if (o.kind === 'weapon') { const W = WEAPONS[o.type], w = G.weapons.find((x) => x.type === o.type); return [W.icon, W.name + ' Lv ' + (w.lvl + 1), 'Più danno' + (o.type === 'erba' ? ' e più foglie' : o.type === 'elettro' ? ' e salti più lunghi' : ' e più colpi') + '.', '']; }
    if (o.kind === 'new') { const W = WEAPONS[o.type]; return [W.icon, W.name, W.desc, 'NUOVO']; }
    if (o.kind === 'passive') { const P = PASSIVES[o.key]; return [P.icon, P.name + ' ' + (pv(o.key) + 1), P.desc, pv(o.key) ? '' : 'NUOVO']; }
    return ['💖', 'Cura completa', 'Recuperi tutti i PS.', ''];
  }
  function openLevel() {
    if (!G || G.over) return;
    G.choices = upgradeChoices();
    openModal('level', `<h2>Livello ${G.level}!</h2><div class="hz-mut">Scegli un potenziamento</div><div class="hz-choices">${G.choices.map((o, i) => {
      const [ic, nm, ds, nw] = choiceHtml(o);
      return `<button class="hz-choice" data-i="${i}"><span class="ic">${ic}</span><span>${nw ? `<span class="new">${nw}</span>` : ''}<b>${nm}</b><small>${ds}</small></span></button>`;
    }).join('')}</div>`);
    ui.modal.querySelectorAll('.hz-choice').forEach((b) => { b.onclick = () => choose(Number(b.dataset.i)); });
    sfx('levelup');
  }
  function choose(i) {
    if (!G || G.modal !== 'level' || !G.choices || !G.choices[i]) return;
    const o = G.choices[i];
    if (o.kind === 'weapon') G.weapons.find((w) => w.type === o.type).lvl++;
    else if (o.kind === 'new') G.weapons.push({ type: o.type, lvl: 1, t: 0.3 });
    else if (o.kind === 'passive') {
      G.passive[o.key] = pv(o.key) + 1;
      if (o.key === 'maxhp' || o.key === 'speed') { recalc(false); if (o.key === 'maxhp') G.hp = Math.min(G.maxhp, G.hp + G.maxhp * 0.25); }
    } else G.hp = G.maxhp;
    G.pendingLevels = Math.max(0, G.pendingLevels - 1);
    renderWeapons();
    closeModal();
  }

  // ---------- nemici ----------
  function zoneForWave(w) {
    const Z = ctx.E.ZONES;
    const z = w <= 3 ? ['prato'] : w <= 6 ? ['prato', 'fiume'] : w <= 10 ? ['fiume', 'bosco'] : w <= 14 ? ['bosco', 'grotta'] : ['bosco', 'grotta', 'fiume'];
    return z.map((k) => Z[k] || []).reduce((a, b) => a.concat(b), []);
  }
  function makeEnemy(species, level, opts) {
    const E = ctx.E, sp = E.SPECIES[species];
    if (!sp) return null;
    opts = opts || {};
    const st = E.statsFor(species, level);
    const wave = G.wave;
    const hpMul = (0.55 + wave * 0.045) * (opts.hpMul || 1);
    // nasce fuori dallo schermo, verso chi gioca
    let a = Math.random() * Math.PI * 2, d = opts.dist || rnd(14.5, 17);
    let x = G.x + Math.cos(a) * d, z = G.z + Math.sin(a) * d;
    const rr = Math.hypot(x, z);
    if (rr > ARENA_R) { x *= ARENA_R / rr; z *= ARENA_R / rr; }
    if (Math.hypot(x - G.x, z - G.z) < 6) { x = -x * 0.9; z = -z * 0.9; }
    const scale = (opts.scale || 1) * (0.9 + sp.stage * 0.08);
    return {
      uid: G.nextUid++, sp: species, type: sp.type, lvl: level, x, z, kx: 0, kz: 0,
      hp: Math.round(st.maxhp * hpMul), maxhp: Math.round(st.maxhp * hpMul), atk: st.atk * (opts.atkMul || 1), def: st.def,
      speed: (1.7 + st.spd / 85 + wave * 0.025) * (opts.spdMul || 1), r: 0.42 * scale, scale,
      boss: opts.boss || 0, title: opts.title || '', flash: 0, phase: Math.random() * 10, yaw: 0, leafCd: 0, slowT: 0, dot: 0, ghost: sp.type === 'ombra',
      shiny: Math.random() < 1 / 300, dead: false, deadT: 0, born: G.time,
    };
  }
  function spawnNormal(n) {
    const pool = zoneForWave(G.wave);
    if (!pool.length) return;
    for (let i = 0; i < n && aliveNormal() < MAX_ENEMIES; i++) {
      const [sp, lo] = pick(pool);
      const lvl = Math.max(lo, 2 + Math.floor(G.wave * 1.15) + Math.floor(Math.random() * 3));
      const e = makeEnemy(sp, Math.min(50, lvl));
      if (e) G.enemies.push(e);
    }
  }
  const aliveNormal = () => { let n = 0; for (const e of G.enemies) if (!e.dead && !e.boss) n++; return n; };
  function evolved(sp, lvl) { const S = ctx.E.SPECIES; let s = sp; while (S[s].evo && lvl >= S[s].evo.level) s = S[s].evo.to; return s; }
  function spawnMiniBoss() {
    const pool = zoneForWave(G.wave);
    const [sp] = pick(pool);
    const lvl = Math.min(50, 5 + Math.floor(G.wave * 1.25));
    const s2 = evolved(sp, Math.max(lvl, 24));
    const e = makeEnemy(s2, lvl, { boss: 1, scale: 2.0, hpMul: 13, atkMul: 1.5, spdMul: 0.82, dist: 13, title: '💢 ' + ctx.E.SPECIES[s2].name + ' gigante' });
    if (!e) return;
    G.enemies.push(e); G.boss = e;
    banner('Mini-boss!', ctx.E.SPECIES[s2].name + ' gigante');
    sfx('boss');
  }
  function guardians() {
    const T = root.FMLABStory && root.FMLABStory.TRAINERS;
    if (T) {
      const list = ['flora', 'marina', 'corvino', 'petra'].map((id) => T.find((t) => t.id === id)).filter(Boolean)
        .map((t) => ({ id: t.id, name: t.name, title: t.title || t.name, look: t.look, team: Array.isArray(t.team) ? t.team : [] }));
      if (list.length === 4 && list.every((g) => g.team.length)) return list;
    }
    return GUARD_FALLBACK;
  }
  function spawnGuardian() {
    const gs = guardians(), g = gs[G.guardianIdx % gs.length];
    G.guardianIdx++;
    const extra = Math.floor(G.wave / 10) - 1;           // al secondo giro sono più forti
    const team = g.team;
    let bossE = null;
    team.forEach(([sp, lv], i) => {
      const lvl = Math.min(50, Math.max(lv, 4 + Math.floor(G.wave * 1.15)) + extra * 3);
      const last = i === team.length - 1;
      const e = makeEnemy(sp, lvl, last ? { boss: 2, scale: 2.4, hpMul: 26, atkMul: 1.7, spdMul: 0.78, dist: 12, title: '👑 ' + g.name + ' · ' + ctx.E.SPECIES[sp].name } : { boss: 1, scale: 1.6, hpMul: 6, atkMul: 1.3, dist: 13 });
      if (e) { G.enemies.push(e); if (last) bossE = e; }
    });
    if (bossE) {
      G.boss = bossE;
      // il Guardiano guarda la lotta dal bordo dell'arena
      const a = Math.atan2(bossE.z - G.z, bossE.x - G.x);
      let tx = bossE.x + Math.cos(a) * 3, tz = bossE.z + Math.sin(a) * 3; const r = Math.hypot(tx, tz);
      if (r > ARENA_R) { tx *= ARENA_R / r; tz *= ARENA_R / r; }
      G.trainers = [{ look: g.look, x: tx, z: tz, boss: bossE }];
    }
    banner(g.title + ' entra nell\'arena!', 'Ondata ' + G.wave + ' · Guardiano', 2400);
    sfx('boss');
  }

  // ---------- attacchi ----------
  function nearestEnemy(x, z, maxD, skip) {
    let best = null, bd = maxD * maxD;
    for (const e of G.enemies) {
      if (e.dead || (skip && skip.has(e))) continue;
      const d = (e.x - x) * (e.x - x) + (e.z - z) * (e.z - z);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  function weaponDmg(w, e) {
    const E = ctx.E, W = WEAPONS[w.type];
    const atkType = w.type === 'normale' ? null : w.type;
    const eff = atkType ? E.effectiveness(atkType, e.type) : 1;
    const stab = w.type === G.type ? 1.2 : 1;
    const base = W.power * (1 + 0.28 * (w.lvl - 1)) * dmgMul() * stab;
    const ratio = (G.atk * 2) / (G.atk + e.def);
    return { dmg: Math.max(1, Math.round(base * ratio * eff * 0.45 * rnd(0.9, 1.1))), eff };
  }
  function hitEnemy(e, w, opts) {
    if (e.dead) return;
    const r = weaponDmg(w, e);
    let dmg = r.dmg * ((opts && opts.mul) || 1);
    if (debug.oneShot) dmg = e.hp;
    dmg = Math.round(dmg);
    e.hp -= dmg; e.flash = 0.16;
    const kb = (opts && opts.kb != null ? opts.kb : 0.35) / (e.boss ? 4 : 1);
    const dx = e.x - G.x, dz = e.z - G.z, l = Math.hypot(dx, dz) || 1;
    e.kx += (dx / l) * kb * 8; e.kz += (dz / l) * kb * 8;
    if (!G.inUlt) addNum(e.x, 0.9 * e.scale + 0.4, e.z, String(dmg), r.eff > 1 ? 'big' : r.eff < 1 ? 'weak' : '');
    if (e.hp <= 0) killEnemy(e);
  }
  function killEnemy(e) {
    if (e.dead) return;
    e.dead = true; e.deadT = 0;
    G.kills++;
    const waveF = 1 + G.wave * 0.1;
    G.score += Math.round((e.boss === 2 ? 600 : e.boss === 1 ? 150 : 10) * waveF);
    if (!G.inUlt) G.ult = Math.min(1, G.ult + (e.boss === 2 ? 0.35 : e.boss ? 0.15 : 0.014));   // l'Ultimate non si ricarica da sola
    G.xpRaw += ctx.E.xpReward({ species: e.sp, level: e.lvl }) * (e.boss === 2 ? 3 : e.boss ? 1.5 : 1);
    const col = hexRgb(ctx.E.TYPES[e.type].color);
    burst(e.x, 0.5 * e.scale, e.z, col, e.boss ? 40 : 10, e.boss ? 6 : 3.2);
    const v = e.boss === 2 ? 30 : e.boss ? 12 : 1 + Math.floor(e.lvl / 6);
    if (G.gems.length > 260) {           // troppe gemme: si sommano alla più vicina
      let best = G.gems[0], bd = 1e9;
      for (const g of G.gems) { const d = Math.abs(g.x - e.x) + Math.abs(g.z - e.z); if (d < bd) { bd = d; best = g; } }
      best.v += v;
    } else G.gems.push({ x: e.x + rnd(-0.2, 0.2), z: e.z + rnd(-0.2, 0.2), v, pull: false, t: Math.random() * 6 });
    if (e.boss) {
      for (let i = 0; i < (e.boss === 2 ? 10 : 4); i++) G.gems.push({ x: e.x + rnd(-1.5, 1.5), z: e.z + rnd(-1.5, 1.5), v: Math.ceil(v / 4), pull: false, t: Math.random() * 6 });
      G.shake = Math.max(G.shake, e.boss === 2 ? 0.7 : 0.35);
      if (G.boss === e) G.boss = null;
      if (e.boss === 2) { banner('Guardiano sconfitto!', '+' + Math.round(600 * waveF) + ' punti', 2000); G.trainers = []; G.hp = Math.min(G.maxhp, G.hp + G.maxhp * 0.35); }
      sfx('boss-down');
    } else sfx('kill');
  }
  function fireWeapons(dt) {
    const area = areaMul();
    for (const w of G.weapons) {
      const W = WEAPONS[w.type];
      if (w.type === 'erba') continue;            // le foglie girano sempre
      w.t -= dt;
      if (w.t > 0) continue;
      w.t = W.cd * cdMul();
      const tgt = nearestEnemy(G.x, G.z, 13);
      switch (w.type) {
        case 'fuoco': {
          if (!tgt) { w.t = 0.2; break; }
          const n = 1 + Math.floor((w.lvl - 1) / 2);
          for (let i = 0; i < n; i++) {
            const a = Math.atan2(tgt.z - G.z, tgt.x - G.x) + (i - (n - 1) / 2) * 0.22;
            G.shots.push({ kind: 'fire', w, x: G.x, y: 0.7, z: G.z, vx: Math.cos(a) * 13, vz: Math.sin(a) * 13, life: 1.3, r: 0.45 * area, pierce: w.lvl >= 4 ? 1 : 0, hits: [] });
          }
          sfx('fire'); break;
        }
        case 'acqua': {
          const base = tgt ? Math.atan2(tgt.z - G.z, tgt.x - G.x) : Math.atan2(Math.cos(G.yaw), Math.sin(G.yaw));
          const n = 5 + w.lvl, spread = 0.95 * area;
          for (let i = 0; i < n; i++) {
            const a = base + (i / (n - 1) - 0.5) * spread, s = rnd(10, 12.5);
            G.shots.push({ kind: 'water', w, x: G.x, y: 0.55, z: G.z, vx: Math.cos(a) * s, vz: Math.sin(a) * s, life: 0.5 * Math.sqrt(area), r: 0.38, pierce: 1, hits: [] });
          }
          sfx('water'); break;
        }
        case 'elettro': {
          if (!tgt) { w.t = 0.2; break; }
          const pts = [[G.x, 0.8, G.z]], seen = new Set();
          let cur = tgt, jumps = 2 + w.lvl;
          while (cur && jumps-- > 0) {
            seen.add(cur); pts.push([cur.x, 0.6 * cur.scale, cur.z]);
            hitEnemy(cur, w, { kb: 0.1 });
            cur = nearestEnemy(cur.x, cur.z, 4.5 * area, seen);
          }
          G.chains.push({ pts, life: 0.22 });
          sfx('zap'); break;
        }
        case 'roccia': {
          const n = 1 + Math.floor(w.lvl / 2);
          for (let i = 0; i < n; i++) {
            // dove ci sono più nemici vicini a te
            let best = null, bc = -1;
            for (let k = 0; k < 6; k++) {
              const e = G.enemies[Math.floor(Math.random() * G.enemies.length)];
              if (!e || e.dead || Math.hypot(e.x - G.x, e.z - G.z) > 10) continue;
              let c = 0; for (const o of G.enemies) if (!o.dead && Math.abs(o.x - e.x) + Math.abs(o.z - e.z) < 2.5) c++;
              if (c > bc) { bc = c; best = e; }
            }
            const x = best ? best.x : G.x + rnd(-5, 5), z = best ? best.z : G.z + rnd(-5, 5);
            G.rocks.push({ w, x, z, t: 0.6, r: 1.7 * area, spin: Math.random() * 6 });
          }
          break;
        }
        case 'ombra': {
          const n = 1 + Math.floor(w.lvl / 2);
          for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2;
            G.shots.push({ kind: 'orb', w, x: G.x + Math.cos(a) * 0.8, y: 0.9, z: G.z + Math.sin(a) * 0.8, vx: Math.cos(a) * 3, vz: Math.sin(a) * 3, life: 3.2, r: 0.5 * area, pierce: 0, hits: [], target: null });
          }
          sfx('orb'); break;
        }
        case 'normale': {
          G.rings.push({ w, x: G.x, z: G.z, r: 0.4, max: 3.3 * area * (1 + 0.1 * w.lvl), life: 0.5, hit: new Set(), col: [1, 0.95, 0.8] });
          sfx('wave'); break;
        }
        default: break;
      }
    }
  }
  function updateLeaves(dt) {
    const w = G.weapons.find((x) => x.type === 'erba');
    G.leaves = null;
    if (!w) return;
    const n = 2 + Math.floor(w.lvl / 2) + (w.lvl >= 6 ? 1 : 0), rad = (2.0 + 0.15 * w.lvl) * areaMul();
    G.leafA += dt * (3.0 + 0.15 * w.lvl);
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = G.leafA + (i / n) * Math.PI * 2;
      pts.push([G.x + Math.cos(a) * rad, 0.65, G.z + Math.sin(a) * rad, a]);
    }
    G.leaves = pts;
    for (const e of G.enemies) {
      if (e.dead) continue;
      e.leafCd -= dt;
      if (e.leafCd > 0) continue;
      for (const p of pts) {
        if (Math.abs(p[0] - e.x) + Math.abs(p[2] - e.z) < 0.75 + e.r) { hitEnemy(e, w, { kb: 0.25 }); e.leafCd = 0.42; break; }
      }
    }
  }
  function updateShots(dt) {
    for (let i = G.shots.length - 1; i >= 0; i--) {
      const s = G.shots[i];
      s.life -= dt;
      if (s.kind === 'orb') {
        if (!s.target || s.target.dead) s.target = nearestEnemy(s.x, s.z, 12);
        if (s.target) {
          const dx = s.target.x - s.x, dz = s.target.z - s.z, l = Math.hypot(dx, dz) || 1;
          s.vx += (dx / l * 9 - s.vx) * Math.min(1, dt * 3.5); s.vz += (dz / l * 9 - s.vz) * Math.min(1, dt * 3.5);
        }
      }
      s.x += s.vx * dt; s.z += s.vz * dt;
      let gone = s.life <= 0 || Math.hypot(s.x, s.z) > ARENA_R + 2;
      if (!gone) {
        for (const e of G.enemies) {
          if (e.dead || s.hits.indexOf(e.uid) >= 0) continue;
          const rr = s.r + e.r;
          if ((e.x - s.x) * (e.x - s.x) + (e.z - s.z) * (e.z - s.z) < rr * rr) {
            hitEnemy(e, s.w, { kb: s.kind === 'water' ? 0.45 : 0.3 });
            s.hits.push(e.uid);
            if (s.kind === 'fire') burst(s.x, s.y, s.z, [1, 0.55, 0.15], 6, 2.4);
            if (s.pierce-- <= 0) { gone = true; break; }
          }
        }
      }
      if (gone) G.shots.splice(i, 1);
    }
    for (let i = G.rocks.length - 1; i >= 0; i--) {
      const k = G.rocks[i];
      k.t -= dt;
      if (k.t <= 0) {
        for (const e of G.enemies) if (!e.dead && Math.hypot(e.x - k.x, e.z - k.z) < k.r + e.r) hitEnemy(e, k.w, { kb: 0.5 });
        burst(k.x, 0.2, k.z, [0.62, 0.5, 0.36], 14, 4);
        G.shake = Math.max(G.shake, 0.12);
        G.rocks.splice(i, 1);
        sfx('rock');
      }
    }
    for (let i = G.rings.length - 1; i >= 0; i--) {
      const g = G.rings[i];
      g.life -= dt;
      g.r += (g.max - g.r) * Math.min(1, dt * 9);
      for (const e of G.enemies) if (!e.dead && !g.hit.has(e) && Math.hypot(e.x - g.x, e.z - g.z) < g.r + e.r) { g.hit.add(e); if (g.w) hitEnemy(e, g.w, { kb: g.ult ? 1.2 : 0.8, mul: g.mul || 1 }); }
      if (g.life <= 0) G.rings.splice(i, 1);
    }
    for (let i = G.chains.length - 1; i >= 0; i--) { G.chains[i].life -= dt; if (G.chains[i].life <= 0) G.chains.splice(i, 1); }
  }

  // ---------- Ultimate ----------
  function fireUlt() {
    if (!G || G.paused || G.over || G.ult < 1) return;
    G.ult = 0;
    const col = ctx.E.TYPES[G.type] ? ctx.E.TYPES[G.type].color : '#ffffff';
    screenFlash(col + 'cc');
    banner(ULTS[G.type] + '!', null, 1300);
    G.shake = 0.9;
    G.ultFx = { t: 0, col: hexRgb(col) };
    const w = { type: G.type, lvl: 6 };
    G.inUlt = true;
    for (const e of G.enemies) {
      if (e.dead || Math.hypot(e.x - G.x, e.z - G.z) > 17) continue;
      if (e.boss) {
        const cap = e.maxhp * (e.boss === 2 ? 0.3 : 0.6);
        const r = weaponDmg(w, e);
        const dmg = Math.round(Math.min(cap, r.dmg * 14));
        e.hp -= dmg; e.flash = 0.3; addNum(e.x, 1.2 * e.scale, e.z, String(dmg), 'big');
        if (e.hp <= 0) killEnemy(e);
      } else hitEnemy(e, w, { mul: 30, kb: 1.4 });
    }
    G.inUlt = false;
    G.rings.push({ w: null, x: G.x, z: G.z, r: 0.5, max: 17, life: 0.9, hit: new Set(), col: hexRgb(col), ult: true });
    for (let i = 0; i < 70; i++) burst(G.x + rnd(-8, 8), rnd(0.3, 3), G.z + rnd(-8, 8), hexRgb(col), 1, 5);
    sfx('ult');
  }

  // ---------- simulazione ----------
  function update(dt) {
    if (!G || G.paused || G.over) return;
    G.time += dt;
    G.waveT += dt;
    const waveLen = debug.fastWaves ? 4 : WAVE_LEN;
    if (G.waveT >= waveLen) {
      G.waveT = 0; G.wave++;
      G.score += 100 * G.wave;
      if (G.wave % 10 === 0) spawnGuardian();
      else if (G.wave % 5 === 0) spawnMiniBoss();
      else banner('Ondata ' + G.wave, G.wave % 5 === 4 ? 'Sta arrivando qualcosa di grosso…' : null, 1300);
      sfx('wave-up');
    }
    // comparsa dei nemici
    const target = Math.min(MAX_ENEMIES, 7 + G.wave * 5);
    G.spawnT -= dt;
    if (G.spawnT <= 0) {
      G.spawnT = Math.max(0.14, 0.85 - G.wave * 0.045);
      const alive = aliveNormal();
      if (alive < target) spawnNormal(Math.min(target - alive, 1 + Math.floor(G.wave / 4)));
    }
    // giocatore
    const [ix, iy] = inputVec();
    G.moving = Math.abs(ix) + Math.abs(iy) > 0.05;
    G.x += ix * G.speed * dt; G.z += iy * G.speed * dt;
    const pr = Math.hypot(G.x, G.z);
    if (pr > ARENA_R) { G.x *= ARENA_R / pr; G.z *= ARENA_R / pr; }
    if (G.moving) { G.yaw = Math.atan2(ix, iy); G.walk += dt * 11; }
    else { const t = nearestEnemy(G.x, G.z, 6); if (t) G.yaw = Math.atan2(t.x - G.x, t.z - G.z); }
    G.iframe -= dt; G.shieldT -= dt; G.hurtT -= dt;
    if (pv('regen')) G.hp = Math.min(G.maxhp, G.hp + G.maxhp * 0.004 * pv('regen') * dt);
    // nemici: inseguono, si spingono tra loro, toccano
    const es = G.enemies;
    for (let i = 0; i < es.length; i++) {
      const e = es[i];
      if (e.dead) { e.deadT += dt; continue; }
      const dx = G.x - e.x, dz = G.z - e.z, d = Math.hypot(dx, dz) || 1;
      const sp = e.speed * (e.slowT > 0 ? 0.5 : 1);
      e.x += (dx / d) * sp * dt + e.kx * dt; e.z += (dz / d) * sp * dt + e.kz * dt;
      e.kx *= Math.pow(0.02, dt); e.kz *= Math.pow(0.02, dt);
      e.yaw = Math.atan2(dx, dz);
      e.flash = Math.max(0, e.flash - dt);
      const er = Math.hypot(e.x, e.z); if (er > ARENA_R + 1) { e.x *= (ARENA_R + 1) / er; e.z *= (ARENA_R + 1) / er; }
      if (d < e.r + PLAYER_R) {
        if (G.iframe <= 0 && !debug.god) {
          if (pv('shield') && G.shieldT <= 0) { G.shieldT = 9 - 2 * pv('shield'); G.iframe = 0.5; burst(G.x, 0.7, G.z, [0.5, 0.8, 1], 12, 3); sfx('shield'); }
          else {
            const dmg = Math.max(1, Math.round(e.atk * 0.55 * 30 / (30 + G.def) * (e.boss ? 1.4 : 1)));
            G.hp -= dmg; G.iframe = 0.55; G.hurtT = 0.35; G.shake = Math.max(G.shake, 0.14);
            addNum(G.x, 1.3, G.z, '-' + dmg, 'weak');
            sfx('hurt');
            if (navigator.vibrate) try { navigator.vibrate(18); } catch (err) { /* niente vibrazione */ }
          }
        }
        e.kx -= (dx / d) * 2.2; e.kz -= (dz / d) * 2.2;
      }
    }
    // si separano: niente mucchi
    for (let i = 0; i < es.length; i++) {
      const a = es[i]; if (a.dead) continue;
      for (let j = i + 1; j < es.length; j++) {
        const b = es[j]; if (b.dead) continue;
        const dx = b.x - a.x, dz = b.z - a.z, rr = a.r + b.r;
        if (Math.abs(dx) > rr || Math.abs(dz) > rr) continue;
        const d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr || d2 < 1e-6) continue;
        const d = Math.sqrt(d2), push = (rr - d) * 0.5, nx = dx / d, nz = dz / d;
        const wa = b.boss ? 0.9 : a.boss ? 0.1 : 0.5;
        a.x -= nx * push * wa * 2; a.z -= nz * push * wa * 2; b.x += nx * push * (1 - wa) * 2; b.z += nz * push * (1 - wa) * 2;
      }
    }
    for (let i = es.length - 1; i >= 0; i--) if (es[i].dead && es[i].deadT > 0.45) es.splice(i, 1);
    fireWeapons(dt);
    updateLeaves(dt);
    updateShots(dt);
    // gemme
    const mr = magnetR();
    for (let i = G.gems.length - 1; i >= 0; i--) {
      const g = G.gems[i];
      g.t += dt;
      const dx = G.x - g.x, dz = G.z - g.z, d = Math.hypot(dx, dz);
      if (d < mr || g.pull) { g.pull = true; const s = Math.min(d, (8 + (mr - Math.min(d, mr)) * 4) * dt); g.x += dx / (d || 1) * s; g.z += dz / (d || 1) * s; }
      if (d < 0.5) { G.xp += g.v; G.gems.splice(i, 1); if (Math.random() < 0.35) sfx('gem'); }
    }
    while (G.xp >= G.next) {
      G.xp -= G.next; G.level++; G.next = xpNeed(G.level); G.pendingLevels++;
      levelUpCreature();
    }
    if (G.pendingLevels > 0 && !G.modal) openLevel();
    // particelle
    for (let i = G.fx.length - 1; i >= 0; i--) {
      const f = G.fx[i];
      f.life -= dt;
      if (f.life <= 0) { G.fx[i] = G.fx[G.fx.length - 1]; G.fx.pop(); continue; }
      f.vy -= f.g * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
      if (f.y < 0.02) { f.y = 0.02; f.vy *= -0.3; f.vx *= 0.7; f.vz *= 0.7; }
    }
    if (G.ultFx) { G.ultFx.t += dt; if (G.ultFx.t > 1.4) G.ultFx = null; }
    G.shake = Math.max(0, G.shake - dt * 1.4);
    if (G.evoT > 0) G.evoT -= dt;
    if (G.hp <= 0) { G.hp = 0; gameOver(false); }
  }
  function levelUpCreature() {
    const E = ctx.E;
    G.effLevel = Math.min(50, G.baseLevel + G.level - 1);
    const sp = E.SPECIES[G.species];
    if (sp.evo && G.effLevel >= sp.evo.level) {
      const from = sp.name;
      G.species = sp.evo.to;
      G.evoT = 1.2;
      const col = E.TYPES[G.type].color;
      screenFlash('rgba(255,255,255,.9)');
      banner(from + ' si evolve!', 'Ora è ' + E.SPECIES[G.species].name, 2200);
      burst(G.x, 0.8, G.z, hexRgb(col), 40, 5);
      G.ult = Math.min(1, G.ult + 0.3);
      sfx('evolve');
    }
    recalc(false);
    G.hp = Math.min(G.maxhp, G.hp + G.maxhp * 0.12);
  }
  function burst(x, y, z, col, n, spd) {
    for (let i = 0; i < n; i++) {
      if (G.fx.length > 420) G.fx.shift();
      const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, s = spd * rnd(0.35, 1);
      const k = Math.sqrt(1 - u * u);
      G.fx.push({ x, y, z, vx: Math.cos(a) * k * s, vy: (u * 0.6 + 0.7) * s, vz: Math.sin(a) * k * s, life: rnd(0.35, 0.8), max: 0.8, col, size: rnd(0.05, 0.12), g: 7 });
    }
  }

  // ---------- fine partita ----------
  function gameOver(quit) {
    if (G.over) return;
    G.over = true; G.paused = true;
    sfx('gameover');
    const E = ctx.E, mon = G.mon;
    // esperienza vera per la creatura: moderata (al massimo 2 livelli per sessione) e niente per partite lampo
    const cap = Math.max(0, E.xpForLevel(Math.min(50, mon.level + 2)) - mon.xp - session.xp);
    const xp = G.kills < 10 ? 0 : Math.min(cap, Math.round(G.xpRaw * 0.15));
    const caps = Math.min(5, Math.floor((G.wave - 1) / 4));
    session.xp += xp; session.capsules = Math.min(10, session.capsules + caps); session.runs++;
    const newBest = G.score > Math.max(session.best, ctx.save.hordeBest || 0);
    if (G.score > session.best) { session.best = G.score; session.bestWave = G.wave; }
    const sp = E.SPECIES[G.species];
    openModal('over', `<h2>${quit ? 'Partita terminata' : 'Sei stato sopraffatto!'}</h2>
      <div class="hz-mut">${ctx.esc(sp.name)} · Lv ${G.effLevel}${newBest ? ' · <b style="color:#fbbf24">Nuovo record!</b>' : ''}</div>
      <div class="hz-stats"><div><span class="hz-mut">Punteggio</span><b>${G.score}</b></div><div><span class="hz-mut">Ondata</span><b>${G.wave}</b></div>
        <div><span class="hz-mut">Sconfitti</span><b>${G.kills}</b></div><div><span class="hz-mut">Tempo</span><b>${fmtTime(G.time)}</b></div>
        <div><span class="hz-mut">Esperienza per ${ctx.esc(mon.name)}</span><b>+${xp}</b></div><div><span class="hz-mut">Capsule</span><b>+${caps}</b></div></div>
      <div id="hzLb" class="hz-mut">Invio il punteggio…</div>
      <button class="hz-btn go" id="hzAgain">Riprova</button><button class="hz-btn sec" id="hzMap">Torna alla mappa</button>`);
    document.getElementById('hzAgain').onclick = () => { const uid = G.mon.uid; showPick(uid); };
    document.getElementById('hzMap').onclick = exitToMap;
    G.result = { score: G.score, wave: G.wave, xp, caps };
    sendScore();
  }
  async function sendScore() {
    const el = () => document.getElementById('hzLb');
    const s = ctx.save, res = G.result, sp = G.species;
    if (!res || res.score <= 0 || !s.pid) { if (el()) showTop(el()); return; }
    const r = await ctx.api({ action: 'hordeScore', pid: s.pid, name: s.name, score: res.score, wave: res.wave, species: sp });
    const mine = r && r.ok ? `<div class="hz-mut" style="margin-top:6px">${r.best ? 'Record salvato in classifica' + (r.rank ? ': sei ' + r.rank + '°!' : '.') : 'Punteggio inviato (il tuo record resta quello di prima).'}</div>` : `<div class="hz-mut" style="margin-top:6px">${ctx.esc((r && r.error) || 'Classifica non raggiungibile.')}</div>`;
    if (el()) showTop(el(), mine);
    if (G) G.sent = !!(r && r.ok);
  }

  // ---------- disegno 3D ----------
  function arenaMesh(K) {
    return K.mesh('orda:arena', () => {
      const { Builder, mat, hex, shade, mix, ico, cone, cyl } = K;
      const b = new Builder(4242), r = b.rng;
      const H = (x, z) => {
        const d = Math.hypot(x, z);
        const base = (noise2(x * 0.15, z * 0.15) - 0.5) * 0.18;
        if (d < ARENA_R + 1) return base;
        return base + Math.pow(d - ARENA_R - 1, 1.3) * 0.5 * (0.6 + noise2(x * 0.08, z * 0.08) * 0.9);
      };
      // terreno: caselle fitte nell'arena (colori che sfumano), più larghe sulle colline
      const grassA = hex('#6cbf55'), grassB = hex('#4f9e44'), dirt = hex('#c9b07a'), stone = hex('#cfc6b4');
      const colAt = (x, z, h) => {
        const dist = Math.hypot(x, z);
        if (dist < ARENA_R + 1) {
          const n = noise2(x * 0.22, z * 0.22), m = noise2(x * 0.09 + 40, z * 0.09 - 17);
          let c = mix(grassA, grassB, n * 0.9);
          const dk = Math.max(0, Math.min(1, (m - 0.62) / 0.12));        // sentieri di terra morbidi
          c = mix(c, dirt, dk * 0.85);
          if (dist < 3.4) c = mix(c, stone, Math.max(0, Math.min(1, (3.4 - dist) / 0.6)));
          return c;
        }
        return h > 4.5 + noise2(x, z) * 2 ? hex('#eef3f8') : h > 1.6 ? mix(hex('#4f9a45'), hex('#7d7468'), Math.min(1, (h - 1.6) / 1.2)) : hex('#4f9a45');
      };
      const ext = 46.5;
      for (let x0 = -ext; x0 < ext; x0 += 1.5) for (let z0 = -ext; z0 < ext; z0 += 1.5) {
        const st = 1.5;
        const P = (x, z) => [x, H(x, z), z];
        const a = P(x0, z0), bb = P(x0 + st, z0), c = P(x0 + st, z0 + st), d = P(x0, z0 + st);
        const h = (a[1] + bb[1] + c[1] + d[1]) / 4;
        b.tri(a, bb, c, colAt(x0 + st * 0.66, z0 + st * 0.33, h), { jit: 0.035 });
        b.tri(a, c, d, colAt(x0 + st * 0.33, z0 + st * 0.66, h), { jit: 0.035 });
      }
      // anello di pietre al bordo
      for (let i = 0; i < 64; i++) {
        const a = (i / 64) * Math.PI * 2, rr = ARENA_R + 0.8 + r() * 0.6;
        b.add(ico(1), mat([Math.cos(a) * rr, 0.15, Math.sin(a) * rr], [r() * 6, 0, 0], [0.45 + r() * 0.35, 0.35 + r() * 0.3, 0.45 + r() * 0.3]), hex(r() < 0.5 ? '#8a8178' : '#6f675f'), { noise: 0.2, seed: i, jit: 0.1 });
      }
      // foresta intorno
      for (let i = 0; i < 90; i++) {
        const a = r() * Math.PI * 2, rr = ARENA_R + 2.5 + r() * 11, x = Math.cos(a) * rr, z = Math.sin(a) * rr, y = H(x, z) - 0.05, s = 1.1 + r() * 0.9;
        b.add(cyl(5), mat([x, y, z], null, [0.14 * s, 0.7 * s, 0.14 * s]), hex('#6b4423'));
        if (r() < 0.5) {
          for (let k = 0; k < 3; k++) b.add(cone(7), mat([x, y + (0.4 + k * 0.45) * s, z], [r() * 6, 0, 0], [(0.75 - k * 0.17) * s, 0.85 * s, (0.75 - k * 0.17) * s]), hex(['#1f5c33', '#24693a', '#2a7a43'][k]), { anim: 0.03 });
        } else {
          b.add(ico(1), mat([x, y + 1.15 * s, z], [r() * 6, 0, 0], [0.75 * s, 0.65 * s, 0.75 * s]), hex('#2f7d3a'), { anim: 0.025 });
          b.add(ico(1), mat([x + 0.2 * s, y + 1.5 * s, z - 0.1 * s], [r() * 6, 0, 0], [0.45 * s, 0.4 * s, 0.45 * s]), hex('#3d9a48'), { anim: 0.025 });
        }
      }
      // ciuffi d'erba, fiori e sassi nell'arena (solo decorazione)
      for (let i = 0; i < 150; i++) {
        const a = r() * Math.PI * 2, rr = 3.5 + Math.sqrt(r()) * (ARENA_R - 4), x = Math.cos(a) * rr, z = Math.sin(a) * rr, y = H(x, z);
        for (let k = 0; k < 3; k++) b.add(cone(3), mat([x + rnd(-0.2, 0.2), y, z + rnd(-0.2, 0.2)], [r() * 6, (r() - 0.5) * 0.4, 0], [0.05, 0.28 + r() * 0.2, 0.05]), hex(['#3f9a3e', '#4fb04a', '#5fbf55'][k]), { anim: 0.06 });
      }
      for (let i = 0; i < 40; i++) {
        const a = r() * Math.PI * 2, rr = 4 + r() * (ARENA_R - 5), x = Math.cos(a) * rr, z = Math.sin(a) * rr, y = H(x, z);
        b.add(ico(0), mat([x, y + 0.08, z], null, 0.07), hex(['#ffffff', '#ffd23f', '#ff8fb3', '#a78bfa'][i % 4]), { emis: 0.25 });
      }
      for (let i = 0; i < 18; i++) {
        const a = r() * Math.PI * 2, rr = 6 + r() * (ARENA_R - 8), x = Math.cos(a) * rr, z = Math.sin(a) * rr;
        b.add(ico(1), mat([x, 0.1, z], [r() * 6, 0, 0], [0.3 + r() * 0.3, 0.2 + r() * 0.2, 0.3 + r() * 0.2]), hex('#8a8178'), { noise: 0.2, seed: 100 + i });
      }
      // altare al centro con i cristalli dei tipi
      b.add(cyl(18), mat([0, -0.05, 0], null, [2.0, 0.3, 2.0]), hex('#b9b2a5'), { jit: 0.04 });
      b.add(cyl(18), mat([0, 0.2, 0], null, [1.3, 0.18, 1.3]), hex('#d6d0c4'), { jit: 0.04 });
      ['#ff6b35', '#3b9dff', '#4cc96b', '#2fd6ff', '#b08d57', '#8b5cf6'].forEach((c, i) => {
        const a = (i / 6) * Math.PI * 2;
        b.add(cone(4), mat([Math.cos(a) * 1.7, 0.2, Math.sin(a) * 1.7], [a, 0, 0], [0.16, 0.7, 0.16]), hex(c), { emis: 0.7 });
      });
      return b;
    });
  }
  function fxMeshes(K) {
    const { Builder, mat, hex, ico, cone, box, disc } = K, W = [1, 1, 1];
    return {
      dot: K.particleMesh(),
      disc: K.mesh('orda:disc', () => new Builder(1).add(disc(28), mat(null, null, 1), W, { emis: 1, jit: 0 })),
      ring: K.mesh('orda:ring', () => { const b = new Builder(1); for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; b.add(box(), mat([Math.cos(a), 0, Math.sin(a)], [-a, 0, 0], [0.09, 0.08, 0.16]), W, { emis: 1, jit: 0 }); } return b; }),
      seg: K.mesh('orda:seg', () => new Builder(1).add(box(), mat([0, 0, 0.5], null, [1, 1, 1]), W, { emis: 1, jit: 0 })),
      gem: K.mesh('orda:gem', () => { const b = new Builder(1); b.add(cone(4), mat(null, null, [1, 1.4, 1]), W, { emis: 0.85, jit: 0.12 }); b.add(cone(4), mat(null, [0, Math.PI, 0], [1, 0.9, 1]), W, { emis: 0.85, jit: 0.12 }); return b; }),
      rock: K.mesh('orda:rock', () => new Builder(7).add(ico(1), mat(null, null, 1), hex('#8f7a5a'), { noise: 0.25, jit: 0.12, seed: 3 })),
      leaf: K.mesh('orda:leaf', () => { const b = new Builder(1); b.add(ico(1), mat(null, null, [0.32, 0.05, 0.16]), hex('#7ee08f'), { emis: 0.35 }); return b; }),
    };
  }
  function blobMesh(K, id, shiny) {
    return K.mesh('orda:blob:' + id + (shiny ? '*' : ''), () => {
      const L = K.speciesLook(id, shiny), b = new K.Builder(9);
      b.add(K.ico(1), K.mat([0, L.by, 0], null, [L.rx, L.ry, L.rz]), L.c);
      [-1, 1].forEach((s) => {
        b.add(K.ico(0), K.mat([s * 0.17, L.by + 0.12, L.rz * 0.9], null, [0.1, 0.12, 0.06]), [1, 1, 1], { emis: 0.3, jit: 0 });
        b.add(K.ico(0), K.mat([s * 0.16, L.by + 0.11, L.rz * 0.98], null, [0.05, 0.06, 0.03]), [0.08, 0.08, 0.12], { jit: 0 });
      });
      return b;
    });
  }
  let ENV = null;
  const LOOKC = new Map();
  function look(K, id, shiny) { const k = id + (shiny ? '*' : ''); let L = LOOKC.get(k); if (!L) { L = K.speciesLook(id, shiny); LOOKC.set(k, L); } return L; }
  function frame3D(R, t, dt) {
    if (!G || G.ended) return;
    const cpu0 = performance.now();
    // passi fissi: niente salti con fotogrammi lenti
    let left = Math.min(dt, 0.25);
    while (left > 0) { const s = Math.min(left, 1 / 30); update(s); left -= s; }
    const K = ctx.G3.kit;
    if (!ENV) ENV = Object.assign({}, K.arenaEnv('prato'), { fogNear: 30, fogFar: 72 });
    if (!G.skySet) { const sky = K.skyFor(['#4fb0ff', '#dff3ff'], 12); ui.stage.style.background = `linear-gradient(${sky[0]}, ${sky[1]} 65%)`; G.skySet = true; }
    // camera inclinata che segue morbida
    G.camX += (G.x - G.camX) * Math.min(1, dt * 6); G.camZ += (G.z - G.camZ) * Math.min(1, dt * 6);
    const asp = R.canvas.width / R.canvas.height, D = asp < 1 ? 18 : 14;
    let eye = [G.camX, D * 0.78, G.camZ + D * 0.62], tgt = [G.camX, 0, G.camZ - 0.5];
    if (G.shake > 0) { const s = G.shake * 0.6; eye = [eye[0] + rnd(-s, s), eye[1] + rnd(-s, s) * 0.5, eye[2]]; }
    const proj = K.projFor(R, null, (a) => (a < 0.75 ? 1.0 : a < 1.2 ? 0.85 : 0.72)), view = K.lookAt(eye, tgt);
    G.PV = K.mmul(proj, view);
    R.begin(proj, view, eye, ENV, t);
    R.draw(arenaMesh(K), K.mat(), {});
    const F = fxMeshes(K), mat = K.mat;
    // capsula sull'altare
    R.draw(K.capsuleMesh(), mat([0, 1.2 + Math.sin(t * 1.8) * 0.12, 0], [t * 0.8, 0.2, 0], 0.32), {});
    R.draw(F.dot, mat([0, 1.2, 0], null, 0.75 + Math.sin(t * 3) * 0.05), { tint: [1, 0.95, 0.6], alpha: 0.16, blend: true, noDepth: true });
    // avvisi dei massi in arrivo
    for (const k of G.rocks) {
      const p = 1 - k.t / 0.6;
      R.draw(F.disc, mat([k.x, 0.03, k.z], null, [k.r, 1, k.r]), { tint: [1, 0.35, 0.2], alpha: 0.18 + 0.2 * p, blend: true, noDepth: true });
      R.draw(F.rock, mat([k.x, 0.3 + (1 - p) * 7, k.z], [k.spin + t * 4, t * 3, 0], 0.55 * Math.sqrt(areaMul())), {});
    }
    // gemme
    for (const g of G.gems) {
      const col = g.v >= 12 ? [1, 0.82, 0.25] : g.v >= 4 ? [0.35, 1, 0.55] : [0.4, 0.75, 1];
      const s = g.v >= 12 ? 0.2 : g.v >= 4 ? 0.15 : 0.12;
      R.draw(F.gem, mat([g.x, 0.3 + Math.sin(g.t * 3) * 0.06, g.z], [g.t * 2, 0, 0], s), { tint: col });
    }
    // nemici: i più vicini col modello completo, gli altri semplificati
    const es = G.enemies;
    const order = G.order || (G.order = []);
    order.length = 0;
    for (const e of es) { e.dd = (e.x - G.x) * (e.x - G.x) + (e.z - G.z) * (e.z - G.z); order.push(e); }
    order.sort((a, b) => a.dd - b.dd);
    for (let i = 0; i < order.length; i++) {
      const e = order[i];
      const L = look(K, e.sp, e.shiny);
      const dying = e.dead ? Math.min(1, e.deadT / 0.4) : 0;
      const s = L.scale * 1.05 * e.scale * (1 - dying * 0.8) * (e.born > G.time - 0.3 ? Math.max(0.2, (G.time - e.born) / 0.3) : 1);
      const hop = Math.abs(Math.sin(G.time * 9 + e.phase)) * 0.12 * (e.boss ? 0.5 : 1);
      const y = (e.ghost ? 0.25 + Math.sin(G.time * 2 + e.phase) * 0.08 : hop) - dying * 0.3;
      const m = mat([e.x, y, e.z], [e.yaw, 0, 0], s);
      const opts = { flash: e.flash > 0 ? 0.75 : dying * 0.9, alpha: 1 - dying };
      if (i < NEAR_DETAIL || e.boss) {
        K.softShadow(R, e.x, 0.02, e.z, 0.42 * s, 0.38 * s, 0.32 * (1 - dying));
        K.drawMon(R, e.sp, e.shiny, m, opts, { t: G.time, action: e.dead ? 'faint' : e.flash > 0 ? 'hit' : 'walk', phase: e.phase + G.time * 9, where: 'map' });
      } else {
        R.draw(F.disc, mat([e.x, 0.02, e.z], null, [0.42 * s, 1, 0.38 * s]), { tint: [0, 0, 0], alpha: 0.25, blend: true, noDepth: true });
        R.draw(blobMesh(K, e.sp, e.shiny), m, opts);
      }
    }
    // Guardiano a bordo arena
    for (const tr of G.trainers) K.drawTrainer(R, tr.look, [tr.x, 0, tr.z], Math.atan2(G.x - tr.x, G.z - tr.z), 0, false, 1.7);
    // giocatore
    const PL = look(K, G.species, G.shiny), ps = PL.scale * 1.3;
    const blink = G.iframe > 0 && Math.floor(G.time * 20) % 2 === 0;
    K.softShadow(R, G.x, 0.02, G.z, 0.45 * ps, 0.4 * ps, 0.4);
    R.draw(F.disc, mat([G.x, 0.025, G.z], null, [0.85 * ps, 1, 0.85 * ps]), { tint: hexRgb(ctx.E.TYPES[G.type].color), alpha: 0.22 + Math.sin(G.time * 4) * 0.06, blend: true, noDepth: true });
    K.drawMon(R, G.species, G.shiny, mat([G.x, PL.ghost ? 0.28 + Math.sin(G.time * 2) * 0.08 : (G.moving ? Math.abs(Math.sin(G.walk)) * 0.1 : 0), G.z], [G.yaw, 0, 0], ps),
      { flash: G.evoT > 0 ? G.evoT / 1.2 : blink ? 0.6 : 0 }, { t: G.time, action: G.moving ? 'walk' : 'idle', phase: G.walk, where: 'map' });
    if (pv('shield') && G.shieldT <= 0) R.draw(F.dot, mat([G.x, 0.7, G.z], null, 1.05 * ps), { tint: [0.55, 0.85, 1], alpha: 0.16, blend: true, noDepth: true });
    // foglie rotanti
    if (G.leaves) for (const p of G.leaves) R.draw(F.leaf, mat([p[0], p[1] + Math.sin(G.time * 5 + p[3]) * 0.1, p[2]], [-p[3] + G.time * 8, 0.4, 0], 1.5 * Math.sqrt(areaMul())), {});
    // colpi
    for (const s of G.shots) {
      if (s.kind === 'fire') {
        R.draw(F.dot, mat([s.x, s.y, s.z], [t * 9, t * 7, 0], 0.26), { tint: [1, 0.85, 0.3] });
        R.draw(F.dot, mat([s.x, s.y, s.z], null, 0.48), { tint: [1, 0.45, 0.1], alpha: 0.4, blend: true, noDepth: true });
        if (Math.random() < 0.5) G.fx.push({ x: s.x, y: s.y, z: s.z, vx: rnd(-0.5, 0.5), vy: rnd(0.2, 0.8), vz: rnd(-0.5, 0.5), life: 0.3, max: 0.3, col: [1, 0.55, 0.15], size: 0.09, g: 0 });
      } else if (s.kind === 'water') {
        R.draw(F.dot, mat([s.x, s.y, s.z], null, 0.16), { tint: [0.55, 0.8, 1], alpha: 0.85, blend: true });
      } else if (s.kind === 'orb') {
        R.draw(F.dot, mat([s.x, s.y + Math.sin(t * 6 + s.x) * 0.1, s.z], [t * 4, 0, 0], 0.24), { tint: [0.72, 0.45, 1] });
        R.draw(F.dot, mat([s.x, s.y, s.z], null, 0.5), { tint: [0.55, 0.3, 1], alpha: 0.3, blend: true, noDepth: true });
      }
    }
    // fulmini a zig-zag
    for (const c of G.chains) {
      for (let i = 0; i < c.pts.length - 1; i++) {
        const a = c.pts[i], b = c.pts[i + 1];
        let prev = a;
        for (let k = 1; k <= 3; k++) {
          const f = k / 3, j = k < 3 ? 0.35 : 0;
          const p = [a[0] + (b[0] - a[0]) * f + rnd(-j, j), a[1] + (b[1] - a[1]) * f + rnd(-j, j) * 0.5, a[2] + (b[2] - a[2]) * f + rnd(-j, j)];
          drawSeg(R, F.seg, prev, p, 0.07, [0.75, 0.95, 1]);
          prev = p;
        }
      }
    }
    // onde (normali e Ultimate)
    for (const g of G.rings) {
      const p = g.ult ? 1 - g.life / 0.9 : 1 - g.life / 0.5;
      R.draw(F.ring, mat([g.x, 0.25, g.z], [t, 0, 0], [g.r, g.ult ? 3 : 1.6, g.r]), { tint: g.col, alpha: Math.max(0, 0.85 - p * 0.8), blend: true });
      if (g.ult) R.draw(F.disc, mat([g.x, 0.05, g.z], null, [g.r, 1, g.r]), { tint: g.col, alpha: Math.max(0, 0.3 - p * 0.3), blend: true, noDepth: true });
    }
    // particelle
    for (const f of G.fx) R.draw(F.dot, mat([f.x, f.y, f.z], null, f.size * (0.4 + 0.6 * f.life / f.max)), { tint: f.col, alpha: Math.min(1, f.life * 3), blend: true });
    if (R.end) R.end();
    updateNums(dt);
    updateHud();
    // tempo di calcolo del fotogramma (senza il disegno della scheda video), media mobile
    G.cpuMs = (G.cpuMs || 0) * 0.9 + (performance.now() - cpu0) * 0.1;
  }
  function drawSeg(R, m, a, b, w, col) {
    const K = ctx.G3.kit;
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.hypot(dx, dy, dz) || 0.001;
    const yaw = Math.atan2(dx, dz), pitch = -Math.atan2(dy, Math.hypot(dx, dz));
    R.draw(m, K.mat(a, [yaw, pitch, 0], [w, w, len]), { tint: col });
    R.draw(m, K.mat(a, [yaw, pitch, 0], [w * 3, w * 3, len]), { tint: col, alpha: 0.25, blend: true, noDepth: true });
  }

  // ---------- disegno 2D (telefoni senza WebGL) ----------
  function loop2D(ts) {
    if (!G || G.ended) return;
    const now = ts / 1000, dt = Math.min(0.05, G.last ? now - G.last : 1 / 60);
    G.last = now;
    let left = dt * ((root.FMLAB3D && root.FMLAB3D.speed) || 1);
    while (left > 0) { const s = Math.min(left, 1 / 30); update(s); left -= s; }
    draw2D();
    updateNums(dt);
    updateHud();
    G.raf = requestAnimationFrame(loop2D);
  }
  function draw2D() {
    const cv = G.cv, dpr = Math.min(2, root.devicePixelRatio || 1);
    const W = cv.clientWidth, H = cv.clientHeight;
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const c = cv.getContext('2d'), S = 28;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    G.camX += (G.x - G.camX) * 0.15; G.camZ += (G.z - G.camZ) * 0.15;
    const X = (x) => W / 2 + (x - G.camX) * S, Y = (z) => H / 2 + (z - G.camZ) * S;
    c.fillStyle = '#2f6b3a'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#5fae4f'; c.beginPath(); c.arc(X(0), Y(0), ARENA_R * S, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#cfc6b4'; c.beginPath(); c.arc(X(0), Y(0), 2 * S, 0, Math.PI * 2); c.fill();
    const col = (t) => ctx.E.TYPES[t].color;
    for (const g of G.gems) { c.fillStyle = g.v >= 12 ? '#fbbf24' : g.v >= 4 ? '#4ade80' : '#60a5fa'; c.fillRect(X(g.x) - 3, Y(g.z) - 3, 6, 6); }
    for (const k of G.rocks) { c.strokeStyle = 'rgba(255,80,40,.7)'; c.beginPath(); c.arc(X(k.x), Y(k.z), k.r * S, 0, Math.PI * 2); c.stroke(); }
    for (const e of G.enemies) {
      c.globalAlpha = e.dead ? 0.4 : 1;
      c.fillStyle = e.flash > 0 ? '#fff' : col(e.type);
      c.beginPath(); c.arc(X(e.x), Y(e.z), e.r * S, 0, Math.PI * 2); c.fill();
      if (e.boss) { c.strokeStyle = '#fbbf24'; c.lineWidth = 3; c.stroke(); }
    }
    c.globalAlpha = 1;
    if (G.leaves) for (const p of G.leaves) { c.fillStyle = '#7ee08f'; c.beginPath(); c.arc(X(p[0]), Y(p[2]), 6, 0, Math.PI * 2); c.fill(); }
    for (const s of G.shots) { c.fillStyle = s.kind === 'fire' ? '#ff8a1f' : s.kind === 'water' ? '#7cc4ff' : '#b48bff'; c.beginPath(); c.arc(X(s.x), Y(s.z), s.r * S * 0.6, 0, Math.PI * 2); c.fill(); }
    for (const ch of G.chains) { c.strokeStyle = '#bff5ff'; c.lineWidth = 3; c.beginPath(); ch.pts.forEach((p, i) => (i ? c.lineTo(X(p[0]), Y(p[2])) : c.moveTo(X(p[0]), Y(p[2])))); c.stroke(); }
    for (const g of G.rings) { c.strokeStyle = 'rgba(255,240,200,.8)'; c.lineWidth = 4; c.beginPath(); c.arc(X(g.x), Y(g.z), g.r * S, 0, Math.PI * 2); c.stroke(); }
    for (const f of G.fx) { c.fillStyle = 'rgb(' + f.col.map((v) => Math.round(v * 255)).join(',') + ')'; c.fillRect(X(f.x) - 2, Y(f.z) - 2 - f.y * 10, 4, 4); }
    c.fillStyle = col(G.type); c.strokeStyle = '#fff'; c.lineWidth = 3;
    c.beginPath(); c.arc(X(G.x), Y(G.z), PLAYER_R * S * 1.3, 0, Math.PI * 2); c.fill(); c.stroke();
    G.PV = null;
  }

  // ---------- agganci per le prove ----------
  const debug = {
    god: false, fastWaves: false, oneShot: false, move: null,
    spawn(n) { if (G) spawnNormal(n || 10); },
    addXp(n) { if (G) G.xp += n; },
    levelUp(n) { if (!G) return; for (let i = 0; i < (n || 1); i++) { G.level++; G.next = xpNeed(G.level); G.pendingLevels++; levelUpCreature(); } },
    charge(v) { if (G) G.ult = v == null ? 1 : v; },
    ult() { fireUlt(); },
    pick(i) { choose(i || 0); },
    boss(kind) { if (!G) return; if (kind === 'guardian') spawnGuardian(); else spawnMiniBoss(); },
    kill() {
      if (!G || G.over) return;
      G.hp = 0; debug.god = false;
      if (G.modal) { ui.modal.classList.remove('on'); G.modal = null; G.pendingLevels = 0; }
      gameOver(false);
    },
    wave(n) { if (G) { G.wave = n; G.waveT = 0; } },
    state() {
      if (!G) return { running: false };
      return {
        running: true, paused: G.paused, over: G.over, modal: G.modal, wave: G.wave, time: G.time, kills: G.kills, score: G.score,
        enemies: G.enemies.filter((e) => !e.dead).length, level: G.level, effLevel: G.effLevel, species: G.species, hp: G.hp, maxhp: G.maxhp,
        ult: G.ult, x: G.x, z: G.z, weapons: G.weapons.map((w) => w.type + w.lvl), passive: Object.assign({}, G.passive), gems: G.gems.length,
        boss: G.boss ? { title: G.boss.title, hp: G.boss.hp, maxhp: G.boss.maxhp } : null, sent: !!G.sent, result: G.result || null,
        tris: root.FMLAB3D && root.FMLAB3D.stats ? root.FMLAB3D.stats.tris : 0, cpuMs: G.cpuMs || 0,
      };
    },
    session() { return session ? Object.assign({}, session, { save: undefined }) : null; },
  };

  root.FMLABHorde = { start, debug, WEAPONS, ULTS };
})(typeof self !== 'undefined' ? self : this);
