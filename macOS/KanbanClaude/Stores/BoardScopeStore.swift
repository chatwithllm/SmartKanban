import Foundation
import Combine

@MainActor
final class BoardScopeStore: ObservableObject {
    static let shared = BoardScopeStore()

    @Published var scope: Scope {
        didSet {
            UserDefaults.standard.set(scope.rawValue, forKey: Constants.Defaults.lastScope)
        }
    }
    @Published var searchQuery: String = ""

    init() {
        let raw = UserDefaults.standard.string(forKey: Constants.Defaults.lastScope) ?? Scope.personal.rawValue
        self.scope = Scope(rawValue: raw) ?? .personal
    }
}

enum Section: String, CaseIterable, Identifiable, Sendable {
    case board, knowledge, archive
    var id: String { rawValue }
    var label: String { rawValue.capitalized }
}

@MainActor
final class SectionRouter: ObservableObject {
    static let shared = SectionRouter()
    @Published var section: Section = .board
}
