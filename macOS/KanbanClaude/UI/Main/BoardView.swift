import SwiftUI
import UniformTypeIdentifiers

struct BoardView: View {
    @StateObject private var cards = CardStore.shared
    @StateObject private var scope = BoardScopeStore.shared
    @StateObject private var users = UserListStore.shared
    @StateObject private var unread = UnreadStore.shared
    var onOpenCard: (UUID) -> Void = { _ in }
    var onCreateCard: (CardStatus) -> Void = { _ in }

    var body: some View {
        ZStack {
            HStack(spacing: 0) {
                ForEach(CardStatus.allCases, id: \.self) { status in
                    BoardColumnView(
                        status: status,
                        cards: filtered(in: status),
                        onAdd: { onCreateCard(status) },
                        onOpen: { onOpenCard($0.id) },
                        onMove: { id, newStatus, idx in handleMove(id: id, status: newStatus, idx: idx) }
                    )
                    .frame(maxWidth: .infinity)
                    if status != .done { divider }
                }
            }
            TrashDropZoneOverlay(drag: DragStore.shared) { id in
                Task { await CardStore.shared.archive(id: id) }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Tokens.canvas)
        .onDrop(of: [.fileURL, .image], isTargeted: nil) { providers in
            handleFinderDrop(providers)
            return true
        }
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

    private func handleFinderDrop(_ providers: [NSItemProvider]) {
        for provider in providers {
            if provider.canLoadObject(ofClass: URL.self) {
                _ = provider.loadObject(ofClass: URL.self) { url, _ in
                    guard let url else { return }
                    Task { @MainActor in
                        _ = await CardStore.shared.createFromImage(fileURL: url)
                    }
                }
            }
        }
    }

    private func handleMove(id: UUID, status newStatus: CardStatus, idx: Int) {
        // Compute target position from the destination column's CURRENT cards
        // minus the dragged card (so reordering inside same column maths correctly).
        let dest = cards.cards(in: newStatus).filter { $0.id != id }
        let pos = DragPositionCalculator.position(for: dest, at: idx)
        guard let existing = cards.card(id: id) else { return }
        if existing.status == newStatus && abs(existing.position - pos) < 1e-9 { return }
        var patch = CardPatch()
        patch.position = pos
        if existing.status != newStatus { patch.status = newStatus }
        Task { await cards.patch(id, patch) }
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
