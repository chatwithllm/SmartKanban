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
                        relatedItemRow(item)
                    }
                }
                if let web = latest.body?.webFindings, !web.isEmpty {
                    sectionTitle("Web findings")
                    ForEach(web, id: \.url) { f in
                        webFindingRow(f)
                    }
                }
                if let steps = latest.body?.nextSteps, !steps.isEmpty {
                    sectionTitle("Next steps")
                    ForEach(Array(steps.enumerated()), id: \.offset) { idx, step in
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
            if let err = store.lastError, !err.isEmpty {
                Text(err)
                    .font(.sans(11))
                    .foregroundStyle(Tokens.danger)
                    .padding(.horizontal, 8).padding(.vertical, 4)
                    .background(Tokens.danger.opacity(0.12))
                    .clipShape(Capsule())
            }
        }
    }

    private func relatedItemRow(_ item: Insight.RelatedItem) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 6) {
                Text("[\(item.kind)]")
                    .font(.mono(10, weight: .semibold))
                    .foregroundStyle(Tokens.ink3)
                Text(item.title).font(.sans(12, weight: .semibold)).foregroundStyle(Tokens.ink)
                Spacer()
                if item.kind == "knowledge", let urlStr = item.url, let url = URL(string: urlStr) {
                    LinkActions(url: url, urlString: urlStr)
                } else if item.kind == "knowledge" {
                    Button {
                        WindowCoordinator.shared.openKnowledgeDetail(id: item.id)
                    } label: {
                        Text("Open").font(.sans(11, weight: .semibold)).foregroundStyle(Tokens.violet)
                    }
                    .buttonStyle(.plain)
                } else if item.kind == "card" {
                    Button {
                        WindowCoordinator.shared.openEditCard(id: item.id)
                    } label: {
                        Text("Open").font(.sans(11, weight: .semibold)).foregroundStyle(Tokens.violet)
                    }
                    .buttonStyle(.plain)
                }
            }
            if let why = item.why, !why.isEmpty {
                Text(why).font(.sans(11)).foregroundStyle(Tokens.ink3)
            }
        }
        .padding(.vertical, 2)
    }

    private func webFindingRow(_ f: Insight.WebFinding) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 6) {
                Link(f.title, destination: URL(string: f.url) ?? Constants.serverURL)
                    .font(.sans(12, weight: .semibold))
                LinkActions(url: URL(string: f.url) ?? Constants.serverURL, urlString: f.url)
            }
            if let why = f.why, !why.isEmpty {
                Text(why).font(.sans(11)).foregroundStyle(Tokens.ink3)
            }
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

struct LinkActions: View {
    let url: URL
    let urlString: String
    @State private var copied = false
    var body: some View {
        HStack(spacing: 4) {
            Link(destination: url) {
                Image(systemName: "arrow.up.right.square").font(.system(size: 11))
            }
            Button {
                NSPasteboard.general.clearContents()
                NSPasteboard.general.setString(urlString, forType: .string)
                copied = true
                Task { try? await Task.sleep(nanoseconds: 1_200_000_000); copied = false }
            } label: {
                if copied {
                    Text("✓ Copied").font(.mono(10, weight: .semibold)).foregroundStyle(Tokens.greenAccent)
                } else {
                    HStack(spacing: 3) {
                        Image(systemName: "doc.on.doc").font(.system(size: 10))
                        Text("Copy").font(.mono(10))
                    }
                }
            }
            .buttonStyle(.plain)
            .foregroundStyle(Tokens.violet)
        }
    }
}
