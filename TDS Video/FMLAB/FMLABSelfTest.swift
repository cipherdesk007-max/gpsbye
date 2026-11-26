//
//  FMLABSelfTest.swift
//  FMLAB CarPlay
//
//  Test automatici di tutte le funzioni FMLAB, eseguiti DENTRO l'app vera sul
//  simulatore (argomento di avvio -fmlabSelfTest). Il resoconto va in
//  Documents/fmlab-selftest.txt con PASS/FAIL per ogni controllo.
//

import UIKit
import CoreLocation

@MainActor
enum FMLABSelfTest {
    static var requested: Bool {
        ProcessInfo.processInfo.arguments.contains("-fmlabSelfTest")
    }

    private static var lines: [String] = []
    private static var passed = 0
    private static var failed = 0

    private static func check(_ name: String, _ ok: Bool, _ detail: String = "") {
        lines.append("\(ok ? "PASS" : "FAIL")  \(name)\(detail.isEmpty ? "" : "  [\(detail)]")")
        if ok { passed += 1 } else { failed += 1 }
    }

    private static func section(_ title: String) {
        lines.append("")
        lines.append("== \(title)")
    }

    static func run() async {
        lines = ["FMLAB CarPlay — test automatici", "Versione \(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "?")"]
        passed = 0
        failed = 0
        let s = FMLABSettings.shared

        // MARK: Impostazioni iniziali
        section("Impostazioni predefinite")
        check("Blocco video in movimento attivo", s.drivingLockEnabled)
        check("Soglia 5 km/h", s.speedThresholdKmh == 5, "\(s.speedThresholdKmh)")
        check("Modalità passeggero spenta all'avvio", s.passengerMode == false)
        check("Blocco pubblicità YouTube attivo", s.youtubeAdBlock)
        check("SponsorBlock attivo", s.youtubeSponsorBlock)
        check("App predefinite presenti", s.appShortcuts.count >= 9, "\(s.appShortcuts.count)")
        check("App web predefinite presenti", s.webApps.count >= 9, "\(s.webApps.count)")

        // MARK: Sfondi
        section("Sfondi")
        for wp in FMLABWallpaper.builtIn where wp.bundleFile != nil {
            let img = s.image(for: wp)
            check("Sfondo \(wp.name) caricato", img != nil,
                  img.map { "\(Int($0.size.width))×\(Int($0.size.height))" } ?? "mancante")
        }
        check("Sfondo Nero senza immagine", s.image(for: FMLABWallpaper.black) == nil)
        let startWallpaper = s.wallpaperID
        var seen: [String] = []
        for _ in 0..<s.allWallpapers.count {
            s.nextWallpaper()
            seen.append(s.wallpaperID)
        }
        check("«Sfondo successivo» fa il giro completo e torna all'inizio",
              Set(seen).count == s.allWallpapers.count && s.wallpaperID == startWallpaper,
              seen.joined(separator: " → "))

        let big = CGSize(width: 3000, height: 1500)
        let sample = UIGraphicsImageRenderer(size: big).image { ctx in
            UIColor.systemPurple.setFill()
            ctx.fill(CGRect(origin: .zero, size: big))
        }
        s.saveCustomWallpaper(sample)
        let saved = UIImage(contentsOfFile: s.customWallpaperURL.path)
        check("Immagine personale salvata e attivata", saved != nil && s.wallpaperID == FMLABWallpaper.custom.id)
        check("Immagine personale ridotta a max 1920 px",
              saved.map { max($0.size.width, $0.size.height) <= 1920 } ?? false,
              saved.map { "\(Int($0.size.width))×\(Int($0.size.height))" } ?? "")
        check("Immagine personale nell'elenco sfondi", s.allWallpapers.contains { $0.id == FMLABWallpaper.custom.id })
        s.removeCustomWallpaper()
        check("Immagine personale eliminata", !s.hasCustomWallpaper && s.wallpaperID != FMLABWallpaper.custom.id)
        s.wallpaperID = startWallpaper

        // MARK: Blocco di guida
        section("Blocco di guida (velocità)")
        let m = FMLABCarMonitor.shared
        let t0 = Date(timeIntervalSince1970: 1_000_000)
        m.processSpeed(kmh: 0, at: t0)
        check("0 km/h → fermo", m.isMoving == false)
        m.processSpeed(kmh: 20, at: t0.addingTimeInterval(1))
        check("20 km/h → in marcia", m.isMoving == true)
        m.processSpeed(kmh: 3, at: t0.addingTimeInterval(2))
        check("Scende a 3 km/h → resta in marcia (attesa)", m.isMoving == true)
        m.processSpeed(kmh: 3, at: t0.addingTimeInterval(4))
        check("3 km/h dopo 2 s → ancora in marcia", m.isMoving == true)
        m.processSpeed(kmh: 25, at: t0.addingTimeInterval(5))
        m.processSpeed(kmh: 2, at: t0.addingTimeInterval(6))
        m.processSpeed(kmh: 2, at: t0.addingTimeInterval(8))
        check("Ripartenza azzera l'attesa (semaforo)", m.isMoving == true)
        m.processSpeed(kmh: 2, at: t0.addingTimeInterval(10.5))
        check("Fermo da 4 s → sblocco", m.isMoving == false)
        m.processSpeed(kmh: 5, at: t0.addingTimeInterval(11))
        check("Esattamente alla soglia (5 km/h) → in marcia", m.isMoving == true)
        m.processSpeed(kmh: 0, at: t0.addingTimeInterval(12))
        m.processSpeed(kmh: 0, at: t0.addingTimeInterval(20))
        check("Ritorno a fermo", m.isMoving == false)
        let before = m.speedKmh
        let bad = CLLocation(coordinate: CLLocationCoordinate2D(latitude: 43.77, longitude: 11.25), altitude: 0,
                             horizontalAccuracy: 10, verticalAccuracy: 10, course: 0, speed: -1, timestamp: Date())
        m.locationManager(CLLocationManager(), didUpdateLocations: [bad])
        check("Velocità GPS non valida ignorata", m.speedKmh == before)
        let imprecise = CLLocation(coordinate: CLLocationCoordinate2D(latitude: 43.77, longitude: 11.25), altitude: 0,
                                   horizontalAccuracy: 500, verticalAccuracy: 10, course: 0, speed: 30, timestamp: Date())
        m.locationManager(CLLocationManager(), didUpdateLocations: [imprecise])
        check("Posizione imprecisa (500 m) ignorata", m.isMoving == false)

        section("Blocco di guida (regole)")
        typealias D = FMLABLockDecision
        let cases: [(String, Bool, Bool, Bool, FMLABCarRouter.Mode, Bool, D)] = [
            ("Fermo, specchiatura", true, false, false, .mirror, false, .none),
            ("In marcia, specchiatura", true, false, true, .mirror, false, .driving),
            ("In marcia, browser", true, false, true, .web, false, .driving),
            ("In marcia, video", true, false, true, .video, false, .driving),
            ("In marcia, home FMLAB (usabile)", true, false, true, .home, false, .none),
            ("In marcia, impostazioni sull'auto (usabili)", true, false, true, .settings, false, .none),
            ("In marcia, modalità passeggero", true, true, true, .video, false, .none),
            ("In marcia, blocco disattivato", false, false, true, .video, false, .none),
            ("Chiamata da fermo", true, false, false, .home, true, .call),
            ("Chiamata in marcia con passeggero", true, true, true, .video, true, .call),
        ]
        for (name, lock, passenger, moving, mode, call, expected) in cases {
            let got = FMLABCarOverlay.decide(lockEnabled: lock, passenger: passenger, moving: moving, mode: mode, onCall: call)
            check(name + " → " + expected.rawValue, got == expected, "ottenuto \(got.rawValue)")
        }

        section("Modalità passeggero")
        s.passengerMode = true
        m.setCarPlayScene(connected: false, screenSize: .zero)
        try? await Task.sleep(nanoseconds: 400_000_000)
        check("Si spegne da sola quando CarPlay si scollega", s.passengerMode == false)

        // MARK: LiveContainer
        section("LiveContainer")
        check("Link YouTube.app → «YouTube»",
              FMLABAppCatalog.liveContainerAppName(from: "livecontainer://livecontainer-launch?bundle-name=YouTube.app") == "YouTube")
        check("Link com.shopify.app.app → «Shopify»",
              FMLABAppCatalog.liveContainerAppName(from: "livecontainer://livecontainer-launch?bundle-name=com.shopify.app.app") == "Shopify",
              FMLABAppCatalog.liveContainerAppName(from: "livecontainer://livecontainer-launch?bundle-name=com.shopify.app.app") ?? "nil")
        check("Link con cartella contenitore accettato",
              FMLABAppCatalog.liveContainerAppName(from: "livecontainer://livecontainer-launch?bundle-name=Foo.app&container-folder-name=ABC") == "Foo")
        check("Link non valido rifiutato",
              FMLABAppCatalog.liveContainerAppName(from: "https://www.youtube.com") == nil)
        let spaced = FMLABLiveContainerImport.launchURL(for: "My App.app") ?? ""
        check("Nome con spazi codificato nel link", spaced.contains("My%20App.app"), spaced)
        check("Link con spazi riletto correttamente", FMLABAppCatalog.liveContainerAppName(from: spaced) == "My App")

        let fm = FileManager.default
        let root = fm.temporaryDirectory.appendingPathComponent("fmlab-test-LiveContainer")
        try? fm.removeItem(at: root)
        let appsDir = root.appendingPathComponent("Applications")
        try? fm.createDirectory(at: appsDir.appendingPathComponent("Shop.app"), withIntermediateDirectories: true)
        try? fm.createDirectory(at: appsDir.appendingPathComponent("Video.app"), withIntermediateDirectories: true)
        try? fm.createDirectory(at: appsDir.appendingPathComponent("NonUnaApp"), withIntermediateDirectories: true)
        let plist: [String: Any] = ["CFBundleDisplayName": "Shopify"]
        if let data = try? PropertyListSerialization.data(fromPropertyList: plist, format: .binary, options: 0) {
            try? data.write(to: appsDir.appendingPathComponent("Shop.app/Info.plist"))
        }
        let fromRoot = FMLABLiveContainerImport.apps(in: root)
        check("Importa dalla cartella LiveContainer: 2 app", fromRoot.count == 2, "\(fromRoot.count)")
        check("Nome letto da Info.plist (Shopify)", fromRoot.contains { $0.name == "Shopify" },
              fromRoot.map(\.name).joined(separator: ", "))
        check("Senza Info.plist usa il nome cartella (Video)", fromRoot.contains { $0.name == "Video" })
        check("Le cartelle che non sono app vengono saltate", !fromRoot.contains { $0.name == "NonUnaApp" })
        check("Link d'avvio corretti",
              fromRoot.allSatisfy { $0.urlScheme.hasPrefix("livecontainer://livecontainer-launch?bundle-name=") })
        let fromApps = FMLABLiveContainerImport.apps(in: appsDir)
        check("Funziona anche scegliendo direttamente «Applications»", fromApps.count == 2, "\(fromApps.count)")
        try? fm.removeItem(at: root)

        // MARK: App e app web
        section("App sul telefono e app web")
        check("Schema normalizzato (YouTube:// → youtube)", fmlabNormalizedScheme(" YouTube:// ") == "youtube")
        let schemes = FMLABAppCatalog.all.map(\.scheme)
        check("Catalogo: schemi tutti diversi", Set(schemes).count == schemes.count)
        check("Catalogo: massimo 50 schemi (limite iOS)", schemes.count <= 50, "\(schemes.count)")
        let declared = Bundle.main.object(forInfoDictionaryKey: "LSApplicationQueriesSchemes") as? [String] ?? []
        let missing = schemes.filter { !declared.contains($0) }
        check("Catalogo: tutti dichiarati in Info.plist", missing.isEmpty, missing.joined(separator: ","))
        let web1 = FMLABWebApp(name: "Meteo", url: "www.ilmeteo.it", symbol: "globe").resolvedURL?.absoluteString
        check("App web senza https:// → aggiunto", web1 == "https://www.ilmeteo.it", web1 ?? "nil")
        let web2 = FMLABWebApp(name: "X", url: "http://192.168.1.10:32400", symbol: "globe").resolvedURL?.absoluteString
        check("App web con http:// lasciato com'è", web2 == "http://192.168.1.10:32400", web2 ?? "nil")
        check("Tutte le app web predefinite hanno un indirizzo valido", s.webApps.allSatisfy { $0.resolvedURL != nil })
        let opened: Bool = await withCheckedContinuation { cont in
            s.openOnPhone(FMLABAppShortcut(name: "Inesistente", urlScheme: "fmlabinesistente123://",
                                           symbol: "app", drmProtected: false)) { ok in cont.resume(returning: ok) }
        }
        check("App non installata: segnalata (non apre nulla)", opened == false)

        // MARK: Risorse nel pacchetto
        section("File nell'app")
        for (res, ext) in [("FMLABAdBlocker", "js"), ("FMLABSponsorBlock", "js"), ("fmlab-logo", "png")] {
            let path = Bundle.main.path(forResource: res, ofType: ext)
            let size = path.flatMap { try? FileManager.default.attributesOfItem(atPath: $0)[.size] as? Int } ?? 0
            check("\(res).\(ext) presente", size > 0, "\(size) byte")
        }

        // MARK: Home sull'auto
        section("Home FMLAB sull'auto")
        for (size, expectedTiles) in [(CGSize(width: 1280, height: 480), 10), (CGSize(width: 800, height: 480), 7),
                                      (CGSize(width: 1920, height: 720), 10)] {
            let home = FMLABCarHomeView(frame: CGRect(origin: .zero, size: size))
            home.setNeedsLayout()
            home.layoutIfNeeded()
            let tiles = home.subviews.compactMap { $0 as? FMLABTile }.filter { !$0.isHidden }
            let inside = tiles.allSatisfy { home.bounds.contains($0.frame) }
            let overlapping = tiles.enumerated().contains { i, a in
                tiles.enumerated().contains { j, b in i < j && a.frame.intersects(b.frame) }
            }
            let label = "\(Int(size.width))×\(Int(size.height))"
            check("\(label): \(expectedTiles) riquadri visibili", tiles.count == expectedTiles, "\(tiles.count)")
            check("\(label): riquadri dentro lo schermo", inside)
            check("\(label): riquadri senza sovrapposizioni", !overlapping)
            // il logo occupa circa il 22% destro dello schermo, nella fascia bassa
            let cornerFree = !tiles.contains { $0.frame.maxX > home.bounds.width * 0.77 && $0.frame.maxY > home.bounds.height * 0.70 }
            check("\(label): angolo in basso a destra libero per il logo", cornerFree)
            let wallpaper = FMLABWallpaperView(frame: CGRect(origin: .zero, size: size))
            wallpaper.image = s.image(for: FMLABWallpaper.builtIn[1])
            wallpaper.setNeedsLayout()
            wallpaper.layoutIfNeeded()
            let f = wallpaper.imageFrame
            check("\(label): sfondo ancorato in basso a destra (logo intero)",
                  abs(f.maxX - size.width) < 0.5 && abs(f.maxY - size.height) < 0.5 && f.width >= size.width - 0.5 && f.height >= size.height - 0.5,
                  "\(Int(f.minX)),\(Int(f.minY)) \(Int(f.width))×\(Int(f.height))")
            let minSide = tiles.map { min($0.frame.width, $0.frame.height) }.min() ?? 0
            check("\(label): riquadri abbastanza grandi da toccare (≥ 60 pt)", minSide >= 60, "\(Int(minSide)) pt")
        }

        section("Home: velocità e riquadri fissi")
        let probe = FMLABCarHomeView(frame: CGRect(x: 0, y: 0, width: 1280, height: 480))
        probe.setNeedsLayout(); probe.layoutIfNeeded()
        let fixed = ["Specchia iPhone", "YouTube", "Browser", "Impostazioni"]
        check("Riquadri fissi: Specchia, YouTube, Browser, Impostazioni",
              Array(probe.tileTitles.prefix(4)) == fixed, probe.tileTitles.prefix(4).joined(separator: ", "))
        let speedWas = s.showSpeedOnHome
        s.showSpeedOnHome = true
        probe.previewStatus = (car: "Golf 8", kmh: 47)
        check("Velocità grande visibile nella home", probe.isShowingSpeed)
        s.showSpeedOnHome = false
        probe.previewStatus = (car: "Golf 8", kmh: 47)
        check("Velocità grande nascosta se disattivata", !probe.isShowingSpeed)
        s.showSpeedOnHome = speedWas

        section("Impostazioni sull'auto")
        for size in [CGSize(width: 800, height: 480), CGSize(width: 1280, height: 480), CGSize(width: 1920, height: 720)] {
            let panel = FMLABCarSettingsView(frame: CGRect(origin: .zero, size: size))
            panel.setNeedsLayout(); panel.layoutIfNeeded()
            let label = "\(Int(size.width))×\(Int(size.height))"
            check("\(label): una miniatura per ogni sfondo", panel.thumbCount == s.allWallpapers.count,
                  "\(panel.thumbCount)/\(s.allWallpapers.count)")
            let outside = panel.subviews.filter { !$0.isHidden && !panel.bounds.insetBy(dx: -0.5, dy: -0.5).contains($0.frame) }
            check("\(label): tutti i controlli dentro lo schermo", outside.isEmpty, "\(outside.count) fuori")
            let card = panel.subviews.first { $0.subviews.contains { ($0 as? UILabel)?.text == "La tua auto" } }
            check("\(label): riquadro auto non copre il logo in basso a destra",
                  (card?.frame.maxY ?? size.height) < size.height * 0.80, card.map { "fine a \(Int($0.frame.maxY))" } ?? "non trovato")
            let small = panel.subviews.compactMap { $0 as? FMLABToggleRow }.filter { $0.frame.height < 44 }
            check("\(label): interruttori alti almeno 44 pt", small.isEmpty)
        }
        let panel = FMLABCarSettingsView(frame: CGRect(x: 0, y: 0, width: 1280, height: 480))
        panel.setNeedsLayout(); panel.layoutIfNeeded()
        let before2 = s.wallpaperID
        panel.tapThumb(2)
        check("Tocco sulla miniatura cambia lo sfondo", s.wallpaperID == s.allWallpapers[2].id, s.wallpaperID)
        s.wallpaperID = before2

        section("Diagnostica")
        FMLABLog.clear()
        FMLABLog.add("Prova diagnostica 1")
        FMLABLog.add("Prova diagnostica 2")
        FMLABLog.flush()
        let logged = FMLABLog.lastLines(5)
        check("Il log registra gli eventi in ordine", logged.count == 2 && logged.last?.hasSuffix("Prova diagnostica 2") == true,
              logged.joined(separator: " | "))
        for i in 0..<4000 { FMLABLog.add("Riempimento \(i) — testo per verificare il limite di dimensione del file") }
        FMLABLog.flush()
        let logSize = (try? FileManager.default.attributesOfItem(atPath: FMLABLog.fileURL.path)[.size] as? Int) ?? 0
        check("Il log non supera ~300 KB (taglia le righe vecchie)", logSize > 0 && logSize <= 300_000, "\(logSize) byte")
        check("Dopo il taglio restano le righe recenti", FMLABLog.lastLines(1).first?.contains("Riempimento 3999") == true)
        FMLABLog.clear()
        check("«Svuota il log» lo cancella", FMLABLog.lastLines(5).isEmpty)

        section("Crash ed errori")
        let fakeCrash = FMLABCrashReporter.docs.appendingPathComponent("fmlab-crash-123.json")
        try? Data("{\"prova\":true}".utf8).write(to: fakeCrash)
        try? Data("ERRORE di prova".utf8).write(to: FMLABCrashReporter.errorsURL)
        FMLABLog.add("riga")
        FMLABLog.flush()
        let files = FMLABCrashReporter.reportFiles().map(\.lastPathComponent)
        check("File da mandare: log, errori e crash", files.contains("fmlab-diagnostica.txt")
              && files.contains("fmlab-errori.txt") && files.contains("fmlab-crash-123.json"), files.joined(separator: ", "))
        check("Conteggio segnalazioni (1 crash + errori)", FMLABCrashReporter.crashCount == 2, "\(FMLABCrashReporter.crashCount)")
        FMLABCrashReporter.clearReports()
        FMLABLog.clear()
        check("«Svuota» cancella crash ed errori", FMLABCrashReporter.crashCount == 0 && FMLABCrashReporter.reportFiles().isEmpty)

        section("Telecomando")
        var received = false
        let token = NotificationCenter.default.addObserver(forName: .fmlabCarModeChanged, object: nil, queue: nil) { _ in
            received = true
        }
        FMLABCarRouter.shared.setMode(.web)
        check("Cambio modalità notificato all'iPhone", received && FMLABCarRouter.shared.mode == .web)
        FMLABCarRouter.shared.setMode(.home)
        NotificationCenter.default.removeObserver(token)

        lines.append("")
        lines.append("RISULTATO: \(passed) PASS, \(failed) FAIL")
        let report = lines.joined(separator: "\n")
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        try? report.write(to: docs.appendingPathComponent("fmlab-selftest.txt"), atomically: true, encoding: .utf8)
    }
}
