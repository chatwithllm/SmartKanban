# ANDROID PLAN — STAGE 5: ENGINEER (Build-Ready Implementation Specs)

Upstream binding inputs:

- `ANDROID_PLAN_S1_ANALYST.md` — 51 routes, 18 tables, 19 WS events, env vars,
  visibility predicate. Cited as **S1 §X.Y** with file:line where the route
  lives in the backend (RULE 1 pre-flight artifact).
- `ANDROID_PLAN_S2_PM.md` — MVP=188 rows / V1=263 / V2=339 / 6 critical
  journeys. Cited as **S2 §X.Y**.
- `ANDROID_PLAN_S3_DESIGNER.md` — Material 3 tokens, screen layouts, F-NNN ↔
  API/WS map, component state tables. Cited as **S3 §X.Y**.
- `ANDROID_PLAN_S4_ARCHITECT.md` — React Native 0.76.5 + Expo SDK 52,
  47 deps pinned, navigation graph, store + query catalog. Cited as
  **S4 §X.Y**.
- `agent-rules.md` — RULES 1, 2, 3, 9, 13, 16 are gates on every Stage 5
  artifact below.

**Output scope:** every component, every screen, every endpoint, every store,
every hook, every push handler, every share handler, every storage layer,
every build-phase gate. Stage 6 (QA) and Stage 7 (Reviewer) inherit this as
the build manifest.

**Output conventions:**

- File paths are repo-relative under `smartkanban-android/` (S4 §3).
- Every API row cites `server/src/...:line` from S1 §2.
- Every UI row cites its F-NNN (registry).
- TS code blocks are signatures, not full implementations — the grain is
  contracts, types, hooks used, and tests.

---

## 1. Build Phase Order (12 vertical-slice phases)

Each phase is a working slice — installable on a real Pixel device, passing
its own CI gate, demoable. Earlier phases unblock later phases. Server
prereqs are explicit BLOCKERS — the Android phase cannot ship until the
backend phase ships first.

Estimate scale: 1 d = focused dev day; phases run sequential (one engineer)
or partly parallel where noted.

### Phase 0 — Project scaffold (2 d)

**Goal:** `npx expo start` launches a "Hello SmartKanban" screen on a Pixel
6a real device, jest/lint/typecheck/CI green on an empty repo.

**F-NNN shipped:** none (infra).

**Routes consumed:** none.

**Journeys enabled:** none.

**Backend prereqs (BLOCKERS):** none.

**Deliverables (done criteria):**

- [ ] `package.json` — every dep from S4 §2.1 pinned exact (no `^`/`~`);
      `verify:pinned` exits 0.
- [ ] `tsconfig.json` strict mode (`strict:true`, `noUncheckedIndexedAccess:true`).
- [ ] `app.json` matches S4 §10.2.
- [ ] `eas.json` matches S4 §12.1 (3 profiles).
- [ ] `.eslintrc.js` carries the AsyncStorage import ban from S4 §7.7.
- [ ] `jest.config.ts` + `jest-expo` preset; one trivial test passes.
- [ ] GitHub Actions `pr.yml` runs lint + typecheck + jest + `verify:pinned`
      on PR.
- [ ] EAS Build `development` profile produces an installable APK that opens
      a blank screen on a Pixel 6a real device (Android 13).
- [ ] `.github/CODEOWNERS` + `husky` pre-commit running lint-staged.
- [ ] `README.md` documents bootstrap steps.

**Done test:** clone repo on a fresh machine, follow README, install APK on
Pixel 6a, app launches without crash within 3 s.

### Phase 1 — Design tokens + theme (2 d)

**Goal:** `src/design/*` is fully populated; a `<DesignSandboxScreen>` (dev
only) renders the entire type ramp, color tokens, lane accents, motion
demos in both light + dark + system-follow modes.

**F-NNN shipped:** none yet (theme infra).

**Routes consumed:** none.

**Journeys enabled:** none directly; unblocks everything visual.

**Backend prereqs:** none.

**Deliverables (done criteria):**

- [ ] `src/design/colors.ts` — exports `lightTokens`, `darkTokens`, `laneAccents`
      matching S3 §1.3 + §1.4 verbatim.
- [ ] `src/design/typography.ts` — Spectral / Inter / JetBrains Mono scales
      per S3 §1.5; uses `@expo-google-fonts/*` packages from S4 §2.1.
- [ ] `src/design/spacing.ts` — 4/8/12/16/24/32 grid.
- [ ] `src/design/elevation.ts` — Levels 0–5 mapped to RN `elevation` +
      `shadow*` props (RN approximation of S3 §1.6).
- [ ] `src/design/motion.ts` — `springGentle`, `springSnappy`, `tweenFast`
      presets; `useReducedMotion()` hook reads system setting and gates
      animations per S3 §1.7.
- [ ] `src/design/theme.ts` — `extendPaperTheme(mode)` returns an MD3 theme
      consumable by `<PaperProvider>` in `app/_layout.tsx`.
- [ ] Spectral 600 + Inter Regular bundled in `assets/fonts/` as offline
      fallback (S4 §15 R12).
- [ ] Snapshot tests: light vs dark token sets (`__tests__/design/theme.test.ts`).

**Done test:** dev-only `<DesignSandboxScreen>` route renders without empty
text fallbacks; manually toggle light/dark via Settings sandbox toggle and
confirm seed colors match S3 §1.3.

### Phase 2 — Auth + bearer-token bootstrap (3 d)

**Goal:** sign-in/sign-up works against the production backend via the new
`POST /api/auth/native/token` bearer flow; token persists across cold start;
sign-out clears it and routes back to login.

**F-NNN shipped:** F-001..F-011 (LoginScreen MVP).

**Routes consumed:**

- `POST /api/auth/native/token` (NEW — S4 §6.2)
- `POST /api/auth/register` (`server/src/routes/auth.ts:17-64`, S1 §2.1)
- `POST /api/auth/login` (`server/src/routes/auth.ts:66-86`)
- `POST /api/auth/logout` (`auth.ts:88-93`)
- `GET /api/auth/me` (`auth.ts:95-99`)

**Journeys enabled:** **Journey 1 — first-time install + auth** (S2 §5).

**Backend prereqs (BLOCKERS):**

1. `POST /api/auth/native/token` endpoint added to `server/src/routes/auth.ts`
   (per S2 §8.1 / S4 §6.2). Body `{ email, password, device_label? }` →
   `{ token, scope:'native', user: User }`. Inserts into `mirror_tokens`.
2. `mirror_tokens.scope` CHECK constraint extended to allow `'native'` (per
   S4 §15.1).
3. `requireUserOrApiToken` / `requireUser` preHandlers extended to accept
   `scope='native'` tokens for ALL routes (currently only write-cards
   accept bearer).

**Deliverables (done criteria):**

- [ ] `src/state/auth-store.ts` — Zustand store per S4 §5.1 (`token`, `user`,
      `isHydrated`, `signIn`, `signOut`, `hydrate`).
- [ ] `src/storage/secure.ts` — `expo-secure-store` wrapper, keys: `authToken`,
      `deviceId`. ESLint guard from S4 §7.7 blocks AsyncStorage.
- [ ] `src/api/endpoints/auth.ts` — `register`, `login`, `nativeToken`,
      `logout`, `me` functions, each zod-validated.
- [ ] `src/api/schemas/user.ts` — `User` schema.
- [ ] `app/(auth)/login.tsx` — LoginScreen per S3 §3.1.
- [ ] `app/_layout.tsx` — `AuthGate` redirects unauthed users to `(auth)/login`
      and replays `pendingDeepLink` after success.
- [ ] `__tests__/api/auth.test.ts` — msw mocks every status path (200/201/400/
      401/403/409/5xx).
- [ ] Detox `e2e/login.test.ts` — register + login + sign-out + relaunch
      (verifies token survives kill).

**Done test:** kill app from recents, relaunch, lands directly on Board
without re-auth; sign out → next launch lands on LoginScreen.

### Phase 3 — API client + zod schemas (3 d)

**Goal:** all 51 backend routes typed end-to-end. Every list/object envelope
verified against S1 §2 (bare-array vs wrapper). Tests parse a fixture for
every endpoint; tests **fail closed** if shape drifts.

**F-NNN shipped:** none yet (infrastructure).

**Routes consumed:** all 51 endpoints from S1 §2 (definitions only; many
get exercised in later phases).

**Journeys enabled:** none directly; unblocks Phases 4+.

**Backend prereqs:** Phase 2 prereqs only (no new endpoints required at
this phase; voice/audio + FCM are flagged at Phase 6/10).

**Deliverables (done criteria):**

- [ ] `src/api/client.ts` per S4 §6.1 — ky instance with bearer hook,
      retry on idempotent 5xx only, error mapping.
- [ ] `src/api/errors.ts` — `ApiError` class + `mapStatusError` per S4 §6.4.
- [ ] One file per resource under `src/api/endpoints/`: `auth`, `cards`,
      `knowledge`, `insights`, `templates`, `notifications`, `push`,
      `review`, `tokens`, `attachments`. Each function signature: typed
      input → zod-validated output.
- [ ] One file per resource under `src/api/schemas/`: `card`, `knowledge`,
      `insight`, `notification`, `template`, `user`, `envelopes`. Envelopes
      verbatim per S4 §6.3.
- [ ] Fixtures in `__tests__/fixtures/<resource>-<endpoint>.json` captured
      from a live dev backend (recorded once, version-controlled).
- [ ] `__tests__/api/schema-roundtrip.test.ts` — parses every fixture
      through its zod schema and asserts no errors (RULE 2 verbatim mirror
      enforced).
- [ ] `src/api/multipart.ts` — `postMultipart` helper per S4 §6.5.

**Done test:** add a deliberate `.extra_field` to a fixture; the test must
PASS (zod default is strip-unknown) — but add a missing-required field
mutation and the test must FAIL with a `ZodError`. Both behaviours wired.

### Phase 4 — Board MVP read-only (3 d)

**Goal:** BoardScreen renders all 4 lanes with cards from the live API;
swipe between lanes; pull-to-refresh; empty / loading / error states all
visible.

**F-NNN shipped:** F-050 (single-lane phone layout via HorizontalPager),
F-056 (search), F-057 (FAB — opens placeholder snackbar), F-070..F-073
(lane chrome), F-077 (empty lane), F-090..F-110 (KanbanCard at rest —
no drag yet, no edit), F-665 (search), F-666 (LazyColumn/FlashList),
F-669 (lateral swipe cycles lanes), F-670 (lane picker bottom sheet),
F-671 (empty-lane italic copy), F-678 (WS live updates — partial; see
Phase 5 for socket).

**Routes consumed:**

- `GET /api/cards?scope=personal` (`server/src/routes/cards.ts:33-41`)
- `GET /api/messages/unread` (`server/src/routes/chat.ts`) — for unread
  badge display only (no actions yet)
- `GET /api/users` (`auth.ts:101-111`) — for assignee/share chip labels

**Journeys enabled:** partial **Journey 4 — move card across lanes**
(read-only view; the move comes in Phase 7).

**Backend prereqs:** none new; uses Phase 2's bearer endpoint.

**Deliverables (done criteria):**

- [ ] `app/(tabs)/_layout.tsx` — Material `NavigationBar` per S3 §2.2.
- [ ] `app/(tabs)/board/index.tsx` — BoardScreen per S3 §3.2.
- [ ] `src/components/KanbanCard.tsx` — at-rest render only (no drag).
- [ ] `src/components/LaneHeader.tsx`, `LanePager.tsx`, `StatusPill.tsx`,
      `DueBadge.tsx`, `AssigneeAvatarStack.tsx`.
- [ ] `src/hooks/useCards.ts`, `useUnreadCounts.ts`, `useUsers.ts`.
- [ ] `src/state/ui-store.ts` (initial — `activeLane`, `scope`, `search`).
- [ ] `__tests__/components/KanbanCard.test.tsx` — snapshot per visual state
      (Rest, Pressed, Has-unread, Pending-AI, Reduced-motion).
- [ ] `__tests__/screens/BoardScreen.test.tsx` — RTL renders 3 mock cards;
      asserts lane title + count badge; asserts empty state copy per lane.
- [ ] Detox `e2e/board.test.ts` — sign in, board loads, swipe to next lane,
      pull-to-refresh.

**Done test:** real device shows the same cards as the web app, swipes
smoothly between lanes, search filters locally.

### Phase 5 — WebSocket integration (2 d)

**Goal:** `/ws` is live; the 19 events from S1 §3.2 route correctly into
React Query cache; Board reconciles in <2 s on remote card.created.

**F-NNN shipped:** F-678 (live updates fully wired), F-991 (auto-reconnect
backoff), F-980..F-985 (WS event handling).

**Routes consumed:** `GET /ws` (`server/src/ws.ts:111-130`).

**Journeys enabled:** completes the "instant reconciliation" leg of every
journey (push-style live updates).

**Backend prereqs (BLOCKERS):**

1. WS upgrade handler MUST read `Sec-WebSocket-Protocol: bearer.<token>`
   (S4 §15.1 R8). Without this, MVP must fall back to cookie auth via
   `@react-native-cookies/cookies` — possible but adds R7-R8 fragility.

**Deliverables (done criteria):**

- [ ] `src/ws/socket.ts` per S4 §6.6 — state machine
      `idle → connecting → open → closing → closed → reconnecting`,
      exponential backoff 500 ms → 10 s cap, foreground-only lifecycle
      (S4 §9).
- [ ] `src/ws/events.ts` — typed union of 19 events (S1 §3.2). Each event
      handler is a pure function `(event, queryClient, uiStore) => void`
      per S4 §5.5.
- [ ] `src/hooks/useWs.ts` — mounts socket lifecycle on auth+foreground,
      tears down on signOut+background.
- [ ] BoardScreen connects on mount; `cloud_off` icon in TopAppBar when
      disconnected (S3 §3.2 offline state).
- [ ] `__tests__/ws/socket.test.ts` — mock WebSocket, asserts state
      transitions, backoff timing, ping/pong.
- [ ] `__tests__/ws/events.test.ts` — feeds each of 19 event types,
      asserts correct `queryClient` call.

**Done test:** in dev, open web Board on desktop, create a card; native
app's Board lane updates within 2 s without manual refresh.

### Phase 6 — Capture flow MVP (3 d)

**Goal:** text + photo capture works end-to-end; share-target intent
forwards URL/text to KnowledgeEditScreen; ShareTargetScreen ingests
ACTION_SEND.

**F-NNN shipped:** F-120..F-131 (CaptureSheet; voice replaced with "coming
soon" Snackbar until Phase 12 + backend audio endpoint), F-547 (share-target
ingest for KB), F-867 (?card=<id> deep link).

**Routes consumed:**

- `POST /api/cards` (`cards.ts:66-116`)
- `POST /api/cards/from-image` (`routes/attachments_upload.ts:142-211`)
- `POST /api/knowledge` (`routes/knowledge.ts`)
- `GET /api/templates` (`routes/templates.ts`)
- `POST /api/templates/:id/instantiate` (`templates.ts`)

**Journeys enabled:** **Journey 2 (share intent)**, **Journey 3 (photo
capture)**, partial Journey 1 (text capture happens after auth).

**Backend prereqs:** none new (voice deferred to Phase 12).

**Deliverables (done criteria):**

- [ ] `app/capture.tsx` modal route per S3 §3.3.
- [ ] `app/share-target.tsx` — intent landing per S3 §3.11.
- [ ] `src/components/CaptureSheet.tsx`, `CaptureFab.tsx`,
      `ScopePicker.tsx` (for lane picker).
- [ ] `src/share/intent-parser.ts` — MIME-routing per S4 §9-like table
      (text+URL → KnowledgeEdit; text plain → KnowledgeEdit; image → Capture
      with attached photo).
- [ ] `src/state/capture-draft-store.ts`.
- [ ] `src/hooks/useTemplates.ts` (read-only in MVP).
- [ ] AndroidManifest `<intent-filter>` for `ACTION_SEND` text/plain +
      image/* (S4 §4.4).
- [ ] `__tests__/share/intent-parser.test.ts` — for each MIME type,
      assert correct destination + pre-fill.
- [ ] Detox `e2e/capture.test.ts` — open FAB, type text, send, card
      appears in Today lane.
- [ ] Detox `e2e/share-target.test.ts` — `adb shell am start -a
      android.intent.action.SEND -t text/plain --es android.intent.extra.TEXT
      "https://example.com"` lands on KnowledgeEditScreen pre-filled.

**Done test:** Journey 2 from S2 §5 — share URL from Chrome to SmartKanban
in under 4 s; knowledge item visible on web Board's Knowledge tab.

### Phase 7 — Card detail + chat MVP (4 d)

**Goal:** open a card, edit every field (debounced autosave), see timeline,
post a message, AI replies arrive live.

**F-NNN shipped:** F-152, F-153, F-155, F-157, F-161..F-163, F-165..F-170,
F-171, F-172, F-173, F-174, F-175, F-176, F-177, F-178, F-179, F-180,
F-182, F-183, F-310..F-327 (timeline + chat), F-720..F-740 (mobile card
view parity). Knowledge picker (F-167..F-169) ships here; chain modal
(F-154) and QR (F-158..F-160) deferred to Phase 9.

**Routes consumed:**

- `GET /api/cards/:id` (`cards.ts:52-64`)
- `PATCH /api/cards/:id` (`cards.ts:118-220`) — title / desc / tags /
  status / due_date / assignees / shares
- `GET /api/cards/:id/events` (`chat.ts`)
- `POST /api/cards/:id/messages` (`chat.ts`)
- `PUT /api/cards/:id/events/read` (`chat.ts`)
- `GET /api/cards/:id/knowledge` (`cards.ts:272-284`)
- `POST /api/knowledge/:id/links`, `DELETE /api/knowledge/:id/links/:cardId`
  (`routes/knowledge.ts`)
- `POST /api/cards/:id/attachments` (`attachments_upload.ts:114-139`)
- `DELETE /api/cards/:id` (`cards.ts:286-302`)

**Journeys enabled:** **Journey 4 — move card across lanes (via status
chips)**, **Journey 5 — read & reply to @ai thread** (AI insight chips
applied in Phase 8 but the @ai mention + reply round-trips here).

**Backend prereqs:** none new.

**Deliverables (done criteria):**

- [ ] `app/(tabs)/board/[id].tsx` — CardDetailScreen per S3 §3.4.
- [ ] `src/components/CardTimeline.tsx`, `ChatInput.tsx`,
      `MessageBubble.tsx`, `SuggestionChip.tsx`, `AttachmentTile.tsx`,
      `ImageLightbox.tsx`.
- [ ] `src/components/ConfirmDialog.tsx`, `LongPressActionSheet.tsx`
      (used by Board long-press too — wire it here, ship Board hookup
      Phase 9 polish; archive action shipped here).
- [ ] `src/hooks/useCard.ts`, `useCardEvents.ts`, `useCardKnowledge.ts`
      with optimistic mutations per S4 §5.4.
- [ ] WS handler routes `card.updated`, `card.deleted`, `card.message`,
      `card.ai_response` into the detail screen.
- [ ] `__tests__/screens/CardDetailScreen.test.tsx` — autosave debounce,
      optimistic status change + rollback.
- [ ] Detox `e2e/card-detail.test.ts` — open card → edit title → wait
      500 ms → kill app → relaunch → title persisted server-side.

**Done test:** Journey 5 — server sends `@ai` reply, the AI message appears
in timeline + chips arrive (chip apply behavior comes in Phase 8).

### Phase 8 — AI Insights (2 d)

**Goal:** AiInsightsCard fully functional — brainstorm trigger, pending
pulse, related items, web findings, suggestion chips apply with optimistic
PATCH.

**F-NNN shipped:** F-200..F-215 (AiInsightsCard), F-318 (chat suggestion
chip apply), F-989 (insight.* WS events).

**Routes consumed:**

- `POST /api/cards/:id/insights/brainstorm` (`routes/insights.ts`)
- `GET /api/cards/:id/insights` (`insights.ts`)
- `GET /api/insights/:id` (`insights.ts`) — push deep-link target

**Journeys enabled:** **Journey 6 — brainstorm a card**.

**Backend prereqs:** none new.

**Deliverables (done criteria):**

- [ ] `src/components/AiInsightsCard.tsx` per S3 §3.5.
- [ ] `src/components/AiInsightChip.tsx` (suggestion chip variants —
      Queued / Pending / Ok / Applied / Failed / Degraded per S3 §4.4).
- [ ] `src/hooks/useInsights.ts`.
- [ ] WS handlers for `insight.queued/updated/failed` → setQueryData per
      S4 §5.5.
- [ ] Custom Tabs intent (`expo-web-browser`) for "Open ↗" on related URLs.
- [ ] `__tests__/components/AiInsightsCard.test.tsx` — all 4 states (first-run,
      pending, ok, failed); chip apply optimistic + rollback.
- [ ] Detox `e2e/insights.test.ts` — tap Brainstorm, mock WS sends
      `insight.updated ok`, asserts panel renders related items.

**Done test:** Journey 6 — tap "Brainstorm this card", panel pulses, results
arrive within `BRAINSTORM_TIMEOUT_MS` (30 s) or returns 503 cleanly.

### Phase 9 — Card extras (3 d)

**Goal:** chain view (V2 webview embed), QR code panel, related-cards
read-only list, knowledge picker fully functional, link picker.

**F-NNN shipped:** F-153 (copyable id chip — also in Phase 7),
F-154 (chain button — opens WebView), F-158..F-160 (QR — V2 promoted into
MVP polish here per stage 2 V2 list), F-163 (linked KB display polish),
F-230..F-237 (read-only related-cards list — V2 in S2 but spec'd here
so the chain WebView coexists), F-250..F-260 (link picker — V2 stub).

Note: per S2 §3.9/§3.11 these are V2. This phase keeps V2 work co-located so
Stage 6 can verify after Phase 8 ships; ship gate sits with V2 milestone.

**Routes consumed:**

- `GET /api/cards/:id/links` (`routes/card_links.ts`)
- `GET /api/cards/:id/chain?depth=` (`card_links.ts`)
- `POST /api/cards/:id/links`, `DELETE /api/cards/:id/links/:linkId`
  (`card_links.ts`)
- `GET /api/cards/:id/qr.svg` (`routes/qr.ts`)
- `POST /api/knowledge/from-card/:card_id` (`knowledge.ts`)

**Journeys enabled:** chain navigation, QR handoff back to desktop, KB
attachment from card detail.

**Backend prereqs:** none new for these endpoints. App-Links / WebView
auth needs the bearer flow from Phase 2.

**Deliverables (done criteria):**

- [ ] `app/(tabs)/board/chain/[id].tsx` — WebView embed of
      `${API_URL}/m/card/<id>/chain` with `Authorization: Bearer` header
      injection via `onShouldStartLoadWithRequest` / `injectedJavaScript`.
- [ ] QR panel inline on CardDetailScreen — renders the svg as an Image
      via `WebView` or `expo-image` SVG plugin.
- [ ] Knowledge picker sheet (already started in Phase 7) full search +
      debounce.
- [ ] Detox `e2e/chain.test.ts` — open chain → WebView authenticates →
      ReactFlow graph paints (smoke test: assertVisible svg root).

**Done test:** open a card with links, tap chain icon, WebView loads
within 3 s; tap QR icon, see SVG QR encoding `${APP_URL}/m/card/<id>`.

### Phase 10 — FCM push end-to-end (3 d)

**Goal:** FCM token registers on first foreground after sign-in; push
notifications arrive on `card.message` / `card.ai_response` / `insight.*`;
tap deep-links into CardDetailScreen; RemoteInput Reply posts a message
without opening the app.

**F-NNN shipped:** F-342 (push permission flow), F-863..F-865 (FCM
replacements for SW push events), F-868..F-870 (FCM subscribe/unsubscribe).

**Routes consumed:**

- `POST /api/push/fcm/subscribe` (NEW — S4 §8.1)
- `DELETE /api/push/fcm/subscribe` (NEW)
- `POST /api/cards/:id/messages` (`chat.ts`) — from RemoteInput Reply
  background handler
- `PUT /api/cards/:id/events/read` (`chat.ts`) — from "Mark read" action

**Journeys enabled:** **Journey 5** push leg.

**Backend prereqs (BLOCKERS):**

1. `fcm_subscriptions` table created (S4 §8.1 schema).
2. `POST/DELETE /api/push/fcm/subscribe` endpoints shipped.
3. `firebase-admin` added to server; `FCM_SERVICE_ACCOUNT_JSON` env var
   set in prod.
4. `pushToUser(uid, payload)` extended in `server/src/push.ts` to fan out
   to FCM tokens (mirroring the existing web-push 410 cleanup pattern).
5. Test push round-trip: server send → FCM → device receive < 30 s
   (S2 §6 metric).

**Deliverables (done criteria):**

- [ ] `src/push/fcm.ts` per S4 §8.2.
- [ ] `src/push/channels.ts` per S4 §8.3 — 3 channels (card-activity /
      insights / reminders).
- [ ] `src/push/handler.ts` per S4 §8.4.
- [ ] `AndroidManifest.xml` intent service entries (auto-emitted by
      `@notifee/react-native` config plugin).
- [ ] `src/hooks/useFcm.ts` — init after sign-in, teardown on sign-out.
- [ ] `__tests__/push/handler.test.ts` — mock FCM payload routes to
      correct channel; tap routes to correct screen.
- [ ] Detox `e2e/push.test.ts` — `adb shell am broadcast` with a synthetic
      FCM payload; assert notification displayed + tap opens CardDetail.

**Done test:** dev backend sends a message from another account; native
device receives notification within 30 s; tap → CardDetail with that
message at the bottom; RemoteInput "Reply" posts a message without
opening the foreground.

### Phase 11 — Knowledge tab (read + share-create) (2 d)

**Goal:** Knowledge tab fully functional for browsing and share-intent
creation; full CRUD deferred to V1 milestone.

**F-NNN shipped:** F-547..F-549, F-570..F-579 (read-only list rows),
F-600..F-606 (KnowledgeDetailScreen — read-only), F-630..F-639 (Edit form,
create-only via share intent in MVP).

**Routes consumed:**

- `GET /api/knowledge?scope=&q=&tag=&limit=&cursor=` (`routes/knowledge.ts`)
- `GET /api/knowledge/:id` (`knowledge.ts`)
- `POST /api/knowledge` (`knowledge.ts`)

**Journeys enabled:** **Journey 2** completion (share intent → knowledge).

**Backend prereqs:** none new.

**Deliverables (done criteria):**

- [ ] `app/(tabs)/knowledge/index.tsx` — KnowledgeListScreen per S3 §3.6.
- [ ] `app/(tabs)/knowledge/[id].tsx` — KnowledgeDetailScreen per S3 §3.7.
- [ ] `app/(tabs)/knowledge/edit.tsx` — KnowledgeEditScreen per S3 §3.8.
- [ ] `src/components/KnowledgeRow.tsx` per S3 §4 component table.
- [ ] `src/hooks/useKnowledge.ts`, `useKnowledgeItem.ts` with cursor
      pagination (S4 §5.3).
- [ ] WS handlers `knowledge.created/updated/deleted` reconcile.

**Done test:** share URL from Chrome twice from two different devices;
both items appear on each other within 5 s; tap to read body.

### Phase 12 — Polish + V1 closure (5 d)

**Goal:** all V1 features per S2 §4.2 wired; Stage 6 QA accepts the
build as V1-ready.

**F-NNN shipped:** F-440..F-461 (Settings full), F-510..F-519 (Archive
tab), F-410..F-420 (Weekly review — V2 actually; mark behind feature
flag), drag-to-move (F-051, F-053, F-110), swipe-to-archive (F-840..
F-842), voice capture (F-127 fully — requires backend BLOCKER), biometric
unlock (V1 — S4 §7.5), Toasts/Snackbar (F-820..F-824), Templates CRUD
(F-461, F-480..F-495).

**Routes consumed:** remaining unused endpoints — `/api/cards/archived`,
`/api/cards/:id/restore`, `/api/cards/:id/permanent`,
`/api/cards/archived/purge`, `/api/cards/from-audio` (NEW),
`/api/templates`, `/api/templates/:id/instantiate`,
`/api/auth/me PATCH`, `/api/review`.

**Journeys enabled:** Voice path of Journey 1; Archive cleanup paths.

**Backend prereqs (BLOCKERS):**

1. `POST /api/cards/from-audio` — Whisper transcribe + propose + create
   card with `needs_review=true`, attach audio as `kind='audio'`.
   Add `audio/ogg`, `audio/m4a`, `audio/mp4` to allowed MIMEs in
   `server/src/routes/attachments_upload.ts`. Add `AUDIO_MAX_BYTES=10_000_000`
   env var.

**Deliverables (done criteria):**

- [ ] All V1 components from S2 §4.2 implemented.
- [ ] Drag-to-move state machine per S4 §9.2 (Recommendation: `Modifier
      .draggable`-equivalent — RN's `react-native-gesture-handler` +
      `Reanimated` long-press + drag detector).
- [ ] Swipe-to-archive via `react-native-gesture-handler` `Swipeable`.
- [ ] Voice capture: `expo-av` recorder, upload via `postMultipart`.
- [ ] Biometric unlock — `expo-local-authentication` per S4 §7.5.
- [ ] All Snackbar variants per S3 §4.9.
- [ ] Templates CRUD — Settings → Templates screen.
- [ ] V1 audit: parity ≥ 80% per S2 §6 metric.

**Done test:** Stage 6 QA matrix passes; parity script reports ≥ 80% of
F-NNN classified as ✅ or 🔄.

### Phase summary

| Phase | Goal | Days | Backend BLOCKERS |
|---|---|---|---|
| 0 | Scaffold | 2 | — |
| 1 | Design tokens | 2 | — |
| 2 | Auth + bearer | 3 | 3 (token endpoint, scope CHECK, requireUser ext) |
| 3 | API client + zod | 3 | — |
| 4 | Board read-only | 3 | — |
| 5 | WebSocket | 2 | 1 (bearer subprotocol) |
| 6 | Capture MVP | 3 | — |
| 7 | Card detail + chat | 4 | — |
| 8 | AI Insights | 2 | — |
| 9 | Card extras (V2 polish) | 3 | — |
| 10 | FCM push | 3 | 5 (fcm table, 2 endpoints, firebase-admin, pushToUser fan-out, test push) |
| 11 | Knowledge tab | 2 | — |
| 12 | V1 closure | 5 | 1 (audio endpoint) |
| **Total** | | **37 d** | **7 blockers** (S4 §15.1) |

---

## 2. Component Implementation Specs

Every component listed in S3 §4 plus glue components from S3 §3. Format:
file path, props, internal state, hooks, render tree, a11y, motion,
memoization, tests.

### 2.1 `KanbanCard` — F-090..F-110, S3 §4.1

**File:** `src/components/KanbanCard.tsx`

**Props:**

```ts
interface KanbanCardProps {
  card: Card;                          // Zod-validated from src/api/schemas/card.ts
  unreadCount: number;                 // From useUnreadCounts
  laneAccent: LaneAccentToken;         // injected from LaneHeader / pager
  visualState?: 'rest' | 'pressed' | 'dragging' | 'disabled';
  onPress: () => void;                 // → navigate to /board/[id]
  onLongPress: () => void;             // → open LongPressActionSheet
  // Drag handlers (V1 — null in MVP):
  onDragStart?: () => void;
  onDragEnd?: (delta: { dx: number; dy: number }) => void;
}
```

**Internal state:** `useState<'idle'|'pressed'>('idle')` for press visual.

**Hooks:**
- `useTheme()` (paper)
- `useReducedMotion()` (custom — from `src/design/motion.ts`)
- `useHaptics()` (`src/hooks/useHaptics.ts`, wraps `expo-haptics`)
- `useDerivedValue` / `useAnimatedStyle` from `react-native-reanimated`

**Render tree (pseudo-JSX):**

```tsx
<Animated.View style={animatedScaleStyle}>
  <Pressable
    onPress={onPress}
    onLongPress={onLongPress}
    accessibilityRole="button"
    accessibilityLabel={`Open card ${card.title}`}
    accessibilityActions={[
      { name: 'move_today', label: 'Move to Today' },
      { name: 'move_in_progress', label: 'Move to In Progress' },
      { name: 'archive', label: 'Archive' },
    ]}
    onAccessibilityAction={handleA11yAction}
  >
    <Surface elevation={pressedElevation} style={cardSurfaceStyle}>
      <AccentBar color={laneAccent.bar} />   {/* F-090 */}
      <BloomGradient color={laneAccent.bloom} />   {/* F-091 */}
      <CardHeader>
        {card.source === 'telegram' && <SourceRow icon="forward_to_inbox" label="telegram" />}  {/* F-093 */}
        {card.ai_summarized && <Badge icon="auto_awesome" tone="tertiary" />}  {/* F-094 */}
        {card.needs_review && <Badge icon="priority_high" tone="error" />}  {/* F-095 */}
        {hasPendingInsight && <PulsingIcon icon="auto_awesome" />}  {/* F-096 — gated by reduced-motion */}
        {hasReadyInsight && <Icon name="auto_awesome" />}  {/* F-097 */}
      </CardHeader>
      <Text variant="titleMedium" style={spectralTitle}>{card.title}</Text>  {/* F-098 */}
      {card.description && <Text numberOfLines={2}>{card.description}</Text>}  {/* F-099 */}
      {insightSummary && <Text numberOfLines={1}>{insightSummary}</Text>}  {/* F-100 */}
      <FlatList horizontal data={card.tags} renderItem={(t) => <Chip>{t}</Chip>} />  {/* F-101 */}
      {card.due_date && <DueBadge value={card.due_date} />}  {/* F-102 */}
      {nonImageAttachments > 0 && <IconWithCount icon="attach_file" n={nonImageAttachments} />}  {/* F-103 */}
      {unreadCount > 0 && <Badge tone="primary" mono>{unreadCount}</Badge>}  {/* F-104 */}
      <RelativeTime value={card.updated_at} />  {/* F-105 */}
      {imageThumbs.length > 0 && <Row>{imageThumbs.slice(0,3).map(...)}{rest > 0 && <Pill>+{rest}</Pill>}</Row>}  {/* F-106 */}
      <AssigneeAvatarStack ids={card.assignees} variant="assignee" />  {/* F-107 */}
      <AssigneeAvatarStack ids={card.shares} variant="share" />  {/* F-108 */}
    </Surface>
  </Pressable>
</Animated.View>
```

**Visual states (every S3 §4.1 row mapped to a discriminator):**

| State | Trigger | Implementation |
|---|---|---|
| Rest | default | `elevation:0`, hairline outline |
| Pressed | `onPressIn`/`onPressOut` from Pressable | spring to `scale:0.98`, `elevation:2`, accent shadow |
| Dragging | `visualState='dragging'` (driven by parent gesture state) | spring to `scale:1.02`, `elevation:5`, ghost left behind via clone composable |
| Disabled | `visualState='disabled'` | `opacity:0.6`, `pointerEvents:'none'` |
| Pending-AI | `card.ai_summarized===false && insight.status==='pending'` | `<PulsingIcon>` fades 0.6↔1.0 over 1500 ms ONLY if `!reducedMotion` (S3 §1.7) |
| Has-unread | `unreadCount > 0` | violet Badge |
| Reduced-motion | system reduced-motion | no scale; outline color shift only |
| TalkBack-focused | a11y focus | system default (yellow ring) |

**A11y:**

- `accessibilityRole="button"`, `accessibilityLabel` template above.
- `accessibilityState={{ selected: false, disabled: visualState==='disabled' }}`.
- `accessibilityActions` array of 3 (move_today / move_in_progress / archive)
  with `onAccessibilityAction` switch routing to the same parent callbacks.
- Drag handle not surfaced (whole card is the drag target).

**Reanimated patterns:**

- Press animation: `useSharedValue<number>(1)` for scale, animated via
  `withSpring(target, springGentle)`. Spring config from `src/design/motion.ts`.
- Pulse animation (Pending-AI): `withRepeat(withTiming(0.6, { duration: 750 }), -1, true)`
  — but ONLY mounted when `!reducedMotion` (early-return static icon
  otherwise).
- Haptics: `useHaptics().lightTick()` on `onPressIn`; `mediumTick()` on
  `onLongPress`.

**Memoization:**

```ts
export const KanbanCard = React.memo(KanbanCardImpl, (a, b) => {
  return a.card.updated_at === b.card.updated_at &&
         a.unreadCount === b.unreadCount &&
         a.visualState === b.visualState;
});
```

**Tests (`__tests__/components/KanbanCard.test.tsx`):**

- Snapshot per visualState (5 snapshots).
- RTL: `fireEvent.press(getByLabelText(/Open card/))` → `onPress` called.
- RTL: `fireEvent(card, 'onLongPress')` → `onLongPress` called.
- RTL: a11y action "Archive" → `onAccessibilityAction` receives correct
  action name.
- Reduced-motion: render with `useReducedMotion → true`, assert PulsingIcon
  not present.

---

### 2.2 `LaneHeader` — F-070..F-073, S3 §4.2

**File:** `src/components/LaneHeader.tsx`

**Props:**

```ts
interface LaneHeaderProps {
  lane: 'backlog' | 'today' | 'in_progress' | 'done';
  count: number;
  isDropTarget?: boolean;       // when another card is being dragged over
  isDraggingFrom?: boolean;     // when a card was lifted from this lane
  onTapHeader: () => void;      // open lane picker sheet
}
```

**State:** none (pure).

**Hooks:** `useTheme()`, `useLaneAccent(lane)`.

**Render tree:**

```tsx
<Pressable onPress={onTapHeader} accessibilityRole="button"
           accessibilityLabel={`Lane ${lane}, ${count} cards. Open lane picker.`}>
  <Row>
    <Dot color={accent.bar} />
    <Text variant="titleLarge" style={[spectral, isDraggingFrom && { opacity: 0.7 }]}>
      {laneLabel(lane)}
    </Text>
    <CountPill>{count}</CountPill>
    <Icon name="expand_more" />
  </Row>
  {isDropTarget && <DropTargetBorder color={accent.bar} />}
</Pressable>
```

**Visual states:** see S3 §4.2.

**A11y:** label includes count + lane name.

**Motion:** `DropTargetBorder` border-color animated via `withTiming(250)`.

**Memoization:** `React.memo` with shallow compare.

**Tests:** snapshot per state (4 states); RTL onTapHeader callback fires.

---

### 2.3 `CaptureFab` — F-057, S3 §4.3

**File:** `src/components/CaptureFab.tsx`

**Props:**

```ts
interface CaptureFabProps {
  visualState?: 'rest' | 'pressed' | 'busy' | 'success' | 'menuOpen';
  onPress: () => void;
  onLongPress?: () => void;     // fans 4 mini-fabs upward
}
```

**State:** `useState<'idle'|'pressed'|'busy'|'success'>('idle')`.

**Hooks:** `useTheme()`, `useReducedMotion()`, `useHaptics()`,
`useSharedValue` (Reanimated).

**Render tree:**

```tsx
<Animated.View style={animatedScaleStyle}>
  <FAB
    icon={busy ? <ActivityIndicator/> : success ? "check" : "add"}
    onPress={() => { haptics.lightTick(); onPress(); }}
    onLongPress={onLongPress}
    accessibilityLabel="Capture new card"
  />
</Animated.View>
```

**Visual states:** per S3 §4.3 — Rest / Pressed / Disabled-busy / Success-flash
/ Long-press menu (rotates 45° to "×").

**A11y:** label "Capture new card"; busy adds "Saving"; success adds
"Saved".

**Tests:** snapshot per state; long-press fires onLongPress; busy state
disables pointer events.

---

### 2.4 `AiInsightChip` — S3 §4.4

**File:** `src/components/AiInsightChip.tsx`

**Props:**

```ts
interface AiInsightChipProps {
  state: 'queued' | 'pending' | 'ok' | 'applied' | 'failed' | 'degraded';
  label: string;
  onTap?: () => void;
}
```

**State:** local applied-set tracked by parent `CardTimeline`.

**Render:** `<Chip mode="outlined" selected={state==='applied'} onPress={onTap}>{label}</Chip>`
with background tint per state from S3 §4.4 table.

**Tests:** snapshot per of 6 states; tap fires only in `ok` and `failed`.

---

### 2.5 `DueBadge` — F-102, S3 §4.5

**File:** `src/components/DueBadge.tsx`

**Props:** `{ value: string /* ISO date YYYY-MM-DD per S1 §10.5 — STRING NOT DATE */ }`.

**State:** none.

**Hooks:** `useToneFromDueDate(value)` → returns `'overdue'|'today'|'soon'|'future'|'none'`.

**Render:** `<Chip icon="event" mode="outlined">{label(tone, value)}</Chip>`.

**Tests:** parameterized tests over fixture dates ensuring tone calculation.

---

### 2.6 `AssigneeAvatarStack` — F-107/F-108, S3 §4.6

**File:** `src/components/AssigneeAvatarStack.tsx`

**Props:** `{ ids: string[]; variant: 'assignee'|'share'; users: User[] }`.

**Hooks:** `useColorHash(id)` from `src/utils/color-hash.ts` → palette of
8 muted swatches per S3 §4.6.

**Render:** overlapping `<View>` rounds with initials; if count > 3 show
first 2 + `+N` pill.

**Tests:** snapshot 1/2/3/+N variants.

---

### 2.7 `StatusPill` — F-073, S3 §4.7

**File:** `src/components/StatusPill.tsx`

**Props:** `{ status: CardStatus; density: 'compact'|'standard' }`.

**Render:** `<Chip icon={<Dot color={accent}/>} compact={density==='compact'}>{laneLabel(status, density)}</Chip>`.

---

### 2.8 `AttachmentTile` — F-731, S3 §4.8

**File:** `src/components/AttachmentTile.tsx`

**Props:**

```ts
interface AttachmentTileProps {
  attachment: Attachment;
  state: 'loading'|'loaded'|'failed';
  onTap: () => void;          // lightbox for image
  onLongPress: () => void;    // replace / delete sheet
}
```

**Render:** `<expo-image AsyncImage source={authedUri} />` for image with
`source.headers.Authorization` injected via `useAuthHeader()` (Coil-style
in iOS, RN uses `expo-image` which accepts headers).

**A11y:** "Image attachment, tap to view" / "Audio attachment, x seconds".

**Tests:** snapshot per kind (image/audio/file) per state.

---

### 2.9 `Toast` (provider + container) — S3 §4.9

**File:** `src/components/Toast.tsx` (Snackbar-based)

Uses `react-native-paper`'s `<Snackbar>` and a thin `<ToastHost>` provider
that exposes `useToast()` hook with `{ success(msg), info(msg), error(msg, retry?) }`.

**Render:** single host mounted at the root `app/_layout.tsx`; queue-based.

---

### 2.10 `NotificationRow` — F-346, S3 §4.10

**File:** `src/components/NotificationRow.tsx`

**Props:** `{ notification: Notification; onTap: (cardId: string) => void }`.

**Render:** `<List.Item>` with leading avatar (hash-colored initials), title
`<actor_name>`, description (preview), trailing relative-time; left bar +
tint when `read===false`.

---

### 2.11 `EmptyStateBlock` — S3 §4.11

**File:** `src/components/EmptyStateBlock.tsx`

**Props:** `{ icon: string; heading: string; body: string; cta?: { label, onPress } }`.

**Render:** `<View>` with static SVG glyph (64 dp), Spectral heading 24,
Inter body 14, optional `<Button>`.

---

### 2.12 `LoadingSkeleton` — S3 §4.12

**File:** `src/components/LoadingSkeleton.tsx`

**Props:** `{ variant: 'cardTile'|'knowledgeRow'|'listRow'|'avatar'|'detailPage'; count?: number }`.

**Render:** RN `<Animated.View>` with one-cycle shimmer via Reanimated;
gated off when `useReducedMotion()`.

---

### Glue components

#### 2.13 `LanePager` (HorizontalPager wrapper) — F-669

**File:** `src/components/LanePager.tsx`

**Props:** `{ activeLane: CardStatus; onLaneChange: (s: CardStatus) => void;
renderLane: (s: CardStatus) => React.ReactElement }`.

**Implementation:** `react-native-pager-view` or `FlatList` horizontal with
snapping (per S4 selection — `FlashList horizontal` with `pagingEnabled`).
Page-settle haptic light tick.

#### 2.14 `CaptureSheet` — F-120..F-131

**File:** `src/components/CaptureSheet.tsx`

Wraps `@gorhom/bottom-sheet`'s `<BottomSheetModal>`. See screen spec §3.3.

#### 2.15 `ScopePicker` — F-023..F-025, F-661

**File:** `src/components/ScopePicker.tsx`

**Props:** `{ scope: Scope; counts: Record<Scope, number>; onChange: (s: Scope) => void }`.

**Render:** `<BottomSheetModal>` with 4 `<List.Item>` rows + count badges.

#### 2.16 `SearchBar` — F-027/F-665

**File:** `src/components/SearchBar.tsx`

**Render:** `<Searchbar>` (paper) with debounced `onChangeText` (300 ms),
controlled by parent.

#### 2.17 `KnowledgeRow` — F-570..F-579

**File:** `src/components/KnowledgeRow.tsx`

**Props:** `{ item: KnowledgeItem; onPress: (id) => void }`.

**Render:** `<List.Item>` with leading 🔗/📝 icon, title, host pill,
2-line snippet, trailing visibility + linked-cards count + fetch-status icon.

#### 2.18 `TagChip` — F-101

**File:** `src/components/TagChip.tsx`

**Props:** `{ label: string; onPress?: () => void }`.

#### 2.19 `ChatInput` — F-324..F-327

**File:** `src/components/ChatInput.tsx`

**Props:** `{ onSend: (content: string) => void; busy: boolean; error?: string }`.

**Render:** `<TextInput>` + `<IconButton icon="send">`. Detects `@ai` token
locally only for cursor styling (server fires the AI reply).

#### 2.20 `MessageBubble` — F-313..F-319

**File:** `src/components/MessageBubble.tsx`

**Props:** `{ event: CardEvent; appliedSuggestions: Set<number> }`.

**Render:** discriminated render — `system` (green dot + actor + action),
`message` (ceramic dot + body), `ai` (violet dot + body + suggestion chips
row).

#### 2.21 `SuggestionChip` — F-318/F-319

Alias for `AiInsightChip` with `onTap` PATCHing the card.

#### 2.22 `ImageLightbox` — supports F-731 tap

**File:** `src/components/ImageLightbox.tsx`

Uses `react-native-gesture-handler` pinch + pan; swipe-down dismisses.

#### 2.23 `ConfirmDialog`

**File:** `src/components/ConfirmDialog.tsx`

Wraps paper `<Dialog>` for archive / delete-forever / sign-out confirms.

#### 2.24 `LongPressActionSheet` — F-679

**File:** `src/components/LongPressActionSheet.tsx`

`<BottomSheetModal>` with 4 move-to rows + Archive (red destructive) + Cancel.

---

### Component count

**Core (S3 §4):** 12.
**Glue (S3 §3 implied):** 12.
**Total components: 24.**

---

## 3. Screen Implementation Specs

Per S3 §3 each MVP+V1 screen. Format: file path, params, data deps, layout,
section render, interactive wiring (RULE 9 verb check), state handling,
haptics, WS subscriptions, optimistic mutations, navigation, tests.

### 3.1 `LoginScreen`

**File:** `app/(auth)/login.tsx`

**Route params (Expo Router):**

```ts
const { pendingDeepLink } = useLocalSearchParams<{ pendingDeepLink?: string }>();
```

**Data deps:** none (pure form).

**Layout:** `<KeyboardAvoidingView>` → `<ScrollView contentContainerStyle={center}>`
→ form column.

**Sections:** logo, mode label, full-name (CREATE only), short-name (CREATE),
email, password (with eye toggle), inline error banner, submit, mode-toggle
link.

**RULE 9 verb check:** every "button" mounts `<Button>` (paper).

| F-NNN | Element | Component verb |
|---|---|---|
| F-004 | Full name | `<TextInput>` with `onChangeText` |
| F-005 | Short name | `<TextInput maxLength={16}>` |
| F-006 | Email | `<TextInput keyboardType="email-address">` |
| F-007 | Password | `<TextInput secureTextEntry>` + `<IconButton onPress=toggle>` |
| F-008 | Error banner | `<AnimatedView>` with conditional render |
| F-009 | Submit | `<Button onPress=submit disabled=busy>` |
| F-010 | Mode toggle | `<TextButton onPress=toggleMode>` |

**State:**
- local `useState` for form fields, busy, error
- `useAuthStore(s => s.signIn)`

**WS:** none.

**Optimistic mutations:** none (auth is critical path; wait for response).

**Nav:** after success → `router.replace(pendingDeepLink ?? '/')`.

**Tests:** RTL — error states per HTTP status; Detox `e2e/login.test.ts`.

---

### 3.2 `BoardScreen`

**File:** `app/(tabs)/board/index.tsx`

**Route params:** none.

**Data deps:**

- `useCards(scope, project?)` → React Query
- `useUnreadCounts()` → React Query (30s stale)
- `useNotifications()` for bell badge → React Query
- `useUsers()` for assignee chip labels → React Query (10 min stale)
- `useUiStore()` for `activeLane`, `scope`, `search`, `openSheet`

**Layout:**

```tsx
<Scaffold topBar={<BoardTopAppBar/>} fab={<CaptureFab/>} bottomBar={<NavigationBar/>}>
  <PullToRefreshContainer onRefresh={refetch}>
    <Column>
      <LaneHeader lane={activeLane} count={cardsForLane.length} onTapHeader={openLanePicker}/>
      <SearchBar value={search} onChangeText={setSearch}/>
      <LanePager activeLane={activeLane} onLaneChange={setActiveLane} renderLane={renderLane}/>
    </Column>
  </PullToRefreshContainer>
</Scaffold>
```

**Per-lane render (RULE 13 decompose):**

```tsx
function renderLane(lane: CardStatus) {
  const cards = useCardsForLane(lane, search);
  if (loading) return <LoadingSkeleton variant="cardTile" count={5}/>;
  if (cards.length === 0) return <EmptyStateBlock {...laneCopy(lane)}/>;
  return (
    <FlashList
      data={cards}
      keyExtractor={(c) => c.id}
      estimatedItemSize={96}
      renderItem={({item}) => (
        <KanbanCard
          card={item}
          unreadCount={unread[item.id] ?? 0}
          laneAccent={laneAccents[lane]}
          onPress={() => router.push(`/board/${item.id}`)}
          onLongPress={() => setLongPressTarget(item)}
        />
      )}
    />
  );
}
```

**RULE 9 verb check (per F-NNN):**

| F-NNN | Element | Mounted as |
|---|---|---|
| F-023 | Scope sheet trigger | `<IconButton onPress=openScopeSheet>` |
| F-027 | Search icon | `<IconButton onPress=focusSearch>` |
| F-030 | Bell | `<IconButton><Badge>...</Badge></IconButton>` |
| F-032 | Avatar | `<IconButton onPress=openProfileSheet>` |
| F-057 | FAB | `<FAB onPress=openCapture onLongPress=fanMiniFabs>` |
| F-056 / F-665 | Search input | `<SearchBar onChangeText=setSearch>` |
| F-663 | Lane title row | `<Pressable onPress=openLanePicker>` |
| F-666 | Card list | `<FlashList>` with `<KanbanCard>` items |
| F-669 | Lane swipe | `<LanePager>` snap-paging |
| F-670 | Lane picker sheet | `<BottomSheetModal>` |
| F-671 | Empty-lane | `<EmptyStateBlock>` |
| F-674 | Bottom nav | `<NavigationBar>` |

**Loading/empty/error/success:**

- Loading: per-lane skeleton (5 card placeholders)
- Empty: `EmptyStateBlock` with lane-specific copy from S3 §3.2
- Error: `Snackbar` "Couldn't load cards" + Retry action
- Success: cards rendered
- Offline (WS down): `cloud_off` icon in TopAppBar

**Per-element haptic + animation:**

- Card press: light tick + spring scale
- Lane swipe page-settle: light tick
- Pull-refresh: light tick on fire
- FAB long-press: medium tick + mini-fab fan-up stagger 30 ms

**Per-element WS subscription (via `useWs` global handler — see §7):**

- `card.created` → `queryClient.setQueryData(['cards', scope], (prev) => [card, ...prev])`
- `card.updated` → replace by id in `['cards', scope]` AND `['card', id]`
- `card.deleted` → filter out by id
- `card.message` / `card.ai_response` → increment `['messages', 'unread'][card.id]`

**Per-element optimistic mutation:** none from this screen (writes happen
from CaptureSheet or CardDetailScreen).

**Navigation in:** default tab on app open after auth.
**Navigation out:** back gesture → exit-confirm dialog (S3 §5.10).

**Tests:**

- `__tests__/screens/BoardScreen.test.tsx` — RTL renders cards from mock,
  lane swipe changes pager, empty state when zero cards.
- Detox `e2e/board.test.ts` per Phase 4.

---

### 3.3 `CardDetailScreen`

**File:** `app/(tabs)/board/[id].tsx`

**Route params:**

```ts
const { id } = useLocalSearchParams<{ id: string }>();
```

**Data deps:**

- `useCard(id)`
- `useCardEvents(id)`
- `useCardKnowledge(id)`
- `useInsights(id)`
- `useUsers()` (cached app-wide)

**Layout:** `<Scaffold topBar={<TopAppBar/>}>` → scrollable column with all
sections.

**Sections (top to bottom):** title input, status row, description, tags,
due, AI insights, attachments, assignees, shares (+ "Share now"), knowledge,
timeline, sticky chat input.

**RULE 9 verb check:** see S3 §3.4 element-by-element table — every row
mounts a real interactive component. Excerpt:

| F-NNN | Element | Mounted as |
|---|---|---|
| F-157 | Title | `<TextInput onChangeText=debouncedPatchTitle(500)>` |
| F-724 | Status chips | `<SegmentedButtons value=status onValueChange=patchStatus>` |
| F-161 | Description | `<TextInput multiline onChangeText=debouncedPatchDesc(800)>` |
| F-162 | Tags | `<TextInput onBlur=patchTags>` |
| F-171 | Due | `<Button onPress=openDatePicker>` + `<DatePickerModal>` |
| F-172 | Due clear | `<IconButton onPress=patchDueNull>` |
| F-731 | Attachment tile | `<AttachmentTile onTap=openLightbox onLongPress=openReplaceSheet>` |
| F-732 | + Add tile | `<Pressable onPress=openAttachmentSourceSheet>` |
| F-733/4/5 | Camera/Library/Files rows | `<List.Item onPress=launchCamera/launchPickVisualMedia/launchGetContent>` |
| F-176 | Assignee chips | `<Chip selected={inAssignees(u)} onPress=toggleAssignee>` |
| F-178 | Share now | `<Button onPress=patchShares>` |
| F-738 | Archive | `<Button mode="contained-tonal" tone="error" onPress=confirmArchive>` |

**Loading/empty/error:** see S3 §3.4 states table — Loading uses
`<LoadingSkeleton variant="detailPage"/>`.

**Per-element haptic:** save success → light tick; archive confirm → reject
pattern.

**WS subscriptions (filtered to current card id):**

- `card.updated` (id===this.id) → merge into form, EXCEPT fields the user is
  currently editing (track `lastEditedField`)
- `card.deleted` (id===this.id) → snackbar + `router.back()` after 1.5 s
- `card.message`, `card.ai_response` (card_id===this.id) → append to timeline,
  scroll-to-bottom if already at bottom, mark-read
- `insight.*` (card_id===this.id) → re-render AiInsightsCard

**Optimistic mutations:** all PATCH mutations via `patchCard` per S4 §5.4
(merge → on error restore snapshot).

**Navigation in:** from BoardScreen tap, from notification deep link, from
chain WebView link, from KnowledgeDetail linked card.
**Navigation out:** back arrow → `router.back()`.

**Tests:**

- RTL unit: debounced PATCH fires once after 500 ms of pause.
- RTL: optimistic title change rolls back on 5xx.
- Detox: open card from Board, edit title, kill app, relaunch — title
  persisted.

---

### 3.4 `CaptureSheet`

**File:** `app/capture.tsx` (modal route per S4 §4.1)

**Route params:**

```ts
const { mode, attachedImageUri } = useLocalSearchParams<{ mode?: 'text'|'photo'|'voice'|'template'; attachedImageUri?: string }>();
```

**Data deps:** `useTemplates()`, `useUiStore(s => s.scope)`.

**Layout:** `<BottomSheetModal snapPoints={['40%', '85%']}>` → form column.

**Sections:** drag handle, lane chip, draft input, mode chip row, send
button, helper caption.

**RULE 9 verb check:** see S3 §3.3 table. F-127 voice: tap-and-hold
`<Pressable onPressIn=startRecording onPressOut=stopRecording>` (gesture
handler).

**Loading/error:** see S3 §3.3 states table.

**WS:** none (sheet dismisses before `card.created` arrives; Board's WS
handler reconciles).

**Optimistic mutation:** `createCard` per S4 §5.4 — prepend stub immediately,
rollback on error.

**Tests:** RTL — type text, tap send, `createCard` mutation called with
correct body; Detox per Phase 6.

---

### 3.5 `ShareTargetScreen`

**File:** `app/share-target.tsx`

**Route params:** parsed from Android intent in `useShareIntent()` hook —
no Expo Router params.

**Data deps:** `useShareIntent()` returns `{ mime, text, uri }`.

**Layout:** transient — auto-forwards within 200 ms.

**Logic:**

```ts
useEffect(() => {
  const intent = useShareIntent();
  if (intent.mime === 'text/plain' && URL_RE.test(intent.text)) {
    router.replace({ pathname: '/knowledge/edit',
      params: { url: extractUrl(intent.text), title: intent.title, body: '' }});
  } else if (intent.mime?.startsWith('image/')) {
    router.replace({ pathname: '/capture', params: { mode: 'photo', attachedImageUri: intent.uri }});
  } else {
    router.replace({ pathname: '/knowledge/edit',
      params: { body: intent.text, title: firstLine(intent.text) }});
  }
}, [intent]);
```

**Tests:** unit on `intent-parser.test.ts` per Phase 6.

---

### 3.6 `AiInsightsCard` (embedded — see §2.X — also a standalone "screen")

Covered in component spec §2 above. Embedded inside `CardDetailScreen`
between Due and Attachments sections.

---

### 3.7 `KnowledgeListScreen`

**File:** `app/(tabs)/knowledge/index.tsx`

**Route params:** none.

**Data deps:** `useKnowledge(scope, q, tag, cursor)` with cursor pagination.

**Layout:** `<Scaffold>` → `<FlashList>` of `<KnowledgeRow>` with
`onEndReached` → fetch next cursor.

**Sections:** TopAppBar, list, FAB (V1).

**RULE 9 verbs:** Row tap → `router.push('/knowledge/[id]')`. FAB (V1) →
`router.push('/knowledge/edit')`.

**Loading/empty/error:** Loading = 5 knowledge skeletons; Empty = "Your
second brain starts here." block; Error = Snackbar + Retry.

**WS:** `knowledge.created/updated/deleted` → reconcile list.

**Optimistic:** none direct (creates happen from Edit screen).

**Tests:** RTL row render; Detox `e2e/knowledge.test.ts`.

---

### 3.8 `KnowledgeDetailScreen`

**File:** `app/(tabs)/knowledge/[id].tsx`

**Route params:** `{ id }`.

**Data deps:** `useKnowledgeItem(id)`.

**Layout:** TopAppBar → scrollable column.

**Sections:** title, URL+host, meta, fetch-error banner (if), body block
(SelectionContainer over Text mono), linked-cards list.

**RULE 9 verbs:** URL → Custom Tabs (`openBrowserAsync`); linked card →
`router.push('/board/[id]')`.

**Loading/empty/error/404:** per S3 §3.7 table.

**WS:** `knowledge.updated` (id===this.id) → merge; `knowledge.link.created/deleted`
→ refresh linked-cards.

**Tests:** RTL render; Detox: open KB item, tap linked card, lands on
CardDetail.

---

### 3.9 `KnowledgeEditScreen`

**File:** `app/(tabs)/knowledge/edit.tsx`

**Route params:** `{ id?, url?, title?, body? }` (id present = edit mode V1;
absent = create).

**Data deps:** create mode pure form; edit mode `useKnowledgeItem(id)`.

**Layout:** `<Scaffold topBar={<TopAppBar trailing={<SaveButton/>}>}>` →
form column.

**Sections:** URL, title, body, tags (V1), visibility radio, auto-fetch
checkbox, error caption.

**RULE 9 verbs:** Save button → `<Button onPress=onSave>`; visibility radio
→ `<RadioButton.Group>`; auto-fetch → `<Checkbox>`.

**Loading/error:** clean / dirty / saving / success (nav back) / error
inline.

**Optimistic:** `createKnowledge` mutation prepends to list, rolls back on
error.

**Tests:** RTL — Save calls POST with correct body; back-with-dirty triggers
confirm dialog.

---

### 3.10 `SettingsScreen`

**File:** `app/(tabs)/more/settings.tsx`

**Route params:** none.

**Data deps:** `useAuthStore(s => s.user)`, `useUiStore(s => s.theme)`.

**Sections (MVP):** theme segmented toggle, display-name input + save,
nested V1/V2 rows.

**RULE 9 verbs:** theme → `<SegmentedButtons>`; save → `<Button onPress=patchMe>`.

**Optimistic:** theme change applies immediately (rebuild MaterialTheme);
display-name PATCH with status caption.

**Tests:** RTL — theme change updates store; Save fires PATCH.

---

### 3.11 `ArchiveScreen` (V1)

**File:** `app/(tabs)/more/archive.tsx`

**Data deps:** `useArchive()` → `GET /api/cards/archived`.

**Sections:** TopAppBar (count + "Empty all"), list of `<List.Item>` with
Restore + Delete-forever buttons, empty state.

**RULE 9 verbs:** Restore / Delete-forever / Empty-all all mount real
`<Button>`s with `<ConfirmDialog>` for destructive actions.

**Optimistic:** `archiveCard` / `restoreCard` / `deleteCardPermanent` /
`purgeArchived` mutations per S4 §5.4.

**Tests:** RTL — list renders archived; Restore moves item back to Board
cache.

---

### 3.12 `WeeklyReviewScreen` (V2 — spec'd here, gated behind feature flag)

**File:** `app/(tabs)/more/weekly-review.tsx`

**Data deps:** `useReview()` → `GET /api/review` returning `{done, stale, stuck, summary}`.

**Sections:** AI summary, 3-up stat grid, sections "Shipped"/"Stale"/"Stuck"
with card rows, regenerate + got-it footer.

**Tests:** RTL render per S2 §3.16; deferred to V2 actual ship.

---

### 3.13 `NotificationListScreen`

**File:** `app/notifications.tsx` (modal route)

**Data deps:** `useNotifications()`.

**Sections:** TopAppBar (back + Mark-all), list of `<NotificationRow>`,
empty state.

**RULE 9 verbs:** row tap → `router.push('/board/[card_id]')`; Mark-all →
`<TextButton onPress=markAll>`.

**WS:** `card.message`/`card.ai_response` → refetch notifications list.

**Optimistic:** `markAllNotificationsRead` sets all `read:true` immediately.

**Tests:** RTL — unread row shows tinted bg; Mark-all clears badges.

---

### 3.14 `MoreScreen`

**File:** `app/(tabs)/more/index.tsx`

**Sections:** greeting, theme toggle, Weekly review row (V2), Archived row
(V1), Settings row, Sign-out (red).

**RULE 9 verbs:** every row `<List.Item onPress=route>`; Sign-out → confirm
dialog → `authStore.signOut()`.

**Tests:** RTL — Sign-out triggers confirm → POST logout + nav to login.

---

### 3.15 `ChainScreen` (V2 — WebView embed)

**File:** `app/(tabs)/board/chain/[id].tsx`

**Route params:** `{ id }`.

**Implementation:** `<WebView source={{ uri: `${API_URL}/m/card/${id}/chain`, headers: { Authorization: `Bearer ${token}` }}}` />`.

**Notes:** WebView cookies are NOT used; we inject `Authorization` header on
every request via `onShouldStartLoadWithRequest` for redirects.

**Tests:** Detox smoke — WebView mounts; SVG root visible.

---

### Screen count

**MVP+V1 screens: 14** (Login, Board, CardDetail, Capture, ShareTarget,
KnowledgeList, KnowledgeDetail, KnowledgeEdit, Settings, Archive,
NotificationList, More, plus the embedded AiInsightsCard spec'd as a
standalone, plus ChainScreen V2). AiInsightsCard isn't a route but is
spec'd as a Screen-grade artifact per the task.

---

## 4. API Service Layer

Format per S1 §2 — every route gets a function signature, request shape,
response shape, error map, hook wrap, optimistic pattern. **RULE 1
pre-flight cite** = server file:line where the route lives.

### 4.1 Auth (`src/api/endpoints/auth.ts`)

| Function | Method+URL | server:line | Request | Response (zod) | Auth scope | React Query hook | Optimistic |
|---|---|---|---|---|---|---|---|
| `register({name, short_name, email, password})` | POST `/api/auth/register` | `auth.ts:17-64` | `{name,short_name,email,password}` | `User` (`{id,name,short_name,email}`) | public | wrapped in `useRegisterMutation` | none |
| `login({email, password})` | POST `/api/auth/login` | `auth.ts:66-86` | `{email,password}` | `User` | public | `useLoginMutation` | none |
| `nativeToken({email,password,device_label?})` | POST `/api/auth/native/token` | NEW (S4 §6.2) | `{email,password,device_label?}` | `{token,scope:'native',user:User}` | public | `useNativeTokenMutation` | none |
| `logout()` | POST `/api/auth/logout` | `auth.ts:88-93` | — | `{ok:true}` | public | `useLogoutMutation` | clear cache |
| `me()` | GET `/api/auth/me` | `auth.ts:95-99` | — | `User` | bearer/session | `useMe` | none |
| `patchMe({short_name?, name?})` | PATCH `/api/auth/me` | `auth.ts:113-150` | partial | `User` | bearer/session | `usePatchMeMutation` | merge into authStore.user |
| `listUsers()` | GET `/api/users` | `auth.ts:101-111` | — | **bare array** `User[]` | bearer/session | `useUsers` | n/a |

**Error mapping (auth-specific):** 401 from login → inline "Wrong email or
password"; 409 from register → "Email already in use"; 403 from register →
"Signup disabled".

### 4.2 Cards (`src/api/endpoints/cards.ts`)

| Function | Method+URL | server:line | Request | Response | Optimistic |
|---|---|---|---|---|---|
| `listCards({scope, project?})` | GET `/api/cards?scope=&project=` | `cards.ts:33-41` | qs | **bare array** `Card[]` | n/a |
| `listArchived()` | GET `/api/cards/archived` | `cards.ts:44-50` | — | **bare array** `Card[]` | n/a |
| `getCard(id)` | GET `/api/cards/:id` | `cards.ts:52-64` | — | `Card` | n/a |
| `createCard(input)` | POST `/api/cards` | `cards.ts:66-116` | `{title, description?, status?, tags?, due_date?, assignees?, source?, project?}` | `Card` | prepend stub to `['cards', scope]` |
| `patchCard(id, patch)` | PATCH `/api/cards/:id` | `cards.ts:118-220` | partial Card | `Card` | merge + restore |
| `restoreCard(id)` | PATCH `/api/cards/:id/restore` | `cards.ts:222-241` | — | `Card` | remove from archived |
| `postCardActivity(id, {type, body, details?})` | POST `/api/cards/:id/activity` | `cards.ts:244-270` | activity | `{ok:true}` | API-TOKEN ONLY (external use) |
| `getCardKnowledge(id)` | GET `/api/cards/:id/knowledge` | `cards.ts:272-284` | — | `{items: KnowledgeItem[]}` | n/a |
| `archiveCard(id)` | DELETE `/api/cards/:id` | `cards.ts:286-302` | — | 204 | remove from `['cards', scope]` |
| `deleteCardPermanent(id)` | DELETE `/api/cards/:id/permanent` | `cards.ts:304-323` | — | 204 | remove from archived |
| `purgeArchived()` | POST `/api/cards/archived/purge` | `cards.ts:325-341` | — | `{deleted: number}` | clear archived |
| `uploadAttachment(id, file)` | POST `/api/cards/:id/attachments` | `attachments_upload.ts:114-139` | multipart | `Card` | append tile placeholder |
| `cardFromImage(file, status?)` | POST `/api/cards/from-image` | `attachments_upload.ts:142-211` | multipart | `Card` | prepend stub `needs_review:true` |
| `cardFromAudio(file, status?)` | POST `/api/cards/from-audio` | NEW (S2 §8.3) | multipart audio | `Card` | same |

### 4.3 Card links + chain (`src/api/endpoints/cards.ts` continued)

| Function | Method+URL | server:line | Request | Response |
|---|---|---|---|---|
| `createLink(fromId, {to_card_id, label, note?})` | POST `/api/cards/:id/links` | `card_links.ts` | body | `{link: CardLink}` |
| `deleteLink(cardId, linkId)` | DELETE `/api/cards/:id/links/:linkId` | `card_links.ts` | — | 204 |
| `getLinks(id)` | GET `/api/cards/:id/links` | `card_links.ts` | — | `{links: CardLink[], related_cards: Card[]}` |
| `getChain(id, depth?)` | GET `/api/cards/:id/chain?depth=` | `card_links.ts:152` | qs | `{nodes: Card[], edges: CardLink[], insights: Insight[]}` |

### 4.4 Chat / events

| Function | Method+URL | server:line | Request | Response |
|---|---|---|---|---|
| `getEvents(id)` | GET `/api/cards/:id/events` | `chat.ts` | — | **bare array** `CardEvent[]` |
| `postMessage(id, {content})` | POST `/api/cards/:id/messages` | `chat.ts` | `{content}` ≤2000 chars | `CardEvent` |
| `markEventsRead(id, {last_read_id})` | PUT `/api/cards/:id/events/read` | `chat.ts` | `{last_read_id:number}` | 204 |
| `unreadCounts()` | GET `/api/messages/unread` | `chat.ts` | — | **bare object** `Record<cardId, number>` |

### 4.5 QR

| Function | Method+URL | server:line | Request | Response |
|---|---|---|---|---|
| `cardQrSvg(id)` | GET `/api/cards/:id/qr.svg` | `routes/qr.ts:18` | — | `image/svg+xml` (raw text) |

### 4.6 Insights (`src/api/endpoints/insights.ts`)

| Function | Method+URL | server:line | Request | Response |
|---|---|---|---|---|
| `brainstorm(cardId)` | POST `/api/cards/:id/insights/brainstorm` | `routes/insights.ts:40-48` | — | 202 `{id, status:'pending'}` |
| `listInsights(cardId)` | GET `/api/cards/:id/insights` | `insights.ts` | — | `{insights: Insight[]}` (newest first, limit 10) |
| `getInsight(id)` | GET `/api/insights/:id` | `insights.ts` | — | `{insight: Insight}` |

### 4.7 Knowledge (`src/api/endpoints/knowledge.ts`)

| Function | Method+URL | server:line | Request | Response |
|---|---|---|---|---|
| `listKnowledge({scope, q?, tag?, limit?, cursor?})` | GET `/api/knowledge` | `routes/knowledge.ts` | qs | `{items, next_cursor:string\|null}` |
| `getKnowledge(id)` | GET `/api/knowledge/:id` | `knowledge.ts` | — | `KnowledgeItem` |
| `createKnowledge(input)` | POST `/api/knowledge` | `knowledge.ts` | `KnowledgeInput` | `KnowledgeItem` |
| `patchKnowledge(id, patch)` | PATCH `/api/knowledge/:id` | `knowledge.ts` | partial | `KnowledgeItem` |
| `archiveKnowledge(id)` | DELETE `/api/knowledge/:id` | `knowledge.ts` | — | 204 |
| `refetchKnowledge(id)` | POST `/api/knowledge/:id/refetch` | `knowledge.ts` | — | `{queued:true}` |
| `linkKnowledge(id, {card_id})` | POST `/api/knowledge/:id/links` | `knowledge.ts` | `{card_id}` | 204 |
| `unlinkKnowledge(id, card_id)` | DELETE `/api/knowledge/:id/links/:card_id` | `knowledge.ts` | — | 204 |
| `knowledgeFromCard(cardId)` | POST `/api/knowledge/from-card/:card_id` | `knowledge.ts` | — | `KnowledgeItem` |

### 4.8 Templates (`src/api/endpoints/templates.ts`)

| Function | Method+URL | server:line | Request | Response |
|---|---|---|---|---|
| `listTemplates()` | GET `/api/templates` | `routes/templates.ts` | — | **bare array** `Template[]` |
| `getTemplate(id)` | GET `/api/templates/:id` | `templates.ts` | — | `Template` |
| `createTemplate(input)` | POST `/api/templates` | `templates.ts:32` | `TemplateInput` | `Template` |
| `patchTemplate(id, patch)` | PATCH `/api/templates/:id` | `templates.ts` | partial | `Template` |
| `deleteTemplate(id)` | DELETE `/api/templates/:id` | `templates.ts` | — | 204 |
| `instantiateTemplate(id, {status_override?})` | POST `/api/templates/:id/instantiate` | `templates.ts:222-231` | optional | `Card` |

### 4.9 Mirror tokens (V2)

| Function | Method+URL | server:line | Request | Response |
|---|---|---|---|---|
| `createMirrorToken({label?})` | POST `/api/mirror/tokens` | `routes/mirror.ts:6-19` | `{label?}` | `{token,label,url}` |
| `listMirrorTokens()` | GET `/api/mirror/tokens` | `mirror.ts` | — | **bare array** |
| `deleteMirrorToken(token)` | DELETE `/api/mirror/tokens/:token` | `mirror.ts` | — | 204 |

### 4.10 API tokens (V2)

| Function | Method+URL | server:line | Request | Response |
|---|---|---|---|---|
| `createApiToken({label?})` | POST `/api/tokens` | `routes/api_tokens.ts:6-18` | `{label?}` | `{token,label,scope:'api'}` |
| `listApiTokens()` | GET `/api/tokens` | `api_tokens.ts` | — | **bare array** |
| `deleteApiToken(token)` | DELETE `/api/tokens/:token` | `api_tokens.ts` | — | 204 |

### 4.11 Telegram (V2)

| Function | Method+URL | server:line | Request | Response |
|---|---|---|---|---|
| `linkTelegram({telegram_user_id, telegram_username?})` | POST `/api/telegram/link` | `routes/telegram.ts` | body | `{ok:true}` |
| `listTelegramIdentities()` | GET `/api/telegram/identities` | `telegram.ts` | — | **bare array** |
| `unlinkTelegram(id)` | DELETE `/api/telegram/identities/:id` | `telegram.ts` | — | 204 |

(Telegram webhook POST and bot lifecycle are server-only.)

### 4.12 Notifications + Push

| Function | Method+URL | server:line | Request | Response |
|---|---|---|---|---|
| `listNotifications()` | GET `/api/notifications` | `routes/notifications.ts` | — | **bare array** `Notification[]` (newest 100) |
| `markRead({ids})` | PUT `/api/notifications/read` | `notifications.ts` | `{ids:number[]}` | 204 |
| `markAllRead()` | PUT `/api/notifications/read-all` | `notifications.ts` | — | 204 |
| `subscribeFcm({token, device_id, device_label?})` | POST `/api/push/fcm/subscribe` | NEW (S4 §8.1) | body | 204 |
| `unsubscribeFcm({token})` | DELETE `/api/push/fcm/subscribe` | NEW | body | 204 |
| `getVapidPublicKey()` | GET `/api/push/vapid-public-key` | `notifications.ts:65-69` | — | `{publicKey}` — **NOT USED by native** (FCM replaces) |

### 4.13 Weekly review

| Function | Method+URL | server:line | Request | Response |
|---|---|---|---|---|
| `getReview()` | GET `/api/review` | `routes/review.ts` | — | `{done:[], stale:[], stuck:[], summary:string\|null}` |

### 4.14 Attachments static

| Function | Method+URL | server:line | Request | Response |
|---|---|---|---|---|
| `attachmentUri(storagePath)` | GET `/attachments/<storage_path>` | `routes/attachments.ts` | — | binary; native loads via `expo-image` with `headers.Authorization` |

### 4.15 Health

| Function | Method+URL | server:line | Request | Response |
|---|---|---|---|---|
| `health()` | GET `/health` | `index.ts:90` | — | `{ok:true}` — used for offline-detection ping |

**Route total: 51** (matches S1 §2.14).

---

## 5. Zustand Stores

### 5.1 `auth-store` (S4 §5.1)

**File:** `src/state/auth-store.ts`

```ts
interface AuthStore {
  token: string | null;
  user: User | null;
  isHydrated: boolean;
  signIn: (creds: { email: string; password: string }) => Promise<void>;
  signOut: () => Promise<void>;
  setUser: (u: User) => void;
  hydrate: () => Promise<void>;
}
```

**Actions:**
- `hydrate()` — read `authToken` from `expo-secure-store`; read cached
  `user` from MMKV; call `me()` to refresh.
- `signIn({email,password})` — call `nativeToken`, write `authToken` to
  SecureStore, cache `user` to MMKV, init FCM.
- `signOut()` — call `logout()`, delete SecureStore `authToken`, teardown
  FCM, clear MMKV cache, `queryClient.clear()`.
- `setUser(u)` — for PATCH /api/auth/me responses.

**Persistence:**
- `token` → SecureStore (NEVER MMKV).
- `user` → MMKV (cold-start render before token validation).
- `isHydrated` → ephemeral.

**Selector pattern:**

```ts
import { useShallow } from 'zustand/shallow';
const { token, user } = useAuthStore(useShallow((s) => ({ token: s.token, user: s.user })));
```

**Tests:**
- `signIn` writes to SecureStore (mocked).
- `signOut` clears SecureStore + clears React Query cache.
- `hydrate` no-ops when no token.

### 5.2 `ui-store`

**File:** `src/state/ui-store.ts`

```ts
interface UiStore {
  activeLane: 'backlog' | 'today' | 'in_progress' | 'done';
  scope: 'personal' | 'inbox' | 'all' | 'shared';
  search: string;
  openSheet: 'capture' | 'lanePicker' | 'profile' | 'scope' | 'attachment' | null;
  theme: 'light' | 'dark' | 'system';
  wsConnected: boolean;
  setActiveLane: (s: CardStatus) => void;
  setScope: (s: Scope) => void;
  setSearch: (q: string) => void;
  setSheet: (k: SheetKey | null) => void;
  setTheme: (t: ThemeMode) => void;
  setWsConnected: (b: boolean) => void;
}
```

**Persistence:** `theme`, `activeLane`, `scope` → MMKV. `search`, `openSheet`,
`wsConnected` → ephemeral.

**Tests:** setTheme triggers MMKV write; sheet open/close ephemeral.

### 5.3 `capture-draft-store`

**File:** `src/state/capture-draft-store.ts`

```ts
interface CaptureDraftStore {
  pendingText: string;
  pendingPhotos: PhotoDraft[];
  pendingVoice: VoiceDraft | null;
  pendingLane: CardStatus;
  setText: (s: string) => void;
  addPhoto: (p: PhotoDraft) => void;
  clearPhotos: () => void;
  setVoice: (v: VoiceDraft | null) => void;
  setLane: (s: CardStatus) => void;
  flush: () => Promise<void>;          // submits queued drafts on reconnect
}
```

**Persistence:** all fields → MMKV (V1 offline queue; MVP keeps in-memory
but writes draft to MMKV on send-failure so user can retry after kill).

**Tests:** add + clear + flush roundtrip; persistence across restart.

---

## 6. React Query Hook Catalog

Per S4 §5.3 (15 query hooks). Each entry: file, query key, query fn, stale
time, enabled, WS invalidation, mutations (where applicable), test plan.

### 6.1 `useCards`

**File:** `src/hooks/useCards.ts`

```ts
function useCards(scope: Scope, project?: string) {
  return useQuery({
    queryKey: ['cards', scope, project ?? null],
    queryFn: () => listCards({ scope, project }),
    staleTime: 30_000,
    enabled: !!useAuthStore.getState().token,
  });
}
```

**WS invalidation:** `card.created`/`updated`/`deleted` → `setQueryData(['cards', scope])`.

**Mutations:** `createCard`, `patchCard`, `archiveCard` (see S4 §5.4 for
optimistic shapes).

**Tests:** RTL hook test — react-query test-utils; assert refetch on
`invalidateQueries`.

### 6.2 `useCard(id)`

**File:** `src/hooks/useCard.ts`

```ts
useQuery({
  queryKey: ['card', id],
  queryFn: () => getCard(id),
  staleTime: 30_000,
});
```

**WS:** `card.updated`/`card.deleted` (id match).

**Mutations:** `patchCard` (optimistic merge + rollback snapshot).

### 6.3 `useCardEvents(id)`

```ts
useQuery({
  queryKey: ['card', id, 'events'],
  queryFn: () => getEvents(id),
  staleTime: 0,
  refetchOnWindowFocus: true,
});
```

**WS:** `card.message`/`card.ai_response` (card_id match) → append.

**Mutations:** `postMessage` (optimistic append with temp id, rollback on
error preserving text in ChatInput state); `markEventsRead`.

### 6.4 `useUnreadCounts`

```ts
useQuery({
  queryKey: ['messages', 'unread'],
  queryFn: () => unreadCounts(),
  staleTime: 30_000,
});
```

**WS:** `card.message`/`card.ai_response` → increment for that card_id.

### 6.5 `useCardKnowledge(id)`

```ts
useQuery({
  queryKey: ['card', id, 'knowledge'],
  queryFn: () => getCardKnowledge(id),
  staleTime: 30_000,
});
```

**WS:** `knowledge.link.created/deleted` (card_id match).

### 6.6 `useInsights(cardId)`

```ts
useQuery({
  queryKey: ['card', cardId, 'insights'],
  queryFn: () => listInsights(cardId),
  staleTime: 30_000,
});
```

**WS:** `insight.queued/updated/failed` (card_id match).

**Mutations:** `enqueueInsight` (optimistic prepend pending row).

### 6.7 `useKnowledge`

```ts
useInfiniteQuery({
  queryKey: ['knowledge', scope, q ?? '', tag ?? ''],
  queryFn: ({ pageParam }) => listKnowledge({ scope, q, tag, cursor: pageParam }),
  getNextPageParam: (last) => last.next_cursor,
  staleTime: 60_000,
});
```

**WS:** `knowledge.created/updated/deleted`.

**Mutations:** `createKnowledge`, `patchKnowledge`, `archiveKnowledge`,
`refetchKnowledge`.

### 6.8 `useKnowledgeItem(id)`

```ts
useQuery({ queryKey: ['knowledge', id], queryFn: () => getKnowledge(id), staleTime: 60_000 });
```

### 6.9 `useTemplates`

```ts
useQuery({ queryKey: ['templates'], queryFn: listTemplates, staleTime: 5*60_000 });
```

**WS:** `template.created/updated/deleted`.

**Mutations:** `createTemplate`, `patchTemplate`, `deleteTemplate`,
`instantiateTemplate`.

### 6.10 `useNotifications`

```ts
useQuery({ queryKey: ['notifications'], queryFn: listNotifications, staleTime: 30_000 });
```

**WS:** `card.message`/`card.ai_response` → refetch (server creates
notification rows server-side then broadcasts).

**Mutations:** `markRead({ids})`, `markAllRead()` (optimistic).

### 6.11 `useUsers`

```ts
useQuery({ queryKey: ['users'], queryFn: listUsers, staleTime: 10*60_000 });
```

### 6.12 `useArchive` (V1)

```ts
useQuery({ queryKey: ['cards','archived'], queryFn: listArchived, staleTime: 60_000 });
```

**Mutations:** `restoreCard`, `deleteCardPermanent`, `purgeArchived`.

### 6.13 `useReview` (V2)

```ts
useQuery({ queryKey: ['review'], queryFn: getReview, staleTime: 5*60_000 });
```

### 6.14 `useTokens` / `useMirrorTokens` (V2)

```ts
useQuery({ queryKey: ['tokens'], queryFn: listApiTokens });
useQuery({ queryKey: ['mirror-tokens'], queryFn: listMirrorTokens });
```

**Hook count:** 15 queries; **mutation count:** 30 (per S4 §5.4).

---

## 7. WebSocket Module

### 7.1 `src/ws/socket.ts` — connection state machine

```ts
type WsState = 'idle' | 'connecting' | 'open' | 'closing' | 'closed' | 'reconnecting';

class WsClient {
  private state: WsState = 'idle';
  private socket?: WebSocket;
  private attempt = 0;
  private pingTimer?: number;
  private lastInbound = 0;

  connect(token: string): void;          // wss://APP_URL/ws with subprotocol bearer.<token>
  disconnect(code?: number, reason?: string): void;
  send(payload: object): void;
  private scheduleReconnect(): void;     // 500ms * 2^attempt, cap 10s
  private startPing(): void;             // 25s tick, client→server {type:'ping'}
  private onMessage(ev: MessageEvent): void;  // dispatches to events.ts
  private onError(ev: Event): void;
  private onClose(ev: CloseEvent): void; // schedule reconnect unless code===1000 (clean)
}
export const ws = new WsClient();
```

**Transitions:**

```
idle → connecting (on connect())
connecting → open (on onopen + hello received)
open → closing (on disconnect())
open → reconnecting (on onclose with code !== 1000)
reconnecting → connecting (on scheduleReconnect timer)
any → closed (on disconnect(1000))
```

**Backoff:** `min(500 * 2^attempt, 10_000)` ms; reset `attempt=0` on
successful `hello`.

**Ping/pong:** server doesn't ping (S1 §3.1). Client sends `{type:'ping'}`
every 25s; if no inbound message in 90s → close + reconnect.

### 7.2 `src/ws/events.ts`

```ts
import { z } from 'zod';
import { Card, CardEvent, CardLink, Insight, KnowledgeItem, Template } from '@/api/schemas';

export const WsEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('hello'), user_id: z.string().uuid() }),
  z.object({ type: z.literal('card.created'), card: Card }),
  z.object({ type: z.literal('card.updated'), card: Card }),
  z.object({ type: z.literal('card.deleted'), id: z.string().uuid() }),
  z.object({ type: z.literal('card.message'), event: CardEvent, card_id: z.string().uuid(), card: Card }),
  z.object({ type: z.literal('card.ai_response'), event: CardEvent, card_id: z.string().uuid(), card: Card }),
  z.object({ type: z.literal('template.created'), template: Template }),
  z.object({ type: z.literal('template.updated'), template: Template }),
  z.object({ type: z.literal('template.deleted'), id: z.string().uuid(), owner_id: z.string().uuid(), visibility: z.string() }),
  z.object({ type: z.literal('knowledge.created'), knowledge: KnowledgeItem }),
  z.object({ type: z.literal('knowledge.updated'), knowledge: KnowledgeItem }),
  z.object({ type: z.literal('knowledge.deleted'), id: z.string().uuid(), owner_id: z.string().uuid(), visibility: z.string(), shares: z.array(z.string().uuid()) }),
  z.object({ type: z.literal('knowledge.link.created'), knowledge_id: z.string().uuid(), card_id: z.string().uuid() }),
  z.object({ type: z.literal('knowledge.link.deleted'), knowledge_id: z.string().uuid(), card_id: z.string().uuid() }),
  z.object({ type: z.literal('insight.queued'), insight: Insight, card_id: z.string().uuid(), owner_id: z.string().uuid() }),
  z.object({ type: z.literal('insight.updated'), insight: Insight, card_id: z.string().uuid(), owner_id: z.string().uuid() }),
  z.object({ type: z.literal('insight.failed'), insight: Insight, card_id: z.string().uuid(), owner_id: z.string().uuid() }),
  z.object({ type: z.literal('card.link.created'), link: CardLink, from_owner_id: z.string().uuid(), to_owner_id: z.string().uuid() }),
  z.object({ type: z.literal('card.link.deleted'), id: z.string().uuid(), from_card_id: z.string().uuid(), to_card_id: z.string().uuid(), from_owner_id: z.string().uuid(), to_owner_id: z.string().uuid() }),
]);
```

**Routing map (calls into queryClient):** see S4 §5.5 table. Implementation:

```ts
export function routeWsEvent(raw: unknown, qc: QueryClient, ui: UiStore) {
  const ev = WsEvent.parse(raw);             // RULE 2 — drift fails closed
  switch (ev.type) {
    case 'hello': ui.setWsConnected(true); break;
    case 'card.created': /* setQueryData(['cards', scope], prepend) */ break;
    // … 18 more cases per S4 §5.5
  }
}
```

### 7.3 Lifecycle hooks (`src/hooks/useWs.ts`)

```ts
useEffect(() => {
  if (!token) return;
  const onFG = () => ws.connect(token);
  const onBG = () => setTimeout(() => ws.disconnect(1000), 30_000);
  AppState.addEventListener('change', s => s === 'active' ? onFG() : onBG());
  onFG();
  return () => ws.disconnect(1000);
}, [token]);
```

### 7.4 Tests

- `__tests__/ws/socket.test.ts` — mock `global.WebSocket`; transitions per
  state diagram; backoff timing (use jest fake timers).
- `__tests__/ws/events.test.ts` — table-driven over 19 event fixtures →
  assert correct `queryClient.setQueryData` / `invalidateQueries` call.

---

## 8. Push (FCM) Module

### 8.1 `src/push/fcm.ts`

```ts
export async function initFcmAfterAuth(): Promise<void>;
export async function teardownFcmOnSignOut(): Promise<void>;
export async function getOrCreateDeviceId(): Promise<string>;   // SecureStore key 'deviceId'
```

Per S4 §8.2: requests `POST_NOTIFICATIONS` (API 33+), ensures channels,
fetches FCM token, POSTs subscribe, registers `onTokenRefresh`.

### 8.2 `src/push/channels.ts`

Three channels per S3 §6.1 / S4 §8.3:

| ID | Name | Importance |
|---|---|---|
| `card-activity` | Card activity | HIGH (sound + vibration) |
| `insights` | AI insights | DEFAULT (no sound) |
| `reminders` | Due-date reminders | HIGH (V2) |

### 8.3 `src/push/handler.ts`

Per S4 §8.4: `messaging().onMessage` (foreground), `setBackgroundMessageHandler`
(background), `notifee.onForegroundEvent`/`onBackgroundEvent` (tap +
RemoteInput Reply).

**RemoteInput Reply intent:** background handler reads `input` payload →
`POST /api/cards/:id/messages` → on success cancel notification; on
failure re-post with "Retry" action.

**Tap routing:** `data.cardId` → `router.push('/board/:id)`; `data.knowledgeId`
→ `/knowledge/:id`.

### 8.4 AndroidManifest excerpts (emitted via Notifee config plugin)

```xml
<service android:name="io.invertase.firebase.messaging.ReactNativeFirebaseMessagingService"
         android:exported="false">
  <intent-filter>
    <action android:name="com.google.firebase.MESSAGING_EVENT" />
  </intent-filter>
</service>
<receiver android:name="app.notifee.core.ForegroundService" />
```

### 8.5 Tests

- `__tests__/push/handler.test.ts` — mock FCM payload routes to correct
  channel; tap routes to correct screen; RemoteInput Reply calls POST
  `/api/cards/:id/messages`.
- Detox `e2e/push.test.ts` — `adb shell am broadcast` synthetic FCM payload;
  assert Notifee displays + tap deep-links.

---

## 9. Share Intent Handler

### 9.1 `src/share/intent-parser.ts`

```ts
export type CaptureDraft = { kind: 'capture'; mode: 'photo'|'text'; text?: string; uri?: string };
export type KnowledgeDraft = { kind: 'knowledge'; url?: string; title?: string; body?: string };

export function parseShareIntent(intent: { mime?: string; text?: string; subject?: string; uri?: string }): CaptureDraft | KnowledgeDraft {
  const URL_RE = /\bhttps?:\/\/[^\s]+/i;
  if (intent.mime?.startsWith('image/') && intent.uri) {
    return { kind: 'capture', mode: 'photo', uri: intent.uri };
  }
  if (intent.text && URL_RE.test(intent.text)) {
    const url = intent.text.match(URL_RE)![0];
    return { kind: 'knowledge', url, title: intent.subject ?? new URL(url).hostname, body: intent.text.replace(URL_RE, '').trim() };
  }
  if (intent.text) {
    const lines = intent.text.split(/\r?\n/);
    return { kind: 'knowledge', title: lines[0]?.slice(0, 80), body: intent.text };
  }
  return { kind: 'capture', mode: 'text' };
}
```

### 9.2 AndroidManifest intent-filter

Per S4 §4.4:

```xml
<intent-filter>
  <action android:name="android.intent.action.SEND"/>
  <category android:name="android.intent.category.DEFAULT"/>
  <data android:mimeType="text/plain"/>
  <data android:mimeType="image/*"/>
</intent-filter>
```

### 9.3 `app/share-target.tsx`

Mounts on intent receipt, calls `parseShareIntent`, then `router.replace`
to either `/knowledge/edit` or `/capture`.

### 9.4 Tests

- `__tests__/share/intent-parser.test.ts` — parameterized over MIME +
  text shapes (URL, plain text, image, mixed).
- Detox `e2e/share-target.test.ts` — `adb shell am start -a android.intent.action.SEND`
  with each MIME, assert correct destination screen rendered.

---

## 10. Storage Layers

### 10.1 `src/storage/secure.ts`

```ts
import * as SecureStore from 'expo-secure-store';

const ALLOWED_KEYS = ['authToken', 'deviceId'] as const;
type SecureKey = typeof ALLOWED_KEYS[number];

export const secureStore = {
  async set(key: SecureKey, value: string): Promise<void> {
    if (!ALLOWED_KEYS.includes(key)) throw new Error(`SecureStore key not allowed: ${key}`);
    await SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED });
  },
  async get(key: SecureKey): Promise<string | null> {
    return SecureStore.getItemAsync(key);
  },
  async delete(key: SecureKey): Promise<void> {
    await SecureStore.deleteItemAsync(key);
  },
};
```

**Auth token ONLY** plus device id. Other secrets explicitly disallowed by
the `ALLOWED_KEYS` runtime guard.

### 10.2 `src/storage/cache.ts`

```ts
import { MMKV } from 'react-native-mmkv';
export const mmkv = new MMKV({ id: 'smartkanban-cache' });

export const cache = {
  setString(k: string, v: string) { mmkv.set(k, v); },
  getString(k: string) { return mmkv.getString(k) ?? null; },
  setJSON<T>(k: string, v: T) { mmkv.set(k, JSON.stringify(v)); },
  getJSON<T>(k: string): T | null { const s = mmkv.getString(k); return s ? JSON.parse(s) as T : null; },
  delete(k: string) { mmkv.delete(k); },
};
```

Used by: React Query persister (S4 §5.2 — MMKV, NOT SecureStore), theme
preference, last-viewed lane/scope, capture-draft persistence.

### 10.3 `src/storage/persister.ts`

```ts
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { mmkv } from './cache';

export const queryPersister = createSyncStoragePersister({
  storage: {
    setItem: (k, v) => mmkv.set(k, v),
    getItem: (k) => mmkv.getString(k) ?? null,
    removeItem: (k) => mmkv.delete(k),
  },
  key: 'rq-cache',
  throttleTime: 1_000,
});
```

### 10.4 ESLint ban on AsyncStorage

Per S4 §7.7:

```js
rules: {
  'no-restricted-imports': ['error', {
    paths: [
      { name: '@react-native-async-storage/async-storage',
        message: 'Use src/storage/secure.ts for tokens, src/storage/cache.ts (MMKV) for non-secret cache.' },
    ],
  }],
}
```

CI gate: PR fails if any import lands.

### 10.5 Tests

- `__tests__/storage/secure.test.ts` — disallowed key throws.
- `__tests__/storage/cache.test.ts` — set/get/delete roundtrip.

---

## 11. RULE-Compliance Checklists

Every backend interaction is gated by this checklist; Stage 5 PRs MUST
include it filled-in.

### 11.1 RULE 1 — Pre-flight before writing endpoint code

For every endpoint hook in §6:

- [ ] **Check 1:** `grep -nE '<METHOD>.*<path>' server/src/routes/*.ts` confirms the endpoint exists at the line cited in §4.
- [ ] **Check 2:** Path prefix matches (`/api/...` or `/attachments/...` or `/ws`).
- [ ] **Check 3:** Read the `reply.send(...)` / `return ...` line — record the jsonify shape verbatim in `src/api/schemas/*.ts`.
- [ ] **Check 4:** cross-check `web/src/api.ts` for the same shape (web client is the canonical consumer); if web wraps in `{items}` but server returns bare array, web is wrong — record the discrepancy in Stage 7 reviewer notes.

### 11.2 RULE 2 — Zod schema mirrors backend verbatim

For every entry in `src/api/schemas/envelopes.ts`:

- [ ] Bare array? → `z.array(X)`.
- [ ] Bare object (Record)? → `z.record(keySchema, valueSchema)`.
- [ ] Wrapper? → `z.object({ items: z.array(X), next_cursor: z.string().nullable() })`.
- [ ] Test parses a recorded fixture and FAILS if a required field is removed.

### 11.3 RULE 3 — Concurrency hygiene (JS/RN translation)

Originally Swift Concurrency; translated to RN async patterns:

- [ ] No fire-and-forget `void promise` (every async call is `await`ed OR explicitly logged on failure).
- [ ] No `Promise.race` with cancellation; use `AbortController` instead.
- [ ] React Query `useMutation` rather than ad-hoc `fetch` inside `useEffect`.
- [ ] WebSocket reconnect loop uses single timer reference; no parallel reconnect attempts.
- [ ] FCM token refresh handler is idempotent — no nested `onTokenRefresh` registrations.
- [ ] Effects that fire network calls have cleanup that cancels in-flight requests on unmount (via `AbortSignal`).

### 11.4 RULE 9 — Verb verification (every "button" mounts a real Pressable)

For every screen spec in §3, every F-NNN row in S3 §3:

- [ ] Every row described as "button" / "chip" / "toggle" / "tap" → has a mounted `<Pressable>` / `<Button>` / `<Chip>` / `<IconButton>` / `<TextButton>` with an `onPress` handler.
- [ ] Every "long-press" → uses `<Pressable onLongPress>` OR `react-native-gesture-handler` `<LongPressGestureHandler>`.
- [ ] Every "swipe" → uses `react-native-gesture-handler` `<Swipeable>` or `<PanGestureHandler>`.
- [ ] Every "drag" → uses long-press detector + `<Reanimated.View>` with shared values.
- [ ] No "visual-only" element claimed as interactive (i.e. no decorative `<View>` posing as a button).

### 11.5 RULE 13 — Decompose container rows

For every "container" / "tile" / "card" / "render*" row in S3:

- [ ] The container is implemented as a parent composable that mounts named child composables (not inline anonymous render functions for individually testable units).
- [ ] Each child is independently snapshot-tested.
- [ ] No file >300 LOC; any larger component is split.

### 11.6 RULE 16 — Post-edit file rule-grep before commit

Before every commit, on every touched `.ts`/`.tsx` file:

- [ ] `grep -nE 'AsyncStorage|setTimeout\(.*0\)|/\* TODO\*/' <files>` — zero matches.
- [ ] `grep -nE 'await fetch\(' <files>` — only inside `src/api/client.ts` (every other call must go through ky).
- [ ] `grep -nE 'as any' <files>` — flag for reviewer.
- [ ] `npm run lint && npm run typecheck && npm test -- --findRelatedTests <files>` all green.
- [ ] `npm run verify:pinned` — exits 0.

---

## 12. Test Plan Summary

### 12.1 Unit (Jest + React Testing Library)

- **Coverage targets:** ≥ 80% on `src/api/`, `src/state/`, `src/components/`,
  `src/utils/`.
- **Per-component:** snapshot per visual state (per S3 §4 table).
- **Per-hook:** mocked API responses via `msw/native`; assert query keys,
  optimistic updates, rollback paths.
- **Per-store:** action coverage; persistence interaction with SecureStore /
  MMKV mocks.
- **Per-zod-schema:** roundtrip fixture parse; intentional drift fails.

### 12.2 Integration (Jest + msw)

- Full screen mount with realistic fixture data; assert all sections render.
- WS event injected via mocked socket → assert UI updates.
- Mutation fire → assert HTTP request body shape via msw handler.

### 12.3 E2E (Detox)

**Device matrix:** Pixel 6 Pro emulator (API 33) AND Pixel 8 Pro emulator
(API 35) — covers Android 13 (min target relevant) and Android 15 latest.

**6 critical journeys from S2 §5 mapped to E2E:**

1. `e2e/login.test.ts` — Journey 1.
2. `e2e/share-target.test.ts` — Journey 2.
3. `e2e/capture-photo.test.ts` — Journey 3.
4. `e2e/move-card.test.ts` — Journey 4.
5. `e2e/ai-chat.test.ts` — Journey 5.
6. `e2e/brainstorm.test.ts` — Journey 6.

### 12.4 Snapshot

- Paper theme tokens in light + dark.
- Each screen rendered in light + dark.
- Each component rendered per visualState.

---

## 13. Backend Prerequisites Block (BLOCKERS for Android MVP)

Repeats S4 §15.1 with explicit Stage-5-backend specs.

### 13.1 `POST /api/auth/native/token`

- **File:** `server/src/routes/auth.ts` (extend the existing plugin).
- **Migration:** `server/migrations/2026-05-21-mirror-tokens-native-scope.sql`:
  ```sql
  ALTER TABLE mirror_tokens DROP CONSTRAINT mirror_tokens_scope_chk;
  ALTER TABLE mirror_tokens ADD CONSTRAINT mirror_tokens_scope_chk
    CHECK (scope IN ('mirror', 'api', 'native'));
  ```
- **Handler:** body `{email, password, device_label?}` → argon2 verify →
  `crypto.randomBytes(32).toString('base64url')` token → insert row with
  `scope='native'`. Returns `{token, scope:'native', user: User}`.
- **`requireUser` preHandler:** extend to accept `Authorization: Bearer`
  matching any `scope IN ('api','native')`. Today only `requireUserOrApiToken`
  accepts bearer; native must reach ALL routes (knowledge, templates,
  insights, notifications, push subscribe, telegram link, review, archive,
  chat events).
- **Web client cross-check:** web uses cookie session — no change needed
  there; add a fixture test to confirm bearer + cookie both authenticate
  the same routes.

### 13.2 `POST /api/push/fcm/subscribe`, `DELETE /api/push/fcm/subscribe`

- **File:** new `server/src/routes/push_fcm.ts`.
- **Migration:** `server/migrations/2026-05-21-fcm-subscriptions.sql`:
  ```sql
  CREATE TABLE fcm_subscriptions (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    fcm_token TEXT UNIQUE NOT NULL,
    device_id TEXT NOT NULL,
    device_label TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX idx_fcm_sub_user ON fcm_subscriptions(user_id);
  ```
- **Endpoints:** POST upserts on `fcm_token` UNIQUE; DELETE removes by
  `fcm_token`.
- **Test fixture:** add `web/__tests__/api/push-fcm-roundtrip.test.ts` —
  the web client doesn't use FCM but the bearer path must remain compatible.

### 13.3 `pushToUser()` fan-out extension

- **File:** `server/src/push.ts` (extend existing 47-72 fan-out).
- **Dep:** add `firebase-admin@13.x` (pinned exact) to `server/package.json`.
- **Env:** `FCM_SERVICE_ACCOUNT_JSON` (path or base64-inline) — initializer
  at boot.
- **Logic:** in `pushToUser(uid, payload)`, after the existing web-push
  loop, run a parallel loop over `fcm_subscriptions WHERE user_id = $1`
  and call `getMessaging().send({ token, notification: {...}, data: {...} })`.
  On `messaging/registration-token-not-registered` → delete the row
  (mirrors the existing 410 cleanup).

### 13.4 `POST /api/cards/from-audio`

- **File:** `server/src/routes/attachments_upload.ts` (extend; mirrors the
  existing `from-image` handler exactly).
- **Migration:** none (uses existing `card_attachments` with `kind='audio'`).
- **Logic:** multipart `file` field with MIME in
  `audio/ogg|audio/m4a|audio/mp4|audio/webm`. Save attachment, create
  card with `needs_review=TRUE`, transcribe via `whisper-1` (existing
  `ai/whisper.ts`), then `proposeFromText(transcript)` (existing
  `ai/propose.ts`), swap title/desc on success.
- **Env:** new `AUDIO_MAX_BYTES` (default `10_000_000` = 10 MB). Add to S1
  §1.3 env table on next regeneration.
- **Test fixture:** server-side jest test posting a sample `.m4a`
  attachment and asserting card created.

### 13.5 WebSocket bearer subprotocol

- **File:** `server/src/ws.ts:102-114`.
- **Change:** before reading the cookie, check
  `req.headers['sec-websocket-protocol']` for a value matching
  `^bearer\.[A-Za-z0-9_-]+$`; extract the token; look up
  `mirror_tokens WHERE token=$1 AND scope IN ('api','native')`. If matched,
  set `userId` and accept the upgrade (with `'Sec-WebSocket-Protocol':
  'bearer.<token>'` echoed back as required by RFC 6455).
- **Backward compat:** cookie path unchanged; mirror token path unchanged.
- **Test fixture:** server-side WS upgrade test asserting all three auth
  paths (cookie / mirror / bearer) succeed.

### 13.6 `mirror_tokens.scope` CHECK extension

Covered in 13.1 migration.

### 13.7 `/.well-known/assetlinks.json` published at `APP_URL`

- **File:** `server/src/index.ts` add a static route OR host on the
  reverse proxy / CDN.
- **Content:** JSON file per Google's [App Links spec](https://developer.android.com/training/app-links/verify-android-applinks#web-assoc), containing the
  SmartKanban Android package name + SHA-256 fingerprints of the upload
  and release keys (obtained from Play Console once app is published).
- **Validation:** Stage 6 verifies via
  `adb shell pm verify-app-links --re-verify com.smartkanban.app`.

**Total backend prereqs: 7** (matches S4 §15.1).

---

## 14. Open Questions / Risks for Stage 6 QA + Stage 7 Reviewer

### 14.1 Device matrix

S2 §6 names "Pixel 6a" as the mid-range reference. Stage 6 must lock the
exact device matrix. Recommended 3-device matrix:

- **Pixel 6a** (Android 14, 6 GB RAM) — performance target.
- **Pixel 8 Pro** (Android 15, 12 GB RAM) — latest OS, large screen.
- **Pixel 3a** OR Samsung A14 (Android 13, 4 GB RAM) — low-end stress.

OPEN: do we have physical devices or only emulators? Detox runs on emulator;
Firebase Test Lab can target physical. Decision needed before Phase 0
finalization.

### 14.2 FCM environment split

OPEN: do we have separate Firebase projects (and thus separate sender IDs +
`google-services.json` files) for `development`/`preview`/`production`?

Recommended: yes — three Firebase projects, three `google-services.json`
files stored as separate EAS Secrets per profile. Otherwise a dev push
test could deliver to a real prod user.

### 14.3 App Link verification host

OPEN: which domain hosts `/.well-known/assetlinks.json`? S1 §10.1 states
prod is `192.168.50.13` LAN — App Link autoVerify requires a public HTTPS
hostname. Until prod gets a verified HTTPS hostname, App Links degrade
to chooser. Stage 7 must confirm a hostname + cert plan before R5 (S4 §15)
is mitigated.

### 14.4 Detox + Expo Router compatibility

S4 §15 R3 flags this. Stage 5 spike: write 1 Detox login test in Phase 0
before locking the entire suite. Alternative: Maestro (YAML-based, RN
friendly). Stage 6 reviews.

### 14.5 Cookie auth fallback if bearer endpoint is not delivered

If backend Phase prereq 13.1 slips, MVP must use `@react-native-cookies/cookies`
(NOT pinned in §2 — would need to be added). This is a "break glass" path —
Stage 7 must approve before Stage 5 reaches for it.

### 14.6 Voice capture deferral

If backend prereq 13.4 slips beyond Phase 12, ship MVP without F-127 voice
(matching the PWA's current stub). Stage 7 decides whether Phase 12 blocks
on this or ships short.

### 14.7 Activity log paging

S1 §11.12 + S2 §8.7 — `GET /api/cards/:id/events` returns full list.
Native loads all on screen mount. Stage 6 should test a card with 200+
events for perf regression; if slow, file a backlog item to add
`?limit=&before_id=` server-side.

---

STAGE_COMPLETE: engineer phases=12 components=24 screens=14 endpoints=51 blockers=7
