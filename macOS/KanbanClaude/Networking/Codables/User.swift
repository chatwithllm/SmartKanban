import Foundation

// Mirrors server/src/auth.ts AuthUser: { id, name, short_name, email }
struct User: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    let name: String
    let shortName: String
    let email: String

    enum CodingKeys: String, CodingKey {
        case id
        case name
        case shortName = "short_name"
        case email
    }
}
