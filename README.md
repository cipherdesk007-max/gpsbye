# FMLAB Monsters

Gioco per telefono di creature da catturare, allenare e far sfidare tra amici.
Creature, nomi, disegni e regole sono **originali FMLAB**: nessun dato, modello o grafica di altri giochi.

## Cosa c'è

- **15 creature originali** in 6 tipi (Fuoco, Acqua, Erba, Elettro, Roccia, Ombra), con evoluzioni a 2 o 3 stadi.
- **Mappa** con 4 zone (Borgo FMLAB, Prato Ventoso, Bosco Fitto, Grotta Cupa), erba alta con incontri e Centro FMLAB che cura la squadra.
- **Lotte a turni** con efficacia dei tipi, colpi critici, precisione, esperienza, livelli e nuove mosse.
- **Cattura con le capsule**: più la creatura è ferita, più è facile.
- **Squadra da 6 + box**, **Archivio** con viste e catturate.
- **Sfide tra amici** con codice di 5 caratteri e **classifica**, tramite Google Apps Script.

## Grafica 3D

`game/gl3d.js` è un motore 3D scritto da zero in WebGL (nessuna libreria, nessun file grafico esterno):

- **Creature** modellate dal codice a partire da specie, tipo e stadio: corpo, occhi, arti e il tratto del tipo (fiamme che tremolano, pinne, foglie, antenne luminose, punte di roccia, coda spettrale). Più dettagli a ogni evoluzione.
- **Lotte** in 4 arene (prato, bosco, grotta, arena delle sfide) con entrata della camera, salto d'attacco, proiettile e particelle del tipo, lampo e scossa sul colpo, critici, schivata, svenimento, lancio della capsula con risucchio, oscillazioni e stelle.
- **Mappa** 3D con erba che ondeggia, acqua che si muove, alberi, rocce e cristalli, Centro FMLAB e Laboratorio, atmosfera che cambia per zona. Il personaggio cammina e la prima creatura della squadra lo segue.
- **Archivio** con visore 3D da girare col dito.
- **Tutto schermo**, in verticale e in orizzontale: mappa e lotta occupano tutto lo schermo e i comandi stanno sopra, semitrasparenti. Col telefono girato i comandi della lotta passano sulla destra e la camera inquadra la parte libera.
- **Camera viva**: sulla mappa è inclinata e si gira di 90° col tasto ⟳ (le frecce seguono la visuale); in lotta gira piano attorno al campo e cambia inquadratura quando uno attacca, a ogni cattura e quando una creatura va KO.
- **Come un'app**: su iPhone, Safari → Condividi → «Aggiungi alla schermata Home» apre il gioco senza barre, con l'icona FMLAB. Su Android c'è anche il tasto ⛶ per lo schermo intero.
- Una sola tela WebGL condivisa fra le schermate. Senza WebGL (o con `?2d` nell'indirizzo) il gioco usa i disegni 2D.

## Struttura

```
game/
  index.html, style.css   pagina del gioco
  engine.js               motore: creature, tipi, mosse, danni, cattura, lotta deterministica
  server-core.js          logica delle sfide (stanze, turni, classifica) — uguale su server e telefono
  art.js                  disegni SVG delle creature
  game.js                 schermate, mappa, lotte, sfide
backend/
  Code.gs, appsscript.json   server Google Apps Script
  dist/                      file pronti da caricare (creati da scripts/build-apps-script.sh)
tests/
  test-engine.js, test-server.js
```

## Provarlo sul computer

```
python3 -m http.server 8765
```
poi apri `http://localhost:8765/game/index.html`. Senza URL del server le sfide girano in **modalità locale**: per provarle apri il gioco in due schede dello stesso browser.

## Mettere online le sfide (Google Apps Script)

1. `bash scripts/build-apps-script.sh` → prepara `backend/dist/`.
2. Vai su script.google.com → **Nuovo progetto**.
3. Crea tre file e incolla il contenuto di `Code.gs`, `engine.gs` e `servercore.gs` da `backend/dist/`. In *Impostazioni progetto* attiva «Mostra il file manifest» e incolla `appsscript.json`.
4. **Esegui il deployment › Nuovo deployment › App web**: *Esegui come* = Me, *Chi ha accesso* = Chiunque.
5. Copia l'URL che finisce con `/exec`.
6. Nel gioco: **Sfide › Server**, incolla l'URL, «Salva e prova». Devi vedere «Collegato ✓».
7. I tuoi amici fanno lo stesso con **lo stesso URL**. Uno crea la sfida, l'altro inserisce il codice.

Le stanze vivono nelle proprietà dello script (niente fogli Google da preparare) e si cancellano da sole dopo 24 ore. La funzione `azzeraTutto` nell'editor azzera stanze e classifica.

## Anti-imbroglio

- Il **server risolve ogni turno** con lo stesso motore del gioco: i telefoni mandano solo la mossa scelta.
- Le squadre ricevute vengono **controllate** (statistiche coerenti col livello, mosse davvero imparate, creature esistenti) e in sfida partono tutte a vita piena.
- Mosse ripetute o vecchie vengono ignorate; due mosse contemporanee sono messe in fila con `LockService`.

## Test

Test nel browser (Playwright): 20 controlli, compresi 3D attivo, visore, orizzontale, visuale girata e riserva 2D.


```
node tests/test-engine.js     # motore: tipi, crescita, evoluzioni, danni, cattura, determinismo, anti-imbroglio
node tests/test-server.js     # server Apps Script simulato: stanze, turni, classifica, limiti di Google
```
