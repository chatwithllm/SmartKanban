import SwiftUI

struct CardTimelineView: View {
    let cardId: UUID
    @StateObject private var store: CardEventsStore
    @State private var expanded = true

    init(cardId: UUID) {
        self.cardId = cardId
        _store = StateObject(wrappedValue: CardEventsStore(cardId: cardId))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            DisclosureGroup(isExpanded: $expanded) {
                content
            } label: {
                HStack {
                    Text("Chat & Activity")
                        .font(.mono(10, weight: .semibold))
                        .tracking(1.2)
                        .foregroundStyle(Tokens.ink3)
                    Spacer()
                    Text("\(store.events.count)")
                        .font(.mono(10, weight: .medium))
                        .foregroundStyle(Tokens.ink3)
                }
            }
            ChatInputView(cardId: cardId) { newEvent in
                store.append(newEvent)
            }
        }
        .onAppear { Task { await store.load() } }
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: 6) {
            if store.loading {
                ProgressView().controlSize(.small)
            } else if let err = store.error {
                Text(err).foregroundStyle(Tokens.danger).font(.sans(11))
            } else if store.events.isEmpty {
                Text("No activity yet. Say hello!")
                    .font(.sans(11)).foregroundStyle(Tokens.ink3)
            } else {
                ScrollViewReader { sv in
                    ScrollView {
                        VStack(alignment: .leading, spacing: 8) {
                            ForEach(store.events) { ev in
                                TimelineRow(event: ev).id(ev.id)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                    .frame(maxHeight: 280)
                    .onChange(of: store.events.count) { _ in
                        if let last = store.events.last { sv.scrollTo(last.id, anchor: .bottom) }
                    }
                }
            }
        }
    }
}

private struct TimelineRow: View {
    let event: CardEvent

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Circle().fill(dotColor).frame(width: 8, height: 8).padding(.top, 5)
            VStack(alignment: .leading, spacing: 2) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(label)
                        .font(.sans(11, weight: .semibold))
                        .foregroundStyle(labelColor)
                    Text(relTime(event.createdAt))
                        .font(.mono(10))
                        .foregroundStyle(Tokens.ink3)
                }
                if let content = event.content, !content.isEmpty {
                    Text(content)
                        .font(.sans(12))
                        .foregroundStyle(Tokens.ink)
                        .fixedSize(horizontal: false, vertical: true)
                        .multilineTextAlignment(.leading)
                }
                if event.entryType == .ai, let suggestions = event.aiSuggestions, !suggestions.isEmpty {
                    suggestionPills(suggestions)
                }
            }
        }
    }

    private var label: String {
        switch event.entryType {
        case .system: return "\(event.actorName ?? "Someone") \(event.action ?? "updated")"
        case .message: return event.actorName ?? "Anonymous"
        case .ai: return "AI"
        case .share: return "Shared by \(event.actorName ?? "")"
        }
    }

    private var dotColor: Color {
        switch event.entryType {
        case .system: return Tokens.greenAccent
        case .message: return Tokens.ceramic
        case .ai: return Tokens.violet
        case .share: return Tokens.greenUplift
        }
    }
    private var labelColor: Color {
        switch event.entryType {
        case .ai: return Tokens.violet
        default: return Tokens.ink2
        }
    }

    private func suggestionPills(_ suggestions: [AiSuggestion]) -> some View {
        FlowLayout(spacing: 4) {
            ForEach(Array(suggestions.enumerated()), id: \.offset) { _, s in
                Text(s.label)
                    .font(.mono(10, weight: .semibold))
                    .foregroundStyle(Tokens.violet)
                    .padding(.horizontal, 6).padding(.vertical, 2)
                    .background(Tokens.violetTint)
                    .clipShape(Capsule())
            }
        }
    }

    private static let rel: RelativeDateTimeFormatter = {
        let f = RelativeDateTimeFormatter()
        f.unitsStyle = .short
        return f
    }()
    private func relTime(_ d: Date) -> String { Self.rel.localizedString(for: d, relativeTo: ServerTime.now()) }
}
