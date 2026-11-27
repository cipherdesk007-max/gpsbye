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
    NOSTORY = "window.__FMLAB_NOSTORY = true"   # i controlli classici girano senza storia; quelli della storia la riaccendono
    ctx.add_init_script(NOSTORY)
    errs = []
    a = ctx.new_page(); a.on('pageerror', lambda e: errs.append('A: ' + str(e)))
    a.goto(BASE); a.wait_for_timeout(400)
    a.screenshot(path=OUT + '01-titolo.png')
    check('Titolo visibile', a.locator('text=FMLAB Cristalia').count() > 0)
    check('Grafica 3D attiva (WebGL)', a.evaluate('FMLAB.use3D') and a.evaluate('FMLAB.gl.frames') > 5, str(a.evaluate('FMLAB.gl')))
    a.fill('#name', 'Francesco'); a.click('#new'); a.wait_for_timeout(200)
    a.click('[data-id="goccino"]'); a.wait_for_timeout(150)
    a.screenshot(path=OUT + '02-scelta-compagno.png')
    a.click('#go'); a.wait_for_timeout(400)
    check('Dopo la scelta si apre la mappa', a.evaluate('FMLAB.screen') == 'map')
    check('Musica: sulla mappa del Borgo suona il tema del Borgo', a.evaluate('FMLABAudio.current') == 'borgo', str(a.evaluate('FMLABAudio.current')))
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
    a.evaluate('FMLAB.skipDialog()')
    n = a.evaluate("FMLAB.life.npcs[1]"); a.evaluate(f"FMLAB.save.pos = {{x:{n['x']-1},y:{n['y']}}}; FMLAB.showMap()"); a.wait_for_timeout(150)
    a.evaluate("FMLAB.life.npcs[1].x = %d; FMLAB.life.npcs[1].y = %d; FMLAB.step(1,0)" % (n['x'], n['y']))
    line = a.evaluate('FMLAB.dialogLine')
    check('Gli abitanti parlano (finestra di dialogo) e non si attraversano', a.evaluate('FMLAB.save.pos.x') == n['x'] - 1 and 'Beppe' in line and a.locator('#dlg').is_visible(), line)
    a.evaluate('FMLAB.skipDialog()')
    spot = a.evaluate(f"(() => {{ const g = {W}.grid; for (let y = 35; y < 44; y++) for (let x = 2; x < 29; x++) if (g[y][x] === '.' && g[y][x+1] === ',') return {{x, y}}; }})()")
    a.evaluate(f"FMLAB.save.pos = {{x:{spot['x']},y:{spot['y']}}}; FMLAB.showMap()"); a.wait_for_timeout(150)
    a.evaluate(f"FMLAB.debug.encounterRate = null; FMLAB.life.mons.length = 0; FMLAB.life.mons.push({{key:'prova', species:'voltino', level:5, x:{spot['x']+1}, y:{spot['y']}, zone:'prato'}}); FMLAB.step(1,0)")
    a.wait_for_timeout(300)
    check('Creatura visibile nell\'erba: toccandola parte la lotta', a.evaluate('FMLAB.screen') == 'battle' and 'Voltino' in a.inner_text('#log'), a.inner_text('#log'))
    a.screenshot(path=OUT + '05b-incontro-visibile.png')
    a.evaluate("FMLAB.debug.encounterRate = 0; FMLAB.save.pos = {x:15,y:40}")
    # lotta selvatica
    a.evaluate('FMLAB.debug.fast = true')
    a.evaluate("FMLAB.startWild('fiammino', 9, 'prato')"); a.wait_for_timeout(150)
    a.evaluate('FMLAB.debug.fast = false')
    a.screenshot(path=OUT + '05-lotta-incontro.png')
    check('Si apre la lotta', a.evaluate('FMLAB.screen') == 'battle')
    check('Musica: entrando in lotta parte il tema della lotta', a.evaluate('FMLABAudio.current') == 'lotta' and a.evaluate('FMLAB.fx.wipes') >= 1, str(a.evaluate('FMLABAudio.current')))
    a.evaluate('FMLAB.debug.fast = true')
    a.click('.move[data-m="spruzzo"]'); a.wait_for_timeout(400)
    a.evaluate('FMLAB.debug.fast = false')
    log = a.inner_text('#log'); a.screenshot(path=OUT + '06-lotta-mossa.png')
    check('Dopo la mossa il testo della lotta cambia', 'selvatico' in log or 'Spruzzo' in log or 'efficace' in log, log)
    check('Lotta: numeri del danno ed effetti sonori dei colpi', a.evaluate('FMLAB.fx.damage') >= 1 and a.evaluate("FMLABAudio.log.some(n => n.indexOf('colpo-') === 0)"), a.evaluate("JSON.stringify(FMLAB.fx) + ' ' + FMLABAudio.log.slice(-6).join(',')"))
    # cattura sicura (aspetta che il turno finisca: sulle macchine lente serve più tempo)
    a.evaluate('FMLAB.debug.catchLuck = 1')
    for _ in range(50):
        if a.locator('#aCatch').count() or a.locator('#endBtn').count(): break
        a.wait_for_timeout(100)
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
    a.evaluate("(() => { FMLAB.save.team.forEach(x => { x.hp = x.maxhp; x.status = null; }); const m = FMLAB.save.team[0]; m.xp = 1380; })()")  # vicino al livello 12, squadra curata
    a.evaluate('FMLAB.debug.fast = true')
    a.evaluate("FMLAB.startWild('semino', 2, 'prato')")
    for _ in range(8):
        if a.evaluate('FMLAB.screen') != 'battle' or a.locator('#endBtn').count(): break
        if a.locator('.move').count(): a.evaluate("(() => { const bs = [...document.querySelectorAll('.move')]; bs.sort((x, y) => (FMLABEngine.MOVES[y.dataset.m].power || 0) - (FMLABEngine.MOVES[x.dataset.m].power || 0)); bs[0].click(); })()")
        a.wait_for_timeout(300)
    a.evaluate('FMLAB.debug.fast = false')
    sp = a.evaluate('FMLAB.save.team[0].species'); lv = a.evaluate('FMLAB.save.team[0].level')
    check('Evoluzione dopo la lotta (Goccino → Ondaro al Lv 12)', sp == 'ondaro', f'{sp} Lv {lv}')
    check('Evoluzione: parte la sequenza animata e poi la schermata di vittoria', a.evaluate('FMLAB.fx.evolutions') >= 1 and a.evaluate('FMLAB.fx.victories') >= 1 and a.locator('#evo').count() == 0, a.evaluate('JSON.stringify(FMLAB.fx)'))
    # impostazioni: volumi, vibrazione, qualità, testo veloce, salvate nel salvataggio
    a.evaluate('FMLAB.showMap(); FMLAB.showSettings()'); a.wait_for_timeout(200)
    a.evaluate("(() => { const r = document.getElementById('sMusic'); r.value = 30; r.dispatchEvent(new Event('input', { bubbles: true })); })()")
    a.click('#sQual [data-q="media"]'); a.click('#sFast'); a.wait_for_timeout(100)
    sv = a.evaluate("JSON.parse(localStorage.getItem('fmlab-monsters-save-v1')).settings")
    check('Impostazioni salvate (musica 30, qualità media, testo veloce)', abs(sv['music'] - 0.3) < 0.01 and sv['quality'] == 'media' and sv['fastText'] is True and a.evaluate('FMLAB3D.quality') == 'media' and abs(a.evaluate('FMLABAudio.musicVol') - 0.3) < 0.01, json.dumps(sv))
    a.screenshot(path=OUT + '09c-impostazioni.png')
    a.click('#sQual [data-q="auto"]'); a.click('#sFast'); a.evaluate("(() => { const r = document.getElementById('sMusic'); r.value = 60; r.dispatchEvent(new Event('input', { bubbles: true })); })()")
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
    s1.evaluate("localStorage.removeItem('fmlab-monsters-save-v1'); Object.keys(localStorage).filter(k => k.indexOf('fmlab-srv-c_pres_') === 0).forEach(k => localStorage.removeItem(k)); FMLAB.newGame('Marco','fiammino'); FMLAB.save.pid = 'marco000test'")
    s1.evaluate("FMLAB.hello()"); s1.wait_for_timeout(200)
    s2.evaluate("FMLAB.newGame('Sara','semino'); FMLAB.save.pid = 'sara0000test'; FMLAB.hello()"); s2.wait_for_timeout(200)
    s2.evaluate("Object.keys(localStorage).filter(k => k.indexOf('fmlab-srv-c_pres_') === 0 && !/marco000test|sara0000test|pres_idx/.test(k)).forEach(k => localStorage.removeItem(k))")
    s1.evaluate("FMLAB.save.pid = 'marco000test'; FMLAB.showLounge(true)"); s1.wait_for_timeout(500)
    names = s1.inner_text('#lnList')
    check('Sala Online: Marco vede Sara online', 'Sara' in names, names[:80])
    s1.evaluate("FMLAB.debug.fast = false"); s1.wait_for_timeout(700); s1.screenshot(path=OUT + '18-sala-online.png'); s1.evaluate("FMLAB.debug.fast = true")
    s1.locator('#lnList .mon', has_text='Sara').locator('[data-f]').click(); s1.wait_for_timeout(500)
    for _ in range(80):
        if s2.locator('#invOk').count(): break
        s2.evaluate("FMLAB.hello()"); s2.wait_for_timeout(200)
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
    l.add_init_script(NOSTORY)
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
    g.add_init_script(NOSTORY)
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
    # ---------- STORIA OFFLINE (con la storia accesa) ----------
    sc = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    st = sc.new_page(); st.on('pageerror', lambda e: errs.append('ST: ' + str(e)))
    st.goto(BASE); st.wait_for_timeout(300)
    st.evaluate("localStorage.clear(); FMLAB.debug.encounterRate = 0; FMLAB.debug.noLife = true; FMLAB.debug.noStory = false")
    st.evaluate("FMLAB.newGame('Eroe','goccino')"); st.wait_for_timeout(1800)
    line = st.evaluate('FMLAB.dialogLine')
    check('Storia: il Prof. Ferri parla all\'inizio', st.locator('#dlg').is_visible() and line.startswith('Prof. Ferri') and 'Eroe' in line, line)
    st.screenshot(path=OUT + '20-storia-prof.png')
    st.evaluate('FMLAB.skipDialog()'); st.wait_for_timeout(200)
    check('Storia: dopo l\'intro il Diario ha un obiettivo', st.evaluate('FMLAB.save.story.intro') is True)
    st.evaluate("FMLAB.debug.fast = true")
    for _ in range(9):
        st.evaluate('FMLAB.step(0,-1)'); st.wait_for_timeout(80)
        if st.evaluate('FMLAB.story.busy || FMLAB.dialog.open'): break
    for _ in range(40):
        if st.evaluate('FMLAB.dialog.open'): break
        st.wait_for_timeout(100)
    line = st.evaluate('FMLAB.dialogLine')
    check('Allenatore: Rocco ti vede al cancello e viene a parlarti', 'Rocco' in line and st.evaluate('FMLAB.save.pos.y') >= 46, line + ' @ ' + str(st.evaluate('FMLAB.save.pos')))
    st.evaluate('FMLAB.skipDialog()'); st.wait_for_timeout(300)
    check('Allenatore: parte la lotta contro Rocco (niente fuga, niente cattura)', st.evaluate('FMLAB.screen') == 'battle' and st.evaluate('FMLAB.battle.mode') == 'trainer' and st.locator('#aCatch').count() == 0 and st.locator('#aRun').count() == 0)
    def win_trainer(pg_):
        for _ in range(30):
            if os.environ.get('FMLAB_DEBUG'): print('DBG', pg_.evaluate("(() => { const B = FMLAB.battle; if (!B) return 'nessuna lotta'; const s = B.state || B.view; return FMLAB.screen + ' panel=' + B.panel + ' ' + s.sides.map(sd => sd.team.map(m => m.species + ':' + m.hp + (m.status ? '(' + m.status + ')' : '')).join(',') + ' act' + sd.active).join(' | ') + ' win=' + s.winner + ' dlg=' + FMLAB.dialog.open; })()"), pg_.inner_text('#log')[:60].replace(chr(10), ' ') if pg_.locator('#log').count() else '')
            if pg_.evaluate('FMLAB.screen') != 'battle' or pg_.locator('#endBtn').count(): break
            if pg_.evaluate('FMLAB.dialog.open'): pg_.evaluate('FMLAB.skipDialog()')
            pg_.evaluate("FMLAB.battle.state.sides[1].team.forEach(m => { m.hp = Math.min(m.hp, 1); m.atk = 1; }); FMLAB.battle.state.sides[0].team.forEach(m => { m.hp = m.maxhp; m.status = null; m.slpT = 0; })")
            if pg_.locator('.move').count():
                # la mossa più forte (le mosse di stato non fanno danno)
                pg_.evaluate("(() => { const bs = [...document.querySelectorAll('.move')]; bs.sort((a, b) => (FMLABEngine.MOVES[b.dataset.m].power || 0) - (FMLABEngine.MOVES[a.dataset.m].power || 0)); bs[0].click(); })()")
            pg_.wait_for_timeout(250)
        for _ in range(20):
            if pg_.locator('#endBtn').count(): break
            pg_.evaluate('FMLAB.skipDialog()'); pg_.wait_for_timeout(120)
    win_trainer(st)
    check('Vittoria contro Rocco salvata', st.evaluate('FMLAB.save.story.beaten.rival1') is True)
    st.click('#endBtn'); st.wait_for_timeout(300)
    st.evaluate("FMLAB.save.pos = {x:15,y:47}; FMLAB.showMap()"); st.wait_for_timeout(200)
    st.evaluate('FMLAB.step(0,-1)'); st.wait_for_timeout(600)
    check('Un allenatore battuto non ti risfida', st.evaluate('FMLAB.screen') == 'map' and not st.evaluate('FMLAB.dialog.open') and st.evaluate('FMLAB.save.pos.y') == 46)
    # ponte chiuso senza Medaglia Foglia
    st.evaluate("FMLAB.save.pos = {x:18,y:30}; FMLAB.showMap()"); st.wait_for_timeout(200)
    st.evaluate('FMLAB.step(0,-1)'); st.wait_for_timeout(200)
    line = st.evaluate('FMLAB.dialogLine')
    check('Ponte bloccato senza la Medaglia Foglia', st.evaluate('FMLAB.save.pos.y') == 30 and 'Nino' in line, line)
    st.evaluate("FMLAB.debug.fast = false"); st.wait_for_timeout(900); st.screenshot(path=OUT + '21-ponte-bloccato.png'); st.evaluate("FMLAB.debug.fast = true")
    st.evaluate('FMLAB.skipDialog()')
    # Guardiana Flora: ci parli e lotti per la medaglia
    fl = st.evaluate("FMLAB.story && window.FMLABStory.TRAINERS.find(t => t.id === 'flora').pos")
    st.evaluate(f"FMLAB.save.pos = {{x:{fl['x'] - 1},y:{fl['y']}}}; FMLAB.showMap()"); st.wait_for_timeout(200)
    st.evaluate('FMLAB.step(1,0)'); st.wait_for_timeout(200)
    line = st.evaluate('FMLAB.dialogLine')
    check('Guardiana Flora parla quando la tocchi', 'Flora' in line, line)
    for _ in range(10):
        if st.evaluate('FMLAB.screen') == 'battle': break
        st.evaluate('FMLAB.skipDialog()'); st.wait_for_timeout(150)
    check('Lotta contro la Guardiana (IA esperta)', st.evaluate('FMLAB.screen') == 'battle' and st.evaluate('FMLAB.battle.trainer.ai') == 'esperto')
    win_trainer(st)
    check('Medaglia Foglia ottenuta', st.evaluate('FMLAB.save.story.badges.prato') is True)
    st.click('#endBtn'); st.wait_for_timeout(300)
    st.evaluate('FMLAB.skipDialog()')
    st.evaluate("FMLAB.save.pos = {x:18,y:30}; FMLAB.showMap()"); st.wait_for_timeout(200)
    st.evaluate('FMLAB.step(0,-1)'); st.wait_for_timeout(200)
    check('Con la medaglia il ponte si attraversa', st.evaluate('FMLAB.save.pos.y') == 29)
    st.evaluate("FMLAB.debug.fast = false; FMLAB.showDiary()"); st.wait_for_timeout(400)
    txt = st.inner_text('.screen')
    check('Diario: obiettivo, medaglia vinta e statistiche', 'Medaglia Foglia' in txt and 'Marina' in txt and 'Allenatori battuti' in txt and st.locator('.badge.got').count() == 1, txt[:120].replace(chr(10), ' | '))
    st.screenshot(path=OUT + '22-diario.png')
    # orizzontale: dialogo e Diario
    lc = b.new_context(viewport={'width': 844, 'height': 390}, device_scale_factor=2, is_mobile=True, has_touch=True)
    ls = lc.new_page(); ls.on('pageerror', lambda e: errs.append('LS: ' + str(e)))
    ls.goto(BASE); ls.wait_for_timeout(300)
    ls.evaluate("localStorage.clear(); FMLAB.debug.encounterRate = 0; FMLAB.debug.noLife = true; FMLAB.newGame('Eroe','semino')"); ls.wait_for_timeout(2600)
    ls.screenshot(path=OUT + '23-orizzontale-dialogo.png')
    ls.evaluate('FMLAB.skipDialog(); FMLAB.showDiary()'); ls.wait_for_timeout(300)
    ls.screenshot(path=OUT + '24-orizzontale-diario.png')
    check('Orizzontale: dialogo e Diario senza errori', ls.evaluate('FMLAB.screen') == 'diary')
    sc.close(); lc.close()
    # ---------- TITOLO VERO: "Tocca per iniziare" sblocca l'audio ----------
    tc = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    tc.add_init_script("window.__FMLAB_SPLASH = true; window.__FMLAB_NOSTORY = true")
    tp = tc.new_page(); tp.on('pageerror', lambda e: errs.append('T: ' + str(e)))
    tp.goto(BASE); tp.evaluate('localStorage.clear()'); tp.reload(); tp.wait_for_timeout(1600)
    check('Titolo: schermata "Tocca per iniziare" con musica in attesa', tp.locator('#tapStart').is_visible() and not tp.locator('#name').is_visible() and tp.evaluate('FMLABAudio.current') == 'titolo' and not tp.evaluate('FMLABAudio.unlocked'))
    tp.screenshot(path=OUT + '25-titolo-tocca.png')
    tp.click('#tapStart'); tp.wait_for_timeout(700)
    check('Titolo: il primo tocco sblocca l\'audio senza errori e apre il menu', tp.evaluate('FMLABAudio.unlocked') and tp.evaluate('FMLABAudio.state') == 'running' and tp.evaluate('FMLABAudio.playing') == 'titolo' and tp.evaluate('FMLABAudio.errors') == 0 and tp.locator('#name').is_visible(), str(tp.evaluate('[FMLABAudio.unlocked, FMLABAudio.state, FMLABAudio.playing, FMLABAudio.errors]')))
    tp.screenshot(path=OUT + '26-titolo-menu.png')
    tp.fill('#name', 'Francesco'); tp.click('#new'); tp.wait_for_timeout(200); tp.click('#go'); tp.wait_for_timeout(500)
    tp.evaluate("FMLAB.debug.encounterRate = 0; FMLAB.debug.noLife = true; FMLAB.startWild('semino', 7, 'prato')"); tp.wait_for_timeout(1400)
    check('Audio: il tema della lotta suona davvero (con dissolvenza)', tp.evaluate('FMLABAudio.playing') == 'lotta' and tp.evaluate('FMLABAudio.errors') == 0)
    # tutti i temi e tutti gli effetti suonano senza errori
    tp.evaluate("(() => { FMLABAudio.SFX_NAMES.forEach((n, i) => setTimeout(() => FMLABAudio.sfx(n), i * 25)); })()"); tp.wait_for_timeout(1400)
    for th in tp.evaluate('FMLABAudio.THEME_NAMES'):
        tp.evaluate(f"FMLABAudio.music('{th}')"); tp.wait_for_timeout(220)
    check('Audio: tutti i temi e gli effetti si generano senza errori', tp.evaluate('FMLABAudio.errors') == 0 and tp.evaluate('FMLABAudio.SFX_NAMES.length') >= 30 and tp.evaluate('FMLABAudio.THEME_NAMES.length') == 11, str(tp.evaluate('[FMLABAudio.errors, FMLABAudio.SFX_NAMES.length, FMLABAudio.THEME_NAMES.length]')))
    tp.evaluate("FMLABAudio.music('lotta')")
    tc.close()
    check('Nessun errore JavaScript', not errs, '; '.join(errs))
    b.close()
print(f"\nRISULTATO: {sum(results)} PASS, {len(results)-sum(results)} FAIL")
