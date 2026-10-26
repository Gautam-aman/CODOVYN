// Read-only window inventory for one recorded test-owned application PID.
import Foundation
import CoreGraphics
let pid = Int(CommandLine.arguments[1])!
let rows = CGWindowListCopyWindowInfo([.optionAll], kCGNullWindowID) as? [[String: Any]] ?? []
let windows = rows.filter { ($0[kCGWindowOwnerPID as String] as? Int) == pid }.compactMap { row -> [String: Any]? in
    guard let bounds = row[kCGWindowBounds as String] as? [String: Any],
          let width = bounds["Width"] as? Double, let height = bounds["Height"] as? Double,
          width > 600, height > 300 else { return nil }
    return ["id": row[kCGWindowNumber as String] ?? 0,
            "onScreen": row[kCGWindowIsOnscreen as String] ?? false,
            "width": width, "height": height]
}
print(String(data: try! JSONSerialization.data(withJSONObject: windows, options: [.sortedKeys]), encoding: .utf8)!)
