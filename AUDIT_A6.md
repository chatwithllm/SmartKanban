# Code Audit — Agent A — Round 5
Date: 2026-05-21
Method: Systematic web (React/Vite SPA under `web/src/`) → macOS (SwiftUI under `macOS/KanbanClaude/`) comparison. Round 6 audit (AUDIT_A6.md) covers the 5 V5 fixes (FINAL_FIXES_V5.md commits `b0bf911`, `c3526d1`, `879d549`, `e8603fd`, `1190554` — plus docs commit `72c906b`) plus a fresh sweep for new gaps across all 22 MVP screen groups at branch tip `72c906b`.
Screens audited: 22 MVP groups + 5 V5-fix verification rows
Total gaps found (new this round): 3
Fixes verified (Round > 1): 5 ✅  0 ❌  0 ⚠  0 🔴

## Method notes
- Web reference = `web/src/` (`App.tsx`, `components/*.tsx`, `KnowledgeView.tsx`, `api.ts`); `web/index.html` is the 32-line bootstrap shell only.
- macOS reference = .swift files under `macOS/KanbanClaude/`; endpoint catalog at `Networking/Endpoint.swift`, client at `Networking/APIClient.swift`. 85 Swift sources.
- Each round-5 fix verified by reading the touched files at the specific line numbers cited in `FINAL_FIXES_V5.md`. Verification is code-read confirmation, not a runtime check.
- I-1 (locked screen) again blocks Rule 14 visual diff this run. Round 6 audit is code-only.
- Codebase-wide grep for the three RULE 3 / RULE 7 banned patterns (`async let _ =`, bare-array `try (decoder|JSONDecoder()).decode([…)`, `.task { await refresh|loadAll|fetchAll|reload }`) returned **zero matches** across `macOS/KanbanClaude/` — the banned-pattern surface remains fully swept (no regression vs Round 5).

---

## Fix Verification (Round 5)

| Fix ID | Status | Evidence | Notes |
|--------|--------|----------|-------|
| FIX-V5-001 | ✅ Verified | `UI/Card/AiInsightsPanelView.swift:85` | Line now reads `ForEach(Array(steps.enumerated()), id: \.offset) { idx, step in` — the prior `.prefix(4)` cap is gone. AI Insights `Next steps` list is no longer client-capped; server is the authority on length. Matches web `AiInsightsPanel.tsx:177`. RULE 16 re-grep on the touched file (`AiInsightsPanelView.swift`) for the three banned patterns returned zero live matches. |
| FIX-V5-002 | ✅ Verified | `UI/Preferences/AccountTab.swift:7-8, 28-32, 54-63` | Single `savedMessage: String?` slot split into `@State private var savedOk: Bool = false` (line 7) + `@State private var savedError: String?` (line 8). Display branches at `:28-32` — `if savedOk` renders `"Saved."` in `Tokens.greenAccent`; `else if let err = savedError` renders the error string in `Tokens.danger`. Save handler at `:54-63` sets `savedError = nil; savedOk = true` on success and `savedOk = false; savedError = error.localizedDescription` in catch. Success and failure now carry distinct tones; the wrong-tone confusion (CA5-002 / I-?) is closed. RULE 16 re-grep on `AccountTab.swift` returned zero banned-pattern matches. |
| FIX-V5-003 | ✅ Verified | `Stores/CardEventsStore.swift:15-17, 60-73` + `UI/Card/CardTimelineView.swift:41-42` | `CardEventsStore` gains `private(set) var isObserving: Bool = false` (`:15`) and `func setObserving(_ on: Bool) { isObserving = on }` (`:17`). The WS apply branch at `:60-73` now reads `let wasNew = !seenIds.contains(event.id); append(event); if wasNew && isObserving { Task { @MainActor in await self.markRead() } }` — exactly the spec'd shape. `CardTimelineView.body` at `:41-42` wires the flag with `.onAppear { store.setObserving(true) } .onDisappear { store.setObserving(false) }`. Matches web `CardTimeline.tsx:146-154` semantics (mark read on every fresh WS batch while reading). RULE 16 re-grep on both touched files returned zero banned-pattern matches. See CA6-003 below for a residual scope nuance. |
| FIX-V5-004 | ✅ Verified | `UI/Main/BoardColumnView.swift:92-95` | Lane-dot block now reads `ZStack { Circle().fill(dotColor.opacity(0.12)).frame(width: 14, height: 14); Circle().fill(dotColor).frame(width: 8, height: 8) }`. Outer 14pt 12%-alpha disc + inner 8pt solid disc — visually equivalent to web `box-shadow: 0 0 0 3px rgb(var(--pin-color) / 0.12)` (`Column.tsx:156`). 3pt soft halo now present across all four columns. |
| FIX-V5-005 | ✅ Verified | `UI/Main/BoardColumnView.swift:13, 103-115` | `@State private var addHovered = false` added at `:13`. `+` button at `:103-115` now wraps the `Image(systemName: "plus")` in `.rotationEffect(.degrees(addHovered ? 90 : 0))` with a `.animation(.spring(response: 0.28, dampingFraction: 0.85), value: addHovered)` and toggles `Tokens.ink` vs `Tokens.ink2` foreground + `Tokens.hairline.opacity(0.06)` vs `Tokens.canvas` background by hover state. `.onHover { addHovered = $0 }` on the button drives the toggle. Spring response (`0.28` / damp `0.85`) matches the locked premium-motion direction (`feedback_premium_not_slop.md`: "motion on interaction not idle loops"). |

Verified counts: **5 ✅ · 0 ⚠ · 0 ❌ · 0 🔴**

Every Round-5 fix landed cleanly. No partial implementations, no regressions, no fresh RULE-3 / RULE-7 / RULE-16 violations in the touched files (or anywhere else in `macOS/KanbanClaude/`).

---

## Gap Registry (new this round)

| ID | Screen | Web behavior | Web code location | Swift/Tauri equivalent | Found? | Confidence |
|----|--------|-------------|-------------------|------------------------|--------|-----------|
| CA6-001 | CardTimeline — system entry with `details.body` (notetaker-kanban bridge body inlining) | Web `SystemEntry` reads `e.details?.body` and, when present, renders the row as `<actor_name>: <body>` with `whiteSpace: 'pre-wrap'` so multi-line external-integration bodies (notetaker bridge, etc.) read as a real comment. When `details.body` is absent it falls back to `<actor_name> <action>`. | `web/src/components/CardTimeline.tsx:28-45` | `macOS/KanbanClaude/UI/Card/CardTimelineView.swift:115-122` (`TimelineRow.label`) + `:101-107` (content render) | ❌ Missing — macOS `TimelineRow.label` for `.system` is hard-coded `"\(actorName ?? "Someone") \(action ?? "updated")"`. The struct `CardEvent` (`Networking/Codables/CardEvent.swift:11`) exposes `details: [String: JSONValue]` and `JSONValue.stringValue` is wired (`AiSuggestion.swift:51`), so the data is reachable — it's just never consulted. The fallback content render at `:101-107` only shows `event.content`; notetaker bridge writes its summary into `details.body`, not `content`, so the body is **silently dropped** on macOS. Fix: in TimelineRow, branch on `event.entryType == .system && event.details["body"]?.stringValue` to render the body inline (with `.multilineTextAlignment(.leading) .fixedSize(horizontal: false, vertical: true)` — mono or sans, your call — and keep the label as just `actorName`). This matches F-279 "External-integration bodies (notetaker bridge) inlined with whiteSpace:pre-wrap". | High |
| CA6-002 | CardTimeline — AI entry brand color | Web AI entries use `bg-green-accent/60` for the timeline dot and `text-green-accent` for the `AI` prefix (`CardTimeline.tsx:91-94`) — the AI brand color in web is green-accent. | `web/src/components/CardTimeline.tsx:91-94` | `macOS/KanbanClaude/UI/Card/CardTimelineView.swift:128, 134` | ⚠ Partial — macOS `dotColor` for `.ai` returns `Tokens.violet` (`:128`) and `labelColor` for `.ai` returns `Tokens.violet` (`:134`). The AI dot and label render in violet, not green-accent. F-281 in the registry literally specifies "green-accent/60 dot + 'AI:' prefix (green-accent) + content" — macOS uses the violet brand for AI throughout the timeline, which conflicts with web's green-accent AI brand. (Note: the CardView ✨ pulse in macOS already uses violet, and `Tokens.violet` is the macOS AI brand token in other places — this may be a deliberate macOS-side recolor, but if so it's not registered as a 🔄 anywhere. The user-locked `feedback_premium_not_slop.md` direction emphasizes premium-feel; recoloring AI from green→violet on one platform produces split brand signal across web and desktop.) Fix: either (a) flip both dotColor and labelColor for `.ai` to `Tokens.greenAccent` (the existing green-accent token used elsewhere) and matching `.opacity(0.6)` on the dot to mirror `green-accent/60`, or (b) register F-281 as a 🔄 macOS adaptation with the written justification "macOS AI brand = violet for consistency with the ✨ insight pulse" per RULE 14. | Med |
| CA6-003 | CardTimeline — WS markRead fires while DisclosureGroup is collapsed | Web `CardTimeline` gates the WS-driven `markRead(fresh)` on `if (!incomingEvents?.length || !open) return;` (`CardTimeline.tsx:147`). markRead fires **only** when the chat disclosure is open. | `web/src/components/CardTimeline.tsx:146-154` | `macOS/KanbanClaude/UI/Card/CardTimelineView.swift:41-42` + `Stores/CardEventsStore.swift:15-17, 60-73` | ⚠ Partial — `isObserving` is set/cleared from the outer view's `.onAppear` / `.onDisappear`, not from the DisclosureGroup expansion state. While the EditCardView is on screen, `isObserving` is `true` regardless of whether the chat disclosure is expanded. Once events have been loaded (after the user has opened the disclosure at least once in the session), any subsequent WS event triggers `markRead()` even if the disclosure is collapsed at the moment the message arrives. Web requires `open === true`. The window is narrow (only fires post-first-expansion when events.last is non-nil), but it is a parity drift. Fix: introduce `@State private var observing` driven by `.onChange(of: expanded)` instead of `.onAppear` — or pass `expanded` into a `store.setObserving(_:)` call from the existing `onChange(of: expanded)` block at `:35-40`. Either keeps web semantics ("mark read only while chat is open"). Alternatively register as 🔄 with the justification "macOS marks read when the card window is open, regardless of disclosure state, because the desktop edit window is itself the 'reading' surface" per RULE 14. | Low |

---

## P0 — Critical Gaps (core functionality missing)

None. The Round-5 sweep closed both behavioral P1 surfaces (FIX-V5-002 AccountTab tone, FIX-V5-001 next-steps cap) plus the WS-mark-read parity fix (FIX-V5-003) and the two cosmetic motion items (FIX-V5-004/005). No new P0 emerged.

## P1 — Behavioral Gaps (feature exists but behaves differently)

- **CA6-001** (High confidence) — System timeline entries silently drop notetaker-bridge bodies. The `CardEvent.details` payload is reachable from macOS but never consulted for the `system` row body; user-visible regression is a multi-line meeting summary collapsing to "<actor> updated". One-block fix in `TimelineRow.label` / body render.

## P2 — Minor Gaps (polish, edge cases, error states)

- **CA6-002** (Med confidence) — AI timeline dot + label render in violet on macOS vs green-accent on web. Brand-signal drift. Either recolor to `Tokens.greenAccent` (parity) or register the macOS recolor as a 🔄 adaptation with written rationale (RULE 14).
- **CA6-003** (Low confidence) — WS markRead in `CardEventsStore.apply` fires while the chat DisclosureGroup is collapsed (after first-expansion-in-session), where web's `open` gate would have suppressed it. Either tie `isObserving` to `expanded` (parity) or register as 🔄 with rationale that "card window open = reading" on desktop.

---

## Verified OK (spot-checked items still passing this round)

- All Round-1 / Round-2 / Round-3 / Round-4 / Round-5 FIXes (F-001…F-036 + 17 V2 + 7 V3 + 6 V4 + 5 V5) remain present and unchanged on `72c906b`.
- API surface: every endpoint exposed in `web/src/api.ts` has a matching `Endpoint` case in `Networking/Endpoint.swift`, except (a) the deliberately-replaced web-push subscribe endpoints (closed 🚫 in Round 1), (b) `/api/cards/:id/qr.svg` (replaced by `QRGenerator.swift` per V-003), and (c) the two multipart upload endpoints (`POST /api/cards/from-image`, `POST /api/cards/:id/attachments`) which are issued from `Stores/CardStore.swift` via a raw `endpointPath:` helper that bypasses the typed `Endpoint` enum for `multipart/form-data` — deliberate accommodation.
- EditDialog section order: title → status → description → tags → AI Insights → Knowledge → due → attachments → assignees → shares → chat (`EditCardView.swift:72-93` MARK comments confirm). AI Insights and Knowledge still above-the-fold; Knowledge always-open inline per FIX-V4-002. Section labels dropped for Title, Tags, Description per FIX-V3-003 + FIX-V2-013.
- ArchiveSheet header copy = `"Archived cards"` (FIX-V4-003); per-row lane indicator = labeled colored capsule pill (FIX-V4-004).
- WeeklyReviewSheet section headings = uniform uppercase ink-soft mono with leading `·` bullet on rows (FIX-V4-005); `Generate again` button flips to `Generating…` while loading (FIX-V4-006).
- AI Insights `Next steps` no longer client-capped (FIX-V5-001).
- AccountTab success and failure save indicators now render in distinct tones (FIX-V5-002).
- WS-driven chat appends call `markRead()` when CardTimelineView is observed (FIX-V5-003) — see CA6-003 for the residual collapsed-disclosure nuance.
- Board column lane dot now has a 14pt halo behind the 8pt fill (FIX-V5-004).
- Board column `+` button rotates 90° on hover with spring `0.28`/`0.85` (FIX-V5-005).
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
  - `.task { await refresh|loadAll|fetchAll|reload }` → 0 matches.
  Second consecutive round with the cancellation-risk surface fully closed.

---

## Notes for Agent C (prioritization input)

1. **CA6-001** (notetaker-bridge body dropped on macOS) is the most user-visible new gap — desktop users see "<actor> updated" while web users see the full meeting summary inline. It is a small structural fix in `TimelineRow` (branch on `event.details["body"]?.stringValue` for system rows, render with `whiteSpace: pre-wrap` analog — `.fixedSize(horizontal: false, vertical: true)` + `.multilineTextAlignment(.leading)`). Estimated ~15 min including build + log validation. The data path is already in place (CardEvent.details is decoded; JSONValue.stringValue exists). No new endpoint plumbing.

2. **CA6-002** (AI timeline dot/label violet vs web green-accent) is procedurally a brand-consistency call. If the user's intent is "macOS AI = violet across the app" (which is consistent with the CardView ✨ pulse and AI Insights panel violet accent), then register F-281 as a 🔄 with that rationale per RULE 14. Otherwise flip to `Tokens.greenAccent` (token already exists, `:128` and `:134` two-line edit). ~5 min either way. Worth asking the user before flipping.

3. **CA6-003** (WS markRead fires while DisclosureGroup collapsed) is a narrow parity drift bounded to post-first-expansion + WS-event-arrives-while-collapsed sequence. Web gates on `open`. The fix is two lines — replace `.onAppear { store.setObserving(true) }` / `.onDisappear { store.setObserving(false) }` with an `.onChange(of: expanded) { store.setObserving($0) }` (and drop the appear/disappear pair), OR — better, since the existing onChange already runs at `:35-40` — fold the `setObserving` call into that same block. ~10 min. Lowest priority; could ship as a single bundled commit with CA6-002 if both go the "match web" direction.

4. The locked-screen carry-over (I-1) still blocks Rule 14 visual diff. Round 6 audit remains code-only; a Round 7 with a wake-locked display (`caffeinate -dimsu sleep 3600 &` started before lock) is the cleanest way to finally close the 🔄 visual diff column across the registry.

5. No fresh I-N learning candidates from this round — gaps are either a bounded data-path miss (CA6-001), a brand-token call (CA6-002), or a state-scope nuance (CA6-003). The R2/R3/R4/R5 fix loop continues to be effective; each round's gap list narrows in severity and quantity (R2: 17 → R3: 7 → R4: 6 → R5: 6 → R6: 3). The codebase-wide RULE-3 grep is green for the second consecutive round — the cancellation-risk surface remains closed.

6. **Composite fix plan suggestion for Agent C**: All three gaps live in two files (`UI/Card/CardTimelineView.swift` and `Stores/CardEventsStore.swift`). They could ship as a single "timeline parity pass" commit: (1) inline `details.body` on system rows, (2) recolor AI dot/label to green-accent (or register 🔄), (3) tie `isObserving` to `expanded`. RULE 16 re-grep on both files would close all three concerns in one pass with one banned-pattern recheck.

---

✅ AUDIT_A6.md written — 3 gaps found across 1 screen. Round 5.
STAGE_COMPLETE: verified=5 not_landed=0 regressions=0
