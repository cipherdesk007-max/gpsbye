# Compito: pubblicare il server di "FMLAB Cristalia" su Google Apps Script

Sei un assistente con accesso al mio account Google. Devi creare un progetto Google Apps Script con i 5 file di questa cartella, pubblicarlo come **App web** e darmi l'URL che finisce con `/exec`. Non cambiare il contenuto dei file.

## File (tutti in questa cartella)

| File nella cartella | Nome e tipo nel progetto Apps Script |
|---|---|
| `Code.gs` | file **Script** chiamato `Code` |
| `engine.gs` | file **Script** chiamato `engine` |
| `servercore.gs` | file **Script** chiamato `servercore` |
| `Index.html` | file **HTML** chiamato `Index` (deve chiamarsi esattamente così: lo usa `Code.gs`) |
| `appsscript.json` | il **manifest** del progetto (sostituisci tutto il contenuto) |

## Passi

1. Vai su https://script.google.com e crea un **Nuovo progetto**. Chiamalo `FMLAB Cristalia`.
2. Nel file `Code.gs` che c'è già, cancella tutto e incolla il contenuto di `Code.gs`.
3. Aggiungi con **+ › Script** i file `engine` e `servercore` e incolla i rispettivi contenuti.
4. Aggiungi con **+ › HTML** il file `Index` e incolla tutto il contenuto di `Index.html` (è grande, circa 470 KB: assicurati che sia incollato fino in fondo, l'ultima riga è `</html>`).
5. In **Impostazioni progetto** (ingranaggio) attiva «Mostra il file manifest "appsscript.json" nell'editor», apri `appsscript.json` e sostituisci tutto col contenuto del file `appsscript.json` di questa cartella. Fuso orario: Europe/Rome.
6. Salva tutto (Ctrl/Cmd+S).
7. **Esegui il deployment › Nuovo deployment** → tipo **App web**:
   - Descrizione: `Cristalia v1`
   - Esegui come: **Me** (il proprietario)
   - Chi ha accesso: **Chiunque** (anche senza account Google: i miei amici devono poterci entrare dal telefono)
8. Autorizza lo script se Google lo chiede (usa solo memoria dello script, cache e lucchetto: nessun accesso a Gmail o Drive).
9. Copia l'**URL dell'app web** (finisce con `/exec`).

In alternativa ai passi 1-9 puoi usare `clasp` (`clasp create --type webapp`, copia i file, `clasp push`, `clasp deploy`), purché il risultato sia lo stesso: 5 file con quei nomi, App web, "Me", "Chiunque".

## Verifica (fai tutte e 4 le prove e riportami i risultati)

1. Apri nel browser `URL?action=ping` → deve rispondere un JSON con `"ok":true`.
2. Apri `URL?action=hello&pid=provaverifica1&name=Prova` → JSON con `"ok":true`, `"online":[]` e `"invites":[]`.
3. Apri `URL?action=leaderboard` → JSON con `"ok":true` e `"rows"`.
4. Apri l'URL senza niente dopo (`.../exec`) da un telefono o in una finestra in incognito → si vede il gioco con il titolo **FMLAB CRISTALIA** e la scritta «Tocca per iniziare» (in incognito vuol dire che funziona anche per chi non ha il mio account). Su un account Gmail personale Google mostra in alto una riga grigia «Questa applicazione è stata creata da un utente di Google Apps Script»: è normale.

## Cosa mi devi rispondere

- L'URL `/exec` completo.
- L'ID del deployment.
- Il risultato delle 4 prove (copia le prime righe dei JSON).
- Eventuali errori così come sono scritti, senza riassumerli.

## Aggiornamenti futuri (non ora)

Quando ti mando una versione nuova dei file: sostituisci il contenuto dei 5 file nello **stesso progetto**, poi **Esegui il deployment › Gestisci deployment › matita (Modifica) › Versione: Nuova versione › Esegui il deployment**. Così l'URL `/exec` resta lo stesso e le app sui telefoni continuano a funzionare. Non creare un deployment nuovo (cambierebbe l'URL).

## Note

- Limiti di Google per un account Gmail: 50.000 letture/scritture al giorno della memoria dello script e 30 esecuzioni contemporanee. Il server usa la cache per presenze, inviti, Raid e attese delle mosse, quindi 5-10 amici che giocano insieme restano largamente sotto il limite.
- Per azzerare stanze, classifiche e presenze c'è la funzione `azzeraTutto` (si lancia a mano dall'editor). Non lanciarla adesso.
