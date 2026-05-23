import Foundation

// Mirrors server/src/ws.ts BroadcastEvent union + the `hello` first-frame.
// 19 variants total. Discriminator is the `type` field. Unknown types decode
// to .unknown and are logged + dropped (NEVER crash) per V-031.
enum BroadcastEvent: Decodable, Sendable {
    case hello(userId: UUID)
    case cardCreated(Card)
    case cardUpdated(Card)
    case cardDeleted(id: UUID)
    case templateCreated(Template)
    case templateUpdated(Template)
    case templateDeleted(id: UUID, ownerId: UUID, visibility: TemplateVisibility)
    case knowledgeCreated(KnowledgeItem)
    case knowledgeUpdated(KnowledgeItem)
    case knowledgeDeleted(id: UUID, ownerId: UUID, visibility: KnowledgeVisibility, shares: [UUID])
    case knowledgeLinkCreated(knowledgeId: UUID, cardId: UUID)
    case knowledgeLinkDeleted(knowledgeId: UUID, cardId: UUID)
    case cardMessage(event: CardEvent, cardId: UUID, card: Card)
    case cardAiResponse(event: CardEvent, cardId: UUID, card: Card)
    case insightQueued(insight: Insight, cardId: UUID, ownerId: UUID)
    case insightUpdated(insight: Insight, cardId: UUID, ownerId: UUID)
    case insightFailed(insight: Insight, cardId: UUID, ownerId: UUID)
    case cardLinkCreated(link: CardLink, fromOwnerId: UUID, toOwnerId: UUID)
    case cardLinkDeleted(id: UUID, fromCardId: UUID, toCardId: UUID, fromOwnerId: UUID, toOwnerId: UUID)
    case unknown(type: String)

    private enum K: String, CodingKey {
        case type
        case card, template, knowledge, insight, link, event
        case id, userId = "user_id", ownerId = "owner_id", visibility
        case shares
        case knowledgeId = "knowledge_id"
        case cardId = "card_id"
        case fromCardId = "from_card_id"
        case toCardId = "to_card_id"
        case fromOwnerId = "from_owner_id"
        case toOwnerId = "to_owner_id"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        let type = try c.decode(String.self, forKey: .type)
        switch type {
        case "hello":
            self = .hello(userId: try c.decode(UUID.self, forKey: .userId))
        case "card.created":
            self = .cardCreated(try c.decode(Card.self, forKey: .card))
        case "card.updated":
            self = .cardUpdated(try c.decode(Card.self, forKey: .card))
        case "card.deleted":
            self = .cardDeleted(id: try c.decode(UUID.self, forKey: .id))
        case "template.created":
            self = .templateCreated(try c.decode(Template.self, forKey: .template))
        case "template.updated":
            self = .templateUpdated(try c.decode(Template.self, forKey: .template))
        case "template.deleted":
            self = .templateDeleted(
                id: try c.decode(UUID.self, forKey: .id),
                ownerId: try c.decode(UUID.self, forKey: .ownerId),
                visibility: try c.decode(TemplateVisibility.self, forKey: .visibility)
            )
        case "knowledge.created":
            self = .knowledgeCreated(try c.decode(KnowledgeItem.self, forKey: .knowledge))
        case "knowledge.updated":
            self = .knowledgeUpdated(try c.decode(KnowledgeItem.self, forKey: .knowledge))
        case "knowledge.deleted":
            self = .knowledgeDeleted(
                id: try c.decode(UUID.self, forKey: .id),
                ownerId: try c.decode(UUID.self, forKey: .ownerId),
                visibility: try c.decode(KnowledgeVisibility.self, forKey: .visibility),
                shares: try c.decode([UUID].self, forKey: .shares)
            )
        case "knowledge.link.created":
            self = .knowledgeLinkCreated(
                knowledgeId: try c.decode(UUID.self, forKey: .knowledgeId),
                cardId: try c.decode(UUID.self, forKey: .cardId)
            )
        case "knowledge.link.deleted":
            self = .knowledgeLinkDeleted(
                knowledgeId: try c.decode(UUID.self, forKey: .knowledgeId),
                cardId: try c.decode(UUID.self, forKey: .cardId)
            )
        case "card.message":
            self = .cardMessage(
                event: try c.decode(CardEvent.self, forKey: .event),
                cardId: try c.decode(UUID.self, forKey: .cardId),
                card: try c.decode(Card.self, forKey: .card)
            )
        case "card.ai_response":
            self = .cardAiResponse(
                event: try c.decode(CardEvent.self, forKey: .event),
                cardId: try c.decode(UUID.self, forKey: .cardId),
                card: try c.decode(Card.self, forKey: .card)
            )
        case "insight.queued":
            self = .insightQueued(
                insight: try c.decode(Insight.self, forKey: .insight),
                cardId: try c.decode(UUID.self, forKey: .cardId),
                ownerId: try c.decode(UUID.self, forKey: .ownerId)
            )
        case "insight.updated":
            self = .insightUpdated(
                insight: try c.decode(Insight.self, forKey: .insight),
                cardId: try c.decode(UUID.self, forKey: .cardId),
                ownerId: try c.decode(UUID.self, forKey: .ownerId)
            )
        case "insight.failed":
            self = .insightFailed(
                insight: try c.decode(Insight.self, forKey: .insight),
                cardId: try c.decode(UUID.self, forKey: .cardId),
                ownerId: try c.decode(UUID.self, forKey: .ownerId)
            )
        case "card.link.created":
            self = .cardLinkCreated(
                link: try c.decode(CardLink.self, forKey: .link),
                fromOwnerId: try c.decode(UUID.self, forKey: .fromOwnerId),
                toOwnerId: try c.decode(UUID.self, forKey: .toOwnerId)
            )
        case "card.link.deleted":
            self = .cardLinkDeleted(
                id: try c.decode(UUID.self, forKey: .id),
                fromCardId: try c.decode(UUID.self, forKey: .fromCardId),
                toCardId: try c.decode(UUID.self, forKey: .toCardId),
                fromOwnerId: try c.decode(UUID.self, forKey: .fromOwnerId),
                toOwnerId: try c.decode(UUID.self, forKey: .toOwnerId)
            )
        default:
            self = .unknown(type: type)
        }
    }
}
