//
//  FMLABAppCatalog.swift
//  FMLAB CarPlay
//
//  iOS non permette di leggere l'elenco di tutte le app installate.
//  Si può però chiedere, per ogni schema URL dichiarato in Info.plist
//  (LSApplicationQueriesSchemes, massimo 50), se c'è un'app che lo apre:
//  così FMLAB trova da sola quali app di questo catalogo sono sul telefono.
//

import UIKit

struct FMLABCatalogApp: Identifiable, Hashable {
    var id: String { scheme }
    let name: String
    let scheme: String      // senza "://"
    let symbol: String
    let drm: Bool
    let category: String

    var shortcut: FMLABAppShortcut {
        FMLABAppShortcut(name: name, urlScheme: scheme + "://", symbol: symbol, drmProtected: drm)
    }
}

enum FMLABAppCatalog {
    static let all: [FMLABCatalogApp] = [
        // Video
        .init(name: "YouTube", scheme: "youtube", symbol: "play.rectangle.fill", drm: false, category: "Video"),
        .init(name: "Twitch", scheme: "twitch", symbol: "dot.radiowaves.left.and.right", drm: false, category: "Video"),
        .init(name: "TikTok", scheme: "snssdk1233", symbol: "music.note.tv", drm: false, category: "Video"),
        .init(name: "Vimeo", scheme: "vimeo", symbol: "play.circle.fill", drm: false, category: "Video"),
        .init(name: "Dailymotion", scheme: "dailymotion", symbol: "play.circle", drm: false, category: "Video"),
        .init(name: "Plex", scheme: "plex", symbol: "server.rack", drm: false, category: "Video"),
        .init(name: "Infuse", scheme: "infuse", symbol: "film", drm: false, category: "Video"),
        .init(name: "VLC", scheme: "vlc", symbol: "film.stack", drm: false, category: "Video"),
        .init(name: "Netflix", scheme: "nflx", symbol: "tv.fill", drm: true, category: "Video"),
        .init(name: "Prime Video", scheme: "aiv", symbol: "tv.fill", drm: true, category: "Video"),
        .init(name: "Disney+", scheme: "disneyplus", symbol: "tv.fill", drm: true, category: "Video"),
        .init(name: "DAZN", scheme: "dazn", symbol: "sportscourt.fill", drm: true, category: "Video"),
        // Musica e audio
        .init(name: "Spotify", scheme: "spotify", symbol: "music.note", drm: false, category: "Musica"),
        .init(name: "YouTube Music", scheme: "youtubemusic", symbol: "music.note.list", drm: false, category: "Musica"),
        .init(name: "Amazon Music", scheme: "amznmp3", symbol: "music.quarternote.3", drm: false, category: "Musica"),
        .init(name: "Deezer", scheme: "deezer", symbol: "waveform", drm: false, category: "Musica"),
        .init(name: "SoundCloud", scheme: "soundcloud", symbol: "cloud.fill", drm: false, category: "Musica"),
        .init(name: "Tidal", scheme: "tidal", symbol: "water.waves", drm: false, category: "Musica"),
        .init(name: "Shazam", scheme: "shazam", symbol: "shazam.logo", drm: false, category: "Musica"),
        .init(name: "Audible", scheme: "audible", symbol: "headphones", drm: false, category: "Musica"),
        .init(name: "Podcast", scheme: "podcasts", symbol: "antenna.radiowaves.left.and.right", drm: false, category: "Musica"),
        // Mappe
        .init(name: "Waze", scheme: "waze", symbol: "map.fill", drm: false, category: "Mappe"),
        .init(name: "Google Maps", scheme: "comgooglemaps", symbol: "mappin.and.ellipse", drm: false, category: "Mappe"),
        .init(name: "Mappe", scheme: "maps", symbol: "map", drm: false, category: "Mappe"),
        .init(name: "Uber", scheme: "uber", symbol: "car.fill", drm: false, category: "Mappe"),
        // Messaggi e social
        .init(name: "WhatsApp", scheme: "whatsapp", symbol: "message.fill", drm: false, category: "Social"),
        .init(name: "Telegram", scheme: "tg", symbol: "paperplane.fill", drm: false, category: "Social"),
        .init(name: "Messenger", scheme: "fb-messenger", symbol: "bubble.left.and.bubble.right.fill", drm: false, category: "Social"),
        .init(name: "Instagram", scheme: "instagram", symbol: "camera.fill", drm: false, category: "Social"),
        .init(name: "Facebook", scheme: "fb", symbol: "person.2.fill", drm: false, category: "Social"),
        .init(name: "X", scheme: "twitter", symbol: "at", drm: false, category: "Social"),
        .init(name: "Reddit", scheme: "reddit", symbol: "text.bubble.fill", drm: false, category: "Social"),
        .init(name: "Snapchat", scheme: "snapchat", symbol: "camera.viewfinder", drm: false, category: "Social"),
        .init(name: "Discord", scheme: "discord", symbol: "gamecontroller", drm: false, category: "Social"),
        // Lavoro e utilità
        .init(name: "Zoom", scheme: "zoomus", symbol: "video.fill", drm: false, category: "Lavoro"),
        .init(name: "Teams", scheme: "msteams", symbol: "person.3.fill", drm: false, category: "Lavoro"),
        .init(name: "Gmail", scheme: "googlegmail", symbol: "envelope.fill", drm: false, category: "Lavoro"),
        .init(name: "Outlook", scheme: "ms-outlook", symbol: "envelope", drm: false, category: "Lavoro"),
        .init(name: "Chrome", scheme: "googlechrome", symbol: "globe", drm: false, category: "Lavoro"),
        .init(name: "Firefox", scheme: "firefox", symbol: "flame.fill", drm: false, category: "Lavoro"),
        .init(name: "Google Foto", scheme: "googlephotos", symbol: "photo.fill", drm: false, category: "Lavoro"),
        .init(name: "Google Drive", scheme: "googledrive", symbol: "externaldrive.fill", drm: false, category: "Lavoro"),
        // Giochi
        .init(name: "Steam Link", scheme: "steamlink", symbol: "gamecontroller.fill", drm: false, category: "Giochi"),
        .init(name: "Steam", scheme: "steam", symbol: "gamecontroller.fill", drm: false, category: "Giochi"),
        .init(name: "Xbox", scheme: "xbox", symbol: "gamecontroller.fill", drm: false, category: "Giochi"),
        .init(name: "PS Remote Play", scheme: "psremoteplay", symbol: "gamecontroller.fill", drm: false, category: "Giochi"),
    ]

    /// App del catalogo installate su questo iPhone.
    static func installed() -> [FMLABCatalogApp] {
        all.filter { app in
            guard let url = URL(string: app.scheme + "://") else { return false }
            return UIApplication.shared.canOpenURL(url)
        }
    }
}
