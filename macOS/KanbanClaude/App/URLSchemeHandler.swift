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

    /// Called from the SwiftUI `.onOpenURL` modifier (belt-and-suspenders alongside NSAppleEventManager).
    func handle(_ url: URL) {
        guard url.scheme == Constants.urlScheme else { return }
        log.info("onOpenURL \(url.absoluteString, privacy: .public)")
        route(url: url)
    }

    private func route(url: URL) {
        // kanbanclaude://auth?ticket=<token>
        if url.host == "auth" {
            guard let comps = URLComponents(url: url, resolvingAgainstBaseURL: false),
                  let ticket = comps.queryItems?.first(where: { $0.name == "ticket" })?.value,
                  !ticket.isEmpty
            else {
                ToastStore.shared.error("Sign-in link was missing the ticket.")
                return
            }
            Task {
                do {
                    try await AuthStore.shared.loginWithTicket(ticket)
                } catch {
                    log.error("ticket exchange failed: \(error.localizedDescription, privacy: .public)")
                    ToastStore.shared.error("Sign-in expired — try again from the app.")
                }
            }
            return
        }

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
