import Foundation
import os

@MainActor
final class APIClient {
    static let shared = APIClient()
    private let log = Logger(subsystem: Constants.bundleID, category: "network")
    let baseURL: URL
    let session: URLSession

    init(baseURL: URL = Constants.serverURL) {
        self.baseURL = baseURL
        let cfg = URLSessionConfiguration.default
        cfg.httpCookieAcceptPolicy = .always
        cfg.httpShouldSetCookies = true
        cfg.timeoutIntervalForRequest = 20
        cfg.timeoutIntervalForResource = 60
        cfg.httpAdditionalHeaders = [
            "User-Agent": "KanbanClaude/\(Constants.appVersion) macOS",
            "Accept": "application/json",
        ]
        self.session = URLSession(configuration: cfg)
        restoreCookieFromKeychainIfNeeded()
    }

    private func restoreCookieFromKeychainIfNeeded() {
        let storage = session.configuration.httpCookieStorage ?? HTTPCookieStorage.shared
        let host = baseURL.host ?? "kanban.npalakurla.com"
        let existing = storage.cookies(for: baseURL)?.contains(where: { $0.name == "kanban_session" }) ?? false
        guard !existing, let token = KeychainStore.read() else { return }
        if let cookie = HTTPCookie(properties: [
            .name: "kanban_session",
            .value: token,
            .domain: host,
            .path: "/",
            .secure: baseURL.scheme == "https",
            .expires: Date(timeIntervalSinceNow: 30 * 86400),
        ]) {
            storage.setCookie(cookie)
        }
    }

    /// Decoded JSON response.
    func send<T: Decodable>(_ endpoint: Endpoint, as: T.Type = T.self) async throws -> T {
        let (data, http) = try await rawSend(endpoint)
        try Self.assertSuccess(http: http, data: data)
        do {
            return try JSONDecoder.kanban.decode(T.self, from: data)
        } catch {
            log.error("decode failed for \(endpoint.path, privacy: .public): \(error.localizedDescription, privacy: .public)")
            throw KanbanError.decode(error.localizedDescription)
        }
    }

    /// Endpoints with no JSON body in response (204).
    func sendVoid(_ endpoint: Endpoint) async throws {
        let (data, http) = try await rawSend(endpoint)
        try Self.assertSuccess(http: http, data: data)
    }

    /// Returns raw body — used for image/SVG.
    func sendData(_ endpoint: Endpoint) async throws -> (Data, HTTPURLResponse) {
        let (data, http) = try await rawSend(endpoint)
        try Self.assertSuccess(http: http, data: data)
        return (data, http)
    }

    private func rawSend(_ endpoint: Endpoint) async throws -> (Data, HTTPURLResponse) {
        let req = try endpoint.urlRequest(base: baseURL)
        log.debug("\(req.httpMethod ?? "?", privacy: .public) \(req.url?.path ?? "?", privacy: .public)")
        do {
            let (data, response) = try await session.data(for: req)
            guard let http = response as? HTTPURLResponse else {
                throw KanbanError.network(URLError(.badServerResponse))
            }
            ServerTime.captureSkew(from: response)
            // On login/register the server returns Set-Cookie. Mirror its value
            // into Keychain so a cold launch can re-inject if the cookie store
            // is empty (e.g. user purged ~/Library/Cookies).
            if endpoint.path.hasPrefix("/api/auth/login") || endpoint.path.hasPrefix("/api/auth/register") {
                if let storage = session.configuration.httpCookieStorage,
                   let token = storage.cookies(for: baseURL)?.first(where: { $0.name == "kanban_session" })?.value {
                    KeychainStore.save(token: token)
                }
            }
            if endpoint.path == "/api/auth/logout" {
                KeychainStore.delete()
            }
            return (data, http)
        } catch let e as URLError where e.code == .cancelled {
            throw KanbanError.cancelled
        } catch let e as URLError {
            throw KanbanError.network(e)
        } catch is CancellationError {
            throw KanbanError.cancelled
        } catch {
            throw error
        }
    }

    static func assertSuccess(http: HTTPURLResponse, data: Data) throws {
        if (200..<300).contains(http.statusCode) { return }
        if http.statusCode == 401 { throw KanbanError.unauthorized }

        // Web parses `{ error: { fields: {...}, message?: "..." } }` for 4xx validation responses.
        if (400..<500).contains(http.statusCode),
           let envelope = try? JSONDecoder().decode(ValidationEnvelope.self, from: data),
           let fields = envelope.error?.fields, !fields.isEmpty {
            let msg = envelope.error?.message ?? envelope.message ?? "Validation failed"
            throw KanbanError.validation(fields, msg)
        }

        // Knowledge routes emit a flat shape: `{ "error": "<msg>", "field": "<key>" }` (server/src/routes/knowledge.ts:26,185).
        if (400..<500).contains(http.statusCode),
           let flat = try? JSONDecoder().decode(FlatValidationEnvelope.self, from: data),
           let field = flat.field, let msg = flat.error {
            throw KanbanError.validation([field: msg], msg)
        }

        let snippet: String
        if let s = try? JSONDecoder().decode(ErrorEnvelope.self, from: data) {
            snippet = s.error ?? s.message ?? String(data: data, encoding: .utf8) ?? "(no body)"
        } else {
            snippet = String(data: data, encoding: .utf8)?.prefix(200).description ?? "(no body)"
        }
        throw KanbanError.statusCode(http.statusCode, snippet)
    }

    struct ErrorEnvelope: Decodable {
        let error: String?
        let message: String?
    }

    struct ValidationEnvelope: Decodable {
        struct Detail: Decodable {
            let fields: [String: String]?
            let message: String?
        }
        let error: Detail?
        let message: String?
    }

    struct FlatValidationEnvelope: Decodable {
        let error: String?
        let field: String?
    }
}
