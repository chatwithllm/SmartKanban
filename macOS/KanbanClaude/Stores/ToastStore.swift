import Foundation
import Combine

@MainActor
final class ToastStore: ObservableObject {
    static let shared = ToastStore()

    struct Toast: Identifiable, Hashable {
        let id = UUID()
        let kind: Kind
        let message: String
        let createdAt: Date = Date()
        enum Kind { case success, error, info, offline }
    }

    @Published private(set) var toasts: [Toast] = []
    private var timers: [UUID: Task<Void, Never>] = [:]
    private let visibleCap = 5

    func success(_ message: String) { push(.init(kind: .success, message: message)) }
    func error(_ message: String)   { push(.init(kind: .error, message: message)) }
    func info(_ message: String)    { push(.init(kind: .info, message: message)) }
    func offline(_ message: String) { push(.init(kind: .offline, message: message), ttlMS: nil) }

    func push(_ t: Toast, ttlMS: Int? = 4000) {
        toasts.append(t)
        if toasts.count > visibleCap {
            let drop = toasts.removeFirst()
            timers[drop.id]?.cancel()
            timers[drop.id] = nil
        }
        if let ttl = ttlMS {
            timers[t.id] = Task { [weak self] in
                try? await Task.sleep(nanoseconds: UInt64(ttl) * 1_000_000)
                guard !Task.isCancelled else { return }
                await MainActor.run { self?.dismiss(t.id) }
            }
        }
    }

    func dismiss(_ id: UUID) {
        toasts.removeAll { $0.id == id }
        timers[id]?.cancel()
        timers[id] = nil
    }
}
