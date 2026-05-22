import Foundation

enum Scope: String, Codable, CaseIterable, Sendable {
    case personal, inbox, all, shared

    var label: String {
        switch self {
        case .personal: return "My board"
        case .inbox: return "Family inbox"
        case .all: return "Everything"
        case .shared: return "Shared with me"
        }
    }

    var description: String {
        switch self {
        case .personal: return "Mine, assigned, or shared with me"
        case .inbox: return "Unassigned — everyone sees these"
        case .all: return "Full visibility predicate"
        case .shared: return "Others shared with me"
        }
    }
}

enum KScope: String, Sendable {
    case mine, inbox, all
}

enum HTTPMethod: String, Sendable {
    case GET, POST, PATCH, PUT, DELETE
}

enum Endpoint {
    // MARK: auth
    case me
    case login(email: String, password: String)
    case register(name: String, shortName: String, email: String, password: String)
    case logout
    case updateMe(shortName: String?, name: String?)
    case exchangeAuthTicket(ticket: String)
    case listUsers

    // MARK: cards
    case listCards(scope: Scope, project: String?)
    case archivedCards
    case getCard(id: UUID)
    case createCard(CardCreate)
    case updateCard(id: UUID, CardPatch)
    case archiveCard(id: UUID)
    case restoreCard(id: UUID)
    case permanentDelete(id: UUID)
    case purgeArchived
    case knowledgeForCard(id: UUID)

    // MARK: tokens
    case listMirrorTokens
    case createMirrorToken(label: String?)
    case deleteMirrorToken(token: String)
    case listApiTokens
    case createApiToken(label: String?)
    case deleteApiToken(token: String)

    // MARK: review / telegram
    case review
    case linkTelegram(userId: Int64, username: String?)
    case listTelegramIdentities
    case unlinkTelegram(userId: Int64)

    // MARK: templates
    case listTemplates
    case getTemplate(id: UUID)
    case createTemplate(TemplateInput)
    case updateTemplate(id: UUID, TemplateInput)
    case deleteTemplate(id: UUID)
    case instantiateTemplate(id: UUID, statusOverride: CardStatus?)

    // MARK: knowledge
    case listKnowledge(scope: KScope, q: String?, tag: String?, limit: Int?, cursor: String?)
    case getKnowledge(id: UUID)
    case createKnowledge(KnowledgeInput)
    case updateKnowledge(id: UUID, KnowledgePatch)
    case archiveKnowledge(id: UUID)
    case refetchKnowledge(id: UUID)
    case linkKnowledgeToCard(knowledgeId: UUID, cardId: UUID)
    case unlinkKnowledgeFromCard(knowledgeId: UUID, cardId: UUID)
    case knowledgeFromCard(cardId: UUID)

    // MARK: insights
    case brainstormCard(id: UUID)
    case listCardInsights(id: UUID)
    case getInsight(id: UUID)

    // MARK: card links
    case createCardLink(fromCardId: UUID, payload: CardLinkCreate)
    case deleteCardLink(fromCardId: UUID, linkId: UUID)
    case listCardLinks(cardId: UUID)
    case cardChain(cardId: UUID, depth: Int)

    // MARK: chat
    case cardEvents(id: UUID)
    case postMessage(cardId: UUID, content: String)
    case markRead(cardId: UUID, lastReadId: Int64)
    case unreadCounts

    // MARK: notifications
    case listNotifications
    case markNotificationsRead(ids: [Int])
    case markAllNotificationsRead

    // MARK: push (MVP: unused — kept for parity)
    case vapidPublicKey

    var method: HTTPMethod {
        switch self {
        case .me, .listUsers, .listCards, .archivedCards, .getCard, .knowledgeForCard,
             .listMirrorTokens, .listApiTokens, .review, .listTelegramIdentities,
             .listTemplates, .getTemplate, .listKnowledge, .getKnowledge,
             .listCardInsights, .getInsight, .listCardLinks, .cardChain,
             .cardEvents, .unreadCounts, .listNotifications, .vapidPublicKey:
            return .GET
        case .login, .register, .logout, .exchangeAuthTicket, .createCard, .createMirrorToken, .createApiToken,
             .linkTelegram, .createTemplate, .instantiateTemplate, .createKnowledge,
             .refetchKnowledge, .linkKnowledgeToCard, .knowledgeFromCard,
             .brainstormCard, .createCardLink, .postMessage, .purgeArchived:
            return .POST
        case .updateMe, .updateCard, .restoreCard, .updateTemplate, .updateKnowledge:
            return .PATCH
        case .markRead, .markNotificationsRead, .markAllNotificationsRead:
            return .PUT
        case .archiveCard, .permanentDelete, .deleteMirrorToken, .deleteApiToken,
             .unlinkTelegram, .deleteTemplate, .archiveKnowledge,
             .unlinkKnowledgeFromCard, .deleteCardLink:
            return .DELETE
        }
    }

    var path: String {
        switch self {
        case .me: return "/api/auth/me"
        case .login: return "/api/auth/login"
        case .register: return "/api/auth/register"
        case .logout: return "/api/auth/logout"
        case .updateMe: return "/api/auth/me"
        case .exchangeAuthTicket: return "/api/auth/ticket/exchange"
        case .listUsers: return "/api/users"
        case .listCards: return "/api/cards"
        case .archivedCards: return "/api/cards/archived"
        case .getCard(let id): return "/api/cards/\(id.lowered)"
        case .createCard: return "/api/cards"
        case .updateCard(let id, _): return "/api/cards/\(id.lowered)"
        case .archiveCard(let id): return "/api/cards/\(id.lowered)"
        case .restoreCard(let id): return "/api/cards/\(id.lowered)/restore"
        case .permanentDelete(let id): return "/api/cards/\(id.lowered)/permanent"
        case .purgeArchived: return "/api/cards/archived/purge"
        case .knowledgeForCard(let id): return "/api/cards/\(id.lowered)/knowledge"
        case .listMirrorTokens, .createMirrorToken: return "/api/mirror/tokens"
        case .deleteMirrorToken(let t): return "/api/mirror/tokens/\(t)"
        case .listApiTokens, .createApiToken: return "/api/tokens"
        case .deleteApiToken(let t): return "/api/tokens/\(t)"
        case .review: return "/api/review"
        case .linkTelegram: return "/api/telegram/link"
        case .listTelegramIdentities: return "/api/telegram/identities"
        case .unlinkTelegram(let uid): return "/api/telegram/identities/\(uid)"
        case .listTemplates, .createTemplate: return "/api/templates"
        case .getTemplate(let id), .updateTemplate(let id, _), .deleteTemplate(let id):
            return "/api/templates/\(id.lowered)"
        case .instantiateTemplate(let id, _): return "/api/templates/\(id.lowered)/instantiate"
        case .listKnowledge: return "/api/knowledge"
        case .getKnowledge(let id), .updateKnowledge(let id, _), .archiveKnowledge(let id):
            return "/api/knowledge/\(id.lowered)"
        case .createKnowledge: return "/api/knowledge"
        case .refetchKnowledge(let id): return "/api/knowledge/\(id.lowered)/refetch"
        case .linkKnowledgeToCard(let kid, _): return "/api/knowledge/\(kid.lowered)/links"
        case .unlinkKnowledgeFromCard(let kid, let cid):
            return "/api/knowledge/\(kid.lowered)/links/\(cid.lowered)"
        case .knowledgeFromCard(let cid): return "/api/knowledge/from-card/\(cid.lowered)"
        case .brainstormCard(let id): return "/api/cards/\(id.lowered)/insights/brainstorm"
        case .listCardInsights(let id): return "/api/cards/\(id.lowered)/insights"
        case .getInsight(let id): return "/api/insights/\(id.lowered)"
        case .createCardLink(let from, _): return "/api/cards/\(from.lowered)/links"
        case .deleteCardLink(let from, let linkId):
            return "/api/cards/\(from.lowered)/links/\(linkId.lowered)"
        case .listCardLinks(let id): return "/api/cards/\(id.lowered)/links"
        case .cardChain(let id, _): return "/api/cards/\(id.lowered)/chain"
        case .cardEvents(let id): return "/api/cards/\(id.lowered)/events"
        case .postMessage(let id, _): return "/api/cards/\(id.lowered)/messages"
        case .markRead(let id, _): return "/api/cards/\(id.lowered)/events/read"
        case .unreadCounts: return "/api/messages/unread"
        case .listNotifications: return "/api/notifications"
        case .markNotificationsRead: return "/api/notifications/read"
        case .markAllNotificationsRead: return "/api/notifications/read-all"
        case .vapidPublicKey: return "/api/push/vapid-public-key"
        }
    }

    var query: [URLQueryItem] {
        switch self {
        case .listCards(let scope, let project):
            var q: [URLQueryItem] = [.init(name: "scope", value: scope.rawValue)]
            if let p = project, !p.isEmpty { q.append(.init(name: "project", value: p)) }
            return q
        case .listKnowledge(let scope, let qStr, let tag, let limit, let cursor):
            var arr: [URLQueryItem] = [.init(name: "scope", value: scope.rawValue)]
            if let q = qStr, !q.isEmpty { arr.append(.init(name: "q", value: q)) }
            if let t = tag, !t.isEmpty { arr.append(.init(name: "tag", value: t)) }
            if let n = limit { arr.append(.init(name: "limit", value: String(n))) }
            if let c = cursor, !c.isEmpty { arr.append(.init(name: "cursor", value: c)) }
            return arr
        case .cardChain(_, let depth):
            return [.init(name: "depth", value: String(depth))]
        case .instantiateTemplate(_, let override) where override != nil:
            return [.init(name: "status_override", value: override!.rawValue)]
        default:
            return []
        }
    }

    /// Encoded body for POST/PATCH/PUT (or nil for GET/DELETE bodies).
    func body() throws -> Data? {
        let enc = JSONEncoder.kanban
        switch self {
        case .login(let email, let password):
            return try enc.encode(["email": email, "password": password])
        case .exchangeAuthTicket(let ticket):
            return try enc.encode(["ticket": ticket])
        case .register(let name, let shortName, let email, let password):
            return try enc.encode([
                "name": name, "short_name": shortName,
                "email": email, "password": password,
            ])
        case .updateMe(let shortName, let name):
            var d: [String: String] = [:]
            if let s = shortName { d["short_name"] = s }
            if let n = name { d["name"] = n }
            return try enc.encode(d)
        case .createCard(let payload): return try enc.encode(payload)
        case .updateCard(_, let payload): return try enc.encode(payload)
        case .createMirrorToken(let label), .createApiToken(let label):
            return try enc.encode(["label": label ?? ""])
        case .linkTelegram(let uid, let uname):
            var d: [String: JSONValue] = ["telegram_user_id": .number(Double(uid))]
            if let u = uname { d["telegram_username"] = .string(u) }
            return try enc.encode(d)
        case .createTemplate(let payload), .updateTemplate(_, let payload):
            return try enc.encode(payload)
        case .instantiateTemplate(_, let override):
            if let o = override { return try enc.encode(["status_override": o.rawValue]) }
            return Data("{}".utf8)
        case .createKnowledge(let payload): return try enc.encode(payload)
        case .updateKnowledge(_, let payload): return try enc.encode(payload)
        case .linkKnowledgeToCard(_, let cid):
            return try enc.encode(["card_id": cid.lowered])
        case .createCardLink(_, let p): return try enc.encode(p)
        case .postMessage(_, let content): return try enc.encode(["content": content])
        case .markRead(_, let lastReadId): return try enc.encode(["last_read_id": lastReadId])
        case .markNotificationsRead(let ids): return try enc.encode(["ids": ids])
        default:
            return nil
        }
    }

    func urlRequest(base: URL) throws -> URLRequest {
        var comps = URLComponents(url: base.appendingPathComponent(""), resolvingAgainstBaseURL: false)!
        comps.path = path
        let q = query
        if !q.isEmpty { comps.queryItems = q }
        guard let url = comps.url else { throw KanbanError.missing("invalid URL for \(path)") }
        var req = URLRequest(url: url)
        req.httpMethod = method.rawValue
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if let b = try body() {
            req.httpBody = b
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        return req
    }
}

extension UUID {
    /// Server expects lowercase UUIDs; default Swift description is uppercase.
    var lowered: String { uuidString.lowercased() }
}

extension JSONEncoder {
    static var kanban: JSONEncoder {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        return e
    }
}

extension JSONDecoder {
    static var kanban: JSONDecoder {
        let d = JSONDecoder()
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let isoNoFrac = ISO8601DateFormatter()
        isoNoFrac.formatOptions = [.withInternetDateTime]
        d.dateDecodingStrategy = .custom { decoder in
            let c = try decoder.singleValueContainer()
            let s = try c.decode(String.self)
            if let dt = iso.date(from: s) { return dt }
            if let dt = isoNoFrac.date(from: s) { return dt }
            // Postgres timestamp without TZ — "YYYY-MM-DD HH:mm:ss" or with ".SSS"
            let f1 = DateFormatter()
            f1.locale = Locale(identifier: "en_US_POSIX")
            f1.dateFormat = "yyyy-MM-dd'T'HH:mm:ss.SSSSSS"
            f1.timeZone = TimeZone(secondsFromGMT: 0)
            if let dt = f1.date(from: s) { return dt }
            f1.dateFormat = "yyyy-MM-dd HH:mm:ss"
            if let dt = f1.date(from: s) { return dt }
            // Date-only "YYYY-MM-DD" used by due_date but we model that as String;
            // anything we can't parse becomes epoch so decoding doesn't crash.
            return .distantPast
        }
        return d
    }
}
