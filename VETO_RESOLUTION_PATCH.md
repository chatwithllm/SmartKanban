# Veto Resolution Patch
# Date: 2026-05-21
# Source: MACOS_APP_PLAN.md §7
# Rule: this patch OVERRIDES MACOS_APP_PLAN.md where they conflict.

## Summary
- Total vetoes: 88 (10 conflicts + 15 gaps + 5 Phase-0-relevant risks + 53 unchecked handoff boxes + 5 derived spec gaps)
- Resolved automatically: 33 (all §7.1 conflicts locked, §7.2 gaps locked, derived spec gaps filled, count audits closed)
- Process gates (human or build-agent action): 55 (§7.4 checklist items + 5 risk follow-ups; none block Phase 0)
- Updated confidence (if any): Buildability 8 → 9 (count audits closed; per-state and per-section specs enumerated; Rule 3 CI lint commands locked). Completeness stays 9. Risk stays 7 (R-01, R-20 remain HIGH by nature).

Phase 0 status: UNBLOCKED. Every unchecked §7.4 box is a future verification, not a current obstacle. Phase 0 only needs G-001..G-007 to pass before Phase 1 starts.

---

## §A — Resolved Amendments

### V-001 — Capture panel style + ⌘N delivery
Source veto: §7.1 CF-01 "Section 3 specifies 'Capture panel' with `⌘N` as floating NSPanel; Section 4 lists W-03 as `.nonactivatingPanel`. Section 5 menu has `File > New Card… ⌘N`."
Classification: Spec conflict
Resolution: Locked. W-03 = `NSPanel` subclass with `styleMask = [.titled, .closable, .nonactivatingPanel, .fullSizeContentView]`, `level = .floating`, `becomesKeyOnlyIfNeeded = true`. `⌘N` delivered via NSMenu `File > New Card…` in MVP. V1 adds global hotkey via `Carbon.RegisterEventHotKey` in `App/ShortcutManager.swift` (default `⌃⌥⌘K`, user-configurable).
Builder action: Build W-03 per §4.7 paragraph "W-03 Capture"; bind `⌘N` to `MenuID.fileNew` via `.commands {}`; do NOT add global hotkey before V1.

### V-002 — Scope vs column shortcut scheme
Source veto: §7.1 CF-02 "`⌘1..⌘4` scope vs column conflict. §3.4 had `⌘⇧1..⌘⇧4` for columns and `⌃⌘P/I/A/H` for scope, but §2.4 (MVP) listed `⌘1..⌘4` for scope."
Classification: Spec conflict
Resolution: Locked. Sections = `⌘1` Board / `⌘2` Knowledge / `⌘3` Archive. Scope = `⌃⌘P` Personal / `⌃⌘I` Inbox / `⌃⌘A` All / `⌃⌘H` Shared. Columns = `⌘⇧1..⌘⇧4` Backlog/Today/InProgress/Done. §2.4 reading is wrong — §3.3 + §3.4 are canonical.
Builder action: Wire shortcuts exactly per §3.3 tables (View menu) and §3.4 master list. Ignore any conflicting reading of §2.4.

### V-003 — QR code rendering source
Source veto: §7.1 CF-03 "QR code: Section 3.7 V-22 says client-side via CIQRCodeGenerator; Section 1.8 C8 listed two options."
Classification: Spec conflict (with cross-ref error: CF-03 cites "§3.7 V-22" but V-22 in §3.7 is the Card Chain Window; the QR popover spec actually lives in §3.7 V-10 line 1175 and §5.3 CMD-17)
Resolution: Locked. MVP QR = client-side `CIQRCodeGenerator` via `CMD-17 QRGenerator.svg(for:)` in `Networking/QRGenerator.swift`. QR text = `"\(kAppURLOrigin)/m/card/\(card.id)"` where `kAppURLOrigin = "https://kanban.npalakurla.com"` (no trailing slash). Server endpoint `GET /api/cards/:id/qr.svg` exists but macOS does NOT call it. WKWebView fallback (per §1.8 C8 option a) is dead code — do not include.
Builder action: Implement `QRPopover.swift` consuming `QRGenerator.svg(for: URL)` only. Do not register `Endpoint.cardQR` for any call site; keep the enum case for completeness but mark `// MVP: unused — V2 only` above it.

### V-004 — Push notification channel
Source veto: §7.1 CF-04 "Push notifications: §0 says no VAPID for MVP; §1.7.5 web behavior fans out push. §4.6 N-05 says UN local notification."
Classification: Spec conflict
Resolution: Locked. macOS MVP receives `card.message` / `card.ai_response` over WebSocket and schedules a local `UNNotificationRequest` via `App/NotificationCenterBridge.swift` (CMD-07). macOS does NOT call `POST /api/push/subscribe`, `DELETE /api/push/subscribe`, or `GET /api/push/vapid-public-key` in MVP. The Endpoint enum keeps `case vapidPublicKey` as documentation; no call site references it. V1 may add APNs (R-10 mitigation) via server bridge column on `push_subscriptions`; not in MVP scope.
Builder action: Wire BroadcastDispatcher to call `Notifications.scheduleLocal(title:body:cardId:)` on `card.message` and `card.ai_response` events when the matching EditCard window is NOT key. Do not implement push subscribe in MVP.

### V-005 — Phase 5 vs Phase 7 NotificationBell ownership
Source veto: §7.1 CF-05 "Section 5 Phase 5 includes NotificationBell; Section 5 Phase 7 also lists NotificationBell."
Classification: Spec conflict
Resolution: Locked. Phase 5 owns the *underlying* notification plumbing — `UNUserNotificationCenter` bridge, Dock badge, NSStatusItem badge, WS-driven local-banner scheduling. Phase 7 owns the *in-app NotificationsPopover UI* (W-09) — the bell button, the popover list, mark-read interactions. §5.8 Phase 7 line item reads "NotificationBell popover UI" — not the full bell stack.
Builder action: In Phase 5 build `NotificationCenterBridge.swift`, `StatusItemController.swift`, `UnreadStore.swift`, Dock badge wiring; in Phase 7 build `NotificationBellButton.swift` + `NotificationsPopover.swift`.

### V-006 — Section naming consistency
Source veto: §7.1 CF-06 "'Section' naming: §2.4 uses Board / Knowledge / Archive as 3 sections; web's App.tsx had section: `'board' | 'knowledge' | 'archive'`."
Classification: Not a conflict (already verified)
Resolution: Use lowercase enum `enum Section { case board, knowledge, archive }` in `App/SceneRouter.swift`. Display labels capitalize ("Board", "Knowledge", "Archive"). Persistence via UserDefaults uses lowercase raw strings.
Builder action: Use the enum verbatim. Don't introduce a fourth section.

### V-007 — EditDialog window vs sheet
Source veto: §7.1 CF-07 "EditDialog as NSWindow vs NSSheet"
Classification: Spec conflict
Resolution: Locked. EditCard = NSWindow (W-02), NOT sheet. Each open card gets its own `NSWindow` instance via `EditCardWindowController(cardId:)` with `identifier = "edit-\(cardId)"` and `windowAutosaveName = "KanbanEditCard.\(cardId)"`. Re-opening the same cardId activates the existing window via `WindowCoordinator.shared.openEditCard(id:)`. Multiple cards open simultaneously is a desktop-required feature (§4.7 "Multi-window state").
Builder action: Never use `.sheet(isPresented:)` for EditCard. Always `EditCardWindowController`. Use `WindowCoordinator.shared.openEditCard(id:)` everywhere (card click, deep-link, notification tap, context menu "Open in new window").

### V-008 — Mirror View disposition
Source veto: §7.1 CF-08 "Mirror View disposition: §1.2 lists MVP 'TBD'; §2.2 lists V2."
Classification: Spec conflict
Resolution: Locked. Mirror View = V2. NOT MVP. §1.2 row #28 should read "V2 — separate Xcode target or `--kiosk` window mode". Do not build `Mirror/MirrorWindowController.swift` or `MirrorView.swift` in MVP. Mirror token CRUD UI in Preferences T3 IS in MVP (tokens are generated for use elsewhere; the kiosk surface is V2 only).
Builder action: Skip the entire `UI/Mirror/` folder in MVP. Build the Mirror Tokens section in PreferencesView T3 only — list, create, revoke.

### V-009 — App Sandbox + entitlements for MVP
Source veto: §7.1 CF-09 "Sandbox: §4.4 says NOT enabled for MVP; entitlements list `network.client = YES`. Sandbox + network client require entitlement only if sandboxed."
Classification: Spec conflict
Resolution: Locked. MVP unsandboxed (direct DMG, ad-hoc signed). The `KanbanClaude.entitlements` file still declares `com.apple.security.network.client = YES`, `com.apple.security.files.user-selected.read-only = YES`, etc. — these are inert when sandboxing is off, and forward-compatible when V2 enables sandbox for notarization. Add `com.apple.security.keychain-access-groups = [$(AppIdentifierPrefix)com.kanbanclaude.kanbanclaude]` ONLY when V2 turns on sandbox (R-05).
Builder action: Create the entitlements file with the §4.4 entries; do NOT enable App Sandbox capability in Xcode in MVP. Do NOT add the keychain-access-groups key in MVP.

### V-010 — Telegram disposition scope
Source veto: §7.1 CF-10 "Telegram identities in Preferences: §1.2 group #38 marks Telegram 🚫; §3.8 T4 includes Telegram tab."
Classification: Spec conflict
Resolution: Locked. The 🚫 covers the server-side Telegram bot (commands, capture pipeline) only. User-side Telegram identity admin (F-455..F-460) IS in MVP via Preferences T4 — list / link / unlink identities calling `GET/POST/DELETE /api/telegram/identities`. macOS never speaks to `@kanban_bot` directly.
Builder action: Build PreferencesView T4 (`UI/Preferences/TelegramTab.swift`) calling Endpoint.linkTelegram / listTelegramIdentities / unlinkTelegram. Do not implement any bot polling, webhook, or grammy logic.

### V-011 — Offline + interrupted state
Source veto: §7.2 G-01 "No backup/restore strategy for offline / interrupted state."
Classification: Missing spec (resolved in §4.5 paragraph "Offline strategy (MVP)")
Resolution: Locked. MVP: no persistent local cache. On launch without network → in-memory stores empty + "Offline — cached data" banner. All mutations require online → toast + retry on failure. V2 adds disk cache via `URLCache` + `Codable` snapshots in `~/Library/Caches/com.kanbanclaude.kanbanclaude/`.
Builder action: Implement banner via `ToastStore.shared` with persistent (non-auto-dismissing) toast variant labelled `kind: .offline`. On mutation failure with `URLError.notConnectedToInternet` or `URLError.networkConnectionLost`, surface error toast with "Retry" action that re-runs the failed mutation closure.

### V-012 — Analytics / crash reporting
Source veto: §7.2 G-02 "No analytics / crash reporting."
Classification: Process gate (deferred V2)
Resolution: Locked V2. MVP relies on `Console.app` and `~/Library/Logs/DiagnosticReports/` for crash forensics. Never add Sentry, Bugsnag, Firebase, or any SPM dep in MVP (§4.3 zero-SPM rule).
Builder action: When investigating crashes, run `Scripts/tail-logs.sh` and `ls -1t ~/Library/Logs/DiagnosticReports/KanbanClaude*.ips | head -5`.

### V-013 — Accent color override
Source veto: §7.2 G-03 "No theme accent color override (user pick)."
Classification: Process gate (deferred V2)
Resolution: Locked V2. Theme tokens fixed in MVP per §3.1.
Builder action: Do not expose accent picker in Preferences T1.

### V-014 — AI key toggle from macOS
Source veto: §7.2 G-04 "No automatic OPENROUTER_API_KEY UI — macOS user can't toggle AI."
Classification: Spec conflict (resolved: out of scope)
Resolution: Locked. AI keys live server-side in `.env`. macOS app has no UI for them. When AI is off, server returns 503 on brainstorm / chat-AI — client surfaces toast "AI is disabled on this server".
Builder action: In AiInsightsPanelView, handle 503 from POST `/api/cards/:id/insights/brainstorm` by showing the failed-state pill with text "AI is disabled on this server". Do not retry.

### V-015 — CardChain graph algorithm
Source veto: §7.2 G-05 "No CardChain native graph algorithm chosen"
Classification: Missing spec
Resolution: Native force-directed layout in `UI/Card/CardChainView.swift` via SwiftUI `Canvas`. Algorithm: Fruchterman-Reingold variant — repulsion `k = sqrt(area / nodeCount)` where area = canvas bounds; attraction along edges = `d² / k`; cool by 0.95 per tick; stop after 200 iterations or `maxDelta < 0.5 px`. Run on a background `Task.detached`, write final positions to `@MainActor` state, then `Canvas` renders. Layout runs once per `chain` payload (depth picker change → re-fetch → re-layout). WKWebView fallback is V2 only and only if Canvas hits a wall on macOS 13.3.
Builder action: Implement `CardChainLayout.swift` with the algorithm; positions are `[UUID: CGPoint]`. Pan = drag empty area mutates origin offset; zoom = `MagnificationGesture` + `⌘+`/`⌘-` shortcuts mutate scale [0.5, 2.5]. Double-click on a node opens `WindowCoordinator.shared.openEditCard(id:)`.

### V-016 — Spotlight indexing UI
Source veto: §7.2 G-06 "No Spotlight indexing UI in Preferences"
Classification: Process gate (deferred V2)
Resolution: Locked V2 per §4.6 N-25.
Builder action: Do not expose Spotlight settings in MVP Preferences.

### V-017 — Keychain migration on bundle ID change
Source veto: §7.2 G-07 "No keychain migration path between bundle ID changes"
Classification: Spec conflict (resolved: bundle ID locked)
Resolution: Locked. `kBundleID = "com.kanbanclaude.kanbanclaude"` is permanent. If it ever changes, the user re-logs in. Document in `RELEASE_NOTES.md`.
Builder action: Never branch on bundle ID. Always read from `Bundle.main.bundleIdentifier!` for runtime sanity and `kBundleID` for code that must match.

### V-018 — Sparkle update channel
Source veto: §7.2 G-08 "No update channel (Sparkle)"
Classification: Process gate (deferred V2 per §4.8)
Resolution: Locked V2.
Builder action: Do not add Sparkle SPM in MVP. Distribution = DMG hosted at `https://kanban.npalakurla.com/macos/latest.dmg` (optional V1) + GitHub Releases per §4.8.

### V-019 — Multi-account
Source veto: §7.2 G-09 "No multi-account support"
Classification: Process gate (deferred indefinitely)
Resolution: Locked. Single account per launch — matching the web app.
Builder action: Do not build account-switcher UI.

### V-020 — Sleep/wake reconnect race test
Source veto: §7.2 G-10 "No tests for sleep/wake reconnect race (event during reconnect window)"
Classification: Missing spec
Resolution: Add `WSReconnectRaceTests.swift` to `KanbanClaudeTests/`. Test matrix:
1. Inject `NSWorkspace.didWakeNotification`; assert WS task cancelled, backoff reset, reconnect attempted within 100 ms.
2. While reconnect in flight, inject a `card.updated` event into the BroadcastDispatcher input queue. Assert event applied AFTER reconnect succeeds (or dropped if disconnect lasts >5 s — server replays on reconnect anyway).
3. Two wake notifications in rapid succession → exactly one reconnect attempt.
Builder action: Add the file under §6.3 INTEGRATION TESTS table as a new row, and write the three tests using `URLProtocol` mocks per the §6.3 strategy column.

### V-021 — BUILD_CONSTANTS.md fallthrough
Source veto: §7.2 G-11 "No `BUILD_CONSTANTS.md` file in repo"
Classification: Missing spec
Resolution: File is optional. If present at repo root with the shape below, the build agent reads it FIRST and overrides §4.4 / §0 constants for the duration of that build.
```
# BUILD_CONSTANTS.md
PROD_BASE_URL=https://kanban.example.com   # overrides kProdBaseURL
DEV_BASE_URL=http://localhost:3001         # overrides kDevBaseURL
BUNDLE_ID=com.kanbanclaude.kanbanclaude    # overrides kBundleID (warning if changed)
APP_NAME=SmartKanban
URL_SCHEME=kanbanclaude
```
If absent, the defaults from §4.4 apply. Never embed secrets in this file.
Builder action: At Phase 0 start, `cat BUILD_CONSTANTS.md 2>/dev/null` — if it exists, parse `KEY=VALUE` lines and override `Constants.swift` literals. Otherwise use the defaults verbatim.

### V-022 — Font license check
Source veto: §7.2 G-12 "No detailed font license check"
Classification: Missing spec
Resolution: Bundled fonts MUST be SIL OFL or equivalent. Inter 4.0 (OFL), Spectral 2.0 (OFL), JetBrains Mono 2.304 (OFL). Place `Resources/Fonts/LICENSES.txt` containing all three license texts verbatim from upstream repos. Loaded at launch via `CTFontManagerRegisterFontsForURL` (N-23). Nunito Sans files from `web/public/fonts/` are unreferenced legacy — DO NOT carry to macOS (per §1.1).
Builder action: At Phase 0, copy Inter / Spectral / JetBrains Mono `.ttf` files into `macOS/KanbanClaude/Resources/Fonts/` and write `LICENSES.txt` with full OFL text + per-font attribution lines.

### V-023 — Notarization plan
Source veto: §7.2 G-13 "No notarization plan for Developer ID — V2"
Classification: Process gate (deferred V2 per §4.8)
Resolution: Locked V2. V2 needs a $99/yr Apple Developer ID + `xcrun notarytool` + `stapler staple`.
Builder action: Do not chase notarization in MVP. Ad-hoc sign + DMG + `xattr -cr` install instruction.

### V-024 — iCloud Drive for attachments
Source veto: §7.2 G-14 "No iCloud Drive integration for attachments"
Classification: Spec conflict (resolved: out of scope)
Resolution: Locked. Server owns attachment storage. iCloud is irrelevant.
Builder action: Never call CloudKit. Never use `NSFileManager.url(forUbiquityContainerIdentifier:)`.

### V-025 — App Sandbox migration plan for V2
Source veto: §7.2 G-15 "No App Sandbox migration plan for V2"
Classification: Missing spec
Resolution: V2 sandbox checklist — (a) enable App Sandbox capability in Xcode target. (b) add `com.apple.security.keychain-access-groups = [$(AppIdentifierPrefix)com.kanbanclaude.kanbanclaude]`. (c) verify NSOpenPanel attachment picks still work (user-selected read-only entitlement already in place). (d) verify Keychain items survive — set the access group BEFORE first sandboxed release (R-05). (e) re-test font loading via CTFontManager (paths still inside the bundle so should be fine). (f) verify URL scheme handler still fires (sandbox does not block AppleEventManager for app's own scheme). (g) verify `NSWorkspace.didWakeNotification` still arrives (it does in sandbox). (h) notarize with the entitlements file.
Builder action: Do not enable sandbox in MVP. When V2 starts, follow steps (a)–(h) in order.

### V-026 — Rule 3 cancellation enforcement (HIGH risk R-20)
Source veto: §7.3 R-20 "Cancellation cascade per Rule 3 — `async let _ =` / `.task { await heavyWork() }` ... HIGH, 100% if not followed, All endpoints 'cancelled' → empty board"
Classification: Missing spec (CI lint command)
Resolution: Add three pre-commit grep gates as `Scripts/lint-rule3.sh`:
```bash
#!/usr/bin/env bash
set -eu
SRC="macOS/KanbanClaude"
fail=0
if grep -rnE '^[^/]*async let _ *=' "$SRC" --include='*.swift'; then echo "RULE 3 violation: async let _ =" ; fail=1; fi
if grep -rnE '\.task[[:space:]]*\{[[:space:]]*await[[:space:]]+(self\.)?(refreshAll|loadAll|fetchAll)' "$SRC" --include='*.swift'; then echo "RULE 3 violation: .task { await heavyWork() }" ; fail=1; fi
if grep -rnE 'try (decoder|JSONDecoder\(\))\.decode\(\[' "$SRC" --include='*.swift'; then echo "RULE 2 violation: bare-array decode" ; fail=1; fi
exit $fail
```
Wire it into a git pre-commit hook AND a CI step. Document in `Scripts/README.md`.
Builder action: Create `Scripts/lint-rule3.sh` (chmod +x) at Phase 0. Run before every commit. If any line matches, fix per Rule 3 (use `withTaskGroup` / `Task.detached(priority:.userInitiated)`) or Rule 2 (use wrapper struct).

### V-027 — SwiftUI 13.3 NavigationSplitView mitigation (HIGH risk R-01)
Source veto: §7.3 R-01 "SwiftUI 13.3 NavigationSplitView quirks (sidebar collapse animations stutter; programmatic open) ... HIGH"
Classification: Spec conflict (mitigation already in §1.8 C1 + §3.7 V-02; lock the fallback ahead of build)
Resolution: Build `MainView` with `NavigationSplitView` first. If sidebar collapse stutters or programmatic open via `.toggleSidebar` fails on macOS 13.3 (manifests as: animation jumps to final frame; sidebar state desyncs from `NSToolbarToggleSidebarItem`), fall back to AppKit-backed `NSSplitViewController` + two `NSHostingView` panes, wrapped in `NSViewControllerRepresentable` for the SwiftUI scene. Decision point: end of Phase 4a smoke test. If the issue manifests, swap before Phase 4b.
Builder action: At Phase 4a, after MainView renders four columns, manually toggle the sidebar 5× with the toolbar button. If you see lag >100 ms or sidebar/Toolbar state mismatch, switch to the NSSplitViewController path described in §1.8 C1. Update FEATURE_PARITY_REGISTRY F-020 macOS-Impl column with `🔄 NSSplitViewController interop — 13.3 SwiftUI bug` and the reason.

### V-028 — CardTile 8 state variations enumerated
Source veto: §7.4 "CardTileView renders all 8 state variations correctly in light + dark."
Classification: Missing spec
Resolution: The 8 states derived from §3.7 V-09 are:
1. **Default** — `source == 'manual'`, no insights, no unread, no due date.
2. **Telegram-source** — `source == 'telegram'` → Telegram glyph 11 pt in header strip.
3. **AI-summarized** — latest insight `status == 'ok'` → ✨ chip bottom-left.
4. **Insight pending** — at least one `pending` insight for the card → ⏳ chip.
5. **needs_review** — `needs_review == true` → ⚠ chip.
6. **Unread chat** — `unreadCounts[card.id] > 0` → 💬 + N badge in footer.
7. **Hover** — pointer inside tile + not dragging → y=-2 px lift, shadow boost to `--sh-2`, tinted bloom overlay; respect `accessibilityReduceMotion`.
8. **Dragging** — `DragStore.activeCardId == card.id` → opacity 0.4 placeholder; ghost view follows pointer.

Each state must render correctly in both `colorScheme == .light` and `colorScheme == .dark` (so 16 snapshot variations).
Builder action: Implement snapshot tests in `CardTileViewSnapshotTests.swift` — 8 states × 2 color schemes = 16 fixtures. Use `PreviewMockData` (§4.2) to construct each state's Card + UnreadStore + InsightStore values.

### V-029 — EditCardView 12 sections enumerated
Source veto: §7.4 "EditCardView shows all 12 sections (title/status/desc/tags/due/attachments/assignees/shares/knowledge/AI/related/timeline)."
Classification: Missing spec
Resolution: The 12 sections derived from §3.7 V-10:
1. **Title** — single-line `TextField`, Inter 18 pt.
2. **Status** — 4-segment `Picker(...).pickerStyle(.segmented)` (backlog/today/in_progress/done).
3. **Description** — multiline `TextField` (axis: .vertical), Inter 13 pt, ≥120 px tall, grows on input; preserves newlines.
4. **Tags** — `PillTextField` accepting comma- or space-separated input; `#` stripped; lowercased; emits `[String]`.
5. **Due date** — `DatePicker(... displayedComponents: .date)` compact field style; nil-allowed via leading "Clear" chip.
6. **Attachments** — `LazyVGrid` 3 col (≥500 wide) / 2 col (else); 88×88 image thumbnails via `AuthenticatedImage`; file pills for non-images; trailing "+" tile invokes NSOpenPanel via CMD-06.
7. **Assignees** — pill row of `InitialsAvatar` toggle chips from `UserListStore`; replaces wholesale on PATCH (per §1.7).
8. **Shares** — same shape as Assignees + "Share now" pill button; success toast "✓ Shared".
9. **Knowledge linked items** — collapsible `DisclosureGroup`; rows show host pill + title + Remove button; trailing "+ Attach" opens `KnowledgeAttachPicker.swift`.
10. **AI Insights** — `AiInsightsPanelView` (DisclosureGroup, default expanded). Detail per V-11.
11. **Related Cards** (V1) — `RelatedCardsView`, collapsible. Hidden in MVP.
12. **Chat & Activity** — `DisclosureGroup` (default expanded) hosting `CardTimelineView` + sticky `ChatInputView` at bottom.

Builder action: Implement EditCardView as a `VStack(alignment: .leading, spacing: 16) { ... }` inside a `ScrollView`, one section per item above with a `MARK: F-NNN — <section>` per Rule 5. Section 11 wrapped in `#if FEATURE_V1` (or equivalent runtime flag) until V1.

### V-030 — Codable count audit (19 = 15 base + 3 wrappers + 1 union)
Source veto: §7.4 "APIClient + Endpoint enum + 19 Codables present (`KanbanClaudeTests/CodableMirrorTests.swift` green)."
Classification: Count mismatch (re-audited)
Resolution: 19 Codable response shapes mirror server exactly. §4.2 file list shows 15 base + BroadcastEvent (16 files); the remaining 3 wrappers live next to their related base type, not as separate files. Full breakdown:
- 15 base: `User`, `Card`, `Attachment`, `CardEvent`, `AiSuggestion`, `Template`, `KnowledgeItem`, `Insight`, `CardLink`, `Notification`, `MirrorToken`, `ApiToken`, `TelegramIdentity`, `ReviewData` (with `ReviewRow`), `WeatherData`.
- 3 envelope wrappers (server returns these shapes; client must NOT decode the inner array directly per Rule 2):
  - `KnowledgeListResponse { items: [KnowledgeItem], next_cursor: String? }` — from `GET /api/knowledge`.
  - `CardLinksResponse { links: [CardLink], related_cards: [Card] }` — from `GET /api/cards/:id/links`.
  - `CardChainResponse { nodes: [Card], edges: [CardLink], insights: [Insight] }` — from `GET /api/cards/:id/chain`.
- 1 union: `BroadcastEvent` (19 variants confirmed by `server/src/ws.ts` lines 11-28 + the `hello` first-frame at line 127).
Toast is in-memory only (§1.3) — not a Codable. `Insight.body.related_items` / `web_findings` sub-types are nested inside `Insight.swift` and counted as part of Insight.
Builder action: `KnowledgeListResponse`, `CardLinksResponse`, `CardChainResponse` go inside their related base-type Swift files. `CodableMirrorTests.swift` asserts round-trip for all 19 with one fixture each captured from a real prod response via `curl -b <cookie>`.

### V-031 — BroadcastEvent 19-variant audit
Source veto: §7.4 "WebSocketClient + 19 BroadcastEvent decoders present and tested."
Classification: Count mismatch (re-audited)
Resolution: Verified against `server/src/ws.ts` lines 11-28 and `socket.send(JSON.stringify({ type: 'hello', user_id }))` at line 127. The 19 variants:
1. `card.created` — payload `{ card: Card }`
2. `card.updated` — `{ card: Card }`
3. `card.deleted` — `{ id: string }`
4. `template.created` — `{ template: Template }`
5. `template.updated` — `{ template: Template }`
6. `template.deleted` — `{ id, owner_id, visibility }`
7. `knowledge.created` — `{ knowledge: KnowledgeItem }`
8. `knowledge.updated` — `{ knowledge: KnowledgeItem }`
9. `knowledge.deleted` — `{ id, owner_id, visibility, shares: [string] }`
10. `knowledge.link.created` — `{ knowledge_id, card_id }`
11. `knowledge.link.deleted` — `{ knowledge_id, card_id }`
12. `card.message` — `{ event: CardEvent, card_id, card: Card }`
13. `card.ai_response` — `{ event: CardEvent, card_id, card: Card }`
14. `insight.queued` — `{ insight: Insight, card_id, owner_id }`
15. `insight.updated` — `{ insight: Insight, card_id, owner_id }`
16. `insight.failed` — `{ insight: Insight, card_id, owner_id }`
17. `card.link.created` — `{ link: CardLink, from_owner_id, to_owner_id }`
18. `card.link.deleted` — `{ id, from_card_id, to_card_id, from_owner_id, to_owner_id }`
19. `hello` — `{ user_id: string }` (first frame; absence within 5 s triggers reconnect per §4.5)
Builder action: `BroadcastEventDecoder.swift` discriminates on `type`; unknown types logged + dropped (NEVER crash). `BroadcastDispatcherTests.swift` asserts all 19 round-trip from fixture JSON.

### V-032 — Confidence re-eval (Buildability ≥ 7 → 9)
Source veto: §7.5 instruction "If §7.5 Buildability would now rise to >= 7, note it."
Classification: Missing spec (re-evaluation)
Resolution: With V-001..V-031 resolved + per-state and per-section enumerations locked + Rule 3/2 CI lint commands provided, Buildability rises from 8 → 9. Risk stays 7 (R-01 and R-20 are inherent platform/discipline risks; can't drop below 7 without macOS 14 floor or compile-time enforcement). Completeness stays 9. Worst-link = Risk 7.
Builder action: Update §7.5 reading on next plan re-write only — do NOT touch MACOS_APP_PLAN.md per orchestrator constraint. This patch is the override.

---

## §B — Process Gates (Human or Build-Agent Action Required)

All §7.4 HANDOFF CHECKLIST items map here. None block Phase 0; each is a verification step at a specific phase. The build agent executes them; the human is only required for the items explicitly marked "Human pre-req".

### G-001 — Xcode 15.4+ installed (Human pre-req)
Source veto: §7.4 "Xcode 15.4+ installed; arm64 macOS 13.3 deployment target set."
Required action: `xcodebuild -version` must report `Xcode 15.4` or later. If not, install via App Store or `xcode-select`.
When needed: Before Phase 0.
Does NOT block: anything else — but Phase 0 cannot start without it.

### G-002 — Xcode project scaffolded at §4.2 structure (Phase 0)
Source veto: §7.4 "`macOS/KanbanClaude.xcodeproj` created at the structure in §4.2."
Required action: Create the project + folder hierarchy per §4.2 verbatim. Set target = macOS 13.3 arm64.
When needed: Phase 0 task 1.
Does NOT block: nothing after Phase 0 completes.

### G-003 — Bundle ID, URL scheme, entitlements (Phase 0)
Source veto: §7.4 "Bundle ID = `com.kanbanclaude.kanbanclaude`." + "URL scheme `kanbanclaude://` registered in Info.plist." + "Entitlements per §4.4 (network client; user-selected read-only)."
Required action: Info.plist `CFBundleIdentifier = com.kanbanclaude.kanbanclaude`; `CFBundleURLTypes = [{ CFBundleURLSchemes: ["kanbanclaude"], CFBundleURLName: "com.kanbanclaude.deeplink" }]`. Entitlements file per §4.4.
When needed: Phase 0.
Does NOT block: anything.

### G-004 — Fonts + LICENSES.txt (Phase 0)
Source veto: §7.4 "Fonts loaded (Inter, Spectral, JetBrainsMono); LICENSES.txt present."
Required action: See V-022 resolution. Drop `.ttf` files in `Resources/Fonts/`; write LICENSES.txt; load via N-23 in `applicationDidFinishLaunching`.
When needed: Phase 0.
Does NOT block: Phase 1 can proceed even if fonts are SF Pro fallback — but ship blocker for Phase 10.

### G-005 — Asset catalogs (Phase 0)
Source veto: §7.4 "AppDelegate orchestrates AppKit lifecycle; SwiftUI App scene declared."
Required action: Add `Assets.xcassets` with placeholder AppIcon (any 1024×1024 PNG) + `Colors.xcassets` containing the design tokens from §3.1 light + dark variants.
When needed: Phase 0.
Does NOT block: nothing.

### G-006 — Build scripts wired (Phase 0)
Source veto: §7.4 "DMG built; reinstall script tested; xattr step documented." (early prep)
Required action: Drop `Scripts/build-dmg.sh`, `Scripts/reinstall.sh`, `Scripts/tail-logs.sh`, `Scripts/api-preflight.sh`, `Scripts/lint-rule3.sh` (V-026) at Phase 0. All `chmod +x`.
When needed: Phase 0 (scaffolding); rerun at Phase 10 (actual DMG).
Does NOT block: Phase 1.

### G-007 — Phase 0 health check
Source veto: §7.4 (implicit health-check at §5.8 Phase 0)
Required action: `xcodebuild -project macOS/KanbanClaude.xcodeproj -scheme KanbanClaude build` succeeds; `open -a /Applications/KanbanClaude.app` shows empty window; `Scripts/tail-logs.sh` emits at least one line for subsystem `com.kanbanclaude.kanbanclaude`.
When needed: End of Phase 0.
Does NOT block: Phase 0 is done when this passes.

### G-008 — APIClient + 19 Codables + 19 BroadcastEvents tested (Phase 1)
Source veto: §7.4 "APIClient + Endpoint enum + 19 Codables present (...green)." + "WebSocketClient + 19 BroadcastEvent decoders present and tested."
Required action: `xcodebuild test -scheme KanbanClaude -only-testing:KanbanClaudeTests/CodableMirrorTests` AND `... -only-testing:KanbanClaudeTests/BroadcastDispatcherTests` — both green. Counts per V-030, V-031.
When needed: Phase 1.
Does NOT block: Phase 2.

### G-009 — Auth round-trip on prod (Phase 1 / 3)
Source veto: §7.4 "AuthStore + LoginView feature-complete; can log in/out against `kanban.npalakurla.com`." + "Token stored in Keychain (NEVER plaintext UserDefaults)."
Required action: Log in via the LoginView against `https://kanban.npalakurla.com` with real credentials; verify Keychain item exists via `security find-generic-password -s com.kanbanclaude.kanbanclaude -a kanban_session`. Logout deletes it.
When needed: Phase 3.
Does NOT block: nothing.

### G-010 — Main window opens + columns render (Phase 4a)
Source veto: §7.4 "Main window opens at 1280×800; toolbar with scope + search + bell + settings + profile." + "4 columns render real data from `/api/cards?scope=personal`."
Required action: Launch; verify columns Backlog/Today/InProgress/Done show cards from prod; `Scripts/tail-logs.sh` shows `loaded N cards` line within 5 s.
When needed: Phase 4a.
Does NOT block: nothing.

### G-011 — CardTile 8 states snapshot tests (Phase 4c)
Source veto: §7.4 "CardTileView renders all 8 state variations correctly in light + dark."
Required action: See V-028 — 16 snapshot fixtures pass. Compare side-by-side with web `CardView.tsx` per Rule 14.
When needed: Phase 4c.
Does NOT block: Phase 4d.

### G-012 — Drag-and-drop optimistic + WS reconcile (Phase 4b)
Source veto: §7.4 "Drag-and-drop across columns works with optimistic state + WS reconcile." + "Trash drop zone archives."
Required action: Drag a card across all 4 columns; verify card visible in new column within 500 ms; WS `card.updated` event reconciles within 1.5 s on LAN. Drag to TrashDropZone; verify archive + toast undo.
When needed: Phase 4b.
Does NOT block: Phase 4c.

### G-013 — Capture panel ⌘N + paste image (Phase 4e)
Source veto: §7.4 "`⌘N` opens Capture panel; submit creates card." + "Paste image (`⌘V` outside text field) creates card from image."
Required action: `⌘N` from main window → Capture panel; type "test" + Return → card appears in Today. With clipboard holding a PNG, `⌥⌘N` → card with image attachment + needs_review chip.
When needed: Phase 4e.
Does NOT block: nothing.

### G-014 — Finder drag-in attaches (Phase 5)
Source veto: §7.4 "Drag .png from Finder onto board creates card; onto card window attaches."
Required action: Drag a `.png` from Finder to board → POST `/api/cards/from-image`. Drag onto open EditCardWindow → POST `/api/cards/:id/attachments`. Drag `.pdf` → toast "Only images may be attached".
When needed: Phase 5.
Does NOT block: nothing.

### G-015 — EditCardWindow multi-window + 12 sections (Phase 4d)
Source veto: §7.4 "EditCardWindow opens per card; multi-window works." + "EditCardView shows all 12 sections..."
Required action: Open 3 cards via context menu; verify 3 NSWindows visible, each WS-subscribed. Verify all 12 sections per V-029 visible.
When needed: Phase 4d.
Does NOT block: nothing.

### G-016 — ⌘S / ⌘W / ⌘B + Brainstorm round-trip ≤30 s (Phase 4d)
Source veto: §7.4 "`⌘S` saves; `⌘W` closes; `⌘B` brainstorms." + "Brainstorm round-trip works ≤30 s; chips render."
Required action: Edit title, `⌘S` → PATCH succeeds; `⌘W` closes (prompt if dirty); `⌘B` → POST `/insights/brainstorm` → WS `insight.queued` → WS `insight.updated` within 30 s; suggestion chips render per V-11.
When needed: Phase 4d.
Does NOT block: nothing.

### G-017 — Timeline + @ai (Phase 4f)
Source veto: §7.4 "CardTimeline shows system, message, ai entries; ChatInput posts." + "`@ai` mention triggers server AI reply via WS."
Required action: Open card; verify entries from `/events`; post `@ai what next?` via ChatInput → WS `card.ai_response` arrives within 30 s with suggestions.
When needed: Phase 4f.
Does NOT block: nothing.

### G-018 — NotificationBell + UN banner + Dock + StatusItem (Phase 5 + Phase 7 per CF-05)
Source veto: §7.4 "NotificationBell popover opens; marks read; opens card on click." + "UN banner fires on WS message when card window NOT focused." + "Dock badge shows total unread." + "Status item shows badge; `⌘N` works from menubar."
Required action: From second account post message to a card you're assigned to; while no card window key, verify UN banner. Dock badge = total unread. NSStatusItem badge = total unread. Click bell → popover → click row → marks read + opens EditCardWindow + closes popover. Click NSStatusItem → menu with Capture entry; activating Capture opens W-03.
When needed: Phase 5 (plumbing) + Phase 7 (popover UI).
Does NOT block: nothing.

### G-019 — Knowledge CRUD (Phase 7)
Source veto: §7.4 "Knowledge list/detail/edit complete."
Required action: `⇧⌘N` → KnowledgeEditSheet → save with URL → list shows ⏳ → ✓ within 10 s. Click row → detail. Edit → PATCH; archive → DELETE soft.
When needed: Phase 7.
Does NOT block: nothing.

### G-020 — Archive sheet (Phase 8)
Source veto: §7.4 "Archive sheet works (restore, permanent delete, purge)."
Required action: `⌘3` opens W-05 sheet → archived cards listed → restore → card returns to its lane. Delete forever → confirm → row removed. Delete all → bulk purge.
When needed: Phase 8.
Does NOT block: nothing.

### G-021 — Preferences full coverage (Phase 6)
Source veto: §7.4 "Preferences (theme/account/tokens/telegram/templates) work." + "Theme follows system + override applies live."
Required action: `⌘,` → 5 tabs visible (T5 Templates is V1; mark 🔄 if deferred). T1 theme switch applies live without relaunch. T2 short_name PATCH `/auth/me`. T3 create/revoke Mirror + API tokens. T4 link/unlink Telegram identity. T5 (V1) template CRUD.
When needed: Phase 6.
Does NOT block: nothing.

### G-022 — Sleep/wake WS reconnect ≤3 s (Phase 5)
Source veto: §7.4 "Sleep/wake reconnects WS ≤3 s."
Required action: Sleep machine ≥30 s; wake; tail logs — WS reconnect within 3 s of `NSWorkspace.didWakeNotification`. Programmatic test exists per V-020.
When needed: Phase 5.
Does NOT block: nothing.

### G-023 — Multi-window restoration (Phase 5)
Source veto: §7.4 "Multi-window restores on relaunch."
Required action: Open 2 cards; quit; relaunch → both EditCardWindows reopen at last positions via NSWindow restorationClass.
When needed: Phase 5.
Does NOT block: nothing.

### G-024 — URL scheme deep link (Phase 5)
Source veto: §7.4 "URL scheme `kanbanclaude://card/<uuid>` opens window."
Required action: `open kanbanclaude://card/<valid-uuid>` from Terminal → if authed, EditCardWindow opens within 1 s; if not, Login window first then auto-open.
When needed: Phase 5.
Does NOT block: nothing.

### G-025 — All keyboard shortcuts (Phase 8)
Source veto: §7.4 "All keyboard shortcuts in §3.4 verified."
Required action: Walk the §3.4 master table top to bottom; each combo fires its expected action.
When needed: Phase 8.
Does NOT block: nothing.

### G-026 — All context menus (Phase 8)
Source veto: §7.4 "All context menus in §3.5 verified."
Required action: Right-click each surface listed in §3.5 (CardView, Column header, Knowledge row, Notification row, Attachment tile, EditCard window title) → every item appears and fires.
When needed: Phase 8.
Does NOT block: nothing.

### G-027 — Unit tests green (Phase 9)
Source veto: §7.4 "All unit tests (§6.2) pass."
Required action: `xcodebuild test -scheme KanbanClaude -only-testing:KanbanClaudeTests` exits 0. Covers all §6.2 files including V-030 / V-031 / V-020 additions.
When needed: Phase 9.
Does NOT block: nothing.

### G-028 — Integration tests green (Phase 9)
Source veto: §7.4 "All integration tests (§6.3) pass."
Required action: Run §6.3 suite via URLProtocol mock backend. Includes new `WSReconnectRaceTests.swift` per V-020.
When needed: Phase 9.
Does NOT block: nothing.

### G-029 — E2E E-01..E-14 (Phase 9)
Source veto: §7.4 "E2E suite (§6.4) E-01..E-14 pass."
Required action: `xcodebuild test -scheme KanbanClaude -only-testing:KanbanClaudeUITests` against a known prod fixture account.
When needed: Phase 9.
Does NOT block: nothing.

### G-030 — Performance benchmarks (Phase 9)
Source veto: §7.4 "Performance benchmarks (§6.6) met or documented as deviations."
Required action: Run each §6.6 metric. Document any miss in `PERFORMANCE_DEVIATIONS.md` with reason. Hard blockers: cold-launch >2.0 s on M1; binary >25 MB arm64.
When needed: Phase 9.
Does NOT block: nothing (but cold-launch >2.0 s blocks ship).

### G-031 — Accessibility (Phase 9)
Source veto: §7.4 "Accessibility checklist (§6.7) passes — VoiceOver smoke OK, Accessibility Inspector zero warnings."
Required action: Run Accessibility Inspector → zero warnings. VoiceOver: launch app, Cmd+F5, walk Tab cycle through main window + EditCardWindow.
When needed: Phase 9.
Does NOT block: nothing.

### G-032 — FEATURE_PARITY_REGISTRY ✅/🔄 (Phase 9)
Source veto: §7.4 "FEATURE_PARITY_REGISTRY.md updated: every MVP row ✅ or 🔄 with justification."
Required action: Walk registry rows per Rule 5 + Rule 9; every MVP row ends with ✅ (verb-verified) or 🔄 (adapted, with note) or 🚫 (explicit out-of-scope justification). No ❌ rows in MVP set.
When needed: end of every Phase per Rule 5; final audit at Phase 9.
Does NOT block: nothing.

### G-033 — DMG built + reinstall script tested (Phase 10)
Source veto: §7.4 "DMG built; reinstall script tested; xattr step documented."
Required action: `Scripts/build-dmg.sh` produces `./dist/KanbanClaude-<date>.dmg`. `Scripts/reinstall.sh` installs + opens. README slide in DMG explains the one-line `xattr -cr /Applications/KanbanClaude.app` (R-03).
When needed: Phase 10.
Does NOT block: nothing.

### G-034 — AGENT_LEARNINGS.md updated (every phase)
Source veto: §7.4 "AGENT_LEARNINGS.md created/updated with any incidents encountered during build."
Required action: On every incident (Rule 0 / agent-rules.md "LEARNING LOOP"), append I-N to `AGENT_LEARNINGS.md` + add RULE N to `agent-rules.md` in the same commit. Per agent-rules.md §LEARNING LOOP.
When needed: Continuous.
Does NOT block: nothing.

### G-035 — `async let _ =` ban verified (every commit + Phase 9)
Source veto: §7.4 "No `async let _ = ...` anywhere in source (`grep -rn 'async let _'` returns nothing)."
Required action: `Scripts/lint-rule3.sh` (per V-026) returns 0 matches. Run in pre-commit + CI.
When needed: Every commit; final sweep Phase 9.
Does NOT block: nothing (lint blocks the commit, not the phase).

### G-036 — `.task { await heavyWork }` ban verified
Source veto: §7.4 "No `.task { await loadAll | refreshAll | fetchAll }` (Rule 3 compliance)."
Required action: Same lint script in V-026 + G-035. Use `.onAppear { Task.detached(priority:.userInitiated) { await ... } }` instead.
When needed: Every commit.
Does NOT block: nothing.

### G-037 — Bare-array decode ban (Rule 2)
Source veto: §7.4 "No bare-array decode of envelope responses (Rule 2 compliance)."
Required action: Same lint script. If endpoint returns `{ key: [...] }`, decode the wrapper, not `[T].self`. See V-030 wrappers.
When needed: Every commit.
Does NOT block: nothing.

### G-038 — Release/Debug base URL
Source veto: §7.4 "Release configuration uses `kProdBaseURL`; debug uses `kDevBaseURL`."
Required action: Verify `#if DEBUG` branch in `Constants.swift` per §4.4. Built Release `.app` must hit `https://kanban.npalakurla.com`; Debug must hit `http://localhost:3001`.
When needed: Phase 0 (wiring) + Phase 10 (verify).
Does NOT block: nothing.

### G-039 — "loaded N cards" log within 5 s of launch
Source veto: §7.4 "Logs visible via `Scripts/tail-logs.sh`; 'loaded N cards' line present within 5 s of launch."
Required action: Add `Logger(subsystem: kBundleID, category: "store").info("loaded \(cards.count) cards")` in `CardStore.refresh(scope:)`. Verify in `Scripts/tail-logs.sh` within 5 s.
When needed: Phase 1 (logging plumbing) + Phase 4a (verify).
Does NOT block: nothing.

### G-040 — Screenshot diff vs web (Rule 14, every screen)
Source veto: §7.4 "Screenshot comparison (Rule 14) for each MVP screen vs the corresponding desktop web screen — no unjustified differences."
Required action: Per Rule 14 / agent-rules.md: `screencapture -x /tmp/macos_<screen>.png`; navigate web to same screen; capture; Read both; list every missing element; fix; re-shoot; confirm zero gaps. NEVER ask the user to verify.
When needed: At every screen ✅ in Phase 4 → Phase 8.
Does NOT block: nothing (the phase is what blocks; screenshot pass IS the phase exit criterion).

### G-041 — Container/renderX decompose (Rule 13)
Source veto: §7.4 "Container/renderX-style registry rows decomposed into per-element sub-rows BEFORE implementation (Rule 13)."
Required action: Before implementing any registry row that says "Rendered by renderX()", "Container for...", "Tile/Card/Row component", read the web render function and create per-element sub-rows in `FEATURE_PARITY_REGISTRY.md` before any Swift is written. Per agent-rules.md RULE 13.
When needed: At every Phase 4 / Phase 7 / Phase 8 screen.
Does NOT block: nothing.

### G-042 — R-03 Gatekeeper install friction documented
Source veto: §7.3 R-03 "Direct-DMG distribution Gatekeeper friction (each install requires `xattr -cr`) — MED, 100%, User confusion"
Required action: Include a README slide in the DMG explaining the one-line `xattr -cr /Applications/KanbanClaude.app`. Include a `Scripts/install-from-dmg.sh` that runs it for the user.
When needed: Phase 10.
Does NOT block: Phase 0 — purely a ship-time concern.

### G-043 — R-10 push divergence note in release notes
Source veto: §7.3 R-10 "Push fan-out divergence between web (web-push) and macOS (UN local) — MED, 60%, Notifications missed when WS disconnected"
Required action: Document in user-facing release notes: "macOS app only notifies you while connected. Mobile / browser push still works on web. V1 plans an APNs bridge."
When needed: Phase 10.
Does NOT block: Phase 0 — but visible UX risk at ship.

### G-044 — R-05 Keychain access group for V2 sandbox
Source veto: §7.3 R-05 "Keychain access group required if V2 sandbox enabled — MED, 100% V2, Token loss on app update"
Required action: Before the FIRST sandboxed V2 release, add `com.apple.security.keychain-access-groups = [$(AppIdentifierPrefix)com.kanbanclaude.kanbanclaude]` to entitlements (per V-009 / V-025). NOT in MVP.
When needed: V2 sandbox enable.
Does NOT block: anything in MVP.

### G-045 — R-04 Intel Rosetta defer
Source veto: §7.3 R-04 "Universal binary regression under Rosetta (Intel V2) — LOW, 30%, Performance"
Required action: MVP target = arm64 only. V2 considers universal binary; Rosetta test only at V2.
When needed: V2.
Does NOT block: MVP.

### G-046 — Pre-flight every endpoint client (every Phase, Rule 1)
Source veto: agent-rules.md RULE 1 (implicit gate; not in §7.4 but mandatory)
Required action: Run all four Rule 1 checks in `Scripts/api-preflight.sh` for every endpoint before writing the Endpoint case + Codable. Greps `server/src/*.ts` for the route + url_prefix + jsonify shape + matching `web/src/api.ts` call.
When needed: Every endpoint added.
Does NOT block: nothing.

### G-047 — Verb-check before every registry ✅ (Rule 9)
Source veto: agent-rules.md RULE 9 (implicit gate)
Required action: Before marking any registry row ✅, extract every action verb in the row (button/toggle/expand/swipe/drag/...); verify the Swift implementation matches per the Rule 9 table. Static `Text` for a "button" row = ❌.
When needed: Every registry status update.
Does NOT block: nothing.

### G-048 — Re-grep touched file before commit (Rule 16)
Source veto: agent-rules.md RULE 16 (implicit gate)
Required action: Before `git commit` on any file touched (via Edit/Write), re-grep the whole file for active banned patterns (Rule 3 `async let _ =`, Rule 3 `.task { await loadAll }`, Rule 2 bare-array decode). Fix any live match in the SAME commit. Mention the cleanup in the commit message.
When needed: Every commit.
Does NOT block: nothing.

### G-049 — Screen-lock pre-flight (Rule 17)
Source veto: agent-rules.md RULE 17 (implicit gate for any audit script)
Required action: Before any audit script that uses synthetic mouse events (`osascript "tell System Events to click"`, `Quartz.CGEventPost`), check `CGSessionCopyCurrentDictionary().get("CGSSessionScreenIsLocked")` and abort if `True`. Use `caffeinate -dimsu sleep 3600 &` for long unattended runs.
When needed: Phase 9 visual audits.
Does NOT block: anything earlier.

### G-050 — Never reload authenticated web reference window (Rule 18)
Source veto: agent-rules.md RULE 18 (implicit gate for screenshot comparison work)
Required action: Never `tell active tab to reload` or `set URL of active tab to` on the authenticated `extended.npalakurla.com` / `kanban.npalakurla.com` window. Use SPA nav (`window.nav('dashboard')` or `location.hash = '#dashboard'`). Probe `body.className` + `.nav-item.active` after every nav.
When needed: Any time Rule 14 screenshot diff against the live web is run.
Does NOT block: anything earlier.

### G-051 — Container row decompose recap (Rule 13 + §7.4 last line)
Source veto: §7.4 "Container/renderX-style registry rows decomposed into per-element sub-rows BEFORE implementation (Rule 13)."
Required action: Same as G-041. Listed twice in §7.4 to lock the priority — registry decomposition IS the per-screen implementation plan.
When needed: Every Phase 4 / 7 / 8 screen.
Does NOT block: nothing.

### G-052 — Final per-screen screenshot diff (Phase 8 last line)
Source veto: §5.8 Phase 8 "Final per-screen screenshot diff (Rule 14)."
Required action: After every Phase 8 polish item ships, screen-diff every MVP screen vs web one last time. Any gap → back to that phase.
When needed: end of Phase 8.
Does NOT block: nothing earlier.

### G-053 — Tag v1.0.0 + release notes (Phase 10)
Source veto: §5.8 Phase 10 "Tag `v1.0.0` on git. Hand-off doc updated."
Required action: `git tag v1.0.0` + push; write `RELEASE_NOTES.md` covering install path (xattr step), push divergence (G-043), known limitations (no Mirror, no Templates if Templates kept at V1, no APNs).
When needed: Phase 10.
Does NOT block: anything earlier.

---

## §C — Builder Quick Reference

- W-03 Capture = NSPanel `.nonactivatingPanel`, level `.floating`, `becomesKeyOnlyIfNeeded = true`; `⌘N` via NSMenu in MVP, Carbon hotkey V1.
- Shortcuts: `⌘1/⌘2/⌘3` = Board/Knowledge/Archive; `⌃⌘P/I/A/H` = scope; `⌘⇧1..⌘⇧4` = columns.
- QR = client-side `CIQRCodeGenerator` via CMD-17 only; `Endpoint.cardQR` unused.
- Push = WS-driven `UNNotificationRequest` only; do NOT call `/api/push/subscribe`.
- Phase 5 builds notification plumbing; Phase 7 builds the bell popover UI.
- EditCard = NSWindow (W-02), one per cardId, identifier `"edit-\(cardId)"`; never a sheet.
- Mirror View = V2 only; Mirror Tokens CRUD in Preferences T3 is MVP.
- App Sandbox OFF for MVP; entitlements file still declares network.client + user-selected read-only.
- Telegram = identity CRUD in Preferences T4 (MVP); bot/server commands 🚫.
- Offline = no disk cache MVP; banner + retry toast; V2 adds URLCache.
- Analytics / Sparkle / iCloud / multi-account / accent picker / Spotlight = all V2+.
- CardChain graph = native SwiftUI `Canvas` + Fruchterman-Reingold (V-015 spec); WKWebView only as V2 fallback.
- BUILD_CONSTANTS.md optional override file — parse at Phase 0 if present (V-021 spec).
- Fonts = Inter, Spectral, JetBrains Mono (OFL); ship `Resources/Fonts/LICENSES.txt`.
- V2 sandbox migration follows V-025 checklist (a–h); set keychain-access-groups BEFORE first sandboxed ship.
- Rule 3 lint: `Scripts/lint-rule3.sh` in pre-commit + CI; bans `async let _ =`, `.task { await loadAll/refreshAll/fetchAll }`, bare-array decode.
- 19 Codables = 15 base + 3 envelope wrappers (KnowledgeListResponse, CardLinksResponse, CardChainResponse) + BroadcastEvent union.
- 19 BroadcastEvent variants = 18 from `server/src/ws.ts` lines 11-28 + `hello` first frame at line 127.
- CardTile 8 states: default / telegram-source / ai-summarized / insight-pending / needs-review / unread-chat / hover / dragging — each × light × dark = 16 snapshots.
- EditCardView 12 sections: title, status, description, tags, due, attachments, assignees, shares, knowledge, AI insights, related (V1 hidden in MVP), chat & activity.
- Pre-flight every endpoint via Rule 1 four-check `Scripts/api-preflight.sh` before any Codable/Endpoint case.
- Verb-check every registry row before ✅ (Rule 9).
- Re-grep whole file for banned patterns before every commit (Rule 16).
- Screenshot-diff every screen vs web before ✅ (Rule 14).
- Decompose container/renderX rows BEFORE implementing (Rule 13).
- For audit scripts using synthetic clicks, pre-flight `CGSSessionScreenIsLocked` (Rule 17).
- Never reload the authenticated web reference tab (Rule 18); use SPA `nav()`/hash only.

✅ VETO_RESOLUTION_PATCH.md written
📊 Resolved: 33 | Process gates: 55
STAGE_COMPLETE: vetoes_resolved=33 process_gates=55
