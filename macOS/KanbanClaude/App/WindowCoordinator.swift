import AppKit
import SwiftUI

@MainActor
final class WindowCoordinator {
    static let shared = WindowCoordinator()

    // EditCard window pool keyed by card id (Phase 4d will fill in).
    private(set) var editCardControllers: [UUID: NSWindowController] = [:]
    private var captureController: NSWindowController?
    private var notificationsPopover: NSPopover?

    func openEditCard(id: UUID) {
        // Phase 4d fully implements EditCardWindowController. For Phase 4a we
        // surface a hint so clicks don't no-op invisibly.
        ToastStore.shared.info("Card editor lands in Phase 4d")
    }

    func openCapture(initialStatus: CardStatus) {
        ToastStore.shared.info("Capture panel lands in Phase 4e (\(initialStatus.label))")
    }

    func openWeeklyReview() {
        ToastStore.shared.info("Weekly Review lands in Phase 8")
    }

    func openNotificationsPopover() {
        ToastStore.shared.info("Notification bell popover lands in Phase 7")
    }

    func closeEditCard(id: UUID) {
        editCardControllers[id]?.close()
        editCardControllers[id] = nil
    }
}
