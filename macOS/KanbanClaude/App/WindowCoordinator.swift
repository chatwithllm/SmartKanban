import AppKit
import SwiftUI

@MainActor
final class WindowCoordinator {
    static let shared = WindowCoordinator()

    // EditCard window pool keyed by card id (Phase 4d will fill in).
    private(set) var editCardControllers: [UUID: NSWindowController] = [:]
    private var captureController: NSWindowController?
    private var notificationsPopover: NSPopover?
    private(set) var knowledgeDetailControllers: [UUID: NSWindowController] = [:]

    func editWindow(id: UUID) -> NSWindow? {
        editCardControllers[id]?.window
    }

    func openEditCard(id: UUID) {
        if let existing = editCardControllers[id] {
            existing.window?.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }
        let controller = EditCardWindowController(cardId: id)
        editCardControllers[id] = controller
        controller.showWindow(nil)
        controller.window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func didCloseEditCard(id: UUID) {
        editCardControllers[id] = nil
    }

    func openCapture(initialStatus: CardStatus) {
        if let existing = captureController, existing.window?.isVisible == true {
            existing.window?.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }
        let controller = CaptureWindowController(initialStatus: initialStatus)
        captureController = controller
        controller.showWindow(nil)
        controller.window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func openKnowledgeDetail(id: UUID) {
        if let existing = knowledgeDetailControllers[id] {
            existing.window?.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }
        Task { @MainActor in
            var item = KnowledgeStore.shared.items.first(where: { $0.id == id })
            if item == nil {
                await KnowledgeStore.shared.refresh()
                item = KnowledgeStore.shared.items.first(where: { $0.id == id })
            }
            guard let resolved = item else {
                ToastStore.shared.error("Knowledge note not found")
                return
            }
            let controller = KnowledgeDetailWindowController(item: resolved)
            knowledgeDetailControllers[id] = controller
            controller.showWindow(nil)
            controller.window?.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
        }
    }

    func didCloseKnowledgeDetail(id: UUID) {
        knowledgeDetailControllers[id] = nil
    }

    func openNotificationsPopover() {
        // Popover state is owned by the bell button itself. Nothing to do here.
    }

    func closeEditCard(id: UUID) {
        editCardControllers[id]?.close()
        editCardControllers[id] = nil
    }
}
