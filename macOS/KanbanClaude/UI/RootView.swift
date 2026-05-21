import SwiftUI

struct RootView: View {
    var body: some View {
        VStack(spacing: 16) {
            Text("KanbanClaude")
                .font(.serif(28, weight: .semibold))
            Text("Phase 0 scaffold — health check window.")
                .font(.sans(14))
                .foregroundStyle(Tokens.ink2)
        }
        .padding(40)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Tokens.canvas)
    }
}
