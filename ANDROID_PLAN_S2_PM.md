# ANDROID PLAN — STAGE 2: PM (Product Plan)

Upstream: `ANDROID_PLAN_S1_ANALYST.md` (51 routes, 18 tables, 19 WS events,
499 feature rows F-001..F-1064). All decisions below are *forward-only* —
Stages 3..7 should treat this document as binding unless they document a
deviation with a rationale.

Status legend (per `agent-rules.md` and §3 below):

- ✅ **MVP** — Release 1; identical behavior to PWA, native idioms.
- 🔄 **V1 adapted** — Release 1 or 2; ships but adapted to native (justified).
- ⏳ **V2** — Deferred; ships in a later release.
- 🚫 **Out-of-scope** — Never ships native (justified).

---

## 1. Product Hypothesis & Positioning

### 1.1 Why a native Android app when a PWA already works

The PWA shell (`MobileShell.tsx` + `MobileCardView.tsx`) is genuinely usable on
Android, but a native app unlocks capabilities the PWA cannot reach on Android
in 2026:

| Capability | What native unlocks |
|---|---|
| **Background push reliability** | Web Push via Chrome works but is throttled when Chrome is idle/sleeping or when the user uses a different default browser. FCM is OS-level and survives Chrome being killed. |
| **Share intents from any app** | PWA Web Share Target requires Chrome to handle the intent. Native registers `ACTION_SEND` so SmartKanban appears in the system share sheet for every app (browsers, photo gallery, Telegram, Files). |
| **Voice capture via system mic** | PWA has a `MediaRecorder` ceiling and inconsistent mic permissions; native gets full `AudioRecord` + can keep recording with screen off (foreground service). |
| **Biometric unlock** | `BiometricPrompt` for app re-auth — PWA cannot. |
| **App Links / deep links** | `https://kanban…/m/card/<uuid>` opens the native app directly (verified statement list) instead of bouncing through Chrome. Custom scheme `smartkanban://card/<id>` as fallback. |
| **Offline draft queue** | Native can queue captured text/photos/voice while offline and replay on reconnect; the PWA today drops on send-failure. |
| **Widgets** (V2) | Home-screen widget for Today lane / quick capture FAB. PWA cannot do this on Android. |
| **Faster cold start** | Compose UI starts in ~300 ms; PWA cold start through Chrome routinely hits 2-3 s before the SPA shell paints. |
| **No install-prompt friction** | `beforeinstallprompt` is a banner inside a browser tab; a native APK installed from Play Store gets the OS launcher icon and is "an app" to the user. |
| **System integrations** | App Shortcuts (long-press launcher → Quick capture), Live Notifications (Android 14+), Quick Settings tile (V2). |

### 1.2 One-sentence promise

> **SmartKanban for Android is the friction-free capture surface for everything
> on your phone — share intents, photos, voice, and quick text — that lands
> instantly into your shared family board and survives Chrome being killed.**

The PWA remains the answer for any user who refuses installs; the native app
exists for the **capture + push + share-target** axis where Chrome on Android
is structurally weaker.

---

## 2. Target User & Top Jobs-to-be-done

### 2.1 Persona

**The Personal-Knowledge Operator with a family inbox.**

- One adult power-user (the npalakurla account) who runs the board daily as
  a true PKM system: backlog, today, in-progress, done, weekly review, AI
  brainstorm, knowledge base.
- 1-4 family members (spouse + kids + Telegram-only collaborators) who
  occasionally write to the **Family Inbox** (unassigned card = visible to
  everyone, per §5.7 visibility predicate) or via the Telegram bot.
- Trust model is **household** (`OPEN_SIGNUP=false` after first user). Native
  app is therefore single-tenant-feeling but multi-user-aware (assignees,
  shares, mentions).
- Phone-first. Existing PWA mobile shell is already the dominant daily-use
  surface; the desktop board is for weekly review and long edits.

### 2.2 Top 5 JTBDs (ordered by frequency × pain)

| # | Job | Trigger | Action | Success criterion |
|---|---|---|---|---|
| 1 | **Capture an idea before I forget it.** | Walking, in a meeting, hands free → "I just thought of X." | Open app (1 tap from launcher) → tap FAB → type or dictate one line → Send. | Card visible in Today lane on the board WS-replicated to desktop within 2 s of send. |
| 2 | **Save a URL someone DM'd me without losing context.** | A friend shares an article in Telegram/Discord/WhatsApp. | Share intent → SmartKanban appears in share sheet → tap → AI proposes title + tags → confirm. | Knowledge item created with `source='share_target'`, AI title accepted within one tap, no app-switching required. |
| 3 | **Photo of a receipt/whiteboard/business-card to triage later.** | "Snap this before I leave." | FAB → Camera mode → shutter → preview → Vision AI proposes title → Confirm. | Card created with `needs_review=TRUE`, photo attached, title auto-filled within 4 s of shutter. |
| 4 | **Plan my morning — move yesterday's stragglers across lanes.** | Standing at the espresso machine, 2 min window. | Open app → board → long-press card → "Move to Today" / "Move to In Progress" → repeat for 3-5 cards. | Each move ≤ 2 taps, optimistic UI, WS reconciles within 200 ms, no manual refresh needed. |
| 5 | **@ai, what should I do with this card?** | Mid-day, a stale card resurfaces in the timeline. | Open card from notification → chat tab → type "@ai how do I unblock this?" → wait → tap suggestion chip ("Set due date 2026-05-22"). | Server fires `processCardChatAI` async, suggestion chip arrives via `card.ai_response` WS within ~8 s, tapping chip PATCHes the card without leaving thread. |

---

## 3. Android Parity Matrix

Per RULE 13, container rows (e.g. "MobileShell mounts CaptureBar") are NOT
collapsed — every F-NNN is classified individually. Rationale uses these
shorthand reasons:

- **R1 native idiom** — replaced with platform-native control (e.g. system
  date picker instead of `<input type=date>`).
- **R2 backend-only** — server-side feature, no native client work needed
  beyond consuming the API.
- **R3 web-only** — bound to browser APIs (Service Worker, beforeinstallprompt,
  ⌘K). Direct port is impossible or pointless.
- **R4 kiosk** — Mirror is a desktop-screen display surface; no phone analog.
- **R5 deferred** — viable but cut from MVP to ship faster.
- **R6 expensive** — non-trivial native work; punted to V2 unless cheap.

### 3.1 LoginView (`/`)

| F-NNN | Element | Decision | Native treatment |
|---|---|---|---|
| F-001 | Brand mark "K" + title | ✅ MVP | `LoginScreen` `@Composable`, Spectral + Inter via downloadable fonts. |
| F-002 | Mode label "SIGN IN / CREATE ACCOUNT" | ✅ MVP | Caption above form, mono font. |
| F-003 | Radial blooms backdrop | 🔄 V1 | Compose `drawBehind` radial gradient; respect dark theme. |
| F-004 | Full name field (register) | ✅ MVP | `OutlinedTextField`, `imeAction=Next`. |
| F-005 | Short name field (max 16) | ✅ MVP | `OutlinedTextField` with `maxLength=16`. |
| F-006 | Email field | ✅ MVP | `OutlinedTextField`, `KeyboardType.Email`. |
| F-007 | Password field (min 6) | ✅ MVP | `OutlinedTextField`, `KeyboardType.Password`, visualTransformation. |
| F-008 | Inline error banner | ✅ MVP | `AnimatedVisibility` snackbar-style. |
| F-009 | Submit button | ✅ MVP | `Button`, disabled while busy, shows progress. |
| F-010 | Mode toggle | ✅ MVP | `TextButton` flips local state. |
| F-011 | Safe redirect after sign-in | 🔄 V1 | Navigate to deep-link target if app was opened via App Link; else Board. |

### 3.2 BoardHeader (sticky top, desktop)

| F-NNN | Element | Decision | Native treatment |
|---|---|---|---|
| F-020 | Sticky blurred header | 🔄 V1 | `TopAppBar` with blur — native equivalent is `Surface` with alpha + `RenderEffect.createBlurEffect` (API 31+). |
| F-021 | Brand badge + title | ✅ MVP | TopAppBar title slot. |
| F-022 | View tabs (board/knowledge/archive) | 🔄 V1 | Replaced by bottom navigation (MobileShell pattern). Top tabs not native idiom on phone. |
| F-023 | Scope switcher trigger | ✅ MVP | TopAppBar action → opens `ModalBottomSheet`. |
| F-024 | Scope popover items (4 scopes + counts) | ✅ MVP | Sheet rows with count badges. |
| F-025 | Click-outside dismiss | ✅ MVP | Bottom sheet native dismiss. |
| F-026 | Weather chip | ⏳ V2 | Not core to capture; weather is decorative. |
| F-027 | Search input | ✅ MVP | TopAppBar leading slot collapses search field. |
| F-028 | ⌘K hint chip | 🚫 R3 | No keyboard shortcut surface on phone. |
| F-029 | Weekly-review "✦" button | ⏳ V2 | Cut from MVP — review is a desktop ritual. |
| F-030 | NotificationBell mount | ✅ MVP | TopAppBar action; opens drawer/sheet. |
| F-031 | Settings "⚙" button | ✅ MVP | TopAppBar overflow → SettingsScreen. |
| F-032 | Profile dropdown trigger | 🔄 V1 | Avatar in TopAppBar opens bottom sheet (DropdownMenu on phone is awkward). |
| F-033 | Profile name + email | ✅ MVP | Sheet header. |
| F-034 | Profile → Settings row | ✅ MVP | Sheet row. |
| F-035 | Profile → Sign out row | ✅ MVP | Sheet row. |
| F-036 | Click-outside dismiss | ✅ MVP | Sheet native dismiss. |

### 3.3 Board (4-column kanban — desktop)

| F-NNN | Element | Decision | Native treatment |
|---|---|---|---|
| F-050 | 4-column grid | 🔄 V1 | On phone: single visible lane + horizontal swipe between lanes (mirrors `MobileShell` F-669). 4-column visible only on tablet (V2). |
| F-051 | DnD PointerSensor (4 px) | 🔄 V1 | Replaced by long-press-and-drag via `Modifier.dragAndDropSource` + `ItemTouchHelper`-style reorder. Activation = long-press (default 500 ms, matches PWA). |
| F-052 | DragOverlay ghost card | 🔄 V1 | Compose drag overlay with 0.4 alpha; identical visual. |
| F-053 | Cross-column drag-and-drop | 🔄 V1 | Long-press card → drag to other lane via swipe (cross-lane drop zones on edges) OR via long-press → bottom sheet "Move to…" (F-679 pattern). Both supported. |
| F-054 | Intra-column reorder | 🔄 V1 | Drag handle reveal on long-press; reorder within `LazyColumn`. |
| F-055 | Drag-to-trash deletion | 🔄 V1 | Trash zone appears as floating chip during drag (mirrors F-840). |
| F-056 | Search filter | ✅ MVP | Local filter on cached card list. |
| F-057 | "+" FAB (desktop ≥md) | ✅ MVP | `FloatingActionButton` always visible on phone. |
| F-058 | TrashDropZone (visible during drag) | 🔄 V1 | Same as F-055. |

### 3.4 Column (per status lane)

| F-NNN | Element | Decision | Native treatment |
|---|---|---|---|
| F-070 | Lane container w/ status bloom | ✅ MVP | `Surface` with radial gradient background. |
| F-071 | Lane header dot (accent color) | ✅ MVP | `Box` with accent. |
| F-072 | Lane title (Spectral serif) | ✅ MVP | `Text` with Spectral font. |
| F-073 | Lane count pill (mono) | ✅ MVP | `Badge` with JetBrains Mono. |
| F-074 | "+" lane-add button | ✅ MVP | IconButton in lane header; opens CaptureBar pre-set to that lane. |
| F-075 | Drop-target highlight ring | ✅ MVP | Animated `Modifier.border` color. |
| F-076 | SortableContext (intra-lane) | 🔄 V1 | See F-054. |
| F-077 | Empty-lane italic message | ✅ MVP | `Text` with `FontStyle.Italic`. |
| F-078 | Lane body inner shadow + hairline | 🔄 V1 | Compose `drawWithCache` shadow; approximate. |

### 3.5 CardView (card tile)

| F-NNN | Element | Decision | Native treatment |
|---|---|---|---|
| F-090 | Status accent bar (left edge) | ✅ MVP | `Box` with 3 dp wide colored bar. |
| F-091 | Status-tinted gradient bloom | ✅ MVP | `Brush.linearGradient`. |
| F-092 | Hover lift + accent shadow | 🔄 V1 | No hover on phone — use `Modifier.indication` press-state lift instead. Respect `Settings.Global.ANIMATOR_DURATION_SCALE` (Android equivalent of `prefers-reduced-motion`). |
| F-093 | Source row "⟰ telegram" | ✅ MVP | Inline mono text when `source='telegram'`. |
| F-094 | "✦ ai" badge (violet) | ✅ MVP | Badge when `ai_summarized=true`. |
| F-095 | "needs review" badge (danger) | ✅ MVP | Badge when `needs_review=true`. |
| F-096 | Insight pending "🤔" pulse | ✅ MVP | Pulsing icon via `infiniteRepeatable` (motion on data state, not idle — user-required premium feel). |
| F-097 | Insight ready "✨" indicator | ✅ MVP | Static icon. |
| F-098 | Title (Spectral) | ✅ MVP | `Text` + Spectral font. |
| F-099 | Description (2-line clamp) | ✅ MVP | `Text` `maxLines=2`, `overflow=Ellipsis`. |
| F-100 | AI insight summary snippet | ✅ MVP | `Text` `maxLines=1`. |
| F-101 | Tag chips | ✅ MVP | `LazyRow` of `AssistChip`. |
| F-102 | Due-date pill w/ tone | ✅ MVP | `AssistChip` with computed tone color. |
| F-103 | Non-image attachment count "📎 N" | ✅ MVP | Icon + count. |
| F-104 | Unread message badge "💬 N" (violet) | ✅ MVP | `Badge` with violet. |
| F-105 | Relative time fallback | ✅ MVP | `Text` of relative-time formatter. |
| F-106 | Image attachment thumbnails (≤3 + "+N") | ✅ MVP | `Row` of `Coil` `AsyncImage` with auth interceptor. |
| F-107 | Assignee avatar stack (≤3 initials) | ✅ MVP | Overlapping `Box` rounded with initials + deterministic hashed color. |
| F-108 | Share avatar stack (≤3, violet) | ✅ MVP | Same as F-107 with violet tint. |
| F-109 | Click opens EditDialog | ✅ MVP | `clickable` → navigate to `CardDetailScreen`. |
| F-110 | Drag handle (whole card) | 🔄 V1 | Long-press triggers drag (see F-051). |

### 3.6 CaptureBar (capture surface)

| F-NNN | Element | Decision | Native treatment |
|---|---|---|---|
| F-120 | Lane chip (status + ▾) | ✅ MVP | `FilterChip` opens lane picker bottom sheet. |
| F-121 | Draft input "Capture as card…" | ✅ MVP | `OutlinedTextField` in bottom sheet. |
| F-122 | Enter to send | ✅ MVP | `KeyboardActions(onSend = …)`. |
| F-123 | Send "→" button (violet when text) | ✅ MVP | `IconButton`, animated tint. |
| F-124 | Slash-prefix template shortcut | ✅ MVP | Parse `^/(\S+)` → instantiate matching template. |
| F-125 | "📷 Photo" mode button | ✅ MVP | Opens `CameraX` capture activity → returns photo URI → POST `/api/cards/from-image`. |
| F-126 | "✱ Template" mode button | ✅ MVP | Opens template picker bottom sheet. |
| F-127 | "🎙️ Voice" mode button | ✅ **MVP (upgraded)** | Was a PWA stub; native gets real voice capture: `AudioRecord` → POST `/api/cards/from-audio` (new endpoint — flagged for Stage 4 backend). |
| F-128 | Template picker sheet | ✅ MVP | `ModalBottomSheet` with template rows. |
| F-129 | Lane picker sheet | ✅ MVP | Same pattern. |
| F-130 | Lane row count badge (mono) | ✅ MVP | `Text` with JetBrains Mono. |
| F-131 | Sheet backdrop click-to-close | ✅ MVP | `ModalBottomSheet` default. |

### 3.7 EditDialog (card editor — desktop modal)

Native renders this as a **full-screen route** (`CardDetailScreen`), not a
modal, because EditDialog and MobileCardView are functionally identical on
mobile and the latter is the existing mobile target.

| F-NNN | Element | Decision | Native treatment |
|---|---|---|---|
| F-150 | Backdrop blur | 🚫 R1 | Full-screen route — no backdrop. |
| F-151 | Spring-in animation | 🔄 V1 | Compose nav transition: shared element + scale-in. |
| F-152 | Violet header strip | ✅ MVP | `TopAppBar` with violet tint. |
| F-153 | Copyable card-id chip | ✅ MVP | `AssistChip` → `ClipboardManager.setPrimaryClip`. |
| F-154 | "🧬" chain-view button | ⏳ V2 | Chain viz deferred (see §8). |
| F-155 | "✕" close button | ✅ MVP | `IconButton` → `navigateUp`. |
| F-156 | Esc-key close | 🚫 R3 | No Esc on phone (system back handles it). |
| F-157 | Title input | ✅ MVP | `OutlinedTextField` Spectral 18 sp bold. |
| F-158 | "📱" QR toggle button | ⏳ V2 | QR is a desktop→phone handoff feature; phone is already on the card. |
| F-159 | QR code image | ⏳ V2 | Same. |
| F-160 | QR mobile-URL caption | ⏳ V2 | Same. |
| F-161 | Description textarea | ✅ MVP | `OutlinedTextField` multiline. |
| F-162 | Tags input (comma-separated) | ✅ MVP | `OutlinedTextField` parsed on save. |
| F-163 | AI Insights panel mount | ✅ MVP | Embedded `AiInsightsSection` composable. |
| F-164 | Related Cards section mount | ⏳ V2 | List-only viewer in MVP if links exist; full picker in V2. |
| F-165 | Knowledge list (linked items) | ✅ MVP | `LazyColumn`. |
| F-166 | Knowledge "remove" button per row | ✅ MVP | `IconButton`. |
| F-167 | Knowledge "+ Attach" toggle | ✅ MVP | Opens picker sheet. |
| F-168 | Knowledge picker search input | ✅ MVP | `OutlinedTextField` debounced. |
| F-169 | Knowledge picker candidate row | ✅ MVP | `ListItem`. |
| F-170 | "Save as knowledge" button (URL detected) | ✅ MVP | `Button`, visible when desc contains URL. |
| F-171 | Due-date `<input type=date>` | 🔄 V1 | `DatePickerDialog` (Material3 native picker). |
| F-172 | Due-date clear | ✅ MVP | `IconButton`. |
| F-173 | Attachments header | ✅ MVP | `Text` header. |
| F-174 | Image attachment preview | ✅ MVP | `AsyncImage` + click opens viewer (zoomable). |
| F-175 | Non-image attachment chip | ✅ MVP | `AssistChip` → opens Custom Tab or system viewer. |
| F-176 | Assignees pill grid | ✅ MVP | `FlowRow` of `FilterChip` toggles. |
| F-177 | "Shared with" pill grid | ✅ MVP | Same. |
| F-178 | "Share now" inline button | ✅ MVP | `Button` (PATCH immediately). |
| F-179 | "✓ Shared" / busy spinner | ✅ MVP | Conditional `Text` / `CircularProgressIndicator`. |
| F-180 | CardTimeline mount | ✅ MVP | Embedded `CardTimelineSection`. |
| F-181 | Footer "Cancel" button | ✅ MVP | TopAppBar back. |
| F-182 | Footer "Save" button | ✅ MVP | TopAppBar action + autosave (debounced). |
| F-183 | Paste-to-attach (clipboard image) | 🔄 V1 | Long-press on attachments grid → "Paste image" → reads `ClipboardManager` image. |

### 3.8 AiInsightsPanel

| F-NNN | Element | Decision | Native treatment |
|---|---|---|---|
| F-200 | Panel container "✨ AI Insights" | ✅ MVP | Section with violet header. |
| F-201 | First-run CTA + description | ✅ MVP | Empty-state `Text` + `Button`. |
| F-202 | "🤔 Brainstorm this card" button | ✅ MVP | `Button` → POST insights/brainstorm. |
| F-203 | "🔄 Re-run" button | ✅ MVP | Same. |
| F-204 | Pending pulse state | ✅ MVP | `infiniteRepeatable` text fade. |
| F-205 | Failed banner + retry | ✅ MVP | Red surface + retry button. |
| F-206 | OK summary paragraph | ✅ MVP | `Text`. |
| F-207 | "(degraded: web unavailable)" caption | ✅ MVP | Italic caption. |
| F-208 | Related items list | ✅ MVP | `LazyColumn` rows. |
| F-209 | Related-item Open ↗ (URL) | ✅ MVP | Custom Tabs intent. |
| F-210 | Related-item Copy 📋 | ✅ MVP | `IconButton` → clipboard. |
| F-211 | Related-item Open (card / no-url knowledge) | ✅ MVP | Nav to detail. |
| F-212 | Web findings list | ✅ MVP | Same. |
| F-213 | Next-steps ordered list | ✅ MVP | Numbered `LazyColumn`. |
| F-214 | Inline error text | ✅ MVP | Caption. |
| F-215 | WS-driven live updates | ✅ MVP | `Flow<InsightEvent>` from WS layer. |

### 3.9 RelatedCardsSection

| F-NNN | Element | Decision | Native treatment |
|---|---|---|---|
| F-230 | Header "🧬 Related cards" | ⏳ V2 | Section visible only if links exist (read-only) in MVP; full editing in V2. |
| F-231 | "+ Link card" button | ⏳ V2 | Picker is V2. |
| F-232 | Link list per relationship | ⏳ V2 (read-only in MVP if present) | Display existing links as static list. |
| F-233 | Direction arrow | ⏳ V2 | Same. |
| F-234 | Linked-card title button | ⏳ V2 (read-only in MVP) | Navigates to card. |
| F-235 | "(not visible)" placeholder | ⏳ V2 | Same. |
| F-236 | "Unlink" pill | ⏳ V2 | Edit/unlink is V2. |
| F-237 | Link note caption | ⏳ V2 | Display only in MVP. |

> Compromise: MVP renders the list of links as a static read-only block (so
> the user sees the chain exists). Creation/unlink lives behind the V2 picker.

### 3.10 LinkPickerDialog

| F-NNN | Element | Decision | Native treatment |
|---|---|---|---|
| F-250..F-260 | Entire dialog | ⏳ V2 | Linking flow is V2. |

### 3.11 CardChainModal (chain viz)

| F-NNN | Element | Decision | Native treatment |
|---|---|---|---|
| F-280..F-291 | Entire chain modal | ⏳ V2 | Defer all 12 rows. Per §8 recommendation, V2 ships a `WebView` embed of the existing ReactFlow `/chain/:id` viz (cheap) while V3 considers a native graph. |

### 3.12 CardTimeline + ChatInput

| F-NNN | Element | Decision | Native treatment |
|---|---|---|---|
| F-310 | Expand/collapse toggle | 🔄 V1 | Section is always-visible on card detail (no collapse — vertical space ample on phone). |
| F-311 | Lazy load events on open | ✅ MVP | First load on screen mount; respects §11.12 risk (no paging yet). |
| F-312 | Vertical timeline (rail + dots) | ✅ MVP | `Column` with `drawBehind` rail. |
| F-313 | System entry dot (green) | ✅ MVP | Colored `Box`. |
| F-314 | System entry actor + action | ✅ MVP | `Text` with `whitespace-pre-wrap` equivalent. |
| F-315 | Message entry dot (ceramic) | ✅ MVP | Same. |
| F-316 | Message body | ✅ MVP | `Text`. |
| F-317 | AI entry dot | ✅ MVP | Same. |
| F-318 | AI suggestion chips (4 actions) | ✅ MVP | `AssistChip` row; tap applies via PATCH or POST. |
| F-319 | "✓ applied" disabled state | ✅ MVP | Local applied-set + check prefix. |
| F-320 | Empty state "No activity yet. Say hello!" | ✅ MVP | `Text` placeholder. |
| F-321 | Auto-scroll-to-bottom | ✅ MVP | `LazyListState.animateScrollToItem`. |
| F-322 | Mark-as-read on load + incoming | ✅ MVP | PUT events/read. |
| F-323 | Live merge of WS events | ✅ MVP | Flow merge. |
| F-324 | Message input | ✅ MVP | `OutlinedTextField`. |
| F-325 | Send button | ✅ MVP | `IconButton` + busy state. |
| F-326 | Inline error text | ✅ MVP | Caption. |
| F-327 | `@ai` mention triggers AI reply | ✅ MVP | Server-side (per §6.11). |

### 3.13 NotificationBell

| F-NNN | Element | Decision | Native treatment |
|---|---|---|---|
| F-340 | Bell icon button (violet when unread) | ✅ MVP | TopAppBar action with `Badge`. |
| F-341 | Unread count badge (max 99+) | ✅ MVP | Material `Badge`. |
| F-342 | Bell click prompts push subscription | 🔄 V1 | Replaced by Android push permission flow at first launch + FCM token registration (Notification permission is required on Android 13+ via `POST_NOTIFICATIONS` runtime grant). |
| F-343 | Panel (380×480, click-outside) | 🔄 V1 | `ModalBottomSheet` with notifications list. |
| F-344 | Panel header "Notifications" | ✅ MVP | Sheet header. |
| F-345 | "Mark all read" link button | ✅ MVP | `TextButton`. |
| F-346 | Notification row (avatar, name, preview, time) | ✅ MVP | `ListItem`. |
| F-347 | Unread row indicator | ✅ MVP | Background tint + leading bar. |
| F-348 | Empty state | ✅ MVP | `Text`. |
| F-349 | Cap of 50 visible rows | ✅ MVP | `take(50)`. |
| F-350 | Initial load on mount | ✅ MVP | GET notifications. |
| F-351 | Reload on WS message/ai_response | ✅ MVP | Flow trigger. |

### 3.14 ActivityTicker

| F-NNN | Element | Decision | Native treatment |
|---|---|---|---|
| F-370 | Sticky bar (under header) | ⏳ V2 | Defer entire ticker — premium per memory means motion on interaction, not idle scrolling. |
| F-371 | Pulsing dot + count | ⏳ V2 | Same. |
| F-372 | Top-8 hot cards by activity score | ⏳ V2 | Same. |
| F-373 | Auto-scrolling chip row (60 s loop) | ⏳ V2 | Same — idle infinite scroll conflicts with WALL-E principle. |
| F-374 | Hover-to-pause | 🚫 R3 | No hover on phone. |
| F-375 | Chip click opens EditDialog | ⏳ V2 | If ticker ships in V2, chip taps navigate to detail. |
| F-376 | Static variant when <4 cards | ⏳ V2 | Same. |
| F-377 | Edge mask gradient | ⏳ V2 | Same. |

### 3.15 WeatherWidget

| F-NNN | Element | Decision | Native treatment |
|---|---|---|---|
| F-390..F-395 | All weather features | ⏳ V2 | Decorative; not on capture critical path. V2 could use Android `WeatherProvider` if available. |

### 3.16 WeeklyReview

| F-NNN | Element | Decision | Native treatment |
|---|---|---|---|
| F-410 | Gold-tinted hero band | ⏳ V2 | Weekly review is a desktop ritual; defer. |
| F-411 | ✕ close | ⏳ V2 | Same. |
| F-412 | AI-generated summary | ⏳ V2 | Same. |
| F-413 | 3-up stat grid | ⏳ V2 | Same. |
| F-414 | Section "Shipped" | ⏳ V2 | Same. |
| F-415 | Section "Stale" | ⏳ V2 | Same. |
| F-416 | Section "Stuck" | ⏳ V2 | Same. |
| F-417 | Tag chips on rows | ⏳ V2 | Same. |
| F-418 | "Generate again" footer button | ⏳ V2 | Same. |
| F-419 | "Got it" footer | ⏳ V2 | Same. |
| F-420 | Backdrop click-to-close | ⏳ V2 | Same. |

When V2 ships, render as full-screen route (not modal) to match phone idiom.

### 3.17 SettingsDialog

| F-NNN | Element | Decision | Native treatment |
|---|---|---|---|
| F-440 | Header strip "Settings" + ✕ | ✅ MVP | `Scaffold` + `TopAppBar`. |
| F-441 | Theme section header + caption | ✅ MVP | `Text` + caption. |
| F-442 | Theme segmented toggle (Light/Dark/System) | ✅ MVP | `SegmentedButton` (Material 3). Persists via `DataStore`. |
| F-443 | Display-name section | ✅ MVP | Header. |
| F-444 | Short-name input | ✅ MVP | `OutlinedTextField` max 16. |
| F-445 | Short-name "Save" | ✅ MVP | PATCH /api/auth/me. |
| F-446 | Save error/success caption | ✅ MVP | Caption. |
| F-447 | Mirror-tokens section | ⏳ V2 | Mirror is desktop kiosk; managing tokens on phone is rare. |
| F-448 | Mirror-token label + Create | ⏳ V2 | Same. |
| F-449 | New mirror URL banner | ⏳ V2 | Same. |
| F-450 | Mirror tokens list | ⏳ V2 | Same. |
| F-451 | Mirror-token "Revoke" | ⏳ V2 | Same. |
| F-452 | API-tokens section | ⏳ V2 | Rare on phone; manage from desktop. |
| F-453 | API-token Generate | ⏳ V2 | Same. |
| F-454 | One-shot token reveal + Copy/Dismiss | ⏳ V2 | Same. |
| F-455 | API tokens list | ⏳ V2 | Same. |
| F-456 | API-token Revoke | ⏳ V2 | Same. |
| F-457 | Telegram-identities section | ⏳ V2 | Same. |
| F-458 | Telegram link form | ⏳ V2 | Same. |
| F-459 | Telegram identities list | ⏳ V2 | Same. |
| F-460 | Telegram identity Unlink | ⏳ V2 | Same. |
| F-461 | Templates tab mount | 🔄 V1 | Templates surface inline in CaptureBar (F-126/F-128) for MVP; full CRUD tab in V1. |

### 3.18 TemplatesTab

| F-NNN | Element | Decision | Native treatment |
|---|---|---|---|
| F-480 | Tab header "+ New template" | 🔄 V1 | Settings → Templates screen (V1). |
| F-481..F-489 | Inline form fields | 🔄 V1 | Native form (V1). |
| F-490 | Error caption | 🔄 V1 | Same. |
| F-491 | Templates list row | 🔄 V1 (MVP: read-only via picker) | MVP shows templates in CaptureBar; CRUD list in V1. |
| F-492 | Edit button | 🔄 V1 | V1. |
| F-493 | Delete button (confirm) | 🔄 V1 | V1. |
| F-494 | Empty state | 🔄 V1 | V1. |
| F-495 | Live updates via WS | 🔄 V1 | V1. |

### 3.19 ArchiveDialog

| F-NNN | Element | Decision | Native treatment |
|---|---|---|---|
| F-510 | Header strip + count + ✕ | 🔄 V1 | Full-screen ArchiveScreen. |
| F-511 | Initial load | 🔄 V1 | GET /api/cards/archived. |
| F-512 | Per-card row | 🔄 V1 | `ListItem`. |
| F-513 | Restore button | 🔄 V1 | PATCH restore. |
| F-514 | Delete-forever button (confirm) | 🔄 V1 | `AlertDialog` confirm. |
| F-515 | Empty state | 🔄 V1 | Text. |
| F-516 | Footer "Close" | 🔄 V1 | `navigateUp`. |
| F-517 | "Delete all" (confirm) | 🔄 V1 | `AlertDialog` confirm. |
| F-518 | Inline error banner | 🔄 V1 | Snackbar. |
| F-519 | Busy text on row buttons | 🔄 V1 | Same. |

Decision rationale: Archive is bottom-nav tab #3 in PWA (F-674). MVP ships
bottom-nav board+capture flow; archive moves to V1 to keep MVP scope tight.

### 3.20 KnowledgeView

| F-NNN | Element | Decision | Native treatment |
|---|---|---|---|
| F-540 | Hero band "Knowledge" + subtitle | 🔄 V1 | Knowledge tab gets full UI in V1. MVP supports **read-only browse + create from share intent** only. |
| F-541 | "+ New note" button | 🔄 V1 | V1 CRUD; share-intent create works in MVP. |
| F-542 | Scope select (mine/inbox/all) | 🔄 V1 | V1. |
| F-543 | Search input (deferred) | 🔄 V1 | V1. |
| F-544 | Top-tag chips | 🔄 V1 | V1. |
| F-545 | Item grid | 🔄 V1 (MVP: list) | MVP: simple `LazyColumn` list. |
| F-546 | Empty state | 🔄 V1 | Text. |
| F-547 | Share-target ingest | ✅ MVP | `ACTION_SEND` intent handler → opens "New knowledge" form pre-filled. **This is the MVP killer feature**. |
| F-548 | Row click opens detail | ✅ MVP | Read-only detail view in MVP. |
| F-549 | Live updates via WS | ✅ MVP | Required to reconcile share-intent creates from other devices. |

### 3.21 KnowledgeRow

| F-NNN | Element | Decision | Native treatment |
|---|---|---|---|
| F-570 | URL prefix 🔗 | ✅ MVP | Icon. |
| F-571 | Title | ✅ MVP | Text. |
| F-572 | Hostname pill | ✅ MVP | `AssistChip`. |
| F-573 | 2-line body snippet | ✅ MVP | `Text maxLines=2`. |
| F-574 | Tag list | 🔄 V1 | V1 (display only in MVP detail). |
| F-575 | Visibility badge | ✅ MVP | Icon. |
| F-576 | Linked-cards count | ✅ MVP | Badge. |
| F-577 | Fetch-status ⏳ | ✅ MVP | Icon. |
| F-578 | Fetch-status ⚠ | ✅ MVP | Icon + tooltip. |
| F-579 | Row click opens detail | ✅ MVP | Nav. |

### 3.22 KnowledgeDetail

| F-NNN | Element | Decision | Native treatment |
|---|---|---|---|
| F-600 | Title header + Close | ✅ MVP | TopAppBar. |
| F-601 | URL anchor (new tab) | ✅ MVP | Custom Tabs. |
| F-602 | Meta line | ✅ MVP | Text. |
| F-603 | Fetch-error caption | ✅ MVP | Red text. |
| F-604 | Body `<pre>` | ✅ MVP | `Text` with mono font + scrollable container. |
| F-605 | Linked-cards header | ✅ MVP | Header. |
| F-606 | Linked card row | ✅ MVP | `ListItem`. |
| F-607 | "remove" pill (owner) | 🔄 V1 | Removable links in V1. |
| F-608 | "+ Attach card" toggle | 🔄 V1 | V1. |
| F-609 | Picker search + candidate list | 🔄 V1 | V1. |
| F-610 | Refetch (owner) | 🔄 V1 | V1. |
| F-611 | Edit (owner) | 🔄 V1 | V1. |
| F-612 | Archive (owner) | 🔄 V1 | V1. |

### 3.23 KnowledgeEditDialog

| F-NNN | Element | Decision | Native treatment |
|---|---|---|---|
| F-630 | Header "New/Edit knowledge" | ✅ MVP (create-via-share only) | Full-screen form opened by share intent. Edit-existing in V1. |
| F-631 | URL field (auto-titles) | ✅ MVP | `OutlinedTextField` + hostname-derived title. |
| F-632 | Title field | ✅ MVP | `OutlinedTextField`. |
| F-633 | Body textarea | ✅ MVP | `OutlinedTextField` multiline. |
| F-634 | Tags input | 🔄 V1 | Tags input in V1. |
| F-635 | Visibility radio (private/inbox/shared) | ✅ MVP | `RadioGroup`. |
| F-636 | "Auto-fetch when I save" checkbox | ✅ MVP | `Checkbox`. |
| F-637 | Error caption | ✅ MVP | Text. |
| F-638 | Cancel | ✅ MVP | TopAppBar back. |
| F-639 | Save | ✅ MVP | POST /api/knowledge. |

### 3.24 MobileShell — the existing PWA mobile shell

This is the *primary* north-star reference per Stage 1 §9.8. Every row maps
1:1 to native.

| F-NNN | Element | Decision | Native treatment |
|---|---|---|---|
| F-660 | Top date + weather chip | 🔄 V1 (date ✅ MVP; weather ⏳ V2) | Split — date renders MVP, weather chip is V2. |
| F-661 | Scope select | ✅ MVP | `ExposedDropdownMenuBox`. |
| F-662 | Avatar → profile sheet | ✅ MVP | `IconButton` opens `ModalBottomSheet`. |
| F-663 | Big lane title (dot + label + count + ▾) | ✅ MVP | `Row` clickable → lane picker sheet. |
| F-664 | ActivityTicker mount | ⏳ V2 | See §3.14. |
| F-665 | Search input | ✅ MVP | `OutlinedTextField` (auto 16 sp font — no iOS-zoom issue on Android, but keep size for consistency). |
| F-666 | Card list (per active lane) | ✅ MVP | `LazyColumn`. |
| F-667 | MobileNoteCard tile | ✅ MVP | `Card` composable matching CardView elements. |
| F-668 | Long-press → MobileCardActions | ✅ MVP | `Modifier.combinedClickable` + bottom sheet. |
| F-669 | Lateral swipe cycles lanes | ✅ MVP | `Modifier.draggable` or `HorizontalPager` (preferred — matches PWA snap behavior). |
| F-670 | Lane-picker bottom-sheet | ✅ MVP | `ModalBottomSheet`. |
| F-671 | Empty-lane italic message | ✅ MVP | `Text`. |
| F-672 | Install prompt banner | 🚫 R3 | Native app — no install prompt. |
| F-673 | CaptureBar (above bottom nav) | ✅ MVP | Persistent bottom bar above nav. |
| F-674 | Bottom nav 3 tabs (Board / Knowledge / Archive) | ✅ MVP (Board + Knowledge) ; 🔄 V1 (Archive) | MVP nav is **2 tabs (Board + Knowledge)**; Archive becomes tab 3 in V1 (matches PWA). |
| F-675 | Active-tab dot + violet | ✅ MVP | Material `NavigationBar` selected indicator (tinted violet). |
| F-676 | KnowledgeView mount | ✅ MVP (read-only) | See §3.20. |
| F-677 | ArchiveDialog inline (tab=archive) | 🔄 V1 | V1 (see §3.19). |
| F-678 | WS live updates per scope | ✅ MVP | `WebSocketSession` Flow. |
| F-679 | MobileCardActions sheet | ✅ MVP | `ModalBottomSheet`. |
| F-680 | Archive in actions sheet | ✅ MVP | DELETE /api/cards/:id. |

### 3.25 MobileCardActions (bottom sheet)

| F-NNN | Element | Decision | Native treatment |
|---|---|---|---|
| F-700 | Move-to rows (current disabled) | ✅ MVP | Sheet rows. |
| F-701 | Archive destructive row | ✅ MVP | Red sheet row. |
| F-702 | Cancel footer | ✅ MVP | Sheet row. |
| F-703 | Drag handle (top center) | ✅ MVP | Material sheet handle. |

### 3.26 MobileCardView (`/m/card/:id`) — full card editor

| F-NNN | Element | Decision | Native treatment |
|---|---|---|---|
| F-720 | Sticky header (back + title) | ✅ MVP | `TopAppBar`. |
| F-721 | Copyable card-id chip | ✅ MVP | `AssistChip` → clipboard. |
| F-722 | Saving spinner caption | ✅ MVP | `CircularProgressIndicator`. |
| F-723 | Title field (debounced patch) | ✅ MVP | `OutlinedTextField`, debounce 500 ms. |
| F-724 | Status grid (4 buttons) | ✅ MVP | `Row` of `FilterChip`. |
| F-725 | Description textarea (debounced) | ✅ MVP | `OutlinedTextField`, debounce 800 ms. |
| F-726 | Tags input (blur saves) | ✅ MVP | `OutlinedTextField`. |
| F-727 | AiInsightsPanel | ✅ MVP | Embedded. |
| F-728 | Due-date picker (immediate save) | ✅ MVP | `DatePickerDialog`. |
| F-729 | Assignees pill grid | ✅ MVP | `FlowRow` of `FilterChip`. |
| F-730 | Shared-with pill grid | ✅ MVP | Same. |
| F-731 | Attachments grid (3-col) | ✅ MVP | `LazyVerticalGrid` cells=3. |
| F-732 | "+ Add" tile opens attachment bottom-sheet | ✅ MVP | `ModalBottomSheet`. |
| F-733 | Sheet "Camera" row | ✅ MVP | CameraX intent. |
| F-734 | Sheet "Photo Library" row | ✅ MVP | `ActivityResultContracts.PickVisualMedia`. |
| F-735 | Sheet "Files" row | ✅ MVP | `ActivityResultContracts.GetContent` (image-only mime — backend enforces). |
| F-736 | Sheet Cancel | ✅ MVP | Sheet dismiss. |
| F-737 | CardTimeline mount | ✅ MVP | Embedded. |
| F-738 | Archive card destructive button | ✅ MVP | `Button` + `AlertDialog` confirm. |
| F-739 | WS card.updated/deleted handling | ✅ MVP | Flow merge. |
| F-740 | Card-not-found 404 state | ✅ MVP | Empty state. |

### 3.27 MobileMore

| F-NNN | Element | Decision | Native treatment |
|---|---|---|---|
| F-760 | "Hi, {short_name}" greeting | ✅ MVP | Settings header. |
| F-761 | Theme segmented toggle | ✅ MVP | `SegmentedButton`. |
| F-762 | Weekly review row → modal | ⏳ V2 | See §3.16. |
| F-763 | Archived cards row → modal | 🔄 V1 | V1. |
| F-764 | Settings row → modal | ✅ MVP | Nav. |
| F-765 | "Install as app" row | 🚫 R3 | Native — no install. |
| F-766 | Sign out row (red) | ✅ MVP | Logout. |

### 3.28 MirrorView (desktop kiosk)

| F-NNN | Element | Decision | Native treatment |
|---|---|---|---|
| F-790..F-797 | Entire kiosk view | 🚫 R4 | Mirror is a read-only desktop-screen surface (e.g. always-on display in a kitchen). Not a phone use case. |

### 3.29 ToastContainer

| F-NNN | Element | Decision | Native treatment |
|---|---|---|---|
| F-820 | Fixed bottom-right stack | 🔄 V1 | `SnackbarHost` (Material 3) — bottom-center, not bottom-right; native idiom. |
| F-821 | Per-toast row | ✅ MVP | Snackbar. |
| F-822 | Level glyphs (✓/!/i) | ✅ MVP | Leading icon. |
| F-823 | Dismiss "✕" button | ✅ MVP | Action slot. |
| F-824 | Slide-up entrance | ✅ MVP | Default snackbar animation. |

### 3.30 TrashDropZone

| F-NNN | Element | Decision | Native treatment |
|---|---|---|---|
| F-840 | Fixed bottom-right 🗑 ring | 🔄 V1 | Appears as bottom-center drop zone when drag begins. |
| F-841 | Red glow + ring when over | ✅ MVP | Animated tint. |
| F-842 | Drop archives card | ✅ MVP | DELETE. |

### 3.31 Service Worker / Push Notifications

| F-NNN | Element | Decision | Native treatment |
|---|---|---|---|
| F-860 | Register `/sw.js` on window load | 🚫 R3 | No SW on native. |
| F-861 | Cache-first / network-first | 🚫 R3 | Native uses OkHttp cache + Room cache instead. |
| F-862 | Bypass cache for /api/ws | 🚫 R3 | N/A. |
| F-863 | "push" event → showNotification | 🔄 V1 (replaced) | FCM `onMessageReceived` → `NotificationManagerCompat.notify`. |
| F-864 | "notificationclick" focus tab + open card | 🔄 V1 (replaced) | `PendingIntent` to `CardDetailActivity` (deep link). |
| F-865 | "notificationclick" fallback openWindow | 🔄 V1 (replaced) | Same PendingIntent. |
| F-866 | App listens to SW message → opens EditDialog | 🚫 R3 | N/A — deep link directly. |
| F-867 | `?card=:id` URL param → opens EditDialog | ✅ MVP | App Link `https://kanban.../?card=<id>` and `/m/card/<id>` both deep-link to CardDetailScreen. |
| F-868 | usePushNotifications support detect | 🔄 V1 (replaced) | Detect FCM availability (`PlayServicesUtil.isGooglePlayServicesAvailable`). |
| F-869 | Subscribe flow (perm + vapid + POST) | 🔄 V1 (replaced) | FCM `FirebaseMessaging.getToken()` → POST `/api/push/fcm/subscribe` (new endpoint, flagged for Stage 4). |
| F-870 | Unsubscribe flow | 🔄 V1 (replaced) | DELETE `/api/push/fcm/subscribe`. |
| F-871 | useTheme localStorage | ✅ MVP | `DataStore<Preferences>` + `documentElement.dataset.theme` equivalent. |
| F-872 | useInstallPrompt | 🚫 R3 | Native — no install prompt. |

### 3.32 Keyboard Shortcuts (desktop)

| F-NNN | Element | Decision | Native treatment |
|---|---|---|---|
| F-890 | Esc closes dialog | 🚫 R3 | System back handles it. |
| F-891 | `/` or `⌘K` focuses search | 🚫 R3 | No keyboard on phone. |
| F-892 | `n` dispatches add-card | 🚫 R3 | Same. |
| F-893 | `1`–`4` scrolls to column | 🚫 R3 | Same. |
| F-894 | Suppressed when typing in INPUT | 🚫 R3 | Same. |

Note: with a connected BT keyboard, V2 could selectively re-enable `/`, `n`,
and Esc handling via `KeyEvent` — but not in MVP.

### 3.33 Telegram Bot

| F-NNN | Element | Decision | Native treatment |
|---|---|---|---|
| F-910..F-947 | All 30 Telegram rows | 🚫 R2 | Entire Telegram bot is server-side. Native app has zero Telegram surface area. Stage 4 should NOT plan any Telegram client code. |

### 3.34 WebSocket events (server → client)

| F-NNN | Element | Decision | Native treatment |
|---|---|---|---|
| F-970 | /ws upgrade authenticated by cookie OR mirror | 🔄 V1 (auth path) | Cookie auth via OkHttp `CookieJar` is fragile; recommend bearer-via-WS-subprotocol (see §8). MVP uses cookie. |
| F-980 | Initial `hello` message | ✅ MVP | Required handshake. |
| F-981 | `card.created` | ✅ MVP | Flow. |
| F-982 | `card.updated` | ✅ MVP | Flow. |
| F-983 | `card.deleted` | ✅ MVP | Flow. |
| F-984 | `card.message` (chat) | ✅ MVP | Flow. |
| F-985 | `card.ai_response` | ✅ MVP | Flow. |
| F-986 | `template.created/updated/deleted` | 🔄 V1 | Required when Templates ships in V1. |
| F-987 | `knowledge.created/updated/deleted` | ✅ MVP | Required for share-intent reconciliation. |
| F-988 | `knowledge.link.created/deleted` | 🔄 V1 | V1. |
| F-989 | `insight.queued/updated/failed` | ✅ MVP | Required for AI Insights live state. |
| F-990 | `card.link.created/deleted` | ⏳ V2 | When chain/links ship in V2. |
| F-991 | Auto-reconnect w/ backoff (500 ms → 10 s) | ✅ MVP | OkHttp `WebSocketListener` retry loop. |

### 3.35 Backend-only features

| F-NNN | Element | Decision | Notes |
|---|---|---|---|
| F-1010..F-1064 | All 55 backend rows | 🚫 R2 (or ✅ implicit) | These are server-side; native consumes the resulting APIs. Native has no implementation work beyond *correctly hitting* the APIs. **Two exceptions** flagged for Stage 4 backend additions: a new `POST /api/auth/native/login` (or extend `mirror_tokens` with `scope='native'`) and `POST /api/cards/from-audio` for native voice capture. |

---

## 4. MVP / V1 / V2 Scope

### 4.1 MVP (Release 1) — first ship

Goal: **"capture + browse + chat + push"** is rock-solid; everything else can
be in the PWA.

**Included row IDs (count by group):**

- **Auth (10):** F-001 through F-011 minus F-003 (V1)
- **Board chrome (10):** F-021, F-023..F-025, F-027, F-030..F-036
- **Board lanes (6):** F-056, F-057, F-070..F-073, F-074, F-075, F-077
- **Cards (CardView, 18):** F-090, F-091, F-093..F-109 (F-092 hover→press in V1; F-110 drag in V1)
- **Capture (12):** F-120..F-131
- **Card detail (37):** F-152, F-153, F-155, F-157, F-161..F-163, F-165..F-170, F-172..F-180, F-182, F-183 (paste V1), plus F-720..F-740 from MobileCardView
- **AI Insights (16):** F-200..F-215
- **Timeline + Chat (18):** F-311..F-327
- **Notifications (12):** F-340, F-341, F-344..F-351
- **Knowledge — read-only browse + share-target create (15):** F-547..F-549, F-570..F-579, F-600..F-606 (read-only), F-630..F-639
- **Mobile shell (16):** F-660 (date half), F-661..F-663, F-665..F-671, F-673, F-674 (2 tabs), F-675, F-676, F-678..F-680
- **Mobile card actions (4):** F-700..F-703
- **Mobile More (3):** F-760, F-761, F-764, F-766
- **Push & deep link (3):** F-867, F-871
- **WS (8):** F-980..F-985, F-987 (knowledge), F-989, F-991

**Total MVP rows: ~188**

Cut-line rationale: any feature that does not contribute to one of the 5 JTBDs
in §2.2 is deferred. Multi-tap edits, share creation, AI replies, and push
notifications are non-negotiable. Templates CRUD, chain viz, archive,
weekly review, mirror, weather, activity ticker are luxuries.

### 4.2 V1 (Release 2) — full PWA parity minus 🚫

Goal: **"everything the mobile PWA does, the native app does better"** —
explicit feature parity benchmark against `MobileShell.tsx`.

**Adds these row groups on top of MVP:**

- **Login polish:** F-003 (decorative blooms)
- **Board chrome:** F-020 (header blur), F-022 (PWA was top tabs, native is bottom nav already done)
- **Card tile:** F-092 (press-state lift), F-110 (drag-to-reorder)
- **Card detail:** F-151 (spring-in nav), F-164 (related cards section read-only - already had a place), F-181, F-183 (paste)
- **Templates CRUD (15):** F-461, F-480..F-495 (Settings → Templates screen)
- **Archive (10):** F-510..F-519 (full Archive tab — now tab 3 in bottom nav, parity with PWA)
- **Knowledge CRUD (10):** F-540..F-546 (full Knowledge tab UI), F-607..F-612 (link mgmt + refetch + edit + archive), F-634 (tags input)
- **Toasts (5):** F-820..F-824 (Snackbar host)
- **Trash drop zone (3):** F-840..F-842
- **FCM push (5):** F-342 (replaced flow), F-863..F-865 (replaced), F-868..F-870 (FCM subscribe/unsubscribe)
- **Mirror More:** F-763 (archived row)
- **WS:** F-970 (full bearer auth), F-986 (template events), F-988 (knowledge link events)
- **Auth backend addition:** new bearer-token-for-all-routes path

**Total V1 rows added: ~75 → cumulative ~263**

### 4.3 V2 (Release 3+) — exotic features and tablet/widgets

Goal: **PWA + native-only delights** — features the PWA cannot do well.

**Adds these row groups on top of V1:**

- **Activity ticker (8):** F-370..F-377 (idle motion, only if user feedback validates)
- **Weather widget (6):** F-390..F-395
- **Weekly review (11):** F-410..F-420 (full-screen route)
- **Chain viz (12):** F-280..F-291 (recommended: WebView embed of `/chain/:id` in V2; native graph in V3)
- **Related cards full CRUD (8):** F-230..F-237
- **Link picker (11):** F-250..F-260
- **WS card.link events (1):** F-990
- **Mirror tokens (5):** F-447..F-451 (UI to manage from phone)
- **API tokens (5):** F-452..F-456
- **Telegram identities (4):** F-457..F-460
- **MobileMore weekly review row (1):** F-762
- **QR code (3):** F-158..F-160 (phone-on-card-already so cheap)
- **Header tabs / mobile shell extras:** F-664 (ActivityTicker), F-660 weather chip half
- **Native widgets / app shortcuts** (NEW — not in registry): home-screen "Today" widget; long-press launcher quick-capture; Live Notification for in-progress cards

**Total V2 rows added: ~76 → cumulative ~339**

### 4.4 Out-of-scope (never ships native)

**Total out-of-scope: ~160 rows**

| Category | Rows | Reason |
|---|---|---|
| Telegram bot (all) | F-910..F-947 (30) | Server-side; R2 |
| Mirror view | F-790..F-797 (8) | Desktop kiosk; R4 |
| Service Worker (raw) | F-860..F-862, F-866 (4) | Web-only; R3 (FCM replaces) |
| Install prompt | F-672, F-765, F-872 (3) | Native app; R3 |
| Keyboard shortcuts | F-890..F-894 (5) | No keyboard on phone; R3 |
| ⌘K hint | F-028 (1) | R3 |
| Esc-key handlers | F-156 (1) | System back; R3 |
| Hover-pause | F-374 (1) | No hover; R3 |
| EditDialog backdrop | F-150 (1) | Full-screen route; R1 |
| Backend-only features | F-1010..F-1064 (55) | R2 — native consumes APIs only |
| WS broadcast plumbing already covered | — | Implicit |

### 4.5 Parity coverage check (per success criterion §6)

- Total registry rows: **499**
- MVP ✅/🔄: **~188** (37.7%)
- V1 cumulative ✅/🔄: **~263** (52.7%)
- V2 cumulative ✅/🔄: **~339** (67.9%)
- Out-of-scope: **~160** (32.1%)

**Parity excluding out-of-scope by V1: 263 / (499 − 160) = 263 / 339 = 77.6%.**
**Parity excluding out-of-scope by V2: 339 / 339 = 100%.**

This sits just under the §6 target of ≥80% by V1. Stage 3 should look for
cheap V1 wins (Toasts, Archive list rows) to push V1 over 80%.

---

## 5. Critical User Journeys (with tap counts)

### Journey 1 — First-time install + auth

1. User opens Play Store, taps **Install** (1 tap).
2. Tap **Open** (1 tap) → splash screen (2 s).
3. App lands on `LoginScreen` (auto-detects no session).
4. Toggle to **Create account** (1 tap) [skip if already registered].
5. Type **Full name** (n keystrokes, not counted).
6. Type **Short name** (n keystrokes).
7. Type **Email** (n keystrokes).
8. Type **Password** (n keystrokes).
9. Tap **Create account** (1 tap) → POST `/api/auth/register`.
10. Server returns 201 + sets session cookie → native saves cookie via OkHttp `CookieJar`.
11. Navigate to `BoardScreen` → GET `/api/cards?scope=personal` → render board.
12. Foreground service registers FCM token → POST `/api/push/fcm/subscribe` (background).
13. WS connect → `/ws` with session cookie → receive `hello`.

**Total taps from launch: 4** (Open, toggle, Create account, [auto]).
**Time-to-first-card on cold start: target < 4 s** (splash 2 s + login form 1 s + auth round-trip 1 s).

### Journey 2 — Quick capture from share intent (URL from browser)

1. User in Chrome reads an article, taps Chrome share button (1 tap).
2. Share sheet appears with SmartKanban icon visible → tap **SmartKanban** (1 tap).
3. SmartKanban opens directly to **KnowledgeShareScreen** (no nav stack, single-task launch).
4. Form pre-filled: `url=<the URL>`, `title=<page title from Chrome>`, `body=<selected text or empty>`.
5. AI proposal fires async → title suggestion replaces auto-title if user hasn't typed (debounced 500 ms).
6. User taps **Save** (1 tap) → POST `/api/knowledge` with `source='share_target'` → 201.
7. Snackbar "Saved to Knowledge" appears → auto-finish activity after 1.5 s OR user taps **Done** (0 or 1 tap).
8. Returns to Chrome (system back-stack).

**Total taps from Chrome to back-in-Chrome: 3-4** (share, pick SmartKanban, Save, [Done]).
**Capture funnel: target < 4 s** from share-tap to confirmation snackbar.

### Journey 3 — Photo capture from camera

1. From any screen (cold or warm), tap FAB **+** (1 tap).
2. CaptureBar sheet opens with text field focused.
3. Tap **📷 Photo** chip (1 tap) → launches CameraX activity.
4. Tap **Shutter** (1 tap) → preview screen.
5. Tap **Use Photo** (1 tap) → returns to CaptureBar with photo thumbnail.
6. POST `/api/cards/from-image` (multipart) fires → server returns 201 `Card` with `needs_review=TRUE`.
7. Server async invokes Vision LLM → updates title via WS `card.updated`.
8. Snackbar "Card created — AI is reading the photo…" appears.
9. Within ~6 s, board updates with AI-generated title; `needs_review` badge clears.

**Total taps from cold start to card visible: 5** (Open from launcher, FAB, Photo, Shutter, Use Photo).
**Cold-start to card-visible: target < 8 s** (1 s app open + 4 s camera + 1 s upload + 2 s WS update).

### Journey 4 — Move card across lanes

1. From `BoardScreen`, scroll to **Today** lane (already visible at top by default).
2. **Long-press** a card (~500 ms) (1 long-tap).
3. Card lifts to 0.4 alpha overlay; lane borders highlight as drop targets.
4. **Drag** card to the **In Progress** lane (drag — no extra tap).
5. **Release** over **In Progress** drop zone.
6. UI optimistically moves card; PATCH `/api/cards/:id` `{status:"in_progress", position:<midpoint>}` fires.
7. Server returns 200; broadcasts `card.updated` via WS.
8. Native receives WS event; reconciles position float if server adjusted.

**Total taps: 1** long-press-and-drag gesture.
**Optimistic update to PATCH ACK: target < 500 ms locally; ≤ 1.5 s round-trip.**

**Alternative path (long-press → sheet):**

1. Long-press card (1 long-tap) → `MobileCardActions` bottom sheet opens.
2. Tap **Move to In Progress** (1 tap) → PATCH fires.
3. Sheet dismisses; WS reconciles.

**Total taps: 2.** Both paths shipped in MVP; users self-select.

### Journey 5 — Read & reply to @ai chat thread

1. User receives FCM push: "You: '@ai how do I unblock this?' — Brainstorm in progress" or similar.
2. Tap notification (1 tap) → PendingIntent fires `CardDetailActivity` with `card_id` extra.
3. App opens `CardDetailScreen` at the card; chat tab auto-focused (scroll to bottom).
4. The AI reply is already in the timeline (arrived via WS while app was backgrounded, or fetched on screen mount).
5. AI message includes 3 suggestion chips: `update_status:in_progress`, `set_due_date:2026-05-22`, `assign_user:<uid>`.
6. Tap **Set due date 2026-05-22** chip (1 tap) → PATCH `/api/cards/:id` `{due_date: "2026-05-22"}`.
7. Chip becomes disabled with check prefix; due-date pill updates inline.
8. WS broadcasts `card.updated` to all clients; native auto-merges.

**Total taps from push: 2** (notification, suggestion chip).
**Push-to-card-visible: target < 2 s.**

### Journey 6 — Brainstorm a card

1. User opens a card from board (1 tap to open card detail).
2. Scroll to **AI Insights** section.
3. Tap **🤔 Brainstorm this card** (1 tap) → POST `/api/cards/:id/insights/brainstorm` → 202 `{id, status:'pending'}`.
4. Panel shows pending pulse "Thinking…".
5. WS event `insight.queued` arrives (~200 ms); panel reflects.
6. Server runs hybrid LLM pipeline (~10-30 s) → WS `insight.updated` with `status='ok'`.
7. Panel renders summary + related items + web findings + next steps.
8. User taps a web finding's **Open ↗** (1 tap) → Custom Tabs opens the URL in-app.
9. User taps the in-app browser **back arrow** (1 tap) → returns to card detail.

**Total taps to in-app browser: 4** (open card, brainstorm, wait, Open ↗).
**Brainstorm-to-result: target < 30 s** (matches `BRAINSTORM_TIMEOUT_MS`).

---

## 6. Success Criteria (measurable)

| Metric | Target | Measurement |
|---|---|---|
| **Time-to-first-card on cold start** | < **3.5 s** on Pixel 6a (mid-range reference device) from launcher tap to first card visible | Firebase Performance Monitoring custom trace `app_to_board_visible` |
| **Capture funnel duration** | < **4 s** from FAB tap to card visible on board (text-only) | Custom trace `capture_text_e2e`; 95th percentile |
| **Photo capture e2e** | < **8 s** from FAB tap to card with photo visible | Custom trace `capture_photo_e2e` |
| **Crash-free sessions** | **> 99.5%** | Firebase Crashlytics |
| **ANR rate** | **< 0.5%** | Google Play Console > Android vitals |
| **Push notification deliverability** | **> 95%** delivered within 30 s of server send | FCM Analytics + custom round-trip ping (server sends a test push every 4 h to a "synthetic test" subscriber) |
| **Parity coverage by V1** | **≥ 80%** of F-NNN classified as ✅ or 🔄 (excluding 🚫 out-of-scope) | Registry audit script after V1 ship (current §4.5 projects 77.6% — Stage 3 must close the 2.4% gap) |
| **App size (initial download)** | **< 25 MB** APK / AAB base; aggregate < 40 MB with dynamic feature modules | Play Console metrics |
| **WS reconnect time** | < **3 s** from network restore to next `card.*` event delivered | Custom trace `ws_reconnect_to_first_event` |
| **Cold-start WS handshake** | < **800 ms** from app launch to `hello` received | Custom trace `ws_handshake` |
| **Notification permission grant rate** | **> 70%** on first prompt (Android 13+) | Firebase Analytics `permission_granted` event |
| **MVP parity** | **100% of MVP rows ✅** before V1 work begins | Registry audit |

---

## 7. Non-Goals (explicit, do not Stage 4 surprise us)

- **No tablet-optimized layouts in MVP.** Phone-only single-pane shell. Tablets get a single-pane scaled layout — split-view (board + detail) is V2 at earliest.
- **No Wear OS companion.** Not on the roadmap.
- **No home-screen widgets in MVP.** Today widget is V2.
- **No iOS port.** Android only. The PWA covers iOS users.
- **No offline-first sync engine in MVP.** Cached reads (Room) + online-only writes. Mid-edit conflict resolution is V2 or later; MVP behavior on write failure is: surface error in snackbar with retry, keep edits in local form state.
- **No custom in-app browser engine.** Use Chrome Custom Tabs for all external URLs (Open ↗, web findings, knowledge URL).
- **No biometric unlock in MVP.** `BiometricPrompt` is V1.
- **No file-system browser for attachments beyond system picker.** `PickVisualMedia` + `GetContent` only; no in-app file tree.
- **No multi-account login.** One account per install (per household trust model).
- **No PWA-suppression on Android.** The native app does NOT block the PWA install prompt — both can coexist; users pick.
- **No Telegram client code.** Server's Telegram bot handles all Telegram I/O; the native app never talks to Telegram directly.
- **No client-side image editing.** No crop/rotate/filter UI — just capture and upload. Crop is V2.
- **No drag-and-drop of cards from other apps.** Drop targets only accept system share intents (Knowledge create), not arbitrary drag-and-drop.

---

## 8. Risks & Open Questions for Stage 3 Designer

### 8.1 Auth method — cookie vs bearer

**The risk:** Stage 1 §10.4 flagged that `requireUser`-only routes (knowledge,
templates, insights, mirror tokens, notifications, push subscribe, telegram
link, review, archive, chat events) have **no bearer-token path today**.
Cookies via OkHttp `CookieJar` work but are fragile when `APP_URL` is HTTPS
(secure flag) and the app's WebView origin or backend origin shifts.

**Recommendation:** **Add a new `/api/auth/native/token` endpoint** that
exchanges email + password (or an existing session cookie) for a long-lived
bearer token tied to a per-device identifier. Reuse the `mirror_tokens` table
with `scope='native'` (already CHECK-constrained to `('mirror','api')` — bump
the constraint to include `'native'`).

Additionally, **extend `requireUser` preHandler to accept either cookie OR
`Authorization: Bearer <native-scope-token>`** so the entire API is reachable
without cookies. This is one Fastify helper change + a small SQL migration.

Stage 3 should design the **token rotation flow** (refresh? per-device list
in Settings? remote revoke?). Stage 4 backend must add the endpoint.

**Fallback:** If Stage 4 cannot add the endpoint, use OkHttp `CookieJar` +
ensure all requests use the HTTPS `APP_URL`; document that login is the only
way to recover from a revoked cookie.

### 8.2 Push provider — FCM only

**Recommendation:** **FCM-only for native.** Do not tunnel web-push through
a server-side bridge — that doubles the push code paths and the web-push
endpoint format is incompatible with FCM.

**Stage 4 backend additions required:**

- New `fcm_subscriptions(id, user_id, token TEXT UNIQUE, device_label, created_at, last_seen_at)` table.
- New `POST /api/push/fcm/subscribe { token, device_label? }` endpoint.
- New `DELETE /api/push/fcm/subscribe { token }` endpoint.
- Modify `pushToUser(uid, payload)` (`server/src/push.ts`) to fan out to BOTH
  `push_subscriptions` (web-push) AND `fcm_subscriptions` (FCM). Encode payload
  per platform.
- On FCM 404 / `UNREGISTERED` response, delete the row (mirrors web-push 410).

**No change** to the call sites in `routes/chat.ts` etc. — they continue to
call `pushToUser`.

### 8.3 Voice capture — add to MVP

**Recommendation: YES, add voice to MVP** (upgrade from F-127's PWA stub).
The Telegram bot already proves the pipeline (Whisper transcribe → propose →
confirm). Mirror it natively.

**Stage 4 backend addition required:**

- New `POST /api/cards/from-audio` (multipart, `file` field with `audio/*`
  MIME). Server: save attachment with `kind='audio'`, transcribe via Whisper
  (`whisper-1` already wired in `ai/whisper.ts`), then run `proposeFromText`
  on transcript, create card with `needs_review=TRUE`, attach the audio file,
  swap title/desc on success (mirrors `/api/cards/from-image` exactly).
- Add `audio/ogg`, `audio/m4a`, `audio/mp4` to allowed MIMEs (current list
  is image-only per Stage 1 §6.3).
- Bump `ATTACHMENT_MAX_BYTES` for audio path or use a separate cap
  (e.g. `AUDIO_MAX_BYTES=10_000_000`).

Native client uses `AudioRecord` (PCM 16-bit, mono, 16 kHz) → encodes to M4A
via `MediaCodec` → uploads. Recording UI: tap-and-hold the mic chip
(WhatsApp-style); release to send. Slide left to cancel.

### 8.4 Chain visualization — WebView in V2, native in V3

**Recommendation: V2 ships a `WebView` embed of `/chain/:id`** (the existing
ReactFlow viz). This is cheap (~1 week of work to wire the WebView with
auth headers) and visually identical to desktop. The trade-offs:

- WebView needs cookie/bearer injection. With §8.1's bearer approach, inject
  `Authorization` via `WebViewClient.shouldInterceptRequest`.
- Pan/zoom from ReactFlow works in WebView (touch-enabled).
- Long-press → menu doesn't conflict.
- Performance on large chains (depth=6) is acceptable per Stage 1 §6.9 (BFS
  visibility-filtered, default depth=2).

**V3 considers a native Compose graph** (e.g. via `androidx.graphics` or a
third-party graph lib). Defer until V2 user feedback proves WebView is
insufficient.

### 8.5 Knowledge tab — read-only + share-intent create in MVP

**Recommendation: agreed.** MVP ships:

- Knowledge list (read-only, GET `/api/knowledge`).
- Knowledge detail (read-only, GET `/api/knowledge/:id`).
- Share intent → create via `KnowledgeEditDialog` (POST `/api/knowledge`).
- WS knowledge events (so share-intent creates from other devices show up).

**Deferred to V1:** scope filter, tag chips, search, tag input, edit existing,
link management, refetch, archive.

This concentrates MVP work on the **two killer Knowledge paths** — read what
exists, and add via share — while leaving CRUD complexity for V1.

### 8.6 WebSocket lifecycle on mobile

**Open question for Stage 3:** Should the app keep WS open via a foreground
service, or treat WS as best-effort while in foreground and rely on FCM for
background updates?

**Recommendation: WS in foreground only, FCM in background.** A foreground
service for WS would persist a notification (Android requires it) and drain
battery. FCM is purpose-built for background delivery. WS stays connected
only while the activity is visible.

**Stage 3 wireframes must show:** offline indicator in TopAppBar when WS is
disconnected during foreground use; auto-reconnect with backoff (matches
F-991 client behavior).

### 8.7 Activity log paging

**Open question:** `GET /api/cards/:id/events` returns the FULL list
(Stage 1 §11.12). For long-lived cards this is unbounded.

**Recommendation:** **MVP loads full list** (matches PWA today) — the typical
card has < 50 events. Add `?limit=&before_id=` paging in V1 if Stage 6 testing
finds slow loads on chatty cards. Native client should display only the most
recent 50 events; tap "Load older" loads the next 50.

### 8.8 Open Question: Live Notifications (Android 14+)

Should V2 / V3 implement Live Notifications for an in-progress card (similar
to navigation apps showing progress)? It would surface the current "in
progress" card with quick actions (mark done, snooze).

**Recommendation:** revisit after V1 ship based on user feedback. If yes,
requires a foreground service tied to the card's lifecycle, which is heavy.
Could be a delightful native-only feature.

---

STAGE_COMPLETE: pm mvp_rows=188 v1_rows=263 v2_rows=339 out_of_scope=160 journeys=6
