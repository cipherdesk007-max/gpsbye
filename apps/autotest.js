/*
 * Prova automatica dentro l'app vera (Simulatore iPhone / emulatore Android), solo nella CI:
 * l'app la esegue quando parte con l'opzione "autotest". Controlla che il gioco giri, che i salvataggi
 * restino dopo un riavvio e che le richieste verso altri siti (come il server Google) funzionino.
 */
(function () {
  'use strict';
  function report(obj) {
    const s = JSON.stringify(obj);
    try { window.webkit.messageHandlers.autotest.postMessage(s); } catch (e) { /* Android */ }
    console.log('AUTOTEST ' + s);
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  (async () => {
    const out = { origin: location.origin, ua: navigator.userAgent.slice(0, 80) };
    try {
      for (let i = 0; i < 40 && !window.FMLAB; i++) await wait(250);
      out.fmlab = typeof window.FMLAB;
      out.use3D = !!(window.FMLAB && window.FMLAB.use3D);
      // salvataggi: si scrive ora, al secondo avvio si deve ritrovare
      out.prev = localStorage.getItem('cristalia-autotest');
      localStorage.setItem('cristalia-autotest', 'ok');
      out.ls = localStorage.getItem('cristalia-autotest') === 'ok';
      out.audio = typeof (window.AudioContext || window.webkitAudioContext) === 'function';
      out.serverUrl = window.FMLAB_SERVER_URL || '';
      const r = await fetch('engine.js');
      out.fetchLocal = r.ok;
      try {
        const g = await fetch('https://api.github.com/zen', { cache: 'no-store' });
        out.fetchRemote = g.ok;
      } catch (e) { out.fetchRemote = 'errore: ' + e.message; }
      if (out.serverUrl) {
        try {
          const p = await fetch(out.serverUrl + (out.serverUrl.indexOf('?') >= 0 ? '&' : '?') + 'action=ping');
          out.server = (await p.json()).ok === true;
        } catch (e) { out.server = 'errore: ' + e.message; }
      }
      if (window.FMLAB && window.FMLAB.newGame) {
        window.FMLAB.debug.noStory = true;
        window.FMLAB.newGame('Prova', 'fiammino');
        await wait(4000);
        out.screen = window.FMLAB.screen;
        const st = window.FMLAB3D && window.FMLAB3D.stats;
        out.frames = st ? st.frames : -1;
        out.glError = st ? st.error : 'nessun motore 3D';
      }
      // interfaccia: dimensioni dello schermo e comandi davvero visibili
      const vis = (sel) => Array.from(document.querySelectorAll(sel)).filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight; }).length;
      const cv = document.querySelector('canvas.gl3d');
      out.ui = { viewport: innerWidth + 'x' + innerHeight, dpr: window.devicePixelRatio, canvas: cv ? cv.width + 'x' + cv.height : null, frecce: vis('.dpad button'), menu: vis('.menu .btn'), zona: (document.getElementById('zone') || {}).textContent || null };
      out.errors = (window.__autotestErrors || []).slice(0, 5);
      out.ok = out.fmlab === 'object' && out.ls && out.fetchLocal === true && out.fetchRemote === true && out.screen === 'map' && (!out.use3D || out.frames > 0) && !out.errors.length && out.ui.frecce === 4 && out.ui.menu >= 5;
    } catch (e) {
      out.ok = false;
      out.exception = String(e && e.stack || e);
    }
    report(out);
  })();
})();
