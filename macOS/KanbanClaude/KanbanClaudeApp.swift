import SwiftUI
import os

@main
struct KanbanClaudeApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        WindowGroup("SmartKanban", id: "main") {
            RootView()
                .frame(minWidth: 960, minHeight: 600)
        }
        .windowToolbarStyle(.unifiedCompact)
    }
}
