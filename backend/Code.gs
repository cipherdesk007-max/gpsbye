/**
 * FMLAB Monsters — il gioco intero online su Google Apps Script.
 *
 * Lo stesso link /exec fa due cose:
 *   - aperto nel browser del telefono → mostra il gioco (Index.html)
 *   - chiamato con ?action=... → risponde come server delle sfide (per le app IPA/APK)
 * Dentro la pagina il gioco parla col server con google.script.run (niente URL da incollare).
 *
 * Nel progetto Apps Script servono 4 file, preparati da scripts/build-apps-script.sh in backend/dist/:
 *   Code.gs (questo), engine.gs, servercore.gs, Index.html (tutto il gioco in un file).
 *
 * Pubblica come "App web": Esegui come = Me, Chi ha accesso = Chiunque.
 */

function fmlabStorage_() {
  const props = PropertiesService.getScriptProperties();
  return {
    get: function (key) { return props.getProperty(key); },
    set: function (key, value) { props.setProperty(key, value); },
    del: function (key) { props.deleteProperty(key); },
    keys: function () { return props.getKeys(); },
    lock: function (fn) {
      const lock = LockService.getScriptLock();
      lock.waitLock(10000);           // due telefoni che mandano la mossa insieme: uno alla volta
      try { return fn(); } finally { lock.releaseLock(); }
    },
    now: function () { return Date.now(); },
    random: function () { return Math.random(); },
  };
}

function doGet(e) {
  const params = (e && e.parameter) || {};
  if (!params.action) {
    return HtmlService.createHtmlOutputFromFile('Index')
      .setTitle('FMLAB Monsters')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no')
      .addMetaTag('apple-mobile-web-app-capable', 'yes')
      .addMetaTag('mobile-web-app-capable', 'yes')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  const result = apiRun(params);
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

/** Chiamata dal gioco con google.script.run.apiRun({...}). */
function apiRun(params) {
  const server = FMLABServerCore.createServer(fmlabStorage_(), FMLABEngine);
  return server.handle(params || {});
}

/** Da lanciare a mano dall'editor per azzerare stanze e classifica. */
function azzeraTutto() {
  PropertiesService.getScriptProperties().deleteAllProperties();
}
