# Code Audit — Agent A — Round 6
Date: 2026-05-21
Method: Systematic web (React/Vite SPA under `web/src/`) → macOS (SwiftUI under `macOS/KanbanClaude/`) comparison. Round 7 audit (AUDIT_A7.md) covers the 3 V6 fixes (FINAL_FIXES_V6.md commits `de0b39b`, `f6876aa`, `cccfd91`) plus a fresh sweep for new gaps across all 22 MVP screen groups at branch tip `cccfd91`.
Screens audited: 22 MVP groups + 3 V6-fix verification rows
Total gaps found (new this round): 0
Fixes verified (Round > 1): 3 ✅  0 ❌  0 ⚠  0 🔴

## Method notes
- Web reference = `web/src/` (`App.tsx`, `components/*.tsx`, `KnowledgeView.tsx`, `api.ts`); `web/index.html` is the 32-line bootstrap shell only.
- macOS reference = .swift files under `macOS/KanbanClaude/`; endpoint catalog at `Networking/Endpoint.swift`, client at `Networking/APIClient.swift`. 85 Swift sources at this tip.
- Each V6 fix verified by re-reading the touched file (`UI/Card/CardTimelineView.swift`) at the line numbers cited in `FINAL_FIXES_V6.md`. Verification is code-read confirmation, not a runtime check (I-1 locked-screen ceiling carries over from R1..R6).
- The three V6 commits all touch the same file (`UI/Card/CardTimelineView.swift`); the change-surface for this round is one file plus the cumulative state of the prior 22-group sweep.
- Codebase-wide grep for the three RULE 3 / RULE 7 banned patterns (`async let _ =`, bare-array `try (decoder|JSONDecoder()).decode([…)`, `.task { await refresh|loadAll|fetchAll|reload }`) returned **zero matches** across `macOS/KanbanClaude/` — third consecutive round with the banned-pattern surface fully swept (no regression vs Round 5 / Round 6).

---

## Fix Verification (Round 6)

| Fix ID | Status | Evidence | Notes |
|--------|--------|----------|-------|
| FIX-V6-001 | ✅ Verified | `UI/Card/CardTimelineView.swift:101-106` (body branch), `:121-126` (`systemBody` helper), `:128-139` (label collapse) | `TimelineRow.body` now branches `if event.entryType == .system, let body = systemBody { Text(body)…fixedSize(horizontal: false, vertical: true).multilineTextAlignment(.leading) }` exactly as specced. `systemBody` (`:121-126`) reads `event.details["body"]?.stringValue` and trims whitespace, returning `nil` when empty — matches web `CardTimeline.tsx:32` (`typeof e.details?.body === 'string' ? body : null`). Label collapses to `event.actorName ?? "Someone"` when body is present (`:130-133`), falling back to `"\(actorName) \(action)"` otherwise — exactly the `<actor_name>: <body>` vs `<actor_name> <action>` web split (`CardTimeline.tsx:40-41`). Notetaker-bridge multi-line summaries now render inline on macOS. RULE 16 re-grep on `CardTimelineView.swift` returned zero banned-pattern matches. |
| FIX-V6-002 | ✅ Verified | `UI/Card/CardTimelineView.swift:145` (dot), `:151` (label) | `dotColor` for `.ai` now returns `Tokens.greenAccent.opacity(0.6)` (`:145`) — matches web `bg-green-accent/60` (`CardTimeline.tsx:91`). `labelColor` for `.ai` now returns `Tokens.greenAccent` (`:151`) — matches web `text-green-accent` (`CardTimeline.tsx:94`). The AI timeline rail is no longer split-brand across web (green) vs macOS (violet); both surface the same green-accent. Path A from V6-002 spec applied (parity over per-platform rebrand). System dot retains `Tokens.greenAccent` (`:143`, untouched), share dot retains `Tokens.greenUplift` (`:146`, untouched). RULE 16 re-grep on the touched file: zero banned-pattern matches. |
| FIX-V6-003 | ✅ Verified | `UI/Card/CardTimelineView.swift:35-42` | `.onAppear { store.setObserving(true) }` has been removed. The `setObserving` call has been folded into the existing `.onChange(of: expanded)` block at `:35-41`: `onChange(of: expanded) { isOpen in store.setObserving(isOpen); if isOpen && !didLoad { didLoad = true; Task { await store.load() } } }`. The safety-net `.onDisappear { store.setObserving(false) }` is preserved (`:42`) so a torn-down view never leaves the store in observing-true. Net behavior now mirrors web `CardTimeline.tsx:147` exactly: `markRead` fires only while the disclosure is `open`. A WS message arriving while the chat is collapsed (the common unread-bubble case) now goes `apply → wasNew=true && isObserving==false → markRead not called → unread persists`. RULE 16 re-grep on the touched file: zero banned-pattern matches. |

Verified counts: **3 ✅ · 0 ⚠ · 0 ❌ · 0 🔴**

Every Round-6 fix landed cleanly. No partial implementations, no regressions, no fresh RULE-3 / RULE-7 / RULE-16 violations in the touched file (or anywhere else in `macOS/KanbanClaude/`).

---

## Gap Registry (new this round)

| ID | Screen | Web behavior | Web code location | Swift/Tauri equivalent | Found? | Confidence |
|----|--------|-------------|-------------------|------------------------|--------|-----------|

(No new gaps surfaced from this round's focused sweep on `UI/Card/CardTimelineView.swift` or from the cumulative re-sweep of the 22 MVP groups. See "Notes for Agent C" below for the trend line and a SHIP_READY discussion.)

---

## P0 — Critical Gaps (core functionality missing)

None. The Round-6 sweep closed the last P1 behavioral surface (FIX-V6-001 notetaker-bridge body inlining) plus the two P2 polish/parity items (FIX-V6-002 AI-color drift, FIX-V6-003 markRead scope nuance). No new P0 emerged from a fresh read of the changed file or the prior-round inventory.

## P1 — Behavioral Gaps (feature exists but behaves differently)

None this round.

## P2 — Minor Gaps (polish, edge cases, error states)

None this round.

---

## Verified OK (spot-checked items still passing this round)

- All Round-1 / Round-2 / Round-3 / Round-4 / Round-5 / Round-6 FIXes (F-001…F-036 + 17 V2 + 7 V3 + 6 V4 + 5 V5 + 3 V6) remain present and unchanged on `cccfd91`.
- **CardTimeline parity (the file that changed this round):**
  - System dot color (`.system`): macOS `Tokens.greenAccent` matches web `bg-green-accent` (`CardTimeline.tsx:35`).
  - Message dot color (`.message`): macOS `Tokens.ceramic` matches web `bg-ceramic` (`CardTimeline.tsx:51`).
  - AI dot color (`.ai`): macOS `Tokens.greenAccent.opacity(0.6)` matches web `bg-green-accent/60` (`CardTimeline.tsx:91`). ← V6-002.
  - AI label color: macOS `Tokens.greenAccent` matches web `text-green-accent` (`CardTimeline.tsx:94`). ← V6-002.
  - System row body inlining: macOS branches on `event.details["body"]?.stringValue` and renders inline with multi-line wrapping; matches web SystemEntry body inlining (`CardTimeline.tsx:39-41`). ← V6-001.
  - WS markRead scope: macOS `isObserving` flips only with `expanded`; matches web `if (!incomingEvents?.length || !open) return` (`CardTimeline.tsx:147`). ← V6-003.
  - AI suggestion pill apply paths (`update_status`, `set_due_date`, `assign_user`, `create_card`) intact at `:178-213` — registry F-283..F-287 still ✅.
  - Auto-scroll-to-bottom on event-count change wired through `ScrollViewReader.scrollTo(last.id, anchor: .bottom)` at `:69-71` — F-277 still ✅.
  - DisclosureGroup label still shows `Chat & Activity` mono-10 + event count (`:20-29`) — F-273 still ✅.
  - `CardEventsStore.load()` still calls `markRead` after fresh fetch (`CardEventsStore.swift:38-41`) — F-275 still ✅.
- `CardEvent.EntryType` still includes the dead `.share` case (`Networking/Codables/CardEvent.swift:18-20`) with the explicit "plan also lists 'share' but the server type union does not — mirror the live server" comment. Harmless — no web `share` entry exists, server union is `system|message|ai`. No action.
- API surface: every endpoint exposed in `web/src/api.ts` has a matching `Endpoint` case in `Networking/Endpoint.swift`, except (a) the deliberately-replaced web-push subscribe endpoints (closed 🚫 in Round 1), (b) `/api/cards/:id/qr.svg` (replaced by `QRGenerator.swift` per V-003), and (c) the two multipart upload endpoints (`POST /api/cards/from-image`, `POST /api/cards/:id/attachments`) which are issued from `Stores/CardStore.swift` via a raw `endpointPath:` helper that bypasses the typed `Endpoint` enum for `multipart/form-data` — deliberate accommodation.
- EditCardView section order: title → status → description → tags → AI Insights → Knowledge → due → attachments → assignees → shares → chat (`EditCardView.swift:72-93` MARK comments confirm). AI Insights and Knowledge still above-the-fold; Knowledge always-open inline per FIX-V4-002. Section labels dropped for Title, Tags, Description per FIX-V3-003 + FIX-V2-013.
- ArchiveSheet header copy = `"Archived cards"` (FIX-V4-003); per-row lane indicator = labeled colored capsule pill (FIX-V4-004).
- WeeklyReviewSheet section headings = uniform uppercase ink-soft mono with leading `·` bullet on rows (FIX-V4-005); `Generate again` button flips to `Generating…` while loading (FIX-V4-006).
- AI Insights `Next steps` no longer client-capped (FIX-V5-001).
- AccountTab success and failure save indicators render in distinct tones (FIX-V5-002).
- Board column lane dot has 14pt halo behind the 8pt fill (FIX-V5-004).
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
  Third consecutive round with the cancellation-risk surface fully closed.

---

## Notes for Agent C (prioritization input)

1. **Trend line, R2 → R7**: gap counts have monotonically narrowed each round: R2: 17 → R3: 7 → R4: 6 → R5: 6 → R6: 3 → **R7: 0**. The three R6 gaps were all in `UI/Card/CardTimelineView.swift`; all three landed in the V6 commit triplet (`de0b39b` / `f6876aa` / `cccfd91`) exactly as specced, with no overshoot and no neighboring regressions. This round is the natural SHIP_READY pass on A's column.

2. **No new structural drift detected.** A fresh code-only sweep against the 22 MVP groups in the registry found nothing new. The carryover macOS adaptations that the prior auditor (same role across R2-R6) accepted as part of the "premium not slop" / `feedback_premium_not_slop.md` direction — uppercase mono section headings in AI Insights, ✨-summary line tinted with violet on the card tile, scale-based hover vs Y-translate on `CardTileView` — remain unchanged and have been treated as 🔄 macOS adaptations across every prior round. R7 follows the same convention; if you (Agent C) want any of those flipped to literal web parity, file them explicitly — the audit will pick them up next round.

3. **B7's verdict will be the deciding signal.** Both R5 and R6 had A finding bounded code-parity gaps while B's screenshot audit returned SHIP_READY = true under I-1 (locked screen). With A returning zero new gaps this round, the *only* class of finding left in the system is "visual diff we cannot run from a locked display." If the orchestrator has `caffeinate -dimsu sleep 3600 &` started before the next session lock plus pre-authed macOS state, a Round-8 RULE-14 visual diff could finally cross every 🔄 row off the registry. Until then, A's R7 = 0 gaps + B's R6 = 0 gaps + RULE-3/7/16 codebase-wide clean is the strongest SHIP_READY signal the build has produced.

4. **No fresh I-N learning candidates from this round.** The V6 fixes were applied precisely as specced — no surprises, no rule promotions warranted. The R2/R3/R4/R5/R6 fix loop converged cleanly into this round.

5. **Composite fix plan: not applicable this round.** With zero new gaps, there is nothing to bundle. If Agent C decides to file any of the legacy macOS-adaptation drifts mentioned in (2), they would all live in `UI/Main/CardTileView.swift` and `UI/Card/AiInsightsPanelView.swift` — both are RULE-16-clean today.

6. **Recommendation**: tag this branch as code-SHIP_READY pending a Round-8 visual-diff pass. The structural-parity surface is closed.

---

✅ AUDIT_A7.md written — 0 gaps found across 22 screens. Round 6.
STAGE_COMPLETE: verified=3 not_landed=0 regressions=0
