import SwiftUI

struct WeeklyReviewSheet: View {
    @State private var data: ReviewData?
    @State private var loading = false
    var onClose: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            ModalHeaderStrip(title: "Weekly Review") {
                Button(action: onClose) {
                    Image(systemName: "xmark")
                        .foregroundStyle(.white)
                        .padding(6).background(.white.opacity(0.18)).clipShape(Circle())
                }.buttonStyle(.plain)
            }
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if loading { ProgressView().padding(40) }
                    if let data {
                        if let summary = data.summary, !summary.isEmpty {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Summary").font(.mono(10, weight: .semibold)).tracking(1.2).foregroundStyle(Tokens.ink3)
                                Text(summary).font(.sans(13)).foregroundStyle(Tokens.ink)
                            }
                        }
                        section(title: "✅ Done this week", rows: data.done, accent: Tokens.greenAccent)
                        section(title: "🪨 Stale (no update >7d)", rows: data.stale, accent: Tokens.gold)
                        section(title: "⚠️ Stuck in flight (>3d)", rows: data.stuck, accent: Tokens.danger)
                    }
                }
                .padding(20)
            }
        }
        .frame(width: 600, height: 600)
        .background(Tokens.canvas)
        .task { await refresh() }
    }

    @ViewBuilder private func section(title: String, rows: [ReviewRow], accent: Color) -> some View {
        if !rows.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                Text(title).font(.sans(13, weight: .semibold)).foregroundStyle(accent)
                ForEach(rows) { r in
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(r.title).font(.sans(12)).foregroundStyle(Tokens.ink)
                        Spacer()
                        Text(rel(r.updatedAt)).font(.mono(10)).foregroundStyle(Tokens.ink3)
                    }
                    .padding(.vertical, 4)
                    Divider()
                }
            }
        }
    }

    private static let rel: RelativeDateTimeFormatter = {
        let f = RelativeDateTimeFormatter(); f.unitsStyle = .short; return f
    }()
    private func rel(_ d: Date) -> String { Self.rel.localizedString(for: d, relativeTo: ServerTime.now()) }

    private func refresh() async {
        loading = true; defer { loading = false }
        do { data = try await APIClient.shared.send(.review, as: ReviewData.self) }
        catch { ToastStore.shared.error("Couldn't load review: \(error.localizedDescription)") }
    }
}
