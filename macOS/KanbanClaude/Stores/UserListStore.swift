import Foundation
import Combine

@MainActor
final class UserListStore: ObservableObject {
    static let shared = UserListStore()
    @Published private(set) var users: [User] = []
    @Published var loading = false

    func refresh() async {
        loading = true
        defer { loading = false }
        do {
            users = try await APIClient.shared.send(.listUsers, as: [User].self)
        } catch {
            ToastStore.shared.error("Couldn't load users: \(error.localizedDescription)")
        }
    }

    func name(for id: UUID) -> String? {
        users.first(where: { $0.id == id })?.name
    }

    func shortName(for id: UUID) -> String? {
        users.first(where: { $0.id == id })?.shortName
    }
}
