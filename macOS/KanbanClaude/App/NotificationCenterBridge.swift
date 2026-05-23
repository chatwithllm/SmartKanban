import AppKit
import UserNotifications
import os

@MainActor
final class NotificationCenterBridge: NSObject, UNUserNotificationCenterDelegate {
    static let shared = NotificationCenterBridge()
    private let log = Logger(subsystem: Constants.bundleID, category: "notif")
    private var wsSub: UUID?

    func attach() {
        UNUserNotificationCenter.current().delegate = self
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { granted, err in
            if let err { Logger(subsystem: Constants.bundleID, category: "notif").error("auth: \(err.localizedDescription, privacy: .public)") }
        }
        wsSub = WebSocketClient.shared.subscribe { [weak self] ev in self?.apply(ev) }
    }

    private func apply(_ ev: BroadcastEvent) {
        switch ev {
        case .cardMessage(let event, let cardId, let card),
             .cardAiResponse(let event, let cardId, let card):
            // Don't notify if the EditCard window for this id is key.
            if let win = WindowCoordinator.shared.editWindow(id: cardId), win.isKeyWindow { return }
            // Don't notify on own messages.
            if event.actorId == AuthStore.shared.currentUser?.id { return }
            schedule(card: card, event: event)
        default:
            break
        }
    }

    private func schedule(card: Card, event: CardEvent) {
        let content = UNMutableNotificationContent()
        content.title = card.title.isEmpty ? "New activity" : card.title
        content.body = (event.content ?? "").prefix(120).description
        content.sound = .default
        content.userInfo = ["cardId": card.id.uuidString]
        let req = UNNotificationRequest(
            identifier: "card-\(card.id.lowered)-\(event.id)",
            content: content,
            trigger: nil
        )
        UNUserNotificationCenter.current().add(req)
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter,
                                            willPresent notification: UNNotification) async
        -> UNNotificationPresentationOptions {
        [.banner, .sound, .badge]
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter,
                                            didReceive response: UNNotificationResponse) async {
        let info = response.notification.request.content.userInfo
        if let s = info["cardId"] as? String, let id = UUID(uuidString: s) {
            await MainActor.run { WindowCoordinator.shared.openEditCard(id: id) }
        }
    }
}
