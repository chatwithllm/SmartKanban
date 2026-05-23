import SwiftUI
import UniformTypeIdentifiers

struct TrashDropZoneOverlay: View {
    @ObservedObject var drag: DragStore
    var onArchive: (UUID) -> Void

    @State private var isOver = false

    var body: some View {
        Group {
            if drag.isDragging {
                ZStack {
                    Circle()
                        .fill(isOver ? Tokens.danger : Tokens.violet)
                        .opacity(isOver ? 1 : 0.85)
                    Image(systemName: "trash")
                        .font(.system(size: isOver ? 22 : 18, weight: .semibold))
                        .foregroundStyle(.white)
                }
                .frame(width: isOver ? 60 : 48, height: isOver ? 60 : 48)
                .shadow(color: .black.opacity(0.25), radius: 12, y: 6)
                .padding(20)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
                .onDrop(of: [.text], isTargeted: $isOver) { providers in
                    handleDrop(providers)
                }
                .transition(.scale(scale: 0.6).combined(with: .opacity))
                .animation(.spring(response: 0.25, dampingFraction: 0.85), value: isOver)
            }
        }
        .animation(.easeOut(duration: 0.2), value: drag.isDragging)
    }

    private func handleDrop(_ providers: [NSItemProvider]) -> Bool {
        guard let provider = providers.first else { return false }
        _ = provider.loadObject(ofClass: NSString.self) { obj, _ in
            guard let s = obj as? String, let id = UUID(uuidString: s) else { return }
            Task { @MainActor in onArchive(id) }
        }
        return true
    }
}
