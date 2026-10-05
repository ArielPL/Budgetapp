import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = CAPBridgeViewController()
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
