# Code Audit — Agent A — Round 3
Date: 2026-05-21
Method: Systematic web (React/Vite SPA under `web/src/`) → macOS (SwiftUI under `macOS/KanbanClaude/`) comparison. Round 2 audit (AUDIT_A2.md) + 17 V2 fixes (FINAL_FIXES_V2.md) cross-checked against current `macos-build` branch tip `41df5fc`.
Screens audited: 22 MVP groups + 17 V2-fix verification rows
Total gaps found (new this round): 7
Fixes verified (Round > 1): 16 ✅  0 ❌  1 ⚠  0 🔴

## Method notes
- Web reference = `web/src/` (`App.tsx`, `components/*.tsx`, `hooks/*.ts`, `api.ts`, `KnowledgeView.tsx`); `web/index.html` is the 32-line bootstrap shell only.
- macOS reference = 85 .swift files under `macOS/KanbanClaude/`; endpoint catalog at `Networking/Endpoint.swift`, client at `Networking/APIClient.swift`.
- Each round-2 fix verified by reading the touched files at the specific line numbers cited in `FINAL_FIXES_V2.md`. Verification is code-read confirmation, not a runtime check.
- I-1 (locked screen) again blocks Rule 14 visual diff this run. Round 3 audit is code-only.
- Server route shapes verified against `server/src/routes/knowledge.ts` for the FIX-V2-004 validation envelope concern below.

---

## Fix Verification (Round 3)

| Fix ID | Status | Evidence | Notes |
|--------|--------|----------|-------|
| FIX-V2-001 | ✅ Verified | `UI/Components/InitialsAvatar.swift:8,20-27,38`, `UI/Main/CardTileView.swift:154-163` | `colorOverride: Color?` added; share-stack `ForEach` passes `colorOverride: Tokens.violet`. Assignee stack at 147-153 still hashed per spec. |
| FIX-V2-002 | ✅ Verified | `UI/Card/AiInsightsPanelView.swift:131-147`, `App/WindowCoordinator.swift:48-74`, `UI/Knowledge/KnowledgeDetailWindowController.swift` (new) | `else if item.kind == "knowledge"` branch renders an `Open` button that calls `WindowCoordinator.openKnowledgeDetail(id:)`. Coordinator resolves item from `KnowledgeStore.shared` (refresh fallback) and presents `KnowledgeDetailSheet` in a standalone NSWindow controller. |
| FIX-V2-003 | ✅ Verified | `App/SettingsOpener.swift:1-8`, `UI/Main/BoardToolbar.swift:262`, `UI/Main/MainView.swift:37` | `SettingsOpener.open()` tries `showSettingsWindow:` first then falls back to `showPreferencesWindow:`. Both call sites switched to the helper. |
| FIX-V2-004 | ⚠ Partial | `App/Errors.swift:6`, `Networking/APIClient.swift:101-134`, `Stores/KnowledgeStore.swift:35-69`, `UI/Knowledge/KnowledgeEditSheet.swift:188-189` | Plumbing all the way from `KanbanError.validation([String:String], String)` through `createThrowing` / `patchThrowing` to `fieldErrors` catch is correctly wired. **However**, the `ValidationEnvelope` at `APIClient.swift:127` expects `{ error: { fields: {...}, message: "..." } }` (nested object) but the server actually emits `{ error: "<msg>", field: "<single-key>" }` (flat, single field) per `server/src/routes/knowledge.ts:26`. The `try? JSONDecoder().decode(ValidationEnvelope.self, …)` therefore throws `typeMismatch` (error is `String`, decoder expects `Detail` object), returns `nil`, and the validation branch never fires. End-to-end the inline red-bordered field error path never lights up. Surfaced as **CA3-001** below. |
| FIX-V2-005 | ✅ Verified | `UI/Knowledge/KnowledgeListView.swift:118` | Subtitle `"URLs, snippets, notes — all linked back to cards"` — verbatim match to `web/src/KnowledgeView.tsx:41`. |
| FIX-V2-006 | ✅ Verified | `UI/Review/WeeklyReviewSheet.swift:28-45, 89-97` | Section titles include counts (`Shipped (N)` / `Stale (N)` / `Stuck in progress (N)`). Empty copy matches web (`Nothing closed this week.`, `No stale cards.`, `Nothing stuck.`). Per-row meta renders `#tag` list. Stat grid retained above sections. Minor separator drift logged as CA3-004. |
| FIX-V2-007 | ✅ Verified | `UI/Main/BoardToolbar.swift:152-163` | `else if !query.isEmpty { Button(systemImage: "xmark.circle.fill") { query=""; focused=true } }`. ⌘K hint and ✕ button mutually exclusive. |
| FIX-V2-008 | ✅ Verified | `UI/Main/BoardToolbar.swift:242` | `ProfileChip` calls `InitialsAvatar(userId:name:size:22, border:false, colorOverride: Tokens.violet)`. |
| FIX-V2-009 | ✅ Verified | `UI/Main/NotificationsPopover.swift:58, 74, 81` | `@State var hovered`, `.onHover { hovered = $0 }`, `.background(Tokens.hairline.opacity(hovered ? 0.04 : 0))` layered below the read/unread bg. |
| FIX-V2-010 | ✅ Verified | `UI/Archive/ArchiveSheet.swift:48-50` | `if !archived.isEmpty { footerBand }` conditionally renders the destructive band. |
| FIX-V2-011 | ✅ Verified | `UI/Capture/CaptureView.swift:86-96` | Template `ModeButton` wrapped in `if !templates.isEmpty`. Slash-prefix parser at 195-202 is a no-op when templates list is empty (the lookup fails → toast "No template named …"); confirmed no regression. |
| FIX-V2-012 | ✅ Verified | `UI/Card/EditCardView.swift:71-94` | Order: title → status → description → tags → AI Insights → Knowledge → due → attachments → assignees → shares → chat. AI Insights and Knowledge are above the fold per web. Status is the documented macOS-only addition (web has no inline picker). Comment `// MARK: - F-194 status` references a wrong registry F-ID (F-194 in registry is the shared-with grid). Minor — logged as CA3-006. |
| FIX-V2-013 | ✅ Verified | `UI/Card/EditCardView.swift:173-181` | `descriptionSection` is now a bare `TextEditor` with no `SectionLabel`. Note: title (148-158) and tags row (570) still wrap in `SectionLabel`. Web has zero labels for those — logged as CA3-003. |
| FIX-V2-014 | ✅ Verified | `UI/Card/CardTimelineView.swift:6, 8, 17, 35-40` | `@State var expanded = false`, `@State var didLoad = false`. `DisclosureGroup(isExpanded:$expanded)` + `.onChange(of: expanded)` loads events only on first expand. Matches web's collapsed-by-default behavior at `web/src/components/CardTimeline.tsx:119`. |
| FIX-V2-015 | ✅ Verified | `UI/Knowledge/KnowledgeListView.swift:114-129` | Header wrapped in `Tokens.greenAccent.opacity(0.12)` block with `RoundedRectangle(cornerRadius: 12)` + greenAccent.opacity(0.25) hairline border. F-302 flipped to ✅ in the registry. |
| FIX-V2-016 | ✅ Verified | `UI/Archive/ArchiveSheet.swift:13-19` | Count badge moved inside the `ModalHeaderStrip` trailing slot as a `.white.opacity(0.18)` violet pill. Separate "N archived cards" strip removed. |
| FIX-V2-017 | ✅ Verified | `App/WindowCoordinator.swift` (full file) | `openWeeklyReview()` not present. `MainView.swift:39` opens the sheet directly via `showReview = true`. No stale `ToastStore` placeholder remains. |

Verified counts: **16 ✅ · 1 ⚠ · 0 ❌ · 0 🔴**

The single ⚠ row (FIX-V2-004) is end-to-end inert — the client wiring is correct but the response envelope contract does not match the server. See CA3-001 below for the specific shape fix.

---

## Gap Registry (new this round)

| ID | Screen | Web behavior | Web code location | Swift/Tauri equivalent | Found? | Confidence |
|----|--------|-------------|-------------------|------------------------|--------|-----------|
| CA3-001 | KnowledgeEditSheet → APIClient | 4xx response body is `{ "error": "<message>", "field": "<single-key>" }` (flat). Web's `req()` simply reads `body.error` as a string into the `ApiError.message`; it does not parse field-keyed maps either, but it never tries to. | `server/src/routes/knowledge.ts:26`, `web/src/api.ts:13-29` | `Networking/APIClient.swift:101-134` | ❌ Decode shape mismatch — `ValidationEnvelope.error: Detail?` expects an object, but the server emits a string for `error`. `try?` decode throws `typeMismatch` → returns nil → validation branch never fires → KnowledgeEditSheet `catch let KanbanError.validation` is dead code in production. Fix: either widen `ValidationEnvelope` to also accept `{ error: String, field: String }` (single-key dict) or change the server to emit the nested shape the client expects. Cheapest path: in `assertSuccess` add a second decode attempt against a `FlatValidationEnvelope { let error: String?; let field: String? }` and synthesize `[field: error]` when both present. | High |
| CA3-002 | Multiple sheets — RULE 3 / RULE 16 | n/a — RULE 16 says "re-grep the FULL file for every active banned pattern" before committing | n/a | `UI/Archive/ArchiveSheet.swift:54`, `UI/Main/NotificationsPopover.swift:51`, `UI/Review/WeeklyReviewSheet.swift:54` | ❌ Pre-existing `.task { await refresh() }` on a network fetch survives in three sheets touched by R2 commits `9fb8c04` (Archive + Notifications) and `112767f` (WeeklyReview). Each commit message claims "RULE 16 grep clean" but the `.task { await heavyWork() }` pattern (RULE 3 banned for data fetches; cancelled on view re-render) was not remediated. Severity is moderate — these are modal sheets so re-renders are bounded — but per Rule 16 the same-commit remediation is required. Fix: swap to `.onAppear { Task.detached(priority: .userInitiated) { await refresh() } }`. | High |
| CA3-003 | EditDialog — Title / Tags row labels | Web title is a bare `<input placeholder="Title">`; tags is a bare `<input placeholder="tags, comma, separated">`; neither has a section label. FIX-V2-013 dropped only the description label. | `web/src/components/EditDialog.tsx:212-221, 261-274` | `UI/Card/EditCardView.swift:148-158` (title), `UI/Card/EditCardView.swift:564-590` (`TagsEditorRow` `SectionLabel("Tags")` at line 570) | ⚠ Partial — description label drop landed cleanly (CA2-011 closed) but the analogous gap for Title and Tags remains. Consistency fix: drop `SectionLabel("Title")` from `titleSection` and `SectionLabel("Tags")` from `TagsEditorRow.body`. | Med |
| CA3-004 | Weekly Review row tags | Web joins tags with a leading `#` then space-joins: `#${r.tags.join(' #')}` → `"#alpha #beta #gamma"` | `web/src/components/WeeklyReview.tsx:132-134` | `UI/Review/WeeklyReviewSheet.swift:93-96` | ⚠ Partial — macOS uses `r.tags.map { "#\($0)" }.joined(separator: ", ")` → `"#alpha, #beta, #gamma"`. Behavior parity holds (tags shown), copy parity does not. Trivial fix: `joined(separator: " ")` and prefix once. | Low |
| CA3-005 | Weekly Review — summary block label | Web renders the AI summary as a bare paragraph with no inline section label | `web/src/components/WeeklyReview.tsx:65-69` | `UI/Review/WeeklyReviewSheet.swift:22-27` | ⚠ Partial — macOS prefixes a `Text("Summary").font(.mono(10, weight: .semibold)).tracking(1.2)` mono label above the summary paragraph. Minor visual divergence; harmless. | Low |
| CA3-006 | EditDialog — MARK comments vs registry F-IDs | n/a — internal documentation only | n/a | `UI/Card/EditCardView.swift:74` | ⚠ The `// MARK: - F-194 status` comment cites registry F-194, which is actually "Shared-with grid: toggleable pills, separate Share now button". Status is the macOS-only addition; it has no registered F-ID. Either drop the F-prefix or assign a new F-ID for the desktop adaptation. | Low |
| CA3-007 | Capture Bar — Voice mode tooltip | Web shows "Voice capture coming soon" toast when the disabled Voice button is tapped; no tooltip help text on the button itself | `web/src/components/CaptureBar.tsx` (Voice mode handler) | `UI/Capture/CaptureView.swift:97-107` | ⚠ Partial — macOS adds `.help("Voice capture lands in V1")` tooltip plus the matching toast on tap. Tooltip copy is reasonable but not from the web. Low priority. | Low |

---

## P0 — Critical Gaps (core functionality missing)

None. Every Round-2 P0 (FIX-V2-001 share/profile-avatar violet) is closed. No new P0 emerged.

## P1 — Behavioral Gaps (feature exists but behaves differently)

- **CA3-001** FIX-V2-004 validation envelope shape mismatch. The macOS `ValidationEnvelope` expects `{ error: { fields, message } }` (nested) but the server emits `{ error: "<msg>", field: "<single-key>" }` (flat). End-to-end the inline field error never lights — the catch block at `KnowledgeEditSheet.save():188` is dead under the current server contract. Cheapest fix: add a second decode attempt that handles the flat shape and synthesizes a `[field: error]` dict.

## P2 — Minor Gaps (polish, copy, edge state)

- **CA3-002** RULE 3 / RULE 16: three round-2 commits touched files containing pre-existing `.task { await refresh() }` calls on network fetches (`ArchiveSheet.swift:54`, `NotificationsPopover.swift:51`, `WeeklyReviewSheet.swift:54`). RULE 16 mandates same-commit remediation. The commit messages claim grep-clean but the pattern was missed.
- **CA3-003** Title and Tags section labels in `EditCardView` remain after FIX-V2-013 dropped the analogous description label. Consistency gap.
- **CA3-004** Weekly Review row tag separator: macOS uses `, ` (comma-space), web uses ` ` (space) with `#` prefixed once. Copy drift.
- **CA3-005** Weekly Review macOS adds a `Summary` mono label above the AI summary paragraph; web renders the summary bare.
- **CA3-006** `// MARK: - F-194 status` comment cites a wrong registry F-ID inside `EditCardView.swift:74`. Doc nit.
- **CA3-007** Capture Bar Voice button tooltip is macOS-specific copy ("Voice capture lands in V1"); web has no tooltip, only a toast on tap.

---

## Verified OK (spot-checked items still passing this round)

- All Round-1 FIXes (F-001…F-036 in FINAL_FIXES.md) and all 36 round-1 V2 verification rows from AUDIT_A2.md remain present and unchanged.
- API surface: every web endpoint grepped from `web/src/api.ts` has a matching `Endpoint` case in `Networking/Endpoint.swift` except the deliberately-replaced web-push endpoints (closed 🚫 in Round 1) and `/api/cards/:id/qr.svg` (replaced by `QRGenerator.swift` per V-003).
- EditDialog section order: title → status → description → tags → **AI Insights** → **Knowledge** → due → attachments → assignees → shares → chat (CA2-010 closed).
- CardTimeline starts collapsed and lazy-loads on first expand (CA2-003 closed).
- SearchField shows ✕ when populated, ⌘K hint when empty (CA2-004 closed).
- ProfileChip avatar is solid violet (CA2-005 closed).
- NotificationRow hover state present (CA2-007 closed).
- Archive footer band hidden when empty (CA2-008 closed).
- Capture Template button hidden when no templates (CA2-009 closed).
- Description section label dropped (CA2-011 closed).
- Knowledge view green-house feature band header (CA2-012 closed; F-302 → ✅ in registry).
- Archive count moved to inline header badge (CA2-013 closed).
- Card-tile share avatars use solid violet (CA2-014 closed via FIX-V2-001).
- `WindowCoordinator.openWeeklyReview()` deleted; no orphan `MainView` callsite (CA2-015 closed).
- AI Insights knowledge-without-URL has Open button → `WindowCoordinator.openKnowledgeDetail(id:)` → `KnowledgeDetailWindowController` (CA2-001 closed).
- Settings opens from both toolbar gear and profile-row Settings via `SettingsOpener.open()` (CA2-006 closed).
- All seven R3 ❌/⚠ rows are isolated to the seven sheets/files named in the registry above — no broader regression.

---

## Notes for Agent C (prioritization input)

1. **CA3-001** is the only Round-3 row that breaks a user-visible workflow. Fix is small and confined to `APIClient.swift:101-134`: add a `FlatValidationEnvelope { let error: String?; let field: String? }` decode after the existing nested attempt and synthesize a `[field: error]` dict when both fields are present. The KnowledgeEditSheet catch block already handles the resulting `KanbanError.validation`. ~15 min of work plus a runtime smoke that submits a 400-triggering payload (e.g. empty title).
2. **CA3-002** (Rule 16 cleanup) is non-cosmetic — the `.task` cancellation pattern is the same family as I-6/I-7. Worth bundling into a single sweep commit that swaps all three sites to `.onAppear { Task.detached(priority:.userInitiated) { await … } }`. ~20 min and one re-build to verify the data still loads. The commit message should explicitly reference RULE 16 + I-14 since this is the same class of post-touch oversight.
3. **CA3-003/CA3-004/CA3-005/CA3-006/CA3-007** are all single-line copy/style edits in the files already touched by R2. Could ship as one "round-3 polish bundle" commit alongside CA3-002, similar to commit `9fb8c04`.
4. The locked-screen carry-over (I-1) still blocks Rule 14 visual diff. Round 3 audit remains code-only; a Round 4 with a wake-locked display is the cleanest way to finally close the 🔄 visual diff column across the registry.
5. No fresh I-N learning candidates from this round — all gaps are either contract mismatches (CA3-001), known-class oversights (CA3-002 / RULE 16), or low-stakes copy drift.

---

✅ AUDIT_A3.md written — 7 gaps found across 5 screens. Round 2.
STAGE_COMPLETE: verified=16 not_landed=0 regressions=0
