import Foundation

struct AppNotification: Codable, Identifiable, Hashable, Sendable {
    let id: Int
    let userId: UUID
    let cardId: UUID
    let eventId: Int
    let actorName: String
    let preview: String
    var read: Bool
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case cardId = "card_id"
        case eventId = "event_id"
        case actorName = "actor_name"
        case preview, read
        case createdAt = "created_at"
    }
}
