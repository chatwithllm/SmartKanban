import AppKit
import Foundation
import os

@MainActor
final class GlobalKeyMonitor {
    static let shared = GlobalKeyMonitor()
    private static let log = Logger(subsystem: Constants.bundleID, category: "keyboard")

    private var monitor: Any?

    static let focusSearch = Notification.Name("kanbanclaude.focus.search")
    static let escClearSearch = Notification.Name("kanbanclaude.esc.clearSearch")
    static let scrollToColumn = Notification.Name("kanbanclaude.scrollToColumn")
    static let scrollToColumnKey = "status"

    func install() {
        guard monitor == nil else { return }
        monitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            self?.handle(event) ?? event
        }
    }

    private func handle(_ event: NSEvent) -> NSEvent? {
        let mods = event.modifierFlags.intersection(NSEvent.ModifierFlags.deviceIndependentFlagsMask)
        let chars = event.charactersIgnoringModifiers ?? ""
        let inText = isEditingText()

        if mods.contains(NSEvent.ModifierFlags.command) && chars.lowercased() == "v" && !inText {
            if handlePasteImage() { return nil }
        }

        if mods.contains(NSEvent.ModifierFlags.command) && chars.lowercased() == "k" {
            NotificationCenter.default.post(name: Self.focusSearch, object: nil)
            return nil
        }

        let plain = mods.subtracting([NSEvent.ModifierFlags.numericPad, NSEvent.ModifierFlags.function]).isEmpty
        if plain && !inText {
            if chars == "/" {
                NotificationCenter.default.post(name: Self.focusSearch, object: nil)
                return nil
            }
            if chars == "n" {
                WindowCoordinator.shared.openCapture(initialStatus: .backlog)
                return nil
            }
            if let digit = Int(chars), (1...4).contains(digit) {
                let statuses: [CardStatus] = [.backlog, .today, .in_progress, .done]
                let status = statuses[digit - 1]
                NotificationCenter.default.post(name: Self.scrollToColumn, object: nil, userInfo: [Self.scrollToColumnKey: status])
                return nil
            }
        }

        return event
    }

    private func isEditingText() -> Bool {
        guard let win = NSApp.keyWindow else { return false }
        let responder = win.firstResponder
        if responder is NSTextView { return true }
        if let tf = responder as? NSText, tf.isEditable { return true }
        // SwiftUI TextField/SecureField backs onto NSTextView via fieldEditor.
        if win.fieldEditor(false, for: nil) === responder { return true }
        return false
    }

    private func handlePasteImage() -> Bool {
        let pb = NSPasteboard.general
        guard let img = pb.readObjects(forClasses: [NSImage.self], options: nil)?.first as? NSImage,
              let tiff = img.tiffRepresentation,
              let data = NSBitmapImageRep(data: tiff)?.representation(using: .png, properties: [:]) else {
            return false
        }
        let frontmostEditCardId: UUID? = {
            for (id, controller) in WindowCoordinator.shared.editCardControllers {
                if controller.window?.isKeyWindow == true { return id }
            }
            return nil
        }()
        if let cid = frontmostEditCardId {
            Task { await CardStore.shared.attachImageData(cardId: cid, data: data, mime: "image/png") }
        } else {
            Task { _ = await CardStore.shared.createFromImageData(data: data, mime: "image/png", status: .today) }
        }
        return true
    }
}
