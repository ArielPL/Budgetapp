// ── native-assets — the app icon and splash screen for iOS and Android ──────
//
// Draws every icon and splash image the two native projects need from the web
// app's own icons, so all three look like the same app. Run from the repo root:
//
//     swift scripts/native-assets.swift
//
// Why a script and not @capacitor/assets: this needs nothing downloaded — only
// what ships with macOS — and it is short enough to read.
//
// The source is assets/icon-1024.png (the App Store wants 1024 × 1024; made
// with Photoshop's Super Resolution from the 512 one, 2026-10-05), falling back
// to public/icon-512.png; Android's adaptive layer uses icon-maskable-512.png.
//
// The splash background is the web app's own (manifest background_color, the
// light theme's --bg, which new users start in), so the moment the app opens
// looks like the moment the web app opens.

import AppKit
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

let fm = FileManager.default
let splashBackground = CGColor(red: 0xfb / 255, green: 0xfa / 255, blue: 0xff / 255, alpha: 1)

func load(_ path: String) -> CGImage {
  guard let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil),
        let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else { fatalError("cannot read \(path)") }
  return img
}

// Outside public/: it is only a source for this script, and 1.2 MB the web
// app and the native bundles would otherwise carry for nothing.
let big = fm.fileExists(atPath: "assets/icon-1024.png")
let icon = load(big ? "assets/icon-1024.png" : "public/icon-512.png")
// Always the maskable one: it keeps the coin inside the middle 66 dp a launcher
// promises not to cut, which the full-bleed 1024 icon does not. 512 is plenty —
// the largest layer Android asks for is 432 px (108 dp at xxxhdpi).
let maskable = load("public/icon-maskable-512.png")

/// Draw into a fresh canvas and write it as PNG. `opaque` leaves out the alpha
/// channel, which the App Store requires of an app icon.
func render(_ path: String, _ w: Int, _ h: Int, opaque: Bool = false, _ draw: (CGContext) -> Void) {
  let info = opaque ? CGImageAlphaInfo.noneSkipLast.rawValue : CGImageAlphaInfo.premultipliedLast.rawValue
  guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                            space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: info) else { fatalError() }
  ctx.interpolationQuality = .high
  draw(ctx)
  guard let out = ctx.makeImage(),
        let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: path) as CFURL,
                                                   UTType.png.identifier as CFString, 1, nil) else { fatalError() }
  CGImageDestinationAddImage(dest, out, nil)
  guard CGImageDestinationFinalize(dest) else { fatalError("cannot write \(path)") }
  print("wrote \(path) \(w)×\(h)")
}

/// The icon as a rounded square, the way a phone shows it, centred at `side`.
func roundedIcon(_ ctx: CGContext, in rect: CGRect) {
  ctx.saveGState()
  let r = rect.width * 0.2237 // Apple's icon corner ratio
  ctx.addPath(CGPath(roundedRect: rect, cornerWidth: r, cornerHeight: r, transform: nil))
  ctx.clip()
  ctx.draw(icon, in: rect)
  ctx.restoreGState()
}

func splash(_ path: String, _ w: Int, _ h: Int, iconShare: Double) {
  render(path, w, h, opaque: true) { ctx in
    ctx.setFillColor(splashBackground)
    ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
    let side = (Double(min(w, h)) * iconShare).rounded()
    roundedIcon(ctx, in: CGRect(x: (Double(w) - side) / 2, y: (Double(h) - side) / 2, width: side, height: side))
  }
}

// ── iOS ─────────────────────────────────────────────────────────────────────
let ios = "ios/App/App/Assets.xcassets"
render("\(ios)/AppIcon.appiconset/AppIcon-512@2x.png", 1024, 1024, opaque: true) { ctx in
  ctx.draw(icon, in: CGRect(x: 0, y: 0, width: 1024, height: 1024))
}
// The launch screen (Base.lproj/LaunchScreen.storyboard) paints the colour
// itself and centres this icon at 140 pt — Apple's advice for launch screens,
// rather than Capacitor's one full-screen 2732 px square (~30 MB decoded, and
// cropped differently on every screen shape).
// NOT YET SEEN RUNNING: the iOS 27 simulator showed black for every launch
// screen tried on 2026-09-27, even a plain colour. Check it on a real iPhone.
for (suffix, scale) in [("", 1), ("@2x", 2), ("@3x", 3)] {
  let side = 140 * scale
  render("\(ios)/Splash.imageset/splash-icon\(suffix).png", side, side) { ctx in
    roundedIcon(ctx, in: CGRect(x: 0, y: 0, width: side, height: side))
  }
}

// ── Android ─────────────────────────────────────────────────────────────────
let res = "android/app/src/main/res"
let densities: [(String, Double)] = [("mdpi", 1), ("hdpi", 1.5), ("xhdpi", 2), ("xxhdpi", 3), ("xxxhdpi", 4)]
for (d, scale) in densities {
  let legacy = Int(48 * scale)
  // Android 7 draws the legacy icon as it is, so it carries its own corners.
  render("\(res)/mipmap-\(d)/ic_launcher.png", legacy, legacy) { ctx in
    roundedIcon(ctx, in: CGRect(x: 0, y: 0, width: legacy, height: legacy))
  }
  render("\(res)/mipmap-\(d)/ic_launcher_round.png", legacy, legacy) { ctx in
    ctx.addEllipse(in: CGRect(x: 0, y: 0, width: legacy, height: legacy))
    ctx.clip()
    ctx.draw(maskable, in: CGRect(x: 0, y: 0, width: legacy, height: legacy))
  }
  // Android 8+: the launcher cuts its own shape out of a 108 dp layer and
  // promises only the middle 66 dp. The maskable icon is made for exactly
  // that — the coin sits well inside its safe zone.
  let layer = Int(108 * scale)
  render("\(res)/mipmap-\(d)/ic_launcher_foreground.png", layer, layer) { ctx in
    ctx.draw(maskable, in: CGRect(x: 0, y: 0, width: layer, height: layer))
  }
}
// Splash before Android 12 (12+ draws its own from the icon and the colour set
// in styles.xml): one image per density and orientation, sizes as Capacitor made them.
let splashSizes: [(String, Int, Int)] = [
  ("drawable", 480, 320),
  ("drawable-land-mdpi", 480, 320), ("drawable-land-hdpi", 800, 480), ("drawable-land-xhdpi", 1280, 720),
  ("drawable-land-xxhdpi", 1600, 960), ("drawable-land-xxxhdpi", 1920, 1280),
  ("drawable-port-mdpi", 320, 480), ("drawable-port-hdpi", 480, 800), ("drawable-port-xhdpi", 720, 1280),
  ("drawable-port-xxhdpi", 960, 1600), ("drawable-port-xxxhdpi", 1280, 1920),
]
for (dir, w, h) in splashSizes { splash("\(res)/\(dir)/splash.png", w, h, iconShare: 0.3) }

// The colour behind the adaptive icon's layer: the icon's own blue, read from
// its corner, so a launcher that shows any of it shows the right colour.
let rep = NSBitmapImageRep(cgImage: maskable)
let c = rep.colorAt(x: 2, y: 2)!.usingColorSpace(.sRGB)!
let hex = String(format: "#%02X%02X%02X",
                 Int((c.redComponent * 255).rounded()), Int((c.greenComponent * 255).rounded()),
                 Int((c.blueComponent * 255).rounded()))
try! """
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">\(hex)</color>
</resources>

""".write(toFile: "\(res)/values/ic_launcher_background.xml", atomically: true, encoding: .utf8)
print("ic_launcher_background = \(hex)")
