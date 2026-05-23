import Foundation

// Mirrors GET /api/admin/users response shape (server/src/routes/admin.ts)
// NOTE: short_name is NULLABLE in the DB (COALESCE on the server guards it, but
// Swift must not break if a null slips through — custom init decodes with fallback).
struct AdminUserRow: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    let name: String
    let shortName: String   // always non-nil after decode; falls back to name
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

    init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id           = try c.decode(UUID.self,   forKey: .id)
        name         = try c.decode(String.self, forKey: .name)
        // short_name is nullable in the DB; COALESCE guards it server-side but
        // fall back to name here so a null/missing key never crashes the decoder.
        shortName    = (try? c.decodeIfPresent(String.self, forKey: .shortName) ?? nil) ?? name
        email        = try c.decode(String.self, forKey: .email)
        isAdmin      = try c.decode(Bool.self,   forKey: .isAdmin)
        identities   = (try? c.decode([AdminIdentity].self, forKey: .identities)) ?? []
        lastLoginAt  = try? c.decodeIfPresent(String.self, forKey: .lastLoginAt) ?? nil
        sessionCount = (try? c.decode(Int.self,  forKey: .sessionCount)) ?? 0
        createdAt    = try c.decode(String.self, forKey: .createdAt)
    }
}

struct AdminIdentity: Codable, Hashable, Sendable {
    let provider: String
    let email: String
}
