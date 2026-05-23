import Foundation

struct MirrorToken: Codable, Hashable, Identifiable, Sendable {
    var id: String { token }
    let token: String
    let label: String
    let createdAt: Date
    let url: String?

    enum CodingKeys: String, CodingKey {
        case token, label
        case createdAt = "created_at"
        case url
    }
}

struct ApiToken: Codable, Hashable, Identifiable, Sendable {
    var id: String { token }
    let token: String
    let label: String
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case token, label
        case createdAt = "created_at"
    }
}
