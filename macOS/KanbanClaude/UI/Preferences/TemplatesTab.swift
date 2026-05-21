import SwiftUI

// Templates tab — V1. MVP shows existing templates and supports instantiate;
// full CRUD lands in V1. We surface the list now so users can at least invoke
// templates created via the web UI.
struct TemplatesTab: View {
    @State private var templates: [Template] = []
    @State private var busy = false
    @State private var lastError: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Templates are managed in the web app for MVP. macOS surfaces them here so you can instantiate from your menu bar.")
                .font(.sans(11))
                .foregroundStyle(Tokens.ink3)
            if let err = lastError {
                Text(err)
                    .foregroundStyle(Tokens.danger)
                    .font(.sans(11))
            }
            List {
                ForEach(templates) { tpl in
                    HStack {
                        VStack(alignment: .leading) {
                            Text(tpl.name).font(.sans(12, weight: .semibold))
                            Text(tpl.title).font(.sans(11)).foregroundStyle(Tokens.ink3)
                        }
                        Spacer()
                        Button("Instantiate") {
                            Task { await instantiate(tpl) }
                        }
                        .buttonStyle(.bordered)
                    }
                }
                if templates.isEmpty {
                    Text("No templates yet — create some via the web app.")
                        .foregroundStyle(Tokens.ink3).font(.sans(11))
                }
            }
            .listStyle(.bordered)
        }
        .padding(20)
        .task { await refresh() }
    }

    private func instantiate(_ tpl: Template) async {
        do {
            let card = try await APIClient.shared.send(.instantiateTemplate(id: tpl.id, statusOverride: nil), as: Card.self)
            CardStore.shared.upsert(card)
            lastError = nil
            ToastStore.shared.success("Instantiated \(tpl.name)")
        } catch {
            lastError = "Couldn't instantiate: \(error.localizedDescription)"
            ToastStore.shared.error(lastError ?? "")
        }
    }

    private func refresh() async {
        do {
            templates = try await APIClient.shared.send(.listTemplates, as: [Template].self)
            lastError = nil
        } catch {
            lastError = "Couldn't load templates: \(error.localizedDescription)"
        }
    }
}
