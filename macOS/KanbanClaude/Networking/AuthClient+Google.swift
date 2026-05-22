import AppKit
import Foundation

extension APIClient {
    /// Opens the system browser at /api/auth/google/start?return=macos.
    /// The server eventually redirects to kanbanclaude://auth?ticket=... which
    /// URLSchemeHandler picks up.
    func openGoogleSignIn() {
        var comps = URLComponents(url: baseURL.appendingPathComponent("api/auth/google/start"), resolvingAgainstBaseURL: false)!
        comps.queryItems = [URLQueryItem(name: "return", value: "macos")]
        guard let url = comps.url else { return }
        NSWorkspace.shared.open(url)
    }
}
