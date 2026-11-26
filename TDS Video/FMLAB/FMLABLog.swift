//
//  FMLABLog.swift
//  FMLAB CarPlay
//
//  Diagnostica: registro degli eventi (CarPlay, tocchi dall'auto, GPS, blocco,
//  specchiatura, app aperte, Siri) in Documents/fmlab-diagnostica.txt.
//  Resta sul telefono finché non lo condividi tu.
//

import Foundation

enum FMLABLog {
    private static let queue = DispatchQueue(label: "it.fmlab.carplay.log")
    private static let maxBytes = 300_000
    private static let keepBytes = 200_000

    private static let formatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "it_IT")
        f.dateFormat = "dd/MM HH:mm:ss"
        return f
    }()

    static var fileURL: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("fmlab-diagnostica.txt")
    }

    static func add(_ message: String) {
        let now = Date()
        queue.async {
            let line = "\(formatter.string(from: now))  \(message)\n"
            guard let data = line.data(using: .utf8) else { return }
            let url = fileURL
            if let handle = try? FileHandle(forWritingTo: url) {
                handle.seekToEndOfFile()
                handle.write(data)
                try? handle.close()
            } else {
                try? data.write(to: url)
            }
            trimIfNeeded()
        }
    }

    private static func trimIfNeeded() {
        let url = fileURL
        guard let size = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size]) as? Int,
              size > maxBytes,
              let data = try? Data(contentsOf: url) else { return }
        var tail = data.suffix(keepBytes)
        if let newline = tail.firstIndex(of: 0x0A) { tail = tail[(newline + 1)...] }
        try? Data(tail).write(to: url, options: .atomic)
    }

    /// Ultime righe (per la schermata Diagnostica).
    static func lastLines(_ count: Int) -> [String] {
        queue.sync {
            guard let text = try? String(contentsOf: fileURL, encoding: .utf8) else { return [] }
            return Array(text.split(separator: "\n").suffix(count).map(String.init))
        }
    }

    static func clear() {
        queue.sync {
            try? FileManager.default.removeItem(at: fileURL)
        }
    }

    /// Attende che le scritture in coda siano finite (per i test).
    static func flush() {
        queue.sync {}
    }
}
