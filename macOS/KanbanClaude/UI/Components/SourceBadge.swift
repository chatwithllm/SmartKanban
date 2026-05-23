import SwiftUI

struct SourceBadge: View {
    let source: CardSource
    let aiSummarized: Bool
    let needsReview: Bool
    let insightStatus: InsightStatus?

    var body: some View {
        HStack(spacing: 6) {
            if source == .telegram {
                Label("telegram", systemImage: "paperplane.fill")
                    .labelStyle(.titleAndIcon)
                    .font(.mono(10))
                    .foregroundStyle(Tokens.ink3)
            }
            if aiSummarized {
                Text("✦ ai").font(.mono(10, weight: .semibold)).foregroundStyle(Tokens.violet)
            }
            if needsReview {
                Text("needs review").font(.mono(10, weight: .semibold)).foregroundStyle(Tokens.danger)
            }
            if insightStatus == .pending {
                Text("🤔").font(.system(size: 11))
            } else if insightStatus == .ok {
                Text("✨").font(.system(size: 11))
            }
        }
    }

    var hasContent: Bool {
        source == .telegram || aiSummarized || needsReview || insightStatus == .pending || insightStatus == .ok
    }
}
