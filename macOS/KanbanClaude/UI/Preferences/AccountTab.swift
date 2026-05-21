import SwiftUI

struct AccountTab: View {
    @StateObject private var auth = AuthStore.shared
    @State private var shortName: String = ""
    @State private var saving = false
    @State private var savedMessage: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let user = auth.currentUser {
                    GroupBox("Account") {
                        HStack { Text("Name"); Spacer(); Text(user.name).foregroundStyle(Tokens.ink2) }
                        HStack { Text("Email"); Spacer(); Text(user.email).foregroundStyle(Tokens.ink2) }
                    }
                    GroupBox("Display name") {
                        HStack {
                            TextField("Short name (1–16)", text: $shortName)
                                .textFieldStyle(.roundedBorder)
                                .onChange(of: shortName) { new in
                                    if new.count > 16 { shortName = String(new.prefix(16)) }
                                }
                            Button(saving ? "Saving…" : "Save") { save(user: user) }
                                .disabled(saving || shortName.trimmingCharacters(in: .whitespaces).isEmpty)
                        }
                        if let msg = savedMessage {
                            Text(msg).foregroundStyle(Tokens.greenAccent).font(.sans(11))
                        }
                    }
                    Button("Sign out", role: .destructive) {
                        Task { await auth.logout() }
                    }
                } else {
                    Text("Not signed in.")
                }
            }
            .padding(20)
        }
        .onAppear {
            if let user = auth.currentUser { shortName = user.shortName }
        }
    }

    private func save(user: User) {
        let trimmed = shortName.trimmingCharacters(in: .whitespaces)
        guard trimmed != user.shortName else { return }
        saving = true
        Task {
            defer { saving = false }
            do {
                _ = try await auth.updateMe(shortName: trimmed, name: nil)
                savedMessage = "Saved."
                try? await Task.sleep(nanoseconds: 1_500_000_000)
                savedMessage = nil
            } catch {
                savedMessage = error.localizedDescription
            }
        }
    }
}
