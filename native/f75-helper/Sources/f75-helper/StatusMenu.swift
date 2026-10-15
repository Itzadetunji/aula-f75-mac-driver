import AppKit

/// The menu bar icon and its menu. The app sends the whole menu as data
/// (`setMenu`), so labels stay translated on the app side; clicks come back as
/// `{"event":"menu","id":…}`.
///
/// The bar shows `title` as text when given, otherwise the SF Symbol `icon`.
/// Item kinds: `item` (default), `header`, `separator`. Items may carry an SF
/// Symbol name, a checkmark and an enabled flag.
final class StatusMenu: NSObject {
    private var item: NSStatusItem?
    var onSelect: ((String) -> Void)?

    /// Call on the main thread.
    func update(_ spec: [String: Any]) {
        if item == nil {
            item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        }
        if let button = item?.button {
            if let title = spec["title"] as? String {
                button.image = nil
                button.attributedTitle = NSAttributedString(
                    string: title,
                    attributes: [.font: NSFont.systemFont(ofSize: NSFont.systemFontSize, weight: .semibold)])
            } else {
                let icon = NSImage(systemSymbolName: spec["icon"] as? String ?? "keyboard", accessibilityDescription: "AULA F75")
                    ?? NSImage(systemSymbolName: "keyboard", accessibilityDescription: "AULA F75")
                icon?.isTemplate = true
                button.title = ""
                button.image = icon
            }
            // Greyed out while the app is paused.
            button.appearsDisabled = spec["dimmed"] as? Bool ?? false
            button.toolTip = spec["tooltip"] as? String
        }

        let menu = NSMenu()
        menu.autoenablesItems = false
        for entry in spec["items"] as? [[String: Any]] ?? [] {
            let title = entry["title"] as? String ?? ""
            switch entry["type"] as? String {
            case "separator":
                menu.addItem(.separator())
            case "header":
                if #available(macOS 14, *) {
                    menu.addItem(.sectionHeader(title: title))
                } else {
                    let header = NSMenuItem(title: title, action: nil, keyEquivalent: "")
                    header.isEnabled = false
                    menu.addItem(header)
                }
            default:
                let menuItem = NSMenuItem(title: title, action: #selector(clicked(_:)), keyEquivalent: entry["key"] as? String ?? "")
                menuItem.target = self
                menuItem.representedObject = entry["id"] as? String
                menuItem.state = entry["checked"] as? Bool == true ? .on : .off
                menuItem.isEnabled = entry["enabled"] as? Bool ?? true
                if let symbol = entry["symbol"] as? String {
                    menuItem.image = NSImage(systemSymbolName: symbol, accessibilityDescription: title)
                }
                menu.addItem(menuItem)
            }
        }
        item?.menu = menu
    }

    @objc private func clicked(_ sender: NSMenuItem) {
        if let id = sender.representedObject as? String { onSelect?(id) }
    }
}
