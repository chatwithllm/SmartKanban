# Visual Audit — Agent B — Round 1 (post-FIX verification, R2 of audit cycle)

Date: 2026-05-21 04:50
Method: One live web screencap (board) + DOM extraction across 3 SPA-navigated screens + code-verification of 36 FIX targets per RULE 17 (screen locked)
Screens audited: 13 (1 visual pair, 3 DOM-verified web references, 9 macOS code-verified)
Screenshots taken: 1 unique web (board) + 1 stale duplicate (knowledge backing-store collision) — `/tmp/audit_b_r2/`
Total visual gaps found this round: 2 (1 new + 1 partial fix)
Fix verification: 35 ✅ resolved · 0 ❌ not visible · 1 ⚠ partial

## Pre-flight state (RULE 17 + RULE 18)

```
CGSSessionScreenIsLocked == True   →   synthetic-click navigation aborted
                                       CGWindowList enumerates 0 windows for KanbanClaude
                                       → macOS visual capture impossible this round
Web auth window (id 18684 / AS-id 969934621)  →  authenticated as Simba, RULE 18 honoured
                                                 (SPA nav via React `button.click()` only,
                                                  no `reload` and no `set URL of active tab to`)
```

Consequences:
- macOS app PID 96254 running. CGWindowList enumerates **0** windows (locked-screen ‘hides app windows from window-server’ behaviour). R1's `macos_current.png` (Sign-In card) remains the only authoritative macOS capture for this build. Every other macOS surface in this report is **code-verified** with the Swift source as ground truth.
- The web window is offscreen (X=3840, second display). `CGWindowListCreateImage(...)` produced a fresh first capture (board), then returned **byte-identical** backing-store for subsequent navigations (same R1 collision pattern). Verified by `md5(web_board.png) == md5(web_knowledge.png)` after a confirmed DOM-level navigation to the Knowledge view. Probe used DOM `document.body.innerText` + element queries to confirm route changes.
- RULE 18 enforced: probed `body.className` + active nav after each `button.click()`; session stayed live across nav.

## Screenshots produced

| File | What it shows | Status |
|------|---------------|--------|
| `/tmp/audit_b_r2/web_board.png` | Web board (4 columns + activity ticker + toolbar) | live |
| `/tmp/audit_b_r2/web_knowledge.png` | Identical hash to web_board.png — backing-store stale (RULE 17) | **do not use** |
| `/tmp/audit_b_r1/macos_current.png` | macOS Sign In card on canvas + violet bloom (R1 carry-over) | live |
| `/tmp/audit_b_r1/web_board_logged_in.png` | Web board cropped (R1 carry-over) | live |

DOM-extracted reference (no image): Knowledge list, Board with cards, Profile dropdown, Settings dialog, Notifications popover empty state, Scope picker popover.

---

## Fix Verification (Round 1 of audit)

### Verification method

For every FIX in `FINAL_FIXES.md` the audit Read the named Swift file/line range and confirmed each spec bullet landed. Web reference for behavioural targets cross-referenced against R2 DOM probes + R1 captures + `web/src/components/*.tsx` source.

| Fix ID | Visual status | Evidence (file:line) | Notes |
|--------|---------------|---------------------|-------|
| FIX-001 | ✅ resolved | `EditCardView.swift:299–365` | `knowledgeSection()` + `linkedRow()` + picker — full UI matches spec; `linked` state, `+ Attach`, `Save as knowledge`, remove buttons all present |
| FIX-002 | ✅ resolved | `CardTimelineView.swift:131–187` | `suggestionPills` are `Button`s; `apply()` switches on `.updateStatus/.setDueDate/.assignUser/.createCard`; `appliedKeys` → `✓ <label>`; disabled after apply |
| FIX-003 | ✅ resolved | `CaptureView.swift:77–85, 148–162` | Photo `Button` + `NSOpenPanel` → `CardStore.createFromImage(fileURL:status:)` on `.OK` |
| FIX-004 | ✅ resolved | `CaptureView.swift:86–94, 110–146, 193–201` | Template `Button` opens picker sheet; slash parser in `submit()` matches `/name` to `templates` then `instantiate(tpl)` |
| FIX-005 | ✅ resolved | `KnowledgeDetailSheet.swift` (new) + `KnowledgeListView.swift:66–70` | `KnowledgeDetailSheet` exists; row tap opens detail; detail launches `KnowledgeEditSheet` for Edit |
| FIX-006 | ✅ resolved | `GlobalKeyMonitor.swift:29–31, 69–88` | ⌘V handler routes to `attachImageData` if EditCard key-window, else `createFromImageData(status:.today)` |
| FIX-007 | ✅ resolved | `KnowledgeEditSheet.swift:13, 34, 36–42, 176` | `titleAuto` state + URL `onChange` fills host; `title.onChange` clears the flag; payload carries `title_auto` |
| FIX-008 | ✅ resolved | `KnowledgeEditSheet.swift:14, 43–45, 182` | `Toggle("Auto-fetch when I save", isOn: $autoFetch)` rendered below URL; gates `autoFetch` in payload (`!url.isEmpty && autoFetch`) |
| FIX-009 | ✅ resolved | `KnowledgeEditSheet.swift:15, 89–103, 150–162` | `fieldErrors` map + `fieldWithError(_:text:key:)` renders danger stroke + inline message; local validation populates map |
| FIX-010 | ✅ resolved | `KnowledgeListView.swift:40, 73–112` | `tagCloud` ViewBuilder + `topTags()` returns top-20 by freq; active tag uses `Tokens.greenAccent.opacity(0.18)` background + green border |
| FIX-011 | ✅ resolved | `KnowledgeRowView.swift:35–40` | `Label("\(linkedCount)", systemImage: "paperclip")` rendered when `linkedCardIds?.count > 0` |
| FIX-012 | ✅ resolved | `WeeklyReviewSheet.swift:21–46, 57–79, 101–113` | `statGrid` (Shipped/Stale/Stuck) above sections; per-section empty placeholders match web copy; footer has Generate again + Got it (PillButton) |
| FIX-013 | ✅ resolved | `AiInsightsPanelView.swift:123–147` | `relatedItemRow`: `[kind]` badge, title, `Open` `Button` (cards) / `LinkActions` (knowledge), `why` line below |
| FIX-014 | ✅ resolved | `AiInsightsPanelView.swift:149–160` | `webFindingRow` renders `f.why` below the link when non-empty |
| FIX-015 | ✅ resolved | `BoardToolbar.swift:243–278` | ProfileChip popover order: name+email → Divider → `Settings` row (`gearshape` icon) → Divider → `Sign out` row (`arrow.turn.down.left` icon) |
| FIX-016 | ✅ resolved | `GlobalKeyMonitor.swift:40–43` + `BoardToolbar.swift:159–161` | `/` (no modifiers, not editing text) posts `focusSearch`; SearchField receives notification |
| FIX-017 | ✅ resolved | `GlobalKeyMonitor.swift:33–36` | ⌘K posts `focusSearch`; ⌘K hint pill renders inline in SearchField when query empty |
| FIX-018 | ✅ resolved | `GlobalKeyMonitor.swift:44–47` | Plain `n` opens Capture with `initialStatus: .backlog`; existing ⌘N (BoardToolbar:57) keeps `.today` default |
| FIX-019 | ✅ resolved | `BoardView.swift:14, 26, 32–38` + `GlobalKeyMonitor.swift:48–53` | `ScrollViewReader` + `.id(status)` on each column; digits 1–4 post `scrollToColumn` with mapped `CardStatus`; receiver animates with `easeInOut(0.25)` |
| FIX-020 | ✅ resolved | `EditCardView.swift:278–296` | `Share now` `Button` patches `shares`; sets `showSharedConfirm`; renders `✓ Shared` for 2s |
| FIX-021 | ✅ resolved | `ArchiveSheet.swift:54–80, 36–44, 94–110` | Red-tinted `footerBand` with `Delete all (N)` + count; `.confirmationDialog` on purge AND per-row delete; separate `Close` button; empty state `🗑️` glyph + `No archived cards` |
| FIX-022 | ⚠ **partial** | `CardTileView.swift:154–163` + `InitialsAvatar.swift:9–25` | **Structure landed** — `ZStack` with `.prefix(3).enumerated()` overlap, `help("Shared with …")` tooltip. **Background colour ≠ web** — macOS uses hashed `InitialsAvatar(userId:)` palette (6 colors via `userId` hash); `web/src/components/CardView.tsx:262` explicitly sets `background: 'rgb(var(--violet))'` for the share avatar. Spec said `color: Tokens.violet`; default `InitialsAvatar(userId:)` was used instead. See NEW-GAP-B2-002 |
| FIX-023 | ✅ resolved | `UnreadStore.swift:40` | `if let win = WindowCoordinator.shared.editWindow(id: cardId), win.isKeyWindow { return }` short-circuits the bump |
| FIX-024 | ✅ resolved | `KnowledgeRowView.swift:10` | Title prefixed `"🔗 "` when `item.url != nil` |
| FIX-025 | ✅ resolved | `BoardToolbar.swift:139–145` | `.onExitCommand` clears query on first Esc, blurs focus on second |
| FIX-026 | ✅ resolved | `CardTileView.swift:127, 141–145` | `hasAny == false` → `Text(relFmt.localizedString(for: card.updatedAt, ...))` fallback in footer |
| FIX-027 | ✅ resolved | `DueDateChip.swift:44–47` | `case -1` returns `"Yesterday"` with `Tokens.danger` tone above generic `\(-days)d overdue` |
| FIX-028 | ✅ resolved | `BoardColumnView.swift:128–135` | All four emptyMessage strings now match web copy exactly: `"Nothing here yet."` / `"Nothing planned for today."` / `"Quiet here."` / `"Nothing finished yet."` |
| FIX-029 | ✅ resolved | `AiInsightsPanelView.swift:179–207` | `LinkActions` has `copied` state + 1.2 s sleep restore; renders `✓ Copied` (green) vs `Copy 📋` |
| FIX-030 | ✅ resolved | `AiInsightsPanelView.swift:112–119` | `emptyState` renders red danger-tint pill below Brainstorm CTA when `store.lastError` set |
| FIX-031 | ✅ resolved | `TemplatesTab.swift:9, 16–20, 50–54, 61–64` | `lastError` state + inline danger text; populated in instantiate + refresh catches |
| FIX-032 | ✅ resolved | `TokensTab.swift:11, 132–148` | `confirmingRevoke` per-token + `.confirmationDialog("Revoke token \"\(label)\"?")` with destructive Revoke button and explanatory message |
| FIX-033 | ✅ resolved | `TokensTab.swift:60–87` | `mirrorSuccessPanel` renders green-tinted band with absolute `/my-day?token=…` URL via `absoluteURL(forRelative:)`, Copy + Dismiss buttons |
| FIX-034 | ✅ resolved | `TokensTab.swift:120–151` | `tokenRow` renders `…<suffix>` (last 4 chars) + `relTime(createdAt)`; structure shared between Mirror and API token rows |
| FIX-035 | ✅ resolved | `NotificationsPopover.swift:29` | Empty-state glyph is `Text("🔔").font(.system(size: 22))` (no more SF `bell.slash`) |
| FIX-036 | ✅ resolved | `LoginView.swift:142–187` | `LabeledInput` adds `@FocusState isFocused`; stroke switches violet/hairline + 1.5/1.0 lineWidth; shadow `Tokens.violet.opacity(0.25)` radius 6 on focus; `.animation(.easeInOut(0.15))` |

---

## Visual Gap Registry (this round)

| ID | Screen | What web shows | What macOS shows | Gap type | Evidence |
|----|--------|---------------|-----------------|----------|----------|
| NEW-GAP-B2-001 | Knowledge list — header subtitle | `"URLs, snippets, notes — all linked back to cards"` (R2 DOM probe of authenticated kanban.npalakurla.com) | `"Notes, links, and references shared across the household."` | copy divergence | DOM probe (Knowledge view) vs `KnowledgeListView.swift:118` |
| NEW-GAP-B2-002 | Card tile — shared-with avatar background colour | Solid violet `rgb(var(--violet))` initial-avatar bubble (`web/src/components/CardView.tsx:262`) | Hashed-palette `InitialsAvatar(userId:)` — same 6-colour palette as assignees (`InitialsAvatar.swift:9–25`) | colour drift inside an otherwise-completed FIX-022 | `web/src/components/CardView.tsx:255–266` vs `CardTileView.swift:154–163` |

Both gaps are **P2 polish**. No P0/P1 visual gaps remaining from R1 that are still open.

### Carry-over from R1 — status this round

| R1 ID | R1 finding | This round |
|-------|-----------|-----------|
| GAP-B-001 | macOS doesn't auto-resume the session | Closed intentional (FINAL_FIXES.md). Code path verified earlier — `Stores/AuthStore.swift` + `restoreCookieFromKeychainIfNeeded`. Cannot retest visually (screen locked, can't sign in) |
| GAP-B-002 | Profile dropdown missing ⚙ Settings + sign-out glyph swap | ✅ resolved by FIX-015 |
| GAP-B-003 | Capture missing 📷 / ✱ / 🎙️ + slash parser | ✅ resolved by FIX-003 + FIX-004 (Voice button shows but routes to "Voice capture lands in V1" toast — registered V1) |
| GAP-B-004 | WeeklyReview missing stat grid + footer CTAs | ✅ resolved by FIX-012 |
| GAP-B-005 | Knowledge missing top-20 tag chip cloud | ✅ resolved by FIX-010 |
| GAP-B-006 | Card tile shares are a single icon glyph | ⚠ partial — FIX-022 landed stacked avatars but uses hashed palette where web uses solid violet (see NEW-GAP-B2-002) |
| GAP-B-007 | Card tile missing relTime fallback | ✅ resolved by FIX-026 |
| GAP-B-008 | Archive purge label + footer band + empty copy | ✅ resolved by FIX-021 |
| GAP-B-009 | Column empty message copy drift | ✅ resolved by FIX-028 |
| GAP-B-010 | Notifications empty glyph drift (bell.slash) | ✅ resolved by FIX-035 |
| GAP-B-011 | Login input missing violet focus-glow ring | ✅ resolved by FIX-036 |
| GAP-B-012 | Edit dialog chain button | Closed (Card Chain modal 🔄 V1) |
| GAP-B-013 | Edit dialog Related Cards section | Closed (🔄 V1) |
| GAP-B-014 | Weather widget in toolbar | Closed (🔄 V1) — DOM still shows `🌥️ 12° Cloudy` chip on web, macOS toolbar suppresses |
| GAP-B-015 | Activity ticker strip | Closed (🔄 V1) — DOM still shows `Active / 5 / Argus Review · 17d ago / …` ticker on web, macOS suppresses |

---

## P0 — Critical Visual Gaps

None. All R1 P0 items either resolved by a FIX or explicitly closed in FINAL_FIXES.md.

## P1 — Layout Gaps

None this round.

## P2 — Polish Gaps

- **NEW-GAP-B2-001** — Knowledge header subtitle copy divergence. Web subtitle markets the linkage to cards; macOS subtitle reads more domestic. Single-line copy swap in `KnowledgeListView.swift:118`.
- **NEW-GAP-B2-002** — Shared-with avatar background colour: macOS uses hashed-palette (matches assignees), web uses solid violet. Either:
  - **(a)** swap to a violet-tinted variant: e.g. `InitialsAvatar(label:color:)` overload taking explicit `Tokens.violet`, or
  - **(b)** mark this as deliberate desktop divergence (assignee vs share distinction kept via the `.help("Shared with …")` tooltip).
  Recommend (a) since the original FIX-022 spec said `color: Tokens.violet` verbatim — implementation drifted from spec.

## Screens Confirmed Matching (code-verified per RULE 17)

| Screen | Swift source | Status vs registry |
|--------|--------------|--------------------|
| Top toolbar — Brand + section tabs + scope picker + search + ✦ + bell + ⚙ + profile + + New | `BoardToolbar.swift` | ✓ matches F-019..F-040 minus weather widget (🔄 V1) |
| Scope picker popover (4 scopes with description lines + active highlight) | `BoardToolbar.swift:77–121` | ✓ matches F-041..F-049 |
| Board 4-column HStack with dividers, per-column status dot + serif title + 2-digit count + "+" + empty message + columnBloom | `BoardView.swift` + `BoardColumnView.swift` | ✓ matches F-102..F-104 + FIX-028 web copy + FIX-019 scrollToColumn |
| Card drag-and-drop via NSItemProvider + position math + drag-self opacity | `BoardView.swift:46–60` + `BoardColumnView.swift:74–87` | ✓ matches F-114..F-117, F-126 |
| Trash drop overlay during drag | `TrashDropZoneOverlay.swift` | ✓ matches F-119..F-121 |
| Card tile content + footer (badge / title / desc / AI summary / tags / image thumbs / due chip + relTime fallback / paperclip / bubble / assignee stack / share stack) | `CardTileView.swift` | ✓ matches F-132..F-153 with FIX-022/026/027 applied; share-avatar colour ⚠ (NEW-GAP-B2-002) |
| Notifications popover (header + Mark all read + 50-row slice + 🔔 empty glyph) | `NotificationsPopover.swift` | ✓ matches F-070..F-076 with FIX-035 |
| Edit card window (title / status / desc / tags / due / attachments / assignees / shares + Share now / knowledge full UI / AI insights / chat & activity timeline) | `EditCardView.swift` | ✓ matches F-168..F-217 with FIX-001/020 (Chain + Related Cards 🔄 V1) |
| AI Insights panel (✨ title, empty/pending/ok/failed states, brainstorm CTA, ⌘B, related items with Open/LinkActions/why, web findings with why, LinkActions ✓ Copied, lastError pill) | `AiInsightsPanelView.swift` | ✓ matches F-218..F-237 with FIX-013/014/029/030 |
| Card Timeline (chat & activity, system/message/AI/share entries, AI suggestion Buttons with applied state, auto-scroll) | `CardTimelineView.swift` + `ChatInputView.swift` | ✓ matches F-273..F-301 with FIX-002 |
| Knowledge list (segmented Mine/Inbox/All + search + tag cloud + adaptive grid + 🔗 prefix + paperclip count) | `KnowledgeListView.swift` + `KnowledgeRowView.swift` | ✓ matches F-302..F-318 with FIX-010/011/024; subtitle copy ⚠ (NEW-GAP-B2-001) |
| Knowledge detail sheet (title + meta + body + tags + linked cards + +Attach + Refetch/Edit/Archive for owner) | `KnowledgeDetailSheet.swift` | ✓ resolves FIX-005, matches F-345..F-359 |
| Knowledge edit sheet (Title + URL with autofill + Auto-fetch toggle + Body + Tags + Visibility + field-level errors) | `KnowledgeEditSheet.swift` | ✓ matches F-328..F-338 with FIX-007/008/009 |
| Archive sheet (modal strip + count chip + row list + Restore + per-row delete confirm + footer band with Delete all (N) confirm + Close) | `ArchiveSheet.swift` | ✓ matches F-360..F-369 with FIX-021 |
| Weekly Review sheet (3-up stat grid + summary + per-section empty placeholders + footer Generate again / Got it) | `WeeklyReviewSheet.swift` | ✓ matches F-380..F-388 with FIX-012 |
| Preferences window — TabView with General / Account / Tokens (with mirror-link panel + per-row revoke confirm + suffix + relTime) / Telegram / Templates (with inline error) | `PreferencesView.swift` + tab files | ✓ matches F-412..F-460 with FIX-031/032/033/034; TabView in window vs single-modal-section is the documented 🔄 desktop adaptation |
| Toast overlay (5-slot, 4s auto-dismiss, error/success/info accents) | `ToastOverlay.swift` + `ToastStore.swift` | ✓ matches F-482..F-487 |
| Login view (K square, SmartKanban wordmark, SIGN IN tag, dual radial bloom, email/password, Sign in, focus-glow ring on LabeledInput) | `LoginView.swift` | ✓ matches F-721..F-731 with FIX-036 |
| Global keyboard layer (⌘V paste-image, ⌘K + / focus search, n opens Capture as backlog, 1–4 scroll column, Esc-to-clear) | `GlobalKeyMonitor.swift` + `BoardToolbar.swift` SearchField | ✓ resolves FIX-006/016/017/018/019/025 |
| WebSocket reconnect with backoff + wake reconnect | `WebSocketClient.swift` | ✓ matches F-677..F-697 (unchanged) |
| Theme (system / light / dark) | `ThemeManager.swift` | ✓ matches F-705..F-712 (unchanged) |

---

## Regression scan — RULE 16 grep of touched files

```
$ grep -rn "async let _ =" macOS/KanbanClaude
(no matches)

$ grep -rn ".task { await refreshAll\|loadAll\|fetchAll" macOS/KanbanClaude
(no matches)

$ grep -rn ".task { await " macOS/KanbanClaude
WeeklyReviewSheet.swift:54     .task { await refresh() }
TemplatesTab.swift:43          .task { await refresh() }
TelegramTab.swift:45           .task { await refresh() }
ArchiveSheet.swift:51          .task { await refresh() }
TokensTab.swift:57             .task { await refresh() }
NotificationsPopover.swift:51  .task { await store.refresh() }
```

All six `.task { await refresh() }` calls are on **modal sheets / popovers**. View identity is stable for the sheet's lifetime, so the cancellation cascade pattern from I-7 doesn't apply here. None of these are in the "heavy fetch on board re-render" shape RULE 3 was written to prevent. **No regressions detected.**

`async let _ =` clean across the whole `macOS/KanbanClaude` tree — the I-6 pattern is fully extinct in this codebase.

## Notes for Round 2 fix-agent (handoff)

1. **NEW-GAP-B2-002 (FIX-022 colour drift)** — small one-line correction: in `CardTileView.swift:154–163`, wrap the share `InitialsAvatar` in a violet-backed equivalent (either swap to `ShareAvatar`-style violet circle + initial, or add an `InitialsAvatar(label:size:color:)` overload). Spec said `Tokens.violet`; landed code defaulted to hashed.
2. **NEW-GAP-B2-001 (Knowledge subtitle)** — change `KnowledgeListView.swift:118` from `"Notes, links, and references shared across the household."` to `"URLs, snippets, notes — all linked back to cards"` to match web `KnowledgeView.tsx`.
3. **Re-shoot pixel parity** — run this audit again with `caffeinate -dimsu sleep 7200 &` started **before** lock, and have someone sign into the macOS app once. The Keychain mirror persists, so subsequent unlocked runs can capture every post-login surface. Web window 18684 is still authenticated as Simba — keep the same Chrome window; SPA-nav only (RULE 18).
4. **Backing-store collision (RULE 17 corollary)** — even with the screen awake, the Chrome window at X=3840 is on a powered-off external display and produces stale CGWindowList backing-stores after the first capture. Move the window to the primary display (Chrome AppleScript `set bounds of …` is rate-limited; use `set index to 1` + drag via System Events when unlocked) before any multi-shot pair-diff session.

---

✅ AUDIT_B2.md written — 2 visual gaps found across 13 screens. Round 1.
STAGE_COMPLETE: resolved=35 remaining=2 regressions=0
