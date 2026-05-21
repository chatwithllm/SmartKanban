import SwiftUI
import AppKit
import UniformTypeIdentifiers

struct EditCardView: View {
    let cardId: UUID
    var onClose: () -> Void

    @StateObject private var cards = CardStore.shared
    @StateObject private var users = UserListStore.shared
    @StateObject private var insights = InsightStore.shared

    @State private var draft: Card?
    @State private var saving = false
    @State private var showQR = false
    @State private var copiedId = false

    @State private var linkedKnowledge: [KnowledgeItem] = []
    @State private var knowledgePicking = false
    @State private var knowledgeQuery: String = ""
    @State private var knowledgeResults: [KnowledgeItem] = []
    @State private var knowledgeBusy = false

    var body: some View {
        Group {
            if let draft {
                editor(card: draft)
            } else {
                ProgressView()
                    .controlSize(.large)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Tokens.canvas)
            }
        }
        .frame(minWidth: 560, minHeight: 600)
        .background(Tokens.canvas)
        .onDrop(of: [.fileURL, .image], isTargeted: nil) { providers in
            for provider in providers {
                if provider.canLoadObject(ofClass: URL.self) {
                    _ = provider.loadObject(ofClass: URL.self) { url, _ in
                        guard let url else { return }
                        Task { @MainActor in await cards.attachImage(cardId: cardId, fileURL: url) }
                    }
                }
            }
            return true
        }
        .onAppear {
            draft = cards.card(id: cardId)
            Task.detached(priority: .userInitiated) {
                await users.refresh()
                await insights.refresh(cardId: cardId)
            }
            Task { await loadLinkedKnowledge() }
        }
        .onChange(of: cards.cards) { _ in
            if draft == nil, let c = cards.card(id: cardId) {
                draft = c
            }
        }
    }

    @ViewBuilder private func editor(card: Card) -> some View {
        let binding = Binding<Card>(
            get: { draft ?? card },
            set: { draft = $0 }
        )
        VStack(spacing: 0) {
            header(card: card)
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    // MARK: - F-174 title
                    titleSection(card: binding)
                    // MARK: - F-194 status (macOS-only adaptation; web has no inline picker)
                    statusSection(card: binding)
                    // MARK: - F-177 description
                    descriptionSection(card: binding)
                    // MARK: - F-178 tags
                    tagsSection(card: binding)
                    // MARK: - F-218..F-237 AI insights (high-signal — above the fold)
                    aiInsightsSection()
                    // MARK: - F-181..F-187 knowledge (high-signal — above the fold)
                    knowledgeSection()
                    // MARK: - F-188..F-189 due date
                    dueDateSection(card: binding)
                    // MARK: - F-190..F-192 attachments
                    attachmentsSection(card: binding.wrappedValue)
                    // MARK: - F-193 assignees
                    assigneesSection(card: binding)
                    // MARK: - F-194 shares
                    sharesSection(card: binding)
                    // MARK: - F-273..F-294 chat & activity (Phase 4f)
                    chatPlaceholder()
                }
                .padding(20)
            }
            footer(card: card)
        }
    }

    private func header(card: Card) -> some View {
        ModalHeaderStrip(title: "Edit card") {
            HStack(spacing: 8) {
                Button {
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(card.id.lowered, forType: .string)
                    copiedId = true
                    Task { try? await Task.sleep(nanoseconds: 1_200_000_000); copiedId = false }
                } label: {
                    HStack(spacing: 4) {
                        Text(copiedId ? "Copied" : "\(card.id.lowered.prefix(8))")
                            .font(.mono(10, weight: .medium))
                        Image(systemName: "doc.on.doc").font(.system(size: 9))
                    }
                    .foregroundStyle(.white)
                    .padding(.horizontal, 8).padding(.vertical, 4)
                    .background(.white.opacity(0.18))
                    .clipShape(Capsule())
                }
                .buttonStyle(.plain)

                Button { showQR.toggle() } label: {
                    Image(systemName: "qrcode")
                        .foregroundStyle(.white)
                        .padding(.horizontal, 6).padding(.vertical, 4)
                        .background(.white.opacity(showQR ? 0.3 : 0.18))
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
                .popover(isPresented: $showQR, arrowEdge: .top) {
                    QRPopover(cardId: card.id)
                }

                Button { onClose() } label: {
                    Image(systemName: "xmark")
                        .foregroundStyle(.white)
                        .padding(6)
                        .background(.white.opacity(0.18))
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)
                .keyboardShortcut(.cancelAction)
            }
        }
        .padding([.horizontal, .top], 0)
    }

    private func titleSection(card: Binding<Card>) -> some View {
        TextField("Title", text: card.title)
            .textFieldStyle(.plain)
            .font(.serif(18, weight: .semibold))
            .padding(.vertical, 8).padding(.horizontal, 10)
            .background(Tokens.surface)
            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Tokens.hairline, lineWidth: 1))
    }

    private func statusSection(card: Binding<Card>) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            SectionLabel("Status")
            Picker("", selection: card.status) {
                ForEach(CardStatus.allCases, id: \.self) { s in
                    Text(s.label).tag(s)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
        }
    }

    private func descriptionSection(card: Binding<Card>) -> some View {
        TextEditor(text: card.description)
            .font(.sans(13))
            .scrollContentBackground(.hidden)
            .frame(minHeight: 120, maxHeight: 240)
            .padding(8)
            .background(Tokens.surface)
            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Tokens.hairline, lineWidth: 1))
    }

    private func tagsSection(card: Binding<Card>) -> some View {
        TagsEditorRow(tags: card.tags)
    }

    private func dueDateSection(card: Binding<Card>) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            SectionLabel("Due")
            HStack {
                DatePicker(
                    "",
                    selection: Binding(
                        get: { dateFromString(card.wrappedValue.dueDate) ?? Date() },
                        set: { newDate in
                            card.wrappedValue.dueDate = stringFromDate(newDate)
                        }
                    ),
                    displayedComponents: .date
                )
                .labelsHidden()
                if card.wrappedValue.dueDate != nil {
                    Button {
                        card.wrappedValue.dueDate = nil
                    } label: {
                        Image(systemName: "xmark.circle.fill").foregroundStyle(Tokens.ink3)
                    }
                    .buttonStyle(.plain)
                    .help("Clear due date")
                }
                Spacer()
            }
        }
    }

    private func attachmentsSection(card: Card) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            SectionLabel("Attachments")
            if card.attachments.isEmpty {
                Text("No attachments — drop an image on this window to add one.")
                    .font(.sans(12)).foregroundStyle(Tokens.ink3)
            } else {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 110), spacing: 8)], spacing: 8) {
                    ForEach(card.attachments) { att in
                        attachmentTile(att)
                    }
                }
            }
        }
    }

    @ViewBuilder private func attachmentTile(_ att: Attachment) -> some View {
        switch att.kind {
        case .image:
            AuthenticatedImage(storagePath: att.storagePath)
                .frame(height: 88)
                .frame(maxWidth: .infinity)
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Tokens.hairline, lineWidth: 1))
        case .audio:
            Label(att.originalFilename ?? "audio.m4a", systemImage: "waveform")
                .font(.sans(11)).foregroundStyle(Tokens.ink2)
                .padding(.horizontal, 8).padding(.vertical, 6)
                .background(Tokens.ceramic).clipShape(Capsule())
        case .file:
            Label(att.originalFilename ?? "file", systemImage: "paperclip")
                .font(.sans(11)).foregroundStyle(Tokens.ink2)
                .padding(.horizontal, 8).padding(.vertical, 6)
                .background(Tokens.ceramic).clipShape(Capsule())
        }
    }

    private func assigneesSection(card: Binding<Card>) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            SectionLabel("Assignees")
            UserPillGrid(
                userIds: users.users.map(\.id),
                selected: card.assignees,
                accent: Tokens.greenStarbucks
            )
        }
    }

    @State private var showSharedConfirm = false
    @State private var sharing = false

    private func sharesSection(card: Binding<Card>) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            SectionLabel("Shared with")
            UserPillGrid(
                userIds: users.users.map(\.id),
                selected: card.shares,
                accent: Tokens.greenUplift
            )
            HStack(spacing: 8) {
                Button("Share now") {
                    Task {
                        sharing = true
                        var p = CardPatch(); p.shares = card.wrappedValue.shares
                        await cards.patch(cardId, p)
                        sharing = false
                        withAnimation { showSharedConfirm = true }
                        try? await Task.sleep(nanoseconds: 2_000_000_000)
                        showSharedConfirm = false
                    }
                }
                .disabled(sharing)
                if showSharedConfirm {
                    Text("✓ Shared").font(.sans(11)).foregroundStyle(Tokens.greenAccent)
                }
                Spacer()
            }
        }
    }

    private func knowledgeSection() -> some View {
        DisclosureGroup {
            VStack(alignment: .leading, spacing: 6) {
                if linkedKnowledge.isEmpty {
                    Text("No linked notes yet.")
                        .font(.sans(11)).foregroundStyle(Tokens.ink3)
                } else {
                    ForEach(linkedKnowledge) { item in
                        linkedRow(item)
                    }
                }
                HStack(spacing: 8) {
                    Button {
                        withAnimation { knowledgePicking.toggle() }
                        if !knowledgePicking { knowledgeQuery = ""; knowledgeResults = [] }
                    } label: {
                        Label(knowledgePicking ? "Cancel" : "+ Attach", systemImage: "link")
                            .font(.sans(11, weight: .semibold))
                            .padding(.horizontal, 8).padding(.vertical, 4)
                            .background(Tokens.ceramic)
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    if shouldShowSaveAsKnowledge() {
                        Button {
                            Task { await saveCardAsKnowledge() }
                        } label: {
                            Label("Save as knowledge", systemImage: "tray.and.arrow.down")
                                .font(.sans(11, weight: .semibold))
                                .padding(.horizontal, 8).padding(.vertical, 4)
                                .background(Tokens.violetTint)
                                .clipShape(Capsule())
                        }
                        .buttonStyle(.plain)
                    }
                }
                if knowledgePicking {
                    knowledgePicker
                }
            }
            .padding(.vertical, 4)
        } label: {
            SectionLabel("Knowledge")
        }
    }

    private func linkedRow(_ item: KnowledgeItem) -> some View {
        HStack(spacing: 6) {
            Image(systemName: visibilityIcon(item.visibility))
                .font(.system(size: 10))
                .foregroundStyle(Tokens.ink3)
            if item.url != nil {
                Text("🔗 \(item.title)").font(.sans(12)).foregroundStyle(Tokens.ink)
            } else {
                Text(item.title).font(.sans(12)).foregroundStyle(Tokens.ink)
            }
            Spacer()
            Button {
                Task { await unlinkKnowledge(item) }
            } label: {
                Text("remove").font(.sans(11)).foregroundStyle(Tokens.danger)
            }
            .buttonStyle(.plain)
            .disabled(knowledgeBusy)
        }
        .padding(.vertical, 3)
    }

    private var knowledgePicker: some View {
        VStack(alignment: .leading, spacing: 4) {
            TextField("Search knowledge…", text: $knowledgeQuery)
                .textFieldStyle(.plain)
                .padding(.vertical, 6).padding(.horizontal, 8)
                .background(Tokens.surface)
                .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Tokens.hairline, lineWidth: 1))
                .onSubmit { Task { await searchKnowledge() } }
                .onChange(of: knowledgeQuery) { _ in
                    Task { await searchKnowledge() }
                }
            VStack(spacing: 0) {
                ForEach(knowledgeResults.prefix(12)) { result in
                    Button {
                        Task { await linkKnowledge(result) }
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: visibilityIcon(result.visibility))
                                .font(.system(size: 9))
                                .foregroundStyle(Tokens.ink3)
                            Text(result.url != nil ? "🔗 \(result.title)" : result.title)
                                .font(.sans(12))
                                .foregroundStyle(Tokens.ink)
                            Spacer()
                        }
                        .padding(.horizontal, 6).padding(.vertical, 4)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Tokens.ceramic.opacity(0.4))
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                    }
                    .buttonStyle(.plain)
                    .disabled(knowledgeBusy)
                }
            }
        }
    }

    private func visibilityIcon(_ vis: KnowledgeVisibility) -> String {
        switch vis {
        case .private: return "lock.fill"
        case .inbox: return "tray.fill"
        case .shared: return "person.2.fill"
        }
    }

    private func loadLinkedKnowledge() async {
        do {
            let items = try await APIClient.shared.send(.knowledgeForCard(id: cardId), as: [KnowledgeItem].self)
            linkedKnowledge = items
        } catch {
            // soft
        }
    }

    private func searchKnowledge() async {
        do {
            let resp = try await APIClient.shared.send(
                .listKnowledge(scope: .all, q: knowledgeQuery.isEmpty ? nil : knowledgeQuery, tag: nil, limit: 24, cursor: nil),
                as: KnowledgeListResponse.self
            )
            let linkedIds = Set(linkedKnowledge.map(\.id))
            knowledgeResults = resp.items.filter { !linkedIds.contains($0.id) }
        } catch {
            knowledgeResults = []
        }
    }

    private func linkKnowledge(_ item: KnowledgeItem) async {
        guard !knowledgeBusy else { return }
        knowledgeBusy = true
        defer { knowledgeBusy = false }
        do {
            try await APIClient.shared.sendVoid(.linkKnowledgeToCard(knowledgeId: item.id, cardId: cardId))
            linkedKnowledge.append(item)
            knowledgeResults.removeAll { $0.id == item.id }
            knowledgeQuery = ""
            knowledgePicking = false
            ToastStore.shared.success("Linked “\(item.title)”")
        } catch {
            ToastStore.shared.error("Couldn't link: \(error.localizedDescription)")
        }
    }

    private func unlinkKnowledge(_ item: KnowledgeItem) async {
        guard !knowledgeBusy else { return }
        knowledgeBusy = true
        defer { knowledgeBusy = false }
        do {
            try await APIClient.shared.sendVoid(.unlinkKnowledgeFromCard(knowledgeId: item.id, cardId: cardId))
            linkedKnowledge.removeAll { $0.id == item.id }
        } catch {
            ToastStore.shared.error("Couldn't unlink: \(error.localizedDescription)")
        }
    }

    private func shouldShowSaveAsKnowledge() -> Bool {
        guard let card = draft else { return false }
        guard containsURL(card.description) else { return false }
        let descUrls = extractURLs(card.description)
        if descUrls.isEmpty { return false }
        let linkedUrls = Set(linkedKnowledge.compactMap { $0.url?.lowercased() })
        return descUrls.contains { !linkedUrls.contains($0.lowercased()) }
    }

    private func containsURL(_ s: String) -> Bool {
        !extractURLs(s).isEmpty
    }

    private func extractURLs(_ s: String) -> [String] {
        let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)
        let range = NSRange(s.startIndex..., in: s)
        let matches = detector?.matches(in: s, options: [], range: range) ?? []
        return matches.compactMap { $0.url?.absoluteString }
    }

    private func saveCardAsKnowledge() async {
        guard !knowledgeBusy else { return }
        knowledgeBusy = true
        defer { knowledgeBusy = false }
        do {
            let item = try await APIClient.shared.send(.knowledgeFromCard(cardId: cardId), as: KnowledgeItem.self)
            linkedKnowledge.append(item)
            ToastStore.shared.success("Saved as knowledge")
        } catch {
            ToastStore.shared.error("Couldn't save: \(error.localizedDescription)")
        }
    }

    private func aiInsightsSection() -> some View {
        AiInsightsPanelView(cardId: cardId)
    }

    private func chatPlaceholder() -> some View {
        CardTimelineView(cardId: cardId)
    }

    private func footer(card: Card) -> some View {
        HStack {
            Spacer()
            Button("Cancel", action: onClose)
                .keyboardShortcut(.cancelAction)
            PillButton(title: saving ? "Saving…" : "Save", icon: "checkmark", variant: .primary) {
                save()
            }
            .disabled(saving)
        }
        .padding(.horizontal, 20).padding(.vertical, 12)
        .background(Tokens.surface)
        .overlay(Rectangle().fill(Tokens.hairline).frame(height: 1), alignment: .top)
    }

    private func save() {
        guard let local = draft else { return }
        saving = true
        var patch = CardPatch()
        patch.title = local.title
        patch.description = local.description
        patch.status = local.status
        patch.tags = local.tags
        patch.dueDate = local.dueDate ?? ""    // empty = clear
        patch.assignees = local.assignees
        patch.shares = local.shares
        patch.needsReview = false
        Task {
            await cards.patch(cardId, patch)
            saving = false
            ToastStore.shared.success("Card saved")
            onClose()
        }
    }

    // MARK: helpers

    private func dateFromString(_ s: String?) -> Date? {
        guard let s else { return nil }
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.date(from: s)
    }

    private func stringFromDate(_ d: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: d)
    }
}

private struct SectionLabel: View {
    let text: String
    init(_ text: String) { self.text = text }
    var body: some View {
        Text(text)
            .font(.mono(10, weight: .semibold))
            .tracking(1.2)
            .foregroundStyle(Tokens.ink3)
    }
}

private struct TagsEditorRow: View {
    @Binding var tags: [String]
    @State private var text: String = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            FlowLayout(spacing: 6) {
                ForEach(tags, id: \.self) { tag in
                    HStack(spacing: 4) {
                        Text(tag).font(.mono(10, weight: .medium)).foregroundStyle(Tokens.ink2)
                        Button { tags.removeAll { $0 == tag } } label: {
                            Image(systemName: "xmark.circle.fill")
                                .font(.system(size: 9))
                                .foregroundStyle(Tokens.ink3)
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(.horizontal, 8).padding(.vertical, 3)
                    .background(Tokens.ceramic).clipShape(Capsule())
                }
                TextField("add tag and press return", text: $text)
                    .textFieldStyle(.plain)
                    .frame(minWidth: 120)
                    .font(.mono(10))
                    .onSubmit { commit() }
            }
        }
    }

    private func commit() {
        let parts = text.split(separator: ",").map {
            $0.trimmingCharacters(in: .whitespaces).trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        }.filter { !$0.isEmpty }
        for p in parts { if !tags.contains(p) { tags.append(p) } }
        text = ""
    }
}

private struct UserPillGrid: View {
    let userIds: [UUID]
    @Binding var selected: [UUID]
    let accent: Color
    @ObservedObject private var users = UserListStore.shared

    var body: some View {
        FlowLayout(spacing: 6) {
            ForEach(userIds, id: \.self) { uid in
                let isOn = selected.contains(uid)
                Button {
                    if isOn { selected.removeAll { $0 == uid } }
                    else { selected.append(uid) }
                } label: {
                    HStack(spacing: 6) {
                        InitialsAvatar(userId: uid, name: users.shortName(for: uid), size: 20, border: false)
                        Text(users.shortName(for: uid) ?? "user")
                            .font(.sans(11, weight: .semibold))
                            .foregroundStyle(isOn ? .white : Tokens.ink)
                    }
                    .padding(.horizontal, 8).padding(.vertical, 4)
                    .background(isOn ? accent : Tokens.canvas)
                    .clipShape(Capsule())
                    .overlay(Capsule().strokeBorder(isOn ? .clear : Tokens.hairline, lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
        }
    }
}

// Simple flow layout — wraps children across lines respecting width.
struct FlowLayout: Layout {
    var spacing: CGFloat = 6
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var rowWidth: CGFloat = 0
        var rowHeight: CGFloat = 0
        var totalHeight: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if rowWidth + s.width > width, rowWidth > 0 {
                totalHeight += rowHeight + spacing
                rowWidth = 0; rowHeight = 0
            }
            rowWidth += s.width + spacing
            rowHeight = max(rowHeight, s.height)
        }
        return CGSize(width: width.isInfinite ? rowWidth : width, height: totalHeight + rowHeight)
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX
        var y = bounds.minY
        var rowHeight: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x + s.width > bounds.maxX, x > bounds.minX {
                y += rowHeight + spacing
                x = bounds.minX
                rowHeight = 0
            }
            v.place(at: CGPoint(x: x, y: y), proposal: .init(s))
            x += s.width + spacing
            rowHeight = max(rowHeight, s.height)
        }
    }
}
