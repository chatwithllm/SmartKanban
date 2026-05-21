import SwiftUI

struct NotificationsPopoverContent: View {
    @StateObject private var store = NotificationStore.shared
    var onClose: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("Notifications").font(.sans(13, weight: .semibold))
                Spacer()
                if store.unreadCount > 0 {
                    Button {
                        Task { await store.markAllRead() }
                    } label: {
                        Text("Mark all read")
                            .font(.sans(11, weight: .semibold))
                            .foregroundStyle(Tokens.violet)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 14).padding(.top, 12).padding(.bottom, 8)
            Divider()
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    if store.notifications.isEmpty {
                        VStack(spacing: 6) {
                            Image(systemName: "bell.slash")
                                .font(.system(size: 22))
                                .foregroundStyle(Tokens.ink3)
                            Text("No new notifications")
                                .font(.sans(12)).foregroundStyle(Tokens.ink3)
                        }
                        .padding(40)
                    } else {
                        ForEach(store.notifications.prefix(50)) { n in
                            NotificationRow(n: n) {
                                Task {
                                    await store.markRead(ids: [n.id])
                                    WindowCoordinator.shared.openEditCard(id: n.cardId)
                                    onClose()
                                }
                            }
                            Divider()
                        }
                    }
                }
            }
        }
        .frame(width: 380, height: 480)
        .background(Tokens.surface)
        .task { await store.refresh() }
    }
}

struct NotificationRow: View {
    let n: AppNotification
    var onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(alignment: .top, spacing: 10) {
                InitialsAvatar(userId: n.userId, name: n.actorName, size: 28)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(n.actorName).font(.sans(12, weight: .semibold)).foregroundStyle(Tokens.ink)
                        Spacer()
                        Text(rel(n.createdAt)).font(.mono(10)).foregroundStyle(Tokens.ink3)
                    }
                    Text(n.preview).font(.sans(12)).foregroundStyle(Tokens.ink2).lineLimit(2)
                }
            }
            .padding(.horizontal, 12).padding(.vertical, 10)
            .background(n.read ? Color.clear : Tokens.violetTint)
            .overlay(alignment: .leading) {
                Rectangle().fill(n.read ? Color.clear : Tokens.violet).frame(width: 3)
            }
        }
        .buttonStyle(.plain)
    }

    private static let fmt: RelativeDateTimeFormatter = {
        let f = RelativeDateTimeFormatter()
        f.unitsStyle = .short
        return f
    }()
    private func rel(_ d: Date) -> String { Self.fmt.localizedString(for: d, relativeTo: ServerTime.now()) }
}
