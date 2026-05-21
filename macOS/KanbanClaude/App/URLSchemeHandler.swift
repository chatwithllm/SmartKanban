import AppKit
import os

@MainActor
final class URLSchemeHandler {
    static let shared = URLSchemeHandler()
    private let log = Logger(subsystem: Constants.bundleID, category: "deeplink")

    func install() {
        NSAppleEventManager.shared().setEventHandler(
            self,
            andSelector: #selector(handle(event:replyEvent:)),
            forEventClass: AEEventClass(kInternetEventClass),
            andEventID: AEEventID(kAEGetURL)
        )
    }

    @objc private func handle(event: NSAppleEventDescriptor, replyEvent: NSAppleEventDescriptor) {
        guard let urlString = event.paramDescriptor(forKeyword: AEKeyword(keyDirectObject))?.stringValue,
              let url = URL(string: urlString),
              url.scheme == Constants.urlScheme else { return }
        log.info("deeplink \(urlString, privacy: .public)")
        route(url: url)
    }

    private func route(url: URL) {
        // kanbanclaude://card/<uuid>
        let comps = url.pathComponents.filter { $0 != "/" }
        if url.host == "card", let first = comps.first, let id = UUID(uuidString: first) {
            WindowCoordinator.shared.openEditCard(id: id)
            return
        }
        if url.host == "capture" {
            WindowCoordinator.shared.openCapture(initialStatus: .today)
            return
        }
        ToastStore.shared.info("Unhandled deep link: \(url.absoluteString)")
    }
}
