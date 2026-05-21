import SwiftUI

// Phase 7 expands this with full CRUD. Phase 4a only needs a placeholder so the
// section switcher in BoardToolbar resolves.
struct KnowledgeListView: View {
    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: "books.vertical").font(.system(size: 32)).foregroundStyle(Tokens.greenAccent)
            Text("Knowledge view lands in Phase 7.").font(.sans(13)).foregroundStyle(Tokens.ink2)
            PillButton(title: "Back to board", variant: .ghost) {
                SectionRouter.shared.section = .board
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Tokens.canvas)
    }
}
