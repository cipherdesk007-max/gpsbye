<div align="center">
  <h1>Reloc · GPSBye</h1>
  <p><strong>Strumento di simulazione della localizzazione a livello accessorio per iOS</strong></p>
  <p>
    Basato su Swift, Objective-C e Rust FFI · Iniezione di localizzazione da accessorio iAP2 / MFi-v3 / NMEA tramite loopback locale
  </p>
  <p>
    <a href="#compatibilità-di-sistema"><img src="https://img.shields.io/badge/Platform-iOS%2017.0%2B-0A84FF?style=flat-square" height="20" /></a>
    <a href="#compilazione-dai-sorgenti"><img src="https://img.shields.io/badge/Stack-Swift%20%7C%20ObjC%20%7C%20Rust-F05138?style=flat-square" height="20" /></a>
    <a href="#avvertenza-e-licenza"><img src="https://img.shields.io/badge/License-AGPL--3.0-red?style=flat-square" height="20" /></a>
  </p>
</div>

---

## Introduzione

**Reloc** è un'app di simulazione della localizzazione a livello accessorio che gira direttamente su iPhone. L'app si collega tramite il loopback locale fornito da un proxy esterno (`10.7.0.1`) al servizio di sistema `com.apple.carkit.service`, completando la negoziazione della sessione Remote Pairing / Lockdown, la sincronizzazione del canale iAP2, l'autenticazione MFi-v3 e l'invio in streaming dei messaggi NMEA-0183 (`$GPGGA` / `$GPRMC`), così che il sistema riceva coordinate in tempo reale come da un GPS accessorio standard.

> **Nota su questo repository**: è una copia localizzata in **italiano** del progetto open source [Reukix/Reloc](https://github.com/Reukix/Reloc), pubblicato sotto licenza **AGPL-3.0**. Tutte le stringhe visibili all'utente (UI, avvisi, permessi, messaggi di errore) sono state tradotte in italiano; la logica e le funzionalità sono rimaste identiche all'originale.

---

## Funzionalità principali

| Modulo | Descrizione |
| :--- | :--- |
| **Localizzazione bloccata** | Selezione del punto toccando la mappa, ricerca per parola chiave, inserimento manuale di coordinate WGS-84, geocodifica inversa multilivello (`CLGeocoder` → `Nominatim` → `BigDataCloud` come rete di sicurezza), esplorazione e aggiornamento a caldo della localizzazione durante l'esecuzione |
| **Mappe multisorsa e correzione** | Per impostazione predefinita usa **Apple Mappe (MapKit nativo)** con correzione automatica bidirezionale GCJ-02 ↔ WGS-84 per la Cina continentale; include inoltre mappe a tessere WGS-84 native senza API Key: **Strade globali (Esri) / OpenStreetMap / Satellite globale** (completamente fuori da `MKMapView`, senza marchi di fornitori); micro-deriva naturale ±0,6 m opzionale |
| **Attivazione rapida e ripristino pulito** | Dopo l'autenticazione iAP2 risveglio ritardato di `CoreLocation` + sottoscrizione a impulsi automatica `0xFFFA` + burst iniziale ad alta velocità per l'aggancio, stato dell'accessorio mostrato in tempo reale nella home; quando la cache di sistema è testarda è disponibile l'**aggiornamento con un tap dei servizi di localizzazione (conto alla rovescia flottante PiP di 5 secondi)**; all'arresto invia messaggi NMEA di invalidazione (`quality=0` / `V`) e pacchetto di reset iAP2 `RST`, risvegliando automaticamente il GPS reale del dispositivo |
| **Mantenimento attivo in background** | Mantenimento di livello navigazione + doppia garanzia audio non udibile; supporto alla ricostruzione automatica dell'asserzione in background dopo l'interruttore dei «Servizi di localizzazione», e riconnessione automatica in caso di disconnessione |
| **Abbinamento locale e importazione** | Compatibile con `.rppairing` / `.mobiledevicepairing` / `.mobilepair` / `.plist`; selettore file nativo che evita voci disattivate, importazione diretta con «Apri con Reloc»; su iOS 27+ abbinamento locale con un tap e **finestra flottante di guida Picture-in-Picture (PiP)** che mostra in tempo reale il codice di abbinamento a 6 cifre |
| **Dati e test** | Preferiti (con rinomina / eliminazione), ultimi 30 utilizzi, ripristino con un tap dopo interruzioni anomale; pannello di test `CoreLocation` integrato (`isSimulatedBySoftware` / `isProducedByAccessory`) e filtro dei log di protocollo |

---

## Compatibilità di sistema

| Dispositivo / versione | Uso quotidiano senza computer | Primo ottenimento del file di abbinamento | Note |
| :--- | :---: | :--- | :--- |
| **iPhone · iOS 27.0+** | Supportato | **Abbinamento locale con un tap** (senza computer) oppure importazione di un file esistente | Tramite `_remotepairing-pairable-host._tcp.` + finestra flottante Picture-in-Picture |
| **iPhone · iOS 17.0 – 26.x** | Supportato | **Richiede una prima esportazione via USB dal computer**, poi uso autonomo nel tempo | Prima di iOS 27 il sistema limita il primo abbinamento wireless con host sconosciuti |
| **iPad (iPadOS)** | **Non supportato** | — | iPadOS non supporta CarPlay e non fornisce il canale accessorio `com.apple.carkit.service`; all'avvio viene mostrato automaticamente l'avviso di indisponibilità |

> Reloc supporta solo **iPhone**; l'app stessa non crea VPN, il traffico di loopback (`10.7.0.1`) è fornito da uno strumento proxy esterno.

---

## Primi passi e ottenimento del file di abbinamento

### 1. Attivare il loopback locale
Attivare nello strumento proxy esterno il mapping di loopback verso `10.7.0.1`.

### 2. Ottenere e importare il file di abbinamento

#### Modalità A: abbinamento diretto locale su iOS 27+ (senza computer, consigliata)
1. Aprire la pagina **«Connessione dispositivo»** di Reloc e toccare **«Abbina questo iPhone con un tap»**: la finestra flottante di guida Picture-in-Picture si apre automaticamente.
2. Andare in **«Impostazioni → Privacy e sicurezza → Modalità sviluppatore»**, scorrere in fondo e toccare **«Abbina con Reloc»**.
3. Inserire il codice di abbinamento a 6 cifre mostrato in tempo reale nella finestra flottante: il record di abbinamento verrà salvato automaticamente.

#### Modalità B: iOS 17 – 26, prima esportazione dal computer
Collegare l'iPhone via USB e toccare **«Fidati di questo computer»**, poi esportare con uno di questi strumenti:

- **Con `idevice_pair` (consigliato, multipiattaforma)**:
  Genera ed esporta direttamente il file di abbinamento `.mobiledevicepairing` / `.plist` dopo il collegamento del dispositivo.
- **Con `pymobiledevice3` (riga di comando)**:
  ```bash
  pip3 install -U pymobiledevice3

  # Completa il primo abbinamento via USB e attiva le connessioni Wi-Fi
  pymobiledevice3 lockdown pair
  pymobiledevice3 lockdown wifi-connections on

  # Esporta il record di abbinamento salvato dal sistema (sostituire <UDID> con l'UDID del dispositivo)
  # macOS:
  sudo cp /var/db/lockdown/<UDID>.plist ~/Desktop/pairing.mobiledevicepairing
  # Windows:
  # copiare C:\ProgramData\Apple\Lockdown\<UDID>.plist
  ```

- **Importare in Reloc**:
  Dopo aver trasferito `.rppairing` / `.mobiledevicepairing` / `.mobilepair` / `.plist` sull'iPhone, l'importazione si completa in uno di questi modi:
  1. Nella pagina **«Connessione dispositivo»** di Reloc toccare **«Importa file di abbinamento esistente»** e selezionare il file;
  2. In «File / AirDrop / WeChat» toccare direttamente il file e scegliere **«Apri con Reloc»**;
  3. Oppure copiarlo in **«File → Il mio iPhone → Reloc»**: all'avvio l'app importerà automaticamente il record di abbinamento più recente.

### 3. Verificare e iniziare
Nella pagina **«Connessione dispositivo»** toccare **«Verifica connessione dispositivo»**; quando lo stato diventa **«Loopback del dispositivo pronto»** si può tornare alla pagina **«Localizzazione»** e bloccare la posizione.

> **Suggerimento per il background**: in **«Impostazioni → Privacy e sicurezza → Servizi di localizzazione → Reloc»** impostare il permesso su **«Sempre»** e tenere attiva la «Posizione precisa», per evitare che il sistema sospenda l'app quando si passa ad app di terze parti e la localizzazione si ripristini.

---

## Compilazione dai sorgenti

### Struttura di questo repository

La repo non contiene i sorgenti «spalmati»: contiene la **localizzazione italiana completa** (patch) e gli strumenti per ricostruire il progetto intero in modo verificato:

| Percorso | Contenuto |
| :--- | :--- |
| `patches/italian-1..3.patch` | Localizzazione italiana di 13 file sorgente (UI Swift, messaggi del bridge Rust, permessi) |
| `patches/CHECKSUMS.txt` | SHA-256 di ogni file del progetto finale, per la verifica integrità |
| `scripts/bootstrap.sh` | Scarica il commit upstream pinnato, ricostruisce l'albero, applica la patch e verifica tutto |
| `README.md` | Questa guida |

### Prerequisiti
- macOS + Xcode 15 o successivo
- [XcodeGen](https://github.com/yonaskolb/XcodeGen) (`brew install xcodegen`)
- Connessione a internet per il primo bootstrap

### Primo passo: ricostruire il progetto

```bash
git clone https://github.com/cipherdesk007-max/gpsbye.git
cd gpsbye
bash scripts/bootstrap.sh
```

Lo script scarica i sorgenti originali dal commit pinnato `8dc5aaa6` di [Reukix/Reloc](https://github.com/Reukix/Reloc) (inclusi i binari precompilati del bridge Rust `RelocDeviceBridge.xcframework` e le icone, non committati qui), applica la localizzazione italiana e verifica l'integrità SHA-256 di tutti i file. Al termine hai il progetto completo in italiano, pronto per Xcode.

### Preparare le credenziali MFi locali
Preparare autonomamente file di credenziali MFi-v3 legittimi e inserirli nella directory locale (mai commettere credenziali private in un repository pubblico):
- `Reloc/Resources/MFi/certificate.p7b`
- `Reloc/Resources/MFi/identity.pk8`

### Generare il progetto e creare l'IPA non firmato
```bash
# 1. Generare il progetto Xcode
xcodegen generate

# 2. Compilare la build Release per dispositivo reale, senza firma
xcodebuild build \
  -project Reloc.xcodeproj \
  -scheme Reloc \
  -configuration Release \
  -sdk iphoneos \
  -derivedDataPath build/DerivedData \
  CODE_SIGNING_ALLOWED=NO

# 3. Creare il Reloc.ipa non firmato (da firmare e installare autonomamente)
mkdir -p build/Payload
cp -R build/DerivedData/Build/Products/Release-iphoneos/Reloc.app build/Payload/
(cd build && zip -qry Reloc.ipa Payload)
```

---

## Domande frequenti

<details>
<summary><strong>1. L'abbinamento locale o la verifica della connessione segnalano impossibilità di pubblicare / individuare servizi locali?</strong></summary>

Andare in **«Impostazioni → Privacy e sicurezza → Rete locale»** e confermare che Reloc abbia accesso alla rete locale, e assicurarsi che il proxy esterno abbia attivato correttamente il loopback `10.7.0.1`.
</details>

<details>
<summary><strong>2. Dopo l'avvio o l'arresto della localizzazione, la posizione di sistema non cambia / non si ripristina subito?</strong></summary>

- **Dopo l'avvio**: Reloc risveglia automaticamente a impulsi `0xFFFA` dopo l'autenticazione iAP2 e spinge NMEA ad alta velocità; la home mostra in tempo reale se la sorgente è agganciata come accessorio (`isProducedByAccessory = true`). Se in interni con Wi-Fi forte / all'aperto con GNSS il sistema continua a usare la cache, toccare sulla scheda **«Aggiorna con un tap i servizi di localizzazione (finestra flottante di guida)»**: seguendo la finestra flottante PiP, spegnere i «Servizi di localizzazione» per 5 secondi e riattivarli per forzare l'effetto al 100%.
- **Dopo l'arresto**: Reloc invia automaticamente i messaggi NMEA di invalidazione e il pacchetto di reset del canale iAP2 `RST`, risvegliando il GPS reale del dispositivo; se con segnale debole in interno il sistema continua a usare l'ultima posizione in cache, toccare sulla scheda **«Aggiorna con un tap i servizi di localizzazione (ripristina la posizione reale)»** per ripristinare subito.
</details>

<details>
<summary><strong>3. Perché le Apple Mappe predefinite mostrano marchi di fornitori in Cina continentale?</strong></summary>

A causa delle normative di mappatura della Cina continentale, `MapKit` nativo passa automaticamente alla mappa e ai marchi del fornitore locale. Per una mappa internazionale WGS-84 pura senza marchi, toccare il pulsante livelli a destra della mappa e passare a **«Strade globali / OpenStreetMap / Satellite globale»** (tutte senza API Key, con disattivazione automatica dell'offset GCJ-02).
</details>

<details>
<summary><strong>4. Perché l'iPad non può usare Reloc?</strong></summary>

Reloc inietta un GPS a livello accessorio tramite il canale CarKit di sistema (`com.apple.carkit.service`). Apple fornisce CarPlay / CarKit solo su iPhone, iPadOS non include questo servizio: per questo Reloc su iPad mostra all'avvio l'avviso di dispositivo non disponibile.
</details>

---

## Avvertenza e licenza

> **Avvertenza**: questo progetto è destinato esclusivamente alla ricerca sui protocolli di comunicazione di localizzazione da accessorio su iOS, al debug di sviluppo app e ai test automatizzati. Chi lo utilizza deve rispettare le leggi del proprio territorio e i termini di servizio dei sistemi coinvolti; ogni conseguenza dell'uso improprio del software è a carico di chi lo utilizza.

### Licenza e attribuzione

Questo progetto è distribuito in base alla **GNU Affero General Public License v3.0 (`AGPL-3.0-only`)**; i termini completi sono in [LICENSE](./LICENSE). Qualsiasi versione modificata basata su questo progetto, se distribuita o offerta come servizio interattivo tramite rete, deve rendere disponibile il codice sorgente completo sotto la stessa licenza AGPL-3.0.

- Progetto originale: **[Reukix/Reloc](https://github.com/Reukix/Reloc)** ( Copyright autori originali, licenza AGPL-3.0)
- **Modifiche apportate in questo repository** (ai sensi dell'art. 5 AGPL-3.0 «dichiarazione delle modifiche»):
  - Localizzazione completa in **italiano** di tutte le stringhe visibili all'utente: interfaccia SwiftUI, avvisi e finestre di dialogo, descrizioni dei permessi in `Info.plist` e `project.yml`, messaggi di errore del bridge Rust (`RelocDeviceBridge`), messaggi di stato e di log mostrati nell'app;
  - README riscritto in italiano;
  - Aggiunti `scripts/bootstrap.sh` (ricostruzione verificata del progetto) e le patch di localizzazione in `patches/`;
  - Nessuna modifica alla logica di funzionamento, ai protocolli o all'architettura.
