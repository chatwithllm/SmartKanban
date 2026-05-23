import Foundation
import Combine

@MainActor
final class NotificationStore: ObservableObject {
    static let shared = NotificationStore()
    @Published private(set) var notifications: [AppNotification] = []
    private var wsSub: UUID?

    init() {
        wsSub = WebSocketClient.shared.subscribe { [weak self] _ in
            Task { @MainActor in await self?.refresh() }
        }
    }

    var unreadCount: Int { notifications.filter { !$0.read }.count }

    func refresh() async {
        do {
            notifications = try await APIClient.shared.send(.listNotifications, as: [AppNotification].self)
        } catch {
            // soft
        }
    }

    func markRead(ids: [Int]) async {
        for i in ids {
            if let idx = notifications.firstIndex(where: { $0.id == i }) {
                notifications[idx].read = true
            }
        }
        do {
            try await APIClient.shared.sendVoid(.markNotificationsRead(ids: ids))
        } catch {
            // soft
        }
    }

    func markAllRead() async {
        for i in 0..<notifications.count { notifications[i].read = true }
        do {
            try await APIClient.shared.sendVoid(.markAllNotificationsRead)
        } catch {
            // soft
        }
    }
}
