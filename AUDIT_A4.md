# Code Audit — Agent A — Round 3
Date: 2026-05-21
Method: Systematic web (React/Vite SPA under `web/src/`) → macOS (SwiftUI under `macOS/KanbanClaude/`) comparison. Round 3 audit (AUDIT_A3.md) + 7 V3 fixes (FINAL_FIXES_V3.md) cross-checked against current `macos-build` branch tip `e09f12c`.
Screens audited: 22 MVP groups + 7 V3-fix verification rows
Total gaps found (new this round): 6
Fixes verified (Round > 1): 7 ✅  0 ❌  0 ⚠  0 🔴

## Method notes
- Web reference = `web/src/` (`App.tsx`, `components/*.tsx`, `KnowledgeView.tsx`, `api.ts`); `web/index.html` is the 32-line bootstrap shell only.
- macOS reference = .swift files under `macOS/KanbanClaude/`; endpoint catalog at `Networking/Endpoint.swift`, client at `Networking/APIClient.swift`.
- Each round-3 fix verified by reading the touched files at the specific line numbers cited in `FINAL_FIXES_V3.md`. Verification is code-read confirmation, not a runtime check.
- I-1 (locked screen) again blocks Rule 14 visual diff this run. Round 4 audit is code-only.
- Server route shape (flat `{error, field}` envelope) reconfirmed at `server/src/routes/knowledge.ts:26,185` to validate FIX-V3-001 ordering correctness.

---

## Fix Verification (Round 3)

| Fix ID | Status | Evidence | Notes |
|--------|--------|----------|-------|
| FIX-V3-001 | ✅ Verified | `Networking/APIClient.swift:113-118, 143-146` | `FlatValidationEnvelope { error, field }` defined; second decode block sits immediately after the existing nested `ValidationEnvelope` attempt. Decode order is correct: nested first (throws on flat shape because `error: Detail?` rejects string typeMismatch → `try?` returns nil → falls through to flat), flat second (synthesises `[field: msg]` → throws `KanbanError.validation`). `KnowledgeEditSheet.save():188` catch block is now reachable end-to-end. |
| FIX-V3-002 | ✅ Verified | `UI/Archive/ArchiveSheet.swift:54-58`, `UI/Main/NotificationsPopover.swift:51-55`, `UI/Review/WeeklyReviewSheet.swift:51-55` | All three sites converted to `.onAppear { Task.detached(priority: .userInitiated) { await refresh() } }`. RULE 3 ban honored; RULE 16 same-commit remediation satisfied for the R2 commits that originally touched these files. |
| FIX-V3-003 | ✅ Verified | `UI/Card/EditCardView.swift:148-155` (title), `UI/Card/EditCardView.swift:561-588` (TagsEditorRow) | `SectionLabel("Title")` removed; title `TextField` now bare with placeholder `"Title"`. `SectionLabel("Tags")` removed from `TagsEditorRow.body`; pills + tag-add `TextField` remain. Only `Status / Due / Attachments / Assignees / Shared with / Knowledge` keep their labels (Status + Knowledge are macOS adaptations; Due/Attachments/Assignees/Shares match web's `<div>` captions or `<label>` siblings). |
| FIX-V3-004 | ✅ Verified | `UI/Review/WeeklyReviewSheet.swift:94` | `Text("#" + r.tags.joined(separator: " #"))` — single `#` prefix, space-joined. Exact match to `web/src/components/WeeklyReview.tsx:133`. |
| FIX-V3-005 | ✅ Verified | `UI/Review/WeeklyReviewSheet.swift:22-24` | `if let summary = data.summary, !summary.isEmpty { Text(summary).font(.sans(13)).foregroundStyle(Tokens.ink) }` — bare paragraph, no wrapping `Text("Summary")` mono label. Web parity at `WeeklyReview.tsx:65-69`. |
| FIX-V3-006 | ✅ Verified | `UI/Card/EditCardView.swift:74` | `// MARK: - status (macOS-only adaptation; web has no inline picker)` — F- prefix dropped. F-194 stays correctly attached to the shares MARK at line 90. |
| FIX-V3-007 | ✅ Verified | `UI/Capture/CaptureView.swift:97-107` | `.help("Voice capture lands in V1")` modifier removed. Voice button now bare; toast on tap (`ToastStore.shared.info("Voice capture lands in V1")` at line 98) is the only V1-deferral signal. |

Verified counts: **7 ✅ · 0 ⚠ · 0 ❌ · 0 🔴**

Every Round-3 fix landed cleanly. No partial implementations, no regressions, no fresh RULE-3/16 violations in the touched files.

---

## Gap Registry (new this round)

| ID | Screen | Web behavior | Web code location | Swift/Tauri equivalent | Found? | Confidence |
|----|--------|-------------|-------------------|------------------------|--------|-----------|
| CA4-001 | EditDialog — Knowledge section visibility | Web renders the Knowledge section inline (always expanded) — heading "Knowledge", list of linked items, +Attach button, picker beneath. No collapse affordance. | `web/src/components/EditDialog.tsx:294-361` | `macOS/KanbanClaude/UI/Card/EditCardView.swift:293-337` | ⚠ Partial — macOS wraps the Knowledge section in a `DisclosureGroup { … } label: { SectionLabel("Knowledge") }` which starts collapsed. User must click to expand before seeing linked items, +Attach, or Save-as-knowledge. Behavioral divergence from web's always-open list. Fix: replace the `DisclosureGroup` wrapper with a plain `VStack(alignment: .leading, spacing: 6) { SectionLabel("Knowledge") … }` so the list is always visible, matching the AI-Insights / Attachments / Assignees pattern in the same view. | Med |
| CA4-002 | ArchiveSheet — header title copy | Web header reads `Archived cards` (with count pill suffix). | `web/src/components/ArchiveDialog.tsx:99-107` | `macOS/KanbanClaude/UI/Archive/ArchiveSheet.swift:12` | ⚠ Partial — macOS title is `Archive` (single word). Count pill renders correctly to the right (FIX-V2-016 verified). Copy drift only; trivial fix is `ModalHeaderStrip(title: "Archived cards")`. | Low |
| CA4-003 | ArchiveSheet — per-row lane indicator | Web shows a colored pill badge with the lane label (`Backlog / Today / Doing / Done`) using lane-color background + white mono text. | `web/src/components/ArchiveDialog.tsx:144-152` | `macOS/KanbanClaude/UI/Archive/ArchiveSheet.swift:91` | ⚠ Partial — macOS uses an 8pt `Circle().fill(statusColor)` with no label text; the lane name appears in a separate `was X` subtitle line. Visual indicator weaker than web's pill badge. Fix: swap the circle for a small `Text(card.status.label).background(statusColor).clipShape(Capsule())` pill matching web's `LANE_COLORS` map (which mirrors `Tokens.pinBacklog/Today/Doing/Done`). | Low |
| CA4-004 | WeeklyReviewSheet — section heading style + bullet | Web section heading is `text-1 tracking-tight2 uppercase text-ink-soft` (uniform soft-ink uppercase mono-ish). Each row begins with a leading `·` bullet (`<span className="text-ink-soft">·</span>` before the title). | `web/src/components/WeeklyReview.tsx:121-138` | `macOS/KanbanClaude/UI/Review/WeeklyReviewSheet.swift:84, 89-99` | ⚠ Partial — macOS section heading uses `.font(.sans(13, weight: .semibold)).foregroundStyle(accent)` (colored to green/gold/red per section), not uniform ink-soft uppercase. Rows have no leading `·` bullet. Two-line copy/style drift. Fix: switch heading to `.font(.mono(10, weight: .semibold)).tracking(1.2).foregroundStyle(Tokens.ink3)` + uppercase; prepend `Text("·")` to each row HStack. | Low |
| CA4-005 | WeeklyReviewSheet — "Generate again" button copy | Web button label flips to `"Generating…"` while `loading` is true (still disabled). | `web/src/components/WeeklyReview.tsx:99-101` | `macOS/KanbanClaude/UI/Review/WeeklyReviewSheet.swift:108-112` | ⚠ Partial — macOS button label stays `"Generate again"` even while disabled (only `.disabled(loading)` modifier applies). Loading state is invisible to user. Fix: `Button(loading ? "Generating…" : "Generate again") { Task { await refresh() } }`. | Low |
| CA4-006 | Preferences tabs — RULE 3 banned pattern persists (codebase-wide) | n/a — RULE 3 says no `.task { await heavyWork() }` for data fetches | n/a | `macOS/KanbanClaude/UI/Preferences/TokensTab.swift:57`, `macOS/KanbanClaude/UI/Preferences/TelegramTab.swift:45`, `macOS/KanbanClaude/UI/Preferences/TemplatesTab.swift:43` | ❌ Three `.task { await refresh() }` sites remain in the Preferences tab files. These were **not touched by R2 or R3 commits**, so they do not violate RULE 16 strictly (RULE 16 only fires on commits that edit the file). However the pattern is still a live RULE 3 / I-7 cancellation-risk surface. Severity is bounded because Preferences tabs only refresh once per open and rarely re-render, but it's the same family as the three sheets remediated in FIX-V3-002. Fix: apply the same `.onAppear { Task.detached(priority: .userInitiated) { await refresh() } }` swap to all three sites. | High |

---

## P0 — Critical Gaps (core functionality missing)

None. Every Round-3 P0/P1 (FIX-V3-001 validation contract, FIX-V3-002 RULE 3 sweep) closed. No new P0 emerged.

## P1 — Behavioral Gaps (feature exists but behaves differently)

- **CA4-001** Knowledge section in EditCardView starts collapsed inside a `DisclosureGroup`; web shows it always-open inline. Linked notes and the +Attach button are hidden behind a disclosure chevron — measurable behavioral divergence from the web reference. Single-line fix: unwrap the section.

## P2 — Minor Gaps (polish, copy, edge state)

- **CA4-002** Archive header title `"Archive"` should be `"Archived cards"` to match web.
- **CA4-003** Archive row lane indicator is an 8pt circle dot; web uses a labeled colored pill (`Backlog / Today / Doing / Done`) — pill conveys lane identity without needing the `was X` subtitle line.
- **CA4-004** Weekly Review section headings + leading row bullet: macOS uses colored accent semibold, no `·` prefix; web uses uppercase ink-soft mono with `·` bullet on each row.
- **CA4-005** Weekly Review `Generate again` button label doesn't change to `Generating…` while loading; web does.
- **CA4-006** Three Preferences tabs (`TokensTab`, `TelegramTab`, `TemplatesTab`) still use `.task { await refresh() }` for data fetches — same RULE 3 / I-7 family as the FIX-V3-002 sweep. Files were not touched by R2/R3 commits so RULE 16 doesn't strictly fire, but the pattern is a live cancellation-risk surface and should be remediated in a sweep commit.

---

## Verified OK (spot-checked items still passing this round)

- All Round-1 and Round-2 FIXes (F-001…F-036 in FINAL_FIXES.md + 17 V2 verification rows from AUDIT_A3.md) remain present and unchanged on `e09f12c`.
- API surface: every endpoint exposed in `web/src/api.ts` has a matching `Endpoint` case in `Networking/Endpoint.swift` except (a) the deliberately-replaced web-push endpoints (closed 🚫 in Round 1), (b) `/api/cards/:id/qr.svg` (replaced by `QRGenerator.swift` per V-003), and (c) the two multipart upload endpoints (`POST /api/cards/from-image`, `POST /api/cards/:id/attachments`) which are issued from `Stores/CardStore.swift:148, 172, 188, 204` via a raw `endpointPath:` helper that bypasses the typed `Endpoint` enum — a deliberate accommodation for `multipart/form-data`.
- EditDialog section order: title → status → description → tags → AI Insights → Knowledge → due → attachments → assignees → shares → chat. AI Insights and Knowledge still above-the-fold (FIX-V2-012 / CA2-010 closed).
- Title and Tags `SectionLabel`s dropped (CA3-003 closed by FIX-V3-003).
- Description section label dropped previously (CA2-011 closed by FIX-V2-013).
- Validation envelope: nested + flat decode order works against the actual server shape at `server/src/routes/knowledge.ts:26,185`. KnowledgeEditSheet inline field-error path is now reachable.
- `.task { await refresh() }` removed from `ArchiveSheet`, `NotificationsPopover`, `WeeklyReviewSheet` (CA3-002 closed by FIX-V3-002).
- Weekly Review tag format = `"#a #b #c"` (single `#` prefix, space-joined) — CA3-004 closed by FIX-V3-004.
- Weekly Review `Summary` mono label removed; AI summary now bare paragraph (CA3-005 closed by FIX-V3-005).
- `// MARK: - F-194 status` corrected to `// MARK: - status` (CA3-006 closed by FIX-V3-006).
- Voice button `.help()` tooltip dropped (CA3-007 closed by FIX-V3-007).
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
- `async let _ =` grep-clean across `macOS/KanbanClaude/` (zero matches).
- Bare-array decode (`try decoder.decode([…)`) grep-clean across `macOS/KanbanClaude/` (zero matches).
- `.task { await refreshAll|loadAll|fetchAll }` grep-clean across `macOS/KanbanClaude/` (zero matches; only the three Preferences-tab `.task { await refresh() }` sites remain, logged as CA4-006).

---

## Notes for Agent C (prioritization input)

1. **CA4-001** is the only R3 row that changes user-visible behavior (Knowledge section hidden inside disclosure). One-line fix — drop the `DisclosureGroup` wrapper and inline the body — and it lifts the macOS Knowledge UX to web parity. ~10 min.
2. **CA4-006** (3 Preferences-tab `.task` sites) is procedurally the same family as CA3-002 / FIX-V3-002. RULE 16 doesn't strictly fire because the files weren't touched by R3, but the cancellation-risk surface is still live — pairing it into a single sweep commit (style identical to FIX-V3-002) closes the codebase-wide pattern. ~15 min.
3. **CA4-002 / CA4-003 / CA4-004 / CA4-005** are all single-line copy/style edits in files already touched by R2/R3. Could ship as one "round-4 polish bundle" commit alongside CA4-001 + CA4-006 — similar to commit `9fb8c04` cadence. ~25 min total.
4. The locked-screen carry-over (I-1) still blocks Rule 14 visual diff. Round 4 audit remains code-only; a Round 5 with a wake-locked display is the cleanest way to finally close the 🔄 visual diff column across the registry.
5. No fresh I-N learning candidates from this round — all gaps are either bounded behavioral drift (CA4-001), known-class RULE-3 residue (CA4-006), or low-stakes copy/style drift (CA4-002…CA4-005). The R2/R3 fix loop continues to be effective; each round's gap list is shrinking and narrower in severity.

---

✅ AUDIT_A4.md written — 6 gaps found across 5 screens. Round 3.
STAGE_COMPLETE: verified=7 not_landed=0 regressions=0
