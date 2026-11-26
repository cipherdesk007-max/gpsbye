//
//  FMLABCarOverlay.swift
//  FMLAB CarPlay
//
//  Livelli FMLAB sullo schermo dell'auto, sopra/sotto i contenuti TDS:
//  - sfondo (sotto la specchiatura, visibile quando non arriva l'immagine del telefono)
//  - targhetta auto + velocità (in alto a destra)
//  - blocco di guida / chiamata in corso (sopra a tutto)
//

import UIKit

/// Immagine "aspect fill" ancorata in basso: sugli schermi larghi (8:3) taglia
/// il cielo e non il logo FMLAB in basso a destra.
final class FMLABWallpaperView: UIView {
    private let imageView = UIImageView()
    /// Di notte (auto in modalità scura) lo sfondo si scurisce per non abbagliare.
    private let nightDim = UIView()
    /// nil = segue la modalità scura dell'auto; true/false = forzato (anteprime di test).
    var forceNight: Bool? { didSet { setNeedsLayout() } }

    var image: UIImage? {
        didSet {
            imageView.image = image
            isHidden = (image == nil)
            setNeedsLayout()
        }
    }

    override init(frame: CGRect) {
        super.init(frame: frame)
        clipsToBounds = true
        isUserInteractionEnabled = false
        backgroundColor = .black
        imageView.contentMode = .scaleToFill
        addSubview(imageView)
        nightDim.backgroundColor = .black
        nightDim.isUserInteractionEnabled = false
        addSubview(nightDim)
    }

    override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
        super.traitCollectionDidChange(previousTraitCollection)
        setNeedsLayout()
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) non usato") }

    override func layoutSubviews() {
        super.layoutSubviews()
        nightDim.frame = bounds
        let night = forceNight ?? (traitCollection.userInterfaceStyle == .dark)
        nightDim.alpha = night ? 0.35 : 0
        guard let img = imageView.image, img.size.width > 0, img.size.height > 0,
              bounds.width > 0, bounds.height > 0 else { return }
        let scale = max(bounds.width / img.size.width, bounds.height / img.size.height)
        let w = img.size.width * scale
        let h = img.size.height * scale
        imageView.frame = CGRect(x: (bounds.width - w) / 2, y: bounds.height - h, width: w, height: h)
    }
}

final class FMLABBadgeView: UIView {
    let label = UILabel()

    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
        backgroundColor = UIColor.black.withAlphaComponent(0.55)
        layer.cornerRadius = 14
        layer.masksToBounds = true
        label.font = .systemFont(ofSize: 15, weight: .semibold)
        label.textColor = .white
        label.translatesAutoresizingMaskIntoConstraints = false
        addSubview(label)
        NSLayoutConstraint.activate([
            label.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
            label.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -12),
            label.topAnchor.constraint(equalTo: topAnchor, constant: 6),
            label.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -6),
        ])
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) non usato") }
}

final class FMLABLockView: UIView {
    private let blur = UIVisualEffectView(effect: UIBlurEffect(style: .systemThickMaterialDark))
    private let icon = UILabel()
    private let title = UILabel()
    private let subtitle = UILabel()

    override init(frame: CGRect) {
        super.init(frame: frame)
        // blocca anche i tocchi sullo schermo dell'auto mentre è attivo
        isUserInteractionEnabled = true
        backgroundColor = UIColor.black.withAlphaComponent(0.45)
        blur.translatesAutoresizingMaskIntoConstraints = false
        addSubview(blur)
        icon.font = .systemFont(ofSize: 64, weight: .heavy)
        title.font = .systemFont(ofSize: 26, weight: .bold)
        subtitle.font = .systemFont(ofSize: 17, weight: .regular)
        subtitle.numberOfLines = 0
        [icon, title, subtitle].forEach {
            $0.textAlignment = .center
            $0.textColor = .white
        }
        title.textColor = UIColor.systemOrange
        let stack = UIStackView(arrangedSubviews: [icon, title, subtitle])
        stack.axis = .vertical
        stack.spacing = 10
        stack.alignment = .center
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)
        NSLayoutConstraint.activate([
            blur.topAnchor.constraint(equalTo: topAnchor),
            blur.bottomAnchor.constraint(equalTo: bottomAnchor),
            blur.leadingAnchor.constraint(equalTo: leadingAnchor),
            blur.trailingAnchor.constraint(equalTo: trailingAnchor),
            stack.centerXAnchor.constraint(equalTo: centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: centerYAnchor),
            stack.leadingAnchor.constraint(greaterThanOrEqualTo: leadingAnchor, constant: 40),
            stack.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor, constant: -40),
        ])
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) non usato") }

    func showDriving(speedKmh: Double?) {
        icon.text = speedKmh.map { "\(Int($0.rounded())) km/h" } ?? "In marcia"
        title.text = "Video in pausa mentre guidi"
        subtitle.text = "L'audio continua. Il video riprende da solo quando sei fermo.\nSe guarda il passeggero, attiva la Modalità passeggero sull'iPhone."
    }

    func showCall() {
        icon.text = "📞"
        title.text = "Chiamata in corso"
        subtitle.text = "Lo schermo torna visibile alla fine della chiamata."
    }
}

enum FMLABLockDecision: String, Equatable {
    case none, driving, call
}

final class FMLABCarOverlay {
    static let shared = FMLABCarOverlay()

    /// Regola del blocco, separata per poterla testare.
    /// - chiamata in corso: sempre schermata chiamata
    /// - in marcia, blocco attivo, niente modalità passeggero, contenuto video/web/specchiatura: blocco
    /// - la home FMLAB non si blocca (non ha video)
    static func decide(lockEnabled: Bool, passenger: Bool, moving: Bool,
                       mode: FMLABCarRouter.Mode, onCall: Bool) -> FMLABLockDecision {
        if onCall { return .call }
        if lockEnabled && !passenger && moving && mode != .home { return .driving }
        return .none
    }

    private weak var window: UIWindow?
    private let wallpaperView = FMLABWallpaperView()
    private let badgeView = FMLABBadgeView()
    private let lockView = FMLABLockView()
    private let homeButton = UIButton(type: .system)

    private init() {
        var cfg = UIButton.Configuration.filled()
        cfg.title = "Home"
        cfg.image = UIImage(systemName: "house.fill")
        cfg.imagePadding = 6
        cfg.cornerStyle = .capsule
        cfg.baseBackgroundColor = UIColor.black.withAlphaComponent(0.6)
        cfg.baseForegroundColor = .white
        homeButton.configuration = cfg
        homeButton.addAction(UIAction { _ in FMLABCarRouter.shared.showHome() }, for: .touchUpInside)
        wallpaperView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        lockView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        lockView.isHidden = true
    }

    /// Da chiamare ogni volta che TDS cambia il contenuto della finestra CarPlay
    /// (specchiatura, video, browser): i livelli FMLAB vengono rimessi al loro posto.
    func attach(to window: UIWindow?) {
        DispatchQueue.main.async {
            guard let window else { return }
            self.window = window
            let host: UIView = window.rootViewController?.view ?? window

            self.wallpaperView.removeFromSuperview()
            self.wallpaperView.frame = host.bounds
            host.insertSubview(self.wallpaperView, at: 0)

            self.badgeView.removeFromSuperview()
            self.badgeView.translatesAutoresizingMaskIntoConstraints = false
            host.addSubview(self.badgeView)
            NSLayoutConstraint.activate([
                self.badgeView.topAnchor.constraint(equalTo: host.safeAreaLayoutGuide.topAnchor, constant: 10),
                self.badgeView.trailingAnchor.constraint(equalTo: host.safeAreaLayoutGuide.trailingAnchor, constant: -10),
            ])

            self.homeButton.removeFromSuperview()
            self.homeButton.translatesAutoresizingMaskIntoConstraints = false
            host.addSubview(self.homeButton)
            NSLayoutConstraint.activate([
                self.homeButton.bottomAnchor.constraint(equalTo: host.safeAreaLayoutGuide.bottomAnchor, constant: -10),
                self.homeButton.leadingAnchor.constraint(equalTo: host.safeAreaLayoutGuide.leadingAnchor, constant: 10),
            ])

            self.lockView.removeFromSuperview()
            self.lockView.frame = host.bounds
            host.addSubview(self.lockView)

            self.applyWallpaper()
            self.applyState()
        }
    }

    func refreshWallpaper() {
        DispatchQueue.main.async { self.applyWallpaper() }
    }

    func refresh() {
        DispatchQueue.main.async { self.applyState() }
    }

    /// Se c'è uno sfondo, il riquadro della specchiatura deve essere trasparente.
    var mirrorBackgroundColor: UIColor {
        FMLABSettings.shared.currentWallpaperImage == nil ? .black : .clear
    }

    private func applyWallpaper() {
        wallpaperView.image = FMLABSettings.shared.currentWallpaperImage
    }

    private func applyState() {
        guard window != nil else { return }
        let settings = FMLABSettings.shared
        let monitor = FMLABCarMonitor.shared

        switch Self.decide(lockEnabled: settings.drivingLockEnabled, passenger: settings.passengerMode,
                           moving: monitor.isMoving, mode: FMLABCarRouter.shared.mode, onCall: monitor.onCall) {
        case .call:
            lockView.showCall()
            lockView.isHidden = false
        case .driving:
            lockView.showDriving(speedKmh: monitor.speedKmh)
            lockView.isHidden = false
        case .none:
            lockView.isHidden = true
        }

        var parts: [String] = []
        if let name = monitor.carName, !name.isEmpty { parts.append(name) }
        if let kmh = monitor.speedKmh { parts.append("\(Int(kmh.rounded())) km/h") }
        if settings.passengerMode { parts.append("Passeggero") }
        badgeView.label.text = parts.joined(separator: " · ")
        badgeView.isHidden = !settings.showStatusBadge || parts.isEmpty || !lockView.isHidden

        homeButton.isHidden = FMLABCarRouter.shared.mode == .home || !lockView.isHidden

        badgeView.superview?.bringSubviewToFront(badgeView)
        homeButton.superview?.bringSubviewToFront(homeButton)
        lockView.superview?.bringSubviewToFront(lockView)
    }
}
