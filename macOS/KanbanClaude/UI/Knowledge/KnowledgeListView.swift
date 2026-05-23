import SwiftUI

struct KnowledgeListView: View {
    @StateObject private var store = KnowledgeStore.shared
    @State private var detail: KnowledgeItem?
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
            tagCloud
            ScrollView {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 280), spacing: 12)], spacing: 12) {
                    ForEach(store.items) { item in
                        KnowledgeRowView(item: item)
                            .onTapGesture { detail = item }
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
        .sheet(item: $detail) { item in
            KnowledgeDetailSheet(item: item) {
                detail = nil
            }
        }
    }

    @ViewBuilder private var tagCloud: some View {
        let tops = topTags()
        if !tops.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(tops, id: \.0) { tag, count in
                        let active = store.tag == tag
                        Button {
                            store.tag = active ? nil : tag
                            Task { await store.refresh() }
                        } label: {
                            HStack(spacing: 4) {
                                Text("#\(tag)").font(.mono(10, weight: .semibold))
                                Text("\(count)").font(.mono(9)).foregroundStyle(Tokens.ink3)
                            }
                            .padding(.horizontal, 8).padding(.vertical, 3)
                            .background(active ? Tokens.greenAccent.opacity(0.18) : Tokens.ceramic)
                            .overlay(Capsule().strokeBorder(active ? Tokens.greenAccent : .clear, lineWidth: 1))
                            .clipShape(Capsule())
                            .foregroundStyle(active ? Tokens.greenAccent : Tokens.ink2)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private func topTags() -> [(String, Int)] {
        var counts: [String: Int] = [:]
        for item in store.items {
            for t in item.tags {
                counts[t, default: 0] += 1
            }
        }
        return counts.sorted { lhs, rhs in
            if lhs.value != rhs.value { return lhs.value > rhs.value }
            return lhs.key < rhs.key
        }.prefix(20).map { ($0.key, $0.value) }
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Knowledge").font(.serif(24, weight: .semibold))
                Text("URLs, snippets, notes — all linked back to cards")
                    .font(.sans(12)).foregroundStyle(Tokens.ink2)
            }
            Spacer()
            PillButton(title: "+ New note", icon: nil) { showCreate = true }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Tokens.greenAccent.opacity(0.12))
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Tokens.greenAccent.opacity(0.25), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}
