import SwiftUI
import AppKit

struct AdminUsersView: View {
    @State private var users: [AdminUserRow] = []
    @State private var loading = true
    @State private var errorText: String?

    var body: some View {
        Group {
            if loading {
                ProgressView()
            } else if let e = errorText {
                Text(e).foregroundStyle(Tokens.danger)
            } else if users.count <= 1 {
                Text("Only you. Family will appear here after they sign in.")
                    .foregroundStyle(Tokens.ink2)
                    .padding()
            } else {
                table
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .task { await load() }
    }

    private var table: some View {
        Table(users) {
            TableColumn("Name", value: \.shortName)
            TableColumn("Email", value: \.email)
            TableColumn("Identities") { row in
                Text(row.identities.map(\.provider).joined(separator: ", "))
            }
            TableColumn("Admin") { u in
                Button(u.isAdmin ? "Admin" : "Make admin") {
                    Task { await toggle(u) }
                }
                .controlSize(.small)
            }
            TableColumn("Actions") { u in
                HStack(spacing: 6) {
                    let onlyGoogle = !u.identities.isEmpty && u.identities.allSatisfy { $0.provider == "google" }
                    Button("Reset pw") { Task { await resetPw(u) } }
                        .controlSize(.small)
                        .disabled(onlyGoogle)
                    Button("Revoke") { Task { await revoke(u) } }
                        .controlSize(.small)
                }
            }
        }
        .padding()
    }

    private func load() async {
        loading = true
        errorText = nil
        do {
            users = try await APIClient.shared.send(.adminListUsers, as: [AdminUserRow].self)
        } catch {
            errorText = error.localizedDescription
        }
        loading = false
    }

    private func toggle(_ u: AdminUserRow) async {
        do {
            if u.isAdmin {
                try await APIClient.shared.sendVoid(.adminDemote(userId: u.id))
            } else {
                try await APIClient.shared.sendVoid(.adminPromote(userId: u.id))
            }
            await load()
        } catch {
            errorText = error.localizedDescription
        }
    }

    private func revoke(_ u: AdminUserRow) async {
        do {
            try await APIClient.shared.sendVoid(.adminRevokeSessions(userId: u.id))
            await load()
        } catch {
            errorText = error.localizedDescription
        }
    }

    private func resetPw(_ u: AdminUserRow) async {
        let alert = NSAlert()
        alert.messageText = "Set a temporary password for \(u.shortName)"
        let input = NSSecureTextField(frame: NSRect(x: 0, y: 0, width: 240, height: 24))
        alert.accessoryView = input
        alert.addButton(withTitle: "Set")
        alert.addButton(withTitle: "Cancel")
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        let pw = input.stringValue
        guard pw.count >= 6 else {
            errorText = "Password must be at least 6 characters."
            return
        }
        do {
            try await APIClient.shared.sendVoid(.adminResetPassword(userId: u.id, newPassword: pw))
            await load()
        } catch {
            errorText = error.localizedDescription
        }
    }
}
