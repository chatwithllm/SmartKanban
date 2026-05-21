import SwiftUI

struct KnowledgeListView: View {
    @StateObject private var store = KnowledgeStore.shared
    @State private var editing: KnowledgeItem?
    @State private var showCreate = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            header
            HStack(spacing: 8) {
                Picker("", selection: $store.scope) {
                    Text("Mine").tag(KScope.mine)
                    Text("Inbox").tag(KScope.inbox)
                    Text("All").tag(KScope.all)
                }
                .pickerStyle(.segmented)
                .frame(width: 240)
                .labelsHidden()
                HStack(spacing: 6) {
                    Image(systemName: "magnifyingglass").foregroundStyle(Tokens.ink3)
                    TextField("Search knowledge…", text: $store.query)
                        .textFieldStyle(.plain)
                        .onSubmit { Task { await store.refresh() } }
                }
                .padding(.horizontal, 10).padding(.vertical, 5)
                .background(Tokens.surface)
                .overlay(Capsule().strokeBorder(Tokens.hairline, lineWidth: 1))
                .clipShape(Capsule())
                Spacer()
            }
            if let active = store.tag {
                HStack(spacing: 6) {
                    Text("#\(active)").font(.mono(11)).foregroundStyle(Tokens.violet)
                    Button { store.tag = nil; Task { await store.refresh() } } label: {
                        Image(systemName: "xmark.circle.fill").font(.system(size: 11))
                    }.buttonStyle(.plain)
                }
            }
            ScrollView {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 280), spacing: 12)], spacing: 12) {
                    ForEach(store.items) { item in
                        KnowledgeRowView(item: item)
                            .onTapGesture { editing = item }
                    }
                    if store.items.isEmpty && !store.loading {
                        Text("No knowledge yet.")
                            .foregroundStyle(Tokens.ink3).font(.sans(12))
                            .padding(.top, 40)
                    }
                }
                .padding(.bottom, 40)
            }
        }
        .padding(.horizontal, 24).padding(.top, 16)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Tokens.canvas)
        .onAppear { Task.detached(priority: .userInitiated) { await store.refresh() } }
        .onChange(of: store.scope) { _ in Task { await store.refresh() } }
        .sheet(isPresented: $showCreate) {
            KnowledgeEditSheet(initial: nil) {
                showCreate = false
            }
        }
        .sheet(item: $editing) { item in
            KnowledgeEditSheet(initial: item) {
                editing = nil
            }
        }
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Knowledge").font(.serif(24, weight: .semibold))
                Text("Notes, links, and references shared across the household.")
                    .font(.sans(12)).foregroundStyle(Tokens.ink2)
            }
            Spacer()
            PillButton(title: "+ New note", icon: nil) { showCreate = true }
        }
    }
}
