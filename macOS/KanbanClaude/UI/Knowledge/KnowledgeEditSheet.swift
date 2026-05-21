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
    @State private var titleAuto: Bool = true
    @State private var autoFetch: Bool = true
    @State private var fieldErrors: [String: String] = [:]

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
                    fieldWithError("Title", text: $title, key: "title")
                        .onChange(of: title) { _ in titleAuto = false }
                    fieldWithError("URL", text: $url, key: "url")
                        .onChange(of: url) { newURL in
                            if titleAuto {
                                if let host = URL(string: newURL)?.host, !host.isEmpty {
                                    title = host
                                }
                            }
                        }
                    Toggle("Auto-fetch when I save", isOn: $autoFetch)
                        .font(.sans(11))
                        .toggleStyle(.checkbox)
                    VStack(alignment: .leading, spacing: 4) {
                        labelText("Body")
                        TextEditor(text: $noteBody)
                            .font(.sans(13))
                            .scrollContentBackground(.hidden)
                            .frame(minHeight: 200)
                            .padding(8)
                            .background(Tokens.surface)
                            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Tokens.hairline, lineWidth: 1))
                        if let err = fieldErrors["body"] {
                            Text(err).font(.sans(11)).foregroundStyle(Tokens.danger)
                        }
                    }
                    fieldWithError("Tags (comma separated)", text: $tagsText, key: "tags")
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

    private func fieldWithError(_ title: String, text: Binding<String>, key: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            labelText(title)
            TextField("", text: text)
                .textFieldStyle(.plain)
                .padding(.vertical, 8).padding(.horizontal, 10)
                .background(Tokens.surface)
                .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(
                    fieldErrors[key] != nil ? Tokens.danger : Tokens.hairline,
                    lineWidth: fieldErrors[key] != nil ? 1.5 : 1))
            if let err = fieldErrors[key] {
                Text(err).font(.sans(11)).foregroundStyle(Tokens.danger)
            }
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
        guard let item = initial else {
            titleAuto = true
            return
        }
        title = item.title
        url = item.url ?? ""
        noteBody = item.body
        tagsText = item.tags.joined(separator: ", ")
        visibility = item.visibility
        titleAuto = item.titleAuto
        autoFetch = false
    }

    private func parsedTags() -> [String] {
        tagsText.split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespaces).lowercased() }
            .filter { !$0.isEmpty }
    }

    private func save() {
        fieldErrors = [:]
        var localErrors: [String: String] = [:]
        if title.trimmingCharacters(in: .whitespaces).isEmpty {
            localErrors["title"] = "Title is required."
        }
        if !url.isEmpty, URL(string: url) == nil {
            localErrors["url"] = "Enter a valid URL or leave blank."
        }
        if !localErrors.isEmpty {
            fieldErrors = localErrors
            return
        }
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
                    titleAuto: titleAuto,
                    url: url.isEmpty ? nil : url,
                    body: noteBody.isEmpty ? nil : noteBody,
                    tags: parsedTags(),
                    visibility: visibility,
                    source: .manual,
                    autoFetch: !url.isEmpty && autoFetch
                )
                _ = await KnowledgeStore.shared.create(input)
            }
            onClose()
        }
    }
}
