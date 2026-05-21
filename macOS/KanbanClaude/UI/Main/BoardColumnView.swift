import SwiftUI

struct BoardColumnView: View {
    let status: CardStatus
    let cards: [Card]
    var onAdd: () -> Void = {}
    var onOpen: (Card) -> Void = { _ in }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            header
            ScrollView {
                LazyVStack(spacing: 10) {
                    ForEach(cards) { card in
                        CardTileView(card: card) { onOpen(card) }
                    }
                    if cards.isEmpty {
                        emptyState
                            .padding(.top, 24)
                    }
                }
                .padding(.horizontal, 2)
                .padding(.bottom, 12)
            }
        }
        .padding(.horizontal, 10)
        .padding(.top, 8)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(columnBloom)
    }

    private var header: some View {
        HStack(spacing: 8) {
            Circle().fill(dotColor).frame(width: 8, height: 8)
            Text(status.label).font(.serif(13, weight: .semibold)).foregroundStyle(Tokens.ink)
            Text(String(format: "%02d", cards.count))
                .font(.mono(11, weight: .medium))
                .foregroundStyle(Tokens.ink3)
                .padding(.horizontal, 6).padding(.vertical, 2)
                .background(Tokens.ceramic).clipShape(Capsule())
            Spacer()
            Button(action: onAdd) {
                Image(systemName: "plus")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Tokens.ink2)
                    .padding(6)
                    .background(Tokens.canvas)
                    .clipShape(Circle())
                    .overlay(Circle().strokeBorder(Tokens.hairline, lineWidth: 1))
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 2)
        .overlay(alignment: .bottom) {
            LinearGradient(colors: [dotColor.opacity(0.6), .clear],
                           startPoint: .leading, endPoint: .trailing)
                .frame(height: 2)
                .offset(y: 6)
        }
    }

    private var dotColor: Color {
        switch status {
        case .backlog: return Tokens.pinBacklog
        case .today: return Tokens.pinToday
        case .in_progress: return Tokens.pinDoing
        case .done: return Tokens.pinDone
        }
    }

    private var emptyMessage: String {
        switch status {
        case .backlog: return "Idea graveyard — drop one to revive."
        case .today: return "Nothing planned for today."
        case .in_progress: return "Nothing in flight."
        case .done: return "Recently completed cards land here."
        }
    }

    private var emptyState: some View {
        Text(emptyMessage)
            .font(.sans(11))
            .foregroundStyle(Tokens.ink3)
            .frame(maxWidth: .infinity, alignment: .center)
            .multilineTextAlignment(.center)
    }

    private var columnBloom: some View {
        RadialGradient(colors: [dotColor.opacity(0.06), .clear],
                       center: .top, startRadius: 0, endRadius: 220)
    }
}
