import Foundation

// Mirrors server/src/auth.ts AuthUser: { id, name, short_name, email, is_admin, must_change_password }
struct User: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    let name: String
    let shortName: String
    let email: String
    let isAdmin: Bool
    let mustChangePassword: Bool

    enum CodingKeys: String, CodingKey {
        case id
        case name
        case shortName = "short_name"
        case email
        case isAdmin = "is_admin"
        case mustChangePassword = "must_change_password"
    }
}
