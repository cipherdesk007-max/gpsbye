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

## Regole di lotta

- **Talenti**: ogni creatura nasce con 4 talenti da 0 a 15 (PS, Attacco, Difesa, Velocità). 8 è la media; al livello 50 un talento da 15 vale circa +7 punti, uno da 0 circa -8.
- **Carattere**: 10 caratteri. Sei alzano una statistica del 10% e ne abbassano un'altra del 10% (Audace, Tenace, Calmo, Prudente, Svelto, Vivace); quattro sono neutri (Docile, Serio, Tranquillo, Allegro).
- **Rare** (shiny): 1 creatura su 512 nasce con colori rari. Stesse statistiche, si vede solo l'aspetto.
- **Stati**:
  - Bruciatura: attacco dimezzato, -1/16 di PS a fine turno; il tipo Fuoco ne è immune.
  - Veleno: -1/8 di PS a fine turno.
  - Paralisi: velocità dimezzata, 1 volta su 4 non si muove; il tipo Elettro ne è immune.
  - Sonno: da 1 a 3 turni fermo, poi si sveglia e agisce subito.
  - Le creature addormentate sono il doppio più facili da catturare, quelle con gli altri stati 1,5 volte.
- **Mosse nuove**: 12, tra cui le mosse di stato (Ustione, Ronzio, Polline, Ninnananna), quelle che danneggiano con una probabilità di causare uno stato (Fiammella, Corrente, Spine, Fiele) e quelle con priorità, che partono per prime (Guizzo, Lampo, Getto Rapido, Scheggia).
- **IA degli avversari** su 3 livelli:
  - Facile: sceglie a caso.
  - Normale: usa la mossa più forte sul tipo.
  - Esperto: calcola il danno vero, finisce l'avversario con la mossa più sicura, usa gli stati quando conviene e cambia creatura se è svantaggiata. Nei test vince il 90% delle lotte contro la Facile.
- I salvataggi vecchi restano validi: una creatura senza talenti conta come talenti 8 e carattere neutro, con statistiche identiche a prima.

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

## Mettere online il gioco (Google Apps Script)

Un solo link Google fa tutto: apre il gioco sul telefono ed è il server delle sfide, della Sala Online e della classifica.

1. `node scripts/build-web.js` → prepara `backend/dist/` (5 file).
2. Vai su script.google.com → **Nuovo progetto** e chiamalo «FMLAB Monsters».
3. Nel progetto crea e incolla:
   - file script `Code.gs`, `engine.gs`, `servercore.gs`;
   - file HTML chiamato `Index` (diventa `Index.html`) col contenuto di `backend/dist/Index.html`;
   - in *Impostazioni progetto* attiva «Mostra il file manifest» e incolla `appsscript.json`.
4. **Esegui il deployment › Nuovo deployment › App web**: *Esegui come* = Me, *Chi ha accesso* = Chiunque. Google ti chiede di autorizzare lo script la prima volta.
5. Copia l'URL che finisce con `/exec` e mandalo ai tuoi amici. Aperto dal telefono è già il gioco online: niente URL da incollare.
6. Su iPhone: Safari → Condividi → «Aggiungi alla schermata Home». Su Android: menu di Chrome → «Aggiungi a schermata Home».
7. Per le app IPA/APK: su GitHub, *Settings › Variables › Actions* crea `FMLAB_SERVER_URL` con lo stesso URL `/exec`, poi *Actions › App › Run workflow*.

Ogni volta che cambi il gioco: rifai il punto 1, reincolla i file e **Gestisci deployment › Modifica › Nuova versione** (l'URL resta lo stesso).

Stanze, presenze e inviti vivono nelle proprietà dello script (niente fogli Google) e si cancellano da soli (stanze dopo 24 ore, presenze dopo 10 minuti, inviti dopo 10 minuti). La funzione `azzeraTutto` nell'editor azzera tutto.

## Anti-imbroglio

Il server controlla anche talenti (interi 0–15), carattere e rarità: statistiche che non tornano con talenti e carattere vengono rifiutate.

- Il **server risolve ogni turno** con lo stesso motore del gioco: i telefoni mandano solo la mossa scelta.
- Le squadre ricevute vengono **controllate** (statistiche coerenti col livello, mosse davvero imparate, creature esistenti) e in sfida partono tutte a vita piena.
- Mosse ripetute o vecchie vengono ignorate; due mosse contemporanee sono messe in fila con `LockService`.

## Test

Test nel browser (Playwright): 20 controlli, compresi 3D attivo, visore, orizzontale, visuale girata e riserva 2D.


```
node tests/test-engine.js     # motore: tipi, crescita, evoluzioni, danni, cattura, determinismo, anti-imbroglio
node tests/test-server.js     # server Apps Script simulato: stanze, turni, classifica, limiti di Google
```
