import Foundation
import Combine
import os

@MainActor
final class AuthStore: ObservableObject {
    static let shared = AuthStore()
    private let log = Logger(subsystem: Constants.bundleID, category: "auth")

    enum Phase: Equatable {
        case unknown          // boot — haven't checked yet
        case unauthenticated
        case authenticated(User)
    }

    @Published private(set) var phase: Phase = .unknown
    @Published var lastError: String?

    var currentUser: User? {
        if case .authenticated(let u) = phase { return u }
        return nil
    }

    func bootstrap() async {
        do {
            let user = try await APIClient.shared.send(.me, as: User.self)
            phase = .authenticated(user)
            cacheUser(user)
            WebSocketClient.shared.connect()
        } catch KanbanError.unauthorized {
            phase = .unauthenticated
        } catch {
            log.error("bootstrap me: \(error.localizedDescription, privacy: .public)")
            // I-7: only restore cached user if we still have a session token.
            // Without a token, the cached user is stale — connecting WS would
            // trigger a 4401 close → scheduleReconnect → storm every ~1s.
            if KeychainStore.read() != nil, let cached = restoreCachedUser() {
                phase = .authenticated(cached)
                WebSocketClient.shared.connect()
            } else {
                phase = .unauthenticated
            }
        }
    }

    func login(email: String, password: String) async throws {
        lastError = nil
        do {
            let user = try await APIClient.shared.send(.login(email: email, password: password), as: User.self)
            phase = .authenticated(user)
            cacheUser(user)
            WebSocketClient.shared.connect()
            ToastStore.shared.success("Signed in as \(user.shortName)")
        } catch {
            lastError = error.localizedDescription
            throw error
        }
    }

    func register(name: String, shortName: String, email: String, password: String) async throws {
        lastError = nil
        do {
            let user = try await APIClient.shared.send(
                .register(name: name, shortName: shortName, email: email, password: password),
                as: User.self
            )
            phase = .authenticated(user)
            cacheUser(user)
            WebSocketClient.shared.connect()
            ToastStore.shared.success("Welcome, \(user.shortName)")
        } catch {
            lastError = error.localizedDescription
            throw error
        }
    }

    func logout() async {
        do {
            try await APIClient.shared.sendVoid(.logout)
        } catch {
            log.error("logout: \(error.localizedDescription, privacy: .public)")
        }
        // I-7: disconnect WS BEFORE clearing keychain — if the order is reversed,
        // the WS connect() gate would see no token on reconnect (harmless but
        // confusing); more importantly, any in-flight reconnect scheduled before
        // logout fires connect() → hits the guard and bails cleanly only if the
        // keychain is already cleared.
        WebSocketClient.shared.disconnect(reason: "logout")
        KeychainStore.delete()
        UserDefaults.standard.removeObject(forKey: Constants.Defaults.lastUserJSON)
        phase = .unauthenticated
    }

    func loginWithTicket(_ ticket: String) async throws {
        // Exchange single-use ticket for a session cookie (Set-Cookie) + { token }.
        // APIClient.rawSend mirrors the Set-Cookie value into Keychain automatically
        // for the /api/auth/ticket/exchange path.
        _ = try await APIClient.shared.send(.exchangeAuthTicket(ticket: ticket), as: TicketExchangeResponse.self)
        // Cookie is now set in the shared session; bootstrap fetches the user via /api/auth/me
        await bootstrap()
        if case .authenticated(let user) = phase {
            ToastStore.shared.success("Signed in as \(user.shortName)")
        }
    }

    func updateMe(shortName: String?, name: String?) async throws -> User {
        let updated = try await APIClient.shared.send(.updateMe(shortName: shortName, name: name), as: User.self)
        phase = .authenticated(updated)
        cacheUser(updated)
        return updated
    }

    private func cacheUser(_ u: User) {
        if let data = try? JSONEncoder().encode(u) {
            UserDefaults.standard.set(data, forKey: Constants.Defaults.lastUserJSON)
        }
    }

    private func restoreCachedUser() -> User? {
        guard let data = UserDefaults.standard.data(forKey: Constants.Defaults.lastUserJSON) else { return nil }
        return try? JSONDecoder().decode(User.self, from: data)
    }
}
