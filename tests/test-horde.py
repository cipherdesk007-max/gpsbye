"""Prova della Modalità Orda nel browser (Playwright).
Uso: python3 -m http.server 8784 (dalla radice) e poi FMLAB_PORT=8784 python3 tests/test-horde.py"""
import os, json, time
from playwright.sync_api import sync_playwright
PORT = os.environ.get('FMLAB_PORT', '8784')
OUT = os.environ.get('FMLAB_OUT', '/tmp/team-orda/')
os.makedirs(OUT, exist_ok=True)
BASE = f'http://localhost:{PORT}/game/index.html'
results = []
def check(name, ok, detail=''):
    results.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + name + (f'  [{detail}]' if detail else ''))
def st(pg): return pg.evaluate('FMLABHorde.debug.state()')
def wait_for(pg, js, ms=6000):
    t0 = time.time()
    while time.time() - t0 < ms / 1000:
        if pg.evaluate(js): return True
        pg.wait_for_timeout(100)
    return False

with sync_playwright() as p:
    b = p.chromium.launch()
    errs = []
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    ctx.add_init_script("window.__FMLAB_NOSTORY = true")
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append('console: ' + m.text) if m.type == 'error' else None)
    pg.goto(BASE); pg.evaluate("localStorage.clear()"); pg.reload(); pg.wait_for_timeout(300)
    pg.evaluate("FMLAB3D.quality = 'alta'; FMLAB.debug.encounterRate = 0; FMLAB.newGame('Francesco', 'fiammino')")
    pg.evaluate("FMLAB.save.team.push(Object.assign(FMLABEngine.createMonster('goccino', 9, 'g2', { shiny: false }), { name: 'Goccino' }))")
    pg.wait_for_timeout(300)
    xp0 = pg.evaluate('FMLAB.save.team[0].xp'); uid0 = pg.evaluate('FMLAB.save.team[0].uid')
    # ingresso dal tasto della mappa
    pg.click('#mHorde'); pg.wait_for_timeout(700)
    check('Orda: dal tasto della mappa si apre la scelta della creatura', pg.locator('.hz-pick').count() == 1 and pg.locator('.hz-mon').count() == 2)
    pg.locator('.hz-mon').nth(1).click(); pg.wait_for_timeout(300)
    check('Orda: si può scegliere un\'altra creatura della squadra', 'Goccino' in pg.inner_text('#hzGo'))
    pg.locator('.hz-mon').nth(0).click(); pg.wait_for_timeout(500)
    pg.screenshot(path=OUT + 'h01-scelta.png')
    pg.click('#hzGo'); pg.wait_for_timeout(500)
    s = st(pg)
    check('Orda: la partita parte con la creatura scelta', s['running'] and s['species'] == 'fiammino' and s['weapons'] == ['fuoco1'], json.dumps(s['weapons']))
    # joystick: trascino il dito a destra
    x0 = s['x']
    pg.mouse.move(120, 600); pg.mouse.down(); pg.mouse.move(200, 600, steps=6); pg.wait_for_timeout(900)
    check('Orda: il joystick muove la creatura', st(pg)['x'] > x0 + 1.5, f"x {x0:.2f} -> {st(pg)['x']:.2f}")
    pg.mouse.up()
    pg.keyboard.down('w'); pg.wait_for_timeout(500); pg.keyboard.up('w')
    check('Orda: anche WASD muove', st(pg)['z'] < -0.8, f"z {st(pg)['z']:.2f}")
    # nemici e attacchi automatici
    pg.evaluate('FMLABHorde.debug.god = true; FMLABHorde.debug.spawn(40)')
    ok = wait_for(pg, 'FMLABHorde.debug.state().kills >= 3', 15000)
    s = st(pg)
    check('Orda: arrivano i nemici e gli attacchi automatici li sconfiggono', ok and s['enemies'] > 10, f"nemici {s['enemies']}, sconfitti {s['kills']}")
    pg.screenshot(path=OUT + 'h02-ondata.png')
    # salita di livello con scelta
    pg.evaluate('FMLABHorde.debug.levelUp(1)')
    check('Orda: salendo di livello si apre la scelta dei potenziamenti', wait_for(pg, "FMLABHorde.debug.state().modal === 'level'") and pg.locator('.hz-choice').count() == 3)
    pg.screenshot(path=OUT + 'h03-potenziamento.png')
    lv = st(pg)['level']
    pg.locator('.hz-choice').first.click(); pg.wait_for_timeout(300)
    s = st(pg)
    check('Orda: scelto il potenziamento la partita riprende', not s['paused'] and s['modal'] is None and s['level'] == lv and (len(s['weapons']) > 1 or s['weapons'][0] != 'fuoco1' or s['passive']), json.dumps([s['weapons'], s['passive']]))
    # evoluzione durante la partita (Fiammino Lv 5 -> Braciolo al 12)
    pg.evaluate('FMLABHorde.debug.levelUp(8)')
    for _ in range(30):
        if st(pg)['modal'] == 'level': pg.evaluate('FMLABHorde.debug.pick(0)')
        elif st(pg)['modal'] is None and pg.evaluate('FMLABHorde.debug.state().level') >= lv + 8: break
        pg.wait_for_timeout(180)
    for _ in range(20):
        if st(pg)['modal'] != 'level': break
        pg.evaluate('FMLABHorde.debug.pick(0)'); pg.wait_for_timeout(180)
    s = st(pg)
    check('Orda: la creatura si evolve durante la partita', s['species'] == 'braciolo' and s['effLevel'] >= 12, f"{s['species']} Lv {s['effLevel']}")
    # Ultimate
    pg.evaluate('FMLABHorde.debug.spawn(40)'); pg.wait_for_timeout(800)
    before = st(pg)['kills']
    pg.evaluate('FMLABHorde.debug.charge(1)'); pg.wait_for_timeout(150)
    check('Orda: il tasto Ultimate si accende quando la barra è piena', pg.locator('#hzUlt.ready').count() == 1)
    pg.locator('#hzUlt').click(force=True); pg.wait_for_timeout(260)  # pulsa: force evita l'attesa di "fermo"
    pg.screenshot(path=OUT + 'h04-ultimate.png')
    pg.wait_for_timeout(500)
    s = st(pg)
    check('Orda: l\'Ultimate spazza via i nemici vicini (e non si ricarica da sola)', s['kills'] >= before + 10 and s['ult'] < 0.5, f"sconfitti {before} -> {s['kills']}")
    # boss Guardiano
    pg.evaluate("FMLABHorde.debug.wave(10); FMLABHorde.debug.boss('guardian')"); pg.wait_for_timeout(1500)
    s = st(pg)
    check('Orda: arriva il Guardiano con la sua barra dei PS', s['boss'] is not None and 'Flora' in s['boss']['title'] and pg.locator('#hzBoss').is_visible(), json.dumps(s['boss']))
    pg.screenshot(path=OUT + 'h05-guardiano.png')
    # 120 nemici: prestazioni
    pg.evaluate('FMLABHorde.debug.spawn(140)'); pg.wait_for_timeout(1500)
    f0 = pg.evaluate('FMLAB3D.stats.frames'); pg.wait_for_timeout(2000); f1 = pg.evaluate('FMLAB3D.stats.frames')
    s = st(pg)
    print('PRESTAZIONI', s['enemies'], 'nemici,', round((f1 - f0) / 2, 1), 'fps nel browser di prova senza GPU,', s['tris'], 'triangoli,', round(s['cpuMs'], 1), 'ms di calcolo JS per fotogramma')
    check('Orda: regge 120 nemici contemporanei senza errori', s['enemies'] >= 110 and not errs, f"{s['enemies']} nemici")
    pg.screenshot(path=OUT + 'h06-120-nemici.png')
    # pausa
    pg.click('#hzPause'); pg.wait_for_timeout(200)
    check('Orda: la pausa ferma il gioco', st(pg)['paused'] and st(pg)['modal'] == 'pause')
    t1 = st(pg)['time']; pg.wait_for_timeout(500)
    check('Orda: in pausa il tempo non scorre', abs(st(pg)['time'] - t1) < 0.01)
    pg.click('#hzResume'); pg.wait_for_timeout(200)
    # fine partita
    pg.evaluate('FMLABHorde.debug.kill()')
    check('Orda: quando i PS finiscono appare il riepilogo', wait_for(pg, "FMLABHorde.debug.state().over", 20000) and pg.locator('#hzAgain').count() == 1)
    check('Orda: il punteggio va in classifica', wait_for(pg, "FMLABHorde.debug.state().sent && document.getElementById('hzLb').textContent.indexOf('Francesco') >= 0", 20000) and 'Francesco' in pg.inner_text('#hzLb'), pg.inner_text('#hzLb')[:80])
    pg.wait_for_timeout(300); pg.screenshot(path=OUT + 'h07-risultati.png')
    res = st(pg)['result']
    pg.click('#hzMap'); pg.wait_for_timeout(600)
    xp1 = pg.evaluate(f"FMLAB.save.team.find(m => m.uid === '{uid0}').xp")
    check('Orda: tornando alla mappa l\'esperienza va alla creatura usata', pg.evaluate('FMLAB.screen') == 'map' and xp1 == xp0 + res['xp'] and res['xp'] > 0, f"xp {xp0} -> {xp1} (+{res['xp']})")
    check('Orda: record salvato nel salvataggio', pg.evaluate('FMLAB.save.hordeBest') == res['score'], str(res['score']))
    r = pg.evaluate("FMLAB.serverMode() === 'locale' ? JSON.parse(localStorage.getItem('fmlab-srv-horde_lb') || '{}') : {}")
    check('Orda: classifica del server con il punteggio', 'Francesco' in r and r['Francesco']['s'] == res['score'], json.dumps(r)[:80])
    # orizzontale
    l = b.new_context(viewport={'width': 844, 'height': 390}, device_scale_factor=2, is_mobile=True, has_touch=True)
    l.add_init_script("window.__FMLAB_NOSTORY = true")
    lp = l.new_page(); lp.on('pageerror', lambda e: errs.append('L: ' + str(e)))
    lp.goto(BASE); lp.wait_for_timeout(300)
    lp.evaluate("FMLAB3D.quality = 'alta'; FMLAB.debug.encounterRate = 0; FMLAB.newGame('Sara', 'goccino')"); lp.wait_for_timeout(300)
    lp.click('#mHorde'); lp.wait_for_timeout(600); lp.screenshot(path=OUT + 'h08-orizzontale-scelta.png')
    lp.click('#hzGo'); lp.wait_for_timeout(400)
    lp.evaluate('FMLABHorde.debug.god = true; FMLABHorde.debug.spawn(50)')
    lp.mouse.move(650, 250); lp.mouse.down(); lp.mouse.move(600, 200, steps=5); lp.wait_for_timeout(1500); lp.mouse.up()
    s = st(lp)
    check('Orda in orizzontale: il joystick funziona anche a destra', s['x'] < -0.8 and s['z'] < -0.8, f"x {s['x']:.2f} z {s['z']:.2f}")
    wait_for(lp, 'FMLABHorde.debug.state().kills >= 3', 12000)
    lp.screenshot(path=OUT + 'h09-orizzontale-ondata.png')
    lp.evaluate('FMLABHorde.debug.levelUp(1)'); wait_for(lp, "FMLABHorde.debug.state().modal === 'level'")
    lp.screenshot(path=OUT + 'h10-orizzontale-potenziamento.png')
    check('Orda in orizzontale: scelta dei potenziamenti leggibile', lp.locator('.hz-choice').count() == 3 and lp.locator('.hz-card').bounding_box()['height'] <= 390)
    check('Orda: nessun errore JavaScript', not errs, '; '.join(errs[:3]))
    b.close()
print(f"\nRISULTATO: {sum(results)} PASS, {len(results) - sum(results)} FAIL")
