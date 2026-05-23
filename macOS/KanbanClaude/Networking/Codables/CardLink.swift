import Foundation

enum CardLinkLabel: String, Codable, CaseIterable, Sendable {
    case evolvesFrom = "evolves_from"
    case supersedes
    case splitFrom = "split_from"
    case related
    case inspiredBy = "inspired_by"
    case duplicateOf = "duplicate_of"

    var display: String {
        switch self {
        case .evolvesFrom: return "🌱 Evolves from"
        case .supersedes: return "➡️ Supersedes"
        case .splitFrom: return "✂️ Split from"
        case .related: return "🔗 Related"
        case .inspiredBy: return "💡 Inspired by"
        case .duplicateOf: return "👯 Duplicate of"
        }
    }
}

struct CardLink: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    let fromCardId: UUID
    let toCardId: UUID
    let label: CardLinkLabel
    let note: String?
    let createdBy: UUID
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case fromCardId = "from_card_id"
        case toCardId = "to_card_id"
        case label, note
        case createdBy = "created_by"
        case createdAt = "created_at"
    }
}

struct CardLinkCreate: Codable, Sendable {
    let toCardId: UUID
    let label: CardLinkLabel
    let note: String?

    enum CodingKeys: String, CodingKey {
        case toCardId = "to_card_id"
        case label, note
    }
}

struct CardLinkWrapResponse: Codable, Sendable { let link: CardLink }

// Envelope for GET /api/cards/:id/links (Rule 2).
struct CardLinksResponse: Codable, Sendable {
    let links: [CardLink]
    let relatedCards: [Card]

    enum CodingKeys: String, CodingKey {
        case links
        case relatedCards = "related_cards"
    }
}

// Envelope for GET /api/cards/:id/chain.
struct CardChainResponse: Codable, Sendable {
    let nodes: [Card]
    let edges: [CardLink]
    let insights: [Insight]
}
