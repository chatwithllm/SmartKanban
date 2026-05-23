import SwiftUI
import AppKit

struct MainView: View {
    @StateObject private var auth = AuthStore.shared
    @StateObject private var scope = BoardScopeStore.shared
    @StateObject private var section = SectionRouter.shared
    @StateObject private var unread = UnreadStore.shared

    @State private var showArchive = false
    @State private var showReview = false

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
                Color.clear.onAppear {
                    showArchive = true
                    section.section = .board
                }
            }
        }
        .toolbar {
            BoardToolbar(
                scope: scope,
                section: section,
                auth: auth,
                unread: unread,
                onCapture: { WindowCoordinator.shared.openCapture(initialStatus: .today) },
                onOpenSettings: { SettingsOpener.open() },
                onOpenNotifications: { WindowCoordinator.shared.openNotificationsPopover() },
                onOpenWeeklyReview: { showReview = true }
            )
        }
        .background(Tokens.canvas)
        .sheet(isPresented: $showArchive) {
            ArchiveSheet { showArchive = false }
        }
        .sheet(isPresented: $showReview) {
            WeeklyReviewSheet { showReview = false }
        }
    }
}

