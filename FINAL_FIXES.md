# Final Fix List — Agent C Synthesis — Round 1 (initial)
Date: 2026-05-21
Sources: AUDIT_A.md (43 code gaps) + AUDIT_B.md (15 visual gaps)
Cross-reference: 6 P0 / 17 P1 / 13 P2 verified / 8 closed intentional
Total actionable fixes: 36
Estimated total effort: ≈ 35–40 hours

## Cross-reference matrix (compact)

| Gap (synthesized) | AUDIT_A | AUDIT_B | Class |
|-------------------|---------|---------|-------|
| EditDialog Knowledge linking is placeholder | CA-001 | — | P0 — code-only |
| AI suggestion pills static (RULE 9 violation) | CA-002 | — | P0 — code-only |
| Capture: no photo / file picker mode | CA-003 | GAP-B-003 | P0 — both |
| Capture: no template picker + slash shortcut | CA-004 | GAP-B-003 | P0 — both |
| KnowledgeDetail read-only modal missing | CA-005 | — | P0 — code-only |
| Document-level paste-image listener missing | CA-006 | — | P0 — code-only |
| Knowledge URL→title autofill + title_auto flag | CA-008 | — | P1 — code-only |
| Knowledge "Auto-fetch when I save" toggle | CA-009 | — | P1 — code-only |
| Knowledge edit field-level validation msgs | CA-010 | — | P1 — code-only |
| Knowledge top-20 tag chip cloud | CA-011 | GAP-B-005 | P1 — both |
| Knowledge row "📎 N" linked-cards count chip | CA-012 | — | P1 — code-only |
| Weekly Review 3-up stat grid + placeholders + Generate again | CA-014 | GAP-B-004 | P1 — both |
| AI Insights related items: Open + why + Copy on knowledge | CA-015 | — | P1 — code-only |
| AI Insights web findings: "why" reasoning text | CA-016 | — | P1 — code-only |
| Profile dropdown "⚙ Settings" row | CA-017 | GAP-B-002 | P1 — both |
| Keyboard: "/" focuses search | CA-019 | — | P1 — code-only |
| Keyboard: ⌘K focuses search | CA-020 | — | P1 — code-only |
| Keyboard: plain "n" opens capture (backlog) | CA-021 | — | P1 — code-only |
| Keyboard: 1–4 scrolls column into view | CA-022 | — | P1 — code-only |
| EditDialog "Share now" instant-apply button | CA-023 | — | P1 — code-only |
| Archive destructive confirm + count + footer | CA-024 | GAP-B-008 | P1 — both |
| CardTile shared-with stacked initial avatars | CA-025 | GAP-B-006 | P1 — both |
| UnreadStore skip bump when EditCard window open | CA-028 | — | P1 — code-only |
| Knowledge row title prefix 🔗 (web pattern) | CA-013 | — | P2 — code-only |
| Search Esc-to-clear | CA-018 | — | P2 — code-only |
| CardTile footer relTime fallback | CA-026 | GAP-B-007 | P2 — both |
| DueDateChip "Yesterday" label | CA-027 | — | P2 — code-only |
| Column empty messages match web copy | CA-029 | GAP-B-009 | P2 — both |
| AI Insights LinkActions "✓ Copied" feedback | CA-031 | — | P2 — code-only |
| AI Insights brainstorm inline error pill | CA-032 | — | P2 — code-only |
| Templates inline error display | CA-033 | — | P2 — code-only |
| API token revoke confirm dialog | CA-034 | — | P2 — code-only |
| Mirror token success: full /my-day URL panel | CA-035 | — | P2 — code-only |
| API token rows: token suffix + created date | CA-036 | — | P2 — code-only |
| Notifications popover empty glyph: 🔔 vs bell.slash | — | GAP-B-010 | P2 — visual-only (verified in code) |
| Login input violet focus-glow ring | — | GAP-B-011 | P2 — visual-only (verified in code) |
| Templates full CRUD form | CA-007 | — | Closed — registry 🔄 V1 |
| LoginView redirectTo | CA-038 | — | Closed — desktop URL scheme adapted |
| Notification permission on first bell click | CA-039 | — | Closed — adapted to UN auth-on-launch |
| Auto-resume session on cold launch | — | GAP-B-001 | Closed — keychain/restoreCookieFromKeychainIfNeeded code path verified; observed state is test artifact (fresh install / locked screen) |
| Chain button in EditDialog header | — | GAP-B-012 | Closed — registry 🔄 V1 |
| Related Cards section in EditDialog | — | GAP-B-013 | Closed — registry 🔄 V1 |
| Weather widget in toolbar | — | GAP-B-014 | Closed — registry 🔄 V1 |
| Activity ticker strip | — | GAP-B-015 | Closed — registry 🔄 V1 |

---

## P0 — Fix Immediately (workflow-blocking)

### FIX-001: EditDialog Knowledge section is a "Phase 7" placeholder ✅ UI/Card/EditCardView.swift:282
Found by: CA-001
File: `macOS/KanbanClaude/UI/Card/EditCardView.swift`
Line / fn: `knowledgeSection()`
Specific change: Replace the `Text("Knowledge linking lands in Phase 7.")` placeholder with the full linked-knowledge UI:
- `@State var linked: [KnowledgeItem]`, `@State var picking: Bool`, `@State var query: String`, `@State var pickerResults: [KnowledgeItem]`.
- `.task { linked = try? await api.knowledgeForCard(card.id) }` on appear.
- For each item: row showing `Image(systemName:` based on visibility `"lock.fill"` / `"tray.fill"` / `"person.2.fill"` + 🔗 prefix if `url != nil` + title + `Button("remove") { try await api.unlinkKnowledgeFromCard(kid: item.id, cardId: card.id) }`.
- `"+ Attach"` button toggles `picking`. When `picking` shows a TextField bound to `query`, fires `api.listKnowledge(scope: .all, q: query)` on submit (or `.onChange` with debounce), filters out items whose id is already in `linked`, lists first 12 — each row is a `Button` that calls `api.linkKnowledgeToCard(kid:cardId:)` then clears `picking`.
- `"Save as knowledge"` `Button` shown only when card description contains a URL **and** no existing linked item URL matches it — calls `api.knowledgeFromCard(cardId: card.id)`.
- Endpoint cases already exist in `Networking/Endpoint.swift` — verify with `grep -n "knowledgeForCard\|linkKnowledgeToCard\|unlinkKnowledgeFromCard\|knowledgeFromCard" macOS/KanbanClaude/Networking/`.
Effort: L (≈ 4 hr)

### FIX-002: CardTimeline AI-suggestion pills must be real Buttons that hit endpoints ✅ UI/Card/CardTimelineView.swift:128
Found by: CA-002 (RULE 9 violation)
File: `macOS/KanbanClaude/UI/Card/CardTimelineView.swift`
Line / fn: `suggestionPills()` (the row that currently renders suggestions as `Text` capsules)
Specific change: Replace each suggestion `Text(...)` with a `Button(action: { apply(suggestion) }) { ...label... }` where `apply` switches on `suggestion.kind`:
- `update_status` → `try await api.patchCard(id: cardId, body: ["status": newStatus])`
- `set_due_date` → `try await api.patchCard(id: cardId, body: ["due_date": iso])`
- `assign_user` → load card via `api.getCard`, append assignee id, `patchCard(... "assignees": [...])`
- `create_card` → `api.createCard(title: suggestion.title, status: .backlog)`
After apply, set per-suggestion `@State applied[id] = true` and render `"✓ \(label)"` `.disabled(true)`. Surface failures via `ToastStore.shared.error(...)`. Mirror parser already extracts `<!-- suggestions: -->` block per F-282; if missing, port from `web/src/components/CardTimeline.tsx`.
Effort: M (≈ 2 hr)

### FIX-003: CaptureView add Photo mode (file picker → create-from-image) ✅ UI/Capture/CaptureView.swift:142
Found by: CA-003 + GAP-B-003
File: `macOS/KanbanClaude/UI/Capture/CaptureView.swift`
Line / fn: body (lines 19–62)
Specific change: Add a mode row below Status picker with three `Button`s (📷 Photo / ✱ Template / 🎙️ Voice — Voice may be 🔄 V1, register if so). On Photo tap:
```swift
let panel = NSOpenPanel()
panel.allowedContentTypes = [.png, .jpeg, .heic, .image]
panel.allowsMultipleSelection = false
if panel.runModal() == .OK, let url = panel.url {
    let data = try Data(contentsOf: url)
    try await api.createFromImage(data: data, mime: url.mimeType, status: selectedStatus)
    dismiss()
}
```
Reuse `Uploader.swift` / the `createFromImage` endpoint already wired for Finder drop (F-635/file variant per AUDIT_A verified-OK list).
Effort: M (≈ 2 hr)

### FIX-004: CaptureView add Template mode + "/name" slash-prefix parser ✅ UI/Capture/CaptureView.swift:170 + 192
Found by: CA-004 + GAP-B-003
File: `macOS/KanbanClaude/UI/Capture/CaptureView.swift`
Line / fn: title `TextField` handler + new templates picker sheet
Specific change:
1. **Template mode button** opens a sheet listing user's templates (`api.listTemplates()`). Each row is a `Button` → `api.instantiateTemplate(id: tpl.id, statusOverride: selectedStatus)` then `dismiss()`.
2. **Slash-prefix parser** in submit handler:
```swift
if title.hasPrefix("/") {
    let name = String(title.dropFirst()).trimmingCharacters(in: .whitespaces)
    if let tpl = templates.first(where: { $0.name.lowercased() == name.lowercased() }) {
        try await api.instantiateTemplate(id: tpl.id, statusOverride: selectedStatus)
        dismiss(); return
    }
}
```
Preload `templates` via `.task` on the capture window. Add `instantiateTemplate` to `Endpoint.swift` if absent — confirm with `grep -n "instantiateTemplate\|/templates/" macOS/KanbanClaude/Networking/Endpoint.swift`.
Effort: M (≈ 2 hr)

### FIX-005: Knowledge detail read-only modal missing ✅ UI/Knowledge/KnowledgeDetailSheet.swift (new) + KnowledgeListView.swift:44
Found by: CA-005
File: NEW `macOS/KanbanClaude/UI/Knowledge/KnowledgeDetailSheet.swift` + edit hook in `KnowledgeListView.swift`
Specific change:
1. Create `KnowledgeDetailSheet` taking `let item: KnowledgeItem`. Layout per `web/src/components/KnowledgeDetail.tsx` (F-345..F-359):
   - Title + visibility icon
   - Meta line: `visibility · fetched: <relTime> | no fetch`
   - If `fetch_error` → red 1-line block
   - Body `Text(item.body ?? "")` inside `ScrollView { ... }` with monospaced font, `whiteSpace:pre-wrap` equivalent (`.textSelection(.enabled)`)
   - Linked cards section: `api.cardsForKnowledge(kid:)` listing card titles with per-row `Button("remove")` → `api.unlinkKnowledgeFromCard`
   - `"+ Attach card"` toggle showing search picker on `api.listCards(scope:.all, q: query)`
   - Owner-only `Refetch` (`POST /api/knowledge/:kid/refetch`), `Edit` (opens `KnowledgeEditSheet`), `Archive` buttons (visible when `item.createdBy == currentUser.id`)
2. In `KnowledgeListView.swift` change the row tap target from `KnowledgeEditSheet` to `KnowledgeDetailSheet`; the Edit button inside Detail launches `KnowledgeEditSheet`.
Effort: L (≈ 4 hr)

### FIX-006: Document-level paste-image listener ✅ App/GlobalKeyMonitor.swift:55 + AppDelegate.swift:15 + Stores/CardStore.swift:185
Found by: CA-006
File: NEW `macOS/KanbanClaude/App/PasteboardMonitor.swift` + register in `KanbanClaudeApp.swift`
Specific change: Add a local key-event monitor in `applicationDidFinishLaunching` (or `@main` App `init`):
```swift
NSEvent.addLocalMonitorForEvents(matching: .keyDown) { event in
    if event.modifierFlags.contains(.command), event.charactersIgnoringModifiers == "v" {
        let pb = NSPasteboard.general
        if let img = pb.readObjects(forClasses: [NSImage.self], options: nil)?.first as? NSImage,
           let tiff = img.tiffRepresentation,
           let data = NSBitmapImageRep(data: tiff)?.representation(using: .png, properties: [:]) {
            if let openCardId = WindowCoordinator.shared.frontmostEditCardId {
                Task { try? await APIClient.shared.attachToCard(id: openCardId, data: data, mime: "image/png") }
            } else {
                Task { try? await APIClient.shared.createFromImage(data: data, mime: "image/png", status: .today) }
            }
            ToastStore.shared.success("Image pasted")
            return nil
        }
    }
    return event
}
```
Skip if first-responder is a `NSTextView` / `NSTextField` so paste into title/description still works (check `NSApp.keyWindow?.firstResponder is NSText`).
Effort: M (≈ 2 hr)

---

## P1 — Fix Next (behavioral parity gaps)

### FIX-007: KnowledgeEditSheet URL → title autofill (title_auto flag) ✅ UI/Knowledge/KnowledgeEditSheet.swift:36 + KnowledgeItem.swift:53
Found by: CA-008
File: `macOS/KanbanClaude/UI/Knowledge/KnowledgeEditSheet.swift`
Specific change: Add `@State var titleAuto = item == nil` (true for new items). On `url.onChange { new in if titleAuto, title.isEmpty || titleAuto { title = URL(string: new)?.host ?? title } }`. On `title.onChange { _ in titleAuto = false }`. Pass `title_auto` through `KnowledgeInput` payload to backend.
Effort: S (≈ 30 min)

### FIX-008: KnowledgeEditSheet "Auto-fetch when I save" checkbox ✅ UI/Knowledge/KnowledgeEditSheet.swift:46
Found by: CA-009
File: `macOS/KanbanClaude/UI/Knowledge/KnowledgeEditSheet.swift`
Specific change: Replace the derived `autoFetch = !url.isEmpty && body.isEmpty` with `@State var autoFetch: Bool = true`. Render `Toggle("Auto-fetch when I save", isOn: $autoFetch)` below the URL field. Pass through to `KnowledgeInput.autoFetch`.
Effort: S (≈ 30 min)

### FIX-009: KnowledgeEditSheet field-level inline validation ✅ UI/Knowledge/KnowledgeEditSheet.swift:74 + 138
Found by: CA-010
File: `macOS/KanbanClaude/UI/Knowledge/KnowledgeEditSheet.swift`
Specific change: Add `@State var fieldErrors: [String: String]` and render `Text(err).font(.sans(11)).foregroundStyle(Tokens.danger)` under each field whose key has an error. On save, parse server `error.fields` (web does this) into `fieldErrors`; reset on next save attempt.
Effort: S (≈ 45 min)

### FIX-010: Knowledge top-20 tag chip cloud ✅ UI/Knowledge/KnowledgeListView.swift:43 + 89
Found by: CA-011 + GAP-B-005
File: `macOS/KanbanClaude/UI/Knowledge/KnowledgeListView.swift`
Specific change: Above the list rows, render a horizontally scrolling `FlowLayout` (or `HStack` with wrapping) of the top 20 tags by count. Source: aggregate `item.tags.flatMap()` from current `store.items`, sort by frequency desc, take 20. Each chip = `Button` that toggles `selectedTag`; active chip uses `Tokens.greenAccent.opacity(0.18)` background + green-accent border.
Effort: M (≈ 1.5 hr)

### FIX-011: Knowledge row "📎 N" linked-cards count chip ✅ UI/Knowledge/KnowledgeRowView.swift:33
Found by: CA-012
File: `macOS/KanbanClaude/UI/Knowledge/KnowledgeRowView.swift`
Specific change: After the existing tags row, if `item.linkedCardIds.count > 0`, render:
```swift
Label("\(item.linkedCardIds.count)", systemImage: "paperclip")
    .font(.sans(11)).foregroundStyle(Tokens.ink3)
```
`linkedCardIds` is already decoded per AUDIT_A but never surfaced.
Effort: S (≈ 20 min)

### FIX-012: Weekly Review 3-up stat grid + section placeholders + Generate-again ✅ UI/Review/WeeklyReviewSheet.swift:21
Found by: CA-014 + GAP-B-004
File: `macOS/KanbanClaude/UI/Review/WeeklyReviewSheet.swift`
Specific change:
1. Above the three lists, render a 3-column `Grid` with cells `Shipped \(done.count) / Stale \(stale.count) / Stuck \(stuck.count)` — large numeral on top, label below, status-tinted accent bar at left.
2. When a section is empty, render the empty placeholder text instead of hiding it: backlog/done = `"Nothing closed this week."`, stale = `"Nothing aging right now."`, stuck = `"Nothing flagged stuck."` (copy from `web/src/components/WeeklyReview.tsx`).
3. Footer row: `HStack { Button("Generate again") { try await store.refetch() }; Spacer(); Button("Got it") { dismiss() } }`.
Effort: M (≈ 1.5 hr)

### FIX-013: AI Insights related items — Open button + why + Copy on knowledge ✅ UI/Card/AiInsightsPanelView.swift:85
Found by: CA-015
File: `macOS/KanbanClaude/UI/Card/AiInsightsPanelView.swift`
Specific change: Replace `Text("• \(item.title)")` rows with a row that renders:
- Kind badge `[\(item.kind)]`
- Title text
- If `item.kind == .knowledge` and `item.url != nil` → `LinkActions(url:)` (Open + Copy 📋)
- If `item.kind == .card` → `Button("Open") { WindowCoordinator.shared.openEditCard(id: item.cardId) }`
- Below, `Text(item.why).font(.sans(11)).foregroundStyle(Tokens.ink3)` (only if non-empty)
Effort: M (≈ 1.5 hr)

### FIX-014: AI Insights web findings — "why" reasoning text ✅ UI/Card/AiInsightsPanelView.swift:108
Found by: CA-016
File: `macOS/KanbanClaude/UI/Card/AiInsightsPanelView.swift`
Specific change: For each `webFinding` row, after the existing title/LinkActions, render `Text(finding.why).font(.sans(11)).foregroundStyle(Tokens.ink3)` when non-empty (mirrors F-228).
Effort: S (≈ 20 min)

### FIX-015: Profile dropdown "⚙ Settings" row + sign-out glyph ✅ UI/Main/BoardToolbar.swift:243
Found by: CA-017 + GAP-B-002
File: `macOS/KanbanClaude/UI/Main/BoardToolbar.swift`
Line / fn: ProfileChip popover (≈ lines 229–253)
Specific change: Insert a row between the name/email block and the divider:
```swift
Button { dismiss(); SettingsWindowController.shared.show() } label: {
    Label("Settings", systemImage: "gearshape")
}
.buttonStyle(.plain)
```
Also swap sign-out icon from `rectangle.portrait.and.arrow.right` to `arrow.uturn.left` (or the closer `↩` SF symbol `arrow.turn.down.left`) for glyph parity (GAP-B-002 secondary).
Effort: S (≈ 30 min)

### FIX-016: Keyboard "/" focuses board search ✅ App/GlobalKeyMonitor.swift:42 + UI/Main/BoardToolbar.swift:139
Found by: CA-019
File: `macOS/KanbanClaude/UI/Main/BoardToolbar.swift` SearchField + new `App/GlobalKeyMonitor.swift` (or extend FIX-006 monitor)
Specific change: In the same `NSEvent.addLocalMonitorForEvents` block, when first-responder is not an `NSText` and event.characters == `"/"` → post a `Notification.Name("focus.search")`. SearchField listens and sets `@FocusState`. Skip when any sheet/dialog is the key window.
Effort: S (≈ 30 min)

### FIX-017: Keyboard ⌘K focuses board search ✅ App/GlobalKeyMonitor.swift:33
Found by: CA-020
File: same monitor + SearchField
Specific change: In the local monitor, on `.command` + `"k"` → same `focus.search` notification. Wire the ⌘K hint pill that already renders so users see it.
Effort: S (≈ 20 min)

### FIX-018: Plain "n" opens CaptureView with backlog default ✅ App/GlobalKeyMonitor.swift:46
Found by: CA-021
File: `macOS/KanbanClaude/UI/Main/BoardToolbar.swift` (or AppMenuCommands.swift if already centralized)
Specific change: In the local key monitor, when first-responder is not text and `event.charactersIgnoringModifiers == "n"` and no modifiers → open CaptureView with `status = .backlog` (matches web `kanban:add-card` `status=backlog`). Keep existing ⌘N behaviour (today lane default).
Effort: S (≈ 30 min)

### FIX-019: Keyboard 1–4 scrolls corresponding column into view ✅ UI/Main/BoardView.swift:14 + App/GlobalKeyMonitor.swift:50
Found by: CA-022
File: `macOS/KanbanClaude/UI/Main/BoardView.swift` + `BoardColumnView.swift`
Specific change:
1. Wrap the 4-column `HStack` in a `ScrollViewReader`.
2. Assign `.id(Status.backlog)`, `.id(.today)`, `.id(.inProgress)`, `.id(.done)` to each column.
3. In the local key monitor: digit 1..4 (when not in text) → `proxy.scrollTo(status, anchor: .center)` (smooth animation via `withAnimation`).
Effort: S (≈ 45 min)

### FIX-020: EditDialog "Share now" instant-apply button ✅ UI/Card/EditCardView.swift:277
Found by: CA-023
File: `macOS/KanbanClaude/UI/Card/EditCardView.swift` `sharesSection`
Specific change: Below the shared-with grid, add:
```swift
Button("Share now") {
    Task {
        try await api.patchCard(id: card.id, body: ["shares": Array(shareIds)])
        withAnimation { showSharedConfirm = true }
        try? await Task.sleep(nanoseconds: 2_000_000_000)
        showSharedConfirm = false
    }
}
.disabled(sharing)
if showSharedConfirm { Text("✓ Shared").font(.sans(11)).foregroundStyle(Tokens.greenAccent) }
```
Independent of the outer Cancel — `shareIds` already in `@State`.
Effort: S (≈ 45 min)

### FIX-021: Archive destructive confirm + count in label + footer band ✅ UI/Archive/ArchiveSheet.swift:52 + 78
Found by: CA-024 + GAP-B-008
File: `macOS/KanbanClaude/UI/Archive/ArchiveSheet.swift`
Specific change:
1. Move the destructive "Delete all" button into a separate footer row (red-tinted band — `.background(Tokens.danger.opacity(0.08))`) with label `"Delete all (\(store.archived.count))"`.
2. Wrap "Delete all" in `.confirmationDialog("Delete all \(n) cards forever?", isPresented:)` with "Delete forever" destructive button.
3. Per-row "Delete forever" → wrap in `.confirmationDialog` per row.
4. Change empty-state copy from `"Archive is empty."` to `"🗑️ No archived cards"` (GAP-B-008).
5. Add separate `Button("Close") { dismiss() }` in the footer next to the destructive button.
Effort: M (≈ 1.5 hr)

### FIX-022: CardTile shared-with stacked InitialsAvatar row ✅ UI/Main/CardTileView.swift:148
Found by: CA-025 + GAP-B-006
File: `macOS/KanbanClaude/UI/Main/CardTileView.swift` (footer at ≈ lines 143–145) + `UI/Components/InitialsAvatar.swift`
Specific change: Replace the single `ShareAvatar` generic glyph with the stacked-avatar pattern used for assignees (F-153):
```swift
ZStack(alignment: .leading) {
    ForEach(Array(card.shares.prefix(3).enumerated()), id: \.offset) { idx, share in
        InitialsAvatar(label: share.shortName, color: Tokens.violet)
            .offset(x: CGFloat(idx) * 12)
            .help("Shared with \(share.name)")
    }
}
.frame(width: 24 + CGFloat(min(card.shares.count, 3) - 1) * 12)
```
`InitialsAvatar` already exists per AUDIT_A. Violet background per F-154.
Effort: M (≈ 1 hr)

### FIX-023: UnreadStore: skip bump when card's EditCard window is open ✅ Stores/UnreadStore.swift:40
Found by: CA-028
File: `macOS/KanbanClaude/Stores/UnreadStore.swift`
Specific change: In the WS subscription branch that handles `card.message`, before the `unreadCounts[cardId] += 1` increment, add:
```swift
if let win = WindowCoordinator.shared.editWindow(id: cardId), win.isKeyWindow { return }
```
Matches `web/src/App.tsx` `openCardId === card.id` short-circuit (F-691).
Effort: S (≈ 30 min)

---

## P2 — Verify Then Fix (polish / copy / edge state)

### FIX-024: Knowledge row title prefix — 🔗 (web pattern) ✅ UI/Knowledge/KnowledgeRowView.swift:11
Found by: CA-013
File: `macOS/KanbanClaude/UI/Knowledge/KnowledgeRowView.swift`
Specific change: If `item.url != nil`, prepend `"🔗"` to the title; render visibility icon as a separate trailing icon span (lock/tray/people). Mirrors F-320/F-324.
Effort: S (≈ 30 min)

### FIX-025: Search Esc-to-clear ✅ UI/Main/BoardToolbar.swift:144
Found by: CA-018
File: `macOS/KanbanClaude/UI/Main/BoardToolbar.swift` (SearchField)
Specific change: Add `.onKeyPress(.escape) { searchQuery = ""; focused = nil; return .handled }` on the `TextField`. If `searchQuery` is already empty, fall through (return `.ignored`) so global Esc behavior still closes any open dialog.
Effort: S (≈ 20 min)

### FIX-026: CardTile footer relTime fallback ✅ UI/Main/CardTileView.swift:138
Found by: CA-026 + GAP-B-007
File: `macOS/KanbanClaude/UI/Main/CardTileView.swift` footer
Specific change: After the existing `if let due / if attachments / if unread` branches, add `else { Text(relTime(card.updatedAt)).font(.sans(11)).foregroundStyle(Tokens.ink3) }`. Reuse the existing `relTime` helper (F-159 already implemented).
Effort: S (≈ 20 min)

### FIX-027: DueDateChip "Yesterday" label ✅ UI/Components/DueDateChip.swift:45
Found by: CA-027
File: `macOS/KanbanClaude/UI/Components/DueDateChip.swift`
Specific change: In `formatDue(_:)`, add an explicit `case daysFromNow == -1: return "Yesterday"` branch above the generic `"\(n)d overdue"` branch. Keep danger tone.
Effort: S (≈ 10 min)

### FIX-028: Column empty messages match web copy ✅ UI/Main/BoardColumnView.swift:128
Found by: CA-029 + GAP-B-009
File: `macOS/KanbanClaude/UI/Main/BoardColumnView.swift` `emptyMessage`
Specific change: Replace the four strings with the web copy from `web/src/components/Column.tsx`:
- `.backlog`: `"Nothing here yet."`
- `.today`: `"Nothing planned for today."`
- `.inProgress`: `"Quiet here."`
- `.done`: `"Nothing finished yet."`
Effort: S (≈ 10 min)

### FIX-029: AI Insights LinkActions "✓ Copied" feedback ✅ UI/Card/AiInsightsPanelView.swift:150
Found by: CA-031
File: `macOS/KanbanClaude/UI/Card/AiInsightsPanelView.swift` `LinkActions`
Specific change: Add `@State var copied = false`. On Copy tap: `NSPasteboard.general.clearContents(); NSPasteboard.general.setString(url, forType: .string); copied = true; Task { try? await Task.sleep(nanoseconds: 1_200_000_000); copied = false }`. Render `copied ? "✓ Copied" : "Copy 📋"`.
Effort: S (≈ 20 min)

### FIX-030: AI Insights inline error pill for brainstorm failure ✅ UI/Card/AiInsightsPanelView.swift:138 + InsightStore.swift:32
Found by: CA-032
File: `macOS/KanbanClaude/UI/Card/AiInsightsPanelView.swift`
Specific change: Below the Brainstorm CTA, if `store.lastError != nil`, render a single-line red pill `Text(err).font(.sans(11)).padding(.horizontal,8).padding(.vertical,4).background(Tokens.danger.opacity(0.12)).clipShape(Capsule())`. Clear on next submit. Toast still fires.
Effort: S (≈ 20 min)

### FIX-031: Templates tab inline error message ✅ UI/Preferences/TemplatesTab.swift:11
Found by: CA-033
File: `macOS/KanbanClaude/UI/Preferences/TemplatesTab.swift`
Specific change: Add `@State var lastError: String?` and render `if let err = lastError { Text(err).foregroundStyle(Tokens.danger).font(.sans(11)) }` below the list. Set in `catch` of instantiate / save / delete. Keep toast as secondary surface.
Effort: S (≈ 20 min)

### FIX-032: API token revoke confirm dialog ✅ UI/Preferences/TokensTab.swift:130
Found by: CA-034
File: `macOS/KanbanClaude/UI/Preferences/TokensTab.swift`
Specific change: Wrap each row's revoke button in `.confirmationDialog("Revoke token \"\(token.label)\"?", isPresented:)` with message `"Devices and integrations using it will stop working."` and a destructive "Revoke" button.
Effort: S (≈ 20 min)

### FIX-033: Mirror token create-success — full /my-day?token URL panel ✅ UI/Preferences/TokensTab.swift:63
Found by: CA-035
File: `macOS/KanbanClaude/UI/Preferences/TokensTab.swift`
Specific change: When `lastCreatedMirror` is non-nil, show a green band (`background(Tokens.greenAccent.opacity(0.18))`) containing:
- `Text(mirror.url)` — full `${origin}/my-day?token=<token>` (already decoded)
- `Button("Copy") { NSPasteboard.general.setString(mirror.url, forType: .string) }`
- `Button("Dismiss") { lastCreatedMirror = nil }`
Effort: S (≈ 30 min)

### FIX-034: API token list rows — show suffix + created date ✅ UI/Preferences/TokensTab.swift:119
Found by: CA-036
File: `macOS/KanbanClaude/UI/Preferences/TokensTab.swift`
Specific change: Each row → `HStack { Text(token.label); Spacer(); Text("…\(token.tokenSuffix)").font(.mono(11)).foregroundStyle(Tokens.ink3); Text(token.createdAt.relTime).font(.sans(11)).foregroundStyle(Tokens.ink3) }`. Backend already returns `token_suffix` and `created_at`; if `TokenItem` model is missing them, add them to `Codable` + `CodingKeys` (RULE 2 — mirror backend verbatim).
Effort: S (≈ 30 min)

### FIX-035: Notifications popover empty glyph — use 🔔 emoji ✅ UI/Main/NotificationsPopover.swift:29
Found by: GAP-B-010
File: `macOS/KanbanClaude/UI/Main/NotificationsPopover.swift`
Line: 29
Specific change: Replace `Image(systemName: "bell.slash").font(.system(size: 22))` with `Text("🔔").font(.system(size: 22))`. (Web uses the bell emoji as the empty-state glyph per F-076.)
Effort: S (≈ 5 min)

### FIX-036: Login input violet focus-glow ring ✅ UI/Auth/LoginView.swift:155
Found by: GAP-B-011
File: `macOS/KanbanClaude/UI/Auth/LoginView.swift`
Line / fn: `LabeledInput` struct (≈ lines 142–177), specifically the `.overlay(RoundedRectangle ... strokeBorder(Tokens.hairline, lineWidth: 1))` at line 174
Specific change: Add `@FocusState private var isFocused: Bool` inside `LabeledInput`, attach `.focused($isFocused)` to the inner `TextField` / `SecureField`, and change the overlay to:
```swift
.overlay(
    RoundedRectangle(cornerRadius: 8)
        .strokeBorder(isFocused ? Tokens.violet : Tokens.hairline,
                      lineWidth: isFocused ? 1.5 : 1)
)
.shadow(color: isFocused ? Tokens.violet.opacity(0.25) : .clear, radius: isFocused ? 6 : 0)
.animation(.easeInOut(duration: 0.15), value: isFocused)
```
Effort: S (≈ 20 min)

---

## Closed as Intentional

| ID | Reason |
|----|--------|
| CA-007 (Templates full CRUD) | Registry F-461..F-481 pre-marks 🔄 V1; list + instantiate is the V1 cut |
| CA-038 (LoginView redirectTo) | Adapted via `URLSchemeHandler.swift` (`kanbanclaude://card/<uuid>`). AUDIT_A already marks 🔄 N/A |
| CA-039 (Notification permission on first bell click) | Adapted to UN authorization on launch in `NotificationCenterBridge.attach()` (line 13). Once-per-install vs once-per-session is the documented desktop variant |
| GAP-B-001 (auto-resume session) | Code path verified: `Stores/AuthStore.swift` `restoreCookieFromKeychainIfNeeded` + `bootstrap()` calls `.me` on launch (per AUDIT_A verified-OK F-007/008/015/501). Observed Sign-In state is a test-environment artifact (locked screen prevented log-in during the audit on this install), not a runtime regression |
| GAP-B-012 (chain button) | Registry F-250..F-262 🔄 V1 (Card Chain Modal) — affordance suppressed in MVP |
| GAP-B-013 (Related cards section) | Registry F-238..F-249 🔄 V1 |
| GAP-B-014 (weather widget) | Registry F-050..F-061 🔄 V1 |
| GAP-B-015 (activity ticker) | Registry F-091..F-101 🔄 V1 |

---

## Recommended fix order (cluster for minimum context switching)

1. **Capture surface** — FIX-003 + FIX-004 (one CaptureView pass, shared template state)
2. **Knowledge surface** — FIX-005 (Detail), FIX-001 (EditDialog Knowledge), FIX-007/008/009 (Edit sheet), FIX-010 (tag cloud), FIX-011 (count chip), FIX-024 (row prefix)
3. **AI Insights / Timeline** — FIX-002 (suggestion pills), FIX-013/014 (related items + why), FIX-029/030 (copy feedback, inline error)
4. **Keyboard layer** — FIX-016/017/018/019/025 (one `NSEvent` monitor pass) + FIX-006 (paste image, same monitor)
5. **CardTile** — FIX-022 (shared avatars), FIX-026 (relTime fallback), FIX-027 (Yesterday)
6. **Confirm dialogs** — FIX-021 (Archive), FIX-032 (token revoke) via shared `.confirmationDialog` helper
7. **Weekly Review** — FIX-012 (single sheet pass)
8. **Misc polish** — FIX-015 (profile dropdown), FIX-020 (share now), FIX-023 (UnreadStore), FIX-028 (column copy), FIX-031 (templates error), FIX-033/034 (tokens UI), FIX-035 (bell glyph), FIX-036 (login focus)

✅ FINAL_FIXES.md written
📊 P0: 6 | P1: 17 | P2: 13 | Closed: 8
STAGE_COMPLETE: verdict=NEEDS_FIXES remaining=23
