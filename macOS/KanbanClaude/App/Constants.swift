import Foundation

enum Constants {
    static let bundleID = "com.kanbanclaude.kanbanclaude"
    static let appName = "SmartKanban"
    static let urlScheme = "kanbanclaude"
    static let keychainService = bundleID
    static let keychainTokenAccount = "kanban_session"

    #if DEBUG
    static let baseURL = URL(string: "http://localhost:3001")!
    #else
    static let baseURL = URL(string: "https://kanban.npalakurla.com")!
    #endif

    static var serverURL: URL {
        if let override = UserDefaults.standard.string(forKey: "serverURL"),
           let url = URL(string: override) {
            return url
        }
        return baseURL
    }

    static var wsURL: URL {
        var comps = URLComponents(url: serverURL, resolvingAgainstBaseURL: false)!
        comps.scheme = (comps.scheme == "https") ? "wss" : "ws"
        comps.path = "/ws"
        return comps.url!
    }

    static let appVersion: String = {
        let v = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.0.0"
        let b = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "0"
        return "\(v) (\(b))"
    }()

    enum Defaults {
        static let theme = "theme"
        static let lastScope = "lastScope"
        static let lastUserJSON = "lastUserJSON"
        static let weatherCache = "weather_cache"
        static let hideDockIcon = "hideDockIcon"
        static let startAtLogin = "startAtLogin"
        static let showInMenuBar = "showInMenuBar"
    }
}
