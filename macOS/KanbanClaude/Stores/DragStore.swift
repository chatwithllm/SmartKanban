import Foundation
import Combine

@MainActor
final class DragStore: ObservableObject {
    static let shared = DragStore()
    @Published var activeCardId: UUID?
    @Published var hoveredColumn: CardStatus?

    var isDragging: Bool { activeCardId != nil }
}

enum DragPositionCalculator {
    /// Compute a fractional position that places the card at the given index in
    /// the column's existing list. Mirrors web Board.tsx onDragEnd math:
    ///   - empty column:                  return 0
    ///   - drop at top (insertIdx == 0):  before - 1
    ///   - drop at bottom (== count):     after + 1
    ///   - drop between siblings:         (before + after) / 2
    static func position(for cards: [Card], at insertIdx: Int) -> Double {
        if cards.isEmpty { return 0 }
        let clamped = max(0, min(insertIdx, cards.count))
        if clamped == 0 { return cards[0].position - 1 }
        if clamped == cards.count { return cards[cards.count - 1].position + 1 }
        let before = cards[clamped - 1].position
        let after = cards[clamped].position
        return (before + after) / 2
    }
}
