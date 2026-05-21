# Final Fix List — Agent C Synthesis — Round 3
Date: 2026-05-21
Sources: AUDIT_A4.md (6 gaps + 7/7 FIX-V3 verifications ✅) + AUDIT_B4.md (0 visual gaps + 1 latent risk + 7/7 FIX-V3 verifications ✅)
Cross-reference: 1 P0 / 5 P1 / 0 P2 / 0 closed intentional
Total actionable fixes: 6
Estimated total effort: ~1.0 hours

## Cross-Reference Matrix

| Gap | In A? | In B? | Spot-check verdict | Priority |
|-----|-------|-------|--------------------|----------|
| Preferences `.task { await refresh() }` triple (RULE 3 / I-7) | CA4-006 | LATENT-B4-001 | **Verified**: `TokensTab.swift:57`, `TelegramTab.swift:45`, `TemplatesTab.swift:43` all hold `.task { await refresh() }`. A flags as RULE 3 ban violation; B flags as latent I-7 cancellation surface. Both auditors agreed it should ship in a Round 4 sweep. | **P0** |
| Knowledge section collapsed inside `DisclosureGroup` (web shows always-open inline) | CA4-001 | — | **Verified**: `EditCardView.swift:293-337` wraps the Knowledge body in `DisclosureGroup { … } label: { SectionLabel("Knowledge") }`. Web (`web/src/components/EditDialog.tsx:294-361`) renders the section inline, always expanded. Behavioral divergence — linked items, +Attach, Save-as-knowledge all hidden behind a click. | **P1** |
| Archive header title copy (`Archive` vs `Archived cards`) | CA4-002 | — | **Verified**: `ArchiveSheet.swift:12` reads `ModalHeaderStrip(title: "Archive")`. Web (`ArchiveDialog.tsx:98-99`) reads `Archived cards`. Trivial copy drift. | **P1** |
| Archive row lane indicator (8pt circle dot vs labeled colored pill) | CA4-003 | — | **Verified**: `ArchiveSheet.swift:91` renders `Circle().fill(statusColor).frame(width: 8, height: 8)` followed by a `was X` subtitle. Web (`ArchiveDialog.tsx:144-152`) renders a labeled colored pill (`LANE_LABELS[c.status]` over `LANE_COLORS[c.status]`). | **P1** |
| Weekly Review section heading style + missing row bullet `·` | CA4-004 | — | **Verified**: `WeeklyReviewSheet.swift:84` heading uses `.font(.sans(13, weight: .semibold)).foregroundStyle(accent)`. Web (`WeeklyReview.tsx:123`) uses `text-1 tracking-tight2 uppercase text-ink-soft` (uniform soft-ink uppercase). Web rows (`:130`) prepend `<span>·</span>`; macOS rows (`:90-99`) have no leading bullet. | **P1** |
| Weekly Review `Generate again` button label doesn't flip to `Generating…` while loading | CA4-005 | — | **Verified**: `WeeklyReviewSheet.swift:109` is hard-coded `Button("Generate again")` with only `.disabled(loading)` applied. Web (`WeeklyReview.tsx:101`) flips label to `Generating…` while `loading` is true. | **P1** |

## Fix Verification Summary (Round 3)

Both A and B independently re-read every FIX-V3 spec against the live source:

| Fix | A verdict | B verdict | Combined |
|-----|-----------|-----------|----------|
| FIX-V3-001 (flat validation envelope) | ✅ | ✅ | **landed clean** |
| FIX-V3-002 (.task → onAppear+Task.detached in 3 R2-touched sheets) | ✅ | ✅ | **landed clean** |
| FIX-V3-003 (drop Title/Tags SectionLabels) | ✅ | ✅ | **landed clean** |
| FIX-V3-004 (Weekly Review tag join `#` + space) | ✅ | ✅ | **landed clean** |
| FIX-V3-005 (drop Summary mono label) | ✅ | ✅ | **landed clean** |
| FIX-V3-006 (drop bogus F-194 prefix on status MARK) | ✅ | ✅ | **landed clean** |
| FIX-V3-007 (drop Voice button `.help()` tooltip) | ✅ | ✅ | **landed clean** |

**fix_verification_failures = 0.**

---

## P0 — Fix Immediately (both auditors found)

### ✅ FIX-V4-001: Sweep `.task { await refresh() }` from Preferences tabs (3 sites)
Applied at: TokensTab.swift:57, TelegramTab.swift:45, TemplatesTab.swift:43 — commit 2c02078
Found by: CA4-006 (A — explicit RULE 3 ban violation) + LATENT-B4-001 (B — latent I-7 cancellation surface)
Files + lines:
1. `macOS/KanbanClaude/UI/Preferences/TokensTab.swift:57`
2. `macOS/KanbanClaude/UI/Preferences/TelegramTab.swift:45`
3. `macOS/KanbanClaude/UI/Preferences/TemplatesTab.swift:43`

Specific change (apply identically to each site, preserving the surrounding modifier chain — same shape as FIX-V3-002):
```swift
// Before:
.task { await refresh() }

// After:
.onAppear {
    Task.detached(priority: .userInitiated) {
        await refresh()
    }
}
```

Why this is P0 even though neither audit observed a cascade:
- RULE 3 hard-bans `.task { await heavyWork() }` for data fetches (locked in by I-7).
- The three R2-touched sheets were swept in FIX-V3-002 for the same pattern. Leaving the Preferences triple behind is procedurally inconsistent and keeps a known cancellation surface live.
- Both auditors independently surfaced it — by the round 3 synthesis rubric that is P0 by definition.

Pre-commit (per RULE 16): re-grep each touched file for the full active banned-pattern set:
```bash
grep -n "async let _ =" macOS/KanbanClaude/UI/Preferences/TokensTab.swift   macOS/KanbanClaude/UI/Preferences/TelegramTab.swift   macOS/KanbanClaude/UI/Preferences/TemplatesTab.swift
grep -nE "try (decoder|JSONDecoder\(\))\.decode\(\[" macOS/KanbanClaude/UI/Preferences/TokensTab.swift   macOS/KanbanClaude/UI/Preferences/TelegramTab.swift   macOS/KanbanClaude/UI/Preferences/TemplatesTab.swift
grep -nE "\.task \{ await (refreshAll|loadAll|fetchAll|refresh\()" macOS/KanbanClaude/UI/Preferences/TokensTab.swift   macOS/KanbanClaude/UI/Preferences/TelegramTab.swift   macOS/KanbanClaude/UI/Preferences/TemplatesTab.swift
```
Remediate any live match in the same commit. Commit message should reference RULE 16 + I-14 + I-7 explicitly.

Effort: **S** (≈15 min including build + log validation)

---

## P1 — Fix Next (code confirms missing)

### ✅ FIX-V4-002: Drop `DisclosureGroup` wrapper on Knowledge section in EditCardView
Applied at: EditCardView.swift:293 — commit a031f65
Found by: CA4-001 (A — code-only; B blocked from visual diff by I-1 / RULE 17)
File: `macOS/KanbanClaude/UI/Card/EditCardView.swift`
Line: 293-337 (`knowledgeSection()`)

Specific change: replace the outer `DisclosureGroup { … } label: { SectionLabel("Knowledge") }` with a plain `VStack(alignment: .leading, spacing: 6)` whose first child is `SectionLabel("Knowledge")`. The inner body (linked rows / `+ Attach` / `Save as knowledge` / picker) is preserved verbatim. After the change:
```swift
private func knowledgeSection() -> some View {
    VStack(alignment: .leading, spacing: 6) {
        SectionLabel("Knowledge")
        if linkedKnowledge.isEmpty {
            Text("No linked notes yet.")
                .font(.sans(11)).foregroundStyle(Tokens.ink3)
        } else {
            ForEach(linkedKnowledge) { item in
                linkedRow(item)
            }
        }
        HStack(spacing: 8) {
            // … existing +Attach / Save-as-knowledge buttons unchanged …
        }
        if knowledgePicking {
            knowledgePicker
        }
    }
}
```
Web reference: `web/src/components/EditDialog.tsx:294-361` — section is always-open inline; no disclosure chevron.

Effort: **S** (≈10 min)

### ✅ FIX-V4-003: Change Archive header title from `Archive` to `Archived cards`
Applied at: ArchiveSheet.swift:12 — commit a031f65
Found by: CA4-002 (A — code-only)
File: `macOS/KanbanClaude/UI/Archive/ArchiveSheet.swift`
Line: 12

Specific change:
```swift
// Before:
ModalHeaderStrip(title: "Archive") {

// After:
ModalHeaderStrip(title: "Archived cards") {
```
Count pill suffix (already lives in the trailing closure at lines 13-19) is unchanged.

Web reference: `web/src/components/ArchiveDialog.tsx:98-99` — `Archived cards` + count pill.

Effort: **S** (≈2 min)

### ✅ FIX-V4-004: Swap archived-row 8pt dot for a labeled colored pill
Applied at: ArchiveSheet.swift:91 — commit a031f65
Found by: CA4-003 (A — code-only)
File: `macOS/KanbanClaude/UI/Archive/ArchiveSheet.swift`
Line: 91 (inside `archivedRow(_:)`)

Specific change: replace the leading `Circle().fill(statusColor(card.status)).frame(width: 8, height: 8).padding(.top, 6)` with a small labeled capsule that matches web's `LANE_LABELS` / `LANE_COLORS` mapping:
```swift
// Before:
Circle().fill(statusColor(card.status)).frame(width: 8, height: 8).padding(.top, 6)

// After:
Text(card.status.label.uppercased())
    .font(.mono(10, weight: .semibold))
    .foregroundStyle(.white)
    .padding(.horizontal, 7).padding(.vertical, 2)
    .background(statusColor(card.status))
    .clipShape(Capsule())
    .padding(.top, 2)
```
`statusColor(_:)` already returns `Tokens.pinBacklog / pinToday / pinDoing / pinDone`, which mirror the web's `LANE_COLORS` palette.

Optional secondary cleanup (cuts redundancy now that the pill carries the lane name): drop the trailing `• was \(card.status.label)` segment from `:94` since the pill now communicates the lane. If you keep the subtitle for compactness/parity with the existing UX, leave `:94` alone — that is a style call, not a correctness call.

Web reference: `web/src/components/ArchiveDialog.tsx:144-152`.

Effort: **S** (≈10 min)

### ✅ FIX-V4-005: Weekly Review section heading style + row bullet `·`
Applied at: WeeklyReviewSheet.swift:84 + 89-99 — commit a031f65
Found by: CA4-004 (A — code-only)
File: `macOS/KanbanClaude/UI/Review/WeeklyReviewSheet.swift`
Line: 84 (heading) + 89-99 (row HStack)

Specific change (two edits in the same `section(...)` builder):

1. Switch the heading from colored semibold sans to uppercase tracked ink-soft mono so all three sections read uniformly (matches web's `text-1 tracking-tight2 uppercase text-ink-soft`):
```swift
// Before (line 84):
Text(title).font(.sans(13, weight: .semibold)).foregroundStyle(accent)

// After:
Text(title.uppercased())
    .font(.mono(10, weight: .semibold))
    .tracking(1.2)
    .foregroundStyle(Tokens.ink3)
```

2. Prepend a leading `·` bullet to each row so the row layout matches web (`WeeklyReview.tsx:129-134`):
```swift
// Before (line 90):
HStack(alignment: .firstTextBaseline, spacing: 8) {
    Text(r.title).font(.sans(12)).foregroundStyle(Tokens.ink)

// After:
HStack(alignment: .firstTextBaseline, spacing: 8) {
    Text("·").font(.sans(12)).foregroundStyle(Tokens.ink3)
    Text(r.title).font(.sans(12)).foregroundStyle(Tokens.ink)
```

The `accent` parameter is now unused by the heading. Either drop the parameter from `section(...)` and its three call sites, or keep it for future use; the heading change above is the only behavior delta.

Web reference: `web/src/components/WeeklyReview.tsx:121-138`.

Effort: **S** (≈10 min)

### ✅ FIX-V4-006: Flip Weekly Review `Generate again` button label to `Generating…` while loading
Applied at: WeeklyReviewSheet.swift:109 — commit a031f65
Found by: CA4-005 (A — code-only)
File: `macOS/KanbanClaude/UI/Review/WeeklyReviewSheet.swift`
Line: 109

Specific change:
```swift
// Before:
Button("Generate again") {
    Task { await refresh() }
}
.disabled(loading)

// After:
Button(loading ? "Generating…" : "Generate again") {
    Task { await refresh() }
}
.disabled(loading)
```
Web reference: `web/src/components/WeeklyReview.tsx:99-102` — `{loading ? 'Generating…' : 'Generate again'}`.

Effort: **S** (≈3 min)

---

## P2 — Verify Then Fix (visual only, now confirmed real via code spot-check)

None. B observed zero visual gaps this round (locked-screen capture ceiling still applies — Rule 17). All actionable items came from A's code audit, with CA4-006 cross-confirmed by B as a latent risk.

---

## Closed as Intentional (🔄 with justification)

Carried forward from prior rounds — no new closures this round.

| Item | Registry mark | Justification |
|------|---------------|---------------|
| Card Chain modal | 🔄 V1 | Documented in FEATURE_PARITY_REGISTRY.md V1 deferral list |
| Related Cards panel | 🔄 V1 | Documented in FEATURE_PARITY_REGISTRY.md V1 deferral list |
| Weather widget | 🔄 V1 | Documented in FEATURE_PARITY_REGISTRY.md V1 deferral list |
| Activity ticker | 🔄 V1 | Documented in FEATURE_PARITY_REGISTRY.md V1 deferral list |

None of the round-3 gaps qualify for intentional-closure — every CA4-NNN is a live divergence from the web reference, not a documented adaptation.

---

## Recommended fix order

Bundle into two commits to keep the diff reviewable and stay aligned with the FIX-V3 cadence:

1. **Commit 1 — FIX-V4-001** (Preferences `.task` sweep). Standalone because RULE 3 / RULE 16 / I-7 / I-14 are the load-bearing rationale, and the commit message must reference all four. Pre-commit re-grep per RULE 16. Build + log validation after — open Preferences, hit each tab, confirm tokens / telegram identities / templates load.

2. **Commit 2 — FIX-V4-002 + FIX-V4-003..006** (Knowledge unwrap + Archive/WeeklyReview polish). One commit. Pre-commit re-grep per RULE 16 on each touched file. Build + log validation after.

Total elapsed time target: **≤1 hour** including build + log validation between commits.

After both commits land, re-run Agent A + Agent B for Round 4. The only outstanding non-fix item will be the Rule 14 visual diff that I-1 (locked screen) has now blocked across rounds 2/3/4 — that needs an unlocked-display session (or `caffeinate -dimsu` started before lock), not another fix commit.

---

✅ FINAL_FIXES_V4.md written
📊 P0: 1 | P1: 5 | P2: 0 | Closed: 0
STAGE_COMPLETE: verdict=NEEDS_FIXES remaining=6
