import sys, json
from playwright.sync_api import sync_playwright
import os
OUT = os.environ.get('FMLAB_OUT', '/mnt/user-data/outputs/fmlab-monsters/')
import os; os.makedirs(OUT, exist_ok=True)
PORT = os.environ.get('FMLAB_PORT', '8765')
BASE = f'http://localhost:{PORT}/game/index.html'
results = []
def check(name, ok, detail=''):
    results.append(ok); print(('PASS ' if ok else 'FAIL ') + name + (f'  [{detail}]' if detail else ''))
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    errs = []
    a = ctx.new_page(); a.on('pageerror', lambda e: errs.append('A: ' + str(e)))
    a.goto(BASE); a.wait_for_timeout(400)
    a.screenshot(path=OUT + '01-titolo.png')
    check('Titolo visibile', a.locator('text=FMLAB Monsters').count() > 0)
    check('Grafica 3D attiva (WebGL)', a.evaluate('FMLAB.use3D') and a.evaluate('FMLAB.gl.frames') > 5, str(a.evaluate('FMLAB.gl')))
    a.fill('#name', 'Francesco'); a.click('#new'); a.wait_for_timeout(200)
    a.click('[data-id="goccino"]'); a.wait_for_timeout(150)
    a.screenshot(path=OUT + '02-scelta-compagno.png')
    a.click('#go'); a.wait_for_timeout(400)
    check('Dopo la scelta si apre la mappa', a.evaluate('FMLAB.screen') == 'map')
    a.screenshot(path=OUT + '03-mappa-borgo.png')
    # cammina verso nord nell'erba senza incontri
    a.evaluate('FMLAB.debug.encounterRate = 0')
    y0 = a.evaluate('FMLAB.save.pos.y')
    for _ in range(9): a.evaluate('FMLAB.step(0,-1)')
    pos = a.evaluate('FMLAB.save.pos'); check('Il giocatore si muove sulla mappa', pos['y'] == y0 - 9, json.dumps(pos))
    a.wait_for_timeout(200); a.screenshot(path=OUT + '04-mappa-prato.png')
    # muro: non si passa attraverso gli alberi del bordo
    for _ in range(15): a.evaluate('FMLAB.step(-1,0)')
    check('I bordi bloccano il passaggio', a.evaluate('FMLAB.save.pos.x') >= 1)
    a.evaluate('FMLAB.save.pos = {x:15,y:40}')
    # mondo: oggetti, laboratorio, abitanti, creature visibili
    W = 'FMLAB.world'
    a.evaluate("FMLAB.debug.noLife = false; FMLAB.debug.encounterRate = null")
    it = a.evaluate(f"(() => {{ const it = {W}.items[0]; const g = {W}.grid; const d = [[1,0],[-1,0],[0,1],[0,-1]].find(([dx,dy]) => !{W}.isSolid(g[it.y+dy][it.x+dx]) && !{W}.isEncounter(g[it.y+dy][it.x+dx])) || [0,1]; return {{x: it.x+d[0], y: it.y+d[1], dx: -d[0], dy: -d[1]}}; }})()")
    a.evaluate("FMLAB.debug.encounterRate = 0"); a.evaluate(f"FMLAB.save.pos = {{x:{it['x']},y:{it['y']}}}; FMLAB.showMap()"); a.wait_for_timeout(200)
    c0 = a.evaluate('FMLAB.save.capsules'); a.evaluate(f"FMLAB.step({it['dx']},{it['dy']})")
    check('Capsula raccolta da terra', a.evaluate('FMLAB.save.capsules') == c0 + 1, f"{c0} -> {a.evaluate('FMLAB.save.capsules')}")
    a.evaluate("FMLAB.save.pos = {x:8,y:49}; FMLAB.save.gift = ''; FMLAB.showMap()"); a.wait_for_timeout(150)
    c0 = a.evaluate('FMLAB.save.capsules'); a.evaluate('FMLAB.step(0,-1)')
    check('Regalo del Laboratorio: +3 capsule al giorno', a.evaluate('FMLAB.save.capsules') == min(20, c0 + 3))
    n = a.evaluate("FMLAB.life.npcs[1]"); a.evaluate(f"FMLAB.save.pos = {{x:{n['x']-1},y:{n['y']}}}; FMLAB.showMap()"); a.wait_for_timeout(150)
    a.evaluate("FMLAB.life.npcs[1].x = %d; FMLAB.life.npcs[1].y = %d; FMLAB.step(1,0)" % (n['x'], n['y']))
    check('Gli abitanti parlano e non si attraversano', a.evaluate('FMLAB.save.pos.x') == n['x'] - 1 and 'Beppe' in a.inner_text('#toast'), a.inner_text('#toast'))
    spot = a.evaluate(f"(() => {{ const g = {W}.grid; for (let y = 35; y < 44; y++) for (let x = 2; x < 29; x++) if (g[y][x] === '.' && g[y][x+1] === ',') return {{x, y}}; }})()")
    a.evaluate(f"FMLAB.save.pos = {{x:{spot['x']},y:{spot['y']}}}; FMLAB.showMap()"); a.wait_for_timeout(150)
    a.evaluate(f"FMLAB.debug.encounterRate = null; FMLAB.life.mons.length = 0; FMLAB.life.mons.push({{key:'prova', species:'voltino', level:5, x:{spot['x']+1}, y:{spot['y']}, zone:'prato'}}); FMLAB.step(1,0)")
    a.wait_for_timeout(300)
    check('Creatura visibile nell\'erba: toccandola parte la lotta', a.evaluate('FMLAB.screen') == 'battle' and 'Voltino' in a.inner_text('#log'), a.inner_text('#log'))
    a.screenshot(path=OUT + '05b-incontro-visibile.png')
    a.evaluate("FMLAB.debug.encounterRate = 0; FMLAB.save.pos = {x:15,y:40}")
    # lotta selvatica
    a.evaluate('FMLAB.debug.fast = true')
    a.evaluate("FMLAB.startWild('fiammino', 4, 'prato')"); a.wait_for_timeout(150)
    a.evaluate('FMLAB.debug.fast = false')
    a.screenshot(path=OUT + '05-lotta-incontro.png')
    check('Si apre la lotta', a.evaluate('FMLAB.screen') == 'battle')
    a.evaluate('FMLAB.debug.fast = true')
    a.click('.move[data-m="spruzzo"]'); a.wait_for_timeout(400)
    a.evaluate('FMLAB.debug.fast = false')
    log = a.inner_text('#log'); a.screenshot(path=OUT + '06-lotta-mossa.png')
    check('Dopo la mossa il testo della lotta cambia', 'selvatico' in log or 'Spruzzo' in log or 'efficace' in log, log)
    # cattura sicura
    a.evaluate('FMLAB.debug.catchLuck = 1')
    if a.locator('#aCatch').count():
        a.evaluate('FMLAB.debug.fast = true'); a.click('#aCatch'); a.wait_for_timeout(300); a.evaluate('FMLAB.debug.fast = false')
        a.screenshot(path=OUT + '07-cattura.png')
        check('Cattura riuscita: 2 creature in squadra', a.evaluate('FMLAB.save.team.length') == 2, str(a.evaluate('FMLAB.save.team.map(m=>m.name)')))
    a.click('#endBtn'); a.wait_for_timeout(200)
    # squadra e archivio
    a.evaluate('FMLAB.showTeam()'); a.wait_for_timeout(200); a.screenshot(path=OUT + '08-squadra.png')
    a.evaluate('FMLAB.showDex()'); a.wait_for_timeout(200); a.screenshot(path=OUT + '09-archivio.png')
    check('Archivio: 2 catturati', 'Catturati 2' in a.inner_text('.screen'))
    a.locator('.dexc.got').first.click(); a.wait_for_timeout(900); a.screenshot(path=OUT + '09b-visore-3d.png')
    check('Visore 3D dall\'archivio', a.evaluate('FMLAB.screen') == 'viewer' and a.locator('#viewer3d canvas').count() == 1)
    a.evaluate('FMLAB.showDex()')
    # evoluzione: battaglia vinta con esperienza alta
    a.evaluate("(() => { const m = FMLAB.save.team[0]; m.xp = 1380; })()")  # vicino al livello 12
    a.evaluate('FMLAB.debug.fast = true')
    a.evaluate("FMLAB.startWild('semino', 2, 'prato')")
    for _ in range(8):
        if a.evaluate('FMLAB.screen') != 'battle' or a.locator('#endBtn').count(): break
        if a.locator('.move').count(): a.locator('.move').first.click()
        a.wait_for_timeout(300)
    a.evaluate('FMLAB.debug.fast = false')
    sp = a.evaluate('FMLAB.save.team[0].species'); lv = a.evaluate('FMLAB.save.team[0].level')
    check('Evoluzione dopo la lotta (Goccino → Ondaro al Lv 12)', sp == 'ondaro', f'{sp} Lv {lv}')
    # sfida tra due telefoni (modalità locale, stesso browser)
    a.evaluate('FMLAB.showPvp()'); a.wait_for_timeout(300); a.screenshot(path=OUT + '10-sfide.png')
    bpage = ctx.new_page(); bpage.on('pageerror', lambda e: errs.append('B: ' + str(e)))
    bpage.goto(BASE); bpage.wait_for_timeout(300)
    bpage.evaluate("localStorage.removeItem('fmlab-monsters-save-v1')")
    bpage.evaluate("FMLAB.newGame('Luca','fiammino')"); bpage.evaluate("FMLAB.save.team[0].level = 5")
    bpage.evaluate("FMLAB.showPvp()"); bpage.wait_for_timeout(200)
    a.evaluate('FMLAB.debug.fast = true'); bpage.evaluate('FMLAB.debug.fast = true')
    a.click('#create'); a.wait_for_timeout(400)
    code = a.inner_text('#roomCode').strip()
    a.evaluate('FMLAB.debug.fast = false'); a.wait_for_timeout(100)
    a.screenshot(path=OUT + '11-sfida-codice.png')
    check('Codice sfida di 5 caratteri', len(code) == 5, code)
    a.evaluate('FMLAB.debug.fast = true')
    bpage.fill('#code', code); bpage.click('#join'); bpage.wait_for_timeout(600)
    for _ in range(30):
        if a.evaluate('FMLAB.screen') == 'battle': break
        a.wait_for_timeout(100)
    check('Entrambi i telefoni sono in lotta', a.evaluate('FMLAB.screen') == 'battle' and bpage.evaluate('FMLAB.screen') == 'battle')
    turns = 0
    for _ in range(40):
        ended = a.locator('#endBtn').count() and bpage.locator('#endBtn').count()
        if ended: break
        for pg in (a, bpage):
            if pg.locator('.move').count() and not pg.locator('#endBtn').count():
                pg.locator('.move').nth(1 if pg.locator('.move').count() > 1 else 0).click(); pg.wait_for_timeout(150)
        a.wait_for_timeout(500); bpage.wait_for_timeout(100); turns += 1
        if turns == 1:
            a.evaluate('FMLAB.debug.fast = false'); a.wait_for_timeout(50); a.screenshot(path=OUT + '12-sfida-lotta-telefono1.png')
            bpage.screenshot(path=OUT + '13-sfida-lotta-telefono2.png'); a.evaluate('FMLAB.debug.fast = true')
    a.wait_for_timeout(500)
    la, lb = a.inner_text('#log'), bpage.inner_text('#log')
    a.evaluate('FMLAB.debug.fast = false'); a.screenshot(path=OUT + '14-sfida-fine.png')
    check('La sfida finisce su entrambi i telefoni', a.locator('#endBtn').count() > 0 and bpage.locator('#endBtn').count() > 0, la + ' | ' + lb)
    check('I due telefoni sono d\'accordo sul vincitore', ('Hai vinto' in la) != ('Hai vinto' in lb), la + ' | ' + lb)
    a.click('#endBtn'); a.wait_for_timeout(500); a.screenshot(path=OUT + '15-classifica.png')
    check('Classifica con i due giocatori', 'Francesco' in a.inner_text('#lb') and 'Luca' in a.inner_text('#lb'), a.inner_text('#lb'))
    # Sala Online: due telefoni si vedono, uno invita, l'altro accetta dalla mappa
    s1 = ctx.new_page(); s2 = ctx.new_page()
    for pg_, nm, st in ((s1, 'Marco', 'fiammino'), (s2, 'Sara', 'semino')):
        pg_.on('pageerror', lambda e: errs.append('S: ' + str(e)))
        pg_.goto(BASE); pg_.wait_for_timeout(300)
        pg_.evaluate(f"FMLAB.debug.fast = true; FMLAB.debug.encounterRate = 0; FMLAB.debug.noLife = true")
    s1.evaluate("localStorage.removeItem('fmlab-monsters-save-v1'); Object.keys(localStorage).filter(k => k.indexOf('fmlab-srv-pres_') === 0).forEach(k => localStorage.removeItem(k)); FMLAB.newGame('Marco','fiammino'); FMLAB.save.pid = 'marco000test'")
    s1.evaluate("FMLAB.hello()"); s1.wait_for_timeout(200)
    s2.evaluate("FMLAB.newGame('Sara','semino'); FMLAB.save.pid = 'sara0000test'; FMLAB.hello()"); s2.wait_for_timeout(200)
    s2.evaluate("Object.keys(localStorage).filter(k => k.indexOf('fmlab-srv-pres_') === 0 && !/marco000test|sara0000test/.test(k)).forEach(k => localStorage.removeItem(k))")
    s1.evaluate("FMLAB.save.pid = 'marco000test'; FMLAB.showLounge(true)"); s1.wait_for_timeout(500)
    names = s1.inner_text('#lnList')
    check('Sala Online: Marco vede Sara online', 'Sara' in names, names[:80])
    s1.evaluate("FMLAB.debug.fast = false"); s1.wait_for_timeout(700); s1.screenshot(path=OUT + '18-sala-online.png'); s1.evaluate("FMLAB.debug.fast = true")
    s1.locator('#lnList [data-f]').first.click(); s1.wait_for_timeout(500)
    for _ in range(30):
        if s2.locator('#invOk').count(): break
        s2.evaluate("FMLAB.hello()"); s2.wait_for_timeout(150)
    check('Sara riceve l\'invito sulla mappa', s2.locator('#invOk').count() == 1, s2.evaluate("FMLAB.screen + ' ' + JSON.stringify(FMLAB.presence.invites) + ' ' + localStorage.getItem('fmlab-srv-inv_sara0000test')"))
    s2.evaluate("FMLAB.debug.fast = false"); s2.wait_for_timeout(600); s2.screenshot(path=OUT + '19-invito-sulla-mappa.png'); s2.evaluate("FMLAB.debug.fast = true")
    s2.click('#invOk'); s2.wait_for_timeout(500)
    for _ in range(30):
        if s1.evaluate('FMLAB.screen') == 'battle': break
        s1.wait_for_timeout(150)
    check('Invito accettato: tutti e due in lotta', s1.evaluate('FMLAB.screen') == 'battle' and s2.evaluate('FMLAB.screen') == 'battle')
    s1.close(); s2.close()
    # telefono girato: lotta a tutto schermo con i comandi a destra
    l = b.new_page(viewport={'width': 844, 'height': 390}, device_scale_factor=2, is_mobile=True, has_touch=True)
    l.on('pageerror', lambda e: errs.append('L: ' + str(e)))
    l.goto(BASE); l.wait_for_timeout(300)
    l.evaluate("FMLAB.newGame('Giro','semino')"); l.evaluate("FMLAB.startWild('voltino', 5, 'bosco')"); l.wait_for_timeout(1500)
    box = l.locator('.bpanel').bounding_box(); canv = l.locator('#stage3d canvas').bounding_box()
    l.screenshot(path=OUT + '16-orizzontale-lotta.png')
    check('Orizzontale: 3D a tutto schermo e comandi a destra', canv['width'] >= 840 and canv['height'] >= 388 and box['x'] > 450, f"tela {canv['width']}x{canv['height']}, comandi x={box['x']}")
    l.evaluate("FMLAB.debug.encounterRate = 0; FMLAB.showMap()"); l.wait_for_timeout(300)
    p0 = l.evaluate('JSON.stringify(FMLAB.save.pos)'); l.click('#mRot'); l.wait_for_timeout(300)
    l.locator('.dpad button[data-d="0,-1"]').dispatch_event('pointerdown'); l.locator('.dpad button[data-d="0,-1"]').dispatch_event('pointerup'); l.wait_for_timeout(300)
    p1 = l.evaluate('FMLAB.save.pos')
    check('Visuale girata: la freccia su segue la camera', json.loads(p0)['x'] - 1 == p1['x'] and json.loads(p0)['y'] == p1['y'], p0 + ' -> ' + json.dumps(p1))
    l.screenshot(path=OUT + '17-orizzontale-mappa.png')
    # versione Google: un solo file Index.html, server con google.script.run
    g = b.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    g.on('pageerror', lambda e: errs.append('G: ' + str(e)))
    g.add_init_script("""(() => { let srv = null, mem = {};
      const st = { get: (k) => (k in mem ? mem[k] : null), set: (k, v) => { mem[k] = v; }, del: (k) => { delete mem[k]; }, keys: () => Object.keys(mem), lock: (fn) => fn(), now: () => Date.now(), random: () => Math.random() };
      const chain = (ok, ko) => ({ withSuccessHandler: (f) => chain(f, ko), withFailureHandler: (f) => chain(ok, f),
        apiRun: (p) => setTimeout(() => { srv = srv || window.FMLABServerCore.createServer(st, window.FMLABEngine); window.__gasCalls = (window.__gasCalls || 0) + 1; ok && ok(JSON.parse(JSON.stringify(srv.handle(p)))); }, 30) });
      window.google = { script: { run: chain(null, null) } }; })()""")
    g.goto(f'http://localhost:{PORT}/backend/dist/Index.html'); g.wait_for_timeout(500)
    g.evaluate("FMLAB.newGame('Online','semino')"); g.evaluate("FMLAB.showPvp()"); g.wait_for_timeout(400)
    g.click('#create'); g.wait_for_timeout(600)
    code = g.inner_text('#roomCode').strip() if g.locator('#roomCode').count() else ''
    check('Versione Google (Index.html): sfide via google.script.run', g.evaluate('FMLAB.serverMode()') == 'google' and len(code) == 5 and g.evaluate('window.__gasCalls') >= 2, f"codice {code}, chiamate {g.evaluate('window.__gasCalls')}")
    check('Versione Google: 3D attivo', g.evaluate('FMLAB.use3D'))
    # grafica piatta di riserva per telefoni senza WebGL
    c = ctx.new_page(); c.on('pageerror', lambda e: errs.append('C: ' + str(e)))
    c.goto(BASE + '?2d'); c.wait_for_timeout(300)
    c.evaluate("FMLAB.newGame('Prova','semino')"); c.evaluate("FMLAB.debug.fast = true"); c.evaluate("FMLAB.startWild('ombrino', 4, 'grotta')"); c.wait_for_timeout(200)
    check('Riserva 2D senza WebGL', not c.evaluate('FMLAB.use3D') and c.locator('#spr1 svg').count() == 1)
    check('Nessun errore JavaScript', not errs, '; '.join(errs))
    b.close()
print(f"\nRISULTATO: {sum(results)} PASS, {len(results)-sum(results)} FAIL")
