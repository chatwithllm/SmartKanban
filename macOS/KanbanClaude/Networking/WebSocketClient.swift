import Foundation
import AppKit
import os

@MainActor
final class WebSocketClient: ObservableObject {
    static let shared = WebSocketClient()
    private let log = Logger(subsystem: Constants.bundleID, category: "ws")

    @Published private(set) var isConnected = false
    @Published private(set) var lastEvent: BroadcastEvent?

    private var task: URLSessionWebSocketTask?
    private var session: URLSession?
    private var receiveLoop: Task<Void, Never>?
    private var backoffMS: Int = 1_000   // floor ≥1s per Rule 15
    private var connectedAt: Date?        // when the current connection last received hello
    private var helloDeadline: Task<Void, Never>?
    private var subscribers: [UUID: (BroadcastEvent) -> Void] = [:]

    init() {
        NotificationCenter.default.addObserver(
            forName: NSWorkspace.didWakeNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.handleWake() }
        }
    }

    func subscribe(_ handler: @escaping @MainActor (BroadcastEvent) -> Void) -> UUID {
        let id = UUID()
        subscribers[id] = handler
        return id
    }

    func unsubscribe(_ id: UUID) {
        subscribers.removeValue(forKey: id)
    }

    func connect() {
        // I-7: gate — no WS attempt without a session token (defense in depth).
        // Callers in bootstrap/login/register each set the token first, but this
        // guard blocks any future caller that forgets to check, and specifically
        // blocks the bootstrap-cached-user path if the token has since been deleted.
        guard KeychainStore.read() != nil else {
            log.info("ws: skip connect — no session token")
            disconnect(reason: "no-session")
            return
        }
        disconnect(reason: "reconnect")
        let cfg = URLSessionConfiguration.default
        cfg.httpCookieAcceptPolicy = .always
        cfg.httpShouldSetCookies = true
        let s = URLSession(configuration: cfg)
        session = s
        // Build an explicit URLRequest with the Cookie header so the session token
        // reaches the WS handshake regardless of URLSessionWebSocketTask cookie-
        // storage quirks (Apple's docs are silent on whether it attaches cookies
        // automatically during the HTTP Upgrade). Root cause of I-6 reconnect storm:
        // unauthenticated WS was immediately closed by the server (4401), backoff
        // reset on every brief hello-then-drop, hammering the server every ~1s.
        var req = URLRequest(url: Constants.wsURL)
        if let token = KeychainStore.read() {
            req.setValue("kanban_session=\(token)", forHTTPHeaderField: "Cookie")
        }
        let t = s.webSocketTask(with: req)
        task = t
        t.resume()
        log.info("ws: connecting \(Constants.wsURL.absoluteString, privacy: .public) (auth=\(KeychainStore.read() != nil, privacy: .public))")
        startReceiveLoop()
        armHelloDeadline()
    }

    func disconnect(reason: String = "") {
        helloDeadline?.cancel(); helloDeadline = nil
        receiveLoop?.cancel(); receiveLoop = nil
        task?.cancel(with: .normalClosure, reason: reason.data(using: .utf8))
        task = nil
        session = nil
        isConnected = false
    }

    private func startReceiveLoop() {
        guard let t = task else { return }
        receiveLoop = Task { [weak self] in
            await self?.receiveOnce(task: t)
        }
    }

    private func receiveOnce(task t: URLSessionWebSocketTask) async {
        while !Task.isCancelled {
            do {
                let msg = try await t.receive()
                handleMessage(msg)
            } catch is CancellationError {
                return
            } catch {
                if !Task.isCancelled {
                    log.error("ws receive: \(error.localizedDescription, privacy: .public)")
                    scheduleReconnect()
                }
                return
            }
        }
    }

    private func handleMessage(_ msg: URLSessionWebSocketTask.Message) {
        let data: Data?
        switch msg {
        case .data(let d): data = d
        case .string(let s): data = s.data(using: .utf8)
        @unknown default: data = nil
        }
        guard let d = data else { return }
        do {
            let ev = try JSONDecoder.kanban.decode(BroadcastEvent.self, from: d)
            if case .hello = ev {
                helloDeadline?.cancel(); helloDeadline = nil
                isConnected = true
                connectedAt = Date()
                // Do NOT reset backoffMS here. Reset only after a sustained connection
                // (>5s) — a brief connect-then-drop must not reset the backoff (Rule 15).
            }
            lastEvent = ev
            for handler in subscribers.values { handler(ev) }
        } catch {
            log.error("ws decode: \(error.localizedDescription, privacy: .public)")
        }
    }

    private func armHelloDeadline() {
        helloDeadline?.cancel()
        helloDeadline = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 5_000_000_000)
            if Task.isCancelled { return }
            await MainActor.run {
                guard let self else { return }
                if !self.isConnected {
                    self.log.info("ws: hello timeout, reconnecting")
                    self.scheduleReconnect()
                }
            }
        }
    }

    private func scheduleReconnect() {
        disconnect(reason: "backoff")
        // Reset backoff only if the previous connection was sustained (>5s).
        // A brief connect-then-drop (auth failure, server hiccup) must NOT reset
        // the floor — doing so caused the I-6 reconnect storm (Rule 15).
        if let t = connectedAt, Date().timeIntervalSince(t) > 5 {
            backoffMS = 1_000
        }
        connectedAt = nil
        let ms = backoffMS
        backoffMS = min(backoffMS * 2, 30_000)   // cap raised to 30s (was 10s)
        log.info("ws: reconnecting in \(ms, privacy: .public)ms (next=\(self.backoffMS, privacy: .public)ms)")
        Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(ms) * 1_000_000)
            await MainActor.run { self?.connect() }
        }
    }

    private func handleWake() {
        log.info("ws: wake detected — reconnecting")
        backoffMS = 1_000
        connectedAt = nil
        connect()
    }
}
