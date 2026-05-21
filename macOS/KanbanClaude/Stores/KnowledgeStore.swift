import Foundation
import Combine
import os

@MainActor
final class KnowledgeStore: ObservableObject {
    static let shared = KnowledgeStore()
    private let log = Logger(subsystem: Constants.bundleID, category: "knowledge")

    @Published private(set) var items: [KnowledgeItem] = []
    @Published var scope: KScope = .mine
    @Published var query: String = ""
    @Published var tag: String?
    @Published private(set) var loading = false
    private var wsSub: UUID?

    init() {
        wsSub = WebSocketClient.shared.subscribe { [weak self] ev in self?.apply(ev) }
    }

    func refresh() async {
        loading = true
        defer { loading = false }
        do {
            let r = try await APIClient.shared.send(
                .listKnowledge(scope: scope, q: query.isEmpty ? nil : query, tag: tag, limit: 100, cursor: nil),
                as: KnowledgeListResponse.self
            )
            items = r.items
        } catch {
            log.error("knowledge load: \(error.localizedDescription, privacy: .public)")
        }
    }

    func create(_ input: KnowledgeInput) async -> KnowledgeItem? {
        do {
            let item = try await APIClient.shared.send(.createKnowledge(input), as: KnowledgeItem.self)
            items.insert(item, at: 0)
            return item
        } catch {
            ToastStore.shared.error("Couldn't save: \(error.localizedDescription)")
            return nil
        }
    }

    func patch(_ id: UUID, _ patch: KnowledgePatch) async {
        do {
            let updated = try await APIClient.shared.send(.updateKnowledge(id: id, patch), as: KnowledgeItem.self)
            if let idx = items.firstIndex(where: { $0.id == id }) { items[idx] = updated }
        } catch {
            ToastStore.shared.error("Couldn't update: \(error.localizedDescription)")
        }
    }

    func archive(id: UUID) async {
        items.removeAll(where: { $0.id == id })
        do {
            try await APIClient.shared.sendVoid(.archiveKnowledge(id: id))
        } catch {
            ToastStore.shared.error("Couldn't archive: \(error.localizedDescription)")
            await refresh()
        }
    }

    func refetch(id: UUID) async {
        do {
            try await APIClient.shared.sendVoid(.refetchKnowledge(id: id))
        } catch {
            ToastStore.shared.error("Couldn't refetch: \(error.localizedDescription)")
        }
    }

    private func apply(_ ev: BroadcastEvent) {
        switch ev {
        case .knowledgeCreated(let k):
            if !items.contains(where: { $0.id == k.id }) { items.insert(k, at: 0) }
        case .knowledgeUpdated(let k):
            if let idx = items.firstIndex(where: { $0.id == k.id }) { items[idx] = k }
        case .knowledgeDeleted(let id, _, _, _):
            items.removeAll(where: { $0.id == id })
        default:
            break
        }
    }
}
