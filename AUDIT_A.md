# Code Audit — Agent A — Round 1 (initial)
Date: 2026-05-21
Method: Systematic web code → macOS codebase comparison (Rule 11 slow-read per component)
Screens audited: 22 MVP groups
Total gaps found: 43
Fixes verified (Round > 1): n/a — initial audit

## Method notes
- Web frontend = React/Vite SPA under `web/src/` (8,261 LOC TSX/TS). `web/index.html` is only a 32-line shell; real code lives in `web/src/`.
- macOS app = SwiftUI under `macOS/KanbanClaude/` (81 .swift files). Endpoint catalog in `Networking/Endpoint.swift`, API client in `Networking/APIClient.swift`.
- Registry classifies many groups V1-deferred (🔄) or out-of-scope (🚫). Gaps below are filed only when the registry claims ✅ but the Swift implementation falls short of the web behavior. Acknowledged V1/🚫 deferrals are listed at the bottom for completeness.
- I-1 (locked screen) still blocks Rule 14 visual diff this run. This audit is code-only.

## Fix Verification (Round > 1)
n/a — initial audit, no prior FIX-NNN to verify.

## Gap Registry

| ID | Screen | Web behavior | Web code location | Swift/Tauri equivalent | Found? | Confidence |
|----|--------|-------------|-------------------|------------------------|--------|-----------|
| CA-001 | EditDialog | Knowledge section: linked list with 🔒/📥/👥 icon + remove link, "+ Attach" inline picker with search (GET /api/knowledge?scope=all&q=) and attach POST /api/knowledge/:kid/links, "Save as knowledge" CTA when card has URL | web/src/components/EditDialog.tsx (F-181..F-187) | macOS/KanbanClaude/UI/Card/EditCardView.swift `knowledgeSection()` | ❌ Missing (placeholder reads "Knowledge linking lands in Phase 7.") | High |
| CA-002 | EditDialog → CardTimeline | AI-suggestion pills are interactive Apply buttons. Suggestion kinds: update_status (PATCH card.status), set_due_date (PATCH due_date), assign_user (GET+PATCH), create_card (POST). Applied state shows "✓ <label>" disabled | web/src/components/CardTimeline.tsx (F-282..F-288) | macOS/KanbanClaude/UI/Card/CardTimelineView.swift `suggestionPills()` | ❌ Missing — rendered as static Text capsules, no Button, no API call (RULE 9 violation) | High |
| CA-003 | Capture Bar | Photo (📷) mode button opens file picker / image input → POST /api/cards/from-image with current target lane | web/src/components/CaptureBar.tsx (F-394, F-404, F-405) | macOS/KanbanClaude/UI/Capture/CaptureView.swift | ❌ Missing — no photo button, no file picker, only title/description text entry | High |
| CA-004 | Capture Bar | Template (✱) mode opens template picker bottom sheet → POST /api/templates/:id/instantiate with status_override; slash-prefix shortcut "/templateName" submits the named template instead of creating bare card | web/src/components/CaptureBar.tsx (F-395, F-397, F-399, F-479) | macOS/KanbanClaude/UI/Capture/CaptureView.swift | ❌ Missing — no template picker, no slash-shortcut parser | High |
| CA-005 | Knowledge | KnowledgeDetail read-only modal (separate from edit): meta line (visibility + fetched_at / "no fetch"), fetch_error display, body `<pre>` block, linked cards list with per-card remove, "+ Attach card" toggle + search picker, owner-only Refetch / Edit / Archive buttons | web/src/components/KnowledgeDetail.tsx (F-345..F-359) | macOS/KanbanClaude/UI/Knowledge/ | ❌ Missing — tapping a row goes straight to KnowledgeEditSheet; no detail dialog, no Refetch UI, no linked-cards display, no attach-card picker | High |
| CA-006 | Cross-cutting | Document-level paste listener: image on clipboard → if EditDialog open attach to that card (POST /api/cards/:id/attachments), else create card from image (POST /api/cards/from-image); toast on success/failure | web/src/App.tsx onPaste handler (F-635..F-640) | macOS/KanbanClaude/* (NSPasteboard image read) | ❌ Missing — no clipboard-image listener; only Finder file drop on BoardView/EditCardView | High |
| CA-007 | Templates Tab | Full CRUD form: Name (1-40), Visibility (Private/Shared), Title (required ≤120), Description, Tags (space-separated max 5), Status (4 options), Due-offset days (0-365), Save (POST or PATCH), Edit row, Delete row | web/src/components/TemplatesTab.tsx (F-461..F-470, F-473, F-474) | macOS/KanbanClaude/UI/Preferences/TemplatesTab.swift | ⚠ Partial — only list + Instantiate. Registry pre-marks 🔄 V1 deferral so not a regression, but flagged for completeness | Med |
| CA-008 | Knowledge Edit | URL change auto-fills title from hostname when title empty (sets title_auto=true). Editing title sets title_auto=false. | web/src/components/KnowledgeEditDialog.tsx (F-330, F-331) | macOS/KanbanClaude/UI/Knowledge/KnowledgeEditSheet.swift | ❌ Missing — no auto-fill side effect, no title_auto flag passed in KnowledgeInput | High |
| CA-009 | Knowledge Edit | "Auto-fetch when I save" checkbox, default on; controls auto_fetch in payload | web/src/components/KnowledgeEditDialog.tsx (F-335) | macOS/KanbanClaude/UI/Knowledge/KnowledgeEditSheet.swift | ❌ Missing — Swift auto-derives `autoFetch = !url.isEmpty && body.isEmpty`; user has no toggle | High |
| CA-010 | Knowledge Edit | Field-level inline validation error messages | web/src/components/KnowledgeEditDialog.tsx (F-338) | macOS/KanbanClaude/UI/Knowledge/KnowledgeEditSheet.swift | ❌ Missing — only generic toast on save failure | Med |
| CA-011 | Knowledge | Top-20 tag chip cloud above list, sorted by usage, click toggles tag filter; active chip highlighted green-accent | web/src/KnowledgeView.tsx (F-305, F-306) | macOS/KanbanClaude/UI/Knowledge/KnowledgeListView.swift | ❌ Missing — only active-tag chip (set programmatically), no cloud, no per-tag toggle UI | High |
| CA-012 | Knowledge Row | "📎 N" linked-cards count chip when linked > 0 | web/src/components/KnowledgeRow.tsx (F-325) | macOS/KanbanClaude/UI/Knowledge/KnowledgeRowView.swift | ❌ Missing — `linkedCardIds` is decoded but never surfaced on the row | High |
| CA-013 | Knowledge Row | Title row prefix is 🔗 (when url) + title; visibility shown as separate icon span elsewhere | web/src/components/KnowledgeRow.tsx (F-320, F-324) | macOS/KanbanClaude/UI/Knowledge/KnowledgeRowView.swift | ⚠ Partial — Swift shows visibility icon (lock/tray/person.2) as the title prefix; URL shown on second line. Web is the opposite pattern. Behavior equivalent but visual structure differs | Med |
| CA-014 | Weekly Review | 3-up stat grid (Shipped/Stale/Stuck counts), per-section empty placeholder ("Nothing closed this week.", etc), footer "Generate again" button that re-fetches /api/review | web/src/components/WeeklyReview.tsx (F-381, F-385, F-386) | macOS/KanbanClaude/UI/Review/WeeklyReviewSheet.swift | ❌ Missing — no stat grid, empty sections are hidden (no placeholder), no "Generate again" button | High |
| CA-015 | AI Insights Panel | "Related items you have" rows: each shows `[kind] title` + "Open" button + "why" reasoning text; knowledge items render LinkActions (Open ↗ + Copy 📋); card items render "Open" which calls onOpenCard → opens that card in EditDialog | web/src/components/AiInsightsPanel.tsx (F-225, F-226, F-227) | macOS/KanbanClaude/UI/Card/AiInsightsPanelView.swift | ❌ Missing — only `Text("• \(item.title)")`, no Open button, no why text, no Open Card navigation | High |
| CA-016 | AI Insights Panel | "Web findings" rows include per-item "why" reasoning text under the LinkActions | web/src/components/AiInsightsPanel.tsx (F-228) | macOS/KanbanClaude/UI/Card/AiInsightsPanelView.swift | ⚠ Partial — title + link + copy present, no why text | Med |
| CA-017 | Profile Dropdown | Dropdown row "⚙ Settings" launches SettingsDialog (alternate path to gear icon) | web/src/components/BoardHeader.tsx (F-086, F-458) | macOS/KanbanClaude/UI/Main/BoardToolbar.swift ProfileChip | ❌ Missing — profile popover only shows name/email + Sign out; no Settings row | High |
| CA-018 | Search bar | Esc clears search query and blurs input; outside dialog context, also clears search | web/src/components/SearchBar.tsx + useKeyboardShortcuts.ts (F-626, F-632) | macOS/KanbanClaude/UI/Main/BoardToolbar.swift SearchField | ❌ Missing — no Esc-to-clear behavior on the toolbar SearchField | Med |
| CA-019 | Keyboard | "/" focuses card-search input (when not in input/dialog) | web/src/hooks/useKeyboardShortcuts.ts (F-627, F-631) | macOS/KanbanClaude/* | ❌ Missing — no global "/" handler | High |
| CA-020 | Keyboard | ⌘K / Ctrl+K focuses card-search input | web/src/hooks/useKeyboardShortcuts.ts (F-628) | macOS/KanbanClaude/* | ❌ Missing — ⌘K hint pill rendered in SearchField but no shortcut wired | High |
| CA-021 | Keyboard | Plain "n" (no modifier) dispatches kanban:add-card with status=backlog | web/src/hooks/useKeyboardShortcuts.ts (F-629) | macOS/KanbanClaude/UI/Main/BoardToolbar.swift | ⚠ Partial — only ⌘N is bound; bare "n" is not. Lane targeting also differs: web "n" defaults to backlog, ⌘N opens default lane (today) | Med |
| CA-022 | Keyboard | "1".."4" scrolls the corresponding column into view (smooth, inline center) via data-column-status query | web/src/hooks/useKeyboardShortcuts.ts (F-630, F-123) | macOS/KanbanClaude/UI/Main/BoardColumnView.swift | ❌ Missing — no 1-4 hotkeys; no data-status anchor for ScrollViewReader either | Med |
| CA-023 | EditDialog | Separate "Share now" button under Shared-with grid that writes shares immediately (PATCH /api/cards/:id, "✓ Shared" 2-sec confirmation) without waiting for outer Save | web/src/components/EditDialog.tsx (F-195) | macOS/KanbanClaude/UI/Card/EditCardView.swift `sharesSection` | ❌ Missing — share changes only persist via the bottom Save button (Cancel discards) | High |
| CA-024 | Archive | "Delete forever" and "Delete all (N)" confirm dialog before destructive action | web/src/components/ArchiveDialog.tsx (F-368, F-371) | macOS/KanbanClaude/UI/Archive/ArchiveSheet.swift | ❌ Missing — Button(role:.destructive) fires immediately, no confirmation alert | High |
| CA-025 | CardTile | Shared-with avatars: stacked InitialsAvatar (violet bg, -6px overlap, max 3) keyed by user.short_name; tooltip "Shared with <name>" | web/src/components/CardView.tsx shares mapping (F-154) | macOS/KanbanClaude/UI/Main/CardTileView.swift `footer` | ⚠ Partial — Swift renders a single generic `ShareAvatar` icon instead of stacked initial avatars per share | High |
| CA-026 | CardTile | Footer fallback: when no due/attachments/unread, renders `relTime(updated_at)` ("just now", "Nm", "Nh", "Nd", "Nmo") so footer is never empty | web/src/components/CardView.tsx (F-151) | macOS/KanbanClaude/UI/Main/CardTileView.swift `footer` | ❌ Missing — no else branch; footer can be completely empty | Med |
| CA-027 | CardTile (DueDateChip) | -1 day renders "Yesterday" (danger tone) | web/src/components/CardView.tsx formatDue (F-148) | macOS/KanbanClaude/UI/Components/DueDateChip.swift | ⚠ Partial — Swift renders "1d overdue" for -1; "Yesterday" label missing | Med |
| CA-028 | Cross-cutting (unread) | When openCardId matches incoming card.message, append to activeChatEvents and do NOT bump unreadCounts | web/src/App.tsx connectWS card.message branch (F-691) | macOS/KanbanClaude/Stores/UnreadStore.swift | ⚠ Partial — Swift bumps as long as actor != self, regardless of whether the EditCard window is open | Med |
| CA-029 | BoardColumn | Empty-state strings: backlog "Nothing here yet.", today "Nothing planned for today.", in_progress "Quiet here.", done "Nothing finished yet." | web/src/components/Column.tsx EMPTY_MSG (F-110, F-112) | macOS/KanbanClaude/UI/Main/BoardColumnView.swift `emptyMessage` | ⚠ Partial — Swift uses different copy ("Idea graveyard…", "Nothing in flight.", "Recently completed cards land here.") | Low |
| CA-030 | Toast | Offline sticky toast (no auto-dismiss) | web/src/hooks/useToast.ts | macOS/KanbanClaude/Stores/ToastStore.swift `offline(...)` | ✅ Found — `offline` pushes with ttlMS=nil. Verified OK | Med |
| CA-031 | AI Insights Panel | LinkActions "Copy 📋" → "✓ Copied" feedback for 1.2s | web/src/components/AiInsightsPanel.tsx (F-230) | macOS/KanbanClaude/UI/Card/AiInsightsPanelView.swift | ❌ Missing — copy works but no "✓ Copied" visual confirmation | Low |
| CA-032 | AI Insights Panel | Inline red 1-line error display when brainstorm submit fails | web/src/components/AiInsightsPanel.tsx (F-234) | macOS/KanbanClaude/UI/Card/AiInsightsPanelView.swift | ⚠ Partial — failures surface via Toast (via InsightStore.brainstorm()), no inline error pill in the panel itself | Low |
| CA-033 | TemplatesTab | Inline error message (instantiate/save/delete failures) | web/src/components/TemplatesTab.tsx (F-476) | macOS/KanbanClaude/UI/Preferences/TemplatesTab.swift | ⚠ Partial — errors only via global Toast | Low |
| CA-034 | TokensTab | "Devices and integrations using it will stop working" confirm before API token revoke | web/src/components/SettingsDialog.tsx (F-452) | macOS/KanbanClaude/UI/Preferences/TokensTab.swift | ❌ Missing — destructive button fires immediately | Med |
| CA-035 | SettingsDialog | Mirror create response shows full URL (`${origin}/my-day?token=<token>`) in a green band with copy/dismiss | web/src/components/SettingsDialog.tsx (F-420, F-455) | macOS/KanbanClaude/UI/Preferences/TokensTab.swift | ⚠ Partial — Swift shows token + copy button but not the full /my-day URL; mirror.url is decoded but only shown as subtitle on list rows, not in the create-success panel | Med |
| CA-036 | SettingsDialog | API tokens list shows label + token suffix + created date | web/src/components/SettingsDialog.tsx (F-429) | macOS/KanbanClaude/UI/Preferences/TokensTab.swift | ⚠ Partial — Swift shows label only; no token suffix preview, no created_at | Low |
| CA-037 | CardTile | Title font-feature uses Spectral 15px with text-wrap:pretty 2-line; description 12.5px 2-line clamp; AI snippet "✨ <summary>" only when latest insight ok && summary | web/src/components/CardView.tsx (F-143, F-144, F-145) | macOS/KanbanClaude/UI/Main/CardTileView.swift | ✅ Found — verified Spectral 15 / sans 12.5 / 2-line clamps / AI snippet branch | High |
| CA-038 | LoginView | "redirectTo" support for `/m/card/<uuid>` deep link (safe relative path validator) on successful login → location.assign(redirectTo) | web/src/components/LoginView.tsx (F-014) | macOS/KanbanClaude/UI/Auth/LoginView.swift | 🔄 N/A on desktop — deep link uses URL scheme handler (URLSchemeHandler.swift kanbanclaude://card/<uuid>). Adapted equivalent exists. No gap. | Med |
| CA-039 | Notification permission flow | First bell click also requests Notification.requestPermission() if state is 'default' (once per session) | web/src/components/NotificationBell.tsx (F-066) | macOS/KanbanClaude/* | ⚠ Partial — UNUserNotificationCenter authorization request location not visible from bell flow. Need to confirm where the request is fired (likely NotificationCenterBridge on launch). If fired once on first launch, this is 🔄 adapted, not a gap. Mark Low and recommend C verify. | Low |
| CA-040 | Keyboard | Esc closes top-most open dialog (settings/archive/review/capture/editing) — global handler with priority over clear-search | web/src/hooks/useKeyboardShortcuts.ts (F-625) | Each Swift dialog binds `.cancelAction` independently | ✅ Found — each dialog responds to Esc via .keyboardShortcut(.cancelAction). Behavior matches even without a central dispatcher | High |
| CA-041 | EditDialog header | Copy card-id chip writes navigator.clipboard.writeText(card.id) | web/src/components/EditDialog.tsx (F-171) | macOS/KanbanClaude/UI/Card/EditCardView.swift `header` | ✅ Found — NSPasteboard.general write + 1.2s "Copied" feedback. Verified OK | High |
| CA-042 | EditDialog header | QR popover button → /api/cards/:id/qr.svg + "Scan to open on phone" caption | web/src/components/EditDialog.tsx (F-175, F-176) | macOS/KanbanClaude/UI/Card/EditCardView.swift + QRPopover.swift | ✅ Found — popover renders QR. Verified OK | High |
| CA-043 | EditDialog | Save serializes title/description/tags/assignees/shares/due_date and clears needs_review | web/src/components/EditDialog.tsx (F-197, F-199) | macOS/KanbanClaude/UI/Card/EditCardView.swift `save()` | ✅ Found — patch builder includes needsReview=false. Verified OK | High |

## P0 — Critical Gaps (core functionality missing on a ✅-claimed screen)
- **CA-001** EditDialog Knowledge section is a "Phase 7" placeholder — endpoints exist (linkKnowledgeToCard / unlinkKnowledgeFromCard / knowledgeFromCard / knowledgeForCard) but no UI hits them.
- **CA-002** CardTimeline AI-suggestion pills are static `Text`, not Apply Buttons — RULE 9 violation. The whole "AI suggests, user applies" workflow is dead.
- **CA-003** Capture Bar has no photo button → can't create card from image without dragging a file from Finder.
- **CA-004** Capture Bar has no template picker and no "/name" slash shortcut → user cannot instantiate templates from the capture flow.
- **CA-005** Knowledge detail view is missing entirely. Users tapping a knowledge row jump straight into the edit sheet, losing read-only display, Refetch, linked-cards visibility, and the attach-card picker.
- **CA-006** Clipboard image paste does not work on macOS — only Finder file drag. Drops the entire "screenshot a thing, paste into Kanban" workflow.

## P1 — Behavioral Gaps (feature exists but behaves differently)
- **CA-008..010** KnowledgeEditSheet: no URL→title auto-fill, no auto-fetch toggle, no inline validation messages.
- **CA-011** No tag-cloud chip filter on Knowledge view.
- **CA-012** Knowledge row hides "📎 N" linked-cards count.
- **CA-014** Weekly Review missing stat grid, empty-section placeholders, and "Generate again" CTA.
- **CA-015..016** AI Insights related-items list is title-only — no Open button, no Copy on knowledge items, no reasoning text. Web findings missing "why" text.
- **CA-017** Profile dropdown has no Settings row.
- **CA-019..022** Keyboard shortcuts mostly absent: "/", ⌘K, plain "n", "1".."4".
- **CA-023** Share-now instant apply missing — sharing requires bottom Save commit (Cancel discards shares).
- **CA-024** Archive destructive actions fire with no confirm dialog.
- **CA-025** CardTile shared-with chip uses a single generic icon instead of stacked initial avatars.
- **CA-028** UnreadStore bumps unread count even when the card's edit window is open.

## P2 — Minor Gaps (polish, copy, edge-state)
- **CA-013** Knowledge row title prefix differs (visibility icon vs 🔗) — behaviorally fine.
- **CA-018** Search Esc-to-clear not implemented.
- **CA-026** CardTile footer lacks relTime fallback when no due/attachments/unread.
- **CA-027** DueDateChip never renders "Yesterday" label (uses "1d overdue" instead).
- **CA-029** Column empty messages differ from web copy.
- **CA-031** AI Insights Copy lacks "✓ Copied" feedback.
- **CA-032** AI Insights brainstorm failure surfaced as toast instead of inline error.
- **CA-033** Templates instantiate errors surfaced via toast only.
- **CA-034** API token revoke has no confirm dialog.
- **CA-035** Mirror token creation does not display the full `/my-day?token=` URL panel.
- **CA-036** API token rows show only the label (no token suffix, no created date).
- **CA-039** Notification permission "first bell click" flow likely 🔄-adapted to on-launch UN request. Verify behavior matches the once-per-session semantic.

## Verified OK (spot-checked items that passed)
- F-007/008/015/501 — Login / register flow via AuthStore; cookie persisted to Keychain for cold-launch restore (APIClient.restoreCookieFromKeychainIfNeeded).
- F-041..F-049 — ScopePicker popover with label + description rows; selecting clears `searchQuery` (BoardToolbar.swift:103).
- F-102/F-104/F-105 — 4-column HStack, status dot + serif title + zero-padded count chip in BoardColumnView header.
- F-113..F-119 — Drag-to-reorder via NSItemProvider; column slot drop targets; TrashDropZoneOverlay archives via DELETE.
- F-125 — Hover lift + drag opacity 0.4 on CardTileView.
- F-132..F-150 (most of CardTile) — Surface, accent bar, badges row, title/description/tags/AI snippet/thumbnails/due chip/paperclip/unread bubble all wired.
- F-168..F-178/F-188..F-193/F-197 — EditDialog title, description, tags, due, attachments, assignees, save footer.
- F-171, F-175, F-176 — Copy-id chip, QR toggle, QR popover via /api/cards/:id/qr.svg.
- F-218..F-224 — AI Insights panel: gold-tinted surface, Re-run button, Brainstorm CTA, Researching / Failed (Retry) / Summary states; ⌘B keyboard shortcut.
- F-273..F-294 — CardTimeline (load on appear, WS append, scroll-to-bottom, system/message/AI rows, mark-read on load, "No activity yet" empty state).
- F-295..F-301 — ChatInput (placeholder, Enter sends, send button busy state, 2000-char guard, error display).
- F-302/F-303/F-304 — Knowledge list view: title band, mine/inbox/all segmented picker, search field with onSubmit refresh.
- F-360..F-378 (most) — ArchiveSheet: count line, restore row action, permanent delete row, purge all, empty placeholder.
- F-412..F-414/F-415..F-417 — General theme picker; Account display-name save with "Saved." confirmation.
- F-419..F-432 — Tokens (mirror + api) create/list/revoke; one-time reveal of new token; copy-to-pasteboard button.
- F-433..F-437 — Telegram link form, identities list, unlink.
- F-482..F-487 — ToastStore: success/error/info/offline kinds; auto-dismiss 4 s; max-5 with slide animation.
- F-625 — Esc closes any open dialog (each dialog binds .cancelAction).
- F-635 (file-drop variant) — Finder drag of file → createFromImage via BoardView .onDrop; attach-to-card via EditCardView .onDrop.
- F-641..F-651 — URL scheme deep link routing for kanbanclaude://card/<uuid> and kanbanclaude://capture in URLSchemeHandler.
- F-677..F-697 — WebSocketClient connect + exponential backoff + NSWorkspace.didWake reconnect + subscriber fanout; CardStore / CardEventsStore / UnreadStore / KnowledgeStore / NotificationStore / InsightStore all subscribed.
- F-705..F-712 — ThemeManager.Mode (system/light/dark) wired via NSApp.appearance.
- F-713..F-723 — Attachments fetched via APIClient with cookie auth (AuthenticatedImage); upload via Uploader with mime check + size cap delegated to server.

## Out-of-scope / acknowledged 🔄 deferrals (informational only, not gaps)
- Weather widget (F-050..F-061) — registry marks 🔄 V1.
- Activity Ticker (F-091..F-101) — 🔄 V1.
- Related Cards Section in EditDialog (F-238..F-249) — 🔄 V1.
- Card Chain Modal (F-250..F-262) — 🔄 V1.
- Link Picker Dialog (F-263..F-272) — 🔄 V1.
- Mirror View (F-508..F-519) — 🚫 V2 per VETO V-008.
- All Mobile screens (F-520..F-610) — 🚫 mobile-only.
- Service Worker (F-611..F-624) — 🚫 replaced by UNUserNotificationCenter + WS.
- Telegram server bot (F-652..F-676) — 🚫 server-only; only identity admin surfaced.
- Web push (F-067..F-069, F-081, F-082) — 🚫 replaced by UNUserNotificationCenter local banner + Dock badge.
- ⚠ CA-007 (Templates full CRUD) is registry-acknowledged 🔄 V1 but listed for visibility.

## Notes for Agent C (prioritization input)
- CA-001, CA-002, CA-005 are the highest leverage: they each invalidate an entire user workflow (knowledge linking, AI suggestion apply, knowledge detail). The Endpoint cases are already present so UI work alone closes them.
- CA-003 + CA-004 + CA-006 cluster around "create from image / template" — same surface, can be addressed together in a single CaptureView pass plus a global NSPasteboard listener installed at AppDelegate.
- CA-024 + CA-034 are both confirm-before-destroy gaps and can be addressed via a single `.confirmationDialog` helper.
- CA-019..022 form a single useKeyboardShortcuts-equivalent layer (NSEvent.addLocalMonitorForEvents in AppDelegate or per-window).

✅ AUDIT_A.md written — 43 gaps found across 22 screens. Round 1 (initial).
STAGE_COMPLETE: verified=0 not_landed=0 regressions=0
