"""Prova dei modelli animati (game/models.js): creature, shiny, animazioni, personaggi, budget triangoli.
Uso: python3 -m http.server 8782 (dalla radice) e poi FMLAB_PORT=8782 python3 tests/test-models.py
Facoltativo: FMLAB_OUT=cartella/ per salvare le foto.
"""
import os, json
from playwright.sync_api import sync_playwright

PORT = os.environ.get('FMLAB_PORT', '8782')
OUT = os.environ.get('FMLAB_OUT', '')
BASE = f'http://localhost:{PORT}/game/index.html'
results = []


def check(name, ok, detail=''):
    results.append(bool(ok))
    print(('PASS ' if ok else 'FAIL ') + name + (f'  [{detail}]' if detail else ''))


# renderer finto: conta i disegni e controlla che le matrici siano numeri veri
FAKE_R = """
window.__fake = { calls: 0, bad: 0, tris: 0, tinted: 0,
  draw(m, M, o) { this.calls++; this.tris += m.n / 3; for (let i = 0; i < 16; i++) if (!isFinite(M[i])) { this.bad++; break; } if (o && o.tint) this.tinted++; } };
"""

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 1000, 'height': 420}, device_scale_factor=1)
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(BASE)
    pg.wait_for_timeout(500)
    check('models.js caricato e agganciato', pg.evaluate("!!window.FMLABModels && !!FMLAB3D.hooks.drawCreature && !!FMLAB3D.hooks.trainer"))
    species = pg.evaluate("Object.keys(FMLABEngine.SPECIES)")
    check('Tutte le 15 specie hanno un modello', sorted(species) == sorted(pg.evaluate("FMLABModels.species")), str(len(species)))

    # budget triangoli
    budget = {1: 2300, 2: 2600, 3: 3000}
    over = []
    for sp in species:
        st = pg.evaluate(f"FMLABEngine.SPECIES['{sp}'].stage")
        for suf in ('', '*'):
            t = pg.evaluate(f"FMLABModels.trisOf('{sp}{suf}')")
            if t > budget[st]:
                over.append(f'{sp}{suf}={t}')
    check('Budget triangoli delle creature rispettato', not over, ', '.join(over) or 'tutte dentro')
    looks = pg.evaluate("FMLABModels.looks")
    htris = {l: pg.evaluate(f"FMLABModels.trisOf('umano:{l}')") for l in looks}
    check('Budget triangoli dei personaggi (≤ 2000)', max(htris.values()) <= 2000, json.dumps(htris))
    check('11 aspetti di personaggio', len(looks) == 11, ','.join(looks))

    # ogni specie, normale e shiny, con ogni animazione: niente errori né matrici rotte
    pg.evaluate(FAKE_R)
    bad = pg.evaluate("""(() => {
      const H = FMLAB3D.hooks, K = FMLAB3D.kit, out = [];
      const acts = ['idle', 'walk', 'attack', 'hit', 'faint', 'sleep'];
      for (const sp of Object.keys(FMLABEngine.SPECIES)) for (const sh of [false, true]) for (const a of acts) for (const since of [0, 0.2, 0.45, 1]) {
        const before = window.__fake.calls;
        const ok = H.drawCreature(window.__fake, sp, sh, K.mat([0, 0, 0], [0.3, 0, 0], 1), {}, { t: 3 + since, action: a, phase: 1, where: 'battle', since });
        if (!ok || window.__fake.calls === before) out.push(sp + (sh ? '*' : '') + ':' + a);
      }
      return { out, bad: window.__fake.bad, err: H.error || '' };
    })()""")
    check('Tutte le specie × shiny × 6 animazioni si disegnano', not bad['out'] and not bad['err'], ','.join(bad['out'][:6]) + bad['err'][:120])
    check('Nessuna matrice con numeri rotti (NaN)', bad['bad'] == 0, str(bad['bad']))

    # palpebre: in 10 secondi ogni specie chiude gli occhi almeno una volta, e nel sonno restano chiusi
    blink = pg.evaluate("""(() => {
      const H = FMLAB3D.hooks, K = FMLAB3D.kit, res = {};
      for (const sp of Object.keys(FMLABEngine.SPECIES)) {
        let closed = 0;
        for (let t = 0; t < 10; t += 0.03) { window.__fake.tinted = 0; H.drawCreature(window.__fake, sp, false, K.mat(), {}, { t, action: 'idle', phase: 0 }); if (window.__fake.tinted) closed++; }
        window.__fake.tinted = 0; H.drawCreature(window.__fake, sp, false, K.mat(), {}, { t: 5, action: 'sleep', phase: 0 });
        res[sp] = [closed, window.__fake.tinted];
      }
      return res;
    })()""")
    noblink = [k for k, v in blink.items() if v[0] == 0]
    awake = [k for k, v in blink.items() if v[1] < 2]
    check('Ogni creatura sbatte le palpebre', not noblink, ','.join(noblink))
    check('Nel sonno gli occhi restano chiusi', not awake, ','.join(awake))

    # personaggi: camminata e fermi, ogni aspetto
    hb = pg.evaluate("""(() => {
      const H = FMLAB3D.hooks, out = [];
      for (const l of FMLABModels.looks) for (const mv of [false, true]) {
        const before = window.__fake.calls;
        H.trainer(window.__fake, l, [0, 0, 0], 0.5, 3.1, mv, 1.25, 2.5);
        if (window.__fake.calls - before < 10) out.push(l + (mv ? ' cammina' : ''));
      }
      return { out, bad: window.__fake.bad };
    })()""")
    check('Tutti i personaggi si disegnano (fermi e mentre camminano)', not hb['out'] and hb['bad'] == 0, ','.join(hb['out']))
    # la camminata muove davvero le gambe
    legs = pg.evaluate("""(() => {
      const H = FMLAB3D.hooks, ys = [];
      for (const w of [0, 1.6]) { const pos = []; const R = { draw(m, M) { pos.push(M[13]); } }; H.trainer(R, 'hero', [0, 0, 0], 0, w, true, 1.25, 1); ys.push(pos); }
      let diff = 0; for (let i = 0; i < ys[0].length; i++) diff = Math.max(diff, Math.abs(ys[0][i] - ys[1][i]));
      return diff;
    })()""")
    check('La camminata muove gambe e braccia', legs > 0.01, f'{legs:.3f}')

    # disegno vero in WebGL: vetrina di tutte le specie normali e shiny
    pg.evaluate("document.body.insertAdjacentHTML('beforeend', '<div id=st style=\"position:fixed;inset:0;z-index:99;background:linear-gradient(#7cc4ff,#e9f6ff)\"></div>'); FMLAB3D.quality='alta'")
    for k in range(3):
        for suf in ('', '*'):
            ids = [s + suf for s in species[k * 5:k * 5 + 5]]
            pg.evaluate(f"(() => {{ const sc = FMLAB3D.createShowcase({json.dumps(ids)}, {{ gap: 1.7 }}); FMLAB3D.mount(document.getElementById('st'), sc); }})()")
            pg.wait_for_timeout(700)
            if OUT:
                os.makedirs(OUT, exist_ok=True)
                pg.screenshot(path=f"{OUT}vetrina{'-shiny' if suf else ''}-{k + 1}.png")
    check('Vetrina WebGL di tutte le specie (normali e shiny) senza errori', not errs and not pg.evaluate("FMLAB3D.hooks.error || ''"), '; '.join(errs)[:200])

    # in mappa: gli 11 personaggi che camminano come abitanti
    m = b.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=1, is_mobile=True, has_touch=True)
    m.on('pageerror', lambda e: errs.append('M: ' + str(e)))
    m.add_init_script("window.__FMLAB_NOSTORY = true")
    m.goto(BASE); m.wait_for_timeout(300)
    m.evaluate("localStorage.clear(); FMLAB.debug.encounterRate = 0; FMLAB.debug.noLife = true; FMLAB.newGame('Prova','fiammino')")
    m.wait_for_timeout(400)
    m.evaluate("""(() => { FMLAB.life.npcs.length = 0; FMLABModels.looks.forEach((l, i) => FMLAB.life.npcs.push({ key: 'p' + i, name: l, look: l, x: 9 + (i % 6) * 2, y: 49 + Math.floor(i / 6) * 2, hx: 9 + (i % 6) * 2, hy: 49 + Math.floor(i / 6) * 2, say: 0, lines: ['ciao'] })); })()""")
    m.wait_for_timeout(2500)
    if OUT:
        m.screenshot(path=f'{OUT}mappa-personaggi.png')
    check('Gli 11 personaggi camminano in mappa senza errori', not errs and not m.evaluate("FMLAB3D.hooks.error || ''"), '; '.join(errs)[:200])
    b.close()

print(f"\nRISULTATO: {sum(results)} PASS, {len(results) - sum(results)} FAIL")
