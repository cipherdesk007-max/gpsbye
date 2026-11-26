# FMLAB CarPlay

App personale per vedere video e lo schermo dell'iPhone su CarPlay, da installare con **SideStore** come app a sé (non dentro LiveContainer: CarPlay legge la scena dichiarata nell'`Info.plist` dell'app installata).

## Base e licenze

- **Base:** [TDS-Carplay](https://github.com/thomasdye12/TDS-Carplay) di Thomas Dye, tag `1.2.5` (lo stesso dell'IPA *TDS Video 1.5*).
  La sua licenza consente solo l'**uso personale e non commerciale** e **vieta la ridistribuzione**: questa app non va pubblicata (Senumy compreso) senza il suo permesso.
- In arrivo: funzioni YouTube da [CarTube](https://github.com/Avangelista/CarTube) (GPLv3).

## Cosa cambia rispetto a TDS 1.2.5

- Nome **FMLAB CarPlay**, bundle ID `it.fmlab.carplay`, icona FMLAB.
- Nell'IPA restano solo le estensioni di registrazione schermo (specchiatura): con un Apple ID gratuito servono 3 App ID invece di 6.
- Firma ad-hoc con i permessi CarPlay incorporati, come l'IPA originale; SideStore rifirma con il tuo Apple ID.

## Limiti noti

- Netflix, Prime Video, Disney+, DAZN, NOW: protetti da DRM, su CarPlay il video è nero.
- Guardare video mentre si guida è vietato: usala da fermo o per i passeggeri.

## Build

GitHub Actions (`.github/workflows/build-ipa.yml`) compila su macOS con Xcode 16.4, pubblica l'IPA come release `build-<commit>` e allega screenshot dal simulatore iPhone.
