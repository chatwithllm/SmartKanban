import SwiftUI

struct CardTimelineView: View {
    let cardId: UUID
    @StateObject private var store: CardEventsStore
    @State private var expanded = false
    @State private var appliedKeys: Set<String> = []
    @State private var didLoad = false

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
        .onChange(of: expanded) { isOpen in
            if isOpen && !didLoad {
                didLoad = true
                Task { await store.load() }
            }
        }
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
                                TimelineRow(
                                    event: ev,
                                    cardId: cardId,
                                    appliedKeys: $appliedKeys
                                ).id(ev.id)
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
    let cardId: UUID
    @Binding var appliedKeys: Set<String>

    init(event: CardEvent, cardId: UUID = UUID(), appliedKeys: Binding<Set<String>> = .constant([])) {
        self.event = event
        self.cardId = cardId
        self._appliedKeys = appliedKeys
    }

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
            ForEach(Array(suggestions.enumerated()), id: \.offset) { idx, s in
                let key = "\(event.id)-\(idx)"
                let isApplied = appliedKeys.contains(key)
                Button {
                    guard !isApplied else { return }
                    Task { await apply(s, key: key) }
                } label: {
                    Text(isApplied ? "✓ \(s.label)" : s.label)
                        .font(.mono(10, weight: .semibold))
                        .foregroundStyle(Tokens.violet)
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(Tokens.violetTint)
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
                .disabled(isApplied)
            }
        }
    }

    private func apply(_ s: AiSuggestion, key: String) async {
        do {
            switch s.action {
            case .updateStatus:
                if let raw = s.params["status"]?.stringValue, let st = CardStatus(rawValue: raw) {
                    var patch = CardPatch(); patch.status = st
                    await CardStore.shared.patch(cardId, patch)
                    ToastStore.shared.success("Status → \(st.label)")
                }
            case .setDueDate:
                if let due = s.params["due_date"]?.stringValue {
                    var patch = CardPatch(); patch.dueDate = due
                    await CardStore.shared.patch(cardId, patch)
                    ToastStore.shared.success("Due date set")
                }
            case .assignUser:
                if let uid = s.params["user_id"]?.stringValue, let userId = UUID(uuidString: uid) {
                    if var card = CardStore.shared.card(id: cardId) {
                        if !card.assignees.contains(userId) { card.assignees.append(userId) }
                        var patch = CardPatch(); patch.assignees = card.assignees
                        await CardStore.shared.patch(cardId, patch)
                        ToastStore.shared.success("Assigned")
                    }
                }
            case .createCard:
                let title = s.params["title"]?.stringValue ?? "Untitled"
                let statusRaw = s.params["status"]?.stringValue ?? "backlog"
                let status = CardStatus(rawValue: statusRaw) ?? .backlog
                let create = CardCreate(title: title, description: nil, status: status,
                                        tags: nil, dueDate: nil, assignees: nil,
                                        source: .manual, project: nil)
                _ = await CardStore.shared.create(create)
            }
            appliedKeys.insert(key)
        }
    }

    private static let rel: RelativeDateTimeFormatter = {
        let f = RelativeDateTimeFormatter()
        f.unitsStyle = .short
        return f
    }()
    private func relTime(_ d: Date) -> String { Self.rel.localizedString(for: d, relativeTo: ServerTime.now()) }
}
