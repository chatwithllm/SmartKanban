import Foundation

// Mirrors server/src/cards.ts Attachment.
struct Attachment: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    let kind: Kind
    let storagePath: String
    let originalFilename: String?
    let createdAt: Date

    enum Kind: String, Codable, Sendable {
        case audio, image, file
    }

    enum CodingKeys: String, CodingKey {
        case id
        case kind
        case storagePath = "storage_path"
        case originalFilename = "original_filename"
        case createdAt = "created_at"
    }
}
