import Foundation

struct AuthConfig: Codable, Sendable {
    let googleEnabled: Bool
    let openSignup: Bool

    enum CodingKeys: String, CodingKey {
        case googleEnabled = "google_enabled"
        case openSignup = "open_signup"
    }
}
