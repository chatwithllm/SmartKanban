# Final Fix List — Agent C Synthesis — Round 6
Date: 2026-05-21
Sources: AUDIT_A6.md (3 gaps) + AUDIT_B6.md (0 gaps)
Cross-reference: 1 P1 (code-only, spot-check confirmed) / 2 P2 (code-only, spot-check confirmed) / 0 closed intentional / 0 P0
Fix verification (V5): 5/5 ✅ landed — no regressions
Total actionable fixes: 3
Estimated total effort: ~50 min

---

## Cross-reference matrix

| Gap | In A? | In B? | Cross-ref priority | Spot-check verdict | Final priority |
|-----|-------|-------|--------------------|--------------------|----------------|
| Notetaker bridge `details.body` dropped on system rows | CA6-001 | — | P2 visual-only would have been; **A flagged P1 behavioral** | Real — macOS `TimelineRow.label:117` is hardcoded `"\(actorName) \(action)"`; `CardEvent.details` is decoded (line 11) but never consulted. Web `CardTimeline.tsx:32,39-41` renders the body inline with `whiteSpace: pre-wrap`. Data path exists; render path does not. | **P1** behavioral |
| AI timeline dot + label render in violet vs web green-accent | CA6-002 | — | P2 polish | Real — macOS `dotColor` for `.ai` returns `Tokens.violet` (`CardTimelineView.swift:128`); `labelColor` for `.ai` returns `Tokens.violet` (`:134`). Web uses `bg-green-accent/60` dot + `text-green-accent` "AI" prefix. Brand-token drift on one platform. | **P2** cosmetic / brand-decision |
| WS markRead fires while DisclosureGroup collapsed | CA6-003 | — | P2 narrow scope | Real — macOS `isObserving` is set by `CardTimelineView.onAppear` / `.onDisappear` (`:41-42`), not by `expanded` (`:6`). Web gates `markRead` on `if (!incomingEvents?.length || !open) return;` (`CardTimeline.tsx:147`). After first session-expansion, any WS event triggers markRead even while collapsed. Narrow window, real parity drift. | **P2** behavioral-narrow |

**B6 verdict mismatch note**: AUDIT_B6 reports `p0_count=0, p1_count=0, SHIP_READY=true` and concludes no visual gaps. B6's verdict is correct *within its scope* — B6 was code-verified per RULE 17 (screen locked, synthetic clicks unavailable) and cannot see system-row body inlining, AI-color drift, or DisclosureGroup-gated markRead from screenshot comparison. A6's three findings are all **structural code parity** items that only a source read surfaces. The two audits are consistent: **B saw no visual regression because the screen was locked**, not because the gaps don't exist. A's findings are dispositive this round.

V5 fix verification: All 5 FIX-V5 items (V5-001…V5-005) landed cleanly per both auditors. RULE 3/7/16 banned-pattern matrix codebase-wide green for the second consecutive round (`async let _ =`, bare-array decode, `.task { await refresh|loadAll|fetchAll|reload }` all return zero matches).

---

## P0 — Fix Immediately (both auditors found)

None.

---

## P1 — Fix Next (code confirms missing)

### FIX-V6-001: CardTimeline system rows silently drop notetaker-bridge bodies — ✅ DONE @ CardTimelineView.swift:101 (body branch), :121 (systemBody), :128-133 (label collapse)
Found by: CA6-001 (A only; B6 cannot capture timeline detail on locked screen)
File: `macOS/KanbanClaude/UI/Card/CardTimelineView.swift`
Line: 89-122 (`TimelineRow.body` + `TimelineRow.label`)
Registry row: F-279 — "External-integration bodies (notetaker bridge) inlined with whiteSpace:pre-wrap"

Specific change: branch on `event.entryType == .system && event.details["body"]?.stringValue` in the row body. When a body is present, render `<actor_name>: <body>` with multi-line wrapping; keep the label as just `actorName`. When absent, keep the existing `<actor_name> <action>` shape.

```swift
// CardTimelineView.swift — replace TimelineRow.body and TimelineRow.label

var body: some View {
    HStack(alignment: .top, spacing: 8) {
        Circle().fill(dotColor).frame(width: 8, height: 8).padding(.top, 5)
        VStack(alignment: .leading, spacing: 2) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(label)
                    .font(.sans(11, weight: .semibold))
                    .foregroundStyle(labelColor)
                Text(relTime(event.createdAt))
                    .font(.mono(10))
                    .foregroundStyle(Tokens.ink3)
            }
            if event.entryType == .system, let body = systemBody {
                // Notetaker bridge / external integrations push the comment text
                // into details.body. Render it inline as a real comment.
                Text(body)
                    .font(.sans(12))
                    .foregroundStyle(Tokens.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .multilineTextAlignment(.leading)
            } else if let content = event.content, !content.isEmpty {
                Text(content)
                    .font(.sans(12))
                    .foregroundStyle(Tokens.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .multilineTextAlignment(.leading)
            }
            if event.entryType == .ai, let suggestions = event.aiSuggestions, !suggestions.isEmpty {
                suggestionPills(suggestions)
            }
        }
    }
}

private var systemBody: String? {
    guard event.entryType == .system else { return nil }
    let body = event.details["body"]?.stringValue
    let trimmed = body?.trimmingCharacters(in: .whitespacesAndNewlines)
    return (trimmed?.isEmpty == false) ? trimmed : nil
}

private var label: String {
    switch event.entryType {
    case .system:
        // When details.body is present we render the body inline as the row's
        // content, so the label collapses to just the actor name to match
        // `<actor_name>: <body>` from web CardTimeline SystemEntry.
        if systemBody != nil {
            return event.actorName ?? "Someone"
        }
        return "\(event.actorName ?? "Someone") \(event.action ?? "updated")"
    case .message: return event.actorName ?? "Anonymous"
    case .ai: return "AI"
    case .share: return "Shared by \(event.actorName ?? "")"
    }
}
```

Verify `JSONValue.stringValue` exists (`Networking/Codables/AiSuggestion.swift:51` is the existing call site cited in A6). No new endpoint plumbing, no new Codable changes.
Per RULE 16, on commit re-grep `CardTimelineView.swift` for the three banned patterns. None expected.
Estimated effort: **S (~15 min)** — single-file edit + build + log validation.

---

## P2 — Verify Then Fix (visual polish / narrow parity)

### FIX-V6-002: CardTimeline AI dot + label render in violet vs web green-accent
Found by: CA6-002 (A only)
File: `macOS/KanbanClaude/UI/Card/CardTimelineView.swift`
Line: 128 (`dotColor` for `.ai`), 134 (`labelColor` for `.ai`)
Registry row: F-281 — "AI entry: green-accent/60 dot + 'AI:' prefix (green-accent) + content"

Two paths, decide before applying:

**Path A — match web (parity fix)**: flip both AI cases to `Tokens.greenAccent` so the timeline AI brand matches web. Note that the AI pulse / ✨ badge elsewhere in macOS uses violet — this leaves a split AI brand inside the macOS app (timeline = green, insights/badge = violet).

```swift
// CardTimelineView.swift — TimelineRow

private var dotColor: Color {
    switch event.entryType {
    case .system: return Tokens.greenAccent
    case .message: return Tokens.ceramic
    case .ai: return Tokens.greenAccent.opacity(0.6)   // was Tokens.violet
    case .share: return Tokens.greenUplift
    }
}
private var labelColor: Color {
    switch event.entryType {
    case .ai: return Tokens.greenAccent                // was Tokens.violet
    default: return Tokens.ink2
    }
}
```

Verify `Tokens.greenAccent` is the matching token (it is — confirmed used by `.system` row dot at `:126` and listed in the design tokens; same token used by AccountTab "Saved." per FIX-V5-002 evidence).

**Path B — register macOS adaptation (parity exception)**: keep violet, register F-281 as `🔄` in `FEATURE_PARITY_REGISTRY.md` with the written justification: *"macOS AI brand = violet to match the CardView ✨ insight pulse, AI Insights panel violet accent, and the suggestion-pill violet across the desktop app. The web's green-accent AI is a deliberate web-only brand."* Path B is a single-line registry edit, no Swift change.

**Recommendation**: **Path A**. Path B fragments the brand across platforms — a user who sees green AI on web and violet AI on the macOS timeline will read it as two products. The macOS ✨ pulse can stay violet; the *timeline AI rail* matches web's authority. If the user has explicitly said "macOS AI = violet everywhere" since `feedback_premium_not_slop.md` was written, defer to Path B and register.

[NEEDS DECISION FROM USER OR FIX AGENT] If no decision is available, the fix agent should apply Path A (registry-truth) and note the registry registration as a follow-up. Either path closes the gap.

Estimated effort: **S (~5 min)** for Path A; **S (~5 min)** for Path B (registry edit only).

---

### FIX-V6-003: WS markRead fires while DisclosureGroup is collapsed (post-first-expansion) — ✅ DONE @ CardTimelineView.swift:35-41 (folded setObserving into onChange(expanded), dropped onAppear)
Found by: CA6-003 (A only)
File: `macOS/KanbanClaude/UI/Card/CardTimelineView.swift`
Line: 35-42 (the `onChange(of: expanded)` block + the `.onAppear` / `.onDisappear` pair)

Specific change: tie `isObserving` to `expanded`, not view lifecycle. Fold the call into the existing `onChange(of: expanded)` block; drop the appear/disappear pair.

```swift
// CardTimelineView.swift — replace the .onChange / .onAppear / .onDisappear block (currently :35-42)

.onChange(of: expanded) { isOpen in
    store.setObserving(isOpen)
    if isOpen && !didLoad {
        didLoad = true
        Task { await store.load() }
    }
}
.onDisappear { store.setObserving(false) }   // safety net on view dismissal
```

Web semantics (`CardTimeline.tsx:147`): `markRead` fires only while `open === true`. macOS now mirrors: `isObserving` flips true only when the disclosure opens, flips false on collapse or view dismissal. `store.load()` is still gated by `didLoad` so it only runs on first open per session — unchanged.

Sanity: after this change, if a WS message arrives while the chat is collapsed (the common case for an unread bubble), `isObserving == false` → `apply(_:)` appends silently → `markRead` is **not** called → unread bubble persists, which is the web behavior and the correct UX.

Per RULE 16, on commit re-grep `CardTimelineView.swift` for the three banned patterns. None expected.
Estimated effort: **S (~10 min)** — single-block edit + manual sanity (open card, leave chat collapsed, post from another browser session, confirm bubble stays).

---

## Closed as Intentional (🔄 with justification)

None this round.

---

## Recommended fix order

All three live in **`UI/Card/CardTimelineView.swift`** (FIX-V6-002 + FIX-V6-003) plus a one-line edit if Path A of FIX-V6-002 is taken. Per A6's "composite fix plan" note, bundle as one commit:

1. **FIX-V6-001** (system body inlining) — P1, real user-visible regression. Notetaker bridge meeting summaries are silently dropped on desktop today. Highest priority.
2. **FIX-V6-003** (markRead while collapsed) — P2 narrow but fixes parity correctness; 5-line edit; ships with FIX-V6-001 in the same file.
3. **FIX-V6-002** (AI brand color) — P2 polish; ships as the same commit if Path A; otherwise becomes a separate one-line registry edit commit.

Total: **~30 min coding** + build + log validation per the V3/V4/V5 commit pattern. A single bundled "timeline parity pass" commit covers V6-001 + V6-003 (+ V6-002 if Path A).

Commit message convention from V3/V4/V5: `fix: FIX-V6-NNN — <one-line spec> (round 6)`.

---

## Notes for fix agent

- The locked-screen ceiling (I-1) continues to block RULE 14 visual diff. All three fixes here are structural Swift edits verifiable by `xcodebuild` Release build + `log show` (RULE 6) — no pixel-diff needed for V6-001 / V6-003. V6-002 is a token swap; the visual diff is also unreachable on a locked screen but the code-side change is unambiguous either way.
- Apply RULE 16 on every commit: re-grep the touched file for the three banned patterns (`async let _ =`, bare-array `decoder.decode([…)`, `.task { await refresh|loadAll|fetchAll|reload }`). Codebase-wide grep is currently green for the second consecutive round; do not regress it.
- No fresh I-N learning candidates from this round — all three gaps are bounded:
  - V6-001 is a data-path miss (the macOS render never consulted a field the decoder already produces).
  - V6-002 is a token-decision call.
  - V6-003 is a state-scope nuance fixable in 5 lines.
- After this round lands, expect the next audit cycle (R7) to be the SHIP_READY pass — A's gap count has narrowed each round (R2: 17 → R3: 7 → R4: 6 → R5: 6 → R6: 3) and the residual three are all in one file.
- The B6 SHIP_READY verdict is **not** wrong — it reflects what a code-verified visual audit can see on a locked screen. The disagreement is structural, not a regression. If/when the locked-screen ceiling clears (`caffeinate -dimsu sleep 3600 &` started before lock + signed-in macOS state pre-staged), a pixel-diff audit will likely confirm the same three findings A surfaced this round, plus catch the AI color drift visually.

---

✅ FINAL_FIXES_V6.md written
📊 P0: 0 | P1: 1 | P2: 2 | Closed: 0
STAGE_COMPLETE: verdict=NEEDS_FIXES remaining=1
