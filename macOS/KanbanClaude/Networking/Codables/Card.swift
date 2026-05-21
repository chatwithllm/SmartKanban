import Foundation

enum CardStatus: String, Codable, CaseIterable, Hashable, Sendable {
    case backlog, today, in_progress, done

    var label: String {
        switch self {
        case .backlog: return "Backlog"
        case .today: return "Today"
        case .in_progress: return "In Progress"
        case .done: return "Done"
        }
    }
}

enum CardSource: String, Codable, Hashable, Sendable {
    case manual, telegram, mirror
}

// Mirrors server/src/cards.ts Card verbatim (Rule 2). assignees/shares are UUID
// arrays of users; attachments is the embedded JSON_AGG array.
struct Card: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    var title: String
    var description: String
    var status: CardStatus
    var tags: [String]
    var dueDate: String?           // server emits "YYYY-MM-DD"; never a full datetime
    var source: CardSource
    var position: Double
    var archived: Bool
    let createdAt: Date
    var updatedAt: Date
    let createdBy: UUID?
    var aiSummarized: Bool
    var needsReview: Bool
    var project: String?
    var assignees: [UUID]
    var shares: [UUID]
    var attachments: [Attachment]

    enum CodingKeys: String, CodingKey {
        case id, title, description, status, tags
        case dueDate = "due_date"
        case source, position, archived
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case createdBy = "created_by"
        case aiSummarized = "ai_summarized"
        case needsReview = "needs_review"
        case project, assignees, shares, attachments
    }
}

// Partial-patch payload — mirrors PATCH /api/cards/:id whitelisted keys.
struct CardPatch: Codable, Sendable {
    var title: String?
    var description: String?
    var status: CardStatus?
    var tags: [String]?
    var dueDate: String?       // pass empty string or null to clear
    var assignees: [UUID]?
    var shares: [UUID]?
    var position: Double?
    var needsReview: Bool?
    var project: String?

    enum CodingKeys: String, CodingKey {
        case title, description, status, tags
        case dueDate = "due_date"
        case assignees, shares, position
        case needsReview = "needs_review"
        case project
    }
}

// POST /api/cards request body.
struct CardCreate: Codable, Sendable {
    var title: String
    var description: String?
    var status: CardStatus?
    var tags: [String]?
    var dueDate: String?
    var assignees: [UUID]?
    var source: CardSource?
    var project: String?

    enum CodingKeys: String, CodingKey {
        case title, description, status, tags
        case dueDate = "due_date"
        case assignees, source, project
    }
}
