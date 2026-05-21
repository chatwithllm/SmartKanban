import Foundation

@MainActor
final class InsightStore: ObservableObject {
    static let shared = InsightStore()

    // [cardId: insights newest-first]
    @Published private(set) var byCard: [UUID: [Insight]] = [:]
    private var wsSub: UUID?

    init() {
        wsSub = WebSocketClient.shared.subscribe { [weak self] ev in self?.apply(ev) }
    }

    func latest(cardId: UUID) -> Insight? {
        byCard[cardId]?.first
    }

    func refresh(cardId: UUID) async {
        do {
            let response = try await APIClient.shared.send(.listCardInsights(id: cardId), as: InsightListResponse.self)
            byCard[cardId] = response.insights
        } catch {
            // soft
        }
    }

    func brainstorm(cardId: UUID) async {
        do {
            _ = try await APIClient.shared.send(.brainstormCard(id: cardId), as: InsightQueuedResponse.self)
        } catch KanbanError.statusCode(let code, _) where code == 429 {
            ToastStore.shared.error("Too many brainstorm requests, try again later")
        } catch KanbanError.statusCode(let code, _) where code == 503 {
            ToastStore.shared.error("AI is disabled on this server")
        } catch {
            ToastStore.shared.error("Brainstorm failed: \(error.localizedDescription)")
        }
    }

    private func apply(_ event: BroadcastEvent) {
        switch event {
        case .insightQueued(let insight, let cardId, _),
             .insightUpdated(let insight, let cardId, _),
             .insightFailed(let insight, let cardId, _):
            var list = byCard[cardId] ?? []
            if let idx = list.firstIndex(where: { $0.id == insight.id }) {
                list[idx] = insight
            } else {
                list.insert(insight, at: 0)
            }
            byCard[cardId] = list
        default:
            break
        }
    }
}
