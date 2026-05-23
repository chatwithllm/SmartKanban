import AppKit
import SwiftUI

@MainActor
final class ThemeManager: ObservableObject {
    static let shared = ThemeManager()

    enum Mode: String, CaseIterable, Identifiable {
        case system, light, dark
        var id: String { rawValue }
        var label: String { rawValue.capitalized }
    }

    @Published var mode: Mode {
        didSet {
            UserDefaults.standard.set(mode.rawValue, forKey: Constants.Defaults.theme)
            apply()
        }
    }

    private init() {
        let raw = UserDefaults.standard.string(forKey: Constants.Defaults.theme) ?? Mode.system.rawValue
        self.mode = Mode(rawValue: raw) ?? .system
    }

    func apply() {
        let appearance: NSAppearance? = {
            switch mode {
            case .system: return nil
            case .light: return NSAppearance(named: .aqua)
            case .dark: return NSAppearance(named: .darkAqua)
            }
        }()
        NSApp.appearance = appearance
    }
}
