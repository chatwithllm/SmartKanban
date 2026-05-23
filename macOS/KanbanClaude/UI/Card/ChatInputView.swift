import SwiftUI

struct ChatInputView: View {
    let cardId: UUID
    var onSent: (CardEvent) -> Void = { _ in }

    @State private var text: String = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                TextField("Message… (type @ai to ask the assistant)", text: $text)
                    .textFieldStyle(.plain)
                    .font(.sans(13))
                    .padding(.vertical, 6).padding(.horizontal, 10)
                    .background(Tokens.surface)
                    .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Tokens.hairline, lineWidth: 1))
                    .onSubmit { send() }
                Button {
                    send()
                } label: {
                    Image(systemName: "paperplane.fill")
                        .font(.system(size: 12))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 10).padding(.vertical, 7)
                        .background(Tokens.greenAccent)
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
                .disabled(busy || text.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            if let err = error {
                Text(err).font(.sans(10)).foregroundStyle(Tokens.danger)
            }
        }
    }

    private func send() {
        let trimmed = text.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty, trimmed.count <= 2000, !busy else { return }
        busy = true; error = nil
        Task {
            defer { busy = false }
            do {
                let event = try await APIClient.shared.send(
                    .postMessage(cardId: cardId, content: trimmed),
                    as: CardEvent.self
                )
                onSent(event)
                text = ""
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}
