import AppKit
import SwiftUI

@MainActor
final class EditCardWindowController: NSWindowController {
    let cardId: UUID

    init(cardId: UUID) {
        self.cardId = cardId
        let window = NSWindow(
            contentRect: NSRect(x: 200, y: 200, width: 620, height: 700),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.title = "Edit card"
        window.titlebarAppearsTransparent = true
        window.identifier = NSUserInterfaceItemIdentifier("edit-\(cardId.lowered)")
        window.setFrameAutosaveName("KanbanEditCard.\(cardId.lowered)")
        window.center()
        super.init(window: window)
        window.delegate = self
        window.contentView = NSHostingView(rootView: EditCardView(cardId: cardId, onClose: { [weak self] in
            self?.close()
        }))
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError() }
}

extension EditCardWindowController: NSWindowDelegate {
    func windowWillClose(_ notification: Notification) {
        WindowCoordinator.shared.didCloseEditCard(id: cardId)
    }
}
