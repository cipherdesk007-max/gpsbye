//
//  FMLABCarHome.swift
//  FMLAB CarPlay
//
//  La "home" FMLAB sullo schermo dell'auto: orologio, data, riquadri grandi
//  (specchiatura, YouTube, browser, app preferite) sopra lo sfondo scelto.
//  Si comanda toccando lo schermo dell'auto (se l'auto passa i tocchi all'app)
//  oppure dal Telecomando nell'app sull'iPhone, che funziona sempre.
//

import UIKit

/// Chi decide cosa mostra lo schermo dell'auto. Il CarPlaySceneDelegate
/// registra qui le funzioni che cambiano modalità.
final class FMLABCarRouter {
    static let shared = FMLABCarRouter()

    enum Mode: String {
        case home = "Home FMLAB"
        case mirror = "Specchiatura"
        case web = "Browser"
        case video = "Video"
        case settings = "Impostazioni auto"

        /// Schermate FMLAB senza video: restano usabili in marcia.
        var isFMLABScreen: Bool { self == .home || self == .settings }
    }

    private(set) var mode: Mode = .home
    var showHomeHandler: (() -> Void)?
    var showMirrorHandler: (() -> Void)?
    var showWebHandler: ((URL?) -> Void)?
    var showSettingsHandler: (() -> Void)?

    static let youtubeURL = URL(string: "https://m.youtube.com")!

    func setMode(_ newMode: Mode) {
        mode = newMode
        NotificationCenter.default.post(name: .fmlabCarModeChanged, object: nil)
        FMLABCarOverlay.shared.refresh()
    }

    func showHome() { DispatchQueue.main.async { self.showHomeHandler?() } }
    func showMirror() { DispatchQueue.main.async { self.showMirrorHandler?() } }
    func showWeb(_ url: URL?) { DispatchQueue.main.async { self.showWebHandler?(url) } }
    func showSettings() { DispatchQueue.main.async { self.showSettingsHandler?() } }

    var isCarConnected: Bool { showHomeHandler != nil && FMLABCarMonitor.shared.carPlayConnected }
}

extension Notification.Name {
    static let fmlabCarModeChanged = Notification.Name("fmlab.carModeChanged")
}

/// Riquadro grande, leggibile da lontano.
final class FMLABTile: UIControl {
    private let card = UIView()
    private let iconView = UIImageView()
    private let titleLabel = UILabel()
    private let action: () -> Void

    init(title: String, symbol: String, tint: UIColor, action: @escaping () -> Void) {
        self.action = action
        super.init(frame: .zero)
        card.isUserInteractionEnabled = false
        card.backgroundColor = UIColor(white: 0.06, alpha: 0.72)
        card.layer.cornerRadius = 18
        card.layer.borderWidth = 1
        card.layer.borderColor = UIColor(white: 1, alpha: 0.12).cgColor
        addSubview(card)
        iconView.image = UIImage(systemName: symbol) ?? UIImage(systemName: "app.fill")
        iconView.tintColor = tint
        iconView.contentMode = .scaleAspectFit
        card.addSubview(iconView)
        titleLabel.text = title
        titleLabel.textColor = .white
        titleLabel.textAlignment = .center
        titleLabel.adjustsFontSizeToFitWidth = true
        titleLabel.minimumScaleFactor = 0.6
        card.addSubview(titleLabel)
        addTarget(self, action: #selector(tapped), for: .touchUpInside)
        accessibilityLabel = title
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) non usato") }

    override var isHighlighted: Bool {
        didSet {
            card.alpha = isHighlighted ? 0.6 : 1
            card.transform = isHighlighted ? CGAffineTransform(scaleX: 0.96, y: 0.96) : .identity
        }
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        card.frame = bounds
        let iconSide = min(bounds.width, bounds.height) * 0.42
        iconView.frame = CGRect(x: (bounds.width - iconSide) / 2, y: bounds.height * 0.16,
                                width: iconSide, height: iconSide)
        titleLabel.font = .systemFont(ofSize: max(12, min(bounds.width * 0.13, bounds.height * 0.16)), weight: .semibold)
        titleLabel.frame = CGRect(x: 8, y: iconView.frame.maxY + bounds.height * 0.06,
                                  width: bounds.width - 16, height: bounds.height * 0.22)
    }

    @objc private func tapped() { action() }
}

final class FMLABCarHomeView: UIView {
    private let clockLabel = UILabel()
    private let dateLabel = UILabel()
    private let speedLabel = UILabel()
    private let carLabel = UILabel()
    /// Per le anteprime di test: auto e velocità finte.
    var previewStatus: (car: String, kmh: Double)? { didSet { updateStatus() } }
    /// Per i test.
    var isShowingSpeed: Bool { !speedLabel.isHidden }
    var tileTitles: [String] { tiles.filter { !$0.isHidden }.compactMap(\.accessibilityLabel) }
    private let hintLabel = UILabel()
    private var tiles: [FMLABTile] = []
    private var timer: Timer?
    /// Sfumatura scura in alto: orologio e data leggibili anche sugli sfondi chiari.
    private let topScrim = CAGradientLayer()

    private static let timeFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "it_IT")
        f.dateFormat = "HH:mm"
        return f
    }()

    private static let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "it_IT")
        f.dateFormat = "EEEE d MMMM"
        return f
    }()

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
        topScrim.colors = [UIColor.black.withAlphaComponent(0.45).cgColor, UIColor.black.withAlphaComponent(0).cgColor]
        topScrim.startPoint = CGPoint(x: 0.5, y: 0)
        topScrim.endPoint = CGPoint(x: 0.5, y: 1)
        layer.insertSublayer(topScrim, at: 0)
        speedLabel.textAlignment = .right
        carLabel.textAlignment = .right
        for label in [clockLabel, dateLabel, hintLabel, speedLabel, carLabel] {
            label.textColor = .white
            label.layer.shadowColor = UIColor.black.cgColor
            label.layer.shadowOpacity = 0.7
            label.layer.shadowRadius = 4
            label.layer.shadowOffset = .zero
            addSubview(label)
        }
        hintLabel.text = "Comandi anche dall'iPhone: FMLAB › Telecomando auto"
        hintLabel.textColor = UIColor(white: 1, alpha: 0.75)
        buildTiles()
        updateClock()
        NotificationCenter.default.addObserver(self, selector: #selector(appsChanged),
                                               name: .fmlabAppsChanged, object: nil)
        updateStatus()
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            self?.updateClock()
            self?.updateStatus()
        }
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) non usato") }

    deinit {
        timer?.invalidate()
        NotificationCenter.default.removeObserver(self)
    }

    /// Cambi l'elenco app sull'iPhone -> i riquadri sull'auto si aggiornano subito.
    @objc private func appsChanged() {
        DispatchQueue.main.async {
            self.tiles.forEach { $0.removeFromSuperview() }
            self.buildTiles()
            self.setNeedsLayout()
        }
    }

    private func updateStatus() {
        let show = FMLABSettings.shared.showSpeedOnHome
        speedLabel.isHidden = !show
        carLabel.isHidden = !show
        guard show else { return }
        let monitor = FMLABCarMonitor.shared
        let kmh = previewStatus?.kmh ?? monitor.speedKmh
        let car = previewStatus?.car ?? monitor.carName ?? (monitor.carPlayConnected ? "CarPlay" : "")
        let number = kmh.map { "\(Int($0.rounded()))" } ?? "—"
        let big = UIFont.monospacedDigitSystemFont(ofSize: speedLabel.font.pointSize, weight: .bold)
        let small = UIFont.systemFont(ofSize: max(12, speedLabel.font.pointSize * 0.35), weight: .semibold)
        let text = NSMutableAttributedString(string: number, attributes: [.font: big, .foregroundColor: UIColor.white])
        text.append(NSAttributedString(string: " km/h", attributes: [.font: small, .foregroundColor: UIColor(white: 1, alpha: 0.8)]))
        speedLabel.attributedText = text
        carLabel.text = car
    }

    private func updateClock() {
        let now = Date()
        clockLabel.text = Self.timeFormatter.string(from: now)
        dateLabel.text = Self.dateFormatter.string(from: now).capitalized
    }

    private func buildTiles() {
        let accent = UIColor(red: 0.18, green: 0.55, blue: 1.0, alpha: 1)
        var list: [FMLABTile] = [
            FMLABTile(title: "Specchia iPhone", symbol: "rectangle.on.rectangle", tint: accent) {
                FMLABCarRouter.shared.showMirror()
            },
            FMLABTile(title: "YouTube", symbol: "play.rectangle.fill", tint: .systemRed) {
                FMLABCarRouter.shared.showWeb(FMLABCarRouter.youtubeURL)
            },
            FMLABTile(title: "Browser", symbol: "safari.fill", tint: .systemTeal) {
                FMLABCarRouter.shared.showWeb(nil)
            },
            FMLABTile(title: "Impostazioni", symbol: "gearshape.fill", tint: .systemGray) {
                FMLABCarRouter.shared.showSettings()
            },
        ]
        // App web: si aprono direttamente sull'auto (prime 4)
        var shownNames: Set<String> = ["youtube"]
        for web in FMLABSettings.shared.webApps.prefix(4) {
            shownNames.insert(web.name.lowercased())
            list.append(FMLABTile(title: web.name, symbol: web.symbol, tint: .systemTeal) {
                if let url = web.resolvedURL { FMLABCarRouter.shared.showWeb(url) }
            })
        }
        // App del telefono (via specchiatura); niente doppioni con YouTube e le app web
        let favorites = FMLABSettings.shared.appShortcuts.filter {
            fmlabNormalizedScheme($0.urlScheme) != "youtube" && !shownNames.contains($0.name.lowercased())
        }
        for app in favorites.prefix(8) {
            list.append(FMLABTile(title: app.name, symbol: app.symbol,
                                  tint: app.drmProtected ? .systemOrange : .white) {
                FMLABSettings.shared.openOnPhone(app)
            })
        }
        tiles = list
        tiles.forEach { addSubview($0) }
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        guard bounds.width > 0, bounds.height > 0 else { return }
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        topScrim.frame = CGRect(x: 0, y: 0, width: bounds.width, height: bounds.height * 0.42)
        CATransaction.commit()
        let pad = max(14, bounds.width * 0.022)
        let topH = bounds.height * 0.28
        clockLabel.font = .monospacedDigitSystemFont(ofSize: topH * 0.52, weight: .bold)
        clockLabel.frame = CGRect(x: pad, y: pad * 0.4, width: bounds.width * 0.5, height: topH * 0.62)
        dateLabel.font = .systemFont(ofSize: max(13, topH * 0.17), weight: .medium)
        dateLabel.frame = CGRect(x: pad, y: clockLabel.frame.maxY - 2, width: bounds.width * 0.6, height: topH * 0.26)
        speedLabel.font = .monospacedDigitSystemFont(ofSize: topH * 0.46, weight: .bold)
        speedLabel.frame = CGRect(x: bounds.width * 0.45, y: pad * 0.4, width: bounds.width * 0.55 - pad, height: topH * 0.62)
        carLabel.font = .systemFont(ofSize: max(13, topH * 0.17), weight: .medium)
        carLabel.frame = CGRect(x: bounds.width * 0.45, y: speedLabel.frame.maxY - 2, width: bounds.width * 0.55 - pad, height: topH * 0.26)
        updateStatus()

        let hintH: CGFloat = max(16, bounds.height * 0.045)
        hintLabel.font = .systemFont(ofSize: hintH * 0.72, weight: .regular)
        hintLabel.frame = CGRect(x: pad, y: bounds.height - pad * 0.6 - hintH, width: bounds.width * 0.62, height: hintH)

        let wide = bounds.width / bounds.height > 2.1
        let cols = wide ? 6 : 4
        let rows = 2
        let gap = pad * 0.55
        let gridTop = topH + pad * 0.5
        let gridBottom = hintLabel.frame.minY - pad * 0.4
        let tileW = (bounds.width - pad * 2 - gap * CGFloat(cols - 1)) / CGFloat(cols)
        let tileH = min(tileW * 0.92, (gridBottom - gridTop - gap * CGFloat(rows - 1)) / CGFloat(rows))
        // le ultime caselle in basso a destra restano libere: lì c'è il logo FMLAB dello sfondo
        // (sugli schermi larghi il logo è più largo di una casella: ne lascio libere 2)
        let capacity = cols * rows - (wide ? 2 : 1)
        for (i, tile) in tiles.enumerated() {
            guard i < capacity else { tile.isHidden = true; continue }
            tile.isHidden = false
            let r = i / cols, c = i % cols
            tile.frame = CGRect(x: pad + CGFloat(c) * (tileW + gap),
                                y: gridTop + CGFloat(r) * (tileH + gap),
                                width: tileW, height: tileH)
        }
    }
}

/// Anteprime dello schermo auto renderizzate dal vero codice (per i test sul simulatore).
/// Si attiva lanciando l'app con l'argomento -fmlabCarPreview.
enum FMLABCarPreview {
    static var requested: Bool {
        ProcessInfo.processInfo.arguments.contains("-fmlabCarPreview")
    }

    enum Overlay { case none, driving(Double), passenger, call }

    static func renderAll() {
        render(size: CGSize(width: 1280, height: 480), name: "carpreview-1-home-schermo-largo", overlay: .none, badge: nil)
        render(size: CGSize(width: 800, height: 480), name: "carpreview-2-home-schermo-standard", overlay: .none, badge: nil)
        render(size: CGSize(width: 1280, height: 480), name: "carpreview-3-blocco-guida", overlay: .driving(47), badge: nil, kmh: 47)
        render(size: CGSize(width: 1280, height: 480), name: "carpreview-4-passeggero", overlay: .passenger, badge: nil, kmh: 47)
        render(size: CGSize(width: 1280, height: 480), name: "carpreview-5-chiamata", overlay: .call, badge: nil)
        render(size: CGSize(width: 1280, height: 480), name: "carpreview-6-notte", overlay: .none, badge: nil, night: true)
        renderSettings(size: CGSize(width: 1280, height: 480), name: "carpreview-7-impostazioni-schermo-largo")
        renderSettings(size: CGSize(width: 800, height: 480), name: "carpreview-8-impostazioni-schermo-standard")
        // Ogni sfondo sulle 3 misure di schermo più comuni, per controllare il taglio del logo
        let settings = FMLABSettings.shared
        for wp in FMLABWallpaper.builtIn where wp.bundleFile != nil {
            for size in [CGSize(width: 800, height: 480), CGSize(width: 1280, height: 480), CGSize(width: 1920, height: 720)] {
                render(size: size, name: "sfondo-\(wp.id)-\(Int(size.width))x\(Int(size.height))",
                       overlay: .none, badge: nil, wallpaperImage: settings.image(for: wp))
            }
        }
    }

    private static func renderSettings(size: CGSize, name: String) {
        let root = UIView(frame: CGRect(origin: .zero, size: size))
        root.backgroundColor = .black
        let wallpaper = FMLABWallpaperView(frame: root.bounds)
        wallpaper.image = FMLABSettings.shared.currentWallpaperImage
        root.addSubview(wallpaper)
        let panel = FMLABCarSettingsView(frame: root.bounds)
        panel.previewStatus = (car: "Golf 8", kmh: 0)
        root.addSubview(panel)
        root.layoutIfNeeded()
        root.subviews.forEach { $0.setNeedsLayout(); $0.layoutIfNeeded() }
        save(root, name: name)
    }

    private static func save(_ root: UIView, name: String) {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let image = UIGraphicsImageRenderer(bounds: root.bounds, format: format).image { ctx in
            root.layer.render(in: ctx.cgContext)
        }
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        try? image.pngData()?.write(to: docs.appendingPathComponent(name + ".png"))
    }

    private static func render(size: CGSize, name: String, overlay: Overlay, badge: String?, night: Bool = false,
                               wallpaperImage: UIImage? = nil, kmh: Double = 0) {
        let root = UIView(frame: CGRect(origin: .zero, size: size))
        root.backgroundColor = .black
        root.overrideUserInterfaceStyle = night ? .dark : .light
        let wallpaper = FMLABWallpaperView(frame: root.bounds)
        wallpaper.image = wallpaperImage ?? FMLABSettings.shared.currentWallpaperImage
        // fuori da una finestra iOS non applica la modalità scura: la forzo per il test
        wallpaper.forceNight = night
        root.addSubview(wallpaper)
        let home = FMLABCarHomeView(frame: root.bounds)
        home.previewStatus = (car: "Golf 8", kmh: kmh)
        root.addSubview(home)
        if let badge {
            let b = FMLABBadgeView()
            b.label.text = badge
            let w = b.label.intrinsicContentSize.width + 24
            b.frame = CGRect(x: size.width - w - 12, y: 12, width: w, height: 30)
            root.addSubview(b)
        }
        switch overlay {
        case .driving(let kmh):
            let lock = FMLABLockView(frame: root.bounds)
            lock.showDriving(speedKmh: kmh)
            root.addSubview(lock)
        case .call:
            let lock = FMLABLockView(frame: root.bounds)
            lock.showCall()
            root.addSubview(lock)
        case .none, .passenger:
            break
        }
        root.setNeedsLayout()
        root.layoutIfNeeded()
        root.subviews.forEach { $0.setNeedsLayout(); $0.layoutIfNeeded() }
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1   // pixel = punti dello schermo auto, file leggeri
        let image = UIGraphicsImageRenderer(bounds: root.bounds, format: format).image { ctx in
            root.layer.render(in: ctx.cgContext)
        }
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        try? image.pngData()?.write(to: docs.appendingPathComponent(name + ".png"))
    }
}
