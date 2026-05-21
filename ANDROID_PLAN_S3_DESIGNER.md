# ANDROID PLAN — STAGE 3: DESIGNER

Upstream: `ANDROID_PLAN_S1_ANALYST.md` (51 routes, 18 tables, 19 WS events) +
`ANDROID_PLAN_S2_PM.md` (MVP=188 rows, V1=263, V2=339, 6 journeys, target Pixel
6a / Android 13+). Binding design constraints: **premium > rainbow**, **motion
on interaction only**, **no idle ambient motion of any kind** (including no
mascot — see §1.10 deviation), **emoji only in user content, never in chrome**,
**translate web's design language, do not transliterate**.

This document is engineering-grade. Every interactive element is traced to
its F-NNN row and to the API / WS event that backs it, so Stage 5 Engineer
has nothing left to invent.

---

## 1. Design Language

### 1.1 Choice: Material 3 (Compose Material3 — `androidx.compose.material3:1.3.x`)

Justified because:

- **Native idioms by default** — `NavigationBar`, `TopAppBar`, `ModalBottomSheet`,
  `DatePickerDialog`, `SnackbarHost`, `SegmentedButton`, `FloatingActionButton`
  match user muscle memory and ship with proper insets, gesture handling, and
  back-press behavior.
- **Dynamic Color** (Android 12+) optional pathway — we ship a fixed seed-derived
  palette as the *brand* default and let the user opt-in to system tones (V1
  Settings toggle, not MVP).
- **Motion specs** — built-in spring physics (`SpringSpec`, `tween`), shared-axis
  transitions, and `AnimatedVisibility` give us premium feel without bespoke
  animation code.
- **Accessibility defaults** — `Modifier.semantics`, automatic 48 dp touch-target
  enforcement, dynamic font scaling (`Configuration.fontScale`) all work without
  extra wiring.
- **Maturity** — Compose Material3 1.3 (Q4 2025 stable) covers every component
  we need; no fallback to classic Views required.

If Stage 4 picks **React Native + Expo Router** instead (open per §9), the same
token system maps to `react-native-paper` v5 (M3 port) — every spec below
lists the RN equivalent where the path diverges.

### 1.2 Brand seed color

Web app's accent is violet `#7C4DFF` (analyzed from `web/src/styles.css` —
`--accent-violet`). Android brand seed:

```
SeedColor: #6C4CFF     // saturated violet, neighbor of web's accent
```

This seed is fed to Material 3's `dynamicColorScheme(seedColor)` to derive the
full token set. Both light and dark themes derive from the same seed so the
brand reads identical across modes.

### 1.3 Color tokens (light + dark)

| Token | Light | Dark | Used for |
|---|---|---|---|
| `primary` | `#6C4CFF` | `#C7B2FF` | FAB, primary buttons, active nav tab, mention `@ai` badge |
| `onPrimary` | `#FFFFFF` | `#2A1A78` | Text/icon on `primary` |
| `primaryContainer` | `#E6DFFF` | `#4D3CB8` | Selected chip, lane drop highlight, suggestion-chip background |
| `onPrimaryContainer` | `#1B0466` | `#E6DFFF` | Text on `primaryContainer` |
| `secondary` | `#5A6377` | `#BFC6DC` | Subdued buttons, secondary chips |
| `tertiary` | `#7A5260` | `#EBB3C2` | Highlights (e.g. share avatar tint, AI sparkle) |
| `surface` | `#FBF8F4` (ceramic) | `#161618` | Card background |
| `onSurface` | `#1C1B1F` | `#E6E2DA` | Body text |
| `surfaceVariant` | `#E7E2DB` | `#2A2A2D` | Hairline outlines, dividers |
| `onSurfaceVariant` | `#49454F` | `#CAC4D0` | Caption, secondary text |
| `surfaceContainerHigh` | `#F1ECE5` | `#222226` | Sheets, dialogs |
| `outline` | `#79747E` | `#938F99` | Card outline, input border |
| `error` | `#BA1A1A` | `#FFB4AB` | Destructive, error states |
| `errorContainer` | `#FFDAD6` | `#93000A` | Error banner background |

Ceramic neutral `#FBF8F4` is a sibling translation of the web's bone-white
ceramic surface (`--surface-ceramic`) — warm enough to read as paper, never as
cold gray. Dark theme keeps a near-black `#161618` rather than `#000` to avoid
the harsh OLED contrast that reads as "AI slop."

### 1.4 Status lane accent palette

Four lane accents — used for the 3 dp left-edge bar (F-090), the lane-header
dot (F-071), the radial bloom (F-091), and the drop-target highlight (F-075).

| Lane | Light accent | Light bloom (6% α) | Dark accent | Dark bloom (8% α) | Symbol |
|---|---|---|---|---|---|
| `backlog` | `#94A3B8` (slate) | `rgba(148,163,184,0.06)` | `#7C8FA6` | `rgba(124,143,166,0.08)` | dot only |
| `today` | `#F59E0B` (amber) | `rgba(245,158,11,0.06)` | `#FBBF24` | `rgba(251,191,36,0.08)` | dot only |
| `in_progress` | `#6C4CFF` (brand violet) | `rgba(108,76,255,0.06)` | `#C7B2FF` | `rgba(199,178,255,0.08)` | dot only |
| `done` | `#10B981` (emerald) | `rgba(16,185,129,0.06)` | `#34D399` | `rgba(52,211,153,0.08)` | dot only |

Bloom = radial-gradient inside the card top-left, ~120 dp radius, opacity 6%
(light) / 8% (dark). Tasteful — never reads as "rainbow."

### 1.5 Typography

Fonts pulled via Google Fonts Compose `GoogleFont.Provider` (Downloadable
Fonts API — keeps APK small per §6 success-metric < 25 MB).

| Role | Family | Weight | Size (sp) | Used for |
|---|---|---|---|---|
| Display | **Spectral** (serif) | 600 | 36 | Empty-state headings, weekly-review hero (V2) |
| Headline | Spectral | 600 | 24 | Screen titles in `TopAppBar`, modal sheet headers |
| Title | Spectral | 600 | 20 | Card titles on board tiles, knowledge titles |
| Body | **Inter** (sans) | 400 | 16 | Card descriptions, message bodies, form labels |
| Body emphasis | Inter | 500 | 16 | Selected nav label, primary button text |
| Label | Inter | 500 | 14 | Chip labels, button text |
| Caption | Inter | 400 | 12 | Timestamps, meta, helper text |
| Mono caption | **JetBrains Mono** | 500 | 11 | Card-id chip, lane counts, badge numbers, "✦ ai" tag |
| Mono small | JetBrains Mono | 400 | 13 | Knowledge body `<pre>` content (F-604) |

**Sibling-not-clone translation:** web uses Spectral as serif anchor + IBM Plex
Mono as monospace + system sans for body. Android substitutes JetBrains Mono
(more legible on small densities) and Inter (better Android rendering than
system sans). Identical *feel*: serif headlines as quiet typographic anchor,
mono numerals for data confidence.

Dynamic type scaling: respect `Configuration.fontScale` from 1.0 → 1.5x; clamp
above 1.5x to prevent layout breakage. Card titles cap at 28 sp even at 1.5x.

### 1.6 Elevation & shape

| M3 elevation | dp | Where |
|---|---|---|
| Level 0 | 0 | Board background, base surface |
| Level 1 | 1 | Cards at rest (hairline only — see below) |
| Level 2 | 3 | Pressed card, selected nav item |
| Level 3 | 6 | FAB, bottom sheet at rest |
| Level 4 | 8 | Bottom sheet dragged, snackbar |
| Level 5 | 12 | Dragging card (drag overlay) |

**Card shape:** 16 dp corner radius (`RoundedCornerShape(16.dp)`). At rest:
elevation 0, 1 dp `surfaceVariant` hairline outline. On press: elevation 2 +
3 dp accent-tinted shadow (color = lane accent at 24% α). On drag (long-press
lift): elevation 5 + 8 dp accent shadow + scale 1.02. Sibling translation of
web's "card with hairline + tinted bloom on hover" — adapted to the press,
not hover, because phone has no hover.

FAB shape: M3 default 16 dp radius, primary-tinted; **never** a perfect circle
(would read as iOS).

Chip shape: 8 dp radius (AssistChip default).

Sheet shape: 28 dp top radius (M3 default), `surfaceContainerHigh`.

### 1.7 Motion

| Token | Value | Used for |
|---|---|---|
| `duration.short` | 150 ms | Press scale, chip toggle, tooltip fade |
| `duration.medium` | 250 ms | Sheet open/close, snackbar enter, nav transition |
| `duration.long` | 400 ms | Shared-axis-Z screen change, dialog enter |
| `spring.gentle` | stiffness=`Spring.StiffnessMediumLow`, damping=`Spring.DampingRatioMediumBouncy` | Card press lift, FAB scale, AnimatedVisibility |
| `spring.snappy` | stiffness=`Spring.StiffnessMedium`, damping=`Spring.DampingRatioLowBouncy` | Lane swipe page transitions, suggestion-chip apply |
| `easing.standard` | `FastOutSlowInEasing` | Page transitions, fade |

**Reduced-motion:** read `Settings.Global.TRANSITION_ANIMATION_SCALE` and
`Settings.Global.ANIMATOR_DURATION_SCALE`. If either ≤ 0.5 (user has reduced
animations in system Accessibility), the app:
- Replaces spring animations with `tween(150, LinearEasing)` fades.
- Disables card press lift; just changes outline color.
- Disables shared-axis-Z; uses cross-fade only.
- AI insight "pending pulse" (F-096) replaced with static "Thinking…" text.

**Page transitions:**
- Forward push (e.g. Board → CardDetail): **shared-axis-Z forward** (new content
  scales 0.92→1.0 + fades in from 0→1; previous content fades 1→0.6 + scales
  1.0→1.08; offset Z = +30 dp). Compose: `materialSharedAxisZIn/Out`.
- Backward pop: reversed.
- Tab switch (Board ↔ Knowledge ↔ More): **cross-fade 200 ms**, no axis shift.
- Modal sheet: slide-up from bottom, 250 ms with `spring.gentle`.

**Card press:** scale 0.98 + elevation 0→2 + outline tint shift to lane accent
(200 ms gentle spring) + `HapticFeedbackType.LongPress` light tick (Android 13+
uses `HapticFeedbackConstants.CONTEXT_CLICK`).

**No idle motion anywhere.** No bouncing icons, no breathing badges (except
F-096 pulse on `pending` state, which IS state-driven not idle), no rotating
sparkle. The "✨" beside AI insight ready (F-097) is a static icon, no pulse.

### 1.8 Iconography

**Material Symbols (Rounded variant)** via `androidx.compose.material:material-icons-extended`.

Round corners = warmer than the Outlined default; sibling translation of web's
soft-edge ceramic feel. Two-tone NEVER used.

Reserved system symbols:
| Use | Symbol | Color token |
|---|---|---|
| Board tab | `dashboard` (rounded) | `primary` when selected, `onSurfaceVariant` otherwise |
| Knowledge tab | `bookmark` | same |
| More tab | `more_horiz` | same |
| FAB | `add` | `onPrimary` on `primary` |
| Card status accent | colored 8 dp `Box` (filled circle) | per-lane accent |
| Search | `search` | `onSurfaceVariant` |
| Settings | `settings` (rounded) | `onSurfaceVariant` |
| Notifications | `notifications` / `notifications_active` when unread | `onSurfaceVariant` / `primary` |
| Telegram source | `forward_to_inbox` (rounded) | `onSurfaceVariant` |
| AI summary | `auto_awesome` (rounded) | `tertiary` (NOT animated at rest) |
| Needs review | `priority_high` | `error` |
| Camera capture | `photo_camera` | `onSurfaceVariant` |
| Voice capture | `mic` | `onSurfaceVariant` |
| Template capture | `bookmarks` | `onSurfaceVariant` |
| Drag handle (sheet) | M3 default 32x4 dp pill | `outline` |
| Image attachment | `image` | `onSurfaceVariant` |
| File attachment | `description` | `onSurfaceVariant` |
| Knowledge URL | `link` | `onSurfaceVariant` |
| Knowledge fetching | `hourglass_top` | `tertiary` |
| Knowledge fetch failed | `warning` (rounded) | `error` |

**Emoji rule:** NEVER in chrome (lane headers, buttons, badges, tab labels,
empty-state CTAs). Emoji only renders inside user-authored content (card
title, description, message body, knowledge body). The web app's `🤔` `✨` `💬`
`📎` `🔗` etc. are all replaced with Material Symbols per the table above.

### 1.9 Accessibility

- All touch targets ≥ 48 dp (enforced via `Modifier.minimumInteractiveComponentSize()`).
- `contentDescription` on every IconButton, every Card, every chip with no
  visible label. Cards expose action labels via `Modifier.semantics { customActions = ... }`
  — see §4 KanbanCard component states.
- Contrast: text on `surface` is `onSurface` (`#1C1B1F` on `#FBF8F4`) = ratio
  17.6:1, exceeds AAA. Chip labels on `primaryContainer` = ratio 12.8:1 (AAA).
- Dynamic type 1.0..1.5x supported; layouts use `FlowRow` and adaptive padding
  rather than fixed heights.
- TalkBack: every screen has a single "main action" hint at the top. Card list
  rows have semantic actions `Open`, `Move to <lane>`, `Archive`.
- Color is never the sole carrier of meaning: lane accent + lane name + lane
  position all communicate lane membership; due-date pill has tone + verb
  ("Overdue 2d") not just a color.
- High-contrast mode: when `AccessibilityManager.isHighTextContrastEnabled()`,
  bump outlines from `surfaceVariant` (low contrast) to `outline` (mid contrast).
- Reduced-motion respected (§1.7).
- Minimum text size 11 sp; no decorative-only text below 12 sp.

### 1.10 Mascot deviation (BINDING)

The pipeline prompt allowed an "optional WALL-E-style mascot." **The
project memory `feedback_mascot_walle.md` records this as fully rejected
across four iterations** (pearl blob → WALL-E → Bit TV-head → slow inspect)
because *any* ambient peripheral motion drained attention from the cards.

**Decision: NO mascot anywhere in the Android app, in any state, in any
release.** Empty states use **content** instead — better copy, brand mark,
illustrated empty-state glyphs (static line-art, no animation). This honors
the project's harder-won design constraint over the pipeline brief's softer
suggestion.

---

## 2. Navigation Graph

### 2.1 Stack choice

**Decision: Jetpack Compose Navigation (`androidx.navigation:navigation-compose:2.8.x`)**
on the assumption Stage 4 picks native Kotlin (recommended path).

If Stage 4 picks **React Native + Expo**, the same routes map 1:1 to **Expo
Router file-based** routes:

```
app/
  (auth)/login.tsx                         ← LoginScreen
  (tabs)/
    _layout.tsx                            ← Bottom tab bar
    board/
      index.tsx                            ← BoardScreen
      card/[id].tsx                        ← CardDetailScreen
      chain/[id].tsx                       ← ChainScreen (V2)
    knowledge/
      index.tsx                            ← KnowledgeListScreen
      [id].tsx                             ← KnowledgeDetailScreen
      edit.tsx                             ← KnowledgeEditScreen
    more/
      index.tsx
      settings.tsx
      archive.tsx                          ← V1
      review.tsx                           ← V2
  capture.tsx                              ← Modal: CaptureSheet
  notifications.tsx                        ← Modal: NotificationListScreen
  share/knowledge.tsx                      ← ShareTargetScreen
```

The screen specs in §3 are framework-agnostic — they describe layout, states,
and per-element interactions, not Compose APIs.

### 2.2 Top-level shell

**Material 3 NavigationBar** (bottom), 3 tabs. Each tab owns an independent
`NavHost` so deep links land *inside* the appropriate stack (preserving
back-stack semantics).

| Tab | Label | Icon (rounded) | Default route |
|---|---|---|---|
| 1 | `Board` | `dashboard` | `board` |
| 2 | `Knowledge` | `bookmark` | `knowledge` |
| 3 | `More` | `more_horiz` | `more` |

**Visual states:** selected tab uses `primary` color + `Inter 500 14 sp` label;
unselected uses `onSurfaceVariant` + `Inter 400 14 sp`. Active-tab pill
indicator (M3 default) tinted `primaryContainer`. Bar surface is
`surfaceContainerHigh` with elevation 2.

**Bar visibility:** hidden on `LoginScreen`, `ShareTargetScreen`,
`CaptureSheet` (modal), and `CardDetailScreen` (TopAppBar dominates instead).

### 2.3 Route tree

```
RootNavHost
├── LoginScreen                                  (gate; full-screen)
└── MainShell (NavigationBar wrapper)
    ├── BoardNav
    │    ├── BoardScreen                         (default)
    │    ├── CardDetailScreen/{id}
    │    ├── ChainScreen/{id}                    (V2 — WebView embed)
    │    └── CaptureSheet                        (modal bottom sheet, above bar)
    ├── KnowledgeNav
    │    ├── KnowledgeListScreen                 (default)
    │    ├── KnowledgeDetailScreen/{id}
    │    └── KnowledgeEditScreen?id={id?}        (modal, full-screen route)
    └── MoreNav
         ├── MoreScreen                          (default)
         ├── SettingsScreen
         ├── ArchiveScreen                       (V1)
         ├── WeeklyReviewScreen                  (V2)
         └── NotificationListScreen              (modal, full-screen route)
                  ↑ also reachable from any TopAppBar bell icon

Modal/global routes (above NavigationBar):
├── ShareTargetScreen                            (intent handler)
└── LoginScreen                                  (auth gate)
```

### 2.4 Deep link map

App registers in `AndroidManifest.xml`:

```xml
<intent-filter android:autoVerify="true">
  <action android:name="android.intent.action.VIEW"/>
  <category android:name="android.intent.category.DEFAULT"/>
  <category android:name="android.intent.category.BROWSABLE"/>
  <data android:scheme="https" android:host="kanban.YOUR-DOMAIN"/>
  <data android:scheme="https" android:host="kanban.YOUR-DOMAIN" android:pathPrefix="/m/card/"/>
  <data android:scheme="https" android:host="kanban.YOUR-DOMAIN" android:pathPrefix="/knowledge/"/>
</intent-filter>
<intent-filter>
  <action android:name="android.intent.action.VIEW"/>
  <category android:name="android.intent.category.DEFAULT"/>
  <category android:name="android.intent.category.BROWSABLE"/>
  <data android:scheme="kanban"/>
</intent-filter>
<intent-filter>
  <action android:name="android.intent.action.SEND"/>
  <category android:name="android.intent.category.DEFAULT"/>
  <data android:mimeType="text/plain"/>
  <data android:mimeType="image/*"/>
</intent-filter>
```

| URL / scheme | Resolves to | Landing |
|---|---|---|
| `kanban://card/{id}` | Board tab → `CardDetailScreen/{id}` | Detail screen with chat scrolled to bottom |
| `kanban://knowledge/{id}` | Knowledge tab → `KnowledgeDetailScreen/{id}` | Detail screen |
| `https://kanban.YOUR-DOMAIN/m/card/{id}` (App Link, autoVerified via `assetlinks.json`) | Board tab → `CardDetailScreen/{id}` | Same |
| `https://kanban.YOUR-DOMAIN/knowledge/{id}` | Knowledge tab → `KnowledgeDetailScreen/{id}` | Same |
| `https://kanban.YOUR-DOMAIN/?card={id}` (legacy `F-867`) | Board tab → `CardDetailScreen/{id}` | Same (back goes to Board, not browser) |
| `ACTION_SEND` (text/plain, image/*) | `ShareTargetScreen` (modal) | Routes to `KnowledgeEditScreen` (URL/text) or `CaptureSheet` (image) |
| `kanban://capture` (App Shortcut, V2) | `CaptureSheet` | Text capture focused |
| FCM `data.cardId={id}` (notification tap) | Board tab → `CardDetailScreen/{id}` | Same |

If a deep link arrives while the user is **not authenticated**, route to
`LoginScreen` with the target stored in `SavedStateHandle["pendingDeepLink"]`;
after auth success, replay the deep link.

---

## 3. Screen-by-Screen Layout Specs

Every interactive element is keyed to its **F-NNN** registry id, its **API**
endpoint (from Stage 1 §2), and its **WS** events (from Stage 1 §3.2). Stage
5 Engineer wires from this table; no inference required.

Wireframe conventions: `┌─┐` boxes, `[...]` for tappable buttons/inputs,
`«...»` for icons, `║` for bottom sheet edge, ASCII only.

---

### 3.1 LoginScreen — `F-001..F-011`

Full-screen, no tab bar. Single column, vertical-center on tall phones,
top-aligned with keyboard padding on shorter.

**Layout:**

```
┌──────────────────────────────────┐
│                                  │  ← status bar
│                                  │
│              «K»                 │  F-001 brand mark (32 dp, primary on surface)
│           SmartKanban            │  F-001 wordmark (Spectral 600 24 sp)
│         SIGN IN  ·  CREATE       │  F-002 mode label (mono caption 11 sp)
│                                  │
│   ┌──────────────────────────┐   │  ← visible only in CREATE mode
│   │ Full name                │   │  F-004 OutlinedTextField, imeAction Next
│   └──────────────────────────┘   │
│   ┌──────────────────────────┐   │
│   │ Short name (max 16)      │   │  F-005 OutlinedTextField, maxLength 16
│   └──────────────────────────┘   │
│   ┌──────────────────────────┐   │
│   │ Email                    │   │  F-006 KeyboardType Email
│   └──────────────────────────┘   │
│   ┌──────────────────────────┐   │
│   │ Password (min 6)    «∅»  │   │  F-007 visualTransformation toggle
│   └──────────────────────────┘   │
│                                  │
│   ┌─error banner (when set)─┐    │  F-008 AnimatedVisibility errorContainer
│                                  │
│   ┌──────────────────────────┐   │
│   │       Sign in / Create   │   │  F-009 Button, primary, disabled while busy
│   └──────────────────────────┘   │
│                                  │
│   New here? [Create account]     │  F-010 TextButton flips mode
│                                  │
│        (decorative bloom V1)     │  F-003 radial gradient backdrop (V1)
└──────────────────────────────────┘
```

**Components (top to bottom):**

1. **Brand mark + wordmark** — `F-001` — static.
2. **Mode label** — `F-002` — text changes "SIGN IN" / "CREATE ACCOUNT".
3. **Full name input** (CREATE only) — `F-004` — Tap to focus; `imeAction=Next`.
4. **Short name input** (CREATE only) — `F-005` — Tap; max length 16.
5. **Email input** — `F-006` — Tap; `KeyboardType.Email`.
6. **Password input** — `F-007` — Tap; tap eye icon toggles visibility.
7. **Inline error banner** — `F-008` — AnimatedVisibility; reads any 4xx error from
   `POST /api/auth/login` or `POST /api/auth/register`.
8. **Submit button** — `F-009` — Tap → `POST /api/auth/login` or
   `POST /api/auth/register`; disabled while in-flight, shows
   `CircularProgressIndicator`.
9. **Mode toggle** — `F-010` — TextButton; tap flips Local state `mode: 'login'|'register'`.

**States:**

| State | Trigger | Visual |
|---|---|---|
| Default (SIGN IN) | Initial | Email + password fields visible, button "Sign in" |
| Default (CREATE) | After toggle | All 4 fields visible, button "Create account" |
| Busy | After submit until response | Button disabled, spinner inside button |
| Error | 400/401/409 from API | Error banner above button + specific copy |
| Success | 201/200 | Navigate per `F-011` (deep link or Board) |

**Empty state copy:** N/A (login is always populated by user).

**Error copy (per status):**
- 400 missing: "Fill in every field to continue."
- 401 (login): "Wrong email or password. Try again."
- 403 (register, signup disabled): "This board is closed to new accounts. Ask the owner for an invite."
- 409 (email taken): "That email already has an account. Sign in instead?"
- network/5xx: "Couldn't reach the board. Check your connection."

**APIs:**
- `POST /api/auth/login` (login mode)
- `POST /api/auth/register` (create mode)

**WS:** none (WS connects only after auth success).

**F-011 redirect:** if `SavedStateHandle["pendingDeepLink"]` is set, navigate
there; else `BoardScreen`.

---

### 3.2 BoardScreen — `F-050..F-058, F-070..F-078, F-090..F-110`

The home of the app. Single visible lane on phone, swipe between lanes.
TopAppBar holds search + scope + notification + profile entry. FAB anchors
the capture flow.

**Layout:**

```
┌──────────────────────────────────────┐
│ « = »  Backlog  ▾   «🔍» «🔔₂» «👤» │  TopAppBar (F-663, F-027, F-030, F-032 mapped)
├──────────────────────────────────────┤
│  ●  Today                       12 │  F-663 lane title row (tap → lane sheet)
│ ─────────────────────────────────── │
│ ┌──────────────────────────────────┐│  F-666 LazyColumn of cards
│ │║ Card title (Spectral 20)       ││  F-090 left accent bar │ F-098 title
│ │║ short description preview…     ││  F-099 2-line clamp
│ │║ ✦ai  needs-review              ││  F-094, F-095
│ │║ #tag #another  [📎2] [💬3]     ││  F-101 chips, F-103, F-104
│ │║ Due: Today    ⟰telegram   ⊙⊙⊙ ││  F-102, F-093, F-107 stack
│ └──────────────────────────────────┘│
│ ┌──────────────────────────────────┐│
│ │║ ...                              ││
│ └──────────────────────────────────┘│
│       (more cards…)                  │
│                                      │
│                              ┌──────┐│
│                              │  +   ││  F-057/F-673 FAB (primary)
│                              └──────┘│
├──────────────────────────────────────┤
│ « ⊞ » Board   « 🔖 » Knowledge  « ⋯» │  NavigationBar
└──────────────────────────────────────┘
```

Horizontal swipe across the body pages between lanes (`HorizontalPager`).
Lane pill at top updates with page index. Page indicator dots NOT shown
(redundant with the title pill); haptic light tick on page settle.

**Components (top to bottom, then left to right):**

1. **TopAppBar leading icon** — opens scope sheet (replaces `F-661`/`F-023` chip
   with a hamburger pattern on phone).
2. **Lane title row** (`F-663`, `F-070..F-073`, `F-077`):
   - Lane-accent dot (8 dp, lane color)
   - Lane name (Spectral 600 20 sp)
   - Lane count badge (JetBrains Mono 11 sp on `primaryContainer` pill)
   - Disclosure caret `▾`
   - Tap whole row → lane picker `ModalBottomSheet` (F-670).
3. **TopAppBar trailing actions:**
   - Search icon (`F-027`) — Tap collapses TopAppBar title and reveals
     `OutlinedTextField`; debounced local filter on cached cards.
   - Notification bell (`F-030`, `F-340`, `F-341`) — Tap → navigate to
     `NotificationListScreen`; shows `Badge` count when unread > 0; icon
     swaps to `notifications_active` (filled).
   - Avatar IconButton (`F-032`) — Tap → profile `ModalBottomSheet` with
     rows `F-033` name/email, `F-034` Settings, `F-035` Sign out.
4. **Search field** (`F-056`, `F-665`) — When visible: filter local card list.
5. **Card list** (`F-666`) — `LazyColumn` of `KanbanCard`. Pull-to-refresh
   (`PullToRefreshContainer`) triggers `GET /api/cards?scope=<scope>`.
6. **Empty-lane state** (`F-077`, `F-671`) — Italic copy when current lane
   has zero cards (see Empty state copy below).
7. **Capture FAB** (`F-057`, `F-673`) — Bottom-right above NavigationBar, 56 dp,
   primary tint. **Tap** → opens `CaptureSheet`. **Long-press** → 4-row mini
   menu (Text / Photo / Voice / Template — see §5 Interaction Patterns).
8. **NavigationBar** (`F-674`, `F-675`) — 3 tabs (V1 adds Archive as tab 3).

**Per-card interactions (RULE 9 verb check — every verb listed):**

| Verb | Trigger | Action | API/WS |
|---|---|---|---|
| Tap | single-tap anywhere on card body | Navigate to `CardDetailScreen/{id}` | n/a |
| Long-press | press 500 ms | Open `MobileCardActions` `ModalBottomSheet` (F-679) | n/a |
| Long-press-and-drag | hold 500 ms then drag | Drag card with shadow + accent ghost; drop on adjacent lane edge to switch lane, OR drop in TrashDropZone (V1, F-840) | `PATCH /api/cards/:id` `{status, position}` |
| Tap tag chip | tap chip | Filter board by tag (V1 — MVP just shows the chip) | local |
| Tap due pill | tap pill | Open `DatePickerDialog` to change due (V1; MVP read-only) | `PATCH /api/cards/:id` |
| Tap attachment count | tap "📎 N" | Scroll to attachments section in card detail | nav |
| Tap unread badge | tap "💬 N" | Open card detail, scroll to bottom of timeline | nav |
| Tap image thumb | tap thumb | Open card detail with attachment viewer | nav |

**States:**

| Screen state | Trigger | Visual |
|---|---|---|
| Loading | Initial mount or pull-refresh | `LoadingSkeleton` rows (5x card shape, shimmer ≤ 1 cycle then static) |
| Empty (any lane) | API returned 0 cards for current lane | Empty-state block (see copy) |
| Empty (whole board, brand new user) | All 4 lanes empty | Onboarding empty state with arrow pointing at FAB |
| Loaded | Cards present | Cards rendered |
| Error | GET cards failed | Snackbar "Couldn't load cards" + Retry action |
| Offline (WS down) | WS disconnected mid-foreground | TopAppBar grows a subtle `cloud_off` icon (no banner, no panic) |

**Empty state copy (per lane):**

| Lane | Heading (Spectral 24) | Body (Inter 14) | CTA |
|---|---|---|---|
| Backlog | "Nothing's parked here." | "Backlog holds ideas you'll get to later." | [Capture something] → FAB |
| Today | "Today is open." | "Decide what matters today — pull from Backlog or capture fresh." | [Capture] |
| In Progress | "Quiet on the work front." | "Cards land here when you start them." | [Open Today] |
| Done | "No wins yet." | "Move cards to Done as you finish them. Reviews live in More → Weekly Review." | (none) |

**APIs consumed:**
- `GET /api/cards?scope=personal` on mount + pull-refresh
- `GET /api/messages/unread` on mount + every WS card.message/ai_response
- `GET /api/notifications` for bell count

**WS events:**
- `card.created`, `card.updated`, `card.deleted` → reconcile local cache
- `card.message`, `card.ai_response` → update unread badge
- `insight.queued/updated/failed` → update per-card `✨` indicator

**Per-element APIs:**
- FAB tap: opens CaptureSheet (no API)
- Scope sheet pick: re-call `GET /api/cards?scope=<picked>`
- Pull-refresh: same GET
- Profile sheet → Sign out: `POST /api/auth/logout` → `LoginScreen`

---

### 3.3 CaptureSheet — `F-120..F-131`

`ModalBottomSheet` from bottom. Half-expanded by default with text field
focused; drag handle reveals expand for template/photo/voice options.

**Layout:**

```
║════════════════════════════════════║  drag handle (M3 default 32x4)
║                                    ║
║  «●» Today   ▾                     ║  F-120 FilterChip lane (tap → lane sheet)
║                                    ║
║  ┌──────────────────────────────┐  ║  F-121 OutlinedTextField, focused on open
║  │ Capture as card…             │  ║
║  └──────────────────────────────┘  ║
║                                    ║
║  «📷» «✱» «🎙»          «→»        ║  F-125, F-126, F-127, F-123 send
║   Photo  Template  Voice            ║
║                                    ║
║  Tip: type /name to use a template ║  F-124 caption (Inter 12, onSurfaceVariant)
║                                    ║
║════════════════════════════════════║
```

**Components (top to bottom, left to right):**

1. **Drag handle** — `F-703` style — Drag to expand/collapse.
2. **Lane chip** (`F-120`) — Tap → opens **Lane picker sheet** (`F-129`,
   `F-670`) listing the 4 lanes with count badges (`F-130`).
3. **Draft input** (`F-121`) — Tap focuses; `imeAction=Send` (`F-122`); typing
   `/name` parses on send (`F-124`).
4. **Photo button** (`F-125`) — Tap → launches CameraX `ActivityResultContract`;
   on result: POST `/api/cards/from-image` (multipart).
5. **Template button** (`F-126`) — Tap → opens **Template picker sheet**
   (`F-128`) listing `GET /api/templates`.
6. **Voice button** (`F-127`) — **Tap-and-hold** records audio; release sends
   (WhatsApp-style); slide left to cancel. POST `/api/cards/from-audio` (new
   endpoint per Stage 2 §8.3).
7. **Send button** (`F-123`) — Visible when text non-empty; tap → POST
   `/api/cards` with `{ title, status, source: 'manual' }`. Color: primary
   when active, `onSurfaceVariant` when input empty.
8. **Backdrop scrim** (`F-131`) — Tap dismisses sheet.

**States:**

| State | Trigger | Visual |
|---|---|---|
| Default | Sheet opens | Lane=current visible lane, text empty, send dim |
| Typing | User types | Send → primary tint; character count appears at 240+ |
| Slash-template parsed | Text starts `/x` | Send tooltip "Will instantiate template: <name>" |
| Sending | After tap send | Sheet stays open with spinner over send; disabled |
| Success | 201 | Sheet auto-dismisses with light haptic; snackbar "Card saved" |
| Error | 4xx/5xx | Inline error caption below input; sheet stays open |
| Photo flash | After photo capture returns | Send button shows "Uploading…" |
| Voice recording | Hold mic | Mic enlarges, waveform displays, cancel hint slides in |

**Empty state copy:** N/A (the sheet itself is the empty state).

**APIs:**
- `POST /api/cards` (text capture)
- `POST /api/cards/from-image` (photo capture)
- `POST /api/cards/from-audio` (voice capture — new endpoint)
- `GET /api/templates` (template picker open)
- `POST /api/templates/:id/instantiate` (template send)

**WS:** `card.created` arrives ~200 ms later → BoardScreen reconciles
optimistically (capture sheet already dismissed by then).

---

### 3.4 CardDetailScreen — `F-150..F-183, F-720..F-740`

Full-screen route, NOT a modal (sibling translation of EditDialog). Scrollable
single column. TopAppBar with back + actions; bottom-anchored chat input
becomes sticky when chat section scrolls into view.

**Layout:**

```
┌──────────────────────────────────────┐
│ ←  Card    [ID·8a3f]   «🧬» «📱» «⋯»│  F-152, F-153, F-154, F-158, F-155
├──────────────────────────────────────┤
│                                      │
│  ┌────────────────────────────────┐ │  F-157 title (Spectral 20)
│  │ Card title here                │ │
│  └────────────────────────────────┘ │
│                                      │
│  Status ─────────────────────────── │  F-724 4-button row
│  [ Backlog ][ Today ][ In Pgs ][Done]│
│                                      │
│  Description ────────────────────── │  F-161/F-725 multiline
│  ┌────────────────────────────────┐ │
│  │ Free text body…                │ │
│  └────────────────────────────────┘ │
│                                      │
│  Tags (comma-separated) ─────────── │  F-162/F-726
│  ┌────────────────────────────────┐ │
│  │ #design, #urgent               │ │
│  └────────────────────────────────┘ │
│                                      │
│  Due ──────────────────────────────  │  F-171/F-728
│  [ 2026-05-22  ✕ ]   [Pick…]         │  F-172 clear button
│                                      │
│  ✨ AI Insights ─────────────────── │  F-163 / §3.5
│  ┌────────────────────────────────┐ │
│  │ [Brainstorm this card]         │ │  F-202 button (or panel content)
│  └────────────────────────────────┘ │
│                                      │
│  📎 Attachments (3) ──────────────── │  F-173 header
│  ┌──────┐┌──────┐┌──────┐┌─────┐    │  F-731 grid 3 cols
│  │ img  ││ img  ││ +Add │      │    │  F-732 + tile
│  └──────┘└──────┘└──────┘            │
│                                      │
│  Assignees ──────────────────────── │  F-176/F-729 FlowRow
│  [✓ Naga] [ Saif ] [ Sruthi ]        │
│                                      │
│  Shared with ────────────────────── │  F-177/F-730 FlowRow
│  [ Naga ] [✓ Family ]    [Share now] │  F-178/F-179 button
│                                      │
│  Knowledge ──────────────────────── │  F-165, F-167
│  •  Linked KB item …      [×]        │  F-166
│  [+ Attach knowledge]                │  F-167
│                                      │
│  Activity ───────────────────────── │  F-180/F-737
│  ●  System: Created by you  · 3d ago │
│  ●  Saif: looks great  · 2h ago      │
│  ●  AI: Try setting due Mon  · 1h    │
│      [Set due Mon] [Move Today]      │  F-318 chips
│                                      │
│  ┌────────────────────────────┐  «→»│  F-324, F-325 sticky bottom
│  │ Message or @ai…            │     │
│  └────────────────────────────┘     │
└──────────────────────────────────────┘
```

**Components (every interactive verb):**

| F-NNN | Element | Verb | Action | API/WS |
|---|---|---|---|---|
| F-152 | TopAppBar back arrow | Tap | `navigateUp()` | n/a |
| F-153 | Card-id chip | Tap | Copy id to clipboard, snackbar "ID copied" | n/a |
| F-154 | Chain icon | Tap | Navigate to `ChainScreen/{id}` (V2; MVP: hidden) | n/a |
| F-155 | Close button (overflow `⋮`) → Sign out, refresh, archive | Tap | menu | various |
| F-158 | QR toggle (V2) | Tap | Show/hide QR overlay sheet (`F-159`/`F-160`) | `GET /api/cards/:id/qr.svg` |
| F-157 | Title TextField | Tap, type | Debounce 500 ms; PATCH | `PATCH /api/cards/:id {title}` |
| F-724 | Status row 4 FilterChips | Tap chip | Immediate PATCH | `PATCH /api/cards/:id {status, position}` |
| F-161 | Description TextField | Tap, type | Debounce 800 ms; PATCH | `PATCH /api/cards/:id {description}` |
| F-162 | Tags TextField | Type, blur | Parse comma-list, PATCH on blur | `PATCH /api/cards/:id {tags}` |
| F-171 | Due field `[date]` | Tap | Open `DatePickerDialog`; on pick → PATCH | `PATCH /api/cards/:id {due_date}` |
| F-172 | Due clear `✕` | Tap | PATCH null | `PATCH /api/cards/:id {due_date: null}` |
| F-163 | AI Insights section | (embedded — see §3.5) | | |
| F-731 | Attachment tile | Tap | Open lightbox with pinch-zoom + swipe-to-dismiss | n/a |
| F-732 | "+Add" tile | Tap | Open attachment-source `ModalBottomSheet` (F-733/4/5/6) | varies |
| F-733 | Sheet row "Camera" | Tap | CameraX intent; on result POST | `POST /api/cards/:id/attachments` |
| F-734 | Sheet row "Photo Library" | Tap | `PickVisualMedia`; on result POST | same |
| F-735 | Sheet row "Files" | Tap | `GetContent` image; POST | same |
| F-736 | Sheet "Cancel" | Tap | Dismiss sheet | n/a |
| F-176 | Assignee FilterChip | Tap | Toggle assignee; PATCH | `PATCH /api/cards/:id {assignees}` |
| F-177 | Share FilterChip | Tap | Toggle pending share | local until F-178 |
| F-178 | "Share now" button | Tap | PATCH with shares list; show spinner | `PATCH /api/cards/:id {shares}` |
| F-179 | "✓ Shared" caption | (auto) | After share PATCH success, replace button | (server-side notification fires) |
| F-165 | Linked knowledge row | Tap | Navigate to `KnowledgeDetailScreen/{id}` | n/a |
| F-166 | Remove linked KB `✕` | Tap | `AlertDialog` confirm → DELETE link | `DELETE /api/knowledge/:id/links/:card_id` |
| F-167 | "+ Attach knowledge" | Tap | Open knowledge-picker `ModalBottomSheet` | `GET /api/knowledge?q=` |
| F-168 | Picker search input | Type | Debounced GET | same |
| F-169 | Picker candidate row | Tap | POST link, dismiss sheet | `POST /api/knowledge/:id/links` |
| F-170 | "Save as knowledge" | Tap (when desc has URL) | POST knowledge from card | `POST /api/knowledge/from-card/:id` |
| F-180 | CardTimeline section | (embedded — see §3.x) | | |
| F-181 | TopAppBar back also "Cancel" | Tap | Same as F-152 (no separate Cancel since autosave) | n/a |
| F-182 | TopAppBar trailing "Save" | (auto via debounce) | No explicit save button (autosave) | n/a |
| F-183 | Long-press attachments grid → "Paste image" | Long-press | Read clipboard image, POST | `POST /api/cards/:id/attachments` |
| F-721 | TopAppBar card-id chip (mobile) | Tap | Same as F-153 | n/a |
| F-722 | "Saving…" caption | (auto) | Visible during debounce in-flight | n/a |
| F-738 | Archive button (overflow) | Tap | AlertDialog confirm → DELETE | `DELETE /api/cards/:id` |
| F-739 | (auto) WS handler | n/a | On `card.updated` merge into local form; on `card.deleted` → snackbar "This card was archived" + nav back |
| F-740 | Card-not-found | (auto) | If 404, replace whole screen with "This card no longer exists" + back |

**States:**

| State | Trigger | Visual |
|---|---|---|
| Loading | Initial mount before GET resolves | Skeleton: title bar, status row, three section placeholders |
| Loaded | GET success | All sections rendered |
| Saving | Any debounce write in-flight | Small "Saving…" caption next to title bar; saved-checkmark on success |
| Save error | PATCH 4xx/5xx | Inline red caption under affected field; field stays editable; Snackbar with Retry |
| 404 | GET returns 404 | F-740 screen |
| Conflict (race with WS) | WS updates while user is typing in description | Keep user's local edit; on save, server returns latest — show snackbar "Updated elsewhere — your edit was saved" |
| Deleted | WS card.deleted for current card | Snackbar "Card archived"; auto nav back after 1.5 s |

**Empty-state copies:**
- No attachments: tile reads "Add a photo, file, or paste from clipboard"
- No assignees: chips render with helper "Tap a name to claim this card"
- No shares: helper "Share to make this visible to others"
- No linked knowledge: helper "Link to a note or article"
- No timeline events: helper from F-320 "No activity yet. Say hello!"

**APIs:**
- `GET /api/cards/:id` on mount
- `GET /api/cards/:id/events` on mount (full list per Stage 2 §8.7)
- `PUT /api/cards/:id/events/read { last_read_id }` on mount + every new event
- `GET /api/cards/:id/knowledge` on mount
- `GET /api/cards/:id/insights` on mount
- `GET /api/users` for assignee/share chip labels (cached app-wide)
- Plus all PATCH/POST/DELETE per element table above

**WS events:**
- `card.updated` → merge fields not currently being edited
- `card.deleted` → snackbar + nav back
- `card.message`, `card.ai_response` → append to timeline + auto-scroll + mark read
- `insight.queued/updated/failed` → update embedded AI panel
- `knowledge.link.created/deleted` → refresh linked-knowledge list

---

### 3.5 AiInsightsCard (embedded section) — `F-200..F-215`

Embedded inside `CardDetailScreen` between Due and Attachments. Uses
`Surface` with tertiary-tinted background (1% alpha) and 16 dp corner.

**Layout (per state):**

```
First-run / no insights:
┌──────────────────────────────────────┐
│ ✨ AI Insights                       │  F-200 header
│ Get related cards, web findings,     │
│ and next-step suggestions tailored   │
│ to this card.                        │  F-201
│ ┌──────────────────────────────────┐ │
│ │  Brainstorm this card            │ │  F-202 primary button
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘

Pending:
┌──────────────────────────────────────┐
│ ✨ AI Insights                       │
│ ⏳  Thinking…                         │  F-204 (text-only when reduced motion)
└──────────────────────────────────────┘

Failed:
┌──────────────────────────────────────┐
│ ⚠ Couldn't generate insights.        │  F-205
│ <error message>                      │  F-214
│ [ Try again ]                        │
└──────────────────────────────────────┘

OK:
┌──────────────────────────────────────┐
│ ✨ AI Insights      (degraded: web   │  F-206 summary, F-207 caption
│                     unavailable)     │
│                                      │
│ Summary paragraph here…              │  F-206
│                                      │
│ Related items                        │  F-208
│ • Card: "Backend rate-limit hits"    │
│   why: directly addresses this       │
│   [Open]                              │  F-211
│ • https://example.com/foo  «📋» «↗»  │  F-209/F-210
│                                      │
│ Web findings                         │  F-212
│ • Article title …  why …  [Open ↗]   │
│                                      │
│ Next steps                           │  F-213
│ 1. Verify with X                     │
│ 2. Then patch Y                      │
│                                      │
│ [ 🔄 Re-run ]                        │  F-203
└──────────────────────────────────────┘
```

**Components (every verb):**

| F-NNN | Element | Verb | Action | API/WS |
|---|---|---|---|---|
| F-200 | Section header "✨ AI Insights" | — | (uses `auto_awesome` icon, NOT animated) | — |
| F-201 | Empty-state copy | — | static | — |
| F-202 | "Brainstorm this card" button | Tap | POST insight | `POST /api/cards/:id/insights/brainstorm` |
| F-203 | "Re-run" button | Tap | Same POST | same |
| F-204 | Pending state | (auto) | Text fade (animated only when not reduced-motion) | listens `insight.queued` |
| F-205 | Failed banner | (auto on `insight.failed`) | Surface tinted error | listens `insight.failed` |
| F-206 | Summary text | — | static | — |
| F-207 | "(degraded: web unavailable)" caption | — | shown when `degraded=true` | — |
| F-208 | Related items list | — | per-row see below | — |
| F-209 | Related URL "Open ↗" | Tap | Custom Tabs intent | n/a |
| F-210 | Related "Copy 📋" | Tap | Clipboard write | n/a |
| F-211 | Related card/no-url "Open" | Tap | Nav to card or knowledge detail | n/a |
| F-212 | Web findings list | — | each row: title + why + Open ↗ → Custom Tabs | n/a |
| F-213 | Next steps numbered list | — | static text | — |
| F-214 | Inline error text | — | when failed | — |
| F-215 | WS live updates | (auto) | merge `insight.queued/updated/failed` events |

**States:** (see layouts above). Transitions are 200 ms cross-fade.

**Empty state copy:** F-201 — "Get related cards, web findings, and next-step
suggestions tailored to this card." Button label "Brainstorm this card" (no
emoji in chrome; the `auto_awesome` icon carries the sparkle).

**Error copy:**
- 429 (rate limited): "You've hit today's brainstorm limit. Try again tomorrow."
- 503 (AI off): "AI isn't configured on the server."
- Generic: "Couldn't generate insights. Try again?"

---

### 3.6 KnowledgeListScreen — `F-540..F-549, F-570..F-579`

MVP: phone-first vertical list (not grid — denser, easier to scan), with
search + scope deferred to V1.

**Layout:**

```
┌──────────────────────────────────────┐
│ ←  Knowledge          «🔍» «🔔» «👤»│  TopAppBar
├──────────────────────────────────────┤
│ ┌──────────────────────────────────┐│  F-570/F-571 row
│ │ 🔗 Hello-world from Hacker News  ││  title
│ │   news.ycombinator.com  ·  ⏳    ││  F-572 host pill, F-577 fetch status
│ │   "Lorem ipsum dolor sit amet… " ││  F-573 2-line snippet
│ │   #hn #algo   •📎2  «private»    ││  F-574 tags (V1), F-576 linked count, F-575 visibility
│ └──────────────────────────────────┘│
│ ┌──────────────────────────────────┐│
│ │ 📝 My voice note about the demo  ││  (no-URL knowledge)
│ │   today  ·  ⏳ fetching         ││
│ └──────────────────────────────────┘│
│       (more items…)                  │
│                              ┌──────┐│
│                              │  +   ││  V1 only — MVP omits FAB (create via share)
│                              └──────┘│
├──────────────────────────────────────┤
│ « ⊞ »   « 🔖 (active) »   « ⋯ »      │  NavigationBar
└──────────────────────────────────────┘
```

**Components (every verb):**

| F-NNN | Element | Verb | Action | API/WS |
|---|---|---|---|---|
| F-540 | Hero band "Knowledge" | V1 only — MVP shows plain TopAppBar | — | — |
| F-541 | "+ New note" FAB | V1 only — Tap → `KnowledgeEditScreen` | n/a | — |
| F-542 | Scope select | V1 only | — | — |
| F-543 | Search input | V1 only | — | — |
| F-544 | Top-tag chips | V1 only | — | — |
| F-545 | Item grid (MVP: list) | (auto) | LazyColumn | `GET /api/knowledge?scope=mine&limit=50` |
| F-546 | Empty state | (auto) | see below | — |
| F-547 | Share-target ingest | (intent) | Routed to `ShareTargetScreen` then `KnowledgeEditScreen` | `POST /api/knowledge` |
| F-548 | Row tap | Tap | Navigate to `KnowledgeDetailScreen/{id}` | n/a |
| F-549 | WS live updates | (auto) | merge `knowledge.created/updated/deleted` | listens |
| F-570 | URL prefix 🔗 / 📝 icon | (visual) | `link` icon if URL, `notes` if not | — |
| F-571 | Title | (text) | Spectral 16 sp 600 | — |
| F-572 | Hostname pill | (visual) | `AssistChip` `surfaceVariant`, JetBrains Mono 11 | — |
| F-573 | 2-line body snippet | (text) | Inter 14, `maxLines=2`, ellipsis | — |
| F-574 | Tag list | V1 only | — | — |
| F-575 | Visibility badge | (visual) | Icon: `lock` private / `inbox` inbox / `groups` shared | — |
| F-576 | Linked-cards count | (badge) | `Badge` with mono number | — |
| F-577 | Fetching status ⏳ | (auto) | `hourglass_top` while `fetch_status='pending'` | listens `knowledge.updated` |
| F-578 | Fetch failed ⚠ | (auto) | `warning` icon when `fetch_status='failed'` | same |
| F-579 | Row tap (alias of F-548) | Tap | nav | n/a |

**States:**

| State | Trigger | Visual |
|---|---|---|
| Loading | Initial / pull-refresh | 5x knowledge-row skeleton |
| Empty | API returned 0 items | Empty-state block (see copy) |
| Loaded | Items present | List rendered |
| Error | GET failed | Snackbar + Retry |

**Empty state copy:**

- Heading (Spectral 24): "Your second brain starts here."
- Body (Inter 14): "Share a URL from any app, or save a note from a card you're working on."
- CTA: (none — share is the path) or in V1: [+ New note]
- Illustration: simple static line-art of an open book (asset, no animation).

**APIs:**
- `GET /api/knowledge?scope=mine&limit=50&cursor=` (paginated; load more on scroll)

**WS:** `knowledge.created/updated/deleted/link.created/link.deleted`.

---

### 3.7 KnowledgeDetailScreen — `F-600..F-612`

Read-only in MVP; edit in V1.

**Layout:**

```
┌──────────────────────────────────────┐
│ ←  Knowledge                  «⋮»   │  F-600
├──────────────────────────────────────┤
│  Article title (Spectral 24)         │  F-600
│  example.com  ↗                      │  F-601 host + Open
│  · saved 3d ago · by Naga · #tag    │  F-602 meta
│  ⚠ Couldn't fetch: timeout (V1 actn) │  F-603 (when fetch_status=failed)
│                                      │
│ ┌────────────────────────────────┐  │  F-604 body in mono surfaceVariant
│ │ Body content rendered as       │  │
│ │ pre-formatted text…             │  │
│ │ (scrollable inside)             │  │
│ └────────────────────────────────┘  │
│                                      │
│  Linked cards                        │  F-605 header
│  •  Card title here       [×]V1     │  F-606, F-607
│  •  Another card                     │
│  [+ Attach card]V1                   │  F-608
│                                      │
│  ⟳ Refetch (owner only) V1          │  F-610
│  ✎ Edit (owner only)  V1            │  F-611
│  🗑 Archive (owner only) V1         │  F-612
└──────────────────────────────────────┘
```

**Components (verbs):**

| F-NNN | Element | Verb | Action | API |
|---|---|---|---|---|
| F-600 | TopAppBar back | Tap | navigateUp | — |
| F-601 | URL anchor "↗" | Tap | Custom Tabs intent | n/a |
| F-602 | Meta caption | — | static | — |
| F-603 | Fetch-error caption | — | visible when failed | — |
| F-604 | Body block | Scroll, long-press to select-copy | `SelectionContainer` over `Text` | — |
| F-605 | Linked cards header | — | static | — |
| F-606 | Linked card row | Tap | Navigate to `CardDetailScreen/{id}` | n/a |
| F-607 | "remove" pill (V1) | Tap | AlertDialog confirm → DELETE link | `DELETE /api/knowledge/:id/links/:card_id` |
| F-608 | "+ Attach card" (V1) | Tap | Open picker sheet | `GET /api/cards?q=` |
| F-609 | Picker rows (V1) | Tap | POST link | `POST /api/knowledge/:id/links` |
| F-610 | Refetch (V1) | Tap | POST refetch | `POST /api/knowledge/:id/refetch` |
| F-611 | Edit (V1) | Tap | Navigate to `KnowledgeEditScreen?id=` | n/a |
| F-612 | Archive (V1) | Tap | AlertDialog confirm → DELETE | `DELETE /api/knowledge/:id` |

**States:**

| State | Trigger | Visual |
|---|---|---|
| Loading | Initial mount | Skeleton title + meta + body |
| Loaded | GET success | Rendered |
| Empty body | `body=''` | "Nothing fetched yet — open the source link above." |
| Fetching | `fetch_status='pending'` | Hourglass icon next to title |
| Failed | `fetch_status='failed'` | Banner F-603 |
| Archived | After F-612 | nav back; snackbar |
| 404 | GET 404 | "This knowledge item is gone." back button |

---

### 3.8 KnowledgeEditScreen — `F-630..F-639`

Full-screen route. MVP entry path: share intent. V1 also reachable from
KnowledgeList FAB and KnowledgeDetail edit.

**Layout:**

```
┌──────────────────────────────────────┐
│ ←  New knowledge          [ Save ]  │  F-630, F-638, F-639
├──────────────────────────────────────┤
│  URL (optional)                      │  F-631
│  ┌────────────────────────────────┐ │
│  │ https://…                      │ │
│  └────────────────────────────────┘ │
│  ↑ when filled, title auto-derives  │
│                                      │
│  Title                               │  F-632
│  ┌────────────────────────────────┐ │
│  │ Page title here                │ │
│  └────────────────────────────────┘ │
│                                      │
│  Body                                │  F-633
│  ┌────────────────────────────────┐ │
│  │ Your notes or quoted text…     │ │
│  │                                │ │
│  └────────────────────────────────┘ │
│                                      │
│  Tags (V1)                            │
│                                      │
│  Visibility                          │  F-635 RadioGroup
│  (•) Private    ( ) Inbox    ( ) Shared │
│                                      │
│  [✓] Auto-fetch when I save          │  F-636 Checkbox (only when URL set)
│                                      │
│  ⚠ <error caption>                   │  F-637
└──────────────────────────────────────┘
```

**Components (verbs):**

| F-NNN | Element | Verb | Action | API |
|---|---|---|---|---|
| F-630 | TopAppBar back | Tap | navigateUp (discard with confirm if dirty) | — |
| F-631 | URL TextField | Type, paste | Auto-derive title from hostname/path slug | — |
| F-632 | Title TextField | Type | local state | — |
| F-633 | Body TextField (multiline) | Type, paste | local state | — |
| F-634 | Tags input (V1) | Type | parse on blur | — |
| F-635 | Visibility radio | Tap | local state | — |
| F-636 | Auto-fetch Checkbox | Tap | local state | — |
| F-637 | Error caption | — | shows API errors | — |
| F-638 | Cancel (back) | Tap | navigateUp (confirm if dirty) | — |
| F-639 | Save button (TopAppBar action) | Tap | POST | `POST /api/knowledge` |

**States:** clean / dirty / saving / success (nav back) / error.

**APIs:** `POST /api/knowledge { title, url?, body?, visibility, source }`.
On share-intent entry, `source='share_target'`.

**WS:** `knowledge.created` arrives — list reconciles.

---

### 3.9 SettingsScreen — `F-440..F-461`

Single-column form. Reachable from MoreScreen.

**Layout (MVP):**

```
┌──────────────────────────────────────┐
│ ←  Settings                          │  F-440
├──────────────────────────────────────┤
│                                      │
│  Theme                               │  F-441
│  Choose how the app looks.           │  F-441 caption
│  [ Light ][System][ Dark ]           │  F-442 SegmentedButton
│                                      │
│  Display name                        │  F-443
│  ┌────────────────────────────────┐ │
│  │ Naga                           │ │  F-444
│  └────────────────────────────────┘ │
│  [ Save ]                            │  F-445
│  ✓ Saved · or ⚠ error                │  F-446
│                                      │
│  ─── V1 ─────────────────────────── │
│  Templates (V1) →                    │  F-461 nav row
│                                      │
│  ─── V2 ─────────────────────────── │
│  Mirror tokens →                     │  F-447..F-451 nested screen V2
│  API tokens →                        │  F-452..F-456 V2
│  Telegram links →                    │  F-457..F-460 V2
└──────────────────────────────────────┘
```

**Components (verbs):**

| F-NNN | Element | Verb | Action | API |
|---|---|---|---|---|
| F-440 | TopAppBar back/close | Tap | navigateUp | — |
| F-441 | Theme header + caption | — | static | — |
| F-442 | Theme SegmentedButton | Tap | DataStore write; rebuild theme | local |
| F-443 | Display-name header | — | static | — |
| F-444 | Short-name input | Type | local | — |
| F-445 | Save button | Tap | PATCH | `PATCH /api/auth/me {short_name}` |
| F-446 | Caption | (auto) | "Saved" / error | — |
| F-461 | Templates row (V1) | Tap | nav | — |

---

### 3.10 ArchiveScreen — `F-510..F-519`

V1; full-screen route from More.

**Layout:**

```
┌──────────────────────────────────────┐
│ ←  Archived (N)        [ Empty all ] │  F-510, F-517
├──────────────────────────────────────┤
│ ┌──────────────────────────────────┐│
│ │ Card title                       ││  F-512 row
│ │ Updated 2026-05-10               ││
│ │  [ Restore ]  [ Delete forever ] ││  F-513, F-514
│ └──────────────────────────────────┘│
│ ┌──────────────────────────────────┐│
│ │ …                                ││
│ └──────────────────────────────────┘│
│                                      │
│ (empty) "Nothing archived." [Close] │  F-515, F-516
└──────────────────────────────────────┘
```

**Components (verbs):**

| F-NNN | Element | Verb | Action | API |
|---|---|---|---|---|
| F-510 | TopAppBar count + back | Tap | navigateUp | — |
| F-511 | Initial load | (auto) | GET archived | `GET /api/cards/archived` |
| F-512 | Row | Tap | (no-op; or expand details) | — |
| F-513 | Restore | Tap | PATCH restore | `PATCH /api/cards/:id/restore` |
| F-514 | Delete forever | Tap | AlertDialog confirm → DELETE permanent | `DELETE /api/cards/:id/permanent` |
| F-515 | Empty state | (auto) | text + illustration | — |
| F-516 | Close footer | Tap | navigateUp | — |
| F-517 | Empty all | Tap | AlertDialog confirm → purge | `POST /api/cards/archived/purge` |
| F-518 | Error banner | (auto) | snackbar | — |
| F-519 | Busy state | (auto) | spinners | — |

**Empty state copy:** Heading "Clean slate." Body "Nothing archived yet."
Static line-art of an empty drawer; no animation.

---

### 3.11 ShareTargetScreen — Android intent handler (NOT in web registry)

Triggered by `ACTION_SEND`. Routes to `KnowledgeEditScreen` for text/URL or
`CaptureSheet` for image.

**Layout (transient — instantly forwards):**

```
┌──────────────────────────────────────┐
│   Routing to SmartKanban…           │
│   «K»  (large brand mark)            │
└──────────────────────────────────────┘
```

**Routing logic:**

| Intent MIME / extras | Destination | Pre-fill |
|---|---|---|
| `text/plain` with URL inside (regex `^https?://`) | `KnowledgeEditScreen` | `url=<the URL>`, `title=<page title from EXTRA_SUBJECT or hostname>`, `body=''`, `visibility='private'`, `auto_fetch=true` |
| `text/plain` plain text (no URL) | `KnowledgeEditScreen` | `title=<first line, ≤80 chars>`, `body=<full text>`, `auto_fetch=false` |
| `image/*` | `CaptureSheet` | image attached to draft card; user picks lane and adds title |
| Multiple images (`ACTION_SEND_MULTIPLE`) | `CaptureSheet` | First image attached; future enhancement to support multi |
| Auth missing | `LoginScreen` then replay intent | — |

**No user interaction** beyond the destination screen. Auto-forward in
< 200 ms; the routing screen serves only as visual continuity.

**States:** routing (visible < 200 ms) / auth required (forward to login).

---

### 3.12 NotificationListScreen — `F-340..F-351` adapted

Full-screen route (not popover, per Android idiom). Reachable from any
TopAppBar bell.

**Layout:**

```
┌──────────────────────────────────────┐
│ ←  Notifications        [Mark all] │  F-340, F-344, F-345
├──────────────────────────────────────┤
│ ┌──────────────────────────────────┐│
│ │ ●  Saif on "Backend rate-limit"  ││  F-346, F-347 unread indicator
│ │   "looks great!"                  ││
│ │   2 min ago                       ││
│ └──────────────────────────────────┘│
│ ┌──────────────────────────────────┐│
│ │     AI on "Refactor cards"       ││  (read)
│ │   "Try setting due Monday"        ││
│ │   1 h ago                         ││
│ └──────────────────────────────────┘│
│  (…up to 50 rows…)                   │  F-349
│                                      │
│  (empty) "You're all caught up."    │  F-348
└──────────────────────────────────────┘
```

**Components (verbs):**

| F-NNN | Element | Verb | Action | API/WS |
|---|---|---|---|---|
| F-340 | TopAppBar bell entry | Tap (from elsewhere) | nav here | — |
| F-341 | Unread badge | (auto in elsewhere TopAppBar) | shows count | — |
| F-342 | Push permission prompt | First mount | Request `POST_NOTIFICATIONS` runtime perm + register FCM token | `POST /api/push/fcm/subscribe` |
| F-344 | Header "Notifications" | — | static | — |
| F-345 | "Mark all read" | Tap | PUT read-all | `PUT /api/notifications/read-all` |
| F-346 | Row | Tap | Nav to `CardDetailScreen/{id}` from `card_id` | nav |
| F-347 | Unread indicator | (visual) | violet dot + tinted bg | — |
| F-348 | Empty state | (auto) | text | — |
| F-349 | 50-row cap | (auto) | take(50) | — |
| F-350 | Initial load | (auto) | GET | `GET /api/notifications` |
| F-351 | Reload on WS | (auto) | refetch on `card.message`/`card.ai_response` | listens |

**Empty state copy:** "You're all caught up." Static line-art bell, no
animation.

---

## 4. Component States Library

Every shared component, every visual state. Stage 5 implements one composable
per row.

### 4.1 KanbanCard

| State | Trigger | Visual delta |
|---|---|---|
| Rest | Default | Surface, 1 dp `surfaceVariant` outline, elevation 0, no shadow |
| Pressed | Active touch | Scale 0.98, elevation 2, accent-tinted shadow 24% α, gentle spring |
| Dragging | Long-press 500 ms then drag | Scale 1.02, elevation 5, accent shadow 32% α, 0.6 alpha clone left in place |
| Disabled | Optimistic in-flight on critical field | Alpha 0.6, no press response |
| Pending-AI | `ai_summarized=false` AND insight `pending` | `auto_awesome` icon with 1-cycle fade pulse (data-driven, NOT idle) |
| Has-unread | unread > 0 | `chat` icon + violet `Badge` with mono count |
| Reduced-motion | system reduced motion | No press scale; outline color shift only |
| TalkBack-focused | a11y focus | Yellow focus ring (system default) |

### 4.2 LaneHeader

| State | Visual |
|---|---|
| Default | Lane dot + name + count pill, on plain surface |
| Active | Bold name (Inter 500), elevated 1 dp |
| Drop-target (while another card is dragged over) | 2 dp animated dashed border in lane accent, bg tinted 4% accent |
| Dragging-from (source lane while card lifted) | Lane name subtly dimmed (alpha 0.7) |

### 4.3 CaptureFab

| State | Visual |
|---|---|
| Rest | 56 dp primary surface, `add` icon, elevation 3 |
| Pressed | Scale 0.94, elevation 4 |
| Disabled-busy | Spinner replaces icon |
| Success flash | 1.0→1.1→1.0 scale + checkmark icon for 600 ms, then back to `add` |
| Long-press menu open | Rotates 45° to "×", menu fans up |

### 4.4 AiInsightChip (in chat thread / suggestion chips)

| State | Visual |
|---|---|
| Queued | `primaryContainer` bg, "Generating…" label, gentle pulse (data-driven) |
| Pending | Same as queued |
| Ok | `primaryContainer` bg, action label, tappable |
| Applied | `surfaceVariant` bg, ✓ prefix, disabled |
| Failed | `errorContainer` bg, "Try again" label, tap retries |
| Degraded | Ok state + `(degraded)` mono caption next to label |

### 4.5 DueBadge

| Tone | Trigger | Color (light / dark) | Label |
|---|---|---|---|
| Overdue | `due_date < today` | `error` / `error` | "Overdue Nd" |
| Today | `due_date == today` | `tertiary` / `tertiary` | "Today" |
| Soon | `today < due ≤ today+3` | `secondary` (warning hint) | "Due in Nd" |
| Future | `due > today+3` | `onSurfaceVariant` | ISO date |
| None | `due == null` | (hidden) | — |

### 4.6 AssigneeAvatarStack

| Variant | Visual |
|---|---|
| 1 | Single 24 dp avatar (initials, deterministic hash color) |
| 2 | Two avatars, 8 dp overlap |
| 3 | Three avatars, 8 dp overlap |
| +N | First 2 avatars + "+N" pill (JetBrains Mono) |
| Empty | "Unassigned" pill (caption) on card detail; hidden on board tile |

Color hashing: `hash(user.id) % 8` → palette of 8 carefully-chosen muted
swatches (not saturated rainbow) — slate, sage, dusk, mauve, bronze, indigo,
moss, terracotta.

### 4.7 StatusPill (per lane × per density)

| Lane | Compact (board tile, 11 sp) | Standard (card detail status row, 14 sp) |
|---|---|---|
| Backlog | gray dot + "Backlog" | larger filter chip with same dot |
| Today | amber dot + "Today" | same |
| In Progress | violet dot + "In Pgs" | "In Progress" full label |
| Done | emerald dot + "Done" | same |

### 4.8 AttachmentTile

| State | Image | Audio | File |
|---|---|---|---|
| Loading | Shimmer skeleton box | Mic icon + spinner | File icon + spinner |
| Loaded | Coil thumbnail, 1 dp outline | Waveform glyph + duration | Filename + extension |
| Failed | Broken-image icon + "Tap to retry" | Same | Same |
| Long-press | Action sheet (Replace / Delete) | Same | Same |

### 4.9 ToastSnackbar (Material 3 SnackbarHost)

| State | Visual | Duration |
|---|---|---|
| Success | onSurface text, `check_circle` icon | 2 s |
| Info | same, `info` icon | 3 s |
| Error | `errorContainer` background, `error` icon, "Retry" action | 5 s |
| Persistent w/ action | Indefinite until action tapped or swipe-dismissed |

### 4.10 NotificationRow

| State | Visual |
|---|---|
| Unread | violet leading bar + `primaryContainer` tinted bg + bold actor name |
| Read | plain surface + regular actor name |
| Pressed | scale 0.99 + elevation 1 |

### 4.11 EmptyStateBlock

```
┌──────────────────────────────────────┐
│           «static glyph»             │  64 dp line-art (no animation)
│        Heading (Spectral 24)         │
│  Body text in Inter 14, max 2 lines  │
│            [CTA button]              │  optional
└──────────────────────────────────────┘
```

| State | Visual |
|---|---|
| Loading | Skeleton with shimmer (≤1 cycle, then static) |
| Empty | Glyph + heading + body + optional CTA |
| Error | Red glyph + "Something went wrong" + Retry CTA |

### 4.12 LoadingSkeleton

| Variant | Shape |
|---|---|
| Card tile | 96 dp tall, 16 dp radius, single shimmer cycle then static `surfaceVariant` |
| Knowledge row | 72 dp tall, 16 dp radius, two text-line placeholders |
| List row generic | 56 dp tall, 8 dp radius |
| Avatar | 24 dp circle |
| Detail page | Title bar + 3 section blocks |

Skeleton shimmer animates exactly ONE cycle on first paint (~1.2 s) then
holds static until data arrives — honoring the "no idle motion" constraint
while still signaling load. Reduced-motion: no shimmer at all, static
`surfaceVariant` from frame 1.

---

## 5. Interaction Patterns

### 5.1 Lane navigation

- **HorizontalPager** across the 4 lanes. Snap-to-page. Page settle haptic =
  light tick.
- Lane title row at top doubles as a picker: tap → `ModalBottomSheet` with 4
  rows (lane name + count badge). Tap a row → animates the pager to that page
  (250 ms `spring.snappy`).
- Edge-swipe detected; system back swipe handled separately (back navigates
  out of Board to OS home, NOT to previous lane).

### 5.2 Drag-to-move card (V1 confirmed)

- Long-press card 500 ms → haptic medium tick → card lifts to elevation 5,
  scales 1.02, 0.6 alpha ghost left in place.
- During drag:
  - Cross-lane: drag horizontally past the lane edge — pager auto-advances to
    next lane after 600 ms hover.
  - Intra-lane reorder: drag vertically; other cards slide to make room
    (`animateItemPlacement`).
  - Trash zone (V1): bottom-center 64 dp circle with `delete` icon appears
    when drag begins; drop here = archive with undo snackbar.
- Release → optimistic UI update + `PATCH /api/cards/:id {status, position}`.
- Success: haptic success pattern (Android `HapticFeedbackConstants.CONFIRM`).
- Failure: card snaps back to source position; snackbar with Retry.

### 5.3 Capture FAB

- Tap → opens `CaptureSheet` (text mode focused).
- Long-press → fans 4 mini-FAB chips upward (Text / Photo / Voice / Template),
  each labeled below. 250 ms stagger 30 ms between siblings. Tap chip → opens
  the relevant mode of CaptureSheet; tap outside → collapses.

### 5.4 Pull-to-refresh

- Board, Knowledge, Archive screens use Material 3 `PullToRefreshContainer`.
- Pull threshold 80 dp; release fires refetch.
- Spinner is the system default, NOT custom-animated.

### 5.5 Swipe actions on card rows (V1, list views)

- In future compact list views (e.g. weekly review): swipe-left = archive;
  swipe-right = mark done. Show colored backdrop with icon as swipe progresses.
- On commit: optimistic update + API call + snackbar with **Undo** (5 s).

### 5.6 Long-press card on Board

- 500 ms hold → `MobileCardActions` `ModalBottomSheet`:
  - Move to Backlog / Today / In Progress / Done (current lane row disabled)
  - Archive (red destructive row)
  - Cancel
- Tap row → PATCH/DELETE + dismiss + snackbar.

### 5.7 Pinch-zoom image attachment

- Tap thumbnail in card detail → full-screen lightbox.
- Pinch to zoom (1x..4x). Pan when zoomed.
- Swipe down to dismiss (drag with 0.6 alpha follow).
- Left/right swipe between attachments (when card has > 1 image).

### 5.8 In-card chat thread

- Always-visible section on `CardDetailScreen` (no collapse).
- Sticky message input at bottom when chat scrolled into view (`Modifier.imePadding`).
- On new WS event: append + `animateScrollToItem(lastIndex)` if already
  scrolled to bottom; if scrolled up, show "New ↓" floating chip instead
  (tap → scrolls to bottom).
- `PUT /api/cards/:id/events/read` fires on mount and after each appended event.

### 5.9 AI suggestion chips

- Render inline within the AI's `card_events` row.
- Tap → optimistic UI change (e.g. due-date pill updates immediately) +
  `PATCH /api/cards/:id`.
- After success, chip transitions to `surfaceVariant` bg with ✓ prefix and
  becomes non-tappable. State persists locally until card detail is closed.

### 5.10 System back gesture

Priority order:
1. If modal sheet open → close sheet.
2. If lightbox open → close lightbox.
3. If on `CardDetailScreen` → pop to Board.
4. If on Knowledge or More tab root → switch tab to Board (not exit).
5. If on Board tab root → confirm exit (`AlertDialog` "Exit app?" with
   "Stay" / "Exit") — OR exit immediately if user has Android system
   "back gesture confirms" off.

(Per Android idiom, single-tap back-from-root usually exits; we add confirm
because losing draft state in CaptureSheet would be costly. Configurable in
Settings V2.)

### 5.11 Haptic feedback map

| Trigger | Haptic |
|---|---|
| Card press | Light tick (`CONTEXT_CLICK`) |
| Long-press lift | Medium tick (`LONG_PRESS`) |
| Drag drop success | Confirm pattern (`CONFIRM`) |
| AI insight ready | Two light ticks 80 ms apart (custom pattern) |
| Destructive confirm (archive, delete forever) | Reject pattern (`REJECT`) |
| Pull-to-refresh fire | Light tick |
| Page-snap on lane swipe | Light tick |

All haptics gated by user device setting (`hapticFeedbackEnabled`). On
devices without haptics (rare), no fallback.

### 5.12 No-mascot rule (BINDING)

No floating character, no cursor-tracker, no peripheral animation, in any
empty margin, in any state. Empty states use static illustration + copy.

---

## 6. Notification UX (FCM)

### 6.1 Channels

Defined at first launch via `NotificationManagerCompat.createNotificationChannel`.

| Channel ID | Name | Importance | Description |
|---|---|---|---|
| `card_activity` | Card activity | `IMPORTANCE_HIGH` | Messages, AI replies, shares |
| `insights` | Insights ready | `IMPORTANCE_DEFAULT` | Brainstorm complete, no sound |
| `reminders` (V2) | Due-date reminders | `IMPORTANCE_HIGH` | Local scheduled reminders |

### 6.2 Per-message layout

- **Title:** `"<ShortName> on <CardTitle>"` (e.g. "Saif on Backend rate-limit")
- **Body:** message preview, ≤ 100 chars, BigTextStyle when longer
- **Large icon:** sender's hash-color avatar with initials (24 dp)
- **Small icon:** monochrome SmartKanban mark
- **Channel:** `card_activity` for message/ai_response; `insights` for
  insight ready
- **Group key:** `card-<card_id>` — multiple notifications for the same card
  collapse into a single notification with `InboxStyle` summary
- **Tap:** PendingIntent to `MainActivity` with deep link
  `kanban://card/<id>`, opens `CardDetailScreen`

### 6.3 Actions on notification

- **Reply** (RemoteInput with `KEY_TEXT_REPLY`) → background `IntentService`
  fires `POST /api/cards/:id/messages` with the typed reply. On success: cancel
  notification. On failure: re-post with "Retry" action.
- **Mark read** → background fire `PUT /api/cards/:id/events/read
  {last_read_id}` + cancel notification.

### 6.4 Insight notification

Title: `"Insights ready: <CardTitle>"`. Body: insight summary first 80 chars.
Tap → `CardDetailScreen/{id}` (scrolls to AI Insights section).

### 6.5 Reminders (V2)

`AlarmManager`-scheduled at `due_date - 24h` for any card user owns with
due_date set. Channel `reminders`. Action `Snooze 1h` re-schedules.

### 6.6 Badge counts

`NotificationManagerCompat.from(context).setBadgeIconType(BADGE_ICON_LARGE)`
on supported launchers; Android system shows unread count on app icon.

---

## 7. Onboarding & Empty States

### 7.1 Splash

Android 12+ system splash (`SplashScreen` API). Brand mark `K` centered on
`surface` background. Minimum 250 ms display, max 1 s before transition.
No progress bar; if longer wait, animate the mark with a single 1 s
breath-in/out (one cycle only) then static.

### 7.2 First launch

1. Splash (250 ms).
2. `LoginScreen` in SIGN IN mode by default (not register — most users
   already registered on the web app). "New here? [Create account]" link
   below.
3. After auth success: optional onboarding card overlay on Board:
   - "Tap + to capture anything." (with arrow pointing at FAB)
   - "Swipe left/right to switch lanes."
   - "Long-press a card to move or archive."
   - 3 tiny dots indicator + "Skip" link.
4. After dismiss or last tip: prompt notification permission (Android 13+).

### 7.3 Empty Board lane

Per lane copies in §3.2. Illustration: simple static line-art of an empty
desk for Backlog/Today, gear for In Progress, trophy for Done. 64 dp size,
`onSurfaceVariant` color, no animation.

### 7.4 Empty Knowledge

Heading: "Your second brain starts here." Body: "Share a URL from any app,
or save a note from a card you're working on." Illustration: static
open-book line-art, 64 dp.

### 7.5 Empty Notifications

Heading: "You're all caught up." Body: "We'll surface card messages and AI
suggestions here." Illustration: static bell line-art, 64 dp.

### 7.6 Error states

Pattern: red glyph (line-art `error_outline`) + heading "Something didn't go
through." + body (specific cause when known) + primary button "Try again" +
optional `TextButton` "Report" (V2, sends device info to a Sentry-like
endpoint).

### 7.7 Offline state

When app cannot reach the server at all on first launch: full-screen empty
state "Couldn't reach your board." with "Retry" button. When losing
connectivity mid-session: silent — TopAppBar grows a small `cloud_off` icon;
all writes queue locally and retry on connectivity restore (V1 — MVP just
fails the write with snackbar + Retry).

---

## 8. Accessibility & Internationalization

### 8.1 TalkBack

- Every interactive composable has `contentDescription` or `semantics { ... }`.
- KanbanCard exposes:
  - Main click: "Open card <title>"
  - Custom actions: "Move to Today", "Move to In Progress", "Archive", "View chain (V2)"
- Drag handle (sheet) explicitly: "Drag to dismiss"
- FAB: "Capture new card"
- NavigationBar items: each labeled, with "selected" state announced
- Snackbar: announced via `LiveRegion`
- AI suggestion chips: "Suggestion: set due date Monday. Tap to apply."

### 8.2 Dynamic font scaling

Respect `Configuration.fontScale` 1.0..1.5x. Clamp at 1.5x to prevent layout
breakage. Test matrix: 1.0, 1.15, 1.3, 1.5.

### 8.3 RTL

Layouts use `start`/`end` (not left/right). Mirror gestures in RTL: swipe-left
becomes swipe-right semantically. V2 ships Arabic and Hebrew strings; MVP is
English only but layouts are RTL-ready.

### 8.4 High-contrast

When `AccessibilityManager.isHighTextContrastEnabled()`:
- Outlines: `surfaceVariant` → `outline`
- Hairline borders bumped from 1 dp to 1.5 dp
- Caption text from `onSurfaceVariant` → `onSurface`

### 8.5 Reduced motion

See §1.7 — all spring animations replaced with 150 ms fades; pulses removed;
shimmer skeletons hold static.

### 8.6 String externalization

All UI text in `strings.xml`. No hard-coded English in composables. Format
strings use `%1$s`, `%2$d` for plurals; use `plurals` resources for count-bearing
strings ("%d card", "%d cards"). If RN path: `i18next` with same key
structure.

### 8.7 Color-blind safety

Lane accents tested for protanopia/deuteranopia/tritanopia:
- Slate (Backlog), amber (Today), violet (In Progress), emerald (Done) —
  each pair distinguishable in all three sims at 4.5:1 minimum.
- Status indicator is always **color + dot position + lane name** — never
  color alone.

---

## 9. Open Design Questions for Stage 4 Architect

### 9.1 Compose-only vs hybrid

**Recommendation: Compose-only.** Material3 in Compose 1.6+ covers every
component in this spec — `DatePickerDialog`, `ModalBottomSheet`,
`SegmentedButton`, `PullToRefreshContainer`, `HorizontalPager`,
`FloatingActionButton`, `NavigationBar`, `TopAppBar`, `OutlinedTextField`,
`AssistChip`, `FilterChip`, `Snackbar`, `Badge`, `SwipeableActionsBox`
(community lib). No need for classic `View`s except `WebView` for V2 chain
viz.

### 9.2 Drag implementation

**Recommendation: `Modifier.draggable` + custom state machine** rather than
the new `Modifier.dragAndDropSource` (Compose 1.6). Reasons:
- `dragAndDrop*` modifiers route through OS drag-and-drop subsystem (designed
  for inter-app drag, e.g. images dropped into Gmail) — overkill and
  unpredictable for intra-app card moves.
- A state-machine approach gives us full control over haptics, ghost
  rendering, edge-pager-advance, and trash zone reveal.
- Implementation outline: `rememberDraggableState` + `Modifier.pointerInput`
  with custom long-press-then-drag detector → `MutableStateFlow<DragState>`
  consumed by the lane and trash zone composables.

### 9.3 Framework choice (Compose vs React Native + Expo)

**Recommendation: Native Kotlin + Compose.** Reasons:
- Capture latency is a top-3 metric (§6 success criteria: 4 s text capture).
  Native FAB → text input has ~80 ms RTT; RN has 120-200 ms cold reaction
  from JS bridge.
- FCM, AppLinks, share intents, RemoteInput reply, BiometricPrompt, CameraX,
  AudioRecord, foreground services — all native Android APIs. Expo plugins
  exist for most but add layers.
- Compose Material3 = first-class native rendering, no skia bridge cost.
- Single-platform target (no iOS) means no RN "write once" upside.
- If team lacks Kotlin depth → RN/Expo is acceptable; layout specs in §3
  translate 1:1.

### 9.4 WS lifecycle (per Stage 2 §8.6)

Confirmed: **WS in foreground only, FCM in background.** Disconnect
indicator: subtle `cloud_off` in TopAppBar. Auto-reconnect with backoff
500 ms → 10 s. No foreground service for WS.

### 9.5 Theme persistence

Use **DataStore<Preferences>** with key `theme`: `'system' | 'light' | 'dark'`.
Default `'system'`. Apply via `MaterialTheme` `colorScheme` swap; respect
across configuration changes.

### 9.6 Authentication state

OkHttp `CookieJar` for MVP (session cookie). Stage 4 should add the
bearer-native-token endpoint per Stage 2 §8.1 in V1 to remove cookie
fragility for WS reconnect and WebView (chain viz V2).

---

STAGE_COMPLETE: designer screens=12 components=12 states=48 journeys_specd=6
