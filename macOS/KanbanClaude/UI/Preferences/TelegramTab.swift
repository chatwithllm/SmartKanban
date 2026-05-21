import SwiftUI

struct TelegramTab: View {
    @State private var identities: [TelegramIdentity] = []
    @State private var newUserIdText = ""
    @State private var newUsername = ""
    @State private var busy = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            GroupBox("Add identity") {
                TextField("Telegram user id (numeric)", text: $newUserIdText)
                    .textFieldStyle(.roundedBorder)
                TextField("Username (optional)", text: $newUsername)
                    .textFieldStyle(.roundedBorder)
                HStack {
                    Spacer()
                    Button("Link") { link() }.disabled(busy || Int64(newUserIdText) == nil)
                }
            }
            GroupBox("Linked identities") {
                if identities.isEmpty {
                    Text("None yet").foregroundStyle(Tokens.ink3)
                }
                ForEach(identities) { ident in
                    HStack {
                        VStack(alignment: .leading) {
                            Text("\(ident.telegramUserId)").font(.mono(11))
                            if let u = ident.telegramUsername {
                                Text("@\(u)").font(.sans(11)).foregroundStyle(Tokens.ink3)
                            }
                        }
                        Spacer()
                        Button(role: .destructive) {
                            Task { await unlink(id: ident.telegramUserId) }
                        } label: { Image(systemName: "trash") }
                        .buttonStyle(.borderless)
                    }
                    Divider()
                }
            }
            Spacer()
        }
        .padding(20)
        .task { await refresh() }
    }

    private func link() {
        guard let uid = Int64(newUserIdText) else { return }
        busy = true
        Task {
            defer { busy = false }
            do {
                try await APIClient.shared.sendVoid(.linkTelegram(userId: uid, username: newUsername.isEmpty ? nil : newUsername))
                newUserIdText = ""; newUsername = ""
                await refresh()
            } catch {
                ToastStore.shared.error("Couldn't link: \(error.localizedDescription)")
            }
        }
    }

    private func unlink(id: Int64) async {
        do {
            try await APIClient.shared.sendVoid(.unlinkTelegram(userId: id))
            await refresh()
        } catch {
            ToastStore.shared.error("Couldn't unlink: \(error.localizedDescription)")
        }
    }

    private func refresh() async {
        do {
            identities = try await APIClient.shared.send(.listTelegramIdentities, as: [TelegramIdentity].self)
        } catch {
            // soft
        }
    }
}
