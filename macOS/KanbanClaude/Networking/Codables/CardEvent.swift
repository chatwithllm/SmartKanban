import Foundation

// Mirrors server/src/cards.ts CardEvent. The id is BIGSERIAL stringified.
// entry_type in the schema today: 'system' | 'message' | 'ai' (plan also lists
// 'share' but the server type union does not — mirror the live server).
struct CardEvent: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let actorId: UUID?
    let cardId: UUID?
    let action: String?
    let details: [String: JSONValue]
    let entryType: EntryType
    let content: String?
    let aiSuggestions: [AiSuggestion]?
    let createdAt: Date
    let actorName: String?

    enum EntryType: String, Codable, Sendable {
        case system, message, ai, share
    }

    enum CodingKeys: String, CodingKey {
        case id
        case actorId = "actor_id"
        case cardId = "card_id"
        case action, details
        case entryType = "entry_type"
        case content
        case aiSuggestions = "ai_suggestions"
        case createdAt = "created_at"
        case actorName = "actor_name"
    }
}
