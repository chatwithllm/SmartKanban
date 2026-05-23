import Foundation

// Mirrors server/src/cards.ts AiSuggestion. `params` is JSON-shaped — we keep it
// as JSON via AnyCodable so we can pass the dictionary straight into a Card patch
// when the user taps Apply.
struct AiSuggestion: Codable, Hashable, Sendable {
    let label: String
    let action: Action
    let params: [String: JSONValue]

    enum Action: String, Codable, Sendable {
        case updateStatus = "update_status"
        case setDueDate = "set_due_date"
        case assignUser = "assign_user"
        case createCard = "create_card"
    }
}

// Minimal JSON value type for opaque payloads (AiSuggestion.params, CardEvent.details).
indirect enum JSONValue: Codable, Hashable, Sendable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case null
    case array([JSONValue])
    case object([String: JSONValue])

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null; return }
        if let v = try? c.decode(Bool.self) { self = .bool(v); return }
        if let v = try? c.decode(Double.self) { self = .number(v); return }
        if let v = try? c.decode(String.self) { self = .string(v); return }
        if let v = try? c.decode([JSONValue].self) { self = .array(v); return }
        if let v = try? c.decode([String: JSONValue].self) { self = .object(v); return }
        self = .null
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case .bool(let v): try c.encode(v)
        case .number(let v): try c.encode(v)
        case .string(let v): try c.encode(v)
        case .array(let v): try c.encode(v)
        case .object(let v): try c.encode(v)
        }
    }

    var stringValue: String? { if case .string(let s) = self { return s }; return nil }
}
