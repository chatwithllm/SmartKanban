import AppKit
import SwiftUI

@MainActor
final class KnowledgeDetailWindowController: NSWindowController {
    let knowledgeId: UUID

    init(item: KnowledgeItem) {
        self.knowledgeId = item.id
        let window = NSWindow(
            contentRect: NSRect(x: 220, y: 220, width: 580, height: 640),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.title = "Note"
        window.titlebarAppearsTransparent = true
        window.identifier = NSUserInterfaceItemIdentifier("knowledge-\(item.id.lowered)")
        window.setFrameAutosaveName("KanbanKnowledgeDetail.\(item.id.lowered)")
        window.center()
        super.init(window: window)
        window.delegate = self
        window.contentView = NSHostingView(rootView: KnowledgeDetailSheet(item: item, onClose: { [weak self] in
            self?.close()
        }))
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError() }
}

extension KnowledgeDetailWindowController: NSWindowDelegate {
    func windowWillClose(_ notification: Notification) {
        WindowCoordinator.shared.didCloseKnowledgeDetail(id: knowledgeId)
    }
}
