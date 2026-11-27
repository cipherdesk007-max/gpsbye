#!/usr/bin/env python3
"""Legge i risultati della prova automatica dentro l'app (due avvii) e decide se è andata bene."""
import json, sys

def leggi(path):
    res, errs = None, []
    for line in open(path, encoding='utf-8', errors='replace'):
        if 'AUTOTEST {' in line:
            res = json.loads(line[line.index('{'):].strip())
        elif 'ERRORE' in line:
            errs.append(line.strip())
    return res, errs

ok = True
for i, path in enumerate(sys.argv[1:], 1):
    res, errs = leggi(path)
    print(f'--- avvio {i}: {path}')
    if res is None:
        print('nessun risultato AUTOTEST (l\'app non ha caricato il gioco?)'); ok = False; continue
    print(json.dumps(res, indent=1, ensure_ascii=False))
    for e in errs[:10]: print('  ', e)
    if not res.get('ok'): ok = False
    if i == 2 and res.get('prev') != 'ok':
        print('il salvataggio del primo avvio non c\'è più dopo il riavvio'); ok = False
print('RISULTATO:', 'OK' if ok else 'FALLITO')
sys.exit(0 if ok else 1)
