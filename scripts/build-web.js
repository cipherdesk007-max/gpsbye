#!/usr/bin/env node
/*
 * Prepara le versioni da pubblicare:
 *   backend/dist/  → progetto Google Apps Script (Code.gs, engine.gs, servercore.gs, Index.html, appsscript.json)
 *   dist/web/      → sito statico (GitHub Pages) e contenuto delle app IPA/APK
 *   dist/single.html → tutto il gioco in un solo file
 * Uso: node scripts/build-web.js [URL-del-server-Apps-Script]
 */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), game = path.join(root, 'game');
const serverUrl = process.argv[2] || '';
const html = fs.readFileSync(path.join(game, 'index.html'), 'utf8');
const read = (f) => fs.readFileSync(path.join(game, f), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
function inline(extraHead) {
  let out = html
    .replace(/<link rel="stylesheet" href="style.css">/, () => '<style>\n' + read('style.css') + '\n</style>')
    .replace(/<link rel="manifest"[^>]*>\n?/, '').replace(/<link rel="apple-touch-icon"[^>]*>\n?/, '');
  scripts.forEach((f) => {
    const code = read(f);
    if (/<\/script/i.test(code)) throw new Error(f + ' contiene </script>: non si può incorporare');
    out = out.replace(`<script src="${f}"></script>`, () => '<script>\n' + code + '\n</script>');
  });
  if (extraHead) out = out.replace('</head>', extraHead + '\n</head>');
  return out;
}
const mk = (d) => fs.mkdirSync(d, { recursive: true });
// Apps Script
const gas = path.join(root, 'backend', 'dist'); mk(gas);
fs.copyFileSync(path.join(root, 'backend', 'Code.gs'), path.join(gas, 'Code.gs'));
fs.copyFileSync(path.join(root, 'backend', 'appsscript.json'), path.join(gas, 'appsscript.json'));
fs.copyFileSync(path.join(game, 'engine.js'), path.join(gas, 'engine.gs'));
fs.copyFileSync(path.join(game, 'server-core.js'), path.join(gas, 'servercore.gs'));
fs.writeFileSync(path.join(gas, 'Index.html'), inline());
// sito statico + app
const web = path.join(root, 'dist', 'web'); mk(web);
fs.readdirSync(game).forEach((f) => fs.copyFileSync(path.join(game, f), path.join(web, f)));
fs.writeFileSync(path.join(web, 'config.js'), `window.FMLAB_SERVER_URL = ${JSON.stringify(serverUrl)};\n`);
fs.writeFileSync(path.join(web, 'index.html'), read('index.html').replace('<script src="engine.js"></script>', '<script src="config.js"></script>\n<script src="engine.js"></script>'));
fs.writeFileSync(path.join(root, 'dist', 'single.html'), inline(`<script>window.FMLAB_SERVER_URL = ${JSON.stringify(serverUrl)};</script>`));
const kb = (f) => Math.round(fs.statSync(f).size / 1024) + ' KB';
console.log('Apps Script: backend/dist/Index.html ' + kb(path.join(gas, 'Index.html')));
console.log('Sito/app:    dist/web/ (' + fs.readdirSync(web).length + ' file)' + (serverUrl ? ', server ' + serverUrl : ', server non impostato'));
