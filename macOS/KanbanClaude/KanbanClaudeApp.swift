import SwiftUI
import os

@main
struct KanbanClaudeApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        WindowGroup("SmartKanban", id: "main") {
            RootView()
                .frame(minWidth: 960, minHeight: 600)
                .onOpenURL { url in
                    URLSchemeHandler.shared.handle(url)
                }
        }
        .windowToolbarStyle(.unifiedCompact)

        Settings {
            PreferencesView()
        }
        .commands {
            CommandMenu("Admin") {
                Button("Admin Console…") {
                    if let url = URL(string: APIClient.shared.baseURL.absoluteString + "admin") {
                        NSWorkspace.shared.open(url)
                    }
                }
                .disabled(!(AuthStore.shared.currentUser?.isAdmin ?? false))
            }
        }
    }
}
