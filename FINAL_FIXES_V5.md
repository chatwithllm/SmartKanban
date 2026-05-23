# Final Fix List — Agent C Synthesis — Round 4
Date: 2026-05-21
Sources: AUDIT_A5.md (6 gaps) + AUDIT_B5.md (0 gaps)
Cross-reference: 3 P1 / 2 P2 / 1 closed intentional / 0 P0
Fix verification (V4): 6/6 ✅ landed — no regressions
Total actionable fixes: 5
Estimated total effort: ~1.5 hours

---

## Cross-reference matrix

| Gap | In A? | In B? | Cross-ref priority | Spot-check verdict | Final priority |
|-----|-------|-------|--------------------|--------------------|----------------|
| AI Insights Next steps `.prefix(4)` cap | CA5-001 | — | P1 code-only | Real — web has no cap | **P1** |
| AccountTab error renders in greenAccent | CA5-002 | — | P1 code-only | Real — single `savedMessage` slot tinted green for both success and failure | **P1** |
| ScopePicker missing per-scope counts | CA5-003 | — | P1 code-only | **Closed intentional** — web `BoardHeader` accepts `scopeCounts?` optional but `App.tsx` never passes it; production web shows no counts either | **CLOSED** |
| WS chat appends don't mark-read | CA5-004 | — | P1 code-only | Real — `web/src/components/CardTimeline.tsx:152` calls `markRead(fresh)` on every incoming WS batch when `open`; macOS `CardEventsStore.apply(_:)` only appends | **P1** |
| Lane dot lacks 3pt halo | CA5-005 | — | P1 code-only | Real — `web/src/components/Column.tsx:156` `box-shadow: 0 0 0 3px rgb(var(--pin-color) / 0.12)`; macOS `BoardColumnView.swift:91` is bare `Circle()` | **P2** cosmetic |
| `+` button lacks hover rotate(90deg) | CA5-006 | — | P1 code-only | Real — `web/src/components/Column.tsx:189` rotates on `:hover`; macOS has no hover state | **P2** cosmetic |

Two cosmetic gaps demoted to P2 per A's classification and the user's locked design direction (`feedback_premium_not_slop.md`: "motion on interaction not idle loops" — these are motion-on-interaction items, real signal, but not behavioral correctness).

V4 fix verification: All 6 FIX-V4 items (V4-001 a/b/c, V4-002…V4-006) landed cleanly per both auditors. Banned-pattern matrix (`async let _ =`, bare-array decode, `.task { await refresh|loadAll|fetchAll|... }`) is fully green codebase-wide for the first time in the audit series.

---

## P0 — Fix Immediately (both auditors found)

None.

---

## P1 — Fix Next (code confirms missing)

### FIX-V5-001: AI Insights — Next steps cap drops items 5..N silently ✅ (AiInsightsPanelView.swift:85)
Found by: CA5-001 (A only; B5 cannot capture insights overlay on locked screen)
File: `macOS/KanbanClaude/UI/Card/AiInsightsPanelView.swift`
Line: 85 (inside `if let steps = latest.body?.nextSteps, !steps.isEmpty` block)
Specific change:
```swift
// before
ForEach(Array(steps.prefix(4).enumerated()), id: \.offset) { idx, step in
// after
ForEach(Array(steps.enumerated()), id: \.offset) { idx, step in
```
Drop the `.prefix(4)`. Web (`web/src/components/AiInsightsPanel.tsx:177`) renders the full `next_steps` list — the server is the authority on length. If a density cap is wanted, promote it to a registered `🔄` row on F-231 with a written justification per RULE 14; otherwise just remove the cap.
Effort: S (5 min — single-line edit, then build + log validation)

### FIX-V5-002: AccountTab — save errors render in success color ✅ (AccountTab.swift:7-8,28-32,53-61)
Found by: CA5-002 (A only)
File: `macOS/KanbanClaude/UI/Preferences/AccountTab.swift`
Line: 7 (state), 27–29 (display), 45–60 (`save(user:)`)
Specific change: split the single `savedMessage: String?` state into `savedOk: Bool` + `savedError: String?` so success and failure render in distinct tones (mirror web `SettingsDialog.tsx:145-146`).
```swift
// before
@State private var savedMessage: String?
...
if let msg = savedMessage {
    Text(msg).foregroundStyle(Tokens.greenAccent).font(.sans(11))
}
...
do {
    _ = try await auth.updateMe(shortName: trimmed, name: nil)
    savedMessage = "Saved."
    try? await Task.sleep(nanoseconds: 1_500_000_000)
    savedMessage = nil
} catch {
    savedMessage = error.localizedDescription
}

// after
@State private var savedOk: Bool = false
@State private var savedError: String?
...
if savedOk {
    Text("Saved.").foregroundStyle(Tokens.greenAccent).font(.sans(11))
} else if let err = savedError {
    Text(err).foregroundStyle(Tokens.danger).font(.sans(11))
}
...
do {
    _ = try await auth.updateMe(shortName: trimmed, name: nil)
    savedError = nil
    savedOk = true
    try? await Task.sleep(nanoseconds: 1_500_000_000)
    savedOk = false
} catch {
    savedOk = false
    savedError = error.localizedDescription
}
```
Verify `Tokens.danger` exists in the design tokens; if not, use the same red token web uses for `text-red`. (Spot-check `macOS/KanbanClaude/Theme/Tokens.swift` first.)
Per RULE 16, on commit re-grep `AccountTab.swift` for the three banned patterns. None expected (the file has no networking/concurrency surface other than the existing `Task { ... }` block).
Effort: S (~10 min — small structural edit + build + log validation)

### FIX-V5-003: CardEventsStore — WS appends don't call markRead while observing ✅ (CardEventsStore.swift:15-18,60-67; CardTimelineView.swift:42-43)
Found by: CA5-004 (A only)
File: `macOS/KanbanClaude/Stores/CardEventsStore.swift` + `macOS/KanbanClaude/UI/Card/CardTimelineView.swift`
Line: `CardEventsStore.swift:14` (new state), 45–49 (`append`), 57–64 (`apply`); `CardTimelineView.swift:31–41` (observe lifecycle)
Specific change: add an `isObserving: Bool` flag on the store; set it from `CardTimelineView.onAppear`/`onDisappear`; when WS branch in `apply(_:)` fires and `isObserving == true`, call `markRead()` after `append(event)`.
```swift
// CardEventsStore.swift — add state
private(set) var isObserving: Bool = false

func setObserving(_ on: Bool) { isObserving = on }

private func apply(_ ev: BroadcastEvent) {
    switch ev {
    case .cardMessage(let event, let cid, _), .cardAiResponse(let event, let cid, _):
        if cid == cardId {
            let wasNew = !seenIds.contains(event.id)
            append(event)
            if wasNew && isObserving {
                Task { @MainActor in await self.markRead() }
            }
        }
    default:
        break
    }
}
```
```swift
// CardTimelineView.swift — wire the flag (around :31-41, alongside the existing .onChange)
.onAppear { store.setObserving(true) }
.onDisappear { store.setObserving(false) }
```
Matches web `CardTimeline.tsx:146-154` semantics: "if the user is actively reading, mark read on every fresh batch." Helper `markRead()` already exists at `:51-55` — no new endpoint plumbing.
Per RULE 16, on commit re-grep `CardEventsStore.swift` and `CardTimelineView.swift` for the three banned patterns. None expected.
Effort: M (~25 min — two-file change + manual sanity that markRead fires when a teammate posts while EditCardView is open; if log validation can't reach a second user, leave a note in commit msg)

---

## P2 — Verify Then Fix (visual polish, motion signal)

### FIX-V5-004: Board column header — lane dot lacks 3pt halo ✅ (BoardColumnView.swift:91-94)
Found by: CA5-005 (A only)
File: `macOS/KanbanClaude/UI/Main/BoardColumnView.swift`
Line: 91
Specific change:
```swift
// before
Circle().fill(dotColor).frame(width: 8, height: 8)
// after
ZStack {
    Circle().fill(dotColor.opacity(0.12)).frame(width: 14, height: 14)
    Circle().fill(dotColor).frame(width: 8, height: 8)
}
```
Equivalent to web's `box-shadow: 0 0 0 3px rgb(var(--pin-color) / 0.12)`. 3-line addition.
Effort: S (5 min)

### FIX-V5-005: Board column header — `+` button lacks hover rotate(90deg) ✅ (BoardColumnView.swift:14,102-114)
Found by: CA5-006 (A only)
File: `macOS/KanbanClaude/UI/Main/BoardColumnView.swift`
Line: 99–108 (`Button(action: onAdd)` block)
Specific change: add `@State private var addHovered = false` on the struct; rotate the plus glyph by 90° on hover with the spring animation matching the user's locked-in motion direction.
```swift
// near the top of BoardColumnView's struct body
@State private var addHovered = false

// in the header HStack — replace existing Button block
Button(action: onAdd) {
    Image(systemName: "plus")
        .font(.system(size: 11, weight: .semibold))
        .foregroundStyle(addHovered ? Tokens.ink : Tokens.ink2)
        .rotationEffect(.degrees(addHovered ? 90 : 0))
        .animation(.spring(response: 0.28, dampingFraction: 0.85), value: addHovered)
        .padding(6)
        .background(addHovered ? Tokens.hairline.opacity(0.06) : Tokens.canvas)
        .clipShape(Circle())
        .overlay(Circle().strokeBorder(Tokens.hairline, lineWidth: 1))
}
.buttonStyle(.plain)
.onHover { addHovered = $0 }
```
Aligns with `feedback_premium_not_slop.md`: "motion on interaction not idle loops". Verify `Tokens.hairline` supports `.opacity(...)` (Color does; type-check at build).
Effort: S (10 min)

---

## Closed as Intentional (🔄 with justification)

### CA5-003 — ScopePicker per-scope counts
Reason: Web `BoardHeader.tsx` accepts `scopeCounts?: Record<Scope, number>` as an **optional** prop (`:26`). A grep of `web/src/App.tsx` for `scopeCounts` returns zero matches — production web never passes the prop, so the trailing count is never rendered. macOS parity is therefore already at "no counts shown," matching shipping web. If the user later wants counts on both surfaces, ship the derived `Dictionary<Scope, Int>` plumbing as a registered new feature — not a parity fix.
Register as `🔄` on the relevant BoardToolbar row in FEATURE_PARITY_REGISTRY.md with the justification above on next regular registry sweep.

### RESIDUE-B5-001 — unused `accent: Color` parameter in `WeeklyReviewSheet.section(...)`
Reason: B5 flagged as housekeeping, not a gap. FIX-V4-005 made the section heading independent of `accent`, but the parameter and call sites (`:29 :35 :41`) still pass colour values. Drop only if a Round-5 polish commit revisits the file (RULE 16 will not catch unused parameters automatically — this is a manual cleanup). Not part of the actionable fix list this round.

---

## Recommended fix order

1. **FIX-V5-002** (AccountTab error tone) — highest user-confusion impact (success-looking confirmation for a real failure). ~10 min.
2. **FIX-V5-001** (Next steps cap) — one-line correctness fix, lowest risk. ~5 min.
3. **FIX-V5-003** (WS markRead while observing) — behavioral parity for real-time chat. ~25 min.
4. **FIX-V5-004** + **FIX-V5-005** — bundle as a single "Board column chrome polish" commit. ~15 min.

Total: ~55 min coding + build + log validation per the V3/V4 commit pattern (one commit per FIX-V5 spec).

---

## Notes for fix agent

- The locked-screen ceiling (I-1) continues to block Rule 14 visual diff. All five fixes here are structural/lexical Swift edits verifiable by `xcodebuild` Release build + `log show` (Rule 6) — no pixel-diff needed.
- Apply RULE 16 on every commit: re-grep the touched file for the three banned patterns (`async let _ =`, bare-array `decoder.decode([…)`, `.task { await refresh|loadAll|fetchAll|... }`). Codebase-wide grep is currently green; do not regress it.
- Commit message convention from V3/V4: `fix: FIX-V5-NNN — <one-line spec> (round 5)`.
- No new I-N learnings expected from this fix set. All five are bounded behavioral / cosmetic drift, no new failure class.

---

✅ FINAL_FIXES_V5.md written
📊 P0: 0 | P1: 3 | P2: 2 | Closed: 1
STAGE_COMPLETE: verdict=NEEDS_FIXES remaining=3
