// FMLAB Cristalia — app iOS.
// Il gioco gira in una WKWebView con i file inclusi nell'app (si gioca anche offline).
// I file NON si aprono come file:// ma da uno schema tutto nostro, cristalia://localhost/,
// servito da AssetSchemeHandler (come fanno le app Capacitor con capacitor://localhost):
//  - l'origine è sempre la stessa → localStorage (salvataggi) stabile tra un avvio e l'altro;
//  - le chiamate fetch al server Google (https://script.google.com/.../exec) sono normali richieste
//    tra origini diverse: Google risponde con Access-Control-Allow-Origin: *, quindi funzionano;
//  - niente permessi speciali "file da file" nascosti dentro WebKit.
import UIKit
import WebKit
import AVFoundation

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // musica ed effetti: si sentono come in un gioco (rispettano l'interruttore silenzioso
        // e si mescolano con la musica di altre app)
        try? AVAudioSession.sharedInstance().setCategory(.ambient, mode: .default, options: [.mixWithOthers])
        try? AVAudioSession.sharedInstance().setActive(true)
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = GameViewController()
        window.makeKeyAndVisible()
        self.window = window
        return true
    }
}

/// Serve i file della cartella "web" dentro l'app agli indirizzi cristalia://localhost/...
final class AssetSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "cristalia"
    private let root: URL

    init(root: URL) { self.root = root.standardizedFileURL }

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else {
            task.didFailWithError(URLError(.badURL)); return
        }
        var path = url.path
        if path.isEmpty || path == "/" { path = "/index.html" }
        let file = root.appendingPathComponent(String(path.dropFirst())).standardizedFileURL
        // niente uscite dalla cartella del gioco
        guard file.path.hasPrefix(root.path), let data = try? Data(contentsOf: file) else {
            let r = HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1",
                                    headerFields: ["Content-Type": "text/plain; charset=utf-8"])!
            task.didReceive(r)
            task.didReceive(Data("non trovato".utf8))
            task.didFinish()
            return
        }
        let headers = [
            "Content-Type": Self.mime(file.pathExtension),
            "Content-Length": String(data.count),
            "Cache-Control": "no-cache",
        ]
        let r = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers)!
        task.didReceive(r)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}

    static func mime(_ ext: String) -> String {
        switch ext.lowercased() {
        case "html", "htm": return "text/html; charset=utf-8"
        case "js": return "text/javascript; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "json": return "application/json; charset=utf-8"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "svg": return "image/svg+xml"
        case "glb": return "model/gltf-binary"
        case "wav": return "audio/wav"
        case "mp3": return "audio/mpeg"
        default: return "application/octet-stream"
        }
    }
}

final class GameViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    private var webView: WKWebView!
    private var handler: AssetSchemeHandler?

    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .all }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .allButUpsideDown }

    override func loadView() {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []   // l'audio del gioco parte al primo tocco
        config.websiteDataStore = .default()                   // salvataggi persistenti
        if let web = Bundle.main.resourceURL?.appendingPathComponent("web") {
            let h = AssetSchemeHandler(root: web)
            config.setURLSchemeHandler(h, forURLScheme: AssetSchemeHandler.scheme)
            handler = h
        }
        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 0.06, green: 0.08, blue: 0.13, alpha: 1)
        webView.scrollView.backgroundColor = webView.backgroundColor
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never   // la pagina usa env(safe-area-inset-*)
        webView.allowsBackForwardNavigationGestures = false
        if #available(iOS 16.4, *) { webView.isInspectable = true }   // Safari › Sviluppo, per le prove dal Mac
        view = webView
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        guard handler != nil, Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "web") != nil else {
            webView.loadHTMLString("<h2 style='font-family:-apple-system;color:#fff;padding:40px'>File del gioco mancanti</h2>", baseURL: nil)
            return
        }
        webView.load(URLRequest(url: URL(string: "\(AssetSchemeHandler.scheme)://localhost/index.html")!))
    }

    // link esterni (condividi, siti) nel browser; tutto il resto resta nel gioco
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let url = navigationAction.request.url, url.scheme == "https" || url.scheme == "http",
           navigationAction.targetFrame?.isMainFrame ?? true {
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    // finestre aperte con target=_blank → browser
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url { UIApplication.shared.open(url) }
        return nil
    }

    // se iOS chiude il processo della pagina (memoria), si riparte da capo: i salvataggi restano
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { webView.reload() }
}
