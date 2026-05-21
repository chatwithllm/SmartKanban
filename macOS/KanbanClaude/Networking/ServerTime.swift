import Foundation

// Tracks server clock skew vs local clock — mirrors web/src/api.ts behavior.
// Used for relative-time chips so an off-clock client doesn't show "in 2h".
@MainActor
enum ServerTime {
    private(set) static var skewSeconds: Double = 0

    private static let httpDate: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "GMT")
        f.dateFormat = "EEE, dd MMM yyyy HH:mm:ss zzz"
        return f
    }()

    static func captureSkew(from response: URLResponse?) {
        guard let http = response as? HTTPURLResponse,
              let value = http.value(forHTTPHeaderField: "Date"),
              let serverDate = httpDate.date(from: value) else { return }
        skewSeconds = serverDate.timeIntervalSince1970 - Date().timeIntervalSince1970
    }

    static func now() -> Date {
        Date(timeIntervalSinceNow: skewSeconds)
    }
}
