import AppKit
import Foundation

// Renders SF Symbols to tinted PNGs for the menu-bar tray icon.
// Usage: swift scripts/gen_icons.swift <outdir>
//
// Icon states: cup fill = caffeinate, pill behind cup = pmset prevent-sleep.
// tray-<c><p>.png / tray-<c><p>-dark.png where c=caffeinate, p=pmset, 0=off, 1=on.

let outdir = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "icons"
try! FileManager.default.createDirectory(atPath: outdir, withIntermediateDirectories: true)

func symbol(_ name: String, _ pointSize: CGFloat) -> NSImage {
    guard let base = NSImage(systemSymbolName: name, accessibilityDescription: nil) else {
        FileHandle.standardError.write("missing symbol: \(name)\n".data(using: .utf8)!)
        exit(1)
    }
    return base.withSymbolConfiguration(.init(pointSize: pointSize, weight: .medium)) ?? base
}

// Draws images centered at the given canvas points (AppKit: y grows upward),
// then tints all drawn alpha with `tint`.
func render(layers: [(img: NSImage, cx: CGFloat, cy: CGFloat)],
            tint: NSColor, size: CGFloat, out: String) {
    let canvas = NSImage(size: NSSize(width: size, height: size))
    canvas.lockFocus()
    for layer in layers {
        let img = layer.img
        let rect = NSRect(
            x: layer.cx - img.size.width / 2,
            y: layer.cy - img.size.height / 2,
            width: img.size.width,
            height: img.size.height
        )
        img.draw(in: rect, from: .zero, operation: .sourceOver, fraction: 1)
    }
    tint.set()
    NSRect(origin: .zero, size: NSSize(width: size, height: size)).fill(using: .sourceIn)
    canvas.unlockFocus()
    guard let tiff = canvas.tiffRepresentation,
          let rep = NSBitmapImageRep(data: tiff),
          let png = rep.representation(using: .png, properties: [:]) else {
        FileHandle.standardError.write("failed to encode \(out)\n".data(using: .utf8)!)
        exit(1)
    }
    try! png.write(to: URL(fileURLWithPath: out))
    print("wrote \(out)")
}

let size: CGFloat = 44 // 22pt @2x, standard menu-bar icon size

let colors: [(name: String, tint: NSColor)] = [
    ("", .black),                    // light-mode variant
    ("-dark", .white),               // dark-mode variant
]

for c in colors {
    for caf in [0, 1] {
        for pm in [0, 1] {
            var layers: [(img: NSImage, cx: CGFloat, cy: CGFloat)] = []
            if pm == 1 {
                // A capsule pill peeking out behind the cup, top-right.
                layers.append((symbol("pill.fill", 19), 33, 32))
            }
            let cup = caf == 1 ? "cup.and.saucer.fill" : "cup.and.saucer"
            // cup shifts left/down a bit when the pill shares the space
            let (cx, cy): (CGFloat, CGFloat) = pm == 1 ? (17, 18) : (22, 22)
            layers.append((symbol(cup, pm == 1 ? 29 : 32), cx, cy))
            // both features off: dim the icon so it reads as inactive
            let tint = (caf == 0 && pm == 0) ? c.tint.withAlphaComponent(0.45) : c.tint
            render(layers: layers, tint: tint, size: size,
                   out: "\(outdir)/tray-\(caf)\(pm)\(c.name).png")
        }
    }
}

// Returns a copy of the image tinted to a single color (alpha preserved).
func tinted(_ img: NSImage, _ tint: NSColor) -> NSImage {
    let out = NSImage(size: img.size)
    out.lockFocus()
    img.draw(in: NSRect(origin: .zero, size: img.size))
    tint.set()
    NSRect(origin: .zero, size: img.size).fill(using: .sourceIn)
    out.unlockFocus()
    return out
}

// App icon: white cup on an espresso-brown gradient squircle, so it reads on
// both light and dark Finder/dock backgrounds.
let iconSize: CGFloat = 1024
let icon = NSImage(size: NSSize(width: iconSize, height: iconSize))
icon.lockFocus()
let bgRect = NSRect(x: 0, y: 0, width: iconSize, height: iconSize)
    .insetBy(dx: iconSize * 0.015, dy: iconSize * 0.015)
let squircle = NSBezierPath(roundedRect: bgRect,
                            xRadius: iconSize * 0.225, yRadius: iconSize * 0.225)
NSGradient(
    starting: NSColor(calibratedRed: 0.72, green: 0.47, blue: 0.28, alpha: 1),
    ending: NSColor(calibratedRed: 0.40, green: 0.24, blue: 0.13, alpha: 1)
)!.draw(in: squircle, angle: -90)
// subtle edge so the icon doesn't bleed into light backgrounds
NSColor.black.withAlphaComponent(0.18).set()
squircle.lineWidth = iconSize * 0.008
squircle.stroke()

let cup = tinted(symbol("cup.and.saucer.fill", iconSize * 0.62), .white)
cup.draw(in: NSRect(
    x: (iconSize - cup.size.width) / 2,
    y: (iconSize - cup.size.height) / 2,
    width: cup.size.width, height: cup.size.height
))
icon.unlockFocus()

guard let iconTiff = icon.tiffRepresentation,
      let iconRep = NSBitmapImageRep(data: iconTiff),
      let iconPng = iconRep.representation(using: .png, properties: [:]) else {
    FileHandle.standardError.write("failed to encode app.png\n".data(using: .utf8)!)
    exit(1)
}
try! iconPng.write(to: URL(fileURLWithPath: "\(outdir)/app.png"))
print("wrote \(outdir)/app.png")
