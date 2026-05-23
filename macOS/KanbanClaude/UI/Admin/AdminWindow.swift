import SwiftUI
import AppKit

// MARK: - Content view

struct AdminWindow: View {
    enum Tab: String, CaseIterable {
        case users, approvals, audit
    }
    @State private var tab: Tab = .users

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Picker("", selection: $tab) {
                Text("Users").tag(Tab.users)
                Text("Approvals").tag(Tab.approvals)
                Text("Audit").tag(Tab.audit)
            }
            .pickerStyle(.segmented)
            .padding(.horizontal)
            .padding(.vertical, 8)

            Divider()

            Group {
                switch tab {
                case .users:
                    AdminUsersView()
                case .approvals:
                    AdminApprovalsView()
                case .audit:
                    AdminAuditView()
                }
            }
        }
        .frame(minWidth: 720, minHeight: 480)
    }
}

// MARK: - Window controller

final class AdminWindowController: NSWindowController {
    convenience init() {
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 800, height: 540),
            styleMask: [.titled, .closable, .resizable, .miniaturizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Admin Console"
        window.center()
        window.contentView = NSHostingView(rootView: AdminWindow())
        self.init(window: window)
    }
}
