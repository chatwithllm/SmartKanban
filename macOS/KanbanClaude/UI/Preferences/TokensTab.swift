import SwiftUI

struct TokensTab: View {
    @State private var mirror: [MirrorToken] = []
    @State private var api: [ApiToken] = []
    @State private var lastCreated: String?
    @State private var newLabel = ""
    @State private var busy = false
    @State private var mode: Mode = .mirror

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
            if let created = lastCreated {
                HStack(spacing: 6) {
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

            ScrollView {
                VStack(alignment: .leading, spacing: 6) {
                    if mode == .mirror {
                        ForEach(mirror) { tok in
                            tokenRow(label: tok.label, subtitle: tok.url, token: tok.token)
                            Divider()
                        }
                        if mirror.isEmpty { Text("No mirror tokens yet.").foregroundStyle(Tokens.ink3).font(.sans(11)) }
                    } else {
                        ForEach(api) { tok in
                            tokenRow(label: tok.label, subtitle: nil, token: tok.token)
                            Divider()
                        }
                        if api.isEmpty { Text("No API tokens yet.").foregroundStyle(Tokens.ink3).font(.sans(11)) }
                    }
                }
            }
        }
        .padding(20)
        .task { await refresh() }
    }

    private func tokenRow(label: String, subtitle: String?, token: String) -> some View {
        HStack {
            VStack(alignment: .leading) {
                Text(label).font(.sans(12, weight: .semibold))
                if let s = subtitle { Text(s).font(.mono(10)).foregroundStyle(Tokens.ink3) }
            }
            Spacer()
            Button(role: .destructive) {
                Task { await delete(token: token) }
            } label: { Image(systemName: "trash") }
            .buttonStyle(.borderless)
        }
        .padding(.vertical, 4)
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
                    lastCreated = t.token
                } else {
                    let t = try await APIClient.shared.send(
                        .createApiToken(label: newLabel.isEmpty ? "API" : newLabel),
                        as: ApiToken.self
                    )
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
