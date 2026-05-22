import SwiftUI

struct AdminAuditView: View {
    @State private var items: [AuditEntryRow] = []
    @State private var cursor: String? = nil
    @State private var done = false
    @State private var loading = true

    var body: some View {
        Group {
            if loading && items.isEmpty {
                ProgressView()
            } else if items.isEmpty {
                Text("No admin actions yet.")
                    .foregroundStyle(Tokens.ink2)
                    .padding()
            } else {
                list
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .task { await load(nil) }
    }

    private var list: some View {
        VStack(alignment: .leading, spacing: 0) {
            List(items) { it in
                HStack(spacing: 10) {
                    Text(it.createdAt)
                        .font(.system(size: 11))
                        .foregroundStyle(Tokens.ink2)
                        .frame(width: 180, alignment: .leading)
                    Text(it.actorName ?? "(deleted)")
                        .font(.system(size: 12, weight: .semibold))
                    Text(it.action)
                        .foregroundStyle(Tokens.violet)
                        .font(.system(size: 12))
                    Text(targetLabel(it))
                        .foregroundStyle(Tokens.ink2)
                        .font(.system(size: 11))
                }
            }
            if !done {
                Button("Load more") {
                    Task { await load(cursor) }
                }
                .disabled(loading)
                .padding(8)
            }
        }
    }

    private func targetLabel(_ it: AuditEntryRow) -> String {
        if let n = it.targetUserName { return n }
        if let pid = it.targetPendingId {
            return String(pid.uuidString.prefix(8))
        }
        return ""
    }

    private func load(_ before: String?) async {
        loading = true
        do {
            let page = try await APIClient.shared.send(
                .adminAudit(limit: 50, before: before),
                as: AuditPage.self
            )
            if before == nil {
                items = page.items
            } else {
                items = items + page.items
            }
            cursor = page.nextBefore
            if page.nextBefore == nil { done = true }
        } catch {
            done = true
        }
        loading = false
    }
}
