import SwiftUI

struct CardTileView: View {
    let card: Card
    var onOpen: () -> Void = {}

    @StateObject private var insights = InsightStore.shared
    @StateObject private var unread = UnreadStore.shared
    @StateObject private var users = UserListStore.shared
    @StateObject private var drag = DragStore.shared
    @State private var hover = false

    private var isDraggingSelf: Bool { drag.activeCardId == card.id }

    var body: some View {
        Button(action: onOpen) {
            CardSurface {
                content
                    .padding(12)
            }
        }
        .buttonStyle(.plain)
        .overlay(accent, alignment: .leading)
        .scaleEffect(hover && !drag.isDragging ? 1.005 : 1.0)
        .shadow(color: hover ? Tokens.violet.opacity(0.06) : .clear, radius: 6, y: 2)
        .opacity(isDraggingSelf ? 0.4 : 1.0)
        .onHover { hover = $0 }
        .animation(.spring(response: 0.28, dampingFraction: 0.85), value: hover)
        .onDrag {
            drag.activeCardId = card.id
            return NSItemProvider(object: card.id.uuidString as NSString)
        }
    }

    private var accent: some View {
        RoundedRectangle(cornerRadius: 4, style: .continuous)
            .fill(accentColor)
            .frame(width: 4)
            .padding(.vertical, 6)
            .padding(.leading, 0)
    }

    private var accentColor: Color {
        switch card.status {
        case .backlog: return Tokens.pinBacklog
        case .today: return Tokens.pinToday
        case .in_progress: return Tokens.pinDoing
        case .done: return Tokens.pinDone
        }
    }

    @ViewBuilder private var content: some View {
        let badge = SourceBadge(
            source: card.source,
            aiSummarized: card.aiSummarized,
            needsReview: card.needsReview,
            insightStatus: insights.latest(cardId: card.id)?.status
        )
        VStack(alignment: .leading, spacing: 6) {
            if badge.hasContent { badge }
            Text(card.title.isEmpty ? "Untitled" : card.title)
                .font(.serif(15, weight: .semibold))
                .foregroundStyle(Tokens.ink)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
            if !card.description.isEmpty {
                Text(card.description)
                    .font(.sans(12.5))
                    .foregroundStyle(Tokens.ink2)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
            }
            if let summary = insights.latest(cardId: card.id)?.summary, !summary.isEmpty,
               insights.latest(cardId: card.id)?.status == .ok {
                Text("✨ \(summary)")
                    .font(.sans(11))
                    .foregroundStyle(Tokens.violet)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
            }
            if !card.tags.isEmpty {
                HStack(spacing: 4) {
                    ForEach(card.tags.prefix(4), id: \.self) { TagChip(tag: $0) }
                    if card.tags.count > 4 {
                        Text("+\(card.tags.count - 4)").font(.mono(10)).foregroundStyle(Tokens.ink3)
                    }
                }
            }
            let thumbs = card.attachments.filter { $0.kind == .image }
            if !thumbs.isEmpty {
                thumbnailStrip(images: thumbs)
            }
            footer
        }
        .padding(.leading, 4)
    }

    private func thumbnailStrip(images: [Attachment]) -> some View {
        HStack(spacing: 4) {
            ForEach(Array(images.prefix(3).enumerated()), id: \.element.id) { idx, att in
                ZStack {
                    AuthenticatedImage(storagePath: att.storagePath)
                        .frame(height: 56)
                        .frame(maxWidth: .infinity)
                        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                    if idx == 2, images.count > 3 {
                        RoundedRectangle(cornerRadius: 6, style: .continuous)
                            .fill(.black.opacity(0.4))
                        Text("+\(images.count - 3)")
                            .font(.sans(11, weight: .semibold))
                            .foregroundStyle(.white)
                    }
                }
            }
        }
    }

    private var footer: some View {
        HStack(spacing: 6) {
            DueDateChip(dueDate: card.dueDate)
            let nonImage = card.attachments.filter { $0.kind != .image }.count
            if nonImage > 0 {
                Label("\(nonImage)", systemImage: "paperclip")
                    .labelStyle(.titleAndIcon)
                    .font(.mono(10))
                    .foregroundStyle(Tokens.ink3)
            }
            let count = unread.counts[card.id] ?? 0
            if count > 0 {
                Label("\(count)", systemImage: "bubble.left.fill")
                    .labelStyle(.titleAndIcon)
                    .font(.mono(10, weight: .semibold))
                    .foregroundStyle(Tokens.violet)
            }
            Spacer()
            if !card.assignees.isEmpty {
                HStack(spacing: -6) {
                    ForEach(Array(card.assignees.prefix(3)), id: \.self) { uid in
                        InitialsAvatar(userId: uid, name: users.shortName(for: uid), size: 20)
                    }
                }
            }
            if !card.shares.isEmpty {
                ShareAvatar(size: 20)
            }
        }
    }
}
