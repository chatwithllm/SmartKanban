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
                        statGrid(data)
                        if let summary = data.summary, !summary.isEmpty {
                            Text(summary).font(.sans(13)).foregroundStyle(Tokens.ink)
                        }
                        section(
                            title: "Shipped (\(data.done.count))",
                            rows: data.done,
                            empty: "Nothing closed this week.",
                            accent: Tokens.greenAccent
                        )
                        section(
                            title: "Stale (\(data.stale.count))",
                            rows: data.stale,
                            empty: "No stale cards.",
                            accent: Tokens.gold
                        )
                        section(
                            title: "Stuck in progress (\(data.stuck.count))",
                            rows: data.stuck,
                            empty: "Nothing stuck.",
                            accent: Tokens.danger
                        )
                    }
                }
                .padding(20)
            }
            footer
        }
        .frame(width: 600, height: 640)
        .background(Tokens.canvas)
        .onAppear {
            Task.detached(priority: .userInitiated) {
                await refresh()
            }
        }
    }

    private func statGrid(_ data: ReviewData) -> some View {
        HStack(spacing: 10) {
            statCard(label: "Shipped", count: data.done.count, accent: Tokens.greenAccent)
            statCard(label: "Stale", count: data.stale.count, accent: Tokens.gold)
            statCard(label: "Stuck", count: data.stuck.count, accent: Tokens.danger)
        }
    }

    private func statCard(label: String, count: Int, accent: Color) -> some View {
        HStack(spacing: 8) {
            Rectangle().fill(accent).frame(width: 3)
            VStack(alignment: .leading, spacing: 0) {
                Text("\(count)").font(.serif(28, weight: .semibold)).foregroundStyle(Tokens.ink)
                Text(label).font(.mono(10, weight: .semibold)).tracking(1.2).foregroundStyle(Tokens.ink3)
            }
            .padding(.vertical, 8).padding(.trailing, 12)
            Spacer()
        }
        .frame(maxWidth: .infinity)
        .background(Tokens.surface)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Tokens.hairline, lineWidth: 1))
    }

    @ViewBuilder private func section(title: String, rows: [ReviewRow], empty: String, accent: Color) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title.uppercased())
                .font(.mono(10, weight: .semibold))
                .tracking(1.2)
                .foregroundStyle(Tokens.ink3)
            if rows.isEmpty {
                Text(empty).font(.sans(12)).foregroundStyle(Tokens.ink3)
                    .padding(.vertical, 4)
            } else {
                ForEach(rows) { r in
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text("·").font(.sans(12)).foregroundStyle(Tokens.ink3)
                        Text(r.title).font(.sans(12)).foregroundStyle(Tokens.ink)
                        Spacer()
                        if !r.tags.isEmpty {
                            Text("#" + r.tags.joined(separator: " #"))
                                .font(.mono(10))
                                .foregroundStyle(Tokens.ink3)
                                .lineLimit(1)
                        }
                    }
                    .padding(.vertical, 4)
                    Divider()
                }
            }
        }
    }

    private var footer: some View {
        HStack {
            Button(loading ? "Generating…" : "Generate again") {
                Task { await refresh() }
            }
            .disabled(loading)
            Spacer()
            PillButton(title: "Got it", icon: "checkmark") { onClose() }
        }
        .padding(.horizontal, 20).padding(.vertical, 12)
        .background(Tokens.surface)
        .overlay(Rectangle().fill(Tokens.hairline).frame(height: 1), alignment: .top)
    }

    private static let relFmt: RelativeDateTimeFormatter = {
        let f = RelativeDateTimeFormatter(); f.unitsStyle = .short; return f
    }()
    private func rel(_ d: Date) -> String { Self.relFmt.localizedString(for: d, relativeTo: ServerTime.now()) }

    private func refresh() async {
        loading = true; defer { loading = false }
        do { data = try await APIClient.shared.send(.review, as: ReviewData.self) }
        catch { ToastStore.shared.error("Couldn't load review: \(error.localizedDescription)") }
    }
}
