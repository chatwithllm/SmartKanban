import Foundation

struct ReviewRow: Codable, Hashable, Identifiable, Sendable {
    let id: UUID
    let title: String
    let status: CardStatus
    let tags: [String]
    let updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case id, title, status, tags
        case updatedAt = "updated_at"
    }
}

struct ReviewData: Codable, Sendable {
    let done: [ReviewRow]
    let stale: [ReviewRow]
    let stuck: [ReviewRow]
    let summary: String?
}
