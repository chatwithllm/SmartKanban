import SwiftUI
import UniformTypeIdentifiers

struct BoardColumnView: View {
    let status: CardStatus
    let cards: [Card]
    var onAdd: () -> Void = {}
    var onOpen: (Card) -> Void = { _ in }
    var onMove: (UUID, CardStatus, Int) -> Void = { _, _, _ in }

    @StateObject private var drag = DragStore.shared
    @State private var hoverIndex: Int?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            header
            ScrollView {
                LazyVStack(spacing: 10) {
                    if cards.isEmpty {
                        emptyDropZone
                    } else {
                        ForEach(Array(cards.enumerated()), id: \.element.id) { idx, card in
                            CardSlotView(idx: idx, hovered: hoverIndex == idx)
                                .frame(height: 4)
                                .onDrop(of: [.text], isTargeted: nil) { providers in
                                    handleDrop(providers, at: idx)
                                }
                            CardTileView(card: card) { onOpen(card) }
                                .onDrop(of: [.text], isTargeted: nil) { providers in
                                    handleDrop(providers, at: idx + 1)
                                }
                        }
                        // Trailing slot — drop at bottom of column.
                        CardSlotView(idx: cards.count, hovered: hoverIndex == cards.count)
                            .frame(height: 16)
                            .onDrop(of: [.text], isTargeted: nil) { providers in
                                handleDrop(providers, at: cards.count)
                            }
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
        .overlay(highlightRing)
        .onDrop(of: [.text], isTargeted: Binding(
            get: { drag.hoveredColumn == status },
            set: { isOver in if isOver { drag.hoveredColumn = status } else if drag.hoveredColumn == status { drag.hoveredColumn = nil } }
        )) { providers in
            handleDrop(providers, at: cards.count)
        }
    }

    private var emptyDropZone: some View {
        emptyState
            .padding(.top, 24)
            .frame(maxWidth: .infinity, minHeight: 120)
            .contentShape(Rectangle())
            .onDrop(of: [.text], isTargeted: nil) { providers in
                handleDrop(providers, at: 0)
            }
    }

    private var highlightRing: some View {
        RoundedRectangle(cornerRadius: 14, style: .continuous)
            .strokeBorder(drag.hoveredColumn == status ? dotColor.opacity(0.6) : .clear, lineWidth: 2)
            .padding(2)
    }

    private func handleDrop(_ providers: [NSItemProvider], at idx: Int) -> Bool {
        guard let provider = providers.first else { return false }
        let targetIdx = idx
        let targetStatus = status
        _ = provider.loadObject(ofClass: NSString.self) { obj, _ in
            guard let s = obj as? String, let id = UUID(uuidString: s) else { return }
            Task { @MainActor in
                drag.activeCardId = nil
                drag.hoveredColumn = nil
                onMove(id, targetStatus, targetIdx)
            }
        }
        return true
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
        case .backlog: return "Nothing here yet."
        case .today: return "Nothing planned for today."
        case .in_progress: return "Quiet here."
        case .done: return "Nothing finished yet."
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

private struct CardSlotView: View {
    let idx: Int
    let hovered: Bool
    var body: some View {
        Rectangle()
            .fill(hovered ? Tokens.violet.opacity(0.4) : .clear)
            .frame(maxWidth: .infinity)
    }
}
