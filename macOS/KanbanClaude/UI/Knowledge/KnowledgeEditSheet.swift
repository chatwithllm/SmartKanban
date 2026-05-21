import SwiftUI

struct KnowledgeEditSheet: View {
    let initial: KnowledgeItem?
    var onClose: () -> Void

    @State private var title: String = ""
    @State private var url: String = ""
    @State private var noteBody: String = ""
    @State private var tagsText: String = ""
    @State private var visibility: KnowledgeVisibility = .private
    @State private var busy = false

    var isEditing: Bool { initial != nil }

    var body: some View {
        VStack(spacing: 0) {
            ModalHeaderStrip(title: isEditing ? "Edit note" : "New note") {
                Button(action: onClose) {
                    Image(systemName: "xmark")
                        .foregroundStyle(.white)
                        .padding(6)
                        .background(.white.opacity(0.18))
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)
            }
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    field("Title", text: $title)
                    field("URL", text: $url)
                    VStack(alignment: .leading, spacing: 4) {
                        labelText("Body")
                        TextEditor(text: $noteBody)
                            .font(.sans(13))
                            .scrollContentBackground(.hidden)
                            .frame(minHeight: 200)
                            .padding(8)
                            .background(Tokens.surface)
                            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Tokens.hairline, lineWidth: 1))
                    }
                    field("Tags (comma separated)", text: $tagsText)
                    VStack(alignment: .leading, spacing: 4) {
                        labelText("Visibility")
                        Picker("", selection: $visibility) {
                            ForEach(KnowledgeVisibility.allCases, id: \.self) { Text($0.rawValue.capitalized).tag($0) }
                        }
                        .pickerStyle(.segmented)
                        .labelsHidden()
                    }
                }
                .padding(20)
            }
            footer
        }
        .frame(width: 560, height: 620)
        .background(Tokens.canvas)
        .onAppear { hydrate() }
    }

    private func field(_ title: String, text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            labelText(title)
            TextField("", text: text)
                .textFieldStyle(.plain)
                .padding(.vertical, 8).padding(.horizontal, 10)
                .background(Tokens.surface)
                .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Tokens.hairline, lineWidth: 1))
        }
    }

    private func labelText(_ s: String) -> some View {
        Text(s).font(.mono(10, weight: .semibold)).tracking(1.2).foregroundStyle(Tokens.ink3)
    }

    private var footer: some View {
        HStack {
            if isEditing, let item = initial {
                Button("Archive", role: .destructive) {
                    Task {
                        await KnowledgeStore.shared.archive(id: item.id)
                        onClose()
                    }
                }
            }
            Spacer()
            Button("Cancel", action: onClose).keyboardShortcut(.cancelAction)
            PillButton(title: busy ? "Saving…" : "Save", icon: "checkmark") { save() }
                .disabled(busy)
                .keyboardShortcut(.return, modifiers: .command)
        }
        .padding(.horizontal, 20).padding(.vertical, 12)
        .background(Tokens.surface)
        .overlay(Rectangle().fill(Tokens.hairline).frame(height: 1), alignment: .top)
    }

    private func hydrate() {
        guard let item = initial else { return }
        title = item.title
        url = item.url ?? ""
        noteBody = item.body
        tagsText = item.tags.joined(separator: ", ")
        visibility = item.visibility
    }

    private func parsedTags() -> [String] {
        tagsText.split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespaces).lowercased() }
            .filter { !$0.isEmpty }
    }

    private func save() {
        busy = true
        Task {
            defer { busy = false }
            if let item = initial {
                var patch = KnowledgePatch()
                patch.title = title
                patch.body = noteBody
                patch.tags = parsedTags()
                patch.visibility = visibility
                await KnowledgeStore.shared.patch(item.id, patch)
            } else {
                let input = KnowledgeInput(
                    title: title.isEmpty ? nil : title,
                    url: url.isEmpty ? nil : url,
                    body: noteBody.isEmpty ? nil : noteBody,
                    tags: parsedTags(),
                    visibility: visibility,
                    source: .manual,
                    autoFetch: !url.isEmpty && noteBody.isEmpty
                )
                _ = await KnowledgeStore.shared.create(input)
            }
            onClose()
        }
    }
}
