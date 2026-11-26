//
//  FMLABCarMonitor.swift
//  FMLAB CarPlay
//
//  Rileva l'auto (nome dal collegamento audio CarPlay), la velocità GPS
//  e le chiamate in corso. Tutto resta sul telefono: niente viene inviato.
//

import Foundation
import CoreLocation
import AVFoundation
import CallKit
import UIKit

final class FMLABCarMonitor: NSObject, ObservableObject, CLLocationManagerDelegate, CXCallObserverDelegate {
    static let shared = FMLABCarMonitor()

    @Published private(set) var carName: String?
    @Published private(set) var carPlayConnected = false
    @Published private(set) var connectionType: String = "—"
    @Published private(set) var carScreenSize: CGSize = .zero
    @Published private(set) var speedKmh: Double?
    @Published private(set) var isMoving = false
    @Published private(set) var onCall = false
    @Published private(set) var locationStatus: CLAuthorizationStatus = .notDetermined

    private let locationManager = CLLocationManager()
    private let callObserver = CXCallObserver()
    private var belowThresholdSince: Date?
    private var started = false

    /// Secondi sotto soglia prima di sbloccare (evita sblocchi ai semafori brevi o col GPS che oscilla).
    private let unlockDelay: TimeInterval = 4

    private override init() {
        super.init()
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyBestForNavigation
        locationManager.activityType = .automotiveNavigation
        locationManager.pausesLocationUpdatesAutomatically = false
        locationManager.distanceFilter = kCLDistanceFilterNone
        callObserver.setDelegate(self, queue: .main)
        locationStatus = locationManager.authorizationStatus
        NotificationCenter.default.addObserver(self, selector: #selector(routeChanged),
                                               name: AVAudioSession.routeChangeNotification, object: nil)
        updateRoute()
        updateCalls()
    }

    /// Da chiamare all'avvio dell'app (sul main thread).
    func start() {
        guard !started else { return }
        started = true
        switch locationManager.authorizationStatus {
        case .notDetermined:
            locationManager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse, .authorizedAlways:
            startLocationUpdates()
        default:
            break
        }
    }

    func requestLocation() {
        locationManager.requestWhenInUseAuthorization()
    }

    var locationAuthorized: Bool {
        locationStatus == .authorizedWhenInUse || locationStatus == .authorizedAlways
    }

    private func startLocationUpdates() {
        let modes = Bundle.main.object(forInfoDictionaryKey: "UIBackgroundModes") as? [String] ?? []
        if modes.contains("location") {
            locationManager.allowsBackgroundLocationUpdates = true
            locationManager.showsBackgroundLocationIndicator = true
        }
        locationManager.startUpdatingLocation()
    }

    // MARK: - CarPlay

    func setCarPlayScene(connected: Bool, screenSize: CGSize) {
        DispatchQueue.main.async {
            self.carPlayConnected = connected
            self.carScreenSize = connected ? screenSize : .zero
            if !connected {
                // la modalità passeggero vale solo per il viaggio in corso
                FMLABSettings.shared.passengerMode = false
            }
            self.updateRoute()
            FMLABCarOverlay.shared.refresh()
        }
    }

    @objc private func routeChanged() {
        DispatchQueue.main.async { self.updateRoute() }
    }

    private func updateRoute() {
        let outputs = AVAudioSession.sharedInstance().currentRoute.outputs
        if let car = outputs.first(where: { $0.portType == .carAudio }) {
            carName = car.portName
            connectionType = "CarPlay"
        } else if let bt = outputs.first(where: { $0.portType == .bluetoothA2DP || $0.portType == .bluetoothHFP }) {
            carName = carPlayConnected ? bt.portName : nil
            connectionType = carPlayConnected ? "CarPlay" : "Bluetooth"
        } else {
            if !carPlayConnected { carName = nil }
            connectionType = carPlayConnected ? "CarPlay" : "—"
        }
        FMLABCarOverlay.shared.refresh()
    }

    // MARK: - Posizione

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        locationStatus = manager.authorizationStatus
        if locationAuthorized && started {
            startLocationUpdates()
        }
        FMLABCarOverlay.shared.refresh()
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let loc = locations.last else { return }
        // speed < 0 = velocità non valida; precisione scarsa = dato non affidabile
        guard loc.speed >= 0, loc.horizontalAccuracy >= 0, loc.horizontalAccuracy <= 65 else {
            return
        }
        let kmh = loc.speed * 3.6
        speedKmh = kmh
        let threshold = FMLABSettings.shared.speedThresholdKmh
        if kmh >= threshold {
            isMoving = true
            belowThresholdSince = nil
        } else if isMoving {
            if let since = belowThresholdSince {
                if Date().timeIntervalSince(since) >= unlockDelay {
                    isMoving = false
                    belowThresholdSince = nil
                }
            } else {
                belowThresholdSince = Date()
            }
        }
        FMLABCarOverlay.shared.refresh()
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // GPS assente (gallerie, garage): teniamo l'ultimo stato noto
    }

    // MARK: - Chiamate

    func callObserver(_ callObserver: CXCallObserver, callChanged call: CXCall) {
        updateCalls()
    }

    private func updateCalls() {
        onCall = callObserver.calls.contains { !$0.hasEnded }
        FMLABCarOverlay.shared.refresh()
    }
}
