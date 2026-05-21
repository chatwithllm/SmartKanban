import Foundation
import Combine
import os

@MainActor
final class CardStore: ObservableObject {
    static let shared = CardStore()
    private let log = Logger(subsystem: Constants.bundleID, category: "store")

    @Published private(set) var cards: [Card] = []
    @Published private(set) var loading = false
    @Published private(set) var lastError: String?

    private var wsSubscription: UUID?

    init() {
        wsSubscription = WebSocketClient.shared.subscribe { [weak self] event in
            self?.apply(event)
        }
    }

    deinit {
        if let id = wsSubscription {
            Task { @MainActor in WebSocketClient.shared.unsubscribe(id) }
        }
    }

    func refresh(scope: Scope) async {
        loading = true
        defer { loading = false }
        do {
            let result = try await APIClient.shared.send(.listCards(scope: scope, project: nil), as: [Card].self)
            cards = result.sorted { lhs, rhs in
                if lhs.status != rhs.status { return statusOrder(lhs.status) < statusOrder(rhs.status) }
                return lhs.position < rhs.position
            }
            lastError = nil
            log.info("loaded \(self.cards.count) cards scope=\(scope.rawValue, privacy: .public)")
        } catch {
            log.error("listCards: \(error.localizedDescription, privacy: .public)")
            lastError = error.localizedDescription
            ToastStore.shared.error("Couldn't load cards: \(error.localizedDescription)")
        }
    }

    func cards(in status: CardStatus) -> [Card] {
        cards.filter { $0.status == status && !$0.archived }
            .sorted { $0.position < $1.position }
    }

    func card(id: UUID) -> Card? {
        cards.first(where: { $0.id == id })
    }

    func upsert(_ card: Card) {
        if let idx = cards.firstIndex(where: { $0.id == card.id }) {
            cards[idx] = card
        } else if visibleHere(card) {
            cards.append(card)
        }
        cards.sort { lhs, rhs in
            if lhs.status != rhs.status { return statusOrder(lhs.status) < statusOrder(rhs.status) }
            return lhs.position < rhs.position
        }
    }

    func remove(id: UUID) {
        cards.removeAll(where: { $0.id == id })
    }

    private func visibleHere(_ card: Card) -> Bool {
        guard !card.archived else { return false }
        // Filter follows the active scope's visibility predicate. For inbox-only
        // scope we'd want unassigned; for now accept anything the WS broadcasts —
        // the server-side filter already narrowed it to this user.
        return true
    }

    private func apply(_ event: BroadcastEvent) {
        switch event {
        case .cardCreated(let card), .cardUpdated(let card):
            upsert(card)
        case .cardDeleted(let id):
            remove(id: id)
        case .cardMessage(_, _, let card), .cardAiResponse(_, _, let card):
            upsert(card)
        default:
            break
        }
    }

    private func statusOrder(_ s: CardStatus) -> Int {
        switch s {
        case .backlog: return 0
        case .today: return 1
        case .in_progress: return 2
        case .done: return 3
        }
    }

    // MARK: - Mutations

    func patch(_ id: UUID, _ patch: CardPatch, optimistic: Bool = true) async {
        if optimistic, let idx = cards.firstIndex(where: { $0.id == id }) {
            var local = cards[idx]
            if let v = patch.title { local.title = v }
            if let v = patch.description { local.description = v }
            if let v = patch.status { local.status = v }
            if let v = patch.tags { local.tags = v }
            if let v = patch.dueDate { local.dueDate = v.isEmpty ? nil : v }
            if let v = patch.assignees { local.assignees = v }
            if let v = patch.shares { local.shares = v }
            if let v = patch.position { local.position = v }
            if let v = patch.needsReview { local.needsReview = v }
            if let v = patch.project { local.project = v }
            cards[idx] = local
        }
        do {
            let updated = try await APIClient.shared.send(.updateCard(id: id, patch), as: Card.self)
            upsert(updated)
        } catch {
            log.error("patch failed: \(error.localizedDescription, privacy: .public)")
            ToastStore.shared.error("Couldn't save card: \(error.localizedDescription)")
            // Reconcile from server.
            await refresh(scope: BoardScopeStore.shared.scope)
        }
    }

    func create(_ create: CardCreate) async -> Card? {
        do {
            let card = try await APIClient.shared.send(.createCard(create), as: Card.self)
            upsert(card)
            return card
        } catch {
            ToastStore.shared.error("Couldn't create card: \(error.localizedDescription)")
            return nil
        }
    }

    func createFromImage(fileURL: URL, status: CardStatus = .today) async -> Card? {
        guard let mime = Uploader.mimeType(for: fileURL) else {
            ToastStore.shared.error("Only images may be attached.")
            return nil
        }
        do {
            let data = try Data(contentsOf: fileURL)
            let raw = try await Uploader.uploadImage(
                endpointPath: "/api/cards/from-image",
                imageData: data,
                originalFilename: fileURL.lastPathComponent,
                mimeType: mime,
                extraFields: ["status": status.rawValue]
            )
            let card = try JSONDecoder.kanban.decode(Card.self, from: raw)
            upsert(card)
            ToastStore.shared.success("Card created from image")
            return card
        } catch {
            ToastStore.shared.error("Couldn't create card from image: \(error.localizedDescription)")
            return nil
        }
    }

    func attachImage(cardId: UUID, fileURL: URL) async {
        guard let mime = Uploader.mimeType(for: fileURL) else {
            ToastStore.shared.error("Only images may be attached.")
            return
        }
        do {
            let data = try Data(contentsOf: fileURL)
            let raw = try await Uploader.uploadImage(
                endpointPath: "/api/cards/\(cardId.lowered)/attachments",
                imageData: data,
                originalFilename: fileURL.lastPathComponent,
                mimeType: mime
            )
            let card = try JSONDecoder.kanban.decode(Card.self, from: raw)
            upsert(card)
            ToastStore.shared.success("Attachment added")
        } catch {
            ToastStore.shared.error("Couldn't attach: \(error.localizedDescription)")
        }
    }

    func attachImageData(cardId: UUID, data: Data, mime: String, filename: String = "pasted.png") async {
        do {
            let raw = try await Uploader.uploadImage(
                endpointPath: "/api/cards/\(cardId.lowered)/attachments",
                imageData: data,
                originalFilename: filename,
                mimeType: mime
            )
            let card = try JSONDecoder.kanban.decode(Card.self, from: raw)
            upsert(card)
            ToastStore.shared.success("Image pasted")
        } catch {
            ToastStore.shared.error("Couldn't attach: \(error.localizedDescription)")
        }
    }

    func createFromImageData(data: Data, mime: String, status: CardStatus = .today, filename: String = "pasted.png") async -> Card? {
        do {
            let raw = try await Uploader.uploadImage(
                endpointPath: "/api/cards/from-image",
                imageData: data,
                originalFilename: filename,
                mimeType: mime,
                extraFields: ["status": status.rawValue]
            )
            let card = try JSONDecoder.kanban.decode(Card.self, from: raw)
            upsert(card)
            ToastStore.shared.success("Card created from image")
            return card
        } catch {
            ToastStore.shared.error("Couldn't create card from image: \(error.localizedDescription)")
            return nil
        }
    }

    func archive(id: UUID) async {
        let previous = cards.first(where: { $0.id == id })
        remove(id: id)
        do {
            try await APIClient.shared.sendVoid(.archiveCard(id: id))
            ToastStore.shared.success("Archived “\(previous?.title ?? "card")”")
        } catch {
            if let p = previous { upsert(p) }
            ToastStore.shared.error("Couldn't archive: \(error.localizedDescription)")
        }
    }
}
