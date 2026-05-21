import Foundation

enum TemplateVisibility: String, Codable, CaseIterable, Sendable {
    case `private`, shared
}

// Mirrors server/src/templates.ts Template.
struct Template: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    let ownerId: UUID
    var name: String
    var visibility: TemplateVisibility
    var title: String
    var description: String
    var tags: [String]
    var status: CardStatus
    var dueOffsetDays: Int?
    let createdAt: Date
    var updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case ownerId = "owner_id"
        case name, visibility, title, description, tags, status
        case dueOffsetDays = "due_offset_days"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

struct TemplateInput: Codable, Sendable {
    var name: String?
    var visibility: TemplateVisibility?
    var title: String?
    var description: String?
    var tags: [String]?
    var status: CardStatus?
    var dueOffsetDays: Int?

    enum CodingKeys: String, CodingKey {
        case name, visibility, title, description, tags, status
        case dueOffsetDays = "due_offset_days"
    }
}
