//
//  WebServerPage.swift
//  TDS Video
//
//  Created by Thomas Dye on 16/04/2025.
//

import SwiftUI

struct WebServerPage: View {
    @State private var ipAddresses: [String] = []

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Visione dal vivo disponibile")
                .font(.title)
                .bold()

            Text("Mentre la specchiatura è attiva, puoi vedere questo iPhone da un altro dispositivo sulla stessa rete aprendo nel browser questo indirizzo:")
            Text("Funzione sperimentale (di TDS): alcune parti potrebbero non funzionare. Serve per auto senza CarPlay, come Tesla, che hanno un browser.")
                .font(.caption)
            Text("Lo schermo arriva al browser dell'auto o di un tablet.")
                .font(.caption)
            Text("L'audio non viene trasmesso.")
            Divider()
            Text("Indirizzo da aprire")
            ForEach(ipAddresses, id: \.self) { ip in
                Text("http://\(ip):8080")
                    .font(.system(.body, design: .monospaced))
                    .foregroundColor(.blue)
                
            }

            Spacer()
        }
        .padding()
        .onAppear {
            self.ipAddresses = HTTPServer.shared.getAllIPAddresses().map {
                $0.components(separatedBy: ": ").last ?? $0
            }
        }
    }
}
