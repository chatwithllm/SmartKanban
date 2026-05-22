import Foundation

// Mirrors GET /api/admin/audit response shape: { items: [...], next_before?: string }
// (server/src/routes/admin.ts — metadata field intentionally omitted; JSONB decoding deferred)
struct AuditEntryRow: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    let action: String
    let createdAt: String
    let actorId: UUID?
    let actorName: String?
    let targetUserId: UUID?
    let targetUserName: String?
    let targetPendingId: UUID?

    enum CodingKeys: String, CodingKey {
        case id, action
        case createdAt = "created_at"
        case actorId = "actor_id"
        case actorName = "actor_name"
        case targetUserId = "target_user_id"
        case targetUserName = "target_user_name"
        case targetPendingId = "target_pending_id"
    }
}

struct AuditPage: Codable, Sendable {
    let items: [AuditEntryRow]
    let nextBefore: String?

    enum CodingKeys: String, CodingKey {
        case items
        case nextBefore = "next_before"
    }
}
