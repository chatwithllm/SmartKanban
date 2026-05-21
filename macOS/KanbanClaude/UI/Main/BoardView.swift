import SwiftUI

struct BoardView: View {
    @StateObject private var cards = CardStore.shared
    @StateObject private var scope = BoardScopeStore.shared
    @StateObject private var users = UserListStore.shared
    @StateObject private var unread = UnreadStore.shared
    var onOpenCard: (UUID) -> Void = { _ in }
    var onCreateCard: (CardStatus) -> Void = { _ in }

    var body: some View {
        HStack(spacing: 0) {
            ForEach(CardStatus.allCases, id: \.self) { status in
                BoardColumnView(
                    status: status,
                    cards: filtered(in: status),
                    onAdd: { onCreateCard(status) },
                    onOpen: { onOpenCard($0.id) }
                )
                .frame(maxWidth: .infinity)
                if status != .done { divider }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Tokens.canvas)
        .onAppear {
            // Rule 3: heavy fetch fan-out runs via Task.detached(priority:.userInitiated)
            // so SwiftUI re-renders don't cancel the network calls.
            Task.detached(priority: .userInitiated) {
                await self.refreshAll()
            }
        }
        .onChange(of: scope.scope) { _ in
            Task.detached(priority: .userInitiated) { await self.refreshAll() }
        }
    }

    private func refreshAll() async {
        await withTaskGroup(of: Void.self) { group in
            group.addTask { @MainActor in await self.cards.refresh(scope: self.scope.scope) }
            group.addTask { @MainActor in await self.users.refresh() }
            group.addTask { @MainActor in await self.unread.refresh() }
        }
    }

    private func filtered(in status: CardStatus) -> [Card] {
        let query = scope.searchQuery.lowercased()
        let raw = cards.cards(in: status)
        guard !query.isEmpty else { return raw }
        return raw.filter { card in
            card.title.lowercased().contains(query)
                || card.description.lowercased().contains(query)
                || card.tags.contains(where: { $0.lowercased().contains(query) })
        }
    }

    private var divider: some View {
        Rectangle().fill(Tokens.hairline).frame(width: 1).padding(.vertical, 8)
    }
}
