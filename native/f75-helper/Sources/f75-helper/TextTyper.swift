import CoreGraphics
import Foundation

/// Types text into the focused app by posting synthetic key events.
/// Requires the Accessibility permission for the app that launched the helper.
enum TextTyper {
    private static let queue = DispatchQueue(label: "f75.text-typer")
    private static let returnKey: CGKeyCode = 36
    private static let tabKey: CGKeyCode = 48

    static func type(_ text: String, pressEnter: Bool) {
        queue.async {
            // The macro shortcut's modifiers are usually still held; typing now would turn "a" into ⌘A.
            let modifiers: CGEventFlags = [.maskCommand, .maskAlternate, .maskControl, .maskShift]
            let deadline = Date().addingTimeInterval(2)
            while !CGEventSource.flagsState(.combinedSessionState).intersection(modifiers).isEmpty, Date() < deadline {
                usleep(10_000)
            }

            let source = CGEventSource(stateID: .hidSystemState)
            for character in text {
                if character.isNewline {
                    tap(returnKey, source)
                } else if character == "\t" {
                    tap(tabKey, source)
                } else {
                    typeCharacter(character, source)
                }
                usleep(3_000)
            }
            if pressEnter { tap(returnKey, source) }
        }
    }

    private static func typeCharacter(_ character: Character, _ source: CGEventSource?) {
        let utf16 = Array(String(character).utf16)
        for down in [true, false] {
            guard let event = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: down) else { continue }
            event.flags = []
            event.keyboardSetUnicodeString(stringLength: utf16.count, unicodeString: utf16)
            event.post(tap: .cghidEventTap)
        }
    }

    private static func tap(_ key: CGKeyCode, _ source: CGEventSource?) {
        for down in [true, false] {
            let event = CGEvent(keyboardEventSource: source, virtualKey: key, keyDown: down)
            event?.flags = []
            event?.post(tap: .cghidEventTap)
        }
    }
}
