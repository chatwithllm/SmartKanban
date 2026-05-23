# Final Fix List — Agent C Synthesis — Round 1
Date: 2026-05-21
Sources: AUDIT_A2.md (15 new gaps + 2 ⚠ fix-verification rows) + AUDIT_B2.md (2 new gaps + 1 ⚠ fix-verification row)
Cross-reference: 1 P0 (both found) / 3 P1 (code-only behavioral) / 1 P2 visual-only verified / 13 P2 code-only polish
Total actionable fixes: 18 (P0 + P1 + P2 polish)
Estimated total effort: ~6 hours (P0 + P1 ≈ 2.5 hr; P2 polish ≈ 3.5 hr)

## Cross-Reference Matrix

| Gap | In A? | In B? | Type | Synthesizer priority |
|-----|-------|-------|------|----------------------|
| FIX-022 share-avatar color drift (hashed vs violet) | CA2-014 (P2) | NEW-GAP-B2-002 (P2 + FIX-022 ⚠) | Color drift on completed FIX | **P0** — both auditors found AND fix verification partial |
| FIX-009 server `error.fields` parsing not landed | FIX-009 ⚠ partial (A's P1 list) | FIX-009 ✅ (B verified plumbing only) | Behavior gap inside completed FIX | **P1** — A's stricter read confirmed in code |
| CA2-001 AI Insights related-knowledge w/o URL has no Open affordance | CA2-001 (A's P1) | — | Code-only behavioral | **P1** — workflow gap, spot-check confirmed |
| CA2-006 `showPreferencesWindow:` selector may no-op on macOS 13+ | CA2-006 (A's P1) | — | Code-only potential runtime bug | **P1** — both call sites use legacy selector |
| CA2-002 Weekly Review title/empty copy + per-row metadata diverge from web | CA2-002 (A P2) | — | Code-only copy drift | P2 |
| CA2-003 CardTimeline expanded by default | CA2-003 (A P2) | — | Code-only UX divergence | P2 |
| CA2-004 SearchField missing visual ✕ clear button | CA2-004 (A P2) | — | Code-only polish | P2 |
| CA2-005 Profile dropdown avatar hashed vs violet | CA2-005 (A P2) | — | Code-only color drift | P2 |
| CA2-007 NotificationRow missing hover state | CA2-007 (A P2) | — | Code-only polish | P2 |
| CA2-008 Archive footer band rendered when empty | CA2-008 (A P2) | — | Code-only polish | P2 |
| CA2-009 Capture template button shown when no templates | CA2-009 (A P2) | — | Code-only UX divergence | P2 |
| CA2-010 EditDialog section order vs web (Knowledge/AI below fold) | CA2-010 (A P2) | — | Code-only layout | P2 |
| CA2-011 Description section label redundant vs web | CA2-011 (A P2) | — | Code-only polish | P2 |
| CA2-012 Knowledge view header missing green-house band | CA2-012 (A P2) | — | Code-only adaptation (F-302 still ❌ in registry) | P2 |
| CA2-013 Archive count strip below header instead of inline badge | CA2-013 (A P2) | — | Code-only layout | P2 |
| CA2-015 `WindowCoordinator.openWeeklyReview()` dead code with stale toast | CA2-015 (A P2) | — | Code-only dead code | P2 |
| NEW-GAP-B2-001 Knowledge subtitle copy divergence | — | NEW-GAP-B2-001 (B P2) | Visual-only — spot-check confirms copy literal in code | P2 |

## Verdict Calculation

- p0_count = 1
- p1_count = 3
- p2_count = 13 (12 from A + 1 from B; CA2-005 / CA2-014 differ in location)
- intentional_closed = 0 (none of the A/B R2 gaps map to a closed 🔄 row in the registry; F-302 green-house band still ❌)
- fix_verification_failures = 2 (FIX-009 ⚠ both rounds, FIX-022 ⚠ in B / "color note" in A)
- SHIP_READY = false (p0 + p1 + fix_verification_failures > 0)

## Round 2 Fix Execution — 2026-05-21

- 17 fixes ✅ landed across 11 commits (cef387c..b172cc7).
- 0 partials, 0 deferred.
- Rule 14 visual diff deferred per I-1 (screen locked at session start).
- Rule 16 grep clean on every touched file before each commit.
- New gates: APIError.validation path, KnowledgeDetailWindowController standalone window, SettingsOpener dual fallback.

---

## P0 — Fix Immediately (both auditors found)

### ✅ FIX-V2-001: Card-tile share-avatar background — switch from hashed palette to solid violet
**Done:** added `colorOverride: Color?` to InitialsAvatar.swift:7; pass `Tokens.violet` from CardTileView.swift:157. Build green, app launched, log clean (only pre-existing notif perm log). Screen locked → Rule 14 visual diff deferred per I-1.
Found by: CA2-014 (A) + NEW-GAP-B2-002 (B) — also flagged as FIX-022 ⚠ partial by both auditors
File: `macOS/KanbanClaude/UI/Main/CardTileView.swift`
Line/function: lines 154–163, the `ZStack(alignment: .leading)` block iterating `card.shares.prefix(3)`
Original spec (FINAL_FIXES.md FIX-022): "swap the single icon for `ZStack { ForEach(card.shares.prefix(3)) { ShareAvatar(name: ...).offset(x: idx * 10) } }` — same `Tokens.violet` background palette as web (`bg-violet/40` for the share, distinct from assignee hashed colors)."
Specific change:
1. Replace `InitialsAvatar(userId: s.id, name: s.name, size: 18)` in the share stack with a violet-backed variant. Two options:
   - **(a) Inline view (preferred — single-call-site fix):** in the `ForEach`, render
     ```swift
     ZStack {
         Circle().fill(Tokens.violet)
         Text(initials(s.name)).font(.sans(9, weight: .semibold)).foregroundStyle(.white)
     }
     .frame(width: 18, height: 18)
     .overlay(Circle().strokeBorder(Tokens.surface, lineWidth: 1))
     .offset(x: CGFloat(idx) * 10)
     .help("Shared with \(s.name)")
     ```
     where `initials(_:)` is the same first-letter logic `InitialsAvatar` already uses.
   - **(b) Add overload `InitialsAvatar(label:size:color:)`** that accepts an explicit background color and use it from the share stack only.
2. Leave assignee stack at `CardTileView.swift` unchanged — assignees keep hashed palette per spec.
3. Keep `.help("Shared with \(s.name)")` tooltip.
Acceptance: macOS card with multiple shares renders solid-violet stacked avatars matching `web/src/components/CardView.tsx:262` (`background: 'rgb(var(--violet))'`).
Effort: S (≈ 20 min)

---

## P1 — Fix Next (code confirms missing behavior)

### ✅ FIX-V2-002: AI Insights — Related knowledge **without** URL has no Open affordance
**Done:** added `KnowledgeDetailWindowController` (UI/Knowledge/) hosting `KnowledgeDetailSheet` in a standalone window. `WindowCoordinator.openKnowledgeDetail(id:)` resolves item from store (refresh fallback) and opens window. AiInsightsPanelView.swift:133 added knowledge-without-URL branch with violet `Open` button. Build green.
Found by: CA2-001 (A) only — code spot-check confirms gap
File: `macOS/KanbanClaude/UI/Card/AiInsightsPanelView.swift`
Line/function: `relatedItemRow(_:)` lines 123–147, specifically the `if/else if` chain at 131–140
Web reference: `web/src/components/AiInsightsPanel.tsx:138–150` — when `r.kind === 'knowledge'` AND `r.url == null`, web renders an `Open` button that calls `onOpenKnowledge?.(r.id)`. macOS currently renders no action when knowledge has no URL, leaving the row read-only.
Specific change:
1. Extend the branch in `relatedItemRow` to handle knowledge-without-URL:
   ```swift
   if item.kind == "knowledge", let urlStr = item.url, let url = URL(string: urlStr) {
       LinkActions(url: url, urlString: urlStr)
   } else if item.kind == "knowledge" {
       Button {
           WindowCoordinator.shared.openKnowledgeDetail(id: item.id)
       } label: {
           Text("Open").font(.sans(11, weight: .semibold)).foregroundStyle(Tokens.violet)
       }
       .buttonStyle(.plain)
   } else if item.kind == "card" {
       Button { WindowCoordinator.shared.openEditCard(id: item.id) } label: { ... }
       .buttonStyle(.plain)
   }
   ```
2. If `WindowCoordinator.openKnowledgeDetail(id:)` does not yet exist, add it next to `openEditCard(id:)`. Behaviour: present `KnowledgeDetailSheet` (already implemented per FIX-005) loaded with the matching `KnowledgeItem` from `KnowledgeStore.shared`. If the item is not in the store, call `KnowledgeStore.shared.refresh()` first.
3. [NEEDS INVESTIGATION if `WindowCoordinator` cannot present a sheet outside a host view] — fall back to posting a Notification (`Notification.Name("openKnowledgeDetail")`) that `KnowledgeListView` or the host window listens for. Check existing patterns in `WindowCoordinator.swift` first.
Acceptance: clicking a knowledge-without-URL related item opens the read-only `KnowledgeDetailSheet` showing that knowledge note.
Effort: M (≈ 1.5 hr — most of the cost is verifying `WindowCoordinator` plumbing)

### ✅ FIX-V2-003: Settings selector may silently no-op on macOS 13+ (Ventura+)
**Done:** added `App/SettingsOpener.swift` with `showSettingsWindow:` → `showPreferencesWindow:` fallback. BoardToolbar.swift:251 and MainView.swift:37 both call `SettingsOpener.open()`. Build green, app launched, log clean.
Found by: CA2-006 (A) only — both call sites confirmed using legacy selector
Files:
- `macOS/KanbanClaude/UI/Main/BoardToolbar.swift:251` — profile-row Settings button
- `macOS/KanbanClaude/UI/Main/MainView.swift:37` — toolbar `onOpenSettings`
Current code (both lines):
```swift
NSApp.sendAction(Selector(("showPreferencesWindow:")), to: nil, from: nil)
```
Issue: macOS 13 (Ventura) renamed the SwiftUI `Settings { }` scene action to `showSettingsWindow:`. The pre-Ventura `showPreferencesWindow:` selector is still received by some scenes but is not the canonical target — Apple's docs explicitly use `showSettingsWindow:` from Ventura onward. On a 13+ build, sending only the legacy selector can silently no-op depending on the scene wiring.
Specific change:
1. Try both selectors with fall-through. Add a helper in a small extension (e.g. `App/SettingsOpener.swift` new file, or inline once in both call sites):
   ```swift
   enum SettingsOpener {
       static func open() {
           if NSApp.sendAction(Selector(("showSettingsWindow:")), to: nil, from: nil) { return }
           if NSApp.sendAction(Selector(("showPreferencesWindow:")), to: nil, from: nil) { return }
       }
   }
   ```
2. Replace both call sites with `SettingsOpener.open()`.
3. **Alternative (cleaner if minimum target is macOS 14+)**: drop the toolbar gear action and replace it with SwiftUI's `SettingsLink { ... }` (available 14.0+). The profile-row button still needs the helper above because `SettingsLink` cannot be invoked imperatively from outside a view.
4. Verify post-build by launching the app (when display unlocked) and clicking both Settings entry points — both must open the Preferences window. RULE 17 blocked verification this round; user-side smoke is acceptable for this fix.
Acceptance: clicking Settings from either the toolbar gear or the profile-row opens the Preferences window on macOS 13+ and 14+.
Effort: S (≈ 25 min, plus runtime verification user-side)

### ✅ FIX-V2-004: KnowledgeEditSheet — surface server-side `error.fields` map
**Done:** added `KanbanError.validation([String:String], String)` (Errors.swift:6). `APIClient.assertSuccess` now decodes `{ error: { fields, message } }` envelope for 4xx and throws the new case. `KnowledgeStore` exposes `createThrowing` / `patchThrowing`; legacy non-throwing wrappers suppress toast on `.validation`. `KnowledgeEditSheet.save()` catches `.validation` and merges fields into `fieldErrors`. Build green.
Found by: AUDIT_A2 fix-verification (FIX-009 ⚠ partial) — B verified plumbing exists, A verified server-side population is missing. Code spot-check confirms `save()` has no `do/catch` that reads server errors back into `fieldErrors`.
Files:
- `macOS/KanbanClaude/Networking/APIClient.swift` — extend error type
- `macOS/KanbanClaude/UI/Knowledge/KnowledgeEditSheet.swift:150–188` — wire server errors into `fieldErrors`
Web reference: `web/src/api.ts` parses `{ error: { fields: { title: "...", url: "..." } } }` from 4xx responses and routes the field map back to the form.
Specific change:
1. In `APIClient.swift`, locate the existing error type (likely `APIError` enum / struct). Add a case or associated value that carries `fields: [String: String]?`:
   ```swift
   struct APIError: Error, LocalizedError {
       let status: Int
       let message: String
       let fields: [String: String]?
       var errorDescription: String? { message }
   }
   ```
   Decode `fields` from the 4xx JSON body alongside the existing `message` parse in `APIClient.send(...)`. [NEEDS INVESTIGATION — check the exact `APIError` shape and where the 4xx body is parsed; add `fields` decode there.]
2. In `KnowledgeEditSheet.swift`, wrap the `KnowledgeStore.shared.create(input)` / `KnowledgeStore.shared.patch(item.id, patch)` call in a `do/catch`. On `catch let e as APIError where e.fields != nil`, merge `e.fields!` into `fieldErrors`. Example:
   ```swift
   do {
       _ = try await KnowledgeStore.shared.create(input)
       onClose()
   } catch let e as APIError where e.fields != nil {
       fieldErrors = e.fields!
   } catch is CancellationError {
       return
   } catch {
       // existing toast path via store.lastError if any
   }
   ```
   This requires `KnowledgeStore.create(_:)` / `patch(_:,_:)` to `throw` rather than swallow — confirm and adjust [NEEDS INVESTIGATION — check `Stores/KnowledgeStore.swift` for current error handling].
3. Acceptance: submit a knowledge edit that the backend rejects with `{ error: { fields: { title: "Title already used." } } }` and confirm the inline danger message appears under the Title field, not in a toast.
Effort: M (≈ 2 hr — APIError type extension + store throw plumbing + sheet catch)

---

## P2 — Verify Then Fix (visual only, now confirmed real)

### ✅ FIX-V2-005: Knowledge view subtitle copy
**Done:** KnowledgeListView.swift:118 → `"URLs, snippets, notes — all linked back to cards"`.
Found by: NEW-GAP-B2-001 (B) only — spot-check confirms copy literal in code
File: `macOS/KanbanClaude/UI/Knowledge/KnowledgeListView.swift:118`
Current: `"Notes, links, and references shared across the household."`
Specific change: replace with `"URLs, snippets, notes — all linked back to cards"` (verbatim from `web/src/KnowledgeView.tsx` per B2 DOM probe).
Effort: S (≈ 5 min)

---

## P2 — Code-Only Polish (A's P2 backlog)

Each is a small file-level edit. Group into a single follow-up "polish round 2" commit if convenient.

### ✅ FIX-V2-006: Weekly Review copy + per-row metadata — re-sync with web
**Done:** WeeklyReviewSheet section titles include counts (`Shipped (N)`, `Stale (N)`, `Stuck in progress (N)`). Empty copy now matches web: `No stale cards.`, `Nothing stuck.`. Per-row metadata renders `#tag` list instead of `rel(updatedAt)`.
Found by: CA2-002 (A) — copy spec in original FIX-012 itself diverged from web
File: `macOS/KanbanClaude/UI/Review/WeeklyReviewSheet.swift:28–45, 57–79`
Specific change:
1. Section titles: replace `"✅ Done this week"` → `"Shipped (\(data.done.count))"`; `"🪨 Stale (no update >7d)"` → `"Stale (\(data.stale.count))"`; `"⚠️ Stuck in flight (>3d)"` → `"Stuck in progress (\(data.stuck.count))"`.
2. Empty placeholders: `"Nothing closed this week."` (done), `"No stale cards."` (stale), `"Nothing stuck."` (stuck) — verbatim from `web/src/components/WeeklyReview.tsx:85–87, 132–134`.
3. Per-row metadata: show comma-joined `card.tags.map { "#\($0)" }` suffix instead of `rel(updatedAt)`. Keep stat grid (FIX-012) above sections — that's incremental over web.
Acceptance: section titles include counts; empty copy matches web; row metadata is tags not rel-time.
Effort: M (≈ 1 hr)

### ✅ FIX-V2-007: Search bar visual clear (✕) button when query is non-empty
**Done:** BoardToolbar.swift search field — when `!query.isEmpty` renders trailing `xmark.circle.fill` button that clears `query` and refocuses field.
Found by: CA2-004 (A)
File: `macOS/KanbanClaude/UI/Main/BoardToolbar.swift:132–153`
Specific change: inside the SearchField overlay, when `!query.isEmpty`, render a trailing `Button` with `Image(systemName: "xmark.circle.fill")` (Tokens.ink3) that clears `query` and keeps focus. Hide when `query.isEmpty` (so the ⌘K hint pill keeps its spot).
Effort: S (≈ 20 min)

### ✅ FIX-V2-008: Profile dropdown avatar — switch to solid violet
**Done:** BoardToolbar.swift:231 ProfileChip passes `colorOverride: Tokens.violet`. Shipped with FIX-V2-001 same commit.
Found by: CA2-005 (A)
File: `macOS/KanbanClaude/UI/Main/BoardToolbar.swift:231`
Specific change: same approach as FIX-V2-001 (P0) — either inline a violet Circle+initial or pass an explicit `color: Tokens.violet` overload to `InitialsAvatar`. Profile chip is a single instance, web pins it to `rgb(var(--violet))`.
Effort: S (≈ 10 min — can ship with FIX-V2-001 in one commit)

### ✅ FIX-V2-009: NotificationRow hover state
**Done:** NotificationRow @State hovered + .onHover; background tinted `Tokens.hairline.opacity(0.04)` on hover, layered below read/unread bg.
Found by: CA2-007 (A)
File: `macOS/KanbanClaude/UI/Main/NotificationsPopover.swift:60–79`
Specific change: add `@State private var hovered = false` to `NotificationRow`; wrap the row in `.onHover { hovered = $0 }`; set row background to `Tokens.hairline.opacity(hovered ? 0.04 : 0)`. Read/unread bg layered above the hover bg.
Effort: S (≈ 15 min)

### ✅ FIX-V2-010: Archive footer band — hide entirely when no cards
**Done:** ArchiveSheet wraps `footerBand` in `if !archived.isEmpty`.
Found by: CA2-008 (A)
File: `macOS/KanbanClaude/UI/Archive/ArchiveSheet.swift:54–80`
Specific change: wrap `footerBand` body in `if !archived.isEmpty { ... }` so the red band doesn't render on empty state. Empty state already has `🗑️` glyph + close button (FIX-021).
Effort: S (≈ 10 min)

### ✅ FIX-V2-011: Capture template button — hide when no templates
**Done:** CaptureView modeBar wraps Template ModeButton in `if !templates.isEmpty`.
Found by: CA2-009 (A)
File: `macOS/KanbanClaude/UI/Capture/CaptureView.swift:86–94`
Specific change: wrap the Template `ModeButton` in `if !templates.isEmpty { ... }`. Slash-parser in `submit()` (193–200) is no-op when templates list is empty, so no regression.
Effort: S (≈ 10 min)

### ✅ FIX-V2-012: EditDialog — reorder sections to match web
**Done:** EditCardView section order is now title → status → description → tags → AI Insights → Knowledge → due → attachments → assignees → shares → chat. AI + Knowledge now above the fold per web layout.
Found by: CA2-010 (A)
File: `macOS/KanbanClaude/UI/Card/EditCardView.swift:71–94`
Web order: title row → description → tags → AI Insights → Related Cards (🔄 V1) → Knowledge → due → attachments → assignees+shares grid → Activity.
macOS current order: title → status (extra) → description → tags → due → attachments → assignees → shares → knowledge → AI insights → chat.
Specific change: move `aiInsightsSection`, `knowledgeSection` ABOVE `due`/`attachments`/`assignees`/`shares`. Keep the macOS-only `status` row (web has no inline status picker — desktop adaptation, leave it). Keep the chat/timeline at the bottom — web's "Activity" is also last.
Rationale: AI Insights + Knowledge are the high-signal sections; on web they're above the fold. macOS pushes them below, hurting their utility.
Effort: M (≈ 45 min — careful section-block reordering plus visual smoke once unlocked)

### ✅ FIX-V2-013: EditDialog — drop redundant "Description" section label
**Done:** EditCardView descriptionSection no longer renders SectionLabel; TextEditor floats under title row.
Found by: CA2-011 (A)
File: `macOS/KanbanClaude/UI/Card/EditCardView.swift:173–184`
Specific change: remove the `SectionLabel("Description")` above the description `TextEditor`; let the textarea float directly under the title row, matching `web/src/components/EditDialog.tsx:246–259`.
Effort: S (≈ 5 min)

### ✅ FIX-V2-014: CardTimeline — start collapsed
**Done:** CardTimelineView `expanded` defaults to `false`. Events load lazily on first expand via `didLoad` guard + `.onChange(of: expanded)`.
Found by: CA2-003 (A)
File: `macOS/KanbanClaude/UI/Card/CardTimelineView.swift:6, 34`
Specific change: flip `@State private var expanded = true` to `false`. Adjust `onAppear` so events only load when the user expands. This drops the per-edit timeline-load network cost and matches `web/src/components/CardTimeline.tsx:119`.
Effort: S (≈ 10 min)

### ✅ FIX-V2-015: Knowledge view — green-house feature band header
**Done:** KnowledgeListView header wrapped in `Tokens.greenAccent.opacity(0.12)` padded block with rounded 12pt border. F-302 marked ✅ in FEATURE_PARITY_REGISTRY.md.
Found by: CA2-012 (A) — F-302 still ❌ in FEATURE_PARITY_REGISTRY (not a closed 🔄)
File: `macOS/KanbanClaude/UI/Knowledge/KnowledgeListView.swift:114–124`
Specific change: wrap the title + subtitle + `+ New note` button in a green-house tinted block (`Tokens.greenAccent.opacity(0.12)` or matching token, rounded 12pt corner, padding 16) matching `web/src/KnowledgeView.tsx:36–47`. Combine with FIX-V2-005 subtitle copy fix.
Effort: M (≈ 30 min)

### ✅ FIX-V2-016: Archive header — inline count badge instead of separate strip
**Done:** ArchiveSheet ModalHeaderStrip trailing carries count badge + close button. Separate "N archived cards" strip removed.
Found by: CA2-013 (A)
File: `macOS/KanbanClaude/UI/Archive/ArchiveSheet.swift:22–28`
Specific change: remove the separate `"\(N) archived card(s)"` strip; render the count as an inline badge to the right of the title inside the violet header band, matching `web/src/components/ArchiveDialog.tsx:98–107`.
Effort: S (≈ 20 min)

### ✅ FIX-V2-017: `WindowCoordinator.openWeeklyReview()` — dead code with stale toast
**Done:** method deleted from WindowCoordinator. No call sites remain.
Found by: CA2-015 (A)
File: `macOS/KanbanClaude/App/WindowCoordinator.swift:47–49`
Specific change: delete the method (no remaining call sites — toolbar calls `showReview = true` directly in `MainView`). The `ToastStore.shared.info("Weekly Review lands in Phase 8")` line is a stale dev placeholder.
Effort: S (≈ 3 min — single-line delete in same commit as any nearby WindowCoordinator change, e.g. FIX-V2-002)

---

## Closed as Intentional

None this round.

Notes:
- No R2 gap maps to a registry row already marked 🔄 with justification. F-302 (green-house band) is still ❌, so CA2-012 stays in the P2 backlog rather than being closed.
- All R1 🔄 closures (Card Chain, Related Cards, Weather widget, Activity ticker) are listed in B2's R1 carry-over table and remain V1 — not re-opened this round.

---

## Recommended Fix Order

1. **FIX-V2-001** (P0 — share-avatar violet) — small color fix, both auditors agree, closes a fix-verification ⚠.
2. **FIX-V2-008** (P2 — profile avatar violet) — same kind of change, ship in the same commit as FIX-V2-001.
3. **FIX-V2-003** (P1 — Settings selector) — single helper + two call-site swaps; defensive against macOS 13/14 regressions. Verify with a user-side launch.
4. **FIX-V2-002** (P1 — knowledge-without-URL Open) — needs `WindowCoordinator.openKnowledgeDetail` plumbing check; medium effort.
5. **FIX-V2-004** (P1 — server `error.fields`) — API error type extension + store/sheet wiring; medium effort.
6. **FIX-V2-005** + **FIX-V2-015** (Knowledge subtitle + green-house band) — same file, one commit.
7. **FIX-V2-006** (Weekly Review copy + tags) — single file, isolated.
8. **FIX-V2-007** (search ✕), **FIX-V2-009** (notif hover), **FIX-V2-010** (archive band hide), **FIX-V2-011** (capture template hide), **FIX-V2-013** (description label drop), **FIX-V2-014** (timeline collapsed), **FIX-V2-017** (dead code) — group as one polish-round-2 commit.
9. **FIX-V2-012** (EditDialog section order) — bigger reorder; ship alone to keep diff readable.
10. **FIX-V2-016** (archive header inline count) — alone or with another archive-touching fix.

Reminder per RULE 16: each commit must re-grep the touched files for `async let _ =`, bare-array `decode([T]`, and `.task { await refreshAll|loadAll|fetchAll }` patterns and remediate live matches in the same commit.

---

✅ FINAL_FIXES_V2.md written
📊 P0: 1 | P1: 3 | P2: 14 | Closed: 0
STAGE_COMPLETE: verdict=NEEDS_FIXES remaining=4
