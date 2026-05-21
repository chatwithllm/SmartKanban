import SwiftUI

struct AiInsightsPanelView: View {
    let cardId: UUID
    @StateObject private var store = InsightStore.shared
    @State private var busy = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("✨ AI Insights")
                    .font(.sans(13, weight: .semibold))
                    .foregroundStyle(Tokens.ink)
                Spacer()
                if let latest = store.latest(cardId: cardId), latest.status != .pending {
                    Button {
                        runBrainstorm()
                    } label: {
                        Label("Re-run", systemImage: "arrow.clockwise")
                            .labelStyle(.titleAndIcon)
                            .font(.sans(11, weight: .semibold))
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(Tokens.violet)
                }
            }
            Group {
                if let latest = store.latest(cardId: cardId) {
                    contentFor(latest)
                } else {
                    emptyState
                }
            }
        }
        .padding(12)
        .background(Tokens.goldLightest)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Tokens.gold.opacity(0.4), lineWidth: 1))
    }

    @ViewBuilder private func contentFor(_ latest: Insight) -> some View {
        switch latest.status {
        case .pending:
            Text("Researching…")
                .font(.sans(12))
                .foregroundStyle(Tokens.ink3)
                .opacity(0.8)
        case .failed:
            VStack(alignment: .leading, spacing: 6) {
                Label("Failed — \(latest.error ?? "unknown")",
                      systemImage: "exclamationmark.triangle.fill")
                    .font(.sans(12))
                    .foregroundStyle(Tokens.danger)
                Button {
                    runBrainstorm()
                } label: {
                    Text("Retry").font(.sans(11, weight: .semibold))
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.small)
            }
        case .ok:
            VStack(alignment: .leading, spacing: 8) {
                if let summary = latest.summary, !summary.isEmpty {
                    Text(summary).font(.sans(13)).foregroundStyle(Tokens.ink)
                }
                if latest.degraded {
                    Text("(web search unavailable — local context only)")
                        .font(.sans(10)).foregroundStyle(Tokens.ink3)
                }
                if let related = latest.body?.relatedItems, !related.isEmpty {
                    sectionTitle("Related items you have")
                    ForEach(related, id: \.id) { item in
                        Text("• \(item.title)").font(.sans(12))
                    }
                }
                if let web = latest.body?.webFindings, !web.isEmpty {
                    sectionTitle("Web findings")
                    ForEach(web, id: \.url) { f in
                        HStack(spacing: 6) {
                            Link(f.title, destination: URL(string: f.url) ?? Constants.serverURL)
                                .font(.sans(12, weight: .semibold))
                            Button {
                                NSPasteboard.general.clearContents()
                                NSPasteboard.general.setString(f.url, forType: .string)
                            } label: {
                                Image(systemName: "doc.on.doc").font(.system(size: 10))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                if let steps = latest.body?.nextSteps, !steps.isEmpty {
                    sectionTitle("Next steps")
                    ForEach(Array(steps.prefix(4).enumerated()), id: \.offset) { idx, step in
                        Text("\(idx + 1). \(step)").font(.sans(12))
                    }
                }
            }
        }
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Get a quick brainstorm — related cards, web context, and next steps.")
                .font(.sans(12)).foregroundStyle(Tokens.ink2)
            Button {
                runBrainstorm()
            } label: {
                Label(busy ? "Brainstorming…" : "🤔 Brainstorm this card",
                      systemImage: busy ? "hourglass" : "sparkles")
                    .labelStyle(.titleAndIcon)
                    .font(.sans(12, weight: .semibold))
                    .padding(.horizontal, 10).padding(.vertical, 6)
                    .background(Tokens.violet)
                    .foregroundStyle(.white)
                    .clipShape(Capsule())
            }
            .buttonStyle(.plain)
            .disabled(busy)
            .keyboardShortcut("b", modifiers: [.command])
        }
    }

    private func sectionTitle(_ s: String) -> some View {
        Text(s.uppercased())
            .font(.mono(9, weight: .semibold))
            .tracking(1)
            .foregroundStyle(Tokens.ink3)
            .padding(.top, 4)
    }

    private func runBrainstorm() {
        busy = true
        Task {
            await store.brainstorm(cardId: cardId)
            busy = false
        }
    }
}
