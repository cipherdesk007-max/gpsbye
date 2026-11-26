//
//  MainView.swift
//  FMLAB CarPlay
//
//  Schermata principale sull'iPhone (sostituisce quella di TDS, in italiano).
//  Basata su TDS CarPlay di Thomas Dye.
//

import SwiftUI
import PhotosUI
import ReplayKit

struct MainView: View {
    @ObservedObject private var settings = FMLABSettings.shared
    @ObservedObject private var monitor = FMLABCarMonitor.shared

    @State private var showPassengerConfirm = false
    @State private var photoItem: PhotosPickerItem?
    @State private var showAddApp = false
    @State private var appNotInstalled: String?

    var body: some View {
        NavigationStack {
            List {
                header
                carSection
                safetySection
                wallpaperSection
                appsSection
                mirroringSection
                creditsSection
            }
            .navigationTitle("FMLAB CarPlay")
            .navigationBarTitleDisplayMode(.inline)
            .onAppear { monitor.start() }
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
            .sheet(isPresented: $showAddApp) {
                AddAppShortcutView { settings.appShortcuts.append($0) }
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
        return "Sopra la soglia il video va in pausa sull'auto e resta solo l'audio. Riprende dopo 4 secondi da fermo."
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

    private func open(_ app: FMLABAppShortcut) {
        var scheme = app.urlScheme.trimmingCharacters(in: .whitespaces)
        if !scheme.contains("://") { scheme += "://" }
        guard let url = URL(string: scheme) else {
            appNotInstalled = app.name
            return
        }
        UIApplication.shared.open(url, options: [:]) { ok in
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

private struct AddAppShortcutView: View {
    var onAdd: (FMLABAppShortcut) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var scheme = ""
    @State private var drm = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Nome (es. RaiPlay)", text: $name)
                    TextField("Collegamento (es. raiplay://)", text: $scheme)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                    Toggle("Usa DRM (video nero in auto)", isOn: $drm)
                } footer: {
                    Text("Il collegamento è lo schema URL dell'app. Se non lo conosci, cerca \"URL scheme\" seguito dal nome dell'app.")
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
