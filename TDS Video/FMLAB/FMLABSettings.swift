//
//  FMLABSettings.swift
//  FMLAB CarPlay
//
//  Impostazioni FMLAB: sfondi, sicurezza, modalità passeggero, app preferite.
//

import SwiftUI
import UIKit

struct FMLABWallpaper: Identifiable, Hashable {
    let id: String
    let name: String
    /// Nome del file .jpg nel bundle (nil = nessuno sfondo o immagine dell'utente)
    let bundleFile: String?

    static let black = FMLABWallpaper(id: "nessuno", name: "Nero", bundleFile: nil)
    static let custom = FMLABWallpaper(id: "custom", name: "La tua immagine", bundleFile: nil)

    static let builtIn: [FMLABWallpaper] = [
        .black,
        FMLABWallpaper(id: "campagna", name: "Campagna", bundleFile: "fmlab-campagna"),
        FMLABWallpaper(id: "metropoli", name: "Metropoli notturna", bundleFile: "fmlab-metropoli"),
        FMLABWallpaper(id: "synthwave", name: "Synthwave", bundleFile: "fmlab-synthwave"),
        FMLABWallpaper(id: "fantasy", name: "Fantasy", bundleFile: "fmlab-fantasy"),
    ]
}

extension Notification.Name {
    static let fmlabAppsChanged = Notification.Name("fmlab.appsChanged")
}

/// App web: si aprono direttamente sullo schermo dell'auto (senza specchiatura).
struct FMLABWebApp: Identifiable, Codable, Hashable {
    var id = UUID()
    var name: String
    var url: String
    var symbol: String

    var resolvedURL: URL? {
        var s = url.trimmingCharacters(in: .whitespaces)
        if !s.lowercased().hasPrefix("http://") && !s.lowercased().hasPrefix("https://") { s = "https://" + s }
        return URL(string: s)
    }
}

struct FMLABAppShortcut: Identifiable, Codable, Hashable {
    var id = UUID()
    var name: String
    var urlScheme: String      // es. "youtube://"
    var symbol: String         // SF Symbol
    var drmProtected: Bool     // su CarPlay il video risulta nero
}

final class FMLABSettings: ObservableObject {
    static let shared = FMLABSettings()

    private let defaults = UserDefaults.standard
    private enum Key {
        static let wallpaper = "fmlab.wallpaper"
        static let lock = "fmlab.drivingLock"
        static let threshold = "fmlab.speedThreshold"
        static let badge = "fmlab.statusBadge"
        static let apps = "fmlab.appShortcuts"
        static let adBlock = "fmlab.youtubeAdBlock"
        static let sponsor = "fmlab.youtubeSponsorBlock"
        static let webApps = "fmlab.webApps"
        static let speedHome = "fmlab.speedOnHome"
    }

    /// Velocità grande e nome auto nella home FMLAB sull'auto.
    @Published var showSpeedOnHome: Bool {
        didSet {
            defaults.set(showSpeedOnHome, forKey: Key.speedHome)
            NotificationCenter.default.post(name: .fmlabAppsChanged, object: nil)
            FMLABCarOverlay.shared.refresh()
        }
    }

    /// App web da aprire sullo schermo dell'auto. Le prime 4 hanno un riquadro nella home auto.
    @Published var webApps: [FMLABWebApp] {
        didSet {
            if let data = try? JSONEncoder().encode(webApps) { defaults.set(data, forKey: Key.webApps) }
            NotificationCenter.default.post(name: .fmlabAppsChanged, object: nil)
        }
    }

    static let defaultWebApps: [FMLABWebApp] = [
        FMLABWebApp(name: "Twitch", url: "https://m.twitch.tv", symbol: "dot.radiowaves.left.and.right"),
        FMLABWebApp(name: "Google Maps", url: "https://www.google.com/maps", symbol: "mappin.and.ellipse"),
        FMLABWebApp(name: "TikTok", url: "https://www.tiktok.com", symbol: "music.note.tv"),
        FMLABWebApp(name: "Plex", url: "https://app.plex.tv", symbol: "server.rack"),
        FMLABWebApp(name: "RaiPlay", url: "https://www.raiplay.it", symbol: "tv"),
        FMLABWebApp(name: "Kick", url: "https://kick.com", symbol: "bolt.fill"),
        FMLABWebApp(name: "Vimeo", url: "https://vimeo.com", symbol: "play.circle.fill"),
        FMLABWebApp(name: "Dailymotion", url: "https://www.dailymotion.com", symbol: "play.circle"),
        FMLABWebApp(name: "Google", url: "https://www.google.com", symbol: "magnifyingglass"),
    ]

    /// Blocco pubblicità YouTube nel browser dell'auto (script AdGuard, da CarTube).
    @Published var youtubeAdBlock: Bool {
        didSet { defaults.set(youtubeAdBlock, forKey: Key.adBlock) }
    }

    /// Salta i segmenti sponsorizzati (SponsorBlock, da CarTube).
    @Published var youtubeSponsorBlock: Bool {
        didSet { defaults.set(youtubeSponsorBlock, forKey: Key.sponsor) }
    }

    @Published var wallpaperID: String {
        didSet {
            defaults.set(wallpaperID, forKey: Key.wallpaper)
            FMLABCarOverlay.shared.refreshWallpaper()
        }
    }

    /// Blocco video quando l'auto si muove (attivo di default).
    @Published var drivingLockEnabled: Bool {
        didSet {
            defaults.set(drivingLockEnabled, forKey: Key.lock)
            FMLABCarOverlay.shared.refresh()
        }
    }

    /// Velocità oltre la quale il video va in pausa.
    @Published var speedThresholdKmh: Double {
        didSet {
            defaults.set(speedThresholdKmh, forKey: Key.threshold)
            FMLABCarOverlay.shared.refresh()
        }
    }

    /// Modalità passeggero: NON salvata. Vale solo per il viaggio in corso e si
    /// disattiva da sola quando CarPlay si scollega o l'app viene chiusa.
    @Published var passengerMode: Bool = false {
        didSet {
            if passengerMode != oldValue { FMLABLog.add("Modalità passeggero: \(passengerMode ? "attivata" : "spenta")") }
            FMLABCarOverlay.shared.refresh()
        }
    }

    /// Mostra nome auto e velocità in alto a destra sullo schermo dell'auto.
    @Published var showStatusBadge: Bool {
        didSet {
            defaults.set(showStatusBadge, forKey: Key.badge)
            FMLABCarOverlay.shared.refresh()
        }
    }

    @Published var appShortcuts: [FMLABAppShortcut] {
        didSet {
            saveApps()
            NotificationCenter.default.post(name: .fmlabAppsChanged, object: nil)
        }
    }

    private init() {
        wallpaperID = defaults.string(forKey: Key.wallpaper) ?? "synthwave"
        drivingLockEnabled = defaults.object(forKey: Key.lock) as? Bool ?? true
        let t = defaults.double(forKey: Key.threshold)
        speedThresholdKmh = t > 0 ? t : 5
        showStatusBadge = defaults.object(forKey: Key.badge) as? Bool ?? true
        showSpeedOnHome = defaults.object(forKey: Key.speedHome) as? Bool ?? true
        youtubeAdBlock = defaults.object(forKey: Key.adBlock) as? Bool ?? true
        youtubeSponsorBlock = defaults.object(forKey: Key.sponsor) as? Bool ?? true
        if let data = defaults.data(forKey: Key.webApps),
           let list = try? JSONDecoder().decode([FMLABWebApp].self, from: data) {
            webApps = list
        } else {
            webApps = FMLABSettings.defaultWebApps
        }
        if let data = defaults.data(forKey: Key.apps),
           let apps = try? JSONDecoder().decode([FMLABAppShortcut].self, from: data) {
            appShortcuts = apps
        } else {
            appShortcuts = FMLABSettings.defaultApps
        }
    }

    private func saveApps() {
        if let data = try? JSONEncoder().encode(appShortcuts) {
            defaults.set(data, forKey: Key.apps)
        }
    }

    static let defaultApps: [FMLABAppShortcut] = [
        FMLABAppShortcut(name: "YouTube", urlScheme: "youtube://", symbol: "play.rectangle.fill", drmProtected: false),
        FMLABAppShortcut(name: "Twitch", urlScheme: "twitch://", symbol: "dot.radiowaves.left.and.right", drmProtected: false),
        FMLABAppShortcut(name: "Spotify", urlScheme: "spotify://", symbol: "music.note", drmProtected: false),
        FMLABAppShortcut(name: "WhatsApp", urlScheme: "whatsapp://", symbol: "message.fill", drmProtected: false),
        FMLABAppShortcut(name: "Waze", urlScheme: "waze://", symbol: "map.fill", drmProtected: false),
        FMLABAppShortcut(name: "Google Maps", urlScheme: "comgooglemaps://", symbol: "mappin.and.ellipse", drmProtected: false),
        FMLABAppShortcut(name: "Netflix", urlScheme: "nflx://", symbol: "tv.fill", drmProtected: true),
        FMLABAppShortcut(name: "Prime Video", urlScheme: "aiv://", symbol: "tv.fill", drmProtected: true),
        FMLABAppShortcut(name: "Disney+", urlScheme: "disneyplus://", symbol: "tv.fill", drmProtected: true),
    ]

    // MARK: - App sul telefono

    /// Apre l'app sull'iPhone (anche se il tocco arriva dallo schermo dell'auto).
    func openOnPhone(_ app: FMLABAppShortcut, completion: ((Bool) -> Void)? = nil) {
        var scheme = app.urlScheme.trimmingCharacters(in: .whitespaces)
        if !scheme.contains("://") { scheme += "://" }
        guard let url = URL(string: scheme) else {
            completion?(false)
            return
        }
        UIApplication.shared.open(url, options: [:]) { ok in
            FMLABLog.add("Apertura \(app.name): \(ok ? "ok" : "non riuscita") (\(url.scheme ?? "?"))")
            completion?(ok)
        }
    }

    // MARK: - Sfondi

    /// Passa allo sfondo successivo (anche dal riquadro "Sfondo" sull'auto).
    func nextWallpaper() {
        let list = allWallpapers
        guard !list.isEmpty else { return }
        let i = list.firstIndex(where: { $0.id == wallpaperID }) ?? 0
        wallpaperID = list[(i + 1) % list.count].id
    }

    var allWallpapers: [FMLABWallpaper] {
        var list = FMLABWallpaper.builtIn
        if hasCustomWallpaper { list.append(.custom) }
        return list
    }

    var customWallpaperURL: URL {
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        return docs.appendingPathComponent("fmlab-sfondo-personale.jpg")
    }

    var hasCustomWallpaper: Bool {
        FileManager.default.fileExists(atPath: customWallpaperURL.path)
    }

    func image(for wallpaper: FMLABWallpaper) -> UIImage? {
        if wallpaper.id == FMLABWallpaper.custom.id {
            return UIImage(contentsOfFile: customWallpaperURL.path)
        }
        guard let file = wallpaper.bundleFile,
              let path = Bundle.main.path(forResource: file, ofType: "jpg") else { return nil }
        return UIImage(contentsOfFile: path)
    }

    var currentWallpaperImage: UIImage? {
        let wp = allWallpapers.first(where: { $0.id == wallpaperID }) ?? FMLABWallpaper.black
        return image(for: wp)
    }

    /// Salva l'immagine scelta dall'utente ridimensionata (max 1920 px) e la attiva.
    func saveCustomWallpaper(_ image: UIImage) {
        let maxSide: CGFloat = 1920
        let scale = min(1, maxSide / max(image.size.width, image.size.height))
        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let resized = UIGraphicsImageRenderer(size: size, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }
        guard let data = resized.jpegData(compressionQuality: 0.85) else { return }
        try? data.write(to: customWallpaperURL, options: .atomic)
        objectWillChange.send()
        wallpaperID = FMLABWallpaper.custom.id
        FMLABCarOverlay.shared.refreshWallpaper()
    }

    func removeCustomWallpaper() {
        try? FileManager.default.removeItem(at: customWallpaperURL)
        if wallpaperID == FMLABWallpaper.custom.id { wallpaperID = "synthwave" }
        objectWillChange.send()
    }
}
