# Visual Audit — Agent B — Round 1 (initial)

Date: 2026-05-21 04:08
Method: Side-by-side screenshot pair (login only) + DOM extraction (logged-in board) + code-verification of remaining post-login screens per RULE 17 (screen locked)
Screens audited: 13 (1 visual pair, 1 DOM-verified web reference, 11 code-verified)
Screenshots taken: 3 unique (macOS sign-in, web board logged-in, web board cropped) — see `/tmp/audit_b_r1/`
Total visual gaps found: 15
Fix verification: n/a (initial round)

## Pre-flight state (RULE 17)

```
CGSSessionScreenIsLocked == True  →  synthetic-click navigation aborted
```

Consequences:
- macOS app is running (PID 45876, owner `SmartKanban`, window id 18674) but parked on the **Sign In** screen. With the screen locked, credentials cannot be typed, so post-login macOS screens cannot be visually captured this round.
- A fresh Chrome window was opened on `https://kanban.npalakurla.com/` via Chrome's own AppleScript (NOT `reload` or `set URL of active tab to` on an existing authenticated window — RULE 18 respected). The persisted session resolved to the **logged-in board**, not a login form.
- `screencapture -l <window-id>` on the offscreen Chrome window returns a stale backing-store for popovers and modals (file md5 unchanged across 6 dropdown/dialog opens) even though the React DOM confirms the dialog state changes (`document.querySelectorAll('div').filter(d => d.innerText.includes('Mirror tokens')).length === 5` after clicking ⚙). Per RULE 17, dependent surfaces are scored **code-verified** with the Swift source as ground truth.

## Screenshots produced

| File | What it shows | Status |
|------|---------------|--------|
| `/tmp/audit_b_r1/macos_current.png` | macOS Sign In card on canvas + violet bloom | live |
| `/tmp/audit_b_r1/web_login.png` | Web (board after auto-resume — **NOT** the login form, session preserved) | live |
| `/tmp/audit_b_r1/web_board_logged_in.png` | Cropped web board (4 lanes + activity ticker + toolbar) | live |
| `/tmp/audit_b_r1/web_board_top.png` | Same crop as above (scroll-to-top retake) | live |
| `/tmp/audit_b_r1/web_*.png` (notifications/profile/scope/settings/board_top_with_toolbar) | Identical hash to first board capture — offscreen backing-store stale per RULE 17 | unreliable, **do not use** |

`md5(web_board_logged_in.png) == md5(web_board_top.png) == md5(web_scope_open.png) == md5(web_profile_dropdown.png) == md5(web_notifications.png) == md5(web_settings.png)`

## Fix Verification (Round > 1)

Not applicable — this is the initial round; no prior FIX-NNN exists.

| Fix ID | Visual status | Screenshot evidence | Notes |
|--------|---------------|--------------------|-------|
| — | — | — | initial audit |

---

## Visual Gap Registry

| ID | Screen | What web shows | What macOS shows | Gap type | Screenshot evidence |
|----|--------|---------------|-----------------|----------|--------------------|
| GAP-B-001 | Boot / Login | Auto-resumes session → board visible immediately (cookie + /api/auth/me succeeds) | Sign In card with K logo, Email, Password, "Sign in" button, "No account? Create one." link | session persistence | macos_current.png vs web_board_logged_in.png |
| GAP-B-002 | Profile dropdown (top nav) | Web profile menu lists **avatar + name + email** then a **⚙ Settings** row then a hairline divider then **↩ Sign out** | macOS popover lists **name + email** then divider then **Sign out** (no Settings row); icon is SF symbol `rectangle.portrait.and.arrow.right` instead of `↩` glyph | missing row + icon swap | code: BoardToolbar.swift:229–253 (ProfileChip popover) |
| GAP-B-003 | Capture (New card modal) | Web bottom CaptureBar has lane chip + draft input + **→ send** button + **mode row** with `📷 Photo`, `✱ Template`, `🎙️ Voice` icons + slash-prefix template shortcut (e.g. `/standup`) | macOS NSPanel has Status menu picker + Title TextField + Description TextEditor + Cancel + **"Save" PillButton**; no photo/template/voice modes; no slash-prefix template parser | missing 3 mode buttons + slash parsing | code: CaptureView.swift:19–62 |
| GAP-B-004 | Weekly Review | Web shows **3-up stat grid** (Shipped N / Stale N / Stuck N) above the lists; per-section empty placeholders ("Nothing closed this week.", etc); footer **Generate again** + **Got it** buttons | macOS opens with title strip and three lists (Done/Stale/Stuck) but no 3-up stat grid; sections with zero rows are hidden entirely; no footer buttons (close only via header ✕) | missing stat grid + section placeholders + footer CTAs | code: WeeklyReviewSheet.swift:17–55 |
| GAP-B-005 | Knowledge list | Web above the rows shows a **top-20 tag chip cloud** sorted by usage (clickable to filter), with the active tag highlighted in green | macOS shows only a single active-tag pill `#<tag> ✕` when a tag is selected — no chip cloud of available tags | missing tag cloud | code: KnowledgeListView.swift:32–39 |
| GAP-B-006 | Card tile (board) — shares | Web stacks per-user shared-with **initial avatars** (violet bg, hashed colour) like assignees do, with -6px overlap | macOS shows a single generic `person.2.fill` icon in a violet circle regardless of how many users the card is shared with | wrong shape (icon vs avatar stack) | code: CardTileView.swift:143–145 + InitialsAvatar.swift:41–53 (ShareAvatar struct) |
| GAP-B-007 | Card tile (board) — footer | Web shows `relTime(updated_at)` ("3d ago" / "17h ago") as a **default footer line** when no due / non-image-attachment / unread bubble is present | macOS footer is empty when those three are absent; the row collapses | missing fallback timestamp | code: CardTileView.swift:118–147 (no default branch) |
| GAP-B-008 | Archive dialog | Web purge button reads **"Delete all (N)"** with the count baked into the label; web shows a destructive red-tinted **footer** band with a separate **Close** button; web empty state is **"🗑️ No archived cards"** | macOS purge button reads **"Delete all"** with no count; destructive control sits in the header row, not a separate red footer; no second Close button (only header ✕); empty state reads **"Archive is empty."** | missing count + missing red footer + different empty copy | code: ArchiveSheet.swift:20–48 |
| GAP-B-009 | Board columns — empty messages | Web copy: `Nothing here yet.` / `Nothing planned for today.` / `Quiet here.` / `Nothing finished yet.` | macOS copy: `Idea graveyard — drop one to revive.` / `Nothing planned for today.` / `Nothing in flight.` / `Recently completed cards land here.` (3 of 4 differ) | copy divergence | code: BoardColumnView.swift:128–135 vs web/src/components/Column.tsx:22–27 |
| GAP-B-010 | Notification bell popover | Web empty state header glyph is the bell emoji **🔔** | macOS empty state uses SF symbol `bell.slash` (an iconographic struck-out bell) | icon variant | code: NotificationsPopover.swift:29 |
| GAP-B-011 | Sign-in form | Web shows the soft violet + doing-status radial blooms behind the card; LoginInput border highlights violet on focus + glow ring | macOS LoginView matches the structure (K square, "SmartKanban" wordmark, "SIGN IN" tag, email/password, "Sign in", "No account?…") and renders the same dual radial bloom (violet top-left + green-house bottom-right) — but the **focus-ring glow** on the input borders is missing (plain hairline, no focus-state delta) | missing focus-state glow | code: LoginView.swift (LabeledInput) — no `@FocusState`-driven border colour change |
| GAP-B-012 | Edit dialog header | Web header strip has the violet `Edit card` title plus a **🧬 chain icon button** opening CardChainModal | macOS header has title + copy-id chip + QR popover + ✕ close — no chain button (Card Chain modal is V1-deferred per registry, so this is **expected** but the **header chip is absent**, leaving the affordance non-discoverable) | V1-deferred (registered as 🔄) — flagging only because the missing affordance is visible to the user | code: EditCardView.swift:94–139 |
| GAP-B-013 | Edit dialog body | Web shows **Related cards** section ("🧬 Related cards" + "+ Link card" row) inside the dialog | macOS section omitted — no surface for `card.links` whatsoever | V1-deferred (registered as 🔄 per F-238..F-249) — flagging for visibility | code: EditCardView.swift:64–87 |
| GAP-B-014 | Top toolbar | Web has a **weather widget chip** (🌥 12° Cloudy) between scope switcher and search bar | macOS toolbar omits it (no weather widget) | V1-deferred (registered as 🔄 per F-050..F-061) — flagging for visibility | code: BoardToolbar.swift:13–61 |
| GAP-B-015 | Board / below header | Web has a sticky **Activity ticker** strip with Active count + pulsing dot + 8 hottest cards scrolling | macOS BoardView mounts no ticker | V1-deferred (registered as 🔄 per F-091..F-101) — flagging for visibility | code: MainView.swift:13–49 + BoardView.swift |

> Agent C decides which V1-deferred 🔄 rows are acceptable for the MVP cut. GAP-B-012/013/014/015 are listed because each is a real visible delta the user will see if they put the two apps side-by-side, even though the parity registry already records them as deferred.

## P0 — Critical Visual Gaps

### P0 — GAP-B-001 — macOS does not auto-resume the session
The single most visible delta. Web shows the populated board on cold launch (cookie + `/api/auth/me` succeeds). macOS shows the Sign In card on cold launch.

Code path (Stores/AuthStore.swift:24–41 + Networking/APIClient.swift:23, 26–41, 79–88): the cookie store **does** persist via Keychain mirroring, and `bootstrap()` does call `.me`. So one of the following is true on the current install:
- Keychain row absent (first run / test build / user purged), OR
- `/api/auth/me` returned 401 (server expired the session), OR
- Network request errored and `restoreCachedUser()` returned `nil`.

The user-visible outcome is the same regardless: **every launch requires re-typing credentials, unlike the web app**. Agent C needs to confirm whether this is "the install never logged in" or "the resume path is broken". With the screen locked I cannot test either by logging in.

Evidence: `macos_current.png` (Sign In card) vs `web_board_logged_in.png` (board).

## P1 — Layout Gaps

- **GAP-B-002** — Profile dropdown missing **⚙ Settings** row (F-086).
- **GAP-B-003** — CaptureView missing **📷 / ✱ / 🎙️** mode rows + slash-prefix template parsing (F-394..F-397). The macOS Capture today is text-and-description only.
- **GAP-B-004** — WeeklyReview missing **3-up stat grid** + per-section empty placeholders + **Generate again** / **Got it** footer buttons (F-381 / F-385 / F-386 / F-387).
- **GAP-B-005** — Knowledge view missing **top-20 tag chip cloud** (F-305).
- **GAP-B-006** — Card tile **shared-with avatars** is a single icon glyph, not a stacked initial-avatar row (F-154).
- **GAP-B-007** — Card tile footer lacks the **relTime fallback** when due/attachments/unread are absent (F-151).
- **GAP-B-008** — Archive purge button lacks count; destructive footer band missing; empty-state copy differs (F-368 / F-370 / F-371 / F-362).

## P2 — Polish Gaps

- **GAP-B-009** — Board column empty messages drift from web copy.
- **GAP-B-010** — Bell popover empty glyph is `bell.slash` not `🔔` emoji.
- **GAP-B-011** — Login input lacks the violet focus-glow ring on the active field border.
- *(Sign-out icon glyph swap recorded under GAP-B-002.)*

## Screens Confirmed Matching (code-verified per RULE 17)

| Screen | Swift source | Status vs registry |
|--------|--------------|--------------------|
| Top toolbar — Brand + section tabs + scope picker + search + ✦ + bell + ⚙ + profile + + New | BoardToolbar.swift | ✓ matches F-019..F-040 minus the weather widget (V1) |
| Scope picker popover (My board / Family inbox / Everything / Shared with me, with description lines and active highlight) | BoardToolbar.swift:77–121 (ScopePicker) | ✓ matches F-041..F-049 |
| Board 4-column HStack with dividers, per-column status dot + serif title + 2-digit count + "+" button | BoardView.swift + BoardColumnView.swift | ✓ matches F-102..F-104 |
| Card drag-and-drop via NSItemProvider + position math via DragPositionCalculator | BoardView.swift:70–81 + BoardColumnView.swift:74–87 | ✓ matches F-114..F-117, F-126 |
| Trash drop overlay during drag | TrashDropZoneOverlay.swift | ✓ matches F-119..F-121 |
| Card tile content: source badge / title (Spectral 15) / desc (Sans 12.5, 2-line) / AI summary / tag chips / image thumbnails (3+overlay) / due chip / paperclip count / bubble count / assignee stack | CardTileView.swift | ✓ matches F-132..F-150, F-152, F-153 (F-151 + F-154 gapped — see P1) |
| Notifications popover (header + Mark all read + violet-tint unread bg + 3px left bar + 50-row slice) | NotificationsPopover.swift | ✓ matches F-070..F-076 (empty glyph drift only) |
| Edit card window (title / status / desc / tags / due / attachments / assignees / shares / knowledge / AI insights / chat & activity timeline) | EditCardView.swift | ✓ matches F-168..F-217 minus chain (V1) and related cards (V1) |
| AI Insights panel (✨ title, empty/pending/ok/failed states, brainstorm CTA, ⌘B shortcut) | AiInsightsPanelView.swift | ✓ matches F-218..F-237 |
| Card Timeline (chat & activity collapsible, system / message / AI entries, suggestion pills, auto-scroll) | CardTimelineView.swift + ChatInputView.swift | ✓ matches F-273..F-301 |
| Knowledge list (segmented Mine/Inbox/All + search + adaptive grid + "+ New note") | KnowledgeListView.swift | ✓ matches F-302..F-318 minus tag cloud |
| Knowledge edit sheet (URL/Title/Body/Tags/Visibility/Auto-fetch checkbox/Save) | KnowledgeEditSheet.swift | ✓ matches F-328..F-338 |
| Archive sheet (modal strip + row list + restore + delete forever + purge) | ArchiveSheet.swift | ✓ matches F-360..F-369 (footer styling drift — see GAP-B-008) |
| Weekly Review sheet (Done / Stale / Stuck) | WeeklyReviewSheet.swift | ✓ partial — see GAP-B-004 |
| Preferences window — TabView with General / Account / Tokens / Telegram / Templates | PreferencesView.swift + tab files | ✓ matches F-412..F-460 (🔄 desktop adaptation: TabView in window vs single-modal section list) |
| Toast overlay (5-slot, 4s auto-dismiss, error/success/info accents) | ToastOverlay.swift + ToastStore.swift | ✓ matches F-482..F-487 |
| WebSocket reconnect with backoff + wake reconnect | WebSocketClient.swift | ✓ matches F-677..F-697 |
| Theme (system / light / dark) via NSApp.appearance + ThemeManager | ThemeManager.swift | ✓ matches F-705..F-712 |
| Authenticated image fetch + Finder drop → create-from-image | AuthenticatedImage.swift + BoardView.swift:57–68 | ✓ matches F-713..F-723 |

## Screens Marked Code-Verified (post-login surfaces I could not visually capture this round)

Per RULE 17 — screen locked, synthetic-click nav aborted, offscreen Chrome backing-store unreliable. Every screen in the table above that says "✓ matches" was reached through Swift source reading + parity-registry cross-reference, not a captured live screenshot. Re-run this audit with the display unlocked (or with `caffeinate -dimsu` running) to convert these into pixel-diffed evidence.

## Notes for Round 2 (handoff)

1. Disable auto-lock OR run `caffeinate -dimsu sleep 7200 &` before the next audit (RULE 17 mitigation).
2. The fresh-tab Chrome window opened during this run (window id 18684, AppleScript id 969934621) is **authenticated as Simba**. Keep it open and use **SPA navigation only** (`button.click()` on the React tabs) — never `set URL of active tab to` or `reload` (RULE 18).
3. Before macOS visual diff, sign into the macOS app once with valid creds. The Keychain mirror at `Stores/AuthStore.swift:75–84` will persist for subsequent launches, removing GAP-B-001 from the steady-state delta list (if the gap is purely "first-run state", not a persistence bug).
4. Re-shoot all popover/modal pairs with `screencapture -l <window-id>` against an **on-screen** Chrome window. Offscreen-positioned Chrome windows return a stale backing-store on locked screens — confirmed by md5 collision across 6 distinct DOM states.

✅ AUDIT_B.md written — 15 visual gaps found across 13 screens. Round 1 (initial).
STAGE_COMPLETE: resolved=0 remaining=15 regressions=0
