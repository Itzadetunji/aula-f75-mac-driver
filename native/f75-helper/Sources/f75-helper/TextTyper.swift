import CoreGraphics
import Foundation

/// Types text into the focused app by posting synthetic key events.
/// Requires the Accessibility permission for the app that launched the helper.
enum TextTyper {
    private static let queue = DispatchQueue(label: "f75.text-typer")
    private static let returnKey: CGKeyCode = 36
    private static let tabKey: CGKeyCode = 48
    /// macOS accepts at most 20 UTF-16 units per keyboard event.
    private static let chunkSize = 20

    static func type(_ text: String, pressEnter: Bool) {
        queue.async {
            // The macro shortcut's modifiers are usually still held; typing now would turn "a" into ⌘A.
            let modifiers: CGEventFlags = [.maskCommand, .maskAlternate, .maskControl, .maskShift]
            let deadline = Date().addingTimeInterval(2)
            while !CGEventSource.flagsState(.combinedSessionState).intersection(modifiers).isEmpty, Date() < deadline {
                usleep(2_000)
            }

            let source = CGEventSource(stateID: .hidSystemState)
            var pending: [UInt16] = []

            func flush() {
                guard !pending.isEmpty else { return }
                typeUnits(pending, source)
                pending.removeAll(keepingCapacity: true)
                usleep(1_000)
            }

            for character in text {
                if character.isNewline || character == "\t" {
                    flush()
                    tap(character == "\t" ? tabKey : returnKey, source)
                    continue
                }
                let units = Array(String(character).utf16)
                // Keep characters (e.g. emoji, which are several UTF-16 units) whole within one event.
                if pending.count + units.count > chunkSize { flush() }
                pending += units
            }
            flush()
            if pressEnter { tap(returnKey, source) }
        }
    }

    private static func typeUnits(_ units: [UInt16], _ source: CGEventSource?) {
        for down in [true, false] {
            guard let event = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: down) else { continue }
            event.flags = []
            event.keyboardSetUnicodeString(stringLength: units.count, unicodeString: units)
            event.post(tap: .cghidEventTap)
        }
    }

    private static func tap(_ key: CGKeyCode, _ source: CGEventSource?) {
        for down in [true, false] {
            let event = CGEvent(keyboardEventSource: source, virtualKey: key, keyDown: down)
            event?.flags = []
            event?.post(tap: .cghidEventTap)
        }
        usleep(1_000)
    }
}
