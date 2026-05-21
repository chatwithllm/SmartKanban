import AppKit
import os

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    static let log = Logger(subsystem: Constants.bundleID, category: "lifecycle")

    func applicationDidFinishLaunching(_ notification: Notification) {
        Self.log.info("KanbanClaude launched build=\(Constants.appVersion, privacy: .public)")
        FontLoader.registerBundledFonts()
        ThemeManager.shared.apply()
        URLSchemeHandler.shared.install()
        NotificationCenterBridge.shared.attach()
        StatusItemController.shared.install()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        false
    }
}
