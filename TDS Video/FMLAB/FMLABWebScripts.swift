//
//  FMLABWebScripts.swift
//  FMLAB CarPlay
//
//  Script di CarTube (GPLv3/AGPLv3) per YouTube nel browser dell'auto:
//  - FMLABAdBlocker.js: AdGuard "Block YouTube Ads"
//  - FMLABSponsorBlock.js: salta i segmenti sponsorizzati
//  Vengono eseguiti solo sulle pagine youtube.com.
//

import WebKit

enum FMLABWebScripts {
    static func install(into controller: WKUserContentController) {
        let settings = FMLABSettings.shared
        var names: [String] = []
        if settings.youtubeAdBlock { names.append("FMLABAdBlocker") }
        if settings.youtubeSponsorBlock { names.append("FMLABSponsorBlock") }

        for name in names {
            guard let path = Bundle.main.path(forResource: name, ofType: "js"),
                  let source = try? String(contentsOfFile: path, encoding: .utf8) else { continue }
            let wrapped = """
            (function() {
                if (!/(^|\\.)youtube\\.com$/.test(location.hostname)) { return; }
            \(source)
            })();
            """
            controller.addUserScript(WKUserScript(source: wrapped, injectionTime: .atDocumentEnd,
                                                  forMainFrameOnly: false))
        }
    }
}
