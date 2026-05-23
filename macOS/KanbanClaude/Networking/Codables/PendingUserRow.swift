import Foundation

// Mirrors GET /api/admin/pending response shape (server/src/routes/admin.ts)
struct PendingUserRow: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    let email: String
    let emailVerified: Bool
    let name: String
    let pictureUrl: String?
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id, email
        case emailVerified = "email_verified"
        case name
        case pictureUrl = "picture_url"
        case createdAt = "created_at"
    }
}
