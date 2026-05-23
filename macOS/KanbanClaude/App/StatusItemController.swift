import AppKit
import Combine

@MainActor
final class StatusItemController {
    static let shared = StatusItemController()
    private var statusItem: NSStatusItem?
    private var unreadObserver: AnyCancellable?

    func install() {
        guard statusItem == nil else { return }
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        item.button?.title = "K"
        item.button?.toolTip = Constants.appName
        let menu = NSMenu(title: Constants.appName)
        menu.addItem(NSMenuItem(title: "Capture…", action: #selector(handleCapture(_:)), keyEquivalent: "n"))
        menu.items.last?.target = self
        menu.items.last?.keyEquivalentModifierMask = [.command]
        menu.addItem(NSMenuItem.separator())
        menu.addItem(NSMenuItem(title: "Show \(Constants.appName)", action: #selector(handleShow(_:)), keyEquivalent: ""))
        menu.items.last?.target = self
        menu.addItem(NSMenuItem(title: "Quit", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
        item.menu = menu
        statusItem = item

        unreadObserver = UnreadStore.shared.$counts.sink { [weak self] _ in
            Task { @MainActor in self?.updateBadge() }
        }
    }

    private func updateBadge() {
        let total = UnreadStore.shared.total()
        statusItem?.button?.title = total > 0 ? "K \(total > 99 ? "99+" : "\(total)")" : "K"
        NSApp.dockTile.badgeLabel = total > 0 ? "\(total)" : nil
    }

    @objc private func handleCapture(_ sender: Any?) {
        WindowCoordinator.shared.openCapture(initialStatus: .today)
    }

    @objc private func handleShow(_ sender: Any?) {
        NSApp.activate(ignoringOtherApps: true)
        if let win = NSApp.windows.first(where: { $0.identifier?.rawValue.starts(with: "main") == true }) {
            win.makeKeyAndOrderFront(nil)
        }
    }
}
