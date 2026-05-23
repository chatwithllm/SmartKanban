import SwiftUI

struct KnowledgeRowView: View {
    let item: KnowledgeItem

    var body: some View {
        CardSurface {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 6) {
                    Text(item.url != nil ? "🔗 \(item.title)" : item.title)
                        .font(.serif(15, weight: .semibold))
                        .foregroundStyle(Tokens.ink)
                        .lineLimit(2)
                    Spacer()
                    Image(systemName: visibilityIcon)
                        .font(.system(size: 10))
                        .foregroundStyle(Tokens.ink3)
                }
                if let url = item.url {
                    Text(URL(string: url)?.host ?? url)
                        .font(.mono(10))
                        .foregroundStyle(Tokens.greenAccent)
                        .lineLimit(1)
                }
                if !item.body.isEmpty {
                    Text(item.body)
                        .font(.sans(12))
                        .foregroundStyle(Tokens.ink2)
                        .lineLimit(3)
                }
                HStack(spacing: 4) {
                    ForEach(item.tags.prefix(3), id: \.self) { tag in
                        TagChip(tag: tag)
                    }
                    if let linkedCount = item.linkedCardIds?.count, linkedCount > 0 {
                        Label("\(linkedCount)", systemImage: "paperclip")
                            .labelStyle(.titleAndIcon)
                            .font(.sans(11))
                            .foregroundStyle(Tokens.ink3)
                    }
                    Spacer()
                    fetchChip
                }
            }
            .padding(12)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var visibilityIcon: String {
        switch item.visibility {
        case .private: return "lock"
        case .inbox: return "tray"
        case .shared: return "person.2"
        }
    }

    @ViewBuilder private var fetchChip: some View {
        switch item.fetchStatus {
        case .pending: Text("⏳").font(.system(size: 11))
        case .ok: Text("✓").font(.system(size: 11)).foregroundStyle(Tokens.greenAccent)
        case .failed: Text("⚠").font(.system(size: 11)).foregroundStyle(Tokens.danger)
        case .skipped, nil: EmptyView()
        }
    }
}
