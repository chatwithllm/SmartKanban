# ANDROID PLAN — STAGE 6: QA (Test Plan)

Upstream binding inputs (read in order):

- **S1 Analyst** — 51 routes, 18 tables, 19 WS events, env vars, visibility
  predicate. Cited as **S1 §X.Y**.
- **S2 PM** — MVP=188 / V1=263 / V2=339 rows, 6 critical journeys (§5), 12
  success criteria (§6). Cited as **S2 §X.Y / J1..J6**.
- **S3 Designer** — Material 3 tokens, 12 screens (§3), 12 component
  state-libraries (§4), interaction patterns (§5), 3-channel notification UX
  (§6), accessibility constraints (§8). Cited as **S3 §X.Y**.
- **S4 Architect** — RN 0.76.5 + Expo 52, 47 pinned deps incl Detox 20.32, FCM
  + Notifee push pipeline (§8), CI matrix (§11). Cited as **S4 §X.Y**.
- **S5 Engineer** — 12 build phases, 24 components, 15 React Query hooks,
  30 mutations, 7 backend BLOCKERS (§13). Cited as **S5 §X.Y / P0..P12**.
- **agent-rules.md** — RULE 6 post-build self-validation, RULE 9 verb
  verification (every verb in this plan demos at least once across the test
  packs), RULE 12 visual parity (web mobile shell vs native baseline).

This plan is the executable contract for QA: after every phase, the
acceptance criteria in §11 must be ticked off. Before tag `v1.0.0` the
manual checklist in §12 must be signed off in writing.

---

## 1. Device Test Matrix

### 1.1 Tier 1 — required on every release

| Tier | Device | OS / API | RAM | Screen / dppx | Year | Why it's in the matrix |
|---|---|---|---|---|---|---|
| **T1-Primary** | **Pixel 8** | Android 15 / **API 35** (matches `targetSdkVersion` S4 §10.1) | 8 GB | 6.2" 1080×2400 / 428 dpi | 2023 | Modern flagship, full Material You dynamic color, **canonical reference** for performance metrics (S2 §6 cold-start <3.5 s). Reflects S5 P0 done-test target replacing the Pixel 6a (which is no longer in retail). |
| **T1-Mid (OEM skin)** | **Samsung Galaxy A54 5G** | Android 14 / **API 34** | 8 GB | 6.4" 1080×2340 / 403 dpi (Super AMOLED) | 2023 | One UI 6 overlay catches Samsung-specific quirks: split-screen pop-in, Edge Panels intercepting back-swipe (S3 §5.10 system-back priority), Samsung Keyboard predictive bar height (CaptureSheet F-121 keyboard avoidance), aggressive battery optimization on FCM (S4 §8 push deliverability). |
| **T1-Floor** | **Pixel 4a** | Android 13 / **API 33** (NOTE: rooted to API 33 in our lab — official EoL is API 31; if procurement fails, swap to **Samsung Galaxy A14** API 33, 4 GB RAM) | 6 GB | 5.81" 1080×2340 / 443 dpi | 2020 | **Performance floor** at `minSdkVersion=29`. Validates RN 0.76 + Hermes + Reanimated 3 budget on 5-year-old SoC. Catches `LazyColumn` / FlashList jank, FCM cold-start (S5 P10), and audio capture lag (S5 P12). |

### 1.2 Tier 2 — required for v1.0 GA, optional for milestone preview builds

| Tier | Device | OS / API | RAM | Screen / dppx | Year | Why it's in the matrix |
|---|---|---|---|---|---|---|
| **T2-Vendor** | **Xiaomi Redmi Note 12** | Android 13 / **API 33** + MIUI 14 | 4 GB | 6.67" 1080×2400 / 395 dpi | 2023 | MIUI's aggressive auto-start manager and battery saver are notorious for **killing background FCM** and silently dropping WS reconnect (S4 §9). Catches Notifee channel persistence (S3 §6.1) under vendor restrictions and the "killed app, push still arrives" check (J5 — push tap → cold-start deep-link). |
| **T2-Large screen** | **Pixel Tablet** (or Pixel Fold inner) | Android 14 / **API 34** | 8 GB | 10.95" 2560×1600 / 276 dpi (tablet) | 2023 | Validates we **don't regress on large screens** even though tablet split-view is explicit non-goal MVP (S2 §7). Confirms LoginScreen F-001..F-011, BoardScreen single-pane scaling, and notification group key (S3 §6.2) on tablet form factor. |

### 1.3 Test environment per device

| Device | Physical / EAS device farm / Firebase Test Lab / Emulator | Smoke (per PR) | Regression (per main push) | Soak (nightly) |
|---|---|---|---|---|
| Pixel 8 (T1-Primary) | **Physical** (held by tester) + **Firebase Test Lab Pixel 8 emulator API 35** | Pixel 6 Pro emu API 33 (CI) | Pixel 8 Pro emu API 35 (CI) + physical handoff | Physical (nightly cron, FTL fallback) |
| Galaxy A54 (T1-Mid) | **Firebase Test Lab** (physical pool) | — | FTL (5 min cap) on every main push | FTL (1 night/week) |
| Pixel 4a (T1-Floor) | **Physical** (lab device) — performance budget is non-negotiable here | — | Physical, manual run before tag `v*` | Physical (1 night/week) |
| Redmi Note 12 (T2-Vendor) | **Firebase Test Lab Robo** (physical pool, MIUI fingerprint) | — | FTL on every main push | — |
| Pixel Tablet (T2-Large) | **Firebase Test Lab** (physical pool) | — | FTL on every main push | — |

**Justification for FTL + physical mix:** FTL gives reproducible OEM coverage
on every CI run without buying 5 phones; physical devices catch
camera/microphone/notification permission flows that FTL cannot fully drive
(headless, no real hardware sensors).

### 1.4 Known platform quirks watchlist

| Device | Watch for |
|---|---|
| Pixel 8 / API 35 | Predictive Back gesture overrides our SystemBack handler (S3 §5.10) — confirm AlertDialog "Exit app?" still wins |
| Galaxy A54 / One UI 6 | Samsung Keyboard pushes IME-padded `OutlinedTextField` further than stock (S5 P0 + RN keyboard-controller pinned 1.15.2) — verify CaptureSheet input remains visible |
| Pixel 4a / API 33 | Hermes cold start measured ~700 ms; Reanimated 3 spring on KanbanCard press may stutter — measure with `react-native-performance` markers, fall back to `tween(150)` if >16 ms frame |
| Redmi Note 12 / MIUI | Notification channel may need explicit user enable in MIUI Security app; FCM `getToken()` returns but display may be silently dropped. Test: kill app, send push, wait 60 s, expect notification in shade |
| Pixel Tablet | FAB sits behind landscape system gesture inset — confirm `react-native-safe-area-context` honors tablet insets |

---

## 2. CI Test Gates (per S4 §11)

### 2.1 PR gate (`pr.yml`) — every PR must pass

| Step | Command | Threshold | Blocks merge? |
|---|---|---|---|
| Lint | `npm run lint` | 0 errors, `--max-warnings=0` | yes |
| Typecheck | `npm run typecheck` | `tsc --noEmit` exits 0 | yes |
| Verify pinned | `npm run verify:pinned` (per S4 §2.3) | no `^`/`~` in `package.json` | yes |
| Unit tests | `npm run test -- --coverage` | jest passes; coverage `src/api/` ≥80%, `src/state/` ≥80%, `src/components/` ≥70%, `src/utils/` ≥80% | yes |
| Detox smoke | `npm run test:e2e:smoke` on Pixel 6 Pro emu API 33 | 100% pass on 3-test smoke pack (§5.3.1) | yes |
| Schema roundtrip | `__tests__/api/schema-roundtrip.test.ts` (per S5 P3) | every fixture parses; intentional-drift mutation must fail | yes |

### 2.2 main push (`main.yml`)

PR gate + the following:

| Step | Command | Threshold |
|---|---|---|
| EAS Build (preview) | `eas build --profile preview --platform android --non-interactive` | exits 0 |
| EAS Update | `eas update --branch preview --message "$(git log -1 --pretty=%s)"` | OTA published |
| Detox regression | `npm run test:e2e:regression` on Pixel 8 Pro emu API 35 + Pixel 6 Pro emu API 33 (matrix) | 100% pass on 15-test regression pack (§5.3.2) |
| FTL fan-out | `gcloud firebase test android run` on T1-Mid (A54), T2-Vendor (Redmi Note 12), T2-Large (Pixel Tablet) | 0 crashes, all asserts green |

### 2.3 Tag `v*` (`release.yml`)

main push + the following:

| Step | Command | Threshold |
|---|---|---|
| EAS Build (production) | `eas build --profile production --platform android --non-interactive` | exits 0, AAB produced |
| EAS Submit | `eas submit -p android --latest --track internal` | upload to Play Internal succeeds |
| Manual QA sign-off | §12 one-pager (Google Form linked from `release.yml`) | all rows pass / skip-with-reason; **no fail** before promoting Internal→Closed |
| Soak (1×) | `npm run test:e2e:soak` on Pixel 4a (physical, lab) | no memory leak, no WS storm, no token expiry crash |

### 2.4 Test-coverage budget summary

| Surface | Coverage target | Enforcer |
|---|---|---|
| `src/api/` (endpoints + schemas + client) | ≥ 80% lines/branches | jest CI gate |
| `src/state/` (3 Zustand stores) | ≥ 80% | jest CI gate |
| `src/components/` (24 components) | ≥ 70% (snapshot-heavy) | jest CI gate |
| `src/utils/` (visibility predicate mirror, color hash, debounce) | ≥ 80% | jest CI gate |
| `src/hooks/` (15 React Query hooks) | ≥ 70% | jest CI gate (advisory threshold in MVP, hard in V1) |
| `src/ws/`, `src/push/`, `src/share/` | ≥ 70% | jest CI gate |
| `app/` (screens) | RTL integration suite + Detox smoke (no line-coverage gate) | jest + Detox |

---

## 3. Unit Test Specs

### 3.1 Per-component (24 components from S5 §2)

Format per component: snapshot tests = 1 per visual state from **S3 §4**;
behavior tests = 1 per interactive verb from **S3 §5** + per-component verb
tables in S3 §3. Every test mounts under `<TestProviders>` (theme +
QueryClientProvider with empty cache + Zustand `resetAll()` beforeEach).

**Mocking strategy (applies to all components):**

- Theme provider wrap: `<PaperProvider theme={lightTokens}>` AND a separate
  test pass with `darkTokens` (per S3 §1.3).
- React Query client: `new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })` per test.
- Zustand: `beforeEach(() => { useAuthStore.setState(authInitial); useUiStore.setState(uiInitial); useCaptureDraftStore.setState(draftInitial); })`.
- API: `msw/native` handlers mounted in `__tests__/setup/server.ts`.
- Reanimated + gesture-handler mocks per `jest-expo` preset.

| # | Component | F-NNN | Snapshot states | Behavior tests | Coverage target |
|---|---|---|---|---|---|
| 1 | `KanbanCard` | F-090..F-110 | Rest, Pressed, Dragging, Disabled, Pending-AI, Has-unread, Reduced-motion, TalkBack-focused (S3 §4.1) | renders all chrome elements (accent bar, source row, AI badge, needs-review badge, tag chips, due pill, attachment count, unread badge, image thumbs, avatar stack); `onPress` fires; `onLongPress` fires; reduced-motion disables press scale | 80% |
| 2 | `LaneHeader` | F-070..F-073 | Default, Active, Drop-target, Dragging-from (S3 §4.2) | tap opens lane picker sheet; count badge renders mono | 80% |
| 3 | `CaptureFab` | F-057 | Rest, Pressed, Disabled-busy, Success-flash, Long-press-menu-open (S3 §4.3) | tap opens CaptureSheet; long-press fans 4 mini-FAB chips; mini-chip tap routes to correct mode | 80% |
| 4 | `CaptureSheet` | F-120..F-131 | Default, Typing, Slash-template-parsed, Sending, Success, Error, Photo-flash, Voice-recording | text input → send fires `POST /api/cards`; `/foo` prefix → template instantiate; photo button launches CameraX intent mock; voice tap-and-hold records, release uploads; lane chip opens lane sheet | 75% |
| 5 | `AiInsightsCard` | F-200..F-215 | First-run, Pending, Failed, Ok, Ok-degraded (S3 §3.5) | Brainstorm button fires `POST insights/brainstorm`; re-run fires same; Open ↗ fires `expo-web-browser`; Copy 📋 fires `Clipboard.setString`; suggestion chip apply triggers `PATCH /api/cards/:id`; chip transitions Queued→Pending→Ok→Applied | 80% |
| 6 | `AiInsightChip` | F-318 | Queued, Pending, Ok, Applied, Failed, Degraded (S3 §4.4) | tap in Ok state fires the bound mutation; Applied is non-tappable; Failed tap re-runs | 80% |
| 7 | `DueBadge` | F-102 | Overdue, Today, Soon, Future, None (S3 §4.5) | tone class derives correctly from due_date prop | 90% |
| 8 | `AssigneeAvatarStack` | F-107/F-108 | 1, 2, 3, +N, Empty (S3 §4.6) | initials derived from `short_name`; color hash deterministic across renders | 90% |
| 9 | `StatusPill` | F-073 | per-lane × Compact + Standard density (8 variants) (S3 §4.7) | renders correct dot color per lane | 90% |
| 10 | `AttachmentTile` | F-731 | Loading, Loaded (image/audio/file), Failed, Long-press-open (S3 §4.8) | tap opens lightbox (image) / Custom Tab (file) / audio player (audio); long-press opens action sheet | 70% |
| 11 | `Toast` / Snackbar host | F-820..F-824 | Success, Info, Error-with-action, Persistent (S3 §4.9) | enqueue from anywhere; auto-dismiss timer per variant; swipe dismisses | 80% |
| 12 | `NotificationRow` | F-346 | Unread, Read, Pressed (S3 §4.10) | tap navigates to `/board/[id]` | 80% |
| 13 | `EmptyStateBlock` | — | Loading, Empty, Error (S3 §4.11) | CTA fires `onPress` prop; reduced-motion disables shimmer | 90% |
| 14 | `LoadingSkeleton` | — | CardTile, KnowledgeRow, ListRowGeneric, Avatar, DetailPage (S3 §4.12) | renders exactly 1 shimmer cycle in normal motion; static in reduced motion | 80% |
| 15 | `CardTimeline` | F-310..F-327 | System-entry, Message-entry, AI-entry, AI-suggestions-row, Empty (S3 §3.12) | auto-scrolls to bottom on mount; `PUT events/read` fires on mount; WS `card.message` appends; "New ↓" chip appears when scrolled up | 80% |
| 16 | `ChatInput` | F-324..F-326 | Default, Typing, Sending, Error | send button enabled when content non-empty; `@ai` mention parses correctly; error caption renders | 80% |
| 17 | `MessageBubble` | F-315/F-316 | Self, Other, AI | rendered text preserves newlines (cross-check with `759c00f` web fix) | 80% |
| 18 | `SuggestionChip` | F-318 | per AiInsightChip + applied | (covered by AiInsightChip) | — |
| 19 | `KnowledgeRow` | F-570..F-579 | URL, NoURL, Fetching, FetchFailed, +Linked-count, Private/Inbox/Shared visibility (S3 §3.6) | tap navigates to detail; fetch status icon matches `fetch_status` field | 80% |
| 20 | `LaneHeader`/`LanePager` | F-669/F-670 | (covered above) | swipe paged settles with haptic | 70% |
| 21 | `ScopePicker` | F-661 | 4 scopes × 2 themes | tap row updates `useUiStore.scope` → triggers `useCards` refetch | 80% |
| 22 | `ConfirmDialog` | — | Default, Destructive | OK/Cancel fires correct callback; destructive variant uses `error` tone | 80% |
| 23 | `LongPressActionSheet` | F-700..F-703 | Default (current lane disabled), All-lanes-enabled, Archive-row | tap row fires PATCH/DELETE | 80% |
| 24 | `ImageLightbox` | — | Default, Zoomed, Panned, Multi-image | pinch zooms 1x→4x; swipe-down dismisses; swipe-left/right between images | 70% |

### 3.2 Per Zustand store (3 stores from S5 §5)

| Store | Action coverage | Persistence test | Reset test |
|---|---|---|---|
| `auth-store` | `signIn(creds)` (success/401/network), `signOut()`, `setUser()`, `hydrate()` (cold-start path) | mock SecureStore: assert `authToken` written on success; assert MMKV `user` mirror written; assert SecureStore NOT used for cache. | `signOut()` → SecureStore.delete(`authToken`), MMKV user cleared, UI nav back to login, FCM `teardownFcmOnSignOut()` called, capture-draft cleared |
| `ui-store` | `setActiveLane`, `setScope`, `setSearch`, `openSheet/closeSheet`, `setTheme` | MMKV persistence on theme + activeLane + scope; SecureStore NOT touched | `signOut()` resets to initial defaults |
| `capture-draft-store` | `setText`, `attachPhoto`, `attachVoice`, `clear`, `flush()` (success/error/offline-queue) | MMKV persistence ONLY when send failed (V1 offline queue); MVP keeps in-memory until flush succeeds | `signOut()` clears all draft state |

### 3.3 Per React Query hook (15 hooks from S5 §6)

For each hook: msw handler returns canned response, hook is rendered via
`renderHook` with QueryClientProvider, assertions follow.

| Hook | Endpoint | Tests |
|---|---|---|
| `useCards(scope)` | `GET /api/cards?scope=` (bare array S1 §2.2) | parses 3-card fixture; mock 401 → `auth-store.signOut()` called; WS `card.created` triggers `invalidateQueries(['cards', scope])`; WS `card.deleted` mutates cache via `setQueryData` (S4 §5.5) |
| `useCard(id)` | `GET /api/cards/:id` (bare object) | parses; 404 returns undefined (S3 §3.4 F-740); WS `card.updated` merges |
| `useCardEvents(id)` | `GET /api/cards/:id/events` (bare array) | parses; WS `card.message` appends event; `card.ai_response` appends; deduplicates if event id already present |
| `useUnreadCounts` | `GET /api/messages/unread` (bare object Record<id,number>) | parses Record shape; WS `card.message` increments by 1 for the relevant card |
| `useCardKnowledge(id)` | `GET /api/cards/:id/knowledge` (wrapper `{items}`) | parses wrapper; WS `knowledge.link.created` triggers refetch |
| `useInsights(cardId)` | `GET /api/cards/:id/insights` (wrapper `{insights}`) | parses; WS `insight.queued` prepends; `insight.updated` replaces by id; `insight.failed` replaces |
| `useKnowledge(scope, q, tag, cursor)` | `GET /api/knowledge` (wrapper `{items, next_cursor}`) | cursor pagination — initial page + load more; WS `knowledge.created/updated/deleted` reconcile |
| `useKnowledgeItem(id)` | `GET /api/knowledge/:id` | parses; 404 returns undefined |
| `useTemplates()` | `GET /api/templates` (bare array) | parses; WS `template.created/updated/deleted` reconcile |
| `useNotifications()` | `GET /api/notifications` (bare array) | parses 100-row max; `markAllRead` mutation optimistically flips all `read=true` and rolls back on error |
| `useUsers()` | `GET /api/users` (bare array) | parses; cached for 10 min staleTime |
| `useArchive()` (V1) | `GET /api/cards/archived` | parses |
| `useReview()` (V2) | `GET /api/review` (wrapper) | parses; null summary tolerated |
| `useTokens()` (V2) | `GET /api/tokens` | parses |
| `useMirrorTokens()` (V2) | `GET /api/mirror/tokens` | parses |

**Mutation hook tests (30 mutations from S4 §5.4 — sample of the most
critical 12; full suite mirrors the S4 table):**

| Mutation | Optimistic test | Rollback test | Notification side-effect test |
|---|---|---|---|
| `createCard` | prepend stub to `['cards', scope]`, send fires | 5xx rollback: stub removed | — |
| `patchCard` | merge into `['card', id]` + `['cards', scope]`; **drag-to-move** asserts `{status, position}` body shape | 5xx rollback: prior snapshot restored | — |
| `archiveCard` | remove from list | rollback re-inserts at original index | snackbar surfaced with Retry |
| `uploadAttachment` | placeholder tile appended | rollback removes placeholder | — |
| `cardFromImage` | stub w/ `needs_review=true` prepended | rollback removes stub | WS `card.updated` swaps title when Vision AI completes |
| `cardFromAudio` | same | same | same |
| `postMessage` | append CardEvent with temp id | rollback removes; input text preserved | server fires push to assignees (covered E2E §5) |
| `markEventsRead` | decrement unread count locally | rollback restores | — |
| `enqueueInsight` | prepend pending insight | rollback removes | WS `insight.updated` replaces (covered §3.3 useInsights) |
| `createKnowledge` | insert into `['knowledge', scope]` head | rollback removes | — |
| `markAllNotificationsRead` | flip all `read=true` | rollback reverts | — |
| `subscribeFcm` | no optimistic | error → toast; 410 → silent local cleanup (S4 §6.4) | — |

### 3.4 Per zod schema (S5 §3 fixtures — §2.2 envelopes)

| Schema | Fixture (captured via curl, committed to `__tests__/fixtures/`) | Fail-closed test |
|---|---|---|
| `Card` | `cards-list.json` (3 cards across lanes) | drop required `title` → expect `ZodError` |
| `CardEvent` | `card-events.json` (system + message + ai entries) | drop `entry_type` → ZodError |
| `CardLink` (V2) | `card-links.json` | drop `label` → ZodError |
| `KnowledgeItem` | `knowledge-list.json` (URL + plain) | drop `visibility` → ZodError |
| `Insight` | `insights-list.json` (pending + ok + ok-degraded + failed) | drop `status` → ZodError |
| `Notification` | `notifications-list.json` (read + unread) | drop `card_id` → ZodError |
| `Template` | `templates-list.json` | drop `name` → ZodError |
| `User` | `users-list.json` (incl. `short_name`) | drop `short_name` → ZodError |
| `Attachment` | `card-attachments.json` (image + audio + file kind) | drop `kind` → ZodError |
| `UnreadCounts` (Record) | `messages-unread.json` | inject non-numeric value → ZodError |
| `CardsList` (bare array) | re-use `cards-list.json` | wrap in `{cards: [...]}` → ZodError |
| `KnowledgeList` (wrapper) | re-use `knowledge-list.json` | drop `next_cursor` → ZodError |
| `InsightsList` (wrapper) | re-use `insights-list.json` | drop `insights` key → ZodError |
| `ReviewSummary` (V2) | `review.json` | drop `done` → ZodError |

**Test orchestration (per S5 P3 done-test):** add a deliberate `.extra_field`
to a fixture — the test must **pass** (zod default is strip-unknown). Drop
a required field — the test must **fail with ZodError**. Both behaviors are
wired in `__tests__/api/schema-roundtrip.test.ts`.

---

## 4. Integration Test Specs (msw + full-screen render)

For each MVP+V1 screen (14 from S5 §3): mount via `<NavigationContainer>` +
`<QueryClientProvider>` + msw server, drive primary interactions via
`@testing-library/react-native` `userEvent`, assert downstream effects.

| # | Screen | F-NNN | MVP/V1 | Mount + initial assertion | Primary interaction | Mutation assertion (msw handler verifies body) | WS assertion | Error path |
|---|---|---|---|---|---|---|---|---|
| 1 | `LoginScreen` | F-001..F-011 | MVP | renders mode label "SIGN IN" by default | type email + password, tap Sign in | `POST /api/auth/native/token` body `{email, password, device_label}` | n/a (WS not connected yet) | 401 → inline error "Wrong email or password. Try again." (S3 §3.1) |
| 2 | `BoardScreen` | F-050..F-110 | MVP | renders 3 cards in Today lane from fixture | swipe to next lane | none | WS `card.created` → new card appears in correct lane | GET cards 500 → snackbar "Couldn't load cards" + Retry button works |
| 3 | `CaptureSheet` | F-120..F-131 | MVP | sheet opens with input focused | type "buy milk", tap send | `POST /api/cards` body `{title:"buy milk", status:"today", source:"manual"}` | WS `card.created` → snackbar "Card saved" appears | 5xx → inline error caption; sheet stays open |
| 4 | `CardDetailScreen` | F-150..F-183 | MVP | all sections render | tap In Progress status chip | `PATCH /api/cards/:id` body `{status:"in_progress", position:<number>}` | WS `card.updated` from server reconciles | PATCH 5xx → field stays editable, inline red caption, snackbar Retry |
| 5 | `CardDetailScreen` (chat path) | F-310..F-327 | MVP | timeline renders 3 events; auto-scrolls to bottom | type "@ai how?" + send | `POST /api/cards/:id/messages` body `{content:"@ai how?"}` | WS `card.ai_response` → new event appended with suggestion chips | 400 → inline error |
| 6 | `AiInsightsCard` | F-200..F-215 | MVP | empty state with Brainstorm CTA | tap Brainstorm | `POST /api/cards/:id/insights/brainstorm` → 202 `{id, status:'pending'}` | WS `insight.queued` flips to pending state; `insight.updated` renders related items | 429 → "You've hit today's brainstorm limit" |
| 7 | `KnowledgeListScreen` | F-540..F-549 | MVP | renders 5 knowledge items from fixture | scroll triggers next page load | `GET /api/knowledge?cursor=<base64>` fires | WS `knowledge.created` → new item appears at top | 500 → snackbar + Retry |
| 8 | `KnowledgeDetailScreen` | F-600..F-606 | MVP | renders title + body + linked cards | tap URL "↗" | opens `expo-web-browser` Custom Tab | WS `knowledge.updated` updates body | 404 → empty state "This knowledge item is gone." |
| 9 | `KnowledgeEditScreen` | F-630..F-639 | MVP | renders pre-filled from share intent | tap Save | `POST /api/knowledge` body `{title, url, body, visibility, source:"share_target"}` | n/a | 400 → inline error caption |
| 10 | `ShareTargetScreen` | (S3 §3.11) | MVP | rendered for <200 ms | (auto) | n/a | n/a | auth missing → forward to LoginScreen with `pendingDeepLink` |
| 11 | `NotificationListScreen` | F-340..F-351 | MVP | renders 50 notifications max | tap "Mark all read" | `PUT /api/notifications/read-all` | WS `card.message` → list refetches (S3 §3.13 F-351) | 5xx → snackbar |
| 12 | `SettingsScreen` | F-440..F-446, F-461 | MVP | renders theme segmented control + short-name input | type new short name, Save | `PATCH /api/auth/me` body `{short_name:"newname"}` | n/a | 400 → caption "error" |
| 13 | `ArchiveScreen` (V1) | F-510..F-519 | V1 | renders archived list | tap Restore on row | `PATCH /api/cards/:id/restore` | WS `card.updated` → row leaves archive | 5xx → snackbar |
| 14 | `CaptureSheet` (photo path) | F-125 | MVP | photo button visible | tap Photo, CameraX mock returns URI | `POST /api/cards/from-image` multipart body has `file` part with image MIME | WS `card.created` → optimistic stub replaced with server card | 413 → "File too large (max 5 MB)" |

---

## 5. E2E Test Specs (Detox)

### 5.1 Setup

| Config | Value |
|---|---|
| Detox | `20.32.0` (per S4 §2.2) |
| Emulators | Pixel 6 Pro emu API 33 (smoke pack — CI default), Pixel 8 Pro emu API 35 (regression pack — main push) |
| Build | `eas build --profile development --platform android` (Dev Client APK with Detox helpers) OR `detox build -c android.emu.release` |
| Test runner | jest via `e2e/jest.config.js` |
| Backend | `qa-staging.YOUR-DOMAIN` env (or LAN backend at `192.168.50.13` in dev) — see §14 |

### 5.2 Detox + Expo Router compatibility (RISK — per S4 §15 R3, S5 §14.4)

**FLAG:** Detox historically tests against `testID` props, but Expo Router's
file-based routes nest navigators in ways that have caused test discovery
failures before. **MITIGATION:** S5 P0 spike: write **one** Detox login test
on the empty scaffold. If it passes → continue. If it fails → fall back to
**Maestro** (YAML, RN-friendly, no native test-target wiring).

**Stage 7 decision required**: lock the framework before locking the E2E pack
rosters below. The test specs are framework-agnostic in shape; only the
selector syntax changes.

### 5.3 E2E packs

#### 5.3.1 Smoke pack — 3 tests, <5 min total, runs on every PR

| Test | Maps to journey | Steps |
|---|---|---|
| `e2e/login.test.ts` | J1 (auth slice only) | launch app → assert LoginScreen → toggle Create → fill 4 fields → tap Create account → assert BoardScreen visible within 5 s |
| `e2e/capture-text.test.ts` | J1 + J4 (capture slice) | (assume signed in via test fixture) → tap FAB → assert CaptureSheet → type "smoke test card" → tap send → assert "Card saved" snackbar within 2 s → assert card visible in Today lane |
| `e2e/card-detail-view.test.ts` | J5 (view slice) | (signed in, seeded card) → tap a card → assert CardDetailScreen with correct title → assert timeline section renders ≥1 event → tap back → assert BoardScreen restored |

#### 5.3.2 Regression pack — 15 tests, ~30 min, runs on main push

| # | Test | Journey / scenario | Key assertions |
|---|---|---|---|
| 1 | `e2e/login.test.ts` | J1 first-time install + auth (S5 P2) | register → auth success → token persists across cold start → sign out clears (taps from launch: 4) |
| 2 | `e2e/share-target.test.ts` | J2 share intent (S5 P6) | `adb shell am start -a android.intent.action.SEND -t text/plain --es android.intent.extra.TEXT "https://example.com"` → KnowledgeEditScreen pre-filled with url+title → Save → asserts `POST /api/knowledge` with `source='share_target'` → returns to Chrome (back stack) |
| 3 | `e2e/capture-photo.test.ts` | J3 photo capture (S5 P6) | tap FAB → Photo → mock camera returns fixture URI → upload fires → snackbar "Card created — AI is reading the photo…" → within ~8 s WS `card.updated` swaps title (Vision AI) → `needs_review` badge clears |
| 4 | `e2e/move-card-drag.test.ts` | J4 drag path (S5 P12) | long-press card 500 ms → drag horizontally past lane edge → release in In Progress → optimistic UI shows card in IP within 500 ms → assert `PATCH /api/cards/:id` body shape |
| 5 | `e2e/move-card-sheet.test.ts` | J4 sheet path (S5 P7) | long-press card → LongPressActionSheet opens → tap "Move to In Progress" → snackbar success → card in IP lane |
| 6 | `e2e/ai-chat.test.ts` | J5 push tap → reply → suggestion chip (S5 P10) | fire mock FCM `data.cardId=<id>` → tap notification → CardDetailScreen scrolled to bottom → AI suggestion chips visible → tap "Set due date 2026-05-22" → due-date pill updates → assert `PATCH due_date` body |
| 7 | `e2e/brainstorm.test.ts` | J6 (S5 P8) | open card → tap Brainstorm → panel pulses → mock WS `insight.updated ok` → related items + web findings + next steps render → tap web finding "Open ↗" → Custom Tab opens (URL assertion) → back → returns to CardDetail |
| 8 | `e2e/sign-out.test.ts` | sign out + relaunch | sign out → LoginScreen → kill app → relaunch → still LoginScreen (no auto-login) |
| 9 | `e2e/push-tap.test.ts` | quit-state push tap (S5 P10) | force-stop app → adb broadcast FCM with `data.cardId=<id>` → notification appears → tap → cold-start to CardDetailScreen within 2 s |
| 10 | `e2e/share-text.test.ts` | share plain text (no URL) | `adb shell am start -a ACTION_SEND -t text/plain --es ... "buy milk"` → KnowledgeEditScreen with `title='buy milk', body='buy milk', auto_fetch=false` |
| 11 | `e2e/share-url.test.ts` | share URL (already covered #2 — kept as named for parity) | (same as #2) |
| 12 | `e2e/share-image.test.ts` | share image | `adb shell am start -a ACTION_SEND -t image/jpeg --eu android.intent.extra.STREAM file:///sdcard/test.jpg` → CaptureSheet with photo attached → user picks lane + adds title |
| 13 | `e2e/swipe-archive.test.ts` (V1) | swipe-to-archive (S5 P12) | swipe-left card → red backdrop with archive icon → release commits → snackbar "Archived" with Undo (5 s) → tap Undo → card restored |
| 14 | `e2e/biometric-unlock.test.ts` (V1) | BiometricPrompt (S5 P12 / S4 §7.5) | foreground app after >5 min background → BiometricPrompt shown → mock success → token unlocked → BoardScreen visible |
| 15 | `e2e/offline-read.test.ts` | offline read of cached cards | `adb shell svc wifi disable; svc data disable` → relaunch app → cached cards still visible → `cloud_off` icon in TopAppBar → restore connectivity → WS reconnects within 3 s → cards refetch |

#### 5.3.3 Soak pack — 1 test, ~2 hours, runs nightly

| Test | Scenario | What it watches |
|---|---|---|
| `e2e/soak.test.ts` | Repeat create+edit+archive cycle 100 times on Pixel 4a physical | (a) memory leak — `adb shell dumpsys meminfo com.smartkanban.app` stays <200 MB after 30 min; (b) WS storm — no more than 1 reconnect per WAN drop event; (c) token expiry — after server invalidates session, app re-auths silently once then surfaces login if still 401; (d) Sentry error count <5 over the run; (e) ANR count = 0 |

### 5.4 Detox test spec template — Journey 5 worked example (RemoteInput Reply)

```ts
// e2e/ai-chat.test.ts
describe('J5 — AI chat thread reply path', () => {
  beforeAll(async () => {
    // 1. Seed test data via backend test fixture endpoint:
    //    POST /api/_test/seed { user: 'qa-user@kanban.test', cards: 1, ai_msg: true }
    //    (Stage 5 to add test-only seed endpoint behind X-Test-Auth header)
    await fetch(`${BACKEND}/api/_test/seed`, { method: 'POST', headers: { 'X-Test-Auth': TEST_SECRET }, body: JSON.stringify({ user: 'qa-user@kanban.test', cards: 1, ai_msg: true }) });
    // 2. Sign in test account programmatically — set authToken in SecureStore before launch
    await device.launchApp({ newInstance: true, permissions: { notifications: 'YES' } });
  });

  it('push tap → CardDetail → suggestion chip applies', async () => {
    // Step 1: trigger FCM via adb broadcast
    await device.sendUserNotification({
      payload: { data: { cardId: TEST_CARD_ID, type: 'card.ai_response', title: 'AI', body: 'Try setting due Mon' } },
    });
    // Step 2: assert notification visible
    await expect(element(by.text('Try setting due Mon'))).toBeVisible();
    // Step 3: tap notification
    await device.openURL({ url: `kanban://card/${TEST_CARD_ID}` });
    // Step 4: assert CardDetailScreen scrolled to AI message
    await expect(element(by.id('ai-message-row'))).toBeVisible();
    await expect(element(by.id('suggestion-chip-set-due'))).toBeVisible();
    // Step 5: tap chip
    await element(by.id('suggestion-chip-set-due')).tap();
    // Step 6: assert due-date pill updated to 2026-05-22
    await expect(element(by.id('due-pill'))).toHaveText('2026-05-22');
    // Step 7: assert chip transitions to Applied state
    await expect(element(by.id('suggestion-chip-set-due'))).toHaveText('✓ Set due date 2026-05-22');
  });

  afterAll(async () => {
    // Teardown: delete seeded card
    await fetch(`${BACKEND}/api/_test/teardown`, { method: 'POST', headers: { 'X-Test-Auth': TEST_SECRET } });
  });
});
```

Each of the 6 journey tests follows the same setup/steps/assertions/teardown
shape. Full specs live in `e2e/<journey>.test.ts` alongside the project.

---

## 6. Performance Tests (against S2 §6 success criteria)

Measured via `react-native-performance` markers on **Pixel 4a (min hardware)**
unless noted. Thresholds = 95th percentile across 20 runs.

| Metric | Target | Device | Measurement |
|---|---|---|---|
| **Cold start to Board visible** | < **3.5 s** (S2 §6) | Pixel 4a | `Performance.mark('app_start')` in `index.js` → `Performance.measure('app_to_board_visible', 'app_start')` at first cards paint; CI gate via Detox + Sentry custom trace |
| **Capture funnel text** | < **4 s** from FAB tap to card visible (S2 §6) | Pixel 4a | Detox: `tap(FAB)` → wait for `id=card-tile-<temp-id>` in lane → measure delta |
| **Capture funnel photo** | < **8 s** (S2 §6) | Pixel 4a | Detox: `tap(FAB)` → `tap(Photo)` → return from CameraX → measure to card-tile visible |
| **Drag-to-move latency** | < **250 ms** from gesture-end to optimistic UI update | Pixel 8 + Pixel 4a | instrumented timestamp in `KanbanCard.onDragEnd` → next frame paint |
| **Memory steady-state** | < **200 MB** RSS after 30 min of normal use | Pixel 4a | soak test `adb shell dumpsys meminfo com.smartkanban.app` polled every 5 min |
| **Bundle size (initial APK)** | < **25 MB** base; < 40 MB aggregate (S2 §6) | n/a | EAS Build size report; CI gate fails if `aab.size > 40 MB` |
| **WS reconnect latency** | < **3 s** (S2 §6) | Pixel 8 | Detox: `adb svc data disable` → wait 5 s → `enable` → measure to first `card.*` event delivered |
| **Cold-start WS handshake** | < **800 ms** (S2 §6) | Pixel 8 | `Performance.mark('ws_connect_start')` → `Performance.measure('ws_handshake', 'ws_connect_start')` on `hello` received |
| **Crash-free sessions** | > **99.5%** | All | Sentry / Firebase Crashlytics rolling 30-day window |
| **ANR rate** | < **0.5%** | All | Google Play Console > Android vitals |
| **Push deliverability** | > **95%** within 30 s (S2 §6) | All | server sends test push every 4 h to synthetic subscriber; client logs receipt timestamp; backend computes deliverability ratio |
| **Notification permission grant rate** | > **70%** on first prompt (S2 §6) | All | Sentry event `permission_granted` / `permission_denied` |

**CI enforcement (Performance regression budget):** measure on every `main`
push via FTL game-loop test; if cold-start regresses >15% from rolling 7-day
median → CI warn (not block); >30% regression → block.

---

## 7. Push Notification Test Plan

### 7.1 Per channel (3 channels from S3 §6.1, S4 §8.3)

| Channel | Importance | Test cases |
|---|---|---|
| `card-activity` | HIGH | (i) permission grant flow (Allow / Deny / system Settings revoke); (ii) foreground delivery (in-app snackbar + Notifee notification both visible); (iii) background delivery (system notification with correct group_key=`card-<id>`); (iv) quit-state delivery (cold-start to deep-link in <2 s); (v) RemoteInput Reply (type in shade, posts to backend, server WS event arrives, notification cancels); (vi) tap deep link to CardDetailScreen with correct id; (vii) group collapse (3 notifications for same card_id collapse into InboxStyle) |
| `insights` | DEFAULT (no sound) | (i) tap deep links to CardDetailScreen scrolled to AI Insights section; (ii) silent (no vibration/sound) when phone is on Do Not Disturb |
| `reminders` (V2) | HIGH | Local `AlarmManager`-scheduled at due_date-24h; tap deep links to card; "Snooze 1h" reschedules |

### 7.2 FCM token lifecycle

| Lifecycle event | Test | Expected |
|---|---|---|
| First auth grant | run `e2e/push-permission.test.ts` post-sign-in | `POST_NOTIFICATIONS` prompt shown on API 33+; on grant → `POST /api/push/fcm/subscribe {token, device_id, device_label?}` fires; row appears in `fcm_subscriptions` table |
| Token refresh | adb fire `MessagingService.onNewToken` mock | `POST /api/push/fcm/subscribe` re-fires with new token; old row replaced via UNIQUE constraint upsert |
| Sign out | tap Sign out | `DELETE /api/push/fcm/subscribe` fires; `fcm_subscriptions` row removed; `messaging().deleteToken()` called |
| Server 410-Gone (UNREGISTERED) | deliberately corrupt token in DB; server attempts push | server-side `pushToUser` catches `messaging/registration-token-not-registered` → `DELETE FROM fcm_subscriptions WHERE fcm_token = $1` (S4 §8.1, mirrors web-push 410 cleanup S1 §7.5) |

### 7.3 adb commands for push testing (for QA tester to fire test pushes)

```bash
# Test push: synthetic FCM payload via adb broadcast (Notifee handles it)
adb shell am broadcast -a com.google.android.c2dm.intent.RECEIVE \
  -n com.smartkanban.app/.MessagingService \
  --es google.message_id "test-$(date +%s)" \
  --es cardId "<TEST_CARD_UUID>" \
  --es type "card.message" \
  --es title "Saif on Backend rate-limit" \
  --es body "looks great"

# Verify channel state
adb shell dumpsys notification --noredact | grep -A 5 "com.smartkanban.app"

# Check notification permission state
adb shell pm list permissions -g | grep POST_NOTIFICATIONS
adb shell appops get com.smartkanban.app POST_NOTIFICATIONS

# Trigger deep link (skip notification, fire intent directly)
adb shell am start -W -a android.intent.action.VIEW \
  -d "kanban://card/<TEST_CARD_UUID>" \
  com.smartkanban.app

# Force-stop then test quit-state push
adb shell am force-stop com.smartkanban.app
# (repeat the broadcast above; expect cold-start within 2 s on tap)

# Send via Firebase Console / fcm-rest-api for a real server send round-trip:
curl -X POST https://fcm.googleapis.com/v1/projects/$FCM_PROJECT/messages:send \
  -H "Authorization: Bearer $FCM_OAUTH_TOKEN" -H "Content-Type: application/json" \
  -d '{"message":{"token":"'$DEVICE_FCM_TOKEN'","data":{"cardId":"<uuid>","type":"card.message","title":"Saif on X","body":"looks great"}}}'
```

---

## 8. Accessibility Test Plan (against S3 §8)

### 8.1 TalkBack

| Pillar | Test | Pass criteria |
|---|---|---|
| Navigability | Every screen swipe-right traverses logical reading order | every interactive element reachable; no orphan focus |
| Labels | Every IconButton, FAB, Chip, KanbanCard, sheet handle has `accessibilityLabel` + `accessibilityRole` | TalkBack reads a meaningful label, not the element type |
| Custom actions | KanbanCard exposes "Open / Move to Today / Move to In Progress / Archive" via `accessibilityActions` (per S3 §8.1) | TalkBack action menu (swipe up + right) lists all 4; activating "Move to Today" fires PATCH |
| Drag accessibility-only path | TalkBack-only path for drag-to-move via custom actions (required by Play A11y guidelines) | move action completes without gesture |
| LiveRegion | Snackbar announced when shown | TalkBack reads snackbar copy automatically |
| AI suggestion chips | Each chip announces "Suggestion: set due date Monday. Tap to apply." | spoken correctly |

### 8.2 Dynamic font scale (S3 §8.2)

Render every screen at scale 1.0, 1.15, 1.3, 1.5 (`Configuration.fontScale`).
Assert:
- No clipped text (`overflow=Ellipsis` only allowed on card description F-099 maxLines=2)
- No overlapping elements
- Card titles clamp at 28 sp at 1.5x scale (per S3 §1.5)
- TopAppBar / NavigationBar maintain min-height; FAB stays clickable

Test rig: jest snapshots × 4 scales for each MVP+V1 screen (14 × 4 = 56 snapshots).

### 8.3 High contrast / large text — visual smoke

5 key screens (LoginScreen, BoardScreen, CardDetailScreen, KnowledgeListScreen,
NotificationListScreen):
- Enable `AccessibilityManager.isHighTextContrastEnabled()` simulator setting
- Assert outline tokens bumped from `surfaceVariant` to `outline` (per S3 §8.4)
- Caption text contrast verified ≥ 4.5:1

### 8.4 Color-blind verification (S3 §8.7)

4 lane accents tested in Protanopia / Deuteranopia / Tritanopia simulator
(e.g. Sim Daltonism / Chrome DevTools color-blind):
- Slate / Amber / Violet / Emerald — each pair distinguishable in all 3 sims at ≥ 4.5:1
- Color is never sole signal — lane accent + dot + lane name carry semantics
- Designer already verified per S3 §1.4; QA re-verifies post-impl on the
  rendered build

### 8.5 Reduced motion (S3 §1.7)

Enable system Accessibility → Animation Scale = 0 (or 0.5). Assert:
- KanbanCard press: outline color shift only, no scale
- Sheet open: cross-fade 200 ms, no spring
- AiInsightsCard pending: static "Thinking…" text, no fade pulse
- Skeleton: static `surfaceVariant`, no shimmer
- Page transitions: cross-fade, no shared-axis

Test: jest snapshots per affected component with `useReducedMotion = true`.

### 8.6 Keyboard navigation (V1+)

External BT keyboard:
- Tab traverses interactive elements in DOM order
- Enter activates buttons / chips
- Esc dismisses modals (V1; system back equivalent)
- `/` focuses search (V2 reserved per S3 §5.x)

MVP: basic smoke check on LoginScreen + BoardScreen only.

---

## 9. Visual Parity Manual Test (RULE 12 + RULE 14)

### 9.1 Procedure

For every MVP + V1 screen:

1. **Capture web baseline**: open `https://kanban.YOUR-DOMAIN` in Chrome on
   the same Pixel 8 device, force mobile shell render, screenshot via
   `adb shell screencap`.
2. **Capture native**: navigate to the equivalent route in the SmartKanban
   APK, screenshot.
3. **Diff manually** (or via Percy/Chromatic when CI integrated — see §15
   open question).
4. **Catalog every element** present in web but absent or different in native.
5. **Sign-off requires zero unjustified diffs.** Adapted (🔄) elements per
   the S2 parity matrix MUST have a written justification in the diff
   report.

### 9.2 Screens in scope (14)

| Web route | Native screen | F-NNN scope | Adapted-element notes |
|---|---|---|---|
| `/login` | `LoginScreen` | F-001..F-011 | F-003 radial bloom backdrop is V1; F-150-style backdrop blur removed (full-screen route per S3 §3.4) |
| `/` (mobile shell) | `BoardScreen` | F-660..F-680 | F-660 weather chip V2; F-664 activity ticker V2; F-672 install prompt 🚫 |
| `/m/card/:id` | `CardDetailScreen` | F-720..F-740 | F-154 chain icon V2; F-158-F-160 QR V2 |
| `/?capture=true` (PWA capture state) | `CaptureSheet` | F-120..F-131 | F-127 voice promoted from stub (S2 §8.3); F-128 template picker as native sheet |
| (share intent in PWA) | `ShareTargetScreen` | F-547 | New native-only screen — no web equivalent; visual parity = N/A |
| `/knowledge` | `KnowledgeListScreen` | F-540..F-549 | F-541 + new note FAB V1; F-542-F-544 scope/search/tag chips V1 |
| `/knowledge/:id` | `KnowledgeDetailScreen` | F-600..F-606 | F-607-F-612 owner actions V1 |
| (PWA knowledge edit) | `KnowledgeEditScreen` | F-630..F-639 | F-634 tags input V1 |
| `/notifications` (PWA panel) | `NotificationListScreen` | F-340..F-351 | F-343 popover → full-screen route (native idiom S3 §3.13) |
| `/?settings=true` (PWA settings) | `SettingsScreen` | F-440..F-461 | F-447-F-460 mirror/api/telegram V2 |
| `/?archive=true` (PWA archive) | `ArchiveScreen` (V1) | F-510..F-519 | V1 — match PWA archive panel |
| AI insights inline | `AiInsightsCard` | F-200..F-215 | identical structure; layout adapted to native section |
| `/m/more` | `MoreScreen` | F-760..F-766 | F-762 weekly review V2; F-763 archive V1; F-765 install row 🚫 |
| `/weekly-review` | `WeeklyReviewScreen` (V2) | F-410..F-420 | V2 |

### 9.3 Sign-off artifact

Stored at `qa-reports/visual-parity-v<version>.md`; one row per screen with
side-by-side screenshots embedded. **Sign-off blocks tag `v*`** if any
unjustified diff is open.

---

## 10. Security Test Plan

### 10.1 Token storage — no plaintext anywhere

```bash
# Install app, sign in, then:
adb shell run-as com.smartkanban.app ls -la /data/data/com.smartkanban.app/shared_prefs/
adb shell run-as com.smartkanban.app cat /data/data/com.smartkanban.app/shared_prefs/*.xml | grep -i "token\|password\|bearer"
```
Expected: no plaintext token in any prefs file. SecureStore-backed entries
appear as opaque blobs (EncryptedSharedPreferences, S4 §7.1).

### 10.2 Network — no token leakage outside HTTPS

```bash
adb shell setprop log.tag.OkHttp DEBUG
adb logcat | grep -E "Authorization:|kanban_session"
```
Expected: no `Authorization: Bearer …` header logged in cleartext; all
traffic over TLS (verified via Charles Proxy MITM with self-signed cert →
must fail per §10.5).

### 10.3 Backup — SecureStore + MMKV excluded

```bash
adb backup -nobackup -keyvalue com.smartkanban.app
adb shell bmgr backupnow com.smartkanban.app
# unpack the backup tar; grep for tokens
```
Expected: NOT included per `<full-backup-content>` excludes (S4 §7.6 backup_rules.xml).
Verify exclude entries: `<exclude domain="sharedpref" path="SecureStore"/>`,
`<exclude domain="sharedpref" path="MMKV"/>`,
`<exclude domain="database" path="expo-secure-store.db"/>`.

### 10.4 Cleartext — networkSecurityConfig blocks HTTP

Build production profile, attempt a request to `http://` in dev console.
Expected: `CleartextNotPermittedException` (per S4 §7.3 network_security_config.xml).
Dev profile allows `http://192.168.50.13` LAN only; preview + production block.

### 10.5 Cert validation — MITM with self-signed cert must fail

Use Charles Proxy / mitmproxy with a self-signed cert. Expected: app
rejects (system trust anchor only, no user-installed certs honored). V2
pinning adds defense in depth.

### 10.6 Permission scope — runtime, lazy

| Permission | When prompted | Test (assert NOT prompted before trigger) |
|---|---|---|
| `CAMERA` | first tap on Photo button (F-125) | `adb shell appops get com.smartkanban.app CAMERA` reports `default` until first tap |
| `RECORD_AUDIO` | first tap on Voice button (F-127) | same — `default` until tap |
| `POST_NOTIFICATIONS` (API 33+) | first foreground after auth (S3 §3.13) | not on cold-launch pre-auth |
| `READ_MEDIA_IMAGES` (API 33+) | first tap on Photo Library (F-734) | not prompted until tap |

### 10.7 Deep link injection

Test with malicious deep links:

```bash
adb shell am start -W -a android.intent.action.VIEW \
  -d "kanban://card/'; DROP TABLE cards;--" com.smartkanban.app

adb shell am start -W -a android.intent.action.VIEW \
  -d "kanban://card/../../etc/passwd" com.smartkanban.app

adb shell am start -W -a android.intent.action.VIEW \
  -d "kanban://card/$(echo -n 'rm -rf /' | base64)" com.smartkanban.app
```
Expected: no crash; param coerced to string and passed to `useCard(id)`;
backend 404 (per S1 §2.15 global 22P02 handler maps malformed UUIDs to
404); deep-link router does not eval / shell-expand / SQL pass-through.

### 10.8 R8 / ProGuard regression

Build production with R8 enabled. Re-run smoke + regression Detox packs.
Expected: no method-not-found, no missing class, no Reanimated keep-rule
miss. Sentry uploaded mapping file must symbolicate stack traces.

---

## 11. Acceptance Criteria per Build Phase (S5 §1, 12 phases)

For each phase: testable criteria, **evidence-required** (screenshot / log /
test pass output). QA signs off in the phase manifest before next phase
begins.

### Phase 0 — Project scaffold

- [ ] `npm run verify:pinned` exits 0 — **evidence:** CI log
- [ ] `npm run lint` 0 errors — **evidence:** CI log
- [ ] `npm run typecheck` 0 errors — **evidence:** CI log
- [ ] EAS Build `development` APK installs on Pixel 8 (physical) — **evidence:** screenshot of "Hello SmartKanban" launch
- [ ] App opens within 3 s on cold-start — **evidence:** stopwatch / `react-native-performance` trace
- [ ] Detox + Expo Router spike: 1 login test passes (or fallback to Maestro documented per §14.4) — **evidence:** CI log

### Phase 1 — Design tokens + theme

- [ ] DesignSandboxScreen renders type ramp / color tokens / lane accents / motion demos — **evidence:** screenshots in light + dark + system-follow
- [ ] Snapshot tests `__tests__/design/theme.test.ts` pass — **evidence:** CI log
- [ ] Fonts (Spectral, Inter, JetBrains Mono) load from Google Fonts + local fallback on offline first launch — **evidence:** offline-mode screenshot

### Phase 2 — Auth + bearer-token bootstrap

- [ ] LoginScreen registers + signs in against staging backend — **evidence:** Detox `e2e/login.test.ts` pass
- [ ] Token survives cold start — **evidence:** Detox cold-kill test
- [ ] Sign out clears SecureStore (verify via §10.1 adb dump) — **evidence:** adb output
- [ ] **Backend prereqs verified:** `POST /api/auth/native/token` returns `{token, scope:'native', user}`; `mirror_tokens` CHECK constraint allows `'native'` — **evidence:** curl + psql `\d mirror_tokens` output
- [ ] All msw mocked status paths (200/201/400/401/403/409/5xx) tested — **evidence:** jest coverage report

### Phase 3 — API client + zod schemas

- [ ] All 51 backend routes have a typed endpoint function — **evidence:** code review checklist
- [ ] Every fixture parses through its zod schema; intentional drift fails — **evidence:** `__tests__/api/schema-roundtrip.test.ts` CI log
- [ ] All bare-array vs wrapper envelopes match S1 §2 — **evidence:** code review + grep `z.array` vs `z.object`

### Phase 4 — Board MVP read-only

- [ ] All 4 lanes render with correct status accent (slate/amber/violet/emerald per S3 §1.4) — **evidence:** screenshot per lane
- [ ] Cards load via GET /api/cards within 2 s on Pixel 4a — **evidence:** Performance trace
- [ ] Empty lane shows italic copy + CTA per lane (S3 §3.2) — **evidence:** screenshot per empty lane
- [ ] Error state shows snackbar + Retry button; tap triggers refetch — **evidence:** integration test
- [ ] HorizontalPager swipes through lanes with light-tick haptic — **evidence:** Detox + manual on physical
- [ ] Pull-to-refresh works — **evidence:** Detox
- [ ] Detox smoke test passes on Pixel 6 Pro emulator — **evidence:** CI log
- [ ] Visual parity diff against web mobile shell shows only justified diffs — **evidence:** §9 sign-off report

### Phase 5 — WebSocket integration

- [ ] WS connects on auth + foreground; disconnects after 30 s background grace — **evidence:** logcat + integration test
- [ ] All 19 events from S1 §3.2 route to React Query cache correctly — **evidence:** `__tests__/ws/events.test.ts` CI log (19 cases)
- [ ] Auto-reconnect with 500ms→10s backoff — **evidence:** Detox `offline-read.test.ts`
- [ ] `cloud_off` icon appears in TopAppBar when WS disconnected (S3 §3.2) — **evidence:** screenshot
- [ ] Desktop creates card → native Board reconciles within 2 s — **evidence:** manual demo screen recording

### Phase 6 — Capture flow MVP

- [ ] Text capture: FAB → type → send → card visible in lane within 4 s on Pixel 4a — **evidence:** Performance trace + Detox
- [ ] Photo capture: FAB → Photo → shutter → use → card visible within 8 s; AI title swap within 30 s — **evidence:** Performance trace + Detox
- [ ] Share intent text/URL → KnowledgeEditScreen pre-filled within 200 ms — **evidence:** Detox `share-target.test.ts`
- [ ] Share intent image/* → CaptureSheet with photo attached — **evidence:** Detox `share-image.test.ts`
- [ ] Slash-prefix template instantiation works — **evidence:** integration test
- [ ] Voice button shows "coming soon" Snackbar until P12 — **evidence:** screenshot

### Phase 7 — Card detail + chat MVP

- [ ] Every editable field debounces and PATCHes correctly (title 500ms, desc 800ms, tags on blur, status immediate) — **evidence:** integration tests
- [ ] Timeline renders all 4 entry types (system/message/ai/share) — **evidence:** screenshot per type
- [ ] @ai mention → server processes → WS `card.ai_response` appends — **evidence:** Detox `ai-chat.test.ts`
- [ ] Mark-as-read fires on mount + every incoming event — **evidence:** integration test
- [ ] Image lightbox: pinch zoom 1x-4x, swipe-down dismiss — **evidence:** Detox + manual
- [ ] Archive button → confirm → DELETE → WS `card.deleted` → snackbar + nav back — **evidence:** Detox

### Phase 8 — AI Insights

- [ ] Brainstorm trigger → 202 + pending pulse → WS `insight.updated` → results render — **evidence:** Detox `brainstorm.test.ts`
- [ ] Suggestion chip apply → PATCH fires → chip transitions to Applied state — **evidence:** Detox
- [ ] 429 rate-limit shows "You've hit today's brainstorm limit" — **evidence:** integration test
- [ ] 503 (AI off) shows "AI isn't configured on the server." — **evidence:** integration test
- [ ] Degraded mode (no Tavily results) shows "(degraded: web unavailable)" caption — **evidence:** screenshot

### Phase 9 — Card extras (V2 pre-flight)

- [ ] Chain WebView loads with bearer header injection, ReactFlow paints — **evidence:** Detox `chain.test.ts`
- [ ] QR panel renders SVG encoding `${APP_URL}/m/card/<id>` — **evidence:** screenshot + scan test
- [ ] Knowledge picker debounced search returns results — **evidence:** integration test
- [ ] (V2 gates) flagged behind feature flag — **evidence:** code review

### Phase 10 — FCM push end-to-end

- [ ] **Backend prereqs verified:** `fcm_subscriptions` table exists; `POST/DELETE /api/push/fcm/subscribe` work; `firebase-admin` initialized; `pushToUser` fans out to FCM with 410 cleanup — **evidence:** curl + psql + server-side jest
- [ ] Push permission prompt on first foreground after auth (API 33+) — **evidence:** screenshot
- [ ] Foreground delivery: in-app snackbar + Notifee notification — **evidence:** Detox `push.test.ts`
- [ ] Background delivery: system notification with correct group_key — **evidence:** screenshot + adb
- [ ] Quit-state delivery: cold-start to deep-link in <2 s — **evidence:** Performance trace + Detox `push-tap.test.ts`
- [ ] RemoteInput Reply posts message without opening app — **evidence:** Detox + adb broadcast
- [ ] Group collapse: 3 notifications same card → InboxStyle summary — **evidence:** screenshot
- [ ] Token lifecycle: register on grant, refresh, delete on signOut, 410 cleanup — **evidence:** §7.2 test results
- [ ] Push deliverability >95% within 30s over 100 sends — **evidence:** synthetic monitoring log

### Phase 11 — Knowledge tab (read + share-create)

- [ ] Knowledge list renders with all row variants (URL, no-URL, fetching, failed) — **evidence:** screenshot
- [ ] Detail screen: body renders, URL Open ↗ launches Custom Tab — **evidence:** Detox
- [ ] Share-intent → Edit form → Save → KB row appears on other device within 5 s — **evidence:** 2-device manual test
- [ ] Cursor pagination loads next page on scroll — **evidence:** integration test

### Phase 12 — Polish + V1 closure

- [ ] **Backend prereq verified:** `POST /api/cards/from-audio` accepts m4a/ogg/mp4/webm, Whisper transcribes, propose runs, card created with needs_review=true — **evidence:** server-side jest + manual
- [ ] Drag-to-move: long-press + drag → optimistic update → PATCH succeeds; trash zone archives with Undo — **evidence:** Detox `move-card-drag.test.ts` + `swipe-archive.test.ts`
- [ ] Voice capture: hold mic → record → release → transcript + card visible within 10 s — **evidence:** Detox `capture-voice.test.ts` + manual on physical
- [ ] Biometric unlock after >5 min background — **evidence:** Detox `biometric-unlock.test.ts`
- [ ] Templates CRUD: create / edit / delete from Settings → Templates — **evidence:** integration tests
- [ ] All Snackbar variants visible (Success / Info / Error+Retry / Persistent) — **evidence:** screenshot per variant
- [ ] Parity coverage ≥ 80% per S2 §6 — **evidence:** parity audit script output
- [ ] All §12 manual QA checklist rows green — **evidence:** signed off checklist

---

## 12. Manual QA Checklist (per release)

One-pager run by QA tester before promoting Play Internal → Closed → Production.
Each row: ☐ pass / ☐ fail / ☐ skip-with-reason.

### 12.1 Install / upgrade

- [ ] Fresh install from Play Internal track succeeds
- [ ] Upgrade from previous version preserves auth token + theme
- [ ] EAS Update (OTA) applies on relaunch without crash

### 12.2 Auth

- [ ] Sign in with existing account works
- [ ] Register new account works (if signup open)
- [ ] Sign out clears token and routes to LoginScreen
- [ ] Cold-start with valid token lands on Board, not Login
- [ ] Cold-start with expired token routes to Login with `pendingDeepLink` preserved

### 12.3 Capture

- [ ] Text capture → card in Today lane within 4 s (J1)
- [ ] Photo capture → card with image attached → AI title swap within 30 s (J3)
- [ ] Voice capture (V1) → transcript becomes title within 10 s (J1 voice)
- [ ] Share intent URL from Chrome → KnowledgeEditScreen → Save (J2)
- [ ] Share intent text from any app → KnowledgeEditScreen
- [ ] Share intent image from Photos → CaptureSheet with image
- [ ] Slash-template `/standup` instantiates correct template

### 12.4 Board

- [ ] All 4 lanes render with correct accents
- [ ] Lane swipe (HorizontalPager) settles smoothly with haptic
- [ ] Pull-to-refresh works
- [ ] Search filters local cards
- [ ] Long-press card → action sheet
- [ ] Move-to-lane from sheet
- [ ] Drag-to-move (V1) cross-lane via edge drag
- [ ] Drag-to-trash (V1) archives with Undo

### 12.5 Card detail (chat / AI / edit)

- [ ] Open card → all sections render
- [ ] Edit title → debounce 500 ms → PATCH → server reconciles
- [ ] Edit description → debounce 800 ms → PATCH
- [ ] Change status via chip → optimistic + PATCH
- [ ] Add tag (comma-separated, blur saves)
- [ ] Pick due date → PATCH
- [ ] Toggle assignee → PATCH
- [ ] Share to user → PATCH; notification fires server-side
- [ ] Add attachment via Camera / Library / Files
- [ ] Long-press attachment grid → paste image
- [ ] Brainstorm → results within 30 s; suggestion chip apply
- [ ] Send message with `@ai` → AI reply via WS within ~8 s
- [ ] Mark as read on mount; unread badge decrements
- [ ] Archive → confirm → nav back

### 12.6 Knowledge

- [ ] List renders with all row variants (URL, plain, fetching, failed)
- [ ] Tap row → detail
- [ ] Tap URL ↗ → Custom Tab opens
- [ ] Share intent create round-trip works

### 12.7 Settings

- [ ] Theme toggle (Light/Dark/System) applies + persists
- [ ] Short name save works
- [ ] Sign out works

### 12.8 Notifications (3 channels × 4 states)

| Channel | Foreground | Background | Quit-state | RemoteInput |
|---|---|---|---|---|
| card-activity | ☐ | ☐ | ☐ | ☐ Reply posts message |
| insights | ☐ | ☐ | ☐ | n/a |
| reminders (V2) | ☐ | ☐ | ☐ | ☐ Snooze reschedules |

- [ ] Permission grant flow works (Allow / Deny / Settings revoke)
- [ ] Group collapse for same card_id
- [ ] Tap → deep link to correct CardDetailScreen
- [ ] Notification cancels after RemoteInput Reply success

### 12.9 Accessibility

- [ ] TalkBack navigates every MVP screen
- [ ] KanbanCard action menu announces Open / Move / Archive
- [ ] Font scale 1.5x renders without overflow on 5 key screens
- [ ] Reduced motion: no springs, no shimmer
- [ ] High-contrast: outlines bumped, captions darker
- [ ] Color-blind: lane accents distinguishable in Protanopia / Deuteranopia / Tritanopia

### 12.10 Security (adb checks)

- [ ] §10.1 SecureStore plaintext check passes (no token in shared_prefs)
- [ ] §10.2 OkHttp logcat shows no Authorization in cleartext
- [ ] §10.3 adb backup excludes SecureStore + MMKV
- [ ] §10.4 cleartext HTTP rejected in production build
- [ ] §10.5 MITM with self-signed cert fails
- [ ] §10.6 runtime permissions only requested at use site
- [ ] §10.7 malicious deep link does not crash

### 12.11 Performance

- [ ] Cold start on Pixel 4a < 3.5 s
- [ ] Capture funnel text < 4 s
- [ ] Capture funnel photo < 8 s
- [ ] Drag latency < 250 ms
- [ ] APK size < 25 MB base
- [ ] Memory < 200 MB after 30 min use
- [ ] WS reconnect < 3 s

### 12.12 Sign-off

- QA tester name: __________
- Date: __________
- Build commit: __________
- Outcome: ☐ Ready to promote / ☐ Block (rollback or hotfix)
- Notes:

---

## 13. Bug Triage & Severity Definitions

| Severity | Definition | SLA | Hotfix path |
|---|---|---|---|
| **P0 — Crash / data loss / auth lock-out** | App cannot start, data corruption, all users locked out | Block release; immediate fix | JS-only → EAS Update OTA (hours); native → EAS Build + Play Internal patch within 24 h |
| **P1 — Functional regression** | Critical journey (J1-J6 from S2 §5) broken or degraded | Block release; fix in next dot release within 7 days | EAS Update OTA if JS; native dot release if Kotlin |
| **P2 — Polish / UX paper cut** | Cosmetic, non-blocking; degraded UX but workaround exists | Backlog; next minor release | Minor release cadence |
| **P3 — Nice-to-have / edge case** | Affects <1% of sessions; not on critical path | Backlog; no SLA | Opportunistic |

**Triage owner:** QA lead. **Escalation:** P0/P1 routed to engineering
within 1 business hour; P2/P3 weekly grooming.

**Bug template fields:** title, severity, repro steps (numbered, with adb
commands if relevant), expected vs actual, screenshot/screen-recording,
device (from §1 matrix), build commit, Sentry link, F-NNN scope, journey
affected (J1..J6 or "non-journey"), workaround.

---

## 14. Test Data & Fixtures

### 14.1 Seeded backend test user

| Property | Value |
|---|---|
| Email | `qa-user@kanban.test` |
| Password | `qa-password-do-not-use-in-prod` |
| Short name | `QA` |
| Reset script | `scripts/qa-seed.sh` — calls server-side `/api/_test/seed` endpoint (Stage 5 backend prereq) which: deletes all cards/knowledge for this user, re-seeds 20 cards across 4 lanes (5 each), 5 knowledge items, 1 archived card, 1 needs_review=TRUE card, 1 card with linked KB, 1 card with 3 unread messages, 1 card with pending insight |
| Test-auth header | `X-Test-Auth: <secret from env>` — backend rejects without it; available only to non-prod envs |

### 14.2 FCM test sender & topic

| Env | Firebase project | Test topic | Notes |
|---|---|---|---|
| dev | `smartkanban-dev` | `/topics/qa-test` | Synthetic broadcast every 4 h |
| preview | `smartkanban-preview` | `/topics/qa-test-preview` | Same |
| production | `smartkanban-prod` | `/topics/qa-synthetic` | Separate from real user pool |

Decision flagged in §15 — Stage 7 must confirm 3-project split.

### 14.3 Fixture API responses

Stored at `__tests__/fixtures/<resource>-<endpoint>.json`, captured once via
curl from a seeded dev backend and version-controlled. One fixture per
distinct envelope shape:

```
__tests__/fixtures/
├── cards-list.json                 (bare array, 3 cards spanning lanes + needs_review + telegram source)
├── cards-archived.json             (bare array)
├── card-detail.json                (bare object)
├── card-events.json                (bare array, mix of system/message/ai/share)
├── card-knowledge.json             (wrapper {items})
├── card-links.json                 (wrapper)
├── card-chain.json                 (wrapper)
├── knowledge-list.json             (wrapper {items, next_cursor})
├── knowledge-detail.json           (bare object)
├── insights-list.json              (wrapper {insights}: pending + ok + ok-degraded + failed)
├── notifications-list.json         (bare array, 100 entries)
├── templates-list.json             (bare array)
├── users-list.json                 (bare array with short_name)
├── messages-unread.json            (bare object Record)
├── review.json                     (V2 wrapper)
├── tokens-list.json                (V2)
├── mirror-tokens-list.json         (V2)
├── card-attachments.json           (image+audio+file)
└── auth-native-token.json          (NEW endpoint response)
```

### 14.4 Test attachment fixtures

| Path | Use |
|---|---|
| `__tests__/fixtures/binary/test-image-small.jpg` | 50 KB, under cap |
| `__tests__/fixtures/binary/test-image-large.jpg` | 6 MB, over cap (tests 413) |
| `__tests__/fixtures/binary/test-image-malicious.html.jpg` | Bait file with HTML body but image MIME (tests 415 reject) |
| `__tests__/fixtures/binary/test-audio.m4a` | 30s voice clip, under 10 MB |
| `__tests__/fixtures/binary/test-audio-large.m4a` | 12 MB, over `AUDIO_MAX_BYTES` cap |

---

## 15. Open Questions for Stage 7 Reviewer

### 15.1 Detox + Expo Router compatibility — Phase 0 spike required

S4 §15 R3 and S5 §14.4 both flag this. **Phase 0 deliverable: 1 Detox login
test passes on the scaffold.** If it fails, swap to Maestro (YAML, RN
friendly). Stage 7 must decide before locking the E2E pack rosters in §5.3.
Test specs are framework-agnostic; only selector syntax changes.

### 15.2 Pixel 4a hardware sourcing — physical vs Firebase Test Lab

§1.3 lists Pixel 4a as T1-Floor on **physical** device (lab). Risk: Pixel 4a
is end-of-life (last security patch Aug 2023). Options:
- (A) Physical Pixel 4a — most realistic, but harder to procure
- (B) Samsung Galaxy A14 (API 33, 4 GB RAM) as substitute
- (C) Firebase Test Lab Pixel 4a physical pool — limited test seconds budget

Stage 7 picks. Default recommendation: A with B as fallback procurement plan.

### 15.3 FCM test sender ID separation (dev / preview / prod)

§14.2 + S5 §14.2 flag: do we have 3 separate Firebase projects with 3
`google-services.json` files? **Risk:** dev push test could deliver to a real
prod user if shared. **Recommendation:** yes — 3 projects, 3 EAS Secrets,
`googleServicesFile` differs per EAS profile.

### 15.4 Visual parity check automation — Percy / Chromatic / manual

§9 currently specifies **manual** diff. Options:
- Percy / Chromatic CI integration: automated screenshot diff per PR
- Manual via QA tester with structured checklist
- Hybrid: automated for known-stable screens, manual for in-flux ones

Cost vs cadence trade-off. Stage 7 picks. MVP recommendation: manual; V1
adds Percy on the 5 stable screens (LoginScreen, BoardScreen, CardDetailScreen,
KnowledgeListScreen, NotificationListScreen).

### 15.5 Test-only seed endpoint (`/api/_test/seed`)

§14.1 requires a backend-side test-data seed endpoint. **Risk:** if shipped
to production by accident, it's a data-loss vector. **Mitigation:** gate
behind `process.env.NODE_ENV !== 'production'` AND `X-Test-Auth` header
check; add CI smoke test that confirms 404 on prod.

Stage 7 flags this as a Stage 5 backend deliverable (not in S5 §13's 7 BLOCKERS
list — recommend adding as BLOCKER #8 or as a Stage 6 prerequisite).

### 15.6 Soak test target device

§5.3.3 names Pixel 4a physical for soak. Same procurement question as §15.2.
If Pixel 4a unavailable, soak runs on T1-Mid (Galaxy A54 FTL physical pool)
with reduced confidence in memory budget (more RAM headroom).

### 15.7 Activity log paging (carryover from S2 §8.7, S5 §14.7)

`GET /api/cards/:id/events` returns full list. Stage 6 should test a card
with 200+ events for perf regression. If slow on Pixel 4a, file backlog
item for server-side `?limit=&before_id=` paging. **Stage 7 confirms backlog
ticket created.**

### 15.8 Backup test variance across OEMs

§10.3 backup exclusion test runs on Pixel + Samsung. Xiaomi and other OEMs
may use proprietary backup tools that ignore `<full-backup-content>`. Stage
7 decides: test all 5 devices or just Pixel/Samsung (stock Android)?
Recommendation: Pixel + Samsung only (covers >80% of Android share); document
as known limitation for niche OEMs.

---

STAGE_COMPLETE: qa devices=5 e2e_tests=19 unit_targets=42 journeys_covered=6 phases_signed=12
