import Foundation

enum InsightStatus: String, Codable, Sendable {
    case pending, ok, failed
}

struct Insight: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    let cardId: UUID
    let requestedBy: UUID
    let status: InsightStatus
    let summary: String?
    let body: Body?
    let error: String?
    let degraded: Bool
    let createdAt: Date
    let completedAt: Date?

    struct Body: Codable, Hashable, Sendable {
        let relatedItems: [RelatedItem]?
        let webFindings: [WebFinding]?
        let nextSteps: [String]?

        enum CodingKeys: String, CodingKey {
            case relatedItems = "related_items"
            case webFindings = "web_findings"
            case nextSteps = "next_steps"
        }
    }

    struct RelatedItem: Codable, Hashable, Sendable {
        let kind: String       // 'card' | 'knowledge'
        let id: UUID
        let title: String
        let url: String?
        let why: String?
    }

    struct WebFinding: Codable, Hashable, Sendable {
        let title: String
        let url: String
        let why: String?
    }

    enum CodingKeys: String, CodingKey {
        case id
        case cardId = "card_id"
        case requestedBy = "requested_by"
        case status, summary, body, error, degraded
        case createdAt = "created_at"
        case completedAt = "completed_at"
    }
}

struct InsightListResponse: Codable, Sendable {
    let insights: [Insight]
}
struct InsightWrapResponse: Codable, Sendable {
    let insight: Insight
}
struct InsightQueuedResponse: Codable, Sendable {
    let id: UUID
    let status: InsightStatus
}
