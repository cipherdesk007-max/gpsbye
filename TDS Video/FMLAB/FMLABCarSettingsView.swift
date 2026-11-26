//
//  FMLABCarSettingsView.swift
//  FMLAB CarPlay
//
//  Menu Impostazioni direttamente sullo schermo dell'auto: sfondo, opzioni
//  di visualizzazione e dati dell'auto. Controlli grandi, pensati per il tocco.
//  La modalità passeggero resta solo sull'iPhone (serve una conferma).
//

import UIKit

/// Riga con titolo e interruttore grande.
final class FMLABToggleRow: UIView {
    let titleLabel = UILabel()
    let toggle = UISwitch()
    private let onChange: (Bool) -> Void

    init(title: String, isOn: Bool, onChange: @escaping (Bool) -> Void) {
        self.onChange = onChange
        super.init(frame: .zero)
        backgroundColor = UIColor(white: 0.06, alpha: 0.72)
        layer.cornerRadius = 14
        titleLabel.text = title
        titleLabel.textColor = .white
        titleLabel.adjustsFontSizeToFitWidth = true
        titleLabel.minimumScaleFactor = 0.7
        addSubview(titleLabel)
        toggle.isOn = isOn
        toggle.onTintColor = UIColor(red: 0.18, green: 0.55, blue: 1.0, alpha: 1)
        toggle.addTarget(self, action: #selector(changed), for: .valueChanged)
        addSubview(toggle)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) non usato") }

    @objc private func changed() {
        FMLABLog.add("Tocco dall'auto: \(titleLabel.text ?? "?") = \(toggle.isOn ? "sì" : "no")")
        onChange(toggle.isOn)
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        let pad: CGFloat = 14
        let sw = toggle.intrinsicContentSize
        toggle.frame = CGRect(x: bounds.width - pad - sw.width, y: (bounds.height - sw.height) / 2,
                              width: sw.width, height: sw.height)
        titleLabel.font = .systemFont(ofSize: max(14, bounds.height * 0.32), weight: .semibold)
        titleLabel.frame = CGRect(x: pad, y: 0, width: toggle.frame.minX - pad * 2, height: bounds.height)
    }
}

final class FMLABCarSettingsView: UIView {
    private let titleLabel = UILabel()
    private let homeButton = UIButton(type: .system)
    private let wallpaperTitle = UILabel()
    private var thumbs: [UIButton] = []
    private var wallpaperIDs: [String] = []
    private var rows: [FMLABToggleRow] = []
    private let infoCard = UIView()
    private let infoTitle = UILabel()
    private let infoLabel = UILabel()
    private var timer: Timer?
    /// Per le anteprime di test.
    var previewStatus: (car: String, kmh: Double)? { didSet { updateInfo() } }

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = UIColor.black.withAlphaComponent(0.35)

        titleLabel.text = "Impostazioni"
        titleLabel.textColor = .white
        addSubview(titleLabel)

        var cfg = UIButton.Configuration.filled()
        cfg.title = "Home"
        cfg.image = UIImage(systemName: "house.fill")
        cfg.imagePadding = 8
        cfg.cornerStyle = .capsule
        cfg.baseBackgroundColor = UIColor(red: 0.18, green: 0.55, blue: 1.0, alpha: 1)
        cfg.baseForegroundColor = .white
        homeButton.configuration = cfg
        homeButton.addAction(UIAction { _ in FMLABCarRouter.shared.showHome() }, for: .touchUpInside)
        addSubview(homeButton)

        wallpaperTitle.text = "Sfondo"
        wallpaperTitle.textColor = UIColor(white: 1, alpha: 0.85)
        addSubview(wallpaperTitle)
        buildThumbs()

        let s = FMLABSettings.shared
        rows = [
            FMLABToggleRow(title: "Velocità grande nella home", isOn: s.showSpeedOnHome) { s.showSpeedOnHome = $0 },
            FMLABToggleRow(title: "Auto e velocità in alto", isOn: s.showStatusBadge) { s.showStatusBadge = $0 },
            FMLABToggleRow(title: "YouTube senza pubblicità", isOn: s.youtubeAdBlock) { s.youtubeAdBlock = $0 },
        ]
        rows.forEach { addSubview($0) }

        infoCard.backgroundColor = UIColor(white: 0.06, alpha: 0.78)
        infoCard.layer.cornerRadius = 16
        addSubview(infoCard)
        infoTitle.text = "La tua auto"
        infoTitle.textColor = .white
        infoCard.addSubview(infoTitle)
        infoLabel.numberOfLines = 0
        infoLabel.textColor = UIColor(white: 1, alpha: 0.9)
        infoCard.addSubview(infoLabel)

        updateInfo()
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in self?.updateInfo() }
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) non usato") }

    deinit { timer?.invalidate() }

    var thumbCount: Int { thumbs.count }

    /// Per i test: tocca la miniatura n.
    func tapThumb(_ index: Int) {
        guard thumbs.indices.contains(index) else { return }
        thumbs[index].sendActions(for: .touchUpInside)
    }

    private func buildThumbs() {
        thumbs.forEach { $0.removeFromSuperview() }
        let s = FMLABSettings.shared
        let list = s.allWallpapers
        wallpaperIDs = list.map(\.id)
        thumbs = list.map { wp in
            let b = UIButton(type: .custom)
            b.backgroundColor = .black
            b.setImage(s.image(for: wp), for: .normal)
            b.imageView?.contentMode = .scaleAspectFill
            b.clipsToBounds = true
            b.layer.cornerRadius = 10
            b.accessibilityLabel = wp.name
            b.addAction(UIAction { [weak self] _ in
                FMLABSettings.shared.wallpaperID = wp.id
                self?.updateSelection()
            }, for: .touchUpInside)
            addSubview(b)
            return b
        }
        updateSelection()
    }

    private func updateSelection() {
        let current = FMLABSettings.shared.wallpaperID
        for (i, b) in thumbs.enumerated() {
            let selected = wallpaperIDs[i] == current
            b.layer.borderWidth = selected ? 4 : 1
            b.layer.borderColor = (selected ? UIColor(red: 0.18, green: 0.55, blue: 1.0, alpha: 1)
                                            : UIColor(white: 1, alpha: 0.25)).cgColor
        }
    }

    private func updateInfo() {
        let m = FMLABCarMonitor.shared
        let car = previewStatus?.car ?? m.carName ?? (m.carPlayConnected ? "CarPlay" : "Non collegata")
        let kmh = previewStatus?.kmh ?? m.speedKmh
        let speed = kmh.map { "\(Int($0.rounded())) km/h" } ?? "in attesa del GPS"
        let gps: String
        if previewStatus != nil { gps = "attivo (±5 m)" }
        else if !m.locationAuthorized { gps = "posizione disattivata" }
        else { gps = m.gpsAccuracy.map { "attivo (±\(Int($0.rounded())) m)" } ?? "in attesa" }
        let screen = bounds.width > 0 ? "\(Int(bounds.width)) × \(Int(bounds.height))" : "—"
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "?"
        infoLabel.text = """
        Auto: \(car)
        Collegamento: \(m.connectionType == "—" ? "CarPlay" : m.connectionType)
        Schermo: \(screen)
        Velocità: \(speed)
        GPS: \(gps)
        Blocco di guida: \(FMLABSettings.shared.drivingLockEnabled ? "sopra \(Int(FMLABSettings.shared.speedThresholdKmh)) km/h" : "disattivato")
        FMLAB CarPlay \(version)
        """
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        guard bounds.width > 0, bounds.height > 0 else { return }
        let pad = max(14, bounds.width * 0.022)
        let headerH = bounds.height * 0.16
        titleLabel.font = .systemFont(ofSize: headerH * 0.62, weight: .bold)
        titleLabel.frame = CGRect(x: pad, y: pad * 0.5, width: bounds.width * 0.5, height: headerH)
        let hb = homeButton.intrinsicContentSize
        homeButton.frame = CGRect(x: bounds.width - pad - max(hb.width, 120), y: pad * 0.5 + (headerH - max(hb.height, 44)) / 2,
                                  width: max(hb.width, 120), height: max(hb.height, 44))

        let top = titleLabel.frame.maxY + pad * 0.4
        let leftW = (bounds.width - pad * 3) * 0.6
        let rightX = pad * 2 + leftW
        let rightW = bounds.width - rightX - pad

        wallpaperTitle.font = .systemFont(ofSize: max(13, bounds.height * 0.04), weight: .semibold)
        wallpaperTitle.frame = CGRect(x: pad, y: top, width: leftW, height: bounds.height * 0.06)

        let gap: CGFloat = 10
        let n = CGFloat(max(thumbs.count, 1))
        let thumbW = (leftW - gap * (n - 1)) / n
        let thumbH = min(thumbW * 0.56, bounds.height * 0.22)
        for (i, b) in thumbs.enumerated() {
            b.frame = CGRect(x: pad + CGFloat(i) * (thumbW + gap), y: wallpaperTitle.frame.maxY + 4,
                             width: thumbW, height: thumbH)
        }

        var y = wallpaperTitle.frame.maxY + 4 + thumbH + pad * 0.6
        let rowH = min(bounds.height * 0.13, (bounds.height - y - pad - gap * CGFloat(rows.count - 1)) / CGFloat(max(rows.count, 1)))
        for row in rows {
            row.frame = CGRect(x: pad, y: y, width: leftW, height: rowH)
            y += rowH + gap
        }

        // riquadro alto quanto il testo (allineato in alto), così non copre il logo in basso a destra
        updateInfo()
        infoTitle.font = .systemFont(ofSize: max(15, bounds.height * 0.05), weight: .bold)
        infoTitle.frame = CGRect(x: 14, y: 10, width: rightW - 28, height: bounds.height * 0.08)
        infoLabel.font = .systemFont(ofSize: max(12, bounds.height * 0.036), weight: .regular)
        let maxCardH = bounds.height - top - pad
        let fit = infoLabel.sizeThatFits(CGSize(width: rightW - 28, height: .greatestFiniteMagnitude))
        let labelH = min(fit.height, maxCardH - infoTitle.frame.maxY - 18)
        infoLabel.frame = CGRect(x: 14, y: infoTitle.frame.maxY + 4, width: rightW - 28, height: labelH)
        infoCard.frame = CGRect(x: rightX, y: top, width: rightW, height: min(infoLabel.frame.maxY + 14, maxCardH))
    }
}
