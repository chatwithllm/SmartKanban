import SwiftUI
import AppKit

struct AdminApprovalsView: View {
    @State private var rows: [PendingUserRow] = []
    @State private var loading = true

    var body: some View {
        Group {
            if loading {
                ProgressView()
            } else if rows.isEmpty {
                Text("No pending sign-ins.")
                    .foregroundStyle(Tokens.ink2)
                    .padding()
            } else {
                list
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .task { await load() }
    }

    private var list: some View {
        List(rows) { r in
            HStack(spacing: 12) {
                AsyncImage(url: r.pictureUrl.flatMap(URL.init(string:))) { img in
                    img.resizable()
                } placeholder: {
                    Color.gray.opacity(0.2)
                }
                .frame(width: 36, height: 36)
                .clipShape(Circle())

                VStack(alignment: .leading, spacing: 2) {
                    Text(r.name)
                    HStack(spacing: 6) {
                        Text(r.email)
                            .font(.system(size: 11))
                            .foregroundStyle(Tokens.ink2)
                        if !r.emailVerified {
                            Text("unverified")
                                .font(.system(size: 10))
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Tokens.danger.opacity(0.18))
                                .foregroundStyle(Tokens.danger)
                                .clipShape(Capsule())
                        }
                    }
                }

                Spacer()

                Button("Approve") { Task { await approve(r) } }
                Button("Reject") { Task { await reject(r) } }
                    .tint(.red)
            }
            .padding(.vertical, 4)
        }
    }

    private func load() async {
        loading = true
        rows = (try? await APIClient.shared.send(.adminListPending, as: [PendingUserRow].self)) ?? []
        loading = false
    }

    private func approve(_ r: PendingUserRow) async {
        let alert = NSAlert()
        alert.messageText = "Short name for \(r.name) (1-16 chars):"
        let input = NSTextField(string: String(r.name.prefix(16)))
        input.frame = NSRect(x: 0, y: 0, width: 240, height: 24)
        alert.accessoryView = input
        alert.addButton(withTitle: "Approve")
        alert.addButton(withTitle: "Cancel")
        guard alert.runModal() == .alertFirstButtonReturn, !input.stringValue.isEmpty else { return }
        _ = try? await APIClient.shared.sendVoid(.adminApprove(pendingId: r.id, shortName: input.stringValue))
        await load()
    }

    private func reject(_ r: PendingUserRow) async {
        _ = try? await APIClient.shared.sendVoid(.adminReject(pendingId: r.id))
        await load()
    }
}
