import UIKit
import Capacitor
import WebKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = AppViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }

    // ── Hide the budget from the app switcher ──────────────────────────────
    // iOS snapshots the screen for the app switcher as the app leaves the
    // foreground, so a cover goes on BEFORE that — on resign active, which also
    // covers Control Center and the notification shade — and comes off when the
    // app is active again. It looks like the launch screen: the light
    // background and the icon. Screenshots are not affected.
    //
    // In the APP's theme, not the phone's: a dark app used to flash a white
    // card in the switcher (full sweep 2026-10-08). The page tells which theme
    // and background it shows through AppLangPlugin.theme; until it has, the
    // launch screen's light colour.
    private var cover: UIView?

    func sceneWillResignActive(_ scene: UIScene) {
        guard cover == nil, let window = window else { return }
        let view = UIView(frame: window.bounds)
        view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.backgroundColor = AppLangPlugin.coverColor
        let icon = UIImageView(image: UIImage(named: "Splash"))
        icon.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(icon)
        NSLayoutConstraint.activate([
            icon.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            icon.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            icon.widthAnchor.constraint(equalToConstant: 140),
            icon.heightAnchor.constraint(equalToConstant: 140),
        ])
        window.addSubview(view)
        cover = view
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        cover?.removeFromSuperview()
        cover = nil
    }
}

// ── confirm() and alert() in the app's own language ────────────────────────
// Capacitor answers the page's confirm() with buttons it spells "Cancel" and
// "Ok" whatever the language (store screenshots, 2026-10-05: "Detta ERSÄTTER
// all nuvarande data …" over [Cancel] [Ok]). This sits in front of Capacitor's
// handler and draws those two dialogs itself, with the buttons in the language
// the APP is set to — told by the page through AppLangPlugin, since the app
// can be Spanish on a Swedish phone — or UIKit's own words until then.
// Everything else passes on untouched.

final class AppViewController: CAPBridgeViewController {
    private var dialogs: LocalizedDialogs?

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(AppLangPlugin())
        guard let webView = webView else { return }
        let proxy = LocalizedDialogs(original: webView.uiDelegate, presenter: self)
        webView.uiDelegate = proxy
        dialogs = proxy // the web view holds its delegate weakly
    }
}

final class LocalizedDialogs: NSObject, WKUIDelegate {
    private weak var original: WKUIDelegate?
    private weak var presenter: UIViewController?

    init(original: WKUIDelegate?, presenter: UIViewController) {
        self.original = original
        self.presenter = presenter
    }

    /// The button's title in the app's language; UIKit's own word for it
    /// (the phone's language, see CFBundleLocalizations) until the page has
    /// said which language it is in.
    private func title(_ key: String) -> String {
        if let lang = AppLangPlugin.lang, let word = AppLangPlugin.buttons[lang]?[key] { return word }
        return Bundle(for: UIApplication.self).localizedString(forKey: key, value: key, table: nil)
    }

    override func responds(to aSelector: Selector!) -> Bool {
        super.responds(to: aSelector) || (original?.responds(to: aSelector) ?? false)
    }

    override func forwardingTarget(for aSelector: Selector!) -> Any? {
        original
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        guard let presenter = presenter else { completionHandler(false); return }
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: title("Cancel"), style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: title("OK"), style: .default) { _ in completionHandler(true) })
        presenter.present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        guard let presenter = presenter else { completionHandler(); return }
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: title("OK"), style: .default) { _ in completionHandler() })
        presenter.present(alert, animated: true)
    }
}

/// The page tells the native side which language the app is in.
@objc(AppLangPlugin)
public class AppLangPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppLangPlugin"
    public let jsName = "AppLang"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "theme", returnType: CAPPluginReturnPromise)
    ]

    static var lang: String?
    /// The app's theme ("light" / "dark") and its background, as the page last
    /// said — for the app-switcher cover. Read on the main thread.
    static var themeMode: String?
    static var themeBackground: UIColor?

    /// The launch screen's light background, and Sorbet's dark one: what each
    /// theme looks like when the page sent no colour this app can read.
    private static let lightBackground = UIColor(red: 0xfb / 255, green: 0xfa / 255, blue: 0xff / 255, alpha: 1)
    private static let darkBackground = UIColor(red: 0x0f / 255, green: 0x17 / 255, blue: 0x2a / 255, alpha: 1)

    static var coverColor: UIColor {
        if let bg = themeBackground { return bg }
        return themeMode == "dark" ? darkBackground : lightBackground
    }

    /// "#rgb" or "#rrggbb", or nil for anything else (a custom theme value is
    /// any string the user's override map holds).
    static func color(hex: String) -> UIColor? {
        var s = hex.trimmingCharacters(in: .whitespaces)
        guard s.hasPrefix("#") else { return nil }
        s.removeFirst()
        if s.count == 3 { s = s.map { "\($0)\($0)" }.joined() }
        guard s.count == 6, let v = UInt32(s, radix: 16) else { return nil }
        return UIColor(red: CGFloat((v >> 16) & 0xff) / 255, green: CGFloat((v >> 8) & 0xff) / 255,
                       blue: CGFloat(v & 0xff) / 255, alpha: 1)
    }

    @objc func theme(_ call: CAPPluginCall) {
        let mode = call.getString("mode")
        let background = call.getString("background").flatMap { AppLangPlugin.color(hex: $0) }
        DispatchQueue.main.async {
            AppLangPlugin.themeMode = mode
            AppLangPlugin.themeBackground = background
        }
        call.resolve()
    }
    /// The same three languages as the app (src/i18n.ts).
    static let buttons: [String: [String: String]] = [
        "sv": ["Cancel": "Avbryt", "OK": "OK"],
        "en": ["Cancel": "Cancel", "OK": "OK"],
        "es": ["Cancel": "Cancelar", "OK": "Aceptar"],
    ]

    @objc func set(_ call: CAPPluginCall) {
        AppLangPlugin.lang = call.getString("lang")
        call.resolve()
    }
}
