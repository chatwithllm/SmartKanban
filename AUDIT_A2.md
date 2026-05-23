# Code Audit — Agent A — Round 2
Date: 2026-05-21
Method: Systematic web (React/Vite SPA under `web/src/`) → macOS (SwiftUI under `macOS/KanbanClaude/`) comparison. Round 1 audit (AUDIT_A.md) + 36 fixes (FINAL_FIXES.md) cross-checked against current `macos-build` branch tip `144dbed`.
Screens audited: 22 MVP groups + 36 fix-verification rows
Total gaps found (new this round): 14
Fixes verified (Round > 1): 34 ✅  0 ❌  2 ⚠  0 🔴

## Method notes
- Web reference = `web/src/` (`App.tsx`, `components/*.tsx`, `hooks/*.ts`, `api.ts`); `web/index.html` is a 32-line bootstrap shell only.
- macOS reference = 83 .swift files (7,202 LOC) under `macOS/KanbanClaude/`; endpoint catalog at `Networking/Endpoint.swift`, client at `Networking/APIClient.swift`.
- All 36 fixes from FINAL_FIXES.md were verified by reading the touched files and the specific line numbers cited. Verification is a code-read confirmation, not a runtime check.
- I-1 (locked screen) still blocks Rule 14 visual diff this run. Round 2 audit is code-only, same as Round 1.

---

## Fix Verification (Round 2)

| Fix ID | Status | Evidence | Notes |
|--------|--------|----------|-------|
| FIX-001 | ✅ Verified | `UI/Card/EditCardView.swift:299-493` | Full knowledge-linking UI: `knowledgeSection`, `linkedRow`, `knowledgePicker`, `loadLinkedKnowledge`, `linkKnowledge`, `unlinkKnowledge`, `saveCardAsKnowledge`. `+ Attach` toggles picker, `Save as knowledge` gated on URL-in-description that isn't already linked. |
| FIX-002 | ✅ Verified | `UI/Card/CardTimelineView.swift:131-188` | `suggestionPills` renders real `Button`s. `apply(_:key:)` switches on `s.action` (updateStatus / setDueDate / assignUser / createCard) and calls `CardStore.shared.patch` / `.create`. Applied state via `@Binding appliedKeys: Set<String>` and `"✓ \(label)"` disabled label. RULE 9 verb-check passes. |
| FIX-003 | ✅ Verified | `UI/Capture/CaptureView.swift:75-108, 148-162` | `modeBar` with Photo / Template / Voice buttons. `pickPhoto()` uses `NSOpenPanel` with image content types → `CardStore.createFromImage(fileURL:status:)`. |
| FIX-004 | ✅ Verified | `UI/Capture/CaptureView.swift:86-94, 110-146, 164-200` | Template button opens `templatePickerSheet` listing `Template` rows; slash-prefix parsed in `submit()` (lines 193-200) and looked up against preloaded templates. |
| FIX-005 | ✅ Verified | `UI/Knowledge/KnowledgeDetailSheet.swift` (new, 278 LOC) + `UI/Knowledge/KnowledgeListView.swift:66-70` | Read-only modal with title block, meta line (visibility + fetched/no-fetch + host link), `fetch_error` red block, monospaced body with `.textSelection(.enabled)`, linked-cards section with per-card remove + `+ Attach card` picker, owner-only Refetch / Edit / Archive in footer. List row tap target switched to detail; Edit button inside detail opens edit sheet. |
| FIX-006 | ✅ Verified | `App/GlobalKeyMonitor.swift:29-31, 69-88` | `handlePasteImage()` reads NSImage from pasteboard, converts to PNG, routes to `attachImageData` if a card-edit window is key, else `createFromImageData` with status `.today`. Skipped when first-responder is text. |
| FIX-007 | ✅ Verified | `UI/Knowledge/KnowledgeEditSheet.swift:13, 34-42, 130-142, 175-176` | `titleAuto` state defaults `true`; URL `onChange` autofills title from `URL(string:)?.host` when `titleAuto`. Title `onChange` sets `titleAuto = false`. Passed to backend as `KnowledgeInput.titleAuto`. |
| FIX-008 | ✅ Verified | `UI/Knowledge/KnowledgeEditSheet.swift:14, 43-45, 182` | `@State var autoFetch = true`, `Toggle("Auto-fetch when I save", isOn: $autoFetch)`, threaded through `KnowledgeInput.autoFetch`. |
| FIX-009 | ⚠ Partial | `UI/Knowledge/KnowledgeEditSheet.swift:15, 89-103, 150-162` | `fieldErrors` plumbing exists and renders red border + inline message. Client-side validation populates errors. **Missing:** server validation response (`error.fields`) is not parsed; only generic `localizedDescription` reaches the user. Web parses field-keyed errors from the API. |
| FIX-010 | ✅ Verified | `UI/Knowledge/KnowledgeListView.swift:73-99, 101-112` | `tagCloud` ScrollView (.horizontal) of `topTags()` (top 20 by count). Each chip toggles `store.tag`. Active chip uses `Tokens.greenAccent.opacity(0.18)` background + green-accent border per spec. |
| FIX-011 | ✅ Verified | `UI/Knowledge/KnowledgeRowView.swift:35-40` | `Label("\(linkedCount)", systemImage: "paperclip")` rendered when `linkedCardIds.count > 0`. |
| FIX-012 | ✅ Verified | `UI/Review/WeeklyReviewSheet.swift:21, 28-45, 57-79, 84-86, 101-113` | `statGrid` with 3-column `HStack` of `statCard` (large numeral + uppercased label + accent bar). Per-section empty placeholders rendered. Footer band has `Generate again` + `Got it`. (See CA2-002 for copy drift.) |
| FIX-013 | ✅ Verified | `UI/Card/AiInsightsPanelView.swift:71-76, 123-147` | `relatedItemRow` renders `[kind]` badge + title; knowledge-with-URL → `LinkActions(url:urlString:)`; card → `Button("Open") → openEditCard`. `item.why` rendered as 11pt ink3 row. |
| FIX-014 | ✅ Verified | `UI/Card/AiInsightsPanelView.swift:149-160` | `webFindingRow` shows title + `LinkActions` + `f.why` as 11pt ink3 row when non-empty. |
| FIX-015 | ✅ Verified | `UI/Main/BoardToolbar.swift:249-275` | `⚙ Settings` row inserted between name/email block and sign-out, opens via `NSApp.sendAction(Selector(("showPreferencesWindow:")))`. Sign-out icon swapped to `arrow.turn.down.left`. (See CA2-007 for selector concern.) |
| FIX-016 | ✅ Verified | `App/GlobalKeyMonitor.swift:40-43`, `UI/Main/BoardToolbar.swift:159-161` | Plain `"/"` fires `focusSearch` notification when first-responder isn't text. `SearchField` listens via `.onReceive(...focusSearch)` and sets `@FocusState`. |
| FIX-017 | ✅ Verified | `App/GlobalKeyMonitor.swift:33-36` | `.command` + `"k"` posts `focusSearch`. `⌘K` hint pill rendered in `SearchField`. |
| FIX-018 | ✅ Verified | `App/GlobalKeyMonitor.swift:44-47` | Plain `"n"` (no modifier, not in text) → `WindowCoordinator.openCapture(initialStatus: .backlog)`. ⌘N still bound to today lane via toolbar `.keyboardShortcut("n", modifiers: .command)`. |
| FIX-019 | ✅ Verified | `App/GlobalKeyMonitor.swift:48-53`, `UI/Main/BoardView.swift:14, 26, 32-38` | Digits 1-4 map to `[.backlog, .today, .in_progress, .done]` and post `scrollToColumn` notification. `BoardView` wraps the 4-column `HStack` in `ScrollViewReader`, each column has `.id(status)`, and `.onReceive(...scrollToColumn)` does `proxy.scrollTo(status, anchor: .center)` with `withAnimation`. |
| FIX-020 | ✅ Verified | `UI/Card/EditCardView.swift:267-296` | `Share now` `Button` patches `card.shares` immediately via `cards.patch(cardId, p)`, sets `showSharedConfirm` true for 2s; `✓ Shared` label rendered. Independent of bottom Save. |
| FIX-021 | ✅ Verified | `UI/Archive/ArchiveSheet.swift:36-44, 54-80, 98-110` | Empty state shows `🗑️` glyph + "No archived cards". Footer band `Tokens.danger.opacity(0.08)` background with `Delete all (\(count))` red label + per-row + bulk `.confirmationDialog`. Footer also has explicit `Close` button. |
| FIX-022 | ✅ Verified (color note) | `UI/Main/CardTileView.swift:154-163` | `ZStack(alignment: .leading)` over `card.shares.prefix(3)`, each `InitialsAvatar` with `.offset(x: idx * 10)` and `.help("Shared with \(name)")`. **Note:** uses hashed user color, not violet (spec said violet bg). Recorded as CA2-014 P2. |
| FIX-023 | ✅ Verified | `Stores/UnreadStore.swift:36-45` | `apply(_:)` short-circuits when `WindowCoordinator.shared.editWindow(id: cardId)?.isKeyWindow == true`. Also short-circuits when `ev.actorId == AuthStore.shared.currentUser?.id`. |
| FIX-024 | ✅ Verified | `UI/Knowledge/KnowledgeRowView.swift:10` | `Text(item.url != nil ? "🔗 \(item.title)" : item.title)`. Visibility icon moved to trailing icon span at line 15-17. |
| FIX-025 | ✅ Verified | `UI/Main/BoardToolbar.swift:139-145` | `TextField.onExitCommand` clears query first, then blurs `@FocusState`. |
| FIX-026 | ✅ Verified | `UI/Main/CardTileView.swift:141-145` | Footer `if !hasAny { Text(Self.relFmt.localizedString(...)) }` fallback when no due / non-image attachments / unread. |
| FIX-027 | ✅ Verified | `UI/Components/DueDateChip.swift:44-47` | `case -1: tone = .danger; label = "Yesterday"` branches above the generic overdue branch. |
| FIX-028 | ✅ Verified | `UI/Main/BoardColumnView.swift:128-135` | Four web-matching strings: `"Nothing here yet."`, `"Nothing planned for today."`, `"Quiet here."`, `"Nothing finished yet."`. |
| FIX-029 | ✅ Verified | `UI/Card/AiInsightsPanelView.swift:179-207` | `LinkActions` has `@State copied`, 1.2s pulse, renders `"✓ Copied"` ink-green vs `Copy 📋`. |
| FIX-030 | ✅ Verified | `UI/Card/AiInsightsPanelView.swift:112-119`, `Stores/InsightStore.swift` (via `store.lastError`) | Empty-state CTA shows `lastError` as a red `danger.opacity(0.12)` capsule. |
| FIX-031 | ✅ Verified | `UI/Preferences/TemplatesTab.swift:9, 16-20, 50-54, 61-64` | `@State var lastError: String?` set on instantiate / refresh failure, rendered as 11pt danger text. Toast still fires. |
| FIX-032 | ✅ Verified | `UI/Preferences/TokensTab.swift:11, 132-148` | Per-row `.confirmationDialog("Revoke token \"\(label)\"?", ...)` with destructive `Revoke` and `Devices and integrations using it will stop working.` message. |
| FIX-033 | ✅ Verified | `UI/Preferences/TokensTab.swift:32, 60-87` | `mirrorSuccessPanel` shows `absoluteURL(forRelative:)` of `${origin}/my-day?token=...`, copy + dismiss buttons, green band (`greenAccent.opacity(0.18)`). |
| FIX-034 | ✅ Verified | `UI/Preferences/TokensTab.swift:120-131` | Each row: label + `…\(suffix(of:token))` (last 4 chars) + `relTime(createdAt)`. Both mirror and api branches use the same `tokenRow`. |
| FIX-035 | ✅ Verified | `UI/Main/NotificationsPopover.swift:27-33` | Empty state shows `Text("🔔").font(.system(size: 22))` + "No new notifications". |
| FIX-036 | ✅ Verified | `UI/Auth/LoginView.swift:149, 165-184` | `@FocusState isFocused` on the inner `LabeledInput`; overlay border switches to `Tokens.violet`/1.5 when focused; `.shadow` adds violet glow (0.25 opacity, 6 radius); 0.15s easeInOut animation. |

Verified counts: **34 ✅  · 2 ⚠  · 0 ❌  · 0 🔴**

The two ⚠ rows are FIX-009 (server `error.fields` parsing not landed — client-side validation only) and FIX-022 (avatar color is hashed-per-user not violet — pattern is correct, color tone is not). Neither breaks the workflow; both are P2-level polish gaps.

---

## Gap Registry (new gaps surfaced this round)

| ID | Screen | Web behavior | Web code location | Swift/Tauri equivalent | Found? | Confidence |
|----|--------|-------------|-------------------|------------------------|--------|-----------|
| CA2-001 | AI Insights Panel | Related-item row: when `r.kind === 'knowledge'` AND `r.url == null` → render `Open` button calling `onOpenKnowledge?.(r.id)` | `web/src/components/AiInsightsPanel.tsx:138-150` | `UI/Card/AiInsightsPanelView.swift:131-140` | ❌ Missing — Swift only branches knowledge-with-URL (→ LinkActions) and card (→ Open); knowledge-without-URL gets no Open affordance, the row is read-only | High |
| CA2-002 | Weekly Review | Section titles include count: `Shipped (${data.done.length})` / `Stale (${data.stale.length})` / `Stuck in progress (${data.stuck.length})`. Empty placeholders: `"Nothing closed this week."` / `"No stale cards."` / `"Nothing stuck."`. Each row shows the card's `#tags` suffix | `web/src/components/WeeklyReview.tsx:85-87, 132-134` | `UI/Review/WeeklyReviewSheet.swift:28-45` | ⚠ Partial — Swift uses `"✅ Done this week"` / `"🪨 Stale (no update >7d)"` / `"⚠️ Stuck in flight (>3d)"` and empty copy `"Nothing aging right now."` / `"Nothing flagged stuck."`; rows show `rel(updatedAt)` instead of tags. Stat grid replaces the in-title count, so behavior parity is preserved; copy parity is not | Med |
| CA2-003 | EditDialog → CardTimeline | Timeline starts **collapsed** (`useState(false)`); user toggles `Chat & Activity` to load events | `web/src/components/CardTimeline.tsx:119, 134` | `UI/Card/CardTimelineView.swift:6, 34` | ⚠ Partial — Swift starts `expanded = true` and loads `onAppear` regardless. Faster perceived load, but UX divergence — every edit window pays the timeline-load network cost | Low |
| CA2-004 | Search bar | When `value` is non-empty, render an explicit `✕` clear button inside the input on the right | `web/src/components/SearchBar.tsx:47-56` | `UI/Main/BoardToolbar.swift:132-153` | ❌ Missing — `SearchField` shows `⌘K` hint when empty but no `✕` chip when populated; user has to Esc twice (once to clear, once to blur) or select-all + delete | Low |
| CA2-005 | Profile dropdown chip | Avatar circle is solid `rgb(var(--violet))` background, white initial | `web/src/components/BoardHeader.tsx:207-217` | `UI/Main/BoardToolbar.swift:231` | ⚠ Partial — Swift uses `InitialsAvatar(userId:name:)` which hashes the user id to a palette color; should be violet per web spec for the profile chip specifically | Low |
| CA2-006 | Settings open path | (n/a — web has only one Settings dialog) | n/a | `UI/Main/MainView.swift:37`, `UI/Main/BoardToolbar.swift:251` | ⚠ Potential bug — both call sites use `Selector(("showPreferencesWindow:"))`. SwiftUI's `Settings { }` scene on macOS 13+ wires `showSettingsWindow:` (Ventura rename). Pre-Ventura selector may no-op silently. Either bind via `SettingsLink` or fall back to both selectors. Needs runtime verification (locked-screen this run blocks it) | Med |
| CA2-007 | Notification popover row | Mouse enter changes row background to `rgb(var(--hairline) / 0.04)`; mouse leave restores | `web/src/components/NotificationBell.tsx:135-136` | `UI/Main/NotificationsPopover.swift:60-79` | ❌ Missing — `NotificationRow` has no `.onHover` modifier; only the read/unread bg differs. Pure polish | Low |
| CA2-008 | Archive footer band | Destructive footer only rendered when `cards.length > 0` (`{cards.length > 0 && (...)}`) | `web/src/components/ArchiveDialog.tsx:195-212` | `UI/Archive/ArchiveSheet.swift:54-80` | ⚠ Partial — Swift always renders `footerBand` (Delete-all button is `.disabled(archived.isEmpty)`). Still a red band on empty screen. Minor visual noise | Low |
| CA2-009 | Capture Bar — Template mode | Template `ModeButton` rendered only `templates.length > 0`; hidden entirely otherwise | `web/src/components/CaptureBar.tsx:137-139` | `UI/Capture/CaptureView.swift:86-94` | ⚠ Partial — Swift always shows the Template button; tapping it opens the picker with `"No templates yet."` empty state. Defensible UX, but diverges from web | Low |
| CA2-010 | EditDialog — section order | Web order: title row, description, tags, **AI Insights**, **Related cards**, **Knowledge**, due, attachments, assignees+shares grid, Activity | `web/src/components/EditDialog.tsx:212-499` | `UI/Card/EditCardView.swift:71-94` | ⚠ Partial — Swift order: title, **status (extra)**, description, tags, due, attachments, assignees, shares, knowledge, AI insights, chat. Knowledge / AI Insights are pushed below the fold; status is an addition (web has no inline status picker — status moves via DnD) | Med |
| CA2-011 | EditDialog body | Description `<textarea>` has no inline section label on web — it floats directly under the title row | `web/src/components/EditDialog.tsx:246-259` | `UI/Card/EditCardView.swift:173-184` | ⚠ Partial — Swift wraps description in a `SectionLabel("Description")`; minor visual noise vs web | Low |
| CA2-012 | Knowledge view header | Web shows a green-house "feature band" — `bg-green-house` rounded section with `Knowledge` title + subtitle + `+ New note` CTA inside the band | `web/src/KnowledgeView.tsx:36-47` | `UI/Knowledge/KnowledgeListView.swift:114-124` | ⚠ Partial — macOS uses a flat header strip with the same title + subtitle + button. Adapted, not absent | Low |
| CA2-013 | Archive header count | Web puts the count badge **inside** the violet header strip (right of title); macOS surfaces the count as a separate `"\(N) archived card(s)"` strip below the header | `web/src/components/ArchiveDialog.tsx:98-107` | `UI/Archive/ArchiveSheet.swift:22-28` | ⚠ Partial — equivalent information, different layout | Low |
| CA2-014 | Card tile — share avatars | Web: stacked avatars with `background: 'rgb(var(--violet))'` (line 262) — uniformly violet | `web/src/components/CardView.tsx:257-268` | `UI/Main/CardTileView.swift:154-163` | ⚠ Partial — stacking pattern is correct (FIX-022 verified), but avatar color is hashed per user instead of violet. Visually distinguishable from the assignee stack (which legitimately wants hashed colors) — but web spec for the **share** stack is solid violet | Med |
| CA2-015 | Code health | `WindowCoordinator.openWeeklyReview()` still calls `ToastStore.shared.info("Weekly Review lands in Phase 8")` even though `WeeklyReviewSheet` is implemented and `MainView` opens it directly via `showReview` state | n/a | `App/WindowCoordinator.swift:47-49` | ⚠ Dead code — orphan API the toolbar bypasses. Should be removed or rewired through `MainView` | Low |

---

## P0 — Critical Gaps (core functionality missing)

None. Every Round-1 P0 (CA-001, CA-002, CA-003, CA-004, CA-005, CA-006) is closed in this round. No new P0 emerged.

## P1 — Behavioral Gaps (feature exists but behaves differently)

- **CA2-001** AI Insights related-knowledge **without URL** has no Open affordance on macOS. The web "Open this knowledge" path is dead; users can't navigate to those items.
- **FIX-009 (still partial)** Server-side validation field map is not surfaced — only the toast `localizedDescription` reaches the user. KnowledgeEditSheet's `fieldErrors` plumbing is wired but only populated by the client-side check.
- **CA2-006** `showPreferencesWindow:` selector targeting macOS 13+ Settings scene. If macOS 13/14 strips the pre-Ventura selector, both the toolbar `⚙` and the profile-row "Settings" become no-ops. Needs runtime verification.

## P2 — Minor Gaps (polish, copy, edge state)

- **CA2-002** Weekly Review section titles + stale/stuck empty copy + per-row metadata diverge from web copy. Information parity preserved via stat grid.
- **CA2-003** CardTimeline starts expanded on macOS, collapsed on web.
- **CA2-004** Search bar lacks visual `✕` clear button.
- **CA2-005** Profile dropdown avatar uses hashed color, web uses solid violet.
- **CA2-007** Notification row hover state missing.
- **CA2-008** Archive destructive footer band rendered when empty.
- **CA2-009** Capture template button always visible even when no templates exist.
- **CA2-010** EditDialog section order diverges from web (Knowledge / AI Insights below the fold).
- **CA2-011** Description section in EditDialog has a redundant section label.
- **CA2-012** Knowledge view header is flat rather than the web's green-house feature band.
- **CA2-013** Archive count surfaced as separate strip rather than inside the header badge.
- **CA2-014** Card-tile share avatars use hashed colors, web uses uniform violet.
- **CA2-015** `WindowCoordinator.openWeeklyReview()` is dead code with a stale "Phase 8" placeholder toast.

---

## Verified OK (spot-checked items still passing this round)

- All Round-1 verified-OK items remain present and unchanged (F-007/008/015/501 auth bootstrap, F-041..F-049 scope picker, F-102..F-105 column headers, F-113..F-119 drag/drop, F-125 hover lift, F-132..F-150 card tile, F-168..F-197 edit dialog core, F-218..F-237 AI insights, F-273..F-301 timeline + chat, F-302..F-318 knowledge list, F-360..F-378 archive core, F-412..F-460 preferences tabs, F-482..F-487 toasts, F-625 esc dialogs, F-635 finder drop, F-641..F-651 URL scheme, F-677..F-697 WS, F-705..F-712 theme, F-713..F-723 attachments).
- API surface: every web endpoint (37 unique paths grepped from `web/src/`) has a matching `Endpoint` case in `Networking/Endpoint.swift` **except** the deliberately-replaced web-push endpoints (`/api/push/subscribe`, `/api/push/vapid-public-key` — closed as 🚫 in Round 1) and `/api/cards/:id/qr.svg` (replaced by client-side `QRGenerator.swift` per V-003 comment). `createCardFromImage` and `uploadAttachment` paths live in `Stores/CardStore.swift` rather than `Endpoint.swift` but use the correct URLs.
- Interactive coverage: ⌘V paste-image, ⌘K + `/` search focus, plain `n` capture, `1`-`4` column scroll, Esc dialog close, drag-to-reorder, Finder-drop image, edit-window deep link, ⌘B brainstorm, ⌘N new card — all present in code and wired to the matching web behavior.

---

## Notes for Agent C (prioritization input)

1. **CA2-001 + CA2-006** are the only Round-2 items that could break a user workflow. CA2-001 is a small file edit (one `else if` branch); CA2-006 needs a runtime check on macOS 13/14 and a one-line selector swap to `Selector(("showSettingsWindow:"))` (or move both call sites to `SettingsLink`/`openWindow`).
2. **CA2-002** is a copy-spec mismatch between FINAL_FIXES.md and the actual web source. Agent C should decide whether the spec wins (current macOS impl) or the web copy wins (re-edit to match `WeeklyReview.tsx`).
3. **CA2-014** (share-avatar color) is the only Round-1 fix verdict that downgraded. The avatar **stack** is the load-bearing behavior and is correct; the color tone is the loose end. Trivial fix if Agent C wants strict parity: pass `color: Tokens.violet` into the `InitialsAvatar` used inside the shares ZStack.
4. **CA2-015** is a code-cleanup item, not a user-facing gap. Worth a one-line delete in the same commit that handles CA2-007 or any other WindowCoordinator-touching fix.
5. FIX-009's missing server-field parsing is wedged to KnowledgeEditSheet. If Agent C wants full parity, the change is to add an `APIError.fields: [String: String]?` field to the error type, populate it in `APIClient.send` from the `error.fields` JSON object, and have `KnowledgeEditSheet.save` merge it into `fieldErrors` on catch.

✅ AUDIT_A2.md written — 15 gaps found across 22 screens. Round 1.
STAGE_COMPLETE: verified=34 not_landed=0 regressions=0
