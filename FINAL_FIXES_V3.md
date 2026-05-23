# Final Fix List — Agent C Synthesis — Round 2
Date: 2026-05-21
Sources: AUDIT_A3.md (7 gaps + 1 ⚠ fix-verification) + AUDIT_B3.md (0 visual gaps)
Cross-reference: 0 P0 / 2 P1 / 5 P2 verified / 4 closed intentional
Total actionable fixes: 7
Estimated total effort: 2.0 hours

## Cross-Reference Matrix

| Gap | In A? | In B? | Spot-check verdict | Priority |
|-----|-------|-------|--------------------|----------|
| CA3-001 — Validation envelope contract mismatch (FIX-V2-004 inert) | CA3-001 (⚠ on FIX-V2-004) | — | **Verified**: `APIClient.swift:107` decodes `error: Detail?` (nested) but server emits flat `{error:"<msg>",field:"<key>"}` at `server/src/routes/knowledge.ts:26,185`. `try?` silently fails → `KanbanError.validation` never thrown → inline field-error UX dead. B's ✅ on FIX-V2-004 verified plumbing, not contract. | **P1** |
| CA3-002 — `.task { await refresh() }` in 3 R2-touched sheets (RULE 3 + RULE 16) | CA3-002 | B noted at line 149 ("no regressions detected — view identity stable") | **Verified**: `.task` confirmed at `ArchiveSheet.swift:54`, `NotificationsPopover.swift:51`, `WeeklyReviewSheet.swift:54`. A's procedural call (RULE 3 hard ban for data fetches + RULE 16 same-commit remediation) overrides B's empirical "no observed cascade" — the rule is locked in from I-7. | **P1** |
| CA3-003 — Title + Tags SectionLabels remain after FIX-V2-013 dropped Description label | CA3-003 | — | **Verified**: `SectionLabel("Title")` at `EditCardView.swift:150`; `SectionLabel("Tags")` at `EditCardView.swift:570`. Web (`EditDialog.tsx:215,264`) uses bare placeholders, no labels. | **P2** |
| CA3-004 — Weekly Review tag separator drift (", " vs " ") | CA3-004 | — | **Verified**: `WeeklyReviewSheet.swift:93` uses `joined(separator: ", ")` after per-tag `#` prefix. Web `WeeklyReview.tsx:132-134` uses `#${r.tags.join(' #')}` → single `#` prefix, space-joined. | **P2** |
| CA3-005 — Summary mono label above AI summary (web shows bare paragraph) | CA3-005 | — | **Verified**: `WeeklyReviewSheet.swift:24` emits `Text("Summary").font(.mono(10, weight: .semibold)).tracking(1.2)` above the body. Web renders summary bare per A reference. | **P2** |
| CA3-006 — `// MARK: - F-194 status` cites wrong registry F-ID | CA3-006 | — | **Verified**: `EditCardView.swift:74` MARK says F-194 (which is shares — see line 90 MARK on the same file). Status is macOS-only adaptation per FIX-V2-012 notes; needs new F-ID or generic comment. | **P2** |
| CA3-007 — Voice button macOS-specific tooltip copy | CA3-007 | — | **Verified**: `CaptureView.swift:107` `.help("Voice capture lands in V1")`. Web has only the toast on tap (no tooltip). | **P2** |

## Fix Verification Failures

- **FIX-V2-004 — Knowledge inline validation**: Round 2 plumbing landed (`KanbanError.validation` enum case, `createThrowing` / `patchThrowing` callsites, `KnowledgeEditSheet.save():188` catch). End-to-end contract is wrong: client `ValidationEnvelope.error: Detail?` ≠ server `error: String`. The fix appears verified by both auditors because the structural changes shipped — only A's cross-read of `server/src/routes/knowledge.ts` exposed the contract mismatch. **One root, fix once (FIX-V3-001).**

---

## P0 — Fix Immediately (both auditors found)

None.

---

## P1 — Fix Next (code confirms missing)

### ✅ FIX-V3-001: Knowledge validation envelope — accept the flat server shape (APIClient.swift:113-118, 137-140)
Found by: CA3-001 (A) — B's FIX-V2-004 ✅ missed the contract layer
File: `macOS/KanbanClaude/Networking/APIClient.swift`
Line: `assertSuccess(http:data:)` at lines 101–134, immediately after the existing nested-envelope decode at lines 106–111
Specific change:
1. Add a sibling struct alongside `ValidationEnvelope`:
   ```swift
   struct FlatValidationEnvelope: Decodable {
       let error: String?
       let field: String?
   }
   ```
2. After the existing nested decode block (current lines 106–111), add a second attempt:
   ```swift
   if (400..<500).contains(http.statusCode),
      let flat = try? JSONDecoder().decode(FlatValidationEnvelope.self, from: data),
      let field = flat.field, let msg = flat.error {
       throw KanbanError.validation([field: msg], msg)
   }
   ```
3. Verify: trigger a knowledge POST/PATCH with an invalid field (e.g. empty title, malformed URL) — the inline red-bordered field error in `KnowledgeEditSheet` must now light up. Confirm `server/src/routes/knowledge.ts:26` and `:185` are the only two emit sites of this shape (already grepped — they are).
Effort: S (≈30 min including smoke test)

### ✅ FIX-V3-002: Swap `.task { await refresh() }` to onAppear + Task.detached (ArchiveSheet.swift:54, NotificationsPopover.swift:51, WeeklyReviewSheet.swift:54)
Found by: CA3-002 (A) — RULE 3 (banned for data fetches) + RULE 16 (same-commit remediation owed by R2 commits 9fb8c04 + 112767f)
Files + lines:
1. `macOS/KanbanClaude/UI/Archive/ArchiveSheet.swift:54`
2. `macOS/KanbanClaude/UI/Main/NotificationsPopover.swift:51`
3. `macOS/KanbanClaude/UI/Review/WeeklyReviewSheet.swift:54`
Specific change (apply to each site, preserving the surrounding view modifier chain):
   ```swift
   // Before:
   .task { await refresh() }              // ArchiveSheet / WeeklyReviewSheet
   .task { await store.refresh() }        // NotificationsPopover

   // After:
   .onAppear {
       Task.detached(priority: .userInitiated) {
           await refresh()                // (or `await store.refresh()` for NotificationsPopover)
       }
   }
   ```
Commit message must reference RULE 16 + I-14 explicitly (the rule was locked in for exactly this oversight pattern).
Pre-commit: re-grep each touched file for the full RULE 3/16 set per the RULE 16 checklist (`async let _ =`, bare-array decode, `.task { await refresh|refreshAll|loadAll|fetchAll }`).
Effort: S (≈20 min including build + log validation)

---

## P2 — Verify Then Fix (visual only, now confirmed real via code spot-check)

All P2 rows in this round are code-only findings from A. B's locked-screen audit did not surface them because they are sub-pixel copy/structure drifts not visible at the captured composition level. All are confirmed by source-file read in this synthesis.

### ✅ FIX-V3-003: Drop SectionLabel("Title") and SectionLabel("Tags") in EditCardView (EditCardView.swift:149, ~567)
Found by: CA3-003 (A only — code-verified)
File: `macOS/KanbanClaude/UI/Card/EditCardView.swift`
Line: 150 (title), 570 (tags inside `TagsEditorRow`)
Specific change: delete the `SectionLabel("Title")` line at 150 and the `SectionLabel("Tags")` line at 570. Add a placeholder to the title `TextField` if not present so the empty state matches web's `placeholder="Title"`.
Web reference: `web/src/components/EditDialog.tsx:215, 264` — bare inputs, no labels.
Effort: S (≈10 min)

### ✅ FIX-V3-004: Weekly Review row tag formatting — single `#` prefix, space-joined (WeeklyReviewSheet.swift:88)
Found by: CA3-004 (A only)
File: `macOS/KanbanClaude/UI/Review/WeeklyReviewSheet.swift`
Line: 93
Specific change:
   ```swift
   // Before:
   Text(r.tags.map { "#\($0)" }.joined(separator: ", "))
   // After:
   Text("#" + r.tags.joined(separator: " #"))
   ```
Web reference: `web/src/components/WeeklyReview.tsx:132-134` — `#${r.tags.join(' #')}`.
Effort: S (≈5 min)

### ✅ FIX-V3-005: Drop "Summary" mono label above Weekly Review AI summary (WeeklyReviewSheet.swift:22)
Found by: CA3-005 (A only)
File: `macOS/KanbanClaude/UI/Review/WeeklyReviewSheet.swift`
Line: 23-26
Specific change: delete the `Text("Summary")...` line (24) and the wrapping `VStack(alignment: .leading, spacing: 4)`; render the summary as a bare `Text(summary)` paragraph.
   ```swift
   // Before:
   VStack(alignment: .leading, spacing: 4) {
       Text("Summary").font(.mono(10, weight: .semibold)).tracking(1.2).foregroundStyle(Tokens.ink3)
       Text(summary).font(.sans(13)).foregroundStyle(Tokens.ink)
   }
   // After:
   Text(summary).font(.sans(13)).foregroundStyle(Tokens.ink)
   ```
Web reference: `web/src/components/WeeklyReview.tsx:65-69` — bare paragraph.
Effort: S (≈5 min)

### ✅ FIX-V3-006: Correct the `// MARK: - F-194 status` comment in EditCardView (EditCardView.swift:73)
Found by: CA3-006 (A only — doc nit)
File: `macOS/KanbanClaude/UI/Card/EditCardView.swift`
Line: 74
Specific change: drop the F-prefix (status is a macOS-only adaptation with no registry row):
   ```swift
   // Before:
   // MARK: - F-194 status (macOS-only adaptation; web has no inline picker)
   // After:
   // MARK: - status (macOS-only adaptation; web has no inline picker)
   ```
Alternative: assign a new F-ID in FEATURE_PARITY_REGISTRY.md for the desktop adaptation and update the MARK to match. The drop-the-prefix path is cheaper.
Effort: S (≈3 min)

### ✅ FIX-V3-007: Drop Voice button `.help()` tooltip in CaptureView (CaptureView.swift:107)
Found by: CA3-007 (A only)
File: `macOS/KanbanClaude/UI/Capture/CaptureView.swift`
Line: 107
Specific change: delete the `.help("Voice capture lands in V1")` modifier. The toast on tap at line 98 already communicates the V1 deferral; web shows neither tooltip nor hover affordance, only the toast.
Effort: S (≈2 min)

---

## Closed as Intentional (🔄 with justification)

Carried forward from B3 verdict — no new closures this round.

| Item | Registry mark | Justification |
|------|---------------|---------------|
| Card Chain modal | 🔄 V1 | Documented in FEATURE_PARITY_REGISTRY.md V1 deferral list |
| Related Cards panel | 🔄 V1 | Documented in FEATURE_PARITY_REGISTRY.md V1 deferral list |
| Weather widget | 🔄 V1 | Documented in FEATURE_PARITY_REGISTRY.md V1 deferral list |
| Activity ticker | 🔄 V1 | Documented in FEATURE_PARITY_REGISTRY.md V1 deferral list |

None of the R3 gaps qualify for intentional-closure — every CA3-NNN is a live divergence from the web reference, not a documented adaptation.

---

## Recommended fix order

Bundle into two commits to keep the diff reviewable and align with the R2 commit cadence:

1. **Commit 1 — FIX-V3-001** (Knowledge validation contract). Standalone because it touches the networking layer and warrants its own smoke test. Verify by triggering a 400 from the knowledge endpoint and watching the inline field error light up in `KnowledgeEditSheet`.
2. **Commit 2 — FIX-V3-002 + FIX-V3-003..007** (RULE 16 sweep + polish bundle). One commit, message references RULE 16 + I-14 explicitly. Pre-commit re-grep per RULE 16. Re-build + log validation after.

Total elapsed time target: ≤2 hours including build + log validation between commits.

After both commits land, re-run Agent A + Agent B for Round 4. The only outstanding non-fix gap will be the Rule 14 visual diff that I-1 (locked screen) has blocked across all three rounds — that needs an unlocked-display session, not another fix.

---

✅ FINAL_FIXES_V3.md written
📊 P0: 0 | P1: 2 | P2: 5 | Closed: 4
STAGE_COMPLETE: verdict=NEEDS_FIXES remaining=2
