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
        .onAppear {
            draft = cards.card(id: cardId)
            Task.detached(priority: .userInitiated) {
                await users.refresh()
                await insights.refresh(cardId: cardId)
            }
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
                    // MARK: - F-194 status
                    statusSection(card: binding)
                    // MARK: - F-177 description
                    descriptionSection(card: binding)
                    // MARK: - F-178 tags
                    tagsSection(card: binding)
                    // MARK: - F-188..F-189 due date
                    dueDateSection(card: binding)
                    // MARK: - F-190..F-192 attachments
                    attachmentsSection(card: binding.wrappedValue)
                    // MARK: - F-193 assignees
                    assigneesSection(card: binding)
                    // MARK: - F-194 shares
                    sharesSection(card: binding)
                    // MARK: - F-181..F-187 knowledge
                    knowledgeSection()
                    // MARK: - F-218..F-237 AI insights
                    aiInsightsSection()
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
        VStack(alignment: .leading, spacing: 4) {
            SectionLabel("Title")
            TextField("", text: card.title)
                .textFieldStyle(.plain)
                .font(.serif(18, weight: .semibold))
                .padding(.vertical, 8).padding(.horizontal, 10)
                .background(Tokens.surface)
                .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Tokens.hairline, lineWidth: 1))
        }
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
        VStack(alignment: .leading, spacing: 4) {
            SectionLabel("Description")
            TextEditor(text: card.description)
                .font(.sans(13))
                .scrollContentBackground(.hidden)
                .frame(minHeight: 120, maxHeight: 240)
                .padding(8)
                .background(Tokens.surface)
                .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Tokens.hairline, lineWidth: 1))
        }
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

    private func sharesSection(card: Binding<Card>) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            SectionLabel("Shared with")
            UserPillGrid(
                userIds: users.users.map(\.id),
                selected: card.shares,
                accent: Tokens.greenUplift
            )
        }
    }

    private func knowledgeSection() -> some View {
        DisclosureGroup {
            Text("Knowledge linking lands in Phase 7.")
                .font(.sans(11)).foregroundStyle(Tokens.ink3)
                .padding(.vertical, 4)
        } label: {
            SectionLabel("Knowledge")
        }
    }

    private func aiInsightsSection() -> some View {
        AiInsightsPanelView(cardId: cardId)
    }

    private func chatPlaceholder() -> some View {
        DisclosureGroup {
            Text("Chat & activity timeline lands in Phase 4f.")
                .font(.sans(11)).foregroundStyle(Tokens.ink3)
                .padding(.vertical, 4)
        } label: {
            SectionLabel("Chat & Activity")
        }
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
            SectionLabel("Tags")
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
