import SwiftUI
import AppKit
import UniformTypeIdentifiers

struct CaptureView: View {
    let initialStatus: CardStatus
    var onClose: () -> Void

    @State private var title: String = ""
    @State private var description: String = ""
    @State private var status: CardStatus
    @State private var busy = false
    @State private var templates: [Template] = []
    @State private var showTemplates = false
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
            modeBar
            TextField("Title — start with /name to apply a template", text: $title)
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
        .onAppear {
            focused = true
            Task { await reloadTemplates() }
        }
        .sheet(isPresented: $showTemplates) {
            templatePickerSheet
        }
    }

    private var modeBar: some View {
        HStack(spacing: 8) {
            Button {
                pickPhoto()
            } label: {
                Label("Photo", systemImage: "photo")
                    .font(.sans(11, weight: .semibold))
                    .padding(.horizontal, 10).padding(.vertical, 5)
                    .background(Tokens.ceramic).clipShape(Capsule())
            }
            .buttonStyle(.plain)
            Button {
                showTemplates = true
            } label: {
                Label("Template", systemImage: "doc.text")
                    .font(.sans(11, weight: .semibold))
                    .padding(.horizontal, 10).padding(.vertical, 5)
                    .background(Tokens.ceramic).clipShape(Capsule())
            }
            .buttonStyle(.plain)
            Button {
                ToastStore.shared.info("Voice capture lands in V1")
            } label: {
                Label("Voice", systemImage: "mic")
                    .font(.sans(11, weight: .semibold))
                    .foregroundStyle(Tokens.ink3)
                    .padding(.horizontal, 10).padding(.vertical, 5)
                    .background(Tokens.ceramic.opacity(0.5)).clipShape(Capsule())
            }
            .buttonStyle(.plain)
            .help("Voice capture lands in V1")
            Spacer()
        }
    }

    private var templatePickerSheet: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Pick a template").font(.serif(14, weight: .semibold))
                Spacer()
                Button("Close") { showTemplates = false }
                    .keyboardShortcut(.cancelAction)
            }
            .padding(12)
            Divider()
            ScrollView {
                if templates.isEmpty {
                    Text("No templates yet. Create one in the web app.")
                        .font(.sans(12)).foregroundStyle(Tokens.ink3).padding(20)
                } else {
                    VStack(spacing: 0) {
                        ForEach(templates) { tpl in
                            Button {
                                Task { await instantiate(tpl) }
                            } label: {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(tpl.name).font(.sans(12, weight: .semibold))
                                    Text(tpl.title).font(.sans(11)).foregroundStyle(Tokens.ink3)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(10)
                            }
                            .buttonStyle(.plain)
                            Divider()
                        }
                    }
                }
            }
        }
        .frame(width: 400, height: 380)
        .background(Tokens.canvas)
    }

    private func pickPhoto() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.png, .jpeg, .heic, .image]
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        if panel.runModal() == .OK, let url = panel.url {
            busy = true
            let chosen = status
            Task {
                _ = await CardStore.shared.createFromImage(fileURL: url, status: chosen)
                busy = false
                onClose()
            }
        }
    }

    private func reloadTemplates() async {
        do {
            templates = try await APIClient.shared.send(.listTemplates, as: [Template].self)
        } catch {
            // soft
        }
    }

    private func instantiate(_ tpl: Template) async {
        busy = true
        defer { busy = false }
        do {
            let card = try await APIClient.shared.send(
                .instantiateTemplate(id: tpl.id, statusOverride: status),
                as: Card.self
            )
            CardStore.shared.upsert(card)
            ToastStore.shared.success("Instantiated \(tpl.name)")
            showTemplates = false
            onClose()
        } catch {
            ToastStore.shared.error("Couldn't instantiate: \(error.localizedDescription)")
        }
    }

    private func submit() {
        guard !busy else { return }
        let trimmed = title.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return }
        if trimmed.hasPrefix("/") {
            let name = String(trimmed.dropFirst()).trimmingCharacters(in: .whitespaces).lowercased()
            if let tpl = templates.first(where: { $0.name.lowercased() == name }) {
                Task { await instantiate(tpl) }
                return
            }
            ToastStore.shared.error("No template named \"\(name)\"")
            return
        }
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
