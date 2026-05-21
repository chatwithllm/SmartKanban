import SwiftUI

struct KnowledgeDetailSheet: View {
    let initial: KnowledgeItem
    var onClose: () -> Void

    @State private var item: KnowledgeItem
    @State private var linkedCards: [Card] = []
    @State private var loadingCards = false
    @State private var picking = false
    @State private var pickerQuery = ""
    @State private var pickerResults: [Card] = []
    @State private var busy = false
    @State private var showEdit = false
    @StateObject private var auth = AuthStore.shared

    init(item: KnowledgeItem, onClose: @escaping () -> Void) {
        self.initial = item
        self.onClose = onClose
        _item = State(initialValue: item)
    }

    private var isOwner: Bool { auth.currentUser?.id == item.ownerId }

    var body: some View {
        VStack(spacing: 0) {
            ModalHeaderStrip(title: "Note") {
                Button(action: onClose) {
                    Image(systemName: "xmark")
                        .foregroundStyle(.white)
                        .padding(6).background(.white.opacity(0.18)).clipShape(Circle())
                }
                .buttonStyle(.plain)
            }
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    titleBlock
                    metaLine
                    if let err = item.fetchError, !err.isEmpty {
                        Text(err)
                            .font(.sans(11))
                            .foregroundStyle(Tokens.danger)
                            .padding(8)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Tokens.danger.opacity(0.12))
                            .clipShape(RoundedRectangle(cornerRadius: 6))
                    }
                    if !item.body.isEmpty {
                        Text(item.body)
                            .font(.mono(12))
                            .textSelection(.enabled)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    if !item.tags.isEmpty {
                        HStack(spacing: 4) {
                            ForEach(item.tags, id: \.self) { TagChip(tag: $0) }
                        }
                    }
                    Divider()
                    linkedCardsSection
                }
                .padding(20)
            }
            footer
        }
        .frame(width: 580, height: 640)
        .background(Tokens.canvas)
        .onAppear { Task { await loadCards() } }
        .sheet(isPresented: $showEdit) {
            KnowledgeEditSheet(initial: item) {
                showEdit = false
                Task {
                    if let updated = KnowledgeStore.shared.items.first(where: { $0.id == item.id }) {
                        item = updated
                    }
                }
            }
        }
    }

    private var titleBlock: some View {
        HStack(spacing: 8) {
            Image(systemName: visibilityIcon)
                .foregroundStyle(Tokens.ink3)
            Text(item.url != nil ? "🔗 \(item.title)" : item.title)
                .font(.serif(20, weight: .semibold))
                .foregroundStyle(Tokens.ink)
            Spacer()
        }
    }

    private var metaLine: some View {
        HStack(spacing: 8) {
            Text(item.visibility.rawValue.capitalized)
                .font(.mono(10, weight: .semibold))
                .padding(.horizontal, 6).padding(.vertical, 2)
                .background(Tokens.ceramic).clipShape(Capsule())
            if let fetched = item.fetchedAt {
                Text("fetched: \(rel(fetched))")
                    .font(.mono(10)).foregroundStyle(Tokens.ink3)
            } else {
                Text("no fetch").font(.mono(10)).foregroundStyle(Tokens.ink3)
            }
            if let url = item.url, let parsed = URL(string: url) {
                Link(parsed.host ?? url, destination: parsed)
                    .font(.mono(10)).foregroundStyle(Tokens.greenAccent)
            }
            Spacer()
        }
    }

    private var linkedCardsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Linked cards").font(.mono(10, weight: .semibold)).tracking(1.2).foregroundStyle(Tokens.ink3)
                Spacer()
                Button {
                    withAnimation { picking.toggle() }
                    if !picking { pickerQuery = ""; pickerResults = [] }
                } label: {
                    Text(picking ? "Cancel" : "+ Attach card")
                        .font(.sans(11, weight: .semibold))
                        .foregroundStyle(Tokens.violet)
                }
                .buttonStyle(.plain)
            }
            if loadingCards {
                ProgressView().controlSize(.small)
            } else if linkedCards.isEmpty {
                Text("No cards linked yet.").font(.sans(11)).foregroundStyle(Tokens.ink3)
            } else {
                ForEach(linkedCards) { card in
                    HStack {
                        Text(card.title).font(.sans(12)).foregroundStyle(Tokens.ink)
                        Spacer()
                        Button {
                            Task { await unlink(card.id) }
                        } label: { Text("remove").font(.sans(11)).foregroundStyle(Tokens.danger) }
                            .buttonStyle(.plain)
                    }
                    Divider()
                }
            }
            if picking {
                pickerView
            }
        }
    }

    private var pickerView: some View {
        VStack(alignment: .leading, spacing: 4) {
            TextField("Search cards…", text: $pickerQuery)
                .textFieldStyle(.plain)
                .padding(.vertical, 6).padding(.horizontal, 8)
                .background(Tokens.surface)
                .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Tokens.hairline, lineWidth: 1))
                .onSubmit { Task { await searchCards() } }
                .onChange(of: pickerQuery) { _ in Task { await searchCards() } }
            ForEach(pickerResults.prefix(12)) { c in
                Button {
                    Task { await link(c) }
                } label: {
                    Text(c.title)
                        .font(.sans(12))
                        .foregroundStyle(Tokens.ink)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, 4).padding(.horizontal, 6)
                        .background(Tokens.ceramic.opacity(0.4))
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                }
                .buttonStyle(.plain)
                .disabled(busy)
            }
        }
    }

    private var footer: some View {
        HStack {
            if isOwner {
                Button("Refetch") {
                    Task {
                        await KnowledgeStore.shared.refetch(id: item.id)
                        ToastStore.shared.info("Refetch queued")
                    }
                }
                .disabled(item.url == nil)
                Button("Edit") { showEdit = true }
                Button(role: .destructive) {
                    Task {
                        await KnowledgeStore.shared.archive(id: item.id)
                        onClose()
                    }
                } label: { Label("Archive", systemImage: "archivebox") }
            }
            Spacer()
            PillButton(title: "Close", icon: nil, variant: .ghost) { onClose() }
        }
        .padding(.horizontal, 20).padding(.vertical, 12)
        .background(Tokens.surface)
        .overlay(Rectangle().fill(Tokens.hairline).frame(height: 1), alignment: .top)
    }

    private var visibilityIcon: String {
        switch item.visibility {
        case .private: return "lock.fill"
        case .inbox: return "tray.fill"
        case .shared: return "person.2.fill"
        }
    }

    private static let relFmt: RelativeDateTimeFormatter = {
        let f = RelativeDateTimeFormatter(); f.unitsStyle = .short; return f
    }()
    private func rel(_ d: Date) -> String { Self.relFmt.localizedString(for: d, relativeTo: ServerTime.now()) }

    private func loadCards() async {
        loadingCards = true
        defer { loadingCards = false }
        do {
            let fresh = try await APIClient.shared.send(.getKnowledge(id: item.id), as: KnowledgeItem.self)
            item = fresh
            let ids = fresh.linkedCardIds ?? []
            var loaded: [Card] = []
            for id in ids {
                if let c = CardStore.shared.card(id: id) {
                    loaded.append(c)
                } else if let c = try? await APIClient.shared.send(.getCard(id: id), as: Card.self) {
                    loaded.append(c)
                }
            }
            linkedCards = loaded
        } catch {
            // soft
        }
    }

    private func searchCards() async {
        do {
            let all = try await APIClient.shared.send(.listCards(scope: .all, project: nil), as: [Card].self)
            let q = pickerQuery.lowercased()
            let linkedIds = Set(linkedCards.map(\.id))
            pickerResults = all.filter {
                !linkedIds.contains($0.id) &&
                (q.isEmpty || $0.title.lowercased().contains(q) || $0.description.lowercased().contains(q))
            }
        } catch {
            pickerResults = []
        }
    }

    private func link(_ card: Card) async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do {
            try await APIClient.shared.sendVoid(.linkKnowledgeToCard(knowledgeId: item.id, cardId: card.id))
            linkedCards.append(card)
            pickerResults.removeAll { $0.id == card.id }
            pickerQuery = ""
            picking = false
        } catch {
            ToastStore.shared.error("Couldn't link: \(error.localizedDescription)")
        }
    }

    private func unlink(_ cardId: UUID) async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do {
            try await APIClient.shared.sendVoid(.unlinkKnowledgeFromCard(knowledgeId: item.id, cardId: cardId))
            linkedCards.removeAll { $0.id == cardId }
        } catch {
            ToastStore.shared.error("Couldn't unlink: \(error.localizedDescription)")
        }
    }
}
