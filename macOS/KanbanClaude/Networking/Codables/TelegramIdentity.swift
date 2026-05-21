import Foundation

struct TelegramIdentity: Codable, Hashable, Identifiable, Sendable {
    var id: Int64 { telegramUserId }
    let telegramUserId: Int64
    let appUserId: UUID
    let telegramUsername: String?

    enum CodingKeys: String, CodingKey {
        case telegramUserId = "telegram_user_id"
        case appUserId = "app_user_id"
        case telegramUsername = "telegram_username"
    }
}
