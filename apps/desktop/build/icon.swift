import AppKit
// Original open-ring mark with two continuation bars, rendered at native icon sizes.
let directory = CommandLine.arguments[1]
try FileManager.default.createDirectory(atPath: directory, withIntermediateDirectories: true)
for size in [16, 32, 64, 128, 256, 512, 1024] {
    let image = NSImage(size: NSSize(width: size, height: size))
    image.lockFocus()
    let scale = CGFloat(size) / 1024
    let transform = NSAffineTransform(); transform.scale(by: scale); transform.concat()
    NSColor(calibratedRed: 0.063, green: 0.082, blue: 0.133, alpha: 1).setFill()
    NSBezierPath(roundedRect: NSRect(x: 24, y: 24, width: 976, height: 976), xRadius: 210, yRadius: 210).fill()
    NSColor(calibratedRed: 0.545, green: 0.722, blue: 1, alpha: 1).setStroke()
    let ring = NSBezierPath(); ring.lineWidth = 92; ring.lineCapStyle = .round
    ring.appendArc(withCenter: NSPoint(x: 500, y: 512), radius: 260, startAngle: 44, endAngle: 316, clockwise: false); ring.stroke()
    for y in [CGFloat(450), CGFloat(574)] {
        let bar = NSBezierPath(); bar.lineWidth = 58; bar.lineCapStyle = .round
        bar.move(to: NSPoint(x: 540, y: y)); bar.line(to: NSPoint(x: 820, y: y)); bar.stroke()
    }
    image.unlockFocus()
    let representation = NSBitmapImageRep(data: image.tiffRepresentation!)!
    let data = representation.representation(using: .png, properties: [:])!
    let name = size == 1024 ? "icon_512x512@2x.png" : "icon_\(size)x\(size).png"
    try data.write(to: URL(fileURLWithPath: directory).appendingPathComponent(name))
}
