import Foundation

@MainActor
final class UnreadStore: ObservableObject {
    static let shared = UnreadStore()
    @Published private(set) var counts: [UUID: Int] = [:]
    private var wsSub: UUID?

    init() {
        wsSub = WebSocketClient.shared.subscribe { [weak self] ev in self?.apply(ev) }
    }

    func refresh() async {
        do {
            let raw = try await APIClient.shared.send(.unreadCounts, as: [String: Int].self)
            var byUUID: [UUID: Int] = [:]
            for (k, v) in raw {
                if let id = UUID(uuidString: k) { byUUID[id] = v }
            }
            counts = byUUID
        } catch {
            // Silent — soft data.
        }
    }

    func total() -> Int { counts.values.reduce(0, +) }

    func bump(cardId: UUID) {
        counts[cardId, default: 0] += 1
    }

    func clear(cardId: UUID) {
        counts[cardId] = 0
    }

    private func apply(_ event: BroadcastEvent) {
        switch event {
        case .cardMessage(let ev, let cardId, _), .cardAiResponse(let ev, let cardId, _):
            if ev.actorId == AuthStore.shared.currentUser?.id { return }
            if let win = WindowCoordinator.shared.editWindow(id: cardId), win.isKeyWindow { return }
            bump(cardId: cardId)
        default:
            break
        }
    }
}
