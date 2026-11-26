//
//  FMLABIntents.swift
//  FMLAB CarPlay
//
//  Comandi per Siri e l'app Comandi: si controlla lo schermo dell'auto a voce,
//  senza toccarlo. Girano dentro l'app (nessuna estensione, nessun App ID in più).
//

import AppIntents

private enum FMLABIntentHelper {
    @MainActor
    static func requireCar() -> String? {
        FMLABCarRouter.shared.isCarConnected ? nil : "Collega CarPlay e apri FMLAB CarPlay sullo schermo dell'auto."
    }
}

struct FMLABShowHomeIntent: AppIntent {
    static var title: LocalizedStringResource = "Home FMLAB sull'auto"
    static var description = IntentDescription("Mostra la home FMLAB sullo schermo dell'auto.")
    static var openAppWhenRun: Bool = false

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        FMLABLog.add("Siri/Comandi: \(String(describing: Self.self))")
        if let problem = FMLABIntentHelper.requireCar() { return .result(dialog: "\(problem)") }
        FMLABCarRouter.shared.showHome()
        return .result(dialog: "Ecco la home FMLAB.")
    }
}

struct FMLABShowYouTubeIntent: AppIntent {
    static var title: LocalizedStringResource = "YouTube sull'auto"
    static var description = IntentDescription("Apre YouTube senza pubblicità sullo schermo dell'auto.")
    static var openAppWhenRun: Bool = false

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        FMLABLog.add("Siri/Comandi: \(String(describing: Self.self))")
        if let problem = FMLABIntentHelper.requireCar() { return .result(dialog: "\(problem)") }
        FMLABCarRouter.shared.showWeb(FMLABCarRouter.youtubeURL)
        return .result(dialog: "Apro YouTube sull'auto.")
    }
}

struct FMLABShowMirrorIntent: AppIntent {
    static var title: LocalizedStringResource = "Schermo iPhone sull'auto"
    static var description = IntentDescription("Mostra la specchiatura dell'iPhone sullo schermo dell'auto.")
    static var openAppWhenRun: Bool = false

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        FMLABLog.add("Siri/Comandi: \(String(describing: Self.self))")
        if let problem = FMLABIntentHelper.requireCar() { return .result(dialog: "\(problem)") }
        FMLABCarRouter.shared.showMirror()
        return .result(dialog: "Mostro lo schermo dell'iPhone. Se è nero, avvia la specchiatura dall'iPhone.")
    }
}

struct FMLABShowSettingsIntent: AppIntent {
    static var title: LocalizedStringResource = "Impostazioni sull'auto"
    static var description = IntentDescription("Apre il menu Impostazioni FMLAB sullo schermo dell'auto.")
    static var openAppWhenRun: Bool = false

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        FMLABLog.add("Siri/Comandi: \(String(describing: Self.self))")
        if let problem = FMLABIntentHelper.requireCar() { return .result(dialog: "\(problem)") }
        FMLABCarRouter.shared.showSettings()
        return .result(dialog: "Ecco le impostazioni sull'auto.")
    }
}

struct FMLABNextWallpaperIntent: AppIntent {
    static var title: LocalizedStringResource = "Sfondo successivo"
    static var description = IntentDescription("Passa allo sfondo successivo sullo schermo dell'auto.")
    static var openAppWhenRun: Bool = false

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        FMLABLog.add("Siri/Comandi: \(String(describing: Self.self))")
        FMLABSettings.shared.nextWallpaper()
        let name = FMLABSettings.shared.allWallpapers.first { $0.id == FMLABSettings.shared.wallpaperID }?.name ?? ""
        return .result(dialog: "Sfondo: \(name).")
    }
}

struct FMLABShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: FMLABShowHomeIntent(),
                    phrases: ["Home in \(.applicationName)", "Mostra la home di \(.applicationName)"],
                    shortTitle: "Home sull'auto", systemImageName: "house.fill")
        AppShortcut(intent: FMLABShowYouTubeIntent(),
                    phrases: ["YouTube in \(.applicationName)", "Apri YouTube con \(.applicationName)"],
                    shortTitle: "YouTube sull'auto", systemImageName: "play.rectangle.fill")
        AppShortcut(intent: FMLABShowMirrorIntent(),
                    phrases: ["Schermo in \(.applicationName)", "Specchia l'iPhone con \(.applicationName)"],
                    shortTitle: "Schermo sull'auto", systemImageName: "rectangle.on.rectangle")
        AppShortcut(intent: FMLABShowSettingsIntent(),
                    phrases: ["Impostazioni in \(.applicationName)"],
                    shortTitle: "Impostazioni sull'auto", systemImageName: "gearshape.fill")
        AppShortcut(intent: FMLABNextWallpaperIntent(),
                    phrases: ["Cambia sfondo in \(.applicationName)"],
                    shortTitle: "Sfondo successivo", systemImageName: "photo.on.rectangle.angled")
    }
}
