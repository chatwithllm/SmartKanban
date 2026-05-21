import SwiftUI

struct CaptureView: View {
    let initialStatus: CardStatus
    var onClose: () -> Void

    @State private var title: String = ""
    @State private var description: String = ""
    @State private var status: CardStatus
    @State private var busy = false
    @FocusState private var focused: Bool

    init(initialStatus: CardStatus, onClose: @escaping () -> Void) {
        self.initialStatus = initialStatus
        self.onClose = onClose
        _status = State(initialValue: initialStatus)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("New card").font(.serif(15, weight: .semibold))
                Spacer()
                Picker("", selection: $status) {
                    ForEach(CardStatus.allCases, id: \.self) { Text($0.label).tag($0) }
                }
                .pickerStyle(.menu)
                .labelsHidden()
                .frame(width: 140)
            }
            TextField("Title", text: $title)
                .textFieldStyle(.plain)
                .font(.serif(16, weight: .semibold))
                .padding(.vertical, 6).padding(.horizontal, 8)
                .background(Tokens.surface)
                .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Tokens.hairline, lineWidth: 1))
                .focused($focused)
                .onSubmit { submit() }
            TextEditor(text: $description)
                .font(.sans(12))
                .scrollContentBackground(.hidden)
                .frame(minHeight: 80, maxHeight: 120)
                .padding(6)
                .background(Tokens.surface)
                .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Tokens.hairline, lineWidth: 1))
            HStack {
                Text("⌘↩ to save • Esc to cancel")
                    .font(.mono(10)).foregroundStyle(Tokens.ink3)
                Spacer()
                Button("Cancel", action: onClose).keyboardShortcut(.cancelAction)
                PillButton(title: busy ? "Saving…" : "Save", icon: "checkmark") {
                    submit()
                }
                .disabled(busy || title.trimmingCharacters(in: .whitespaces).isEmpty)
                .keyboardShortcut(.return, modifiers: .command)
            }
        }
        .padding(16)
        .frame(width: 460)
        .background(Tokens.canvas)
        .onAppear { focused = true }
    }

    private func submit() {
        guard !busy else { return }
        let trimmed = title.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return }
        busy = true
        let create = CardCreate(
            title: trimmed,
            description: description.isEmpty ? nil : description,
            status: status,
            tags: nil, dueDate: nil, assignees: nil,
            source: .manual, project: nil
        )
        Task {
            _ = await CardStore.shared.create(create)
            busy = false
            onClose()
        }
    }
}
