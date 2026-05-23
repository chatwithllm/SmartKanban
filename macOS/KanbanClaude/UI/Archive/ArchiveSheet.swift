import SwiftUI

struct ArchiveSheet: View {
    @State private var archived: [Card] = []
    @State private var loading = false
    @State private var confirmingPurge = false
    @State private var confirmingDeleteId: UUID?
    var onClose: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            ModalHeaderStrip(title: "Archived cards") {
                HStack(spacing: 8) {
                    Text("\(archived.count)")
                        .font(.mono(11, weight: .semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 8).padding(.vertical, 2)
                        .background(.white.opacity(0.18))
                        .clipShape(Capsule())
                    Button(action: onClose) {
                        Image(systemName: "xmark")
                            .foregroundStyle(.white)
                            .padding(6)
                            .background(.white.opacity(0.18))
                            .clipShape(Circle())
                    }
                    .buttonStyle(.plain)
                }
            }
            ScrollView {
                LazyVStack(spacing: 0) {
                    if loading { ProgressView().padding(40) }
                    ForEach(archived) { card in
                        archivedRow(card)
                        Divider()
                    }
                    if !loading && archived.isEmpty {
                        VStack(spacing: 6) {
                            Text("🗑️")
                                .font(.system(size: 32))
                            Text("No archived cards")
                                .foregroundStyle(Tokens.ink3).font(.sans(12))
                        }
                        .padding(40)
                    }
                }
            }
            if !archived.isEmpty {
                footerBand
            }
        }
        .frame(width: 640, height: 600)
        .background(Tokens.canvas)
        .onAppear {
            Task.detached(priority: .userInitiated) {
                await refresh()
            }
        }
    }

    private var footerBand: some View {
        HStack {
            Button(role: .destructive) {
                confirmingPurge = true
            } label: {
                Label("Delete all (\(archived.count))", systemImage: "trash")
                    .font(.sans(11, weight: .semibold))
            }
            .disabled(archived.isEmpty)
            .confirmationDialog(
                "Delete all \(archived.count) cards forever?",
                isPresented: $confirmingPurge,
                titleVisibility: .visible
            ) {
                Button("Delete forever", role: .destructive) { Task { await purgeAll() } }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("This cannot be undone.")
            }
            Spacer()
            Button("Close", action: onClose)
                .keyboardShortcut(.cancelAction)
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
        .background(Tokens.danger.opacity(0.08))
        .overlay(Rectangle().fill(Tokens.hairline).frame(height: 1), alignment: .top)
    }

    private func archivedRow(_ card: Card) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Text(card.status.label.uppercased())
                .font(.mono(10, weight: .semibold))
                .foregroundStyle(.white)
                .padding(.horizontal, 7).padding(.vertical, 2)
                .background(statusColor(card.status))
                .clipShape(Capsule())
                .padding(.top, 2)
            VStack(alignment: .leading, spacing: 2) {
                Text(card.title).font(.serif(14, weight: .semibold)).foregroundStyle(Tokens.ink)
                Text("Archived \(rel(card.updatedAt)) • was \(card.status.label)")
                    .font(.mono(10)).foregroundStyle(Tokens.ink3)
            }
            Spacer()
            Button("Restore") { Task { await restore(card.id) } }
                .buttonStyle(.borderedProminent)
                .controlSize(.small)
            Button(role: .destructive) {
                confirmingDeleteId = card.id
            } label: { Image(systemName: "trash") }
            .buttonStyle(.borderless)
            .confirmationDialog(
                "Delete this card forever?",
                isPresented: Binding(
                    get: { confirmingDeleteId == card.id },
                    set: { if !$0 { confirmingDeleteId = nil } }
                ),
                titleVisibility: .visible
            ) {
                Button("Delete forever", role: .destructive) { Task { await deleteForever(card.id) } }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("This cannot be undone.")
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
    }

    private static let rel: RelativeDateTimeFormatter = {
        let f = RelativeDateTimeFormatter(); f.unitsStyle = .short; return f
    }()
    private func rel(_ d: Date) -> String { Self.rel.localizedString(for: d, relativeTo: ServerTime.now()) }

    private func statusColor(_ s: CardStatus) -> Color {
        switch s {
        case .backlog: return Tokens.pinBacklog
        case .today: return Tokens.pinToday
        case .in_progress: return Tokens.pinDoing
        case .done: return Tokens.pinDone
        }
    }

    private func refresh() async {
        loading = true; defer { loading = false }
        do { archived = try await APIClient.shared.send(.archivedCards, as: [Card].self) }
        catch { ToastStore.shared.error("Couldn't load archive: \(error.localizedDescription)") }
    }

    private func restore(_ id: UUID) async {
        do {
            let card = try await APIClient.shared.send(.restoreCard(id: id), as: Card.self)
            CardStore.shared.upsert(card)
            archived.removeAll { $0.id == id }
            ToastStore.shared.success("Restored")
        } catch {
            ToastStore.shared.error("Couldn't restore: \(error.localizedDescription)")
        }
    }

    private func deleteForever(_ id: UUID) async {
        do {
            try await APIClient.shared.sendVoid(.permanentDelete(id: id))
            archived.removeAll { $0.id == id }
        } catch {
            ToastStore.shared.error("Couldn't delete: \(error.localizedDescription)")
        }
    }

    private func purgeAll() async {
        do {
            _ = try await APIClient.shared.send(.purgeArchived, as: [String: Int].self)
            archived.removeAll()
            ToastStore.shared.success("Archive purged")
        } catch {
            ToastStore.shared.error("Couldn't purge: \(error.localizedDescription)")
        }
    }
}
