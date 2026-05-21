# Code Audit — Agent A — Round 4
Date: 2026-05-21
Method: Systematic web (React/Vite SPA under `web/src/`) → macOS (SwiftUI under `macOS/KanbanClaude/`) comparison. Round 5 audit (AUDIT_A5.md) covers the 6 V4 fixes (FINAL_FIXES_V4.md commits `2c02078` + `a031f65`) plus a fresh sweep for new gaps across all 22 MVP screen groups at branch tip `a031f65`.
Screens audited: 22 MVP groups + 6 V4-fix verification rows
Total gaps found (new this round): 6
Fixes verified (Round > 1): 6 ✅  0 ❌  0 ⚠  0 🔴

## Method notes
- Web reference = `web/src/` (`App.tsx`, `components/*.tsx`, `KnowledgeView.tsx`, `api.ts`); `web/index.html` is the 32-line bootstrap shell only.
- macOS reference = .swift files under `macOS/KanbanClaude/`; endpoint catalog at `Networking/Endpoint.swift`, client at `Networking/APIClient.swift`.
- Each round-4 fix verified by reading the touched files at the specific line numbers cited in `FINAL_FIXES_V4.md`. Verification is code-read confirmation, not a runtime check.
- I-1 (locked screen) again blocks Rule 14 visual diff this run. Round 5 audit is code-only.
- Full codebase grep for the three RULE-3 / RULE-7 banned patterns (`async let _ =`, bare-array `decoder.decode([…)`, `.task { await … }`) returned **zero matches** across `macOS/KanbanClaude/` — the FIX-V4-001 sweep closed the last live `.task { await refresh() }` surface.

---

## Fix Verification (Round 4)

| Fix ID | Status | Evidence | Notes |
|--------|--------|----------|-------|
| FIX-V4-001 | ✅ Verified | `UI/Preferences/TokensTab.swift:57-61`, `UI/Preferences/TelegramTab.swift:45-49`, `UI/Preferences/TemplatesTab.swift:43-47` | All three Preferences-tab sites now run `.onAppear { Task.detached(priority: .userInitiated) { await refresh() } }`. Same shape as the FIX-V3-002 trio. Codebase-wide `grep -rn "\.task { await"` against `macOS/KanbanClaude/` returns **zero matches** — the RULE 3 / I-7 surface is now fully swept. RULE 16 re-grep on each touched file (banned set: `async let _ =`, bare-array decode, `.task { await … }`) returned zero live matches. |
| FIX-V4-002 | ✅ Verified | `UI/Card/EditCardView.swift:293-333` | `knowledgeSection()` body is now a plain `VStack(alignment: .leading, spacing: 6)` whose first child is `SectionLabel("Knowledge")`, followed by the linked-row list / `+ Attach` / Save-as-knowledge / picker. Outer `DisclosureGroup { … } label: { SectionLabel("Knowledge") }` wrapper is gone. Section now always-open inline, matching web `EditDialog.tsx:294-361`. Linked items, +Attach, and Save-as-knowledge are visible without a click. |
| FIX-V4-003 | ✅ Verified | `UI/Archive/ArchiveSheet.swift:12` | `ModalHeaderStrip(title: "Archived cards")`. Count pill (`Text("\(archived.count)")`) still in trailing closure at `:14-19`. Matches web `ArchiveDialog.tsx:98-99` ("Archived cards" + count pill). |
| FIX-V4-004 | ✅ Verified | `UI/Archive/ArchiveSheet.swift:91-97` | Leading 8pt circle dot replaced with `Text(card.status.label.uppercased()).font(.mono(10, weight: .semibold)).foregroundStyle(.white).padding(.horizontal, 7).padding(.vertical, 2).background(statusColor(card.status)).clipShape(Capsule()).padding(.top, 2)`. `statusColor(_:)` returns `Tokens.pinBacklog / pinToday / pinDoing / pinDone` (the same palette as web's `LANE_COLORS`). Subtitle `Archived <rel> • was \(card.status.label)` preserved at `:100-101` per the spec's style call. Pill renders the lane name; visual signal is now equal to web. |
| FIX-V4-005 | ✅ Verified | `UI/Review/WeeklyReviewSheet.swift:82-87` (heading) + `:93-96` (row bullet) | Heading flipped from `.font(.sans(13, weight: .semibold)).foregroundStyle(accent)` to `Text(title.uppercased()).font(.mono(10, weight: .semibold)).tracking(1.2).foregroundStyle(Tokens.ink3)` — all three sections now uniform soft-ink uppercase mono, matching web `WeeklyReview.tsx:121` `text-1 tracking-tight2 uppercase text-ink-soft`. Row HStack at `:93-96` now leads with `Text("·").font(.sans(12)).foregroundStyle(Tokens.ink3)` followed by `Text(r.title)…`. Matches web `WeeklyReview.tsx:129-134`. `accent` parameter retained on `section(...)` signature for future use (no behavior delta). |
| FIX-V4-006 | ✅ Verified | `UI/Review/WeeklyReviewSheet.swift:113` | `Button(loading ? "Generating…" : "Generate again")` with the same `.disabled(loading)` modifier underneath. Label now flips during the refresh round-trip, matching web `WeeklyReview.tsx:99-102` (`{loading ? 'Generating…' : 'Generate again'}`). |

Verified counts: **6 ✅ · 0 ⚠ · 0 ❌ · 0 🔴**

Every Round-4 fix landed cleanly. No partial implementations, no regressions, no fresh RULE-3 / RULE-7 / RULE-16 violations in the touched files (or anywhere else in `macOS/KanbanClaude/`).

---

## Gap Registry (new this round)

| ID | Screen | Web behavior | Web code location | Swift/Tauri equivalent | Found? | Confidence |
|----|--------|-------------|-------------------|------------------------|--------|-----------|
| CA5-001 | EditDialog — AI Insights `Next steps` list length | Web renders the full `next_steps` list (no client cap) inside an `<ol class="list-decimal">`. The server is the authority on how many to return. | `web/src/components/AiInsightsPanel.tsx:177` | `macOS/KanbanClaude/UI/Card/AiInsightsPanelView.swift:85` | ❌ Missing — macOS hard-caps the list at `.prefix(4)` via `ForEach(Array(steps.prefix(4).enumerated()), id: \.offset)`. If the server returns 5+ next steps, items 5..N are silently truncated on macOS while web shows them all. No "show more" affordance compensates. Fix: drop `.prefix(4)` (use `ForEach(Array(steps.enumerated()), id: \.offset)`), or — if a visual cap is desired for density — promote it to a registered `🔄` adaptation with a written justification per RULE 14. | High |
| CA5-002 | Preferences → Account tab — save error tone | Web (`SettingsDialog.tsx:145-146`) renders save errors in red (`text-red`) and successes in green (`text-green-starbucks`) — distinct visual signals on the same line slot. | `web/src/components/SettingsDialog.tsx:145-146` | `macOS/KanbanClaude/UI/Preferences/AccountTab.swift:27-29, 45-58` | ❌ Missing — macOS uses a single `savedMessage: String?` state that is overwritten with either `"Saved."` (success, line 53) or `error.localizedDescription` (failure, line 57). The display at `:28` is hard-coded `.foregroundStyle(Tokens.greenAccent).font(.sans(11))` — so a save failure renders the API error string in **green** (the success color). Users see a positive-looking confirmation for what is actually a failure. Fix: split into `savedOk: Bool` + `savedError: String?` (mirroring web's `shortOk` / `shortErr`) and tone the `Text` accordingly (`Tokens.greenAccent` vs `Tokens.danger`), or branch the foreground style on a `isError: Bool` flag inside a single `Optional` payload. | High |
| CA5-003 | BoardToolbar — Scope picker dropdown | Web `BoardHeader` accepts a `scopeCounts?: Record<Scope, number>` prop and, when present, renders a small mono count to the right of each scope row inside the popover (`BoardHeader.tsx:145-149`). | `web/src/components/BoardHeader.tsx:145-149` | `macOS/KanbanClaude/UI/Main/BoardToolbar.swift:97-117` | ⚠ Partial — macOS `ScopePicker` popover shows the `label` + `description` for each scope but never renders a per-scope count. No `scopeCounts` plumbing exists from `BoardScopeStore` / `CardStore` into the picker. Behavioral parity gap when web has counts in scope (web's `App.tsx` passes them; macOS would need an equivalent derived dictionary off `CardStore.cards`). Fix: surface a computed `Dictionary<Scope, Int>` (cheap — count `CardStore.cards` per visibility predicate) and render a trailing `Text("\(counts[s] ?? 0)").font(.mono(11)).foregroundStyle(Tokens.ink3)` inside the popover button. | Med |
| CA5-004 | EditDialog — Chat & Activity timeline read-receipts | Web `CardTimeline` calls `markRead(fresh)` every time a fresh batch of `incomingEvents` arrives via WebSocket while the disclosure is open (`CardTimeline.tsx:152`). The server's read pointer + the in-flight unread count therefore advance in real-time as messages stream in. | `web/src/components/CardTimeline.tsx:146-154` | `macOS/KanbanClaude/Stores/CardEventsStore.swift:45-49` + `UI/Card/CardTimelineView.swift:31-33` | ❌ Missing — macOS's `CardEventsStore.append(_:)` (triggered by `WebSocketClient` broadcasts in `apply(_:)` at `:57-64`) only mutates `events` + `seenIds`. There's no `markRead` call after WS-driven appends, so a card whose edit window is open at the moment a teammate posts a message keeps the unread badge until the user reloads (e.g. close + reopen) — `UnreadStore.clear(cardId:)` is invoked once in `load()` at `:37`, never again per session. Web's behavior is "if you're actively reading, you're read." Fix: call `await markRead()` (the helper already exists at `:51-55`) from the WS-message branch of `apply(_:)` when the events store is "live" (cheap heuristic: when the EditCardView is on screen, which the `CardTimelineView.expanded` flag indirectly tracks — or expose an `isObserving` toggle on the store and set it from `CardTimelineView.onAppear/onDisappear`). | Med |
| CA5-005 | Board column header — lane dot halo | Web `.lane-dot` (`Column.tsx:151-157`) is an 8px circle wrapped in `box-shadow: 0 0 0 3px rgb(var(--pin-color) / 0.12)` — produces a soft halo ring around each lane dot, reinforcing the lane color even at small sizes. | `web/src/components/Column.tsx:151-157` (CSS in same file at `:151-157`) | `macOS/KanbanClaude/UI/Main/BoardColumnView.swift:91` | ⚠ Partial — macOS uses a bare `Circle().fill(dotColor).frame(width: 8, height: 8)` with no halo. Visual signal is weaker; lane identity reads as "small dot" rather than web's "small dot inside a soft ring." Fix: wrap the circle in a `ZStack` with a second `Circle().fill(dotColor.opacity(0.12)).frame(width: 14, height: 14)` underneath, or use `.background(Circle().fill(dotColor.opacity(0.12)).padding(-3))` — both produce a 3pt soft halo equivalent. | Low |
| CA5-006 | Board column header — add (+) button hover | Web `.lane-add` has a hover state that combines `color: rgb(var(--ink))`, `background: rgb(var(--hairline) / 0.06)`, and `transform: rotate(90deg)` (`Column.tsx:189`). The rotation is the headline animation cue — `+` morphs into a quasi-`×` as the user mouses in, signalling "click for an action." | `web/src/components/Column.tsx:178-189` | `macOS/KanbanClaude/UI/Main/BoardColumnView.swift:99-108` | ⚠ Partial — macOS shows a plain `Image(systemName: "plus")` inside a circle with no hover state. No rotation, no color shift on hover. Cosmetic but a brand-signal regression vs. the web "premium > rainbow/emoji" motion vocabulary the user has previously asked for. Fix: add `@State private var addHovered = false`, wrap `Image(systemName: "plus")` in `.rotationEffect(.degrees(addHovered ? 90 : 0)).animation(.spring(response: 0.28, dampingFraction: 0.85), value: addHovered)` and pair with `.onHover { addHovered = $0 }` on the button. | Low |

---

## P0 — Critical Gaps (core functionality missing)

None. The Round-4 sweep closed the last codebase-wide RULE 3 surface (FIX-V4-001) and the only behavioral P1 (FIX-V4-002 Knowledge unwrap). No new P0 emerged.

## P1 — Behavioral Gaps (feature exists but behaves differently)

- **CA5-001** (High confidence) — AI Insights `Next steps` capped at 4 on macOS while web shows all. Bounded but real — if the server returns 5+ next steps the user silently never sees them on macOS. One-line fix (drop `.prefix(4)`).
- **CA5-002** (High confidence) — AccountTab save errors render in `Tokens.greenAccent` (success color) because a single `savedMessage: String?` slot is dual-purposed for both success and failure copy. A real save failure visually reads as a success confirmation. Fix is structural: split state into `savedOk` + `savedError` to mirror web's two-channel pattern.
- **CA5-003** (Med confidence) — Scope picker popover lacks per-scope card counts that web shows when `scopeCounts` prop is passed. macOS has the data (`CardStore.cards`) but no derivation/plumbing into `ScopePicker`. Modest plumbing fix.
- **CA5-004** (Med confidence) — WS-driven chat appends in `CardEventsStore` don't call `markRead`, so unread badges stay stale on cards whose edit window is open. Web silently advances the read pointer. Helper already exists; needs to be invoked from `apply(_:)` when the store is observed.

## P2 — Minor Gaps (polish, edge cases, error states)

- **CA5-005** Lane dot lacks 3pt halo ring (web `.lane-dot` `box-shadow: 0 0 0 3px rgb(var(--pin-color) / 0.12)`). Cosmetic — affects lane identity readability at the 8px dot size.
- **CA5-006** Column `+` button lacks hover rotate(90deg) animation. Cosmetic motion signal regression vs. the premium-motion design direction the user has previously locked in (see `feedback_premium_not_slop.md` in auto-memory: "motion on interaction not idle loops").

---

## Verified OK (spot-checked items still passing this round)

- All Round-1 / Round-2 / Round-3 / Round-4 FIXes (F-001…F-036 + 17 V2 + 7 V3 + 6 V4) remain present and unchanged on `a031f65`.
- API surface: every endpoint exposed in `web/src/api.ts` has a matching `Endpoint` case in `Networking/Endpoint.swift`, except (a) the deliberately-replaced web-push subscribe endpoints (closed 🚫 in Round 1), (b) `/api/cards/:id/qr.svg` (replaced by `QRGenerator.swift` per V-003), and (c) the two multipart upload endpoints (`POST /api/cards/from-image`, `POST /api/cards/:id/attachments`) which are issued from `Stores/CardStore.swift` via a raw `endpointPath:` helper that bypasses the typed `Endpoint` enum for `multipart/form-data` — deliberate accommodation.
- EditDialog section order: title → status → description → tags → AI Insights → Knowledge → due → attachments → assignees → shares → chat. AI Insights and Knowledge still above-the-fold; Knowledge now always-open inline per FIX-V4-002.
- ArchiveSheet header copy = `"Archived cards"` (FIX-V4-003); per-row lane indicator = labeled colored capsule pill (FIX-V4-004).
- WeeklyReviewSheet section headings = uniform uppercase ink-soft mono with leading `·` bullet on rows (FIX-V4-005); `Generate again` button flips to `Generating…` while loading (FIX-V4-006).
- Title and Tags `SectionLabel`s dropped (FIX-V3-003 carried).
- Description section label dropped (FIX-V2-013 carried).
- Validation envelope: nested + flat decode order works against the server shape (`server/src/routes/knowledge.ts:26,185`) — `KnowledgeEditSheet` inline field-error path reachable (FIX-V3-001 carried).
- Voice button has no `.help()` tooltip (FIX-V3-007 carried); toast on tap is the only V1-deferral signal.
- Status `// MARK:` comment is `// MARK: - status` (no bogus F-194 prefix, FIX-V3-006 carried).
- Notifications popover hover state present (CA2-007 still ✅).
- Archive footer band hidden when empty (CA2-008 still ✅).
- Capture template button hidden when no templates (CA2-009 still ✅).
- Knowledge view green-house feature band header (F-302 still ✅).
- Archive count moved to inline header badge (CA2-013 still ✅).
- Card-tile share avatars use solid violet (CA2-014 still ✅).
- ProfileChip avatar uses solid violet (CA2-005 still ✅).
- `WindowCoordinator.openWeeklyReview()` absent; `MainView` opens sheet directly (CA2-015 still ✅).
- AI Insights `Open` button for knowledge-without-URL → `KnowledgeDetailWindowController` (CA2-001 still ✅).
- Settings opens from both toolbar gear and profile-row Settings via `SettingsOpener.open()` (CA2-006 still ✅).
- **Codebase-wide grep clean** for all three RULE-3 / RULE-7 banned patterns:
  - `async let _ =` → 0 matches.
  - `try (decoder|JSONDecoder()).decode([…` (bare-array decode) → 0 matches.
  - `.task { await refresh|refreshAll|loadAll|fetchAll|… }` → 0 matches.
  This is the first round where the cancellation-risk surface is fully closed.

---

## Notes for Agent C (prioritization input)

1. **CA5-002** (AccountTab error in green) is procedurally the most user-confusing gap — a real save failure renders as a success confirmation. It is a 5-line structural fix (split `savedMessage` into `savedOk: Bool` + `savedError: String?`, two `Text` branches), and the affected file (`AccountTab.swift`) was last touched in Round 1, so RULE 16 only fires on the next commit that revisits it. ~10 min including build + log validation.

2. **CA5-001** (next_steps `.prefix(4)`) is a one-line correctness fix — drop the cap, or promote it to a registered `🔄` with a written justification. If the user's intent is "show the first 4 on macOS for density," that needs a registry note per RULE 14; otherwise just remove the cap. ~5 min either way.

3. **CA5-004** (WS-driven chat doesn't mark read) is a real-time-feel regression but bounded — only fires when the user has the EditCardView open at the moment a teammate posts. Fix needs a small contract addition (store-level `isObserving` flag set/cleared by `CardTimelineView.onAppear/onDisappear`) so `apply(_:)` knows when to call the existing `markRead()`. ~20 min.

4. **CA5-003** (ScopePicker counts) is a plumbing add — derive a computed `Dictionary<Scope, Int>` off `CardStore.cards`, pass it through `BoardToolbar` → `ScopePicker`, render trailing mono count. ~25 min including the new derived property's tests.

5. **CA5-005** (lane-dot halo) and **CA5-006** (`+` hover rotate) are cosmetic and align with the user-locked design direction `feedback_premium_not_slop.md` ("motion on interaction not idle loops"). Both are 2–5 line additions; could ship as a single "lane chrome polish" bundle commit. ~15 min total.

6. The locked-screen carry-over (I-1) still blocks Rule 14 visual diff. Round 5 audit remains code-only; a Round 6 with a wake-locked display (`caffeinate -dimsu sleep 3600 &` started before lock) is the cleanest way to finally close the 🔄 visual diff column across the registry.

7. No fresh I-N learning candidates from this round — gaps are either bounded behavioral drift (CA5-001), wrong-tone error display (CA5-002), known-class concurrency / state-sync residue (CA5-004), modest plumbing add (CA5-003), or cosmetic motion polish (CA5-005 / CA5-006). The R2/R3/R4 fix loop continues to be effective; each round's gap list narrows in severity. The codebase-wide RULE-3 grep is the first to come back fully clean — a milestone worth recording.

---

✅ AUDIT_A5.md written — 6 gaps found across 5 screens. Round 4.
STAGE_COMPLETE: verified=6 not_landed=0 regressions=0
