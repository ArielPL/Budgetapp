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
    private var cover: UIView?

    func sceneWillResignActive(_ scene: UIScene) {
        guard cover == nil, let window = window else { return }
        let view = UIView(frame: window.bounds)
        view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.backgroundColor = UIColor(red: 0xfb / 255, green: 0xfa / 255, blue: 0xff / 255, alpha: 1)
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

// ── confirm() and alert() in the phone's own language ──────────────────────
// Capacitor answers the page's confirm() with buttons it spells "Cancel" and
// "Ok" whatever the phone's language (store screenshots, 2026-10-05: "Detta
// ERSÄTTER all nuvarande data …" over [Cancel] [Ok]). This sits in front of
// Capacitor's handler, draws those two dialogs with UIKit's own translated
// titles, and passes everything else on untouched.

final class AppViewController: CAPBridgeViewController {
    private var dialogs: LocalizedDialogs?

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
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

    /// UIKit's own word for it, in the language the app runs in (see
    /// CFBundleLocalizations in Info.plist).
    private func uikit(_ key: String) -> String {
        Bundle(for: UIApplication.self).localizedString(forKey: key, value: key, table: nil)
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
        alert.addAction(UIAlertAction(title: uikit("Cancel"), style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: uikit("OK"), style: .default) { _ in completionHandler(true) })
        presenter.present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        guard let presenter = presenter else { completionHandler(); return }
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: uikit("OK"), style: .default) { _ in completionHandler() })
        presenter.present(alert, animated: true)
    }
}
