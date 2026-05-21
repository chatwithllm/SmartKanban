import SwiftUI

struct TokensTab: View {
    @State private var mirror: [MirrorToken] = []
    @State private var api: [ApiToken] = []
    @State private var lastCreated: String?
    @State private var lastCreatedMirror: MirrorToken?
    @State private var newLabel = ""
    @State private var busy = false
    @State private var mode: Mode = .mirror
    @State private var confirmingRevoke: String?

    enum Mode: String, CaseIterable, Hashable {
        case mirror, api
        var label: String { rawValue.capitalized }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Picker("", selection: $mode) {
                ForEach(Mode.allCases, id: \.self) { Text($0.label).tag($0) }
            }
            .pickerStyle(.segmented)
            .labelsHidden()

            HStack {
                TextField("Label", text: $newLabel).textFieldStyle(.roundedBorder)
                PillButton(title: "Generate token", icon: "plus") { create() }
                    .disabled(busy)
            }

            if let m = lastCreatedMirror {
                mirrorSuccessPanel(m)
            } else if let created = lastCreated {
                rawTokenPanel(created)
            }

            ScrollView {
                VStack(alignment: .leading, spacing: 6) {
                    if mode == .mirror {
                        ForEach(mirror) { tok in
                            tokenRow(label: tok.label, subtitle: tok.url, token: tok.token, createdAt: tok.createdAt)
                            Divider()
                        }
                        if mirror.isEmpty { Text("No mirror tokens yet.").foregroundStyle(Tokens.ink3).font(.sans(11)) }
                    } else {
                        ForEach(api) { tok in
                            tokenRow(label: tok.label, subtitle: nil, token: tok.token, createdAt: tok.createdAt)
                            Divider()
                        }
                        if api.isEmpty { Text("No API tokens yet.").foregroundStyle(Tokens.ink3).font(.sans(11)) }
                    }
                }
            }
        }
        .padding(20)
        .onAppear {
            Task.detached(priority: .userInitiated) {
                await refresh()
            }
        }
    }

    private func mirrorSuccessPanel(_ m: MirrorToken) -> some View {
        let absolute = absoluteURL(forRelative: m.url) ?? m.token
        return VStack(alignment: .leading, spacing: 6) {
            Text("Mirror link (copy now — shown once)")
                .font(.mono(10, weight: .semibold))
                .foregroundStyle(Tokens.greenAccent)
            Text(absolute)
                .font(.mono(11))
                .textSelection(.enabled)
                .padding(8)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Tokens.surface)
                .clipShape(RoundedRectangle(cornerRadius: 6))
            HStack {
                Button("Copy") {
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(absolute, forType: .string)
                    ToastStore.shared.success("Copied mirror link")
                }
                .buttonStyle(.borderedProminent)
                Button("Dismiss") { lastCreatedMirror = nil }
                Spacer()
            }
        }
        .padding(10)
        .background(Tokens.greenAccent.opacity(0.18))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private func absoluteURL(forRelative s: String?) -> String? {
        guard let s, !s.isEmpty else { return nil }
        if s.hasPrefix("http") { return s }
        return Constants.serverURL.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + s
    }

    private func rawTokenPanel(_ created: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("New token (copy now — shown once)")
                    .font(.mono(10, weight: .semibold))
                    .foregroundStyle(Tokens.violet)
                Spacer()
                Button {
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(created, forType: .string)
                } label: {
                    Label("Copy", systemImage: "doc.on.doc").font(.sans(11))
                }
                .buttonStyle(.borderless)
            }
            Text(created)
                .font(.mono(11))
                .textSelection(.enabled)
                .padding(8)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Tokens.ceramic)
                .clipShape(RoundedRectangle(cornerRadius: 6))
        }
    }

    private func tokenRow(label: String, subtitle: String?, token: String, createdAt: Date) -> some View {
        HStack {
            VStack(alignment: .leading) {
                Text(label).font(.sans(12, weight: .semibold))
                if let s = subtitle { Text(s).font(.mono(10)).foregroundStyle(Tokens.ink3) }
            }
            Spacer()
            Text("…\(suffix(of: token))")
                .font(.mono(11))
                .foregroundStyle(Tokens.ink3)
            Text(Self.relFmt.localizedString(for: createdAt, relativeTo: ServerTime.now()))
                .font(.sans(11)).foregroundStyle(Tokens.ink3)
            Button(role: .destructive) {
                confirmingRevoke = token
            } label: { Image(systemName: "trash") }
            .buttonStyle(.borderless)
            .confirmationDialog(
                "Revoke token \"\(label)\"?",
                isPresented: Binding(
                    get: { confirmingRevoke == token },
                    set: { if !$0 { confirmingRevoke = nil } }
                ),
                titleVisibility: .visible
            ) {
                Button("Revoke", role: .destructive) { Task { await delete(token: token) } }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Devices and integrations using it will stop working.")
            }
        }
        .padding(.vertical, 4)
    }

    private static let relFmt: RelativeDateTimeFormatter = {
        let f = RelativeDateTimeFormatter(); f.unitsStyle = .short; return f
    }()

    private func suffix(of token: String) -> String {
        let n = min(token.count, 4)
        return String(token.suffix(n))
    }

    private func create() {
        guard !busy else { return }
        busy = true
        Task {
            defer { busy = false }
            do {
                if mode == .mirror {
                    let t = try await APIClient.shared.send(
                        .createMirrorToken(label: newLabel.isEmpty ? "Mirror" : newLabel),
                        as: MirrorToken.self
                    )
                    lastCreated = nil
                    lastCreatedMirror = t
                } else {
                    let t = try await APIClient.shared.send(
                        .createApiToken(label: newLabel.isEmpty ? "API" : newLabel),
                        as: ApiToken.self
                    )
                    lastCreatedMirror = nil
                    lastCreated = t.token
                }
                newLabel = ""
                await refresh()
            } catch {
                ToastStore.shared.error("Couldn't create token: \(error.localizedDescription)")
            }
        }
    }

    private func delete(token: String) async {
        do {
            if mode == .mirror {
                try await APIClient.shared.sendVoid(.deleteMirrorToken(token: token))
            } else {
                try await APIClient.shared.sendVoid(.deleteApiToken(token: token))
            }
            await refresh()
        } catch {
            ToastStore.shared.error("Couldn't delete: \(error.localizedDescription)")
        }
    }

    private func refresh() async {
        do {
            mirror = try await APIClient.shared.send(.listMirrorTokens, as: [MirrorToken].self)
            api = try await APIClient.shared.send(.listApiTokens, as: [ApiToken].self)
        } catch {
            // soft
        }
    }
}
