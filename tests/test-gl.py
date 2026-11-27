#!/usr/bin/env python3
"""Prova della grafica 3D: shiny, stati, aspetti dei personaggi, GLB, qualità.
Uso: python3 -m http.server 8773 (dalla radice) e poi FMLAB_PORT=8773 python3 tests/test-gl.py"""
import base64, os, subprocess, sys
from playwright.sync_api import sync_playwright
PORT = os.environ.get('FMLAB_PORT', '8773')
OUT = os.environ.get('FMLAB_OUT', '/tmp/team-grafica/')
os.makedirs(OUT, exist_ok=True)
BASE = f'http://localhost:{PORT}/game/index.html'
here = os.path.dirname(os.path.abspath(__file__))
glb_path = os.path.join(OUT, 'albero.glb')
subprocess.run([sys.executable, os.path.join(here, 'make_glb.py'), glb_path], check=True, capture_output=True)
GLB = base64.b64encode(open(glb_path, 'rb').read()).decode()
res = []
def check(name, ok, detail=''):
    res.append(ok); print(('PASS ' if ok else 'FAIL ') + name + (f'  [{detail}]' if detail else ''))
STAGE = """(() => { document.body.innerHTML = '<div id=st style="position:fixed;inset:0;background:linear-gradient(#4fb0ff,#dff3ff 62%)"></div>'; return document.getElementById('st'); })()"""
with sync_playwright() as p:
    b = p.chromium.launch()
    errs = []
    def page(w=390, h=844):
        pg = b.new_page(viewport={'width': w, 'height': h}, device_scale_factor=2)
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(BASE); pg.wait_for_timeout(300)
        pg.evaluate("FMLAB3D.quality = 'alta'")      # foto nitide: niente qualità automatica nel browser senza GPU
        return pg
    # 1) lotta con shiny: pioggia di scintille all'entrata
    pg = page()
    pg.evaluate(STAGE + """; window.sc = FMLAB3D.createBattleScene({ arena: 'prato', hour: 12 });
      sc.setMon('me', 'goccino'); sc.setMon('foe', 'fiammino', { shiny: true }); FMLAB3D.mount(document.getElementById('st'), sc);""")
    pg.wait_for_timeout(1500); pg.screenshot(path=OUT + 'g01-shiny-entrata.png')
    pg.wait_for_timeout(1200); pg.screenshot(path=OUT + 'g02-shiny-lotta.png')
    check('Lotta con creatura shiny', pg.evaluate("sc.actors.foe.shiny && sc.actors.foe.key === 'fiammino*'"))
    # 2) stati
    pg.evaluate("sc.setMon('me', 'goccino', { force: true, enter: false }); sc.status('foe', 'brn'); sc.status('me', 'par')"); pg.wait_for_timeout(220); pg.screenshot(path=OUT + 'g03-stato-lampo.png')
    pg.wait_for_timeout(1400); pg.screenshot(path=OUT + 'g04-bruciatura-paralisi.png')
    pg.evaluate("sc.status('foe', 'slp'); sc.status('me', 'psn')"); pg.wait_for_timeout(1800); pg.screenshot(path=OUT + 'g05-sonno-veleno.png')
    check('Stati in lotta', pg.evaluate("sc.actors.foe.status === 'slp' && sc.actors.me.status === 'psn'"))
    pg.evaluate("sc.status('foe', null); sc.status('me', 'boh')")
    check('Stato annullato e stato sconosciuto ignorato', pg.evaluate("sc.actors.foe.status === null && sc.actors.me.status === null"))
    pg.close()
    # 3) vetrina normale vs shiny
    pg = page(390, 300)
    pg.evaluate(STAGE + """; FMLAB3D.mount(document.getElementById('st'), FMLAB3D.createShowcase(['fiammino','fiammino*','goccino','goccino*'], { gap: 1.3 }))""")
    pg.wait_for_timeout(1300); pg.screenshot(path=OUT + 'g06-vetrina-shiny-1.png')
    pg.evaluate("FMLAB3D.mount(document.getElementById('st'), FMLAB3D.createShowcase(['semino*','voltino*','sassetto*','ombrino*'], { gap: 1.3 }))")
    pg.wait_for_timeout(1300); pg.screenshot(path=OUT + 'g07-vetrina-shiny-2.png')
    pg.evaluate("FMLAB3D.mount(document.getElementById('st'), FMLAB3D.createShowcase(['vulkarn*','abissaro*','silvatron*','fulmix*','granitor*','spettrax*'], { gap: 1.25 }))")
    pg.wait_for_timeout(1300); pg.screenshot(path=OUT + 'g08-vetrina-shiny-finali.png')
    svg = pg.evaluate("[FMLABArt.monsterSVG('fiammino', {size:60}), FMLABArt.monsterSVG('fiammino', {size:60, shiny:true})]")
    check('SVG shiny diverso dal normale, con stellina', svg[0] != svg[1] and 'fff59d' in svg[1])
    pg.close()
    # 4) i 7 aspetti dei personaggi sulla mappa
    pg = page()
    pg.evaluate("""(() => { localStorage.clear(); FMLAB.debug.hour = 12; FMLAB.debug.noLife = true; FMLAB.newGame('Prova','goccino'); })()""")
    pg.wait_for_timeout(400)
    pg.evaluate("""(() => { document.querySelectorAll('.hud,.controls,.toast').forEach(e => e.style.display='none');
      const looks = ['rivale','prof','guardiano_prato','guardiano_fiume','guardiano_bosco','guardiano_grotta','campione'];
      window.ms = FMLAB3D.createMapScene({ world: FMLAB.world, getHour: () => 12 });
      ms.setPlayer(15, 54, true); ms.setFollower('goccino*');
      ms.setEntities(looks.map((l, i) => ({ key: l, kind: 'npc', look: l, x: i < 4 ? 12 + i : 9 + i, y: i < 4 ? 51 : 53, yaw: 0.38, alert: i % 3 === 0 })));
      FMLAB3D.mount(document.getElementById('map3d'), ms); })()""")
    pg.evaluate("document.querySelectorAll('.toast').forEach(e => e.remove())")
    pg.wait_for_timeout(1800); pg.screenshot(path=OUT + 'g09-personaggi.png')
    pg.evaluate("ms.setEntities([{ key:'m1', kind:'mon', id:'voltino', shiny:true, x:14, y:53 }, { key:'m2', kind:'mon', id:'voltino', x:16, y:53 }])"); pg.wait_for_timeout(1500)
    pg.screenshot(path=OUT + 'g10-mappa-shiny.png')
    check('Entità mappa shiny e normali insieme', pg.evaluate("ms.ents.get('m1').shiny === true && !ms.ents.get('m2').shiny"))
    pg.close()
    # 5) GLB: caricato, mostrato in vetrina e usato come albero nel mondo
    pg = page(390, 400)
    info = pg.evaluate("""(b64) => { const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
      const r = FMLAB3D.registerAsset('albero', bin); FMLAB3D.registerAsset('tree_round', bin.slice(0)); return r; }""", GLB)
    check('GLB letto (gerarchia nodi, materiali)', info['tris'] == 60 and abs(info['size'][1] - 2.05) < 0.01 and abs(info['size'][0] - 1.2) < 0.01, str(info))
    pg.evaluate(STAGE + """; FMLAB3D.mount(document.getElementById('st'), FMLAB3D.createShowcase(['asset:albero', 'fiammino'], { gap: 1.6 }))""")
    pg.wait_for_timeout(1200); pg.screenshot(path=OUT + 'g11-glb-vetrina.png')
    pg.evaluate("window.sc2 = FMLAB3D.createBattleScene({ arena: 'prato', hour: 12 }); sc2.setMon('me','semino'); sc2.setMon('foe','voltino'); FMLAB3D.mount(document.getElementById('st'), sc2)")
    pg.wait_for_timeout(1600); pg.screenshot(path=OUT + 'g12-glb-alberi-arena.png')
    check('Gli asset registrati sono elencati', 'tree_round' in pg.evaluate('FMLAB3D.assets'))
    # 6) qualità
    q = pg.evaluate("(() => { FMLAB3D.quality = 'media'; const a = FMLAB3D.quality; FMLAB3D.quality = 'xyz'; const b = FMLAB3D.quality; FMLAB3D.quality = 'auto'; return [a, b, FMLAB3D.stats.quality]; })()")
    check('Qualità leggibile e impostabile', q[0] == 'media' and q[1] == 'media', str(q))
    pg.close()
    # 7) qualità automatica: nel browser senza GPU deve scendere senza errori
    pg = b.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(BASE); pg.evaluate("localStorage.clear(); FMLAB.newGame('Q','semino')")
    seen = set()
    for _ in range(14):
        pg.wait_for_timeout(1000); seen.add(pg.evaluate('FMLAB3D.quality'))
    st = pg.evaluate('FMLAB3D.stats')
    check('Qualità automatica che si adatta ai fotogrammi', ('alta' in seen and len(seen) >= 2) or st['fps'] >= 40, f"viste {sorted(seen)}, fps {st['fps']}")
    pg.close()
    check('Nessun errore JavaScript', not errs, '; '.join(errs))
    b.close()
print(f"\nRISULTATO: {sum(res)} PASS, {len(res) - sum(res)} FAIL")
