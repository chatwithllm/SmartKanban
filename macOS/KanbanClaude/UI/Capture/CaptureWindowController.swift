import AppKit
import SwiftUI

@MainActor
final class CaptureWindowController: NSWindowController {
    init(initialStatus: CardStatus) {
        let panel = NSPanel(
            contentRect: NSRect(x: 0, y: 0, width: 460, height: 240),
            styleMask: [.titled, .closable, .nonactivatingPanel, .fullSizeContentView],
            backing: .buffered, defer: false
        )
        panel.titlebarAppearsTransparent = true
        panel.title = "Capture card"
        panel.isFloatingPanel = true
        panel.level = .floating
        panel.becomesKeyOnlyIfNeeded = true
        panel.hidesOnDeactivate = false
        panel.center()
        super.init(window: panel)
        panel.contentView = NSHostingView(rootView: CaptureView(initialStatus: initialStatus, onClose: { [weak self] in
            self?.close()
        }))
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError() }
}
