import Foundation

// Mirrors GET /api/admin/users response shape (server/src/routes/admin.ts)
struct AdminUserRow: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    let name: String
    let shortName: String
    let email: String
    let isAdmin: Bool
    let identities: [AdminIdentity]
    let lastLoginAt: String?
    let sessionCount: Int
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id, name
        case shortName = "short_name"
        case email
        case isAdmin = "is_admin"
        case identities
        case lastLoginAt = "last_login_at"
        case sessionCount = "session_count"
        case createdAt = "created_at"
    }
}

struct AdminIdentity: Codable, Hashable, Sendable {
    let provider: String
    let email: String
}
