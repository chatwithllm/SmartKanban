import Foundation

enum KnowledgeVisibility: String, Codable, CaseIterable, Sendable {
    case `private`, inbox, shared
}

enum KnowledgeSource: String, Codable, Sendable {
    case manual, telegram, shareTarget = "share_target", fromCard = "from_card"
}

enum KnowledgeFetchStatus: String, Codable, Sendable {
    case pending, ok, failed, skipped
}

struct KnowledgeItem: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    let ownerId: UUID
    var title: String
    var titleAuto: Bool
    var url: String?
    var body: String
    var tags: [String]
    var visibility: KnowledgeVisibility
    var source: KnowledgeSource
    var fetchStatus: KnowledgeFetchStatus?
    var fetchError: String?
    var fetchedAt: Date?
    var archived: Bool
    let createdAt: Date
    var updatedAt: Date
    var shares: [UUID]?
    var linkedCardIds: [UUID]?

    enum CodingKeys: String, CodingKey {
        case id
        case ownerId = "owner_id"
        case title
        case titleAuto = "title_auto"
        case url, body, tags, visibility, source
        case fetchStatus = "fetch_status"
        case fetchError = "fetch_error"
        case fetchedAt = "fetched_at"
        case archived
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case shares
        case linkedCardIds = "linked_card_ids"
    }
}

struct KnowledgeInput: Codable, Sendable {
    var title: String?
    var titleAuto: Bool?
    var url: String?
    var body: String?
    var tags: [String]?
    var visibility: KnowledgeVisibility?
    var source: KnowledgeSource?
    var autoFetch: Bool?

    enum CodingKeys: String, CodingKey {
        case title
        case titleAuto = "title_auto"
        case url, body, tags, visibility, source
        case autoFetch = "auto_fetch"
    }
}

struct KnowledgePatch: Codable, Sendable {
    var title: String?
    var body: String?
    var tags: [String]?
    var visibility: KnowledgeVisibility?
    var shares: [UUID]?
}

// Envelope for GET /api/knowledge (Rule 2 — server wraps the array).
struct KnowledgeListResponse: Codable, Sendable {
    let items: [KnowledgeItem]
    let nextCursor: String?

    enum CodingKeys: String, CodingKey {
        case items
        case nextCursor = "next_cursor"
    }
}
