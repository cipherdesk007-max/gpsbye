//
//  CarPlaySceneDelegate.swift
//  TDS doc store
//
//  Created by thomas on 23/09/2022.
//

import CarPlay
import UIKit
import AVKit


extension CPTemplateApplicationScene {
    
    
    
    func _shouldCreateCarWindow(){
        print("CPTemplateApplicationScene")
    }
}



class CarPlaySceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate, CPMapTemplateDelegate {
    
    var window: UIWindow?
    var interfaceController: CPInterfaceController?
    var player: AVPlayer?
    var playerViewController: CustomVideoPlayerViewController?
    var webViewController:CarPlayViewControllerProtocol?
    var templateApplicationScene: CPTemplateApplicationScene?
    var mapTemplate: CPMapTemplate?
    var CarPlayVideoImageView: UIImageView = UIImageView()
    let offsetStyle: SingleEdgeOffset = .left(40) // <- change this to .right(40), .top(20), etc.
     
    
    
    func templateApplicationScene(_ templateApplicationScene: CPTemplateApplicationScene, didConnect interfaceController: CPInterfaceController) {
    }
    
    
    //
    //
    //    func deliveringInterfaceControllerToDelegate(_ interfaceController: CPInterfaceController) {
    //        print("this is here ")
    //    }
    //
    //     func  _deliverInterfaceControllerToDelegate(_ interfaceController: CPInterfaceController) {
    //        print("this is here ")
    //    }
    
    
    func templateApplicationScene(_ templateApplicationScene: CPTemplateApplicationScene,
                                  didConnect interfaceController: CPInterfaceController, to window: CPWindow) {
        

        if TDSCarplayAccess.shared.ShowTDSCarPlaySettings == false  {
            
            return
        }
        let bool:Bool = templateApplicationScene._shouldCreateCarWindow()
        print(bool)
        /*emplateApplicationScene.test()*/
        
        self.interfaceController = interfaceController
        print(templateApplicationScene.carWindow.isUserInteractionEnabled)
//        self.interfaceController._carwin
        window.windowLevel = .alert
        window.rootViewController = UIViewController()
        window.makeKeyAndVisible()
       
  
        
        self.window = window
        self.window?.isUserInteractionEnabled = false
        self.window?.isMultipleTouchEnabled = false
        TDSVideoShared.shared.window = window
        print("keys")
        print(window.isKeyWindow)
        print(window.canBecomeKey)
        window.makeKeyAndVisible()
//        self.interfaceController?.presentTemplate(self.mapTemplate!, animated: true)
        FMLABCarMonitor.shared.setCarPlayScene(connected: true, screenSize: window.bounds.size)
        FMLABCarRouter.shared.showHomeHandler = { [weak self] in self?.loadFMLABHome(autoMirror: false) }
        FMLABCarRouter.shared.showMirrorHandler = { [weak self] in self?.loadIOS() }
        FMLABCarRouter.shared.showSettingsHandler = { [weak self] in self?.loadFMLABSettings() }
        FMLABCarRouter.shared.showWebHandler = { url in
            if let url { CustomWebViewController.shared.loadURL(url) }
            TDSVideoShared.shared.CarPlayComp?(.init(type: .web))
        }
        // FMLAB: all'avvio la home FMLAB; appena arriva la specchiatura passa da sola a quella
        loadFMLABHome(autoMirror: true)
        //        print(self.window?.screen)
//        DispatchQueue.main.asyncAfter(deadline: .now() + 5, execute: {
//            //            self.loadWebPage(url: URL(string: "https://thomasdye.net")!)
//        })
        TDSVideoShared.shared.CarPlayComp = { url in
            // FMLAB: TDS rimetteva sempre false, così con la specchiatura attiva il browser o un
            // video tornavano subito alla specchiatura. Ora resta su quello che hai scelto.
            ScreenCaptureManager.shared.IncomingVideoDetected = (url.type != .IOSAPP)
            FMLABLog.add(url.type == .IOSAPP ? "Specchiatura: arrivano le immagini dall'iPhone" : "Contenuto sull'auto: \(url.type.rawValue)")
            switch url.type {
            case .video:
                self.playVideo(url: url.URL!)
            
                case .web:
                self.loadWebPage()
                
                case .rawVideo:
                self.rawVideo(player:  url.AVplayer)
                
            case .IOSAPP:
                DispatchQueue.main.async {
                    self.loadIOS()
                }
            }
            
            
            
        }
        
        TDSVideoURlFromOutSideOFAppListener.shared.onUpdate = {url in
            print(url)
            if let url = URL(string: url) {
                CustomWebViewController.shared.loadURL(url)
                TDSVideoShared.shared.CarPlayComp?(.init(type: .web))
            }
        }
        

        
    }
    
    
    
    // FMLAB: CarPlay scollegato -> fine viaggio (la modalità passeggero si spegne)
    func templateApplicationScene(_ templateApplicationScene: CPTemplateApplicationScene,
                                  didDisconnect interfaceController: CPInterfaceController,
                                  from window: CPWindow) {
        FMLABCarMonitor.shared.setCarPlayScene(connected: false, screenSize: .zero)
        FMLABCarRouter.shared.showHomeHandler = nil
        FMLABCarRouter.shared.showMirrorHandler = nil
        FMLABCarRouter.shared.showWebHandler = nil
        FMLABCarRouter.shared.showSettingsHandler = nil
    }

    /// FMLAB: menu Impostazioni sullo schermo dell'auto.
    func loadFMLABSettings() {
        guard let window = self.window else { return }
        for subview in window.subviews {
            subview.removeFromSuperview()
        }
        window.isUserInteractionEnabled = true
        let vc = UIViewController()
        vc.view.backgroundColor = .black
        vc.view.isUserInteractionEnabled = true
        window.rootViewController = vc
        let panel = FMLABCarSettingsView(frame: vc.view.bounds)
        panel.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        vc.view.addSubview(panel)
        ScreenCaptureManager.shared.IncomingVideoDetected = true   // resta qui anche se arriva la specchiatura
        FMLABCarRouter.shared.setMode(.settings)
        FMLABCarOverlay.shared.attach(to: window)
    }

    /// FMLAB: home sullo schermo dell'auto.
    /// autoMirror = true: se parte la specchiatura dall'iPhone, la mostra subito.
    func loadFMLABHome(autoMirror: Bool) {
        guard let window = self.window else { return }
        for subview in window.subviews {
            subview.removeFromSuperview()
        }
        window.isUserInteractionEnabled = true
        let vc = UIViewController()
        vc.view.backgroundColor = .black
        vc.view.isUserInteractionEnabled = true
        window.rootViewController = vc
        let home = FMLABCarHomeView(frame: vc.view.bounds)
        home.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        vc.view.addSubview(home)
        // TDS passa alla specchiatura al primo fotogramma solo se questo flag è false
        ScreenCaptureManager.shared.IncomingVideoDetected = !autoMirror
        FMLABCarRouter.shared.setMode(.home)
        FMLABCarOverlay.shared.attach(to: window)
    }

    func rawVideo(player:AVPlayer?) {

        guard let player else { return }
        let newPlayer = CustomVideoPlayerViewController()
        
        if let rootViewController = self.window?.rootViewController {
            rootViewController.addChild(newPlayer)
            rootViewController.view.addSubview(newPlayer.view)
            newPlayer.view.frame = rootViewController.view.bounds
            newPlayer.didMove(toParent: rootViewController)
            newPlayer.setupPlayer(player: player)
            //                playerViewController.
            //                       playerViewController.setupPlayer(url: url)
        }
        FMLABCarRouter.shared.setMode(.video)
        FMLABCarOverlay.shared.attach(to: self.window)
    }
    
    
    func playVideo(url:URL) {
                self.playerViewController = nil
                self.window?.rootViewController = UIViewController()
            
//
        self.playerViewController = CustomVideoPlayerViewController()
     
        guard let playerViewController = playerViewController else {
            
            print("no root view")
            return }
//        playerViewController.player = AVPlayer(url: url)
        
                if let rootViewController = self.window?.rootViewController  {
                    rootViewController.addChild(playerViewController)
                    rootViewController.view.addSubview(playerViewController.view)
                    playerViewController.view.frame = rootViewController.view.bounds
                    playerViewController.didMove(toParent: rootViewController)
                    //                playerViewController.
                    playerViewController.setupPlayer(url: url)
                }
        FMLABCarRouter.shared.setMode(.video)
        FMLABCarOverlay.shared.attach(to: self.window)
        
        

//        let player  = AVPlayerViewController()
//                player.player = AVPlayer(url: url)
//        //        player.volumeControlsCanShowSlider = false
//
//
//        let playerViewController = player
//
//
//        if let rootViewController = ErrorHandling.Shared.MainVC {
//            rootViewController.addChild(playerViewController)
//            rootViewController.view.addSubview(playerViewController.view)
//            playerViewController.view.frame = rootViewController.view.bounds
//            playerViewController.didMove(toParent: rootViewController)
//            //                playerViewController.
//            //                       playerViewController.setupPlayer(url: url)
//        }
//        DispatchQueue.main.asyncAfter(deadline: .now() + 1, execute: {
//            let avcontent = playerViewController.player
//            let newPlayer = CustomVideoPlayerViewController()
//
//            if let rootViewController = self.window?.rootViewController {
//                rootViewController.addChild(newPlayer)
//                rootViewController.view.addSubview(newPlayer.view)
//                newPlayer.view.frame = rootViewController.view.bounds
//                newPlayer.didMove(toParent: rootViewController)
//                newPlayer.setupPlayer(player: avcontent!)
//                //                playerViewController.
//                //                       playerViewController.setupPlayer(url: url)
//            }
//
//
//        })
    }

        


    
 
    func loadWebPage() {
        webViewController = CustomWebViewController.shared.loadViewIncar(self.window)
        FMLABCarRouter.shared.setMode(.web)
        FMLABCarOverlay.shared.attach(to: self.window)
     
        
    }
    
    
    func loadIOS() {
        
        ScreenCaptureManager.shared.CarPlaysideofcarchange = { offset in
            DispatchQueue.main.async {
                if let rootViewController = self.window?.rootViewController {
                    // Remove all existing constraints affecting CarPlayVideoImageView
                    NSLayoutConstraint.deactivate(self.CarPlayVideoImageView.constraints)
                    self.CarPlayVideoImageView.removeFromSuperview()
                    rootViewController.view.addSubview(self.CarPlayVideoImageView)
                    self.CarPlayVideoImageView.translatesAutoresizingMaskIntoConstraints = false
                    NSLayoutConstraint.activate([
                        self.CarPlayVideoImageView.topAnchor.constraint(equalTo: rootViewController.view.topAnchor, constant: offset.topValue),
                        self.CarPlayVideoImageView.bottomAnchor.constraint(equalTo: rootViewController.view.bottomAnchor, constant: offset.bottomValue),
                        self.CarPlayVideoImageView.leadingAnchor.constraint(equalTo: rootViewController.view.leadingAnchor, constant: offset.leftValue),
                        self.CarPlayVideoImageView.trailingAnchor.constraint(equalTo: rootViewController.view.trailingAnchor, constant: offset.rightValue)
                    ])

                    rootViewController.view.setNeedsLayout()
                    rootViewController.view.layoutIfNeeded()
                }
            }
        }


          
        for subview in window!.subviews {
            subview.removeFromSuperview()
            print(subview)
        }
        
         self.window?.isUserInteractionEnabled = true
         self.window?.rootViewController = UIViewController()
         self.window?.rootViewController?.view.isUserInteractionEnabled = true


         // Properly add the CustomWebViewController's view to the window
         if let rootViewController = self.window?.rootViewController {
             CarPlayVideoImageView.backgroundColor = .black
             CarPlayVideoImageView.contentMode = .init(rawValue: ScreenCaptureManager.shared.selectedAspectRatio.rawValue) ??  .scaleAspectFill
             rootViewController.view.addSubview(CarPlayVideoImageView)
             CarPlayVideoImageView.translatesAutoresizingMaskIntoConstraints = false
             NSLayoutConstraint.activate([
                 CarPlayVideoImageView.topAnchor.constraint(equalTo: rootViewController.view.topAnchor, constant: offsetStyle.topValue),
                 CarPlayVideoImageView.bottomAnchor.constraint(equalTo: rootViewController.view.bottomAnchor, constant: offsetStyle.bottomValue),
                 CarPlayVideoImageView.leadingAnchor.constraint(equalTo: rootViewController.view.leadingAnchor, constant: offsetStyle.leftValue),
                 CarPlayVideoImageView.trailingAnchor.constraint(equalTo: rootViewController.view.trailingAnchor, constant: offsetStyle.rightValue)
             ])
             CarPlayVideoImageView.backgroundColor = FMLABCarOverlay.shared.mirrorBackgroundColor
             ScreenCaptureManager.shared.addImageView(imageView: CarPlayVideoImageView,orientation: .init(rawValue: ScreenCaptureManager.shared.selectedOrientation.rawValue) ?? .left)
         }
        FMLABCarRouter.shared.setMode(.mirror)
        FMLABCarOverlay.shared.attach(to: self.window)
    }
}


enum SingleEdgeOffset {
    case none
    case top(CGFloat)
    case bottom(CGFloat)
    case left(CGFloat)
    case right(CGFloat)
}

extension SingleEdgeOffset {
    var topValue: CGFloat {
        if case .top(let v) = self { return v } else { return 0 }
    }
    var bottomValue: CGFloat {
        if case .bottom(let v) = self { return -v } else { return 0 }
    }
    var leftValue: CGFloat {
        if case .left(let v) = self { return v } else { return 0 }
    }
    var rightValue: CGFloat {
        if case .right(let v) = self { return -v } else { return 0 }
    }
}
extension SingleEdgeOffset {
    // Presets
    static let leftDefault: SingleEdgeOffset = .left(40)
    static let rightDefault: SingleEdgeOffset = .right(40)
    static let topDefault: SingleEdgeOffset = .top(40)
    static let bottomDefault: SingleEdgeOffset = .bottom(40)
    static let noneDefault: SingleEdgeOffset = .none
}
extension SingleEdgeOffset {
    var rawValue: String {
        switch self {
        case .none: return "none"
        case .top(let v): return "top:\(v)"
        case .bottom(let v): return "bottom:\(v)"
        case .left(let v): return "left:\(v)"
        case .right(let v): return "right:\(v)"
        }
    }

    init?(rawValue: String) {
        if rawValue == "none" {
            self = .none
            return
        }
        let parts = rawValue.split(separator: ":")
        guard parts.count == 2,
              let value = Double(parts[1]) else {
            return nil
        }
        switch parts[0] {
        case "top": self = .top(CGFloat(value))
        case "bottom": self = .bottom(CGFloat(value))
        case "left": self = .left(CGFloat(value))
        case "right": self = .right(CGFloat(value))
        default: return nil
        }
    }
}

enum OffsetOption: String, CaseIterable, Identifiable {
    case none, top, bottom, left, right

    var id: String { self.rawValue }

    var displayName: String {
        switch self {
        case .none: return "Nessuno"
        case .top: return "In alto"
        case .bottom: return "In basso"
        case .left: return "Sinistra"
        case .right: return "Destra"
        }
    }

    var offset: SingleEdgeOffset {
        switch self {
        case .none: return .none
        case .top: return .top(40)
        case .bottom: return .bottom(40)
        case .left: return .left(40)
        case .right: return .right(40)
        }
    }

    static func from(offset: SingleEdgeOffset) -> OffsetOption {
        switch offset {
        case .none: return .none
        case .top: return .top
        case .bottom: return .bottom
        case .left: return .left
        case .right: return .right
        }
    }
}
