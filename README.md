# FMLAB CarPlay

App personale per vedere video e lo schermo dell'iPhone su CarPlay, da installare con **SideStore** come app a sé (non dentro LiveContainer: CarPlay legge la scena dichiarata nell'`Info.plist` dell'app installata).

## Base e licenze

- **Base:** [TDS-Carplay](https://github.com/thomasdye12/TDS-Carplay) di Thomas Dye, tag `1.2.5` (lo stesso dell'IPA *TDS Video 1.5*).
  La sua licenza consente solo l'**uso personale e non commerciale** e **vieta la ridistribuzione**: questa app non va pubblicata (Senumy compreso) senza il suo permesso.
- Script YouTube da [CarTube](https://github.com/Avangelista/CarTube): AdGuard Block YouTube Ads (GPLv3) e Simple Sponsor Skipper (AGPLv3); licenza in `licenses/`.

## Funzioni FMLAB

- **Schermata iPhone in italiano** con auto rilevata (nome dal collegamento CarPlay, tipo di collegamento, dimensione schermo, velocità GPS).
- **Blocco di guida**: sopra la soglia (default 5 km/h) il video sull'auto va in pausa e resta l'audio; si sblocca dopo 4 s da fermo.
- **Modalità passeggero**: tiene il video visibile in marcia, con conferma; vale solo per il viaggio e si spegne quando CarPlay si scollega.
- **Chiamate**: durante una chiamata lo schermo FMLAB mostra "Chiamata in corso".
- **Sfondi**: Campagna, Metropoli notturna, Synthwave, Fantasy, oppure un'immagine dal rullino; ancorati in basso per non tagliare il logo sugli schermi 8:3.
- **App sul telefono**: elenco personalizzabile (aggiungi, elimina, riordina) per aprire le app da mostrare con la specchiatura; quelle con DRM sono segnalate.

- **Home FMLAB sullo schermo dell'auto** (1.4): orologio, data, riquadri grandi per specchiatura, YouTube, browser, sfondo e le tue app; passa da sola alla specchiatura quando la avvii.
- **Telecomando auto** sull'iPhone: Home, Schermo, YouTube, Web, sfondo successivo; funziona anche se l'auto non passa i tocchi.
- **YouTube senza pubblicità e sponsor** nel browser dell'auto (script AdGuard e SponsorBlock da CarTube).
- **App installate trovate da sola** (1.3): catalogo di 46 app controllate con `canOpenURL`.

- **Siri e Comandi** (1.5): «Ehi Siri, home / YouTube / schermo / cambia sfondo in FMLAB CarPlay», senza estensioni.
- **Notte** (1.5): con l'auto in modalità scura lo sfondo si scurisce.

## Correzioni rispetto a TDS 1.2.5

- **Schermata di pagamento** dopo la 5ª apertura: disattivata come nella versione attuale di TDS (`paymentGateDisabled = true`).
- **Invio dati al server TDS** (ID, numero di aperture, posizione GPS) 30 s dopo l'avvio: disattivato.
- GPS sempre acceso anche lontano dall'auto: ora solo con CarPlay collegato o app aperta.
- App avviata dall'auto senza aprire l'iPhone: il blocco di guida non partiva.

- Con la specchiatura attiva, browser e video tornavano subito alla specchiatura: ora restano.
- La stessa vista veniva registrata a ogni ritorno alla specchiatura e ogni fotogramma era disegnato più volte.
- Messaggi dei permessi di prova ("test", "t3wrt") e richiesta posizione fuorviante.
- Posizione in background mancante: il blocco di guida si fermava aprendo un'altra app.

## Cosa cambia rispetto a TDS 1.2.5

- Nome **FMLAB CarPlay**, bundle ID `it.fmlab.carplay`, icona FMLAB.
- Nell'IPA restano solo le estensioni di registrazione schermo (specchiatura): con un Apple ID gratuito servono 3 App ID invece di 6.
- Firma ad-hoc con i permessi CarPlay incorporati, come l'IPA originale; SideStore rifirma con il tuo Apple ID.

## Limiti noti

- Netflix, Prime Video, Disney+, DAZN, NOW: protetti da DRM, su CarPlay il video è nero.
- Guardare video mentre si guida è vietato: usala da fermo o per i passeggeri.

## Build

GitHub Actions (`.github/workflows/build-ipa.yml`) compila su macOS con Xcode 16.4, pubblica l'IPA come release `build-<commit>` e allega screenshot dal simulatore iPhone.
