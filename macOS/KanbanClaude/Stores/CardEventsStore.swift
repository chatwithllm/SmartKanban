import Foundation
import Combine
import os

@MainActor
final class CardEventsStore: ObservableObject {
    private let log = Logger(subsystem: Constants.bundleID, category: "events")
    let cardId: UUID

    @Published private(set) var events: [CardEvent] = []
    @Published private(set) var loading = false
    @Published var error: String?
    private var wsSub: UUID?
    private var seenIds: Set<String> = []

    init(cardId: UUID) {
        self.cardId = cardId
        wsSub = WebSocketClient.shared.subscribe { [weak self] ev in self?.apply(ev) }
    }

    deinit {
        if let id = wsSub {
            Task { @MainActor in WebSocketClient.shared.unsubscribe(id) }
        }
    }

    func load() async {
        loading = true
        defer { loading = false }
        do {
            let list = try await APIClient.shared.send(.cardEvents(id: cardId), as: [CardEvent].self)
            events = list
            seenIds = Set(list.map(\.id))
            error = nil
            if let last = list.last, let parsed = Int64(last.id) {
                try? await APIClient.shared.sendVoid(.markRead(cardId: cardId, lastReadId: parsed))
                UnreadStore.shared.clear(cardId: cardId)
            }
        } catch {
            log.error("load events: \(error.localizedDescription, privacy: .public)")
            self.error = error.localizedDescription
        }
    }

    func append(_ event: CardEvent) {
        if seenIds.contains(event.id) { return }
        seenIds.insert(event.id)
        events.append(event)
    }

    func markRead() async {
        guard let last = events.last, let parsed = Int64(last.id) else { return }
        try? await APIClient.shared.sendVoid(.markRead(cardId: cardId, lastReadId: parsed))
        UnreadStore.shared.clear(cardId: cardId)
    }

    private func apply(_ ev: BroadcastEvent) {
        switch ev {
        case .cardMessage(let event, let cid, _), .cardAiResponse(let event, let cid, _):
            if cid == cardId { append(event) }
        default:
            break
        }
    }
}
