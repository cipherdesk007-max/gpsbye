//
//  MainView.swift
//  FMLAB CarPlay
//
//  Schermata principale sull'iPhone (sostituisce quella di TDS, in italiano).
//  Basata su TDS CarPlay di Thomas Dye.
//

import SwiftUI
import PhotosUI
import UniformTypeIdentifiers
import ReplayKit

struct MainView: View {
    @ObservedObject private var settings = FMLABSettings.shared
    @ObservedObject private var monitor = FMLABCarMonitor.shared

    @State private var showPassengerConfirm = false
    @State private var photoItem: PhotosPickerItem?
    @State private var showAddApp = false
    @State private var showAddWebApp = false
    @State private var appNotInstalled: String?
    @State private var carMode: FMLABCarRouter.Mode = FMLABCarRouter.shared.mode

    var body: some View {
        NavigationStack {
            List {
                header
                remoteSection
                carSection
                safetySection
                wallpaperSection
                webAppsSection
                appsSection
                youtubeSection
                mirroringSection
                creditsSection
            }
            .navigationTitle("FMLAB CarPlay")
            .navigationBarTitleDisplayMode(.inline)
            .onAppear {
                monitor.start()
                if FMLABCarPreview.requested { FMLABCarPreview.renderAll() }
            }
            .onReceive(NotificationCenter.default.publisher(for: .fmlabCarModeChanged)) { _ in
                carMode = FMLABCarRouter.shared.mode
            }
            .onChange(of: photoItem) { _, newItem in
                guard let newItem else { return }
                Task {
                    if let data = try? await newItem.loadTransferable(type: Data.self),
                       let image = UIImage(data: data) {
                        await MainActor.run { settings.saveCustomWallpaper(image) }
                    }
                    await MainActor.run { photoItem = nil }
                }
            }
            .alert("Guarda il passeggero?", isPresented: $showPassengerConfirm) {
                Button("Sì, guarda il passeggero") { settings.passengerMode = true }
                Button("Annulla", role: .cancel) {}
            } message: {
                Text("Il video resterà visibile anche in marcia. Chi guida non deve guardare lo schermo: è pericoloso e vietato dal Codice della strada. La modalità si spegne da sola quando scolleghi CarPlay.")
            }
            .alert("App non disponibile", isPresented: Binding(
                get: { appNotInstalled != nil },
                set: { if !$0 { appNotInstalled = nil } })) {
                Button("OK", role: .cancel) {}
            } message: {
                Text("\(appNotInstalled ?? "") non è installata su questo iPhone, oppure il collegamento non è corretto.")
            }
            .sheet(isPresented: $showAddWebApp) {
                AddWebAppView { settings.webApps.append($0) }
            }
            .sheet(isPresented: $showAddApp) {
                AddAppShortcutView(existingSchemes: Set(settings.appShortcuts.map { fmlabNormalizedScheme($0.urlScheme) })) {
                    settings.appShortcuts.append($0)
                }
            }
        }
    }

    // MARK: - Sezioni

    private var header: some View {
        Section {
            VStack(spacing: 8) {
                if let logo = UIImage(named: "fmlab-logo") {
                    Image(uiImage: logo)
                        .resizable()
                        .scaledToFit()
                        .frame(maxHeight: 70)
                        .padding(8)
                        .background(Color.white)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                }
                Text(monitor.carPlayConnected ? "Collegata a CarPlay" : "In attesa di CarPlay")
                    .font(.subheadline)
                    .foregroundStyle(monitor.carPlayConnected ? Color.green : Color.secondary)
            }
            .frame(maxWidth: .infinity)
            .listRowBackground(Color.clear)
        }
    }

    private var remoteSection: some View {
        Section {
            HStack(spacing: 10) {
                remoteButton("Home", "house.fill", .home) { FMLABCarRouter.shared.showHome() }
                remoteButton("Schermo", "rectangle.on.rectangle", .mirror) { FMLABCarRouter.shared.showMirror() }
                remoteButton("YouTube", "play.rectangle.fill", nil) { FMLABCarRouter.shared.showWeb(FMLABCarRouter.youtubeURL) }
                remoteButton("Web", "safari.fill", .web) { FMLABCarRouter.shared.showWeb(nil) }
            }
            .buttonStyle(.plain)
            .disabled(!monitor.carPlayConnected)
            Button {
                settings.nextWallpaper()
            } label: {
                Label("Sfondo successivo", systemImage: "photo.on.rectangle.angled")
            }
        } header: {
            Text("Telecomando auto")
        } footer: {
            Text(monitor.carPlayConnected
                 ? "Sull'auto ora: \(carMode.rawValue). Funziona anche se l'auto non passa i tocchi all'app."
                 : "Collega CarPlay e apri FMLAB CarPlay sullo schermo dell'auto.")
        }
    }

    private func remoteButton(_ title: String, _ symbol: String, _ mode: FMLABCarRouter.Mode?,
                              action: @escaping () -> Void) -> some View {
        let active = mode != nil && mode == carMode && monitor.carPlayConnected
        return Button(action: action) {
            VStack(spacing: 6) {
                Image(systemName: symbol).font(.title2)
                Text(title).font(.caption)
            }
            .frame(maxWidth: .infinity, minHeight: 64)
            .background(active ? Color.accentColor.opacity(0.25) : Color.secondary.opacity(0.12))
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    private var youtubeSection: some View {
        Section {
            Toggle("Blocca pubblicità (AdGuard)", isOn: $settings.youtubeAdBlock)
            Toggle("Salta gli sponsor (SponsorBlock)", isOn: $settings.youtubeSponsorBlock)
        } header: {
            Text("YouTube sull'auto")
        } footer: {
            Text("Script di CarTube, attivi solo su youtube.com nel browser dell'auto. Le modifiche valgono al prossimo avvio dell'app.")
        }
    }

    private var carSection: some View {
        Section("Auto rilevata") {
            row("Auto", monitor.carName ?? (monitor.carPlayConnected ? "CarPlay" : "Nessuna"))
            row("Collegamento", monitor.connectionType)
            row("Velocità (GPS)", speedText)
            if monitor.carScreenSize != .zero {
                row("Schermo auto", "\(Int(monitor.carScreenSize.width)) × \(Int(monitor.carScreenSize.height))")
            }
            if !monitor.locationAuthorized {
                Button {
                    if monitor.locationStatus == .notDetermined {
                        monitor.requestLocation()
                    } else if let url = URL(string: UIApplication.openSettingsURLString) {
                        UIApplication.shared.open(url)
                    }
                } label: {
                    Label("Attiva la posizione per il blocco di guida", systemImage: "location.fill")
                }
            }
        }
    }

    private var safetySection: some View {
        Section {
            Toggle("Blocca video in movimento", isOn: $settings.drivingLockEnabled)
            Stepper(value: $settings.speedThresholdKmh, in: 3...30, step: 1) {
                row("Soglia", "\(Int(settings.speedThresholdKmh)) km/h")
            }
            .disabled(!settings.drivingLockEnabled)
            Toggle("Modalità passeggero (questo viaggio)", isOn: Binding(
                get: { settings.passengerMode },
                set: { newValue in
                    if newValue { showPassengerConfirm = true } else { settings.passengerMode = false }
                }))
            .disabled(!settings.drivingLockEnabled)
            Toggle("Mostra auto e velocità sullo schermo", isOn: $settings.showStatusBadge)
        } header: {
            Text("Sicurezza")
        } footer: {
            Text(safetyFooter)
        }
    }

    private var wallpaperSection: some View {
        Section {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(settings.allWallpapers) { wp in
                        Button { settings.wallpaperID = wp.id } label: {
                            WallpaperThumb(image: settings.image(for: wp), name: wp.name,
                                           selected: settings.wallpaperID == wp.id)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.vertical, 6)
            }
            PhotosPicker(selection: $photoItem, matching: .images) {
                Label("Carica la tua immagine", systemImage: "photo.on.rectangle.angled")
            }
            if settings.hasCustomWallpaper {
                Button(role: .destructive) { settings.removeCustomWallpaper() } label: {
                    Label("Elimina la tua immagine", systemImage: "trash")
                }
            }
        } header: {
            Text("Sfondo sull'auto")
        } footer: {
            Text("Si vede quando la specchiatura è ferma. Per gli schermi larghi l'immagine viene tagliata in alto, così il logo in basso resta visibile. Consigliato: immagine orizzontale, almeno 1280 px di larghezza.")
        }
    }

    private var webAppsSection: some View {
        Section {
            ForEach(settings.webApps) { web in
                Button {
                    if let url = web.resolvedURL { FMLABCarRouter.shared.showWeb(url) }
                } label: {
                    HStack {
                        Image(systemName: web.symbol)
                            .frame(width: 28)
                            .foregroundStyle(Color.teal)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(web.name).foregroundStyle(Color.primary)
                            Text(web.url).font(.caption2).foregroundStyle(Color.secondary).lineLimit(1)
                        }
                        Spacer()
                        Image(systemName: "car.fill").foregroundStyle(Color.secondary)
                    }
                }
                .disabled(!monitor.carPlayConnected)
            }
            .onDelete { settings.webApps.remove(atOffsets: $0) }
            .onMove { settings.webApps.move(fromOffsets: $0, toOffset: $1) }
            Button { showAddWebApp = true } label: {
                Label("Aggiungi un sito o un'app web", systemImage: "plus.circle")
            }
            Button("Ripristina elenco predefinito") {
                settings.webApps = FMLABSettings.defaultWebApps
            }
            .font(.footnote)
        } header: {
            Text("App web sull'auto")
        } footer: {
            Text("Si aprono direttamente sullo schermo dell'auto, nitide e senza specchiatura. Le prime 4 hanno un riquadro nella home FMLAB. Per muoverti nella pagina usa i tocchi sull'auto (se li passa) o Comandi del browser. I contenuti con DRM restano neri anche qui.")
        }
    }

    private var appsSection: some View {
        Section {
            ForEach(settings.appShortcuts) { app in
                Button { open(app) } label: {
                    HStack {
                        Image(systemName: app.symbol)
                            .frame(width: 28)
                            .foregroundStyle(.tint)
                        Text(app.name).foregroundStyle(.primary)
                        Spacer()
                        if app.drmProtected {
                            Text("DRM: nero in auto")
                                .font(.caption2)
                                .foregroundStyle(.orange)
                        }
                        Image(systemName: "arrow.up.forward.app")
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .onDelete { settings.appShortcuts.remove(atOffsets: $0) }
            .onMove { settings.appShortcuts.move(fromOffsets: $0, toOffset: $1) }
            Button { showAddApp = true } label: {
                Label("Aggiungi un'app", systemImage: "plus.circle")
            }
            Button { addAllInstalled() } label: {
                Label("Aggiungi tutte le app trovate sul telefono", systemImage: "sparkle.magnifyingglass")
            }
            Button("Ripristina elenco predefinito") {
                settings.appShortcuts = FMLABSettings.defaultApps
            }
            .font(.footnote)
        } header: {
            Text("App sul telefono")
        } footer: {
            Text("Avvia prima la specchiatura: l'app che apri da qui compare sullo schermo dell'auto. Netflix, Prime Video, Disney+ e simili usano una protezione anti-copia (DRM): sull'auto il video risulta nero.")
        }
    }

    private var mirroringSection: some View {
        Section {
            NavigationLink(destination: ScreenMirroringView()) {
                Label("Avvia specchiatura schermo", systemImage: "rectangle.on.rectangle")
            }
            NavigationLink(destination: ScreenMirroingSettings()) {
                Label("Impostazioni specchiatura", systemImage: "slider.horizontal.3")
            }
            NavigationLink(destination: SingleVideoPicker()) {
                Label("Video dal telefono", systemImage: "film.stack")
            }
            NavigationLink(destination: WebViewContainer()) {
                Label("Browser", systemImage: "safari")
            }
            Button {
                TDSVideoShared.shared.CarPlayComp?(.init(type: .web, URL: nil))
            } label: {
                Label("Mostra il browser sull'auto", systemImage: "car.fill")
            }
            NavigationLink(destination: WebViewButtons()) {
                Label("Comandi del browser", systemImage: "cursorarrow.rays")
            }
            NavigationLink(destination: WebServerPage()) {
                Label("Server HTTP", systemImage: "server.rack")
            }
            NavigationLink(destination: Help()) {
                Label("Guida", systemImage: "questionmark.circle")
            }
        } header: {
            Text("Specchiatura, video e web")
        }
    }

    private var creditsSection: some View {
        Section {
            Link(destination: URL(string: "https://github.com/thomasdye12/TDS-Carplay")!) {
                Label("Basata su TDS CarPlay di Thomas Dye", systemImage: "heart")
            }
            Text("Solo uso personale, come prevede la licenza di TDS CarPlay. Versione \(appVersion).")
                .font(.footnote)
                .foregroundStyle(.secondary)
        } header: {
            Text("Informazioni")
        }
    }

    // MARK: - Supporto

    private var speedText: String {
        guard monitor.locationAuthorized else { return "posizione disattivata" }
        guard let kmh = monitor.speedKmh else { return "in attesa del GPS" }
        let n = Int(kmh.rounded())
        return monitor.isMoving ? "\(n) km/h · in marcia" : "\(n) km/h · fermo"
    }

    private var safetyFooter: String {
        if !settings.drivingLockEnabled {
            return "Blocco disattivato: il video resta visibile anche in marcia."
        }
        if settings.passengerMode {
            return "Modalità passeggero attiva fino a quando scolleghi CarPlay."
        }
        if !monitor.locationAuthorized {
            return "Senza posizione il blocco non può sapere se l'auto si muove."
        }
        return "Sopra la soglia specchiatura, browser e video vanno in pausa sull'auto e resta solo l'audio; la home FMLAB resta usabile. Riprende dopo 4 secondi da fermo."
    }

    private var appVersion: String {
        let v = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "?"
        let b = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "?"
        return "\(v) (\(b))"
    }

    private func row(_ title: String, _ value: String) -> some View {
        HStack {
            Text(title)
            Spacer()
            Text(value).foregroundStyle(.secondary)
        }
    }

    private func addAllInstalled() {
        let existing = Set(settings.appShortcuts.map { fmlabNormalizedScheme($0.urlScheme) })
        let found = FMLABAppCatalog.installed().filter { !existing.contains($0.scheme) }
        settings.appShortcuts.append(contentsOf: found.map { $0.shortcut })
    }

    private func open(_ app: FMLABAppShortcut) {
        settings.openOnPhone(app) { ok in
            if !ok { appNotInstalled = app.name }
        }
    }
}

private struct WallpaperThumb: View {
    let image: UIImage?
    let name: String
    let selected: Bool

    var body: some View {
        VStack(spacing: 6) {
            ZStack {
                if let image {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFill()
                } else {
                    Color.black
                }
            }
            .frame(width: 150, height: 84)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(selected ? Color.accentColor : Color.secondary.opacity(0.3), lineWidth: selected ? 3 : 1)
            )
            Text(name)
                .font(.caption)
                .foregroundStyle(selected ? Color.primary : Color.secondary)
        }
    }
}

/// "youtube://" -> "youtube"
func fmlabNormalizedScheme(_ scheme: String) -> String {
    scheme.trimmingCharacters(in: .whitespaces)
        .replacingOccurrences(of: "://", with: "")
        .lowercased()
}

private struct AddWebAppView: View {
    var onAdd: (FMLABWebApp) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var url = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Nome (es. Meteo)", text: $name)
                    TextField("Indirizzo (es. www.ilmeteo.it)", text: $url)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                } footer: {
                    Text("Qualsiasi sito funziona come un'app sull'auto. Se manca https:// lo aggiungo io.")
                }
            }
            .navigationTitle("Aggiungi app web")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annulla") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Aggiungi") {
                        onAdd(FMLABWebApp(name: name, url: url, symbol: "globe"))
                        dismiss()
                    }
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty ||
                              url.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }
}

private struct AddAppShortcutView: View {
    var existingSchemes: Set<String>
    var onAdd: (FMLABAppShortcut) -> Void
    @State private var installed: [FMLABCatalogApp] = []
    @State private var lcLink = ""
    @State private var lcName = ""
    @State private var lcError: String?
    @State private var showLCImporter = false
    @State private var importMessage: String?
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var scheme = ""
    @State private var drm = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Button { showLCImporter = true } label: {
                        Label("Importa tutte le app di LiveContainer", systemImage: "square.and.arrow.down.on.square")
                    }
                    if let importMessage {
                        Text(importMessage).font(.caption).foregroundStyle(Color.secondary)
                    }
                    HStack {
                        TextField("livecontainer://livecontainer-launch?…", text: $lcLink)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .font(.footnote)
                        Button("Incolla") {
                            lcLink = UIPasteboard.general.string ?? ""
                        }
                    }
                    .onChange(of: lcLink) { _, newValue in
                        lcError = nil
                        if let guess = FMLABAppCatalog.liveContainerAppName(from: newValue), lcName.isEmpty {
                            lcName = guess
                        }
                    }
                    TextField("Nome (es. Shopify)", text: $lcName)
                    if let lcError {
                        Text(lcError).font(.caption).foregroundStyle(Color.red)
                    }
                    Button {
                        let link = lcLink.trimmingCharacters(in: .whitespacesAndNewlines)
                        guard FMLABAppCatalog.liveContainerAppName(from: link) != nil else {
                            lcError = "Non è un URL d'avvio di LiveContainer."
                            return
                        }
                        let name = lcName.trimmingCharacters(in: .whitespaces)
                        onAdd(FMLABAppShortcut(name: name.isEmpty ? "App" : name, urlScheme: link,
                                               symbol: "shippingbox", drmProtected: false))
                        lcLink = ""
                        lcName = ""
                    } label: {
                        Label("Aggiungi app di LiveContainer", systemImage: "shippingbox.fill")
                    }
                    .disabled(lcLink.isEmpty)
                } header: {
                    Text("Da LiveContainer")
                } footer: {
                    Text(FMLABAppCatalog.liveContainerInstalled
                         ? "Importa: scegli la cartella Sul mio iPhone › LiveContainer e tocca Apri; FMLAB aggiunge tutte le app con il loro nome. Per una sola app: in LiveContainer tieni premuta l'app → «Aggiungi alla Schermata Home» → «Copia l'URL d'avvio», poi Incolla. Dall'auto FMLAB la apre dentro LiveContainer: con la specchiatura attiva la vedi sullo schermo dell'auto."
                         : "LiveContainer non risulta installato su questo iPhone.")
                }

                Section {
                    if installed.isEmpty {
                        Text("Nessuna nuova app del catalogo trovata su questo iPhone.")
                            .foregroundStyle(.secondary)
                    }
                    ForEach(installed) { app in
                        Button {
                            onAdd(app.shortcut)
                            installed.removeAll { $0.id == app.id }
                        } label: {
                            HStack {
                                Image(systemName: app.symbol).frame(width: 28)
                                VStack(alignment: .leading) {
                                    Text(app.name).foregroundStyle(.primary)
                                    Text(app.category).font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                if app.drm {
                                    Text("DRM").font(.caption2).foregroundStyle(.orange)
                                }
                                Image(systemName: "plus.circle.fill")
                            }
                        }
                    }
                } header: {
                    Text("Trovate su questo iPhone")
                } footer: {
                    Text("iOS non mostra l'elenco completo delle app: FMLAB controlla le \(FMLABAppCatalog.all.count) app più diffuse. Per le altre usa \"Aggiungi a mano\".")
                }
                Section {
                    TextField("Nome (es. RaiPlay)", text: $name)
                    TextField("Collegamento (es. raiplay://)", text: $scheme)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                    Toggle("Usa DRM (video nero in auto)", isOn: $drm)
                } header: {
                    Text("Aggiungi a mano")
                } footer: {
                    Text("Il collegamento è lo schema URL dell'app. Se non lo conosci, cerca \"URL scheme\" seguito dal nome dell'app.")
                }
            }
            .onAppear {
                installed = FMLABAppCatalog.installed().filter { !existingSchemes.contains($0.scheme) }
            }
            .fileImporter(isPresented: $showLCImporter, allowedContentTypes: [.folder]) { result in
                switch result {
                case .success(let url):
                    let found = FMLABLiveContainerImport.apps(in: url)
                        .filter { !existingSchemes.contains(fmlabNormalizedScheme($0.urlScheme)) }
                    found.forEach { onAdd($0) }
                    importMessage = found.isEmpty
                        ? "Nessuna app nuova trovata. Scegli la cartella Sul mio iPhone › LiveContainer."
                        : "Importate \(found.count) app di LiveContainer."
                case .failure:
                    importMessage = "Cartella non aperta."
                }
            }
            .navigationTitle("Aggiungi un'app")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annulla") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Aggiungi") {
                        onAdd(FMLABAppShortcut(name: name, urlScheme: scheme,
                                               symbol: "app.fill", drmProtected: drm))
                        dismiss()
                    }
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty ||
                              scheme.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }
}

#Preview {
    MainView()
}
