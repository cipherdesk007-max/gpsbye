//
//  Help.swift
//  FMLAB CarPlay
//
//  Guida in italiano (sostituisce quella di TDS).
//

import SwiftUI

struct Help: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Group {
                    Text("📺 Specchiare lo schermo sull'auto")
                        .font(.headline)
                    Text("""
1. Collega l'iPhone a CarPlay e apri FMLAB CarPlay sullo schermo dell'auto.
2. Sull'iPhone tocca **Avvia specchiatura schermo**, oppure:
   - apri il Centro di Controllo;
   - tieni premuto il pulsante di registrazione schermo;
   - scegli **FMLAB CarPlay** e tocca **Avvia trasmissione**.
3. Apri l'app che vuoi vedere (dalla sezione **App sul telefono** o dalla Home).
""")
                    Text("❗️ Se FMLAB CarPlay non compare nell'elenco della registrazione schermo, aspetta qualche secondo o riavvia l'iPhone.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                Divider()

                Group {
                    Text("🌐 Siti web sull'auto")
                        .font(.headline)
                    Text("""
1. Apri **Browser** e vai al sito che vuoi.
2. Tocca **All'auto** per mostrarlo sullo schermo dell'auto.
3. Usa **Comandi del browser** per muovere il cursore, scorrere e ingrandire.
""")
                    Text("App web: in «App web sull'auto» trovi Twitch, Google Maps, TikTok, Plex, RaiPlay e puoi aggiungere qualsiasi sito. Si aprono direttamente sull'auto, senza specchiatura.")
                    Text("Se il volante è a destra, attiva «Guida a destra» in Impostazioni specchiatura.")
                }

                Divider()

                Group {
                    Text("🚗 Blocco di guida e passeggero")
                        .font(.headline)
                    Text("""
Sopra la soglia di velocità il video sull'auto va in pausa e resta solo l'audio. Se guarda il passeggero, attiva **Modalità passeggero**: vale solo per il viaggio in corso e si spegne quando scolleghi CarPlay.
""")
                }

                Divider()

                Group {
                    Text("🎙️ Comandi con Siri")
                        .font(.headline)
                    Text("""
Con CarPlay collegato puoi dire:
- «Ehi Siri, home in FMLAB CarPlay»
- «Ehi Siri, YouTube in FMLAB CarPlay»
- «Ehi Siri, schermo in FMLAB CarPlay»
- «Ehi Siri, cambia sfondo in FMLAB CarPlay»
Li trovi anche nell'app Comandi, per creare automazioni.
""")
                }

                Divider()

                Group {
                    Text("⚠️ Se va a scatti")
                        .font(.headline)
                    Text("""
- Chiudi FMLAB CarPlay e l'app che stai specchiando.
- Riaprile e riavvia la specchiatura.
- Netflix, Prime Video, Disney+ e simili restano neri: è la loro protezione anti-copia (DRM), non un errore.
""")
                }

                Divider()

                Group {
                    Text("ℹ️ Perché non AirPlay?")
                        .font(.headline)
                    Text("Con AirPlay l'audio andrebbe verso AirPlay invece che negli altoparlanti dell'auto: per questo FMLAB usa la specchiatura dello schermo.")
                }

                Spacer()
            }
            .padding()
        }
        .navigationTitle("Guida")
    }
}
