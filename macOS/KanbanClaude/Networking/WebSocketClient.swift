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
    private var backoffMS: Int = 500
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
        disconnect(reason: "reconnect")
        let cfg = URLSessionConfiguration.default
        cfg.httpCookieAcceptPolicy = .always
        cfg.httpShouldSetCookies = true
        let s = URLSession(configuration: cfg)
        session = s
        let t = s.webSocketTask(with: Constants.wsURL)
        task = t
        t.resume()
        log.info("ws: connecting \(Constants.wsURL.absoluteString, privacy: .public)")
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
                backoffMS = 500
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
        let ms = backoffMS
        backoffMS = min(backoffMS * 2, 10_000)
        Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(ms) * 1_000_000)
            await MainActor.run { self?.connect() }
        }
    }

    private func handleWake() {
        log.info("ws: wake detected — reconnecting")
        backoffMS = 500
        connect()
    }
}
