//
//  FMLABCrashReporter.swift
//  FMLAB CarPlay
//
//  Raccoglie crash ed errori in file da condividere:
//  - eccezioni Objective-C/UIKit: scritte subito in fmlab-errori.txt
//  - crash di ogni tipo (anche Swift): iOS li consegna con MetricKit al
//    riavvio successivo; vengono salvati come fmlab-crash-<data>.json
//  Tutto resta sul telefono finché non lo condividi.
//

import Foundation
import MetricKit

final class FMLABCrashReporter: NSObject, MXMetricManagerSubscriber {
    static let shared = FMLABCrashReporter()
    private var started = false

    static var docs: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    }

    static var errorsURL: URL { docs.appendingPathComponent("fmlab-errori.txt") }

    /// Da chiamare il prima possibile all'avvio.
    func start() {
        guard !started else { return }
        started = true
        NSSetUncaughtExceptionHandler { exception in
            // scrittura sincrona: subito dopo l'app si chiude
            let text = """
            ==== ERRORE \(Date())
            \(exception.name.rawValue): \(exception.reason ?? "")
            \(exception.callStackSymbols.joined(separator: "\n"))

            """
            if let data = text.data(using: .utf8) {
                if let handle = try? FileHandle(forWritingTo: FMLABCrashReporter.errorsURL) {
                    handle.seekToEndOfFile()
                    handle.write(data)
                    try? handle.close()
                } else {
                    try? data.write(to: FMLABCrashReporter.errorsURL)
                }
            }
        }
        MXMetricManager.shared.add(self)
        // payload già arrivati (iOS 14+ li conserva)
        didReceive(MXMetricManager.shared.pastDiagnosticPayloads)
    }

    func didReceive(_ payloads: [MXDiagnosticPayload]) {
        for payload in payloads {
            let crashes = payload.crashDiagnostics?.count ?? 0
            let hangs = payload.hangDiagnostics?.count ?? 0
            guard crashes + hangs > 0 else { continue }
            let stamp = Int(payload.timeStampEnd.timeIntervalSince1970)
            let url = Self.docs.appendingPathComponent("fmlab-crash-\(stamp).json")
            if !FileManager.default.fileExists(atPath: url.path) {
                try? payload.jsonRepresentation().write(to: url)
                FMLABLog.add("Crash registrato da iOS: \(crashes) crash, \(hangs) blocchi (file \(url.lastPathComponent))")
            }
        }
    }

    func didReceive(_ payloads: [MXMetricPayload]) {}

    /// Tutti i file da mandare per correggere: log, errori, crash.
    static func reportFiles() -> [URL] {
        var files: [URL] = []
        if FileManager.default.fileExists(atPath: FMLABLog.fileURL.path) { files.append(FMLABLog.fileURL) }
        if FileManager.default.fileExists(atPath: errorsURL.path) { files.append(errorsURL) }
        let crashes = (try? FileManager.default.contentsOfDirectory(at: docs, includingPropertiesForKeys: nil)) ?? []
        files.append(contentsOf: crashes.filter { $0.lastPathComponent.hasPrefix("fmlab-crash-") }.sorted { $0.path < $1.path })
        return files
    }

    static var crashCount: Int {
        reportFiles().filter { $0.lastPathComponent.hasPrefix("fmlab-crash-") }.count
            + (FileManager.default.fileExists(atPath: errorsURL.path) ? 1 : 0)
    }

    static func clearReports() {
        for url in reportFiles() where url != FMLABLog.fileURL {
            try? FileManager.default.removeItem(at: url)
        }
    }
}
