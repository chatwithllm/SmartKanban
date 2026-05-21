import Foundation

enum KanbanError: Error, LocalizedError, Sendable {
    case unauthorized
    case statusCode(Int, String)
    case validation([String: String], String)
    case decode(String)
    case network(URLError)
    case cancelled
    case server(String)
    case missing(String)

    var errorDescription: String? {
        switch self {
        case .unauthorized: return "Sign in expired. Please log in."
        case .statusCode(let code, let msg): return "\(code) \(msg)"
        case .validation(_, let msg): return msg
        case .decode(let msg): return "Decoding error: \(msg)"
        case .network(let e): return e.localizedDescription
        case .cancelled: return "Cancelled"
        case .server(let m): return m
        case .missing(let m): return m
        }
    }
}
