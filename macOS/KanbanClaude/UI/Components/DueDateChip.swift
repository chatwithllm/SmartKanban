import SwiftUI

struct DueDateChip: View {
    let dueDate: String?     // "YYYY-MM-DD"

    private static let isoDate: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = TimeZone(secondsFromGMT: 0)
        return f
    }()
    private static let prettyDate: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .medium
        f.timeStyle = .none
        return f
    }()

    var body: some View {
        guard let parsed = parsed() else { return AnyView(EmptyView()) }
        return AnyView(
            HStack(spacing: 4) {
                Circle().fill(parsed.tone).frame(width: 5, height: 5)
                Text(parsed.label).font(.mono(10, weight: .medium))
            }
            .foregroundStyle(parsed.tone)
            .padding(.horizontal, 6).padding(.vertical, 2)
            .background(parsed.tone.opacity(0.12))
            .clipShape(Capsule(style: .continuous))
        )
    }

    private struct Parsed { let label: String; let tone: Color }

    private func parsed() -> Parsed? {
        guard let dueDate, let d = Self.isoDate.date(from: dueDate) else { return nil }
        let cal = Calendar(identifier: .gregorian)
        let today = cal.startOfDay(for: ServerTime.now())
        let due = cal.startOfDay(for: d)
        let days = cal.dateComponents([.day], from: today, to: due).day ?? 0
        let tone: Color
        let label: String
        switch days {
        case -1:
            tone = Tokens.danger
            label = "Yesterday"
        case ..<0:
            tone = Tokens.danger
            label = "\(-days)d overdue"
        case 0:
            tone = Tokens.violet
            label = "Today"
        case 1:
            tone = Tokens.violet
            label = "Tomorrow"
        case 2...7:
            tone = Tokens.gold
            label = "In \(days)d"
        default:
            tone = Tokens.ink3
            label = Self.prettyDate.string(from: due)
        }
        return Parsed(label: label, tone: tone)
    }
}
