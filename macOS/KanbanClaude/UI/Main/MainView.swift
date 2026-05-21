import SwiftUI
import AppKit

struct MainView: View {
    @StateObject private var auth = AuthStore.shared
    @StateObject private var scope = BoardScopeStore.shared
    @StateObject private var section = SectionRouter.shared
    @StateObject private var unread = UnreadStore.shared

    var body: some View {
        Group {
            switch section.section {
            case .board:
                BoardView(
                    onOpenCard: { id in WindowCoordinator.shared.openEditCard(id: id) },
                    onCreateCard: { status in WindowCoordinator.shared.openCapture(initialStatus: status) }
                )
            case .knowledge:
                KnowledgeListView()
            case .archive:
                ArchivePlaceholderView()
            }
        }
        .toolbar {
            BoardToolbar(
                scope: scope,
                section: section,
                auth: auth,
                unread: unread,
                onCapture: { WindowCoordinator.shared.openCapture(initialStatus: .today) },
                onOpenSettings: { NSApp.sendAction(Selector(("showPreferencesWindow:")), to: nil, from: nil) },
                onOpenNotifications: { WindowCoordinator.shared.openNotificationsPopover() },
                onOpenWeeklyReview: { WindowCoordinator.shared.openWeeklyReview() }
            )
        }
        .background(Tokens.canvas)
    }
}

// Placeholder for Phase 8 archive sheet hook.
struct ArchivePlaceholderView: View {
    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: "archivebox").font(.system(size: 32)).foregroundStyle(Tokens.ink3)
            Text("Archive opens as a sheet — coming in Phase 8.")
                .font(.sans(13)).foregroundStyle(Tokens.ink2)
            PillButton(title: "Back to board", variant: .ghost) {
                SectionRouter.shared.section = .board
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Tokens.canvas)
    }
}
