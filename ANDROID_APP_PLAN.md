# SmartKanban — Android App Plan
**Pipeline:** 7-agent specialist sequence (Analyst → PM → Designer → Architect → Engineer → QA → Reviewer)
**Source registry:** FEATURE_PARITY_REGISTRY.md @ commit `ea865d97873f` (499 rows, 24 screens)
**Stack lock:** React Native 0.76.5 + Expo SDK 52 + TypeScript 5.6.3 + Material 3 (`react-native-paper` 5.12.5) + Zustand 5.0.2 + React Query 5.62.7 + Expo Router 4.0.15 + `expo-secure-store` 14.0.0 (EncryptedSharedPreferences) + FCM (`@react-native-firebase/messaging` 21.6.1) + Notifee 9.1.2
**Min Android API:** 29 (target 35)
**Reviewer veto count:** 0
**Reviewer confidence (worst-link):** 7/10

---

## 0. Executive Summary

**Product positioning (S2 §1.2).** SmartKanban for Android is the friction-free
capture surface for everything on a phone — share intents, photos, voice, and
quick text — that lands instantly into the shared family board and survives
Chrome being killed. The PWA stays the answer for users who refuse installs;
the native app exists for the **capture + push + share-target** axis where
Chrome on Android is structurally weaker (background FCM reliability, system
share sheet visibility, real `AudioRecord`, biometric, App Links, offline
draft queue).

**Tech stack summary (S4 §1).** React Native 0.76.5 on Expo SDK 52, Managed
workflow with EAS Build (eject to Bare only if a config-plugin gap blocks).
Hermes engine. Expo Router 4 file-based navigation. UI built on
`react-native-paper` (Material 3) with a custom token overlay carrying the
Stage 3 seed-derived palette verbatim. Server state via React Query 5 with
MMKV-backed persistence; client/UI state via 3 Zustand stores. HTTP via `ky`
+ `zod` runtime parse (RULE 2 verbatim mirror). WS via native `WebSocket`
with bearer subprotocol + 500ms→10s backoff. Push via FCM + Notifee. Secrets
in `expo-secure-store` (EncryptedSharedPreferences); cache in MMKV;
AsyncStorage banned via ESLint rule (S4 §7.7).

**Scope (S2 §4).** Registry has **499 rows**.
- **MVP (Release 1):** ~188 rows (37.7%).
- **V1 (Release 2):** cumulative ~263 rows (52.7%; parity-excluding-out-of-scope = 77.6%).
- **V2 (Release 3+):** cumulative ~339 rows (67.9%; parity-excluding-out-of-scope = 100%).
- **Out-of-scope:** ~160 rows (Telegram bot 30, Mirror kiosk 8, SW raw 4, install prompts 3, keyboard shortcuts 5, plus 55 backend-only F-1010..F-1064 and miscellaneous web-only rows).

**Critical journeys (S2 §5):** **6** end-to-end flows with locked tap counts
and time budgets — cold-start <3.5 s; capture funnel <4 s; photo capture
e2e <8 s; push-to-card-visible <2 s.

**Build phases & estimate (S5 §1):** **12 vertical-slice phases**, **37
focused dev days** total (sequential single-engineer assumption; some
parallelization possible).

**Backend prerequisites (BLOCKERS for MVP):** **8 items** — 7 from S4 §15.1
plus 1 added by S6 §15.5 (the `/api/_test/seed` endpoint for E2E test data).
See §7. Owner: **TBD — server team**.

**Top 3 risks (PART A review):**
1. **R-001 (HIGH):** App Link `autoVerify` requires a public HTTPS hostname
   hosting `/.well-known/assetlinks.json`; prod today is `192.168.50.13` LAN
   (S1 §10.1). Until prod has a verified HTTPS hostname, App Links degrade
   to chooser. **Mitigation:** custom `kanban://` scheme works regardless;
   ship MVP with chooser fallback; resolve hostname before V1 GA.
2. **R-002 (HIGH):** 7 backend BLOCKERS gate Android MVP; the bearer-token
   endpoint and FCM table/fan-out are not yet on the server. **Mitigation:**
   plan §7 enumerates each; Phases 2/5/10 cannot ship until corresponding
   prereqs are signed off in production.
3. **R-003 (MEDIUM):** Parity coverage projects 77.6% at V1, just under
   the ≥80% target (S2 §6, §4.5). **Mitigation:** S2 lists cheap V1 wins
   (Toasts F-820..F-824 already in V1; Archive list rows promoted; Templates
   CRUD shipped) — Stage 5 P12 audit closes the 2.4% gap.

---

## 1. Product Plan (from S2 — condensed)

### 1.1 Hypothesis & positioning (S2 §1)

Native unlocks: background push reliability, share intents from any app,
system mic voice capture, BiometricPrompt, App Links, offline draft queue,
home-screen widgets (V2), faster cold start, system integrations (App
Shortcuts, Live Notifications V2+).

### 1.2 Persona (S2 §2.1)

Personal-Knowledge Operator with a family inbox. One adult power-user
running the board daily; 1–4 family members occasionally writing to Family
Inbox (zero-assignee = visible-to-all per visibility predicate). Trust model
= household (`OPEN_SIGNUP=false` after first user). Phone-first; PWA mobile
shell already dominant surface; desktop board reserved for weekly review.

### 1.3 Top 5 JTBDs (S2 §2.2)

| # | Job | Trigger | Success criterion |
|---|---|---|---|
| 1 | Capture an idea before I forget it | Walking, in a meeting | Card visible in Today within 2 s of send |
| 2 | Save a URL someone DM'd me without losing context | Friend shares article | Knowledge item with `source='share_target'`, AI title accepted in one tap |
| 3 | Photo of a receipt/whiteboard/business-card to triage later | "Snap this before I leave" | Card with `needs_review=TRUE`, photo attached, title auto-filled in ≤4 s |
| 4 | Plan my morning — move yesterday's stragglers | Standing at espresso machine | Each move ≤2 taps, optimistic UI, WS reconciles ≤200 ms |
| 5 | @ai, what should I do with this card? | Stale card resurfaces | AI suggestion chip via WS in ~8 s, tap chip applies via PATCH |

### 1.4 MVP / V1 / V2 / Out-of-scope (S2 §4)

**Per-screen MVP roster (rows from S2 §4.1):**

| Group | F-NNN ranges | Count |
|---|---|---|
| Auth | F-001..F-011 minus F-003 | 10 |
| Board chrome | F-021, F-023..F-025, F-027, F-030..F-036 | 10 |
| Board lanes | F-056, F-057, F-070..F-074, F-075, F-077 | 6 |
| Cards (CardView) | F-090, F-091, F-093..F-109 | 18 |
| Capture | F-120..F-131 | 12 |
| Card detail | F-152, F-153, F-155, F-157, F-161..F-163, F-165..F-170, F-172..F-180, F-182, F-183 + F-720..F-740 | 37 |
| AI Insights | F-200..F-215 | 16 |
| Timeline + chat | F-311..F-327 | 18 |
| Notifications | F-340, F-341, F-344..F-351 | 12 |
| Knowledge read + share | F-547..F-549, F-570..F-579, F-600..F-606, F-630..F-639 | 15 |
| Mobile shell | F-660 (date), F-661..F-663, F-665..F-671, F-673, F-674 (2 tabs), F-675, F-676, F-678..F-680 | 16 |
| Mobile card actions | F-700..F-703 | 4 |
| Mobile More | F-760, F-761, F-764, F-766 | 3 |
| Push & deep link | F-867, F-871 | 3 |
| WS | F-980..F-985, F-987, F-989, F-991 | 8 |
| **MVP total** | | **~188** |

**V1 additions (S2 §4.2):** F-003 login bloom; F-020 header blur; F-092 press lift; F-110 drag; F-151 spring-in; F-164 read-only related-cards block; F-181, F-183; F-461 + F-480..F-495 Templates CRUD; F-510..F-519 Archive; F-540..F-546, F-607..F-612, F-634 Knowledge CRUD; F-820..F-824 Toasts; F-840..F-842 trash drop zone; F-342, F-863..F-865, F-868..F-870 FCM push (replaced flows); F-763 More archived row; F-970 full bearer WS auth; F-986, F-988 template/knowledge-link WS events. **V1 cumulative ~263.**

**V2 additions (S2 §4.3):** F-370..F-377 ActivityTicker; F-390..F-395 weather; F-410..F-420 weekly review; F-280..F-291 chain (WebView embed); F-230..F-237 related cards CRUD; F-250..F-260 link picker; F-990 WS card.link events; F-447..F-451 mirror tokens UI; F-452..F-456 API tokens UI; F-457..F-460 Telegram identities UI; F-762 More weekly-review row; F-158..F-160 QR; F-664 ActivityTicker mount; F-660 weather chip half; native widgets / app shortcuts / Live Notifications (new — not in registry). **V2 cumulative ~339.**

**Out-of-scope (S2 §4.4, ~160 rows):**

| Category | Rows | Reason |
|---|---|---|
| Telegram bot | F-910..F-947 (30) | Server-side; R2 |
| Mirror view | F-790..F-797 (8) | Desktop kiosk; R4 |
| Service worker (raw) | F-860..F-862, F-866 (4) | Web-only; R3 (FCM replaces) |
| Install prompt | F-672, F-765, F-872 (3) | Native app; R3 |
| Keyboard shortcuts | F-890..F-894 (5) | No keyboard on phone; R3 |
| ⌘K hint | F-028 (1) | R3 |
| Esc-key handlers | F-156 (1) | System back; R3 |
| Hover-pause | F-374 (1) | No hover; R3 |
| EditDialog backdrop | F-150 (1) | Full-screen route; R1 |
| Backend-only | F-1010..F-1064 (55) | R2 — consumed via APIs |
| Misc WS plumbing | — (implicit) | Implicit |

### 1.5 6 Critical Journeys (preserving tap counts) (S2 §5)

| # | Name | Taps | Time budget |
|---|---|---|---|
| 1 | First-time install + auth | 4 from launch | <4 s cold |
| 2 | Quick capture from share intent (URL from browser) | 3–4 | <4 s capture funnel |
| 3 | Photo capture from camera | 5 from cold | <8 s e2e |
| 4 | Move card across lanes — drag path / sheet path | 1 (drag) / 2 (sheet) | <500 ms optimistic, ≤1.5 s round-trip |
| 5 | Read & reply to @ai chat thread (push tap) | 2 (notif + chip) | <2 s push-to-visible |
| 6 | Brainstorm a card | 4 (open, brainstorm, wait, Open ↗) | <30 s `BRAINSTORM_TIMEOUT_MS` |

### 1.6 Success criteria (S2 §6)

| Metric | Target | Measurement |
|---|---|---|
| Cold start to Board visible | < 3.5 s on Pixel 6a | Firebase Performance custom trace `app_to_board_visible` |
| Capture funnel duration (text) | < 4 s, 95th pct | Trace `capture_text_e2e` |
| Photo capture e2e | < 8 s | Trace `capture_photo_e2e` |
| Crash-free sessions | > 99.5% | Crashlytics |
| ANR rate | < 0.5% | Play Console |
| Push deliverability | > 95% within 30 s | FCM Analytics + 4 h synthetic ping |
| Parity coverage by V1 | ≥ 80% of non-out-of-scope ✅/🔄 | Registry audit script |
| APK size base / aggregate | < 25 MB / < 40 MB | Play Console |
| WS reconnect time | < 3 s | Trace `ws_reconnect_to_first_event` |
| Cold-start WS handshake | < 800 ms | Trace `ws_handshake` |
| Notification permission grant rate | > 70% first prompt | Analytics |
| MVP parity | 100% of MVP rows ✅ before V1 | Registry audit |

### 1.7 Non-goals (S2 §7)

No tablet split-view in MVP. No Wear OS. No home-screen widgets in MVP. No
iOS port. No offline-first sync engine in MVP (cached reads + online-only
writes; mid-edit conflict resolution = V2). No custom in-app browser. No
biometric unlock in MVP (V1). No file-system browser beyond system picker.
No multi-account. No PWA suppression. No Telegram client code. No client-side
image editing (crop V2). No drag-and-drop from other apps.

---

## 2. Architecture (from S4 — condensed)

### 2.1 Stack decision matrix (S4 §1)

| Decision | Value | Alternative rejected |
|---|---|---|
| Framework | React Native 0.76.5 + Expo SDK 52 | Compose-native (user-locked away) |
| Language | TypeScript 5.6.3 strict (`strict:true`, `noUncheckedIndexedAccess:true`) | — |
| Engine | Hermes (default RN 0.74+) | JSC (slower cold start) |
| Bundler | Metro (Expo default) | — |
| New Architecture | OFF for MVP (Fabric+TurboModules); revisit V1 | Some Firebase/Notifee combos still warn under New Arch as of 2026-05 |
| Workflow | Expo Managed + EAS Build (eject to Bare only if blocked) | Bare from day 1 — overkill for MVP |
| Build / OTA | EAS Build + EAS Update channels (preview, production) | — |
| Distribution | Play Internal → Closed → Open → Production | — |
| UI library | `react-native-paper` 5.12.5 (Material 3) | bare RN components — would re-implement M3 |
| Lists | `@shopify/flash-list` 1.7.2 | RN `FlatList` (jankier) |
| Sheets | `@gorhom/bottom-sheet` 5.0.6 | bare RN `Modal` (no gesture-driven snap) |
| Client state | Zustand 5.0.2 — 3 stores (auth, ui, capture-draft) | Redux (overkill) |
| Server state | `@tanstack/react-query` 5.62.7 — 15 query hooks, 30 mutation hooks | manual `useState`+`useEffect` |
| HTTP | `ky` 1.7.4 + `zod` 3.24.1 (RULE 2 verbatim parse) | `axios` — no runtime validation |
| WebSocket | native `WebSocket` + bearer subprotocol + 500ms→10s backoff | `socket.io` — server uses raw `@fastify/websocket` |
| Secrets | `expo-secure-store` 14.0.0 (EncryptedSharedPreferences, AES256-GCM hardware-backed on API 29+) — **auth token + deviceId ONLY** | AsyncStorage — explicitly banned via ESLint |
| Cache | `react-native-mmkv` 3.1.0 (React Query persistence, theme, last lane/scope) | SecureStore (2 KB cap unfit for cache) |
| Push | `@react-native-firebase/messaging` 21.6.1 + `@notifee/react-native` 9.1.2 | web-push tunnel — incompatible payload format |
| Min/Target SDK | 29 / 35 | — |

### 2.2 Pinned dependency manifest (S4 §2 — full count: 47 deps + 15 devDeps, ALL pinned exact, no `^`/`~`)

**`dependencies` (47):**

```jsonc
{
  // Expo core (10)
  "expo": "52.0.20",
  "expo-router": "4.0.15",
  "expo-status-bar": "2.0.0",
  "expo-splash-screen": "0.29.18",
  "expo-system-ui": "4.0.6",
  "expo-constants": "17.0.3",
  "expo-linking": "7.0.3",
  "expo-web-browser": "14.0.1",
  "expo-haptics": "14.0.0",
  "expo-font": "13.0.1",

  // Expo capabilities (7)
  "expo-image": "2.0.3",
  "expo-image-picker": "16.0.3",
  "expo-document-picker": "13.0.1",
  "expo-file-system": "18.0.5",
  "expo-sharing": "13.0.0",
  "expo-camera": "16.0.10",
  "expo-av": "15.0.1",

  // Secrets / storage (3)
  "expo-secure-store": "14.0.0",
  "react-native-mmkv": "3.1.0",
  "expo-local-authentication": "15.0.1",

  // Fonts (3)
  "@expo-google-fonts/spectral": "0.2.3",
  "@expo-google-fonts/inter": "0.2.3",
  "@expo-google-fonts/jetbrains-mono": "0.2.3",

  // RN core (7)
  "react": "18.3.1",
  "react-native": "0.76.5",
  "react-native-safe-area-context": "4.12.0",
  "react-native-screens": "4.4.0",
  "react-native-gesture-handler": "2.21.2",
  "react-native-reanimated": "3.16.6",
  "react-native-keyboard-controller": "1.15.2",

  // UI library / lists / sheets (3)
  "react-native-paper": "5.12.5",
  "@shopify/flash-list": "1.7.2",
  "@gorhom/bottom-sheet": "5.0.6",

  // State + server-state (4)
  "zustand": "5.0.2",
  "@tanstack/react-query": "5.62.7",
  "@tanstack/react-query-persist-client": "5.62.7",
  "@tanstack/query-async-storage-persister": "5.62.7",

  // HTTP + validation (2)
  "ky": "1.7.4",
  "zod": "3.24.1",

  // Connectivity (1)
  "@react-native-community/netinfo": "11.4.1",

  // Push / notifications (4)
  "expo-notifications": "0.29.10",
  "@react-native-firebase/app": "21.6.1",
  "@react-native-firebase/messaging": "21.6.1",
  "@notifee/react-native": "9.1.2",

  // Telemetry (1)
  "@sentry/react-native": "6.4.0",

  // Utilities (2)
  "date-fns": "4.1.0",
  "react-native-mime-types": "2.5.0"
}
```

**`devDependencies` (15):** `typescript` 5.6.3, `@types/react` 18.3.18,
`@types/react-native` 0.73.0, `@types/node` 22.10.2, `@babel/core` 7.26.0,
`eslint` 9.17.0, `@react-native/eslint-config` 0.76.5,
`eslint-plugin-import` 2.31.0, `prettier` 3.4.2, `jest` 29.7.0,
`jest-expo` 52.0.2, `@testing-library/react-native` 13.0.1,
`@testing-library/jest-native` 5.4.3, `@types/jest` 29.5.14,
`detox` 20.32.0 (`// confirm latest` — verify RN 0.76 + API 29–35 support),
`@types/detox` 18.1.0, `husky` 9.1.7, `lint-staged` 15.2.11.

**Verification:** `npm run verify:pinned` exits 1 if any `^` or `~` present.
CI gate per S4 §11.2.

### 2.3 Project structure (S4 §3 — abbreviated)

```
smartkanban-android/
├── app/                              # expo-router file routes
│   ├── _layout.tsx                   # Root Stack + PaperProvider + QueryClientProvider + AuthGate
│   ├── (auth)/login.tsx
│   ├── (tabs)/
│   │   ├── _layout.tsx               # NavigationBar (3 tabs)
│   │   ├── board/{index,[id]}.tsx, board/chain/[id].tsx
│   │   ├── knowledge/{index,[id],edit}.tsx
│   │   └── more/{index,settings,archive,weekly-review}.tsx
│   ├── capture.tsx                   # Modal: CaptureSheet
│   ├── notifications.tsx             # Modal
│   └── share-target.tsx              # ACTION_SEND landing
├── src/
│   ├── api/{client,errors,types,multipart}.ts + endpoints/* + schemas/*
│   ├── state/{auth-store,ui-store,capture-draft-store}.ts
│   ├── hooks/use*.ts                 # 15 React Query hooks + 30 mutations + WS + FCM + share
│   ├── components/*.tsx              # 24 components (12 core + 12 glue)
│   ├── design/{theme,colors,typography,spacing,elevation,motion}.ts
│   ├── navigation/{linking,deep-links}.ts
│   ├── push/{fcm,channels,handler}.ts
│   ├── ws/{socket,events,queue}.ts
│   ├── storage/{secure,cache,persister}.ts
│   ├── share/intent-parser.ts
│   ├── utils/{relative-time,visibility,color-hash,debounce}.ts
│   └── env.ts                        # EXPO_PUBLIC_* loader + zod validation
├── android/app/src/main/              # Bare workflow only (if ejected)
│   ├── AndroidManifest.xml
│   ├── res/xml/network_security_config.xml
│   ├── res/xml/backup_rules.xml
│   └── google-services.json (gitignored; EAS Secret)
├── assets/{icon,adaptive-icon-background,splash}.png, fonts/
├── e2e/*.test.ts                     # Detox
├── __tests__/{api,state,utils,components,screens,ws,push,share,design,fixtures}/
├── app.json, eas.json, tsconfig.json, babel.config.js, metro.config.js
├── .eslintrc.js (AsyncStorage ban), .prettierrc, jest.config.ts
└── .github/workflows/{pr,main,release}.yml
```

### 2.4 Navigation graph (S4 §4.1, S3 §2.3)

```
RootStack
├── (auth)/login                      # gate, full-screen, NavigationBar hidden
└── (tabs)                            # NavigationBar wrapper (3 tabs)
    ├── board/{index, [id], chain/[id]}
    ├── knowledge/{index, [id], edit}
    └── more/{index, settings, archive, weekly-review}

Modal/global routes (above NavigationBar):
├── capture                           # CaptureSheet
├── notifications                     # NotificationListScreen
└── share-target                      # ACTION_SEND landing
```

**Deep link map (S4 §4.2):**

| URL / Scheme | Resolves to | Notes |
|---|---|---|
| `kanban://card/{id}` | `(tabs)/board/[id]` | Detail, chat scrolled to bottom |
| `kanban://knowledge/{id}` | `(tabs)/knowledge/[id]` | — |
| `kanban://capture` | `/capture` | App Shortcut (V2) |
| `https://<APP_URL_HOST>/m/card/{id}` (App Link, autoVerify=true) | `(tabs)/board/[id]` | Mirror-token-aware (`?token=`) — token stripped if user authenticated |
| `https://<APP_URL_HOST>/knowledge/{id}` | `(tabs)/knowledge/[id]` | — |
| `https://<APP_URL_HOST>/?card={id}` (legacy F-867) | `(tabs)/board/[id]` | Back goes to Board (not browser) |
| `ACTION_SEND text/plain` | `/share-target` → KnowledgeEditScreen pre-filled | — |
| `ACTION_SEND image/*` | `/share-target` → CaptureSheet with photo | — |
| FCM `data.cardId={id}` (notification tap) | `(tabs)/board/[id]` | Via `src/push/handler.ts` |

Unauthenticated deep link → `(auth)/login?pendingDeepLink=...`; replayed on
sign-in success via Zustand `auth-store.onSignIn`.

### 2.5 State management split (S4 §5)

**3 Zustand stores (client/UI state):**

| Store | Shape | Persistence |
|---|---|---|
| `auth-store` | `{token, user, isHydrated, signIn, signOut, setUser, hydrate}` | `token` → SecureStore (EncryptedSharedPreferences); `user` mirrored to MMKV |
| `ui-store` | `{activeLane, scope, search, openSheet, theme, wsConnected, setters}` | `theme/activeLane/scope` → MMKV; rest ephemeral |
| `capture-draft-store` | `{pendingText, pendingPhotos[], pendingVoice, pendingLane, setters, flush()}` | All fields → MMKV (V1 offline queue); MVP in-memory + MMKV on send failure |

**React Query (server state) defaults (S4 §5.2):**

```ts
new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 24 * 60 * 60_000,            // 24h offline read
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
      networkMode: 'offlineFirst',
    },
    mutations: { retry: false },             // user retries explicitly
  },
})
```

Persistence: `persistQueryClient` + `createSyncStoragePersister(MMKV)`.
**Auth token NEVER in MMKV; React Query cache NEVER in SecureStore.**

**15 query hooks + 30 mutation hooks** — full catalogs in §4 + §5 below
(condensed) and S4 §5.3 / §5.4 verbatim.

### 2.6 Networking layer (S4 §6)

**`ky` instance (`src/api/client.ts`):** `prefixUrl: CONFIG.API_URL`, 15 s
timeout, retry idempotent (GET/HEAD) 5xx only with 4 s backoff cap.
Bearer-token injected via `beforeRequest` hook from SecureStore `authToken`.
`X-Client: android-rn` + `X-Client-Version` headers added.

**Typed GET helper:**

```ts
export async function getJson<T extends z.ZodTypeAny>(
  path: string, schema: T, searchParams?: Record<string, string|number>
): Promise<z.infer<T>> {
  const raw = await api.get(path, { searchParams }).json();
  return schema.parse(raw);    // RULE 2 verbatim mirror gate; throws ZodError on drift
}
```

**Auth strategy (S2 §8.1, S4 §6.2):** new `POST /api/auth/native/token`
endpoint exchanges `{email, password, device_label?}` for a long-lived bearer
token tied to `mirror_tokens` row with `scope='native'`. The
`requireUser`/`requireUserOrApiToken` preHandlers are extended to accept
native-scope bearer for ALL routes. **No cookies.**

**Zod envelopes (S4 §6.3, RULE 2 verbatim from S1 §2):**

| Endpoint | Envelope |
|---|---|
| `GET /api/cards`, `/api/cards/archived`, `/api/cards/:id/events`, `/api/users`, `/api/templates`, `/api/notifications`, `/api/mirror/tokens`, `/api/tokens`, `/api/telegram/identities` | **bare array** |
| `GET /api/messages/unread` | **bare object** `Record<cardId, number>` |
| `GET /api/knowledge` | wrapper `{ items: KnowledgeItem[], next_cursor: string \| null }` |
| `GET /api/cards/:id/insights` | wrapper `{ insights: Insight[] }` |
| `GET /api/cards/:id/knowledge` | wrapper `{ items: KnowledgeItem[] }` |
| `GET /api/cards/:id/links` | wrapper `{ links: CardLink[], related_cards: Card[] }` |
| `GET /api/cards/:id/chain` | wrapper `{ nodes: Card[], edges: CardLink[], insights: Insight[] }` |
| `GET /api/review` | wrapper `{ done: Card[], stale: Card[], stuck: Card[], summary: string \| null }` |

**Error mapping (S4 §6.4):** 401 → silent re-auth once via cached creds, then
sign-out + redirect with `pendingDeepLink`; 403 toast; 404 component empty
state; 409 inline; 410 silent FCM cleanup; 413 toast "File too large (max 5 MB)";
415 toast "Unsupported file type"; 429 toast with limit message + Retry-After;
5xx after 2 retries → snackbar + Retry.

**Multipart upload (S4 §6.5):** `postMultipart` helper used by attachments,
from-image, from-audio.

**WebSocket (S4 §6.6):** `new WebSocket(wssUrl, ['bearer.<token>'])`.
Heartbeat: client sends `{type:'ping'}` every 25 s; server discards (S1 §3.3
client→server messages = none); 90 s without inbound = close + reconnect.
State machine `idle→connecting→open→closing→closed→reconnecting` with
exponential backoff `min(500 * 2^attempt, 10_000)` ms.

**Connectivity (S4 §6.7):** `@react-native-community/netinfo` binds React
Query `onlineManager`. Offline UI: TopAppBar grows `cloud_off` icon (S3 §3.2).

### 2.7 Security & secrets (S4 §7)

| Concern | Approach |
|---|---|
| Auth token | `expo-secure-store@14.0.0` → EncryptedSharedPreferences (AES256-GCM hardware-backed on API 29+). Keys allowed: `authToken`, `deviceId` only (runtime `ALLOWED_KEYS` guard) |
| Cache | MMKV (NOT SecureStore — 2 KB cap unfit for cache) |
| AsyncStorage | **Banned via ESLint** `no-restricted-imports` — PR fails if imported |
| Network Security Config | `cleartextTrafficPermitted="false"` on base; dev exception only for `192.168.50.13` in development EAS profile |
| Cert pinning | MVP system trust; V2 `CertificatePinner` (Bare workflow) — deferred due to rotation risk |
| Biometric unlock (V1) | `expo-local-authentication` after >5 min background; configurable in Settings V1 |
| Backup rules | `<full-backup-content>` excludes `sharedpref/SecureStore`, `sharedpref/MMKV`, `database/expo-secure-store.db` — prevents adb-backup token exfil |
| Runtime permissions (lazy at use site) | `CAMERA` (Photo F-125), `RECORD_AUDIO` (Voice F-127), `READ_MEDIA_IMAGES` (Library F-734), `POST_NOTIFICATIONS` (first foreground after sign-in, API 33+) |
| Public env vars | `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_WS_URL`, `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_ENV` (all public by design) |
| Server secrets | OpenAI/OpenRouter/Tavily/Telegram tokens stay server-only (S1 §1.3) — native never knows them. VAPID keys unused (FCM replaces) |
| `google-services.json` | Bundled at build via EAS Secret (`EAS_GOOGLE_SERVICES_JSON`); gitignored |

### 2.8 Push (FCM) (S4 §8, S3 §6)

**3 channels (Notifee owns display, `expo-notifications` only owns headless
background hook):**

| Channel ID | Name | Importance | Used for |
|---|---|---|---|
| `card-activity` | Card activity | HIGH (sound + vibration) | Messages, mentions, AI replies, share announcements |
| `insights` | AI insights | DEFAULT (no sound) | Brainstorm complete |
| `reminders` (V2) | Due-date reminders | HIGH | Local `AlarmManager` scheduled at due_date − 24 h |

**Per-message layout (S3 §6.2):** title `"<ShortName> on <CardTitle>"`; body
≤100 chars with `BigTextStyle`; large icon = sender's hash-colored avatar;
small icon = monochrome SmartKanban mark; group key `card-<card_id>`
(collapses to `InboxStyle`); tap PendingIntent → `kanban://card/<id>`.

**Actions (S3 §6.3):** `Reply` via `RemoteInput` `KEY_TEXT_REPLY` →
background `IntentService` calls `POST /api/cards/:id/messages` → on success
cancel notification; `Mark read` → `PUT /api/cards/:id/events/read`.

**Token lifecycle (S4 §8.2):** request `POST_NOTIFICATIONS` (API 33+) →
ensure channels → `messaging().getToken()` → `POST /api/push/fcm/subscribe
{token, device_id, device_label?}`. `onTokenRefresh` re-subscribes. Sign-out
calls `DELETE /api/push/fcm/subscribe` + `messaging().deleteToken()`.

### 2.9 WebSocket lifecycle (S4 §9, S2 §8.6)

| Trigger | Action |
|---|---|
| App foregrounded **and** authenticated | Connect `wss://APP_URL/ws` with `Sec-WebSocket-Protocol: bearer.<token>` |
| App backgrounded | 30 s grace timer; if still backgrounded, close code 1000 |
| App re-foregrounded within grace | Cancel timer; keep socket |
| Connection drops | Exponential backoff 500 ms → 10 s |
| Auth fails (4401) | Silent re-auth once; second failure → `authStore.signOut()` |
| 90 s without server message | Client ping; if still silent 30 s → reconnect |
| App killed (notif tap / deep link cold-start) | Lazy connect after auth resolves on mount |

WS → React Query cache mutation map: 19 events from S1 §3.2 → `setQueryData`
or `invalidateQueries` per S4 §5.5 (full table in §4 below).

### 2.10 Build config (S4 §10)

| Setting | Value |
|---|---|
| `minSdkVersion` / `targetSdkVersion` / `compileSdkVersion` | 29 / 35 / 35 |
| `buildToolsVersion` | 35.0.0 |
| `versionCode` | auto-increment per EAS Build (`autoIncrement: "version"`) |
| `versionName` | from git tag for release (`v1.2.3` → `1.2.3`); `0.0.0-dev.<sha>` for preview |
| Hermes | enabled |
| R8 / ProGuard | enabled in release; RN-safe `proguard-rules.pro` |
| Signing | Play App Signing via EAS Build managed credentials |
| Architectures | `arm64-v8a`, `armeabi-v7a`, `x86_64` (emulator); `x86` excluded |

**EAS profiles (S4 §12.1):**

| Profile | Env | Channel |
|---|---|---|
| `development` | `EXPO_PUBLIC_API_URL=http://192.168.50.13`, `EXPO_PUBLIC_WS_URL=ws://192.168.50.13` | none (Dev Client) |
| `preview` | `https://kanban-preview.YOUR-DOMAIN` (HTTPS) | `preview` (OTA on every main push) |
| `production` | `https://kanban.YOUR-DOMAIN` (HTTPS) | `production` (manual OTA after tag) |

### 2.11 CI/CD (S4 §11)

| Workflow | Trigger | Gates |
|---|---|---|
| `pr.yml` | PR | `verify:pinned`, lint, typecheck, jest (coverage thresholds §5), Detox smoke (3 tests on Pixel 6 Pro emu API 33), schema-roundtrip |
| `main.yml` | push to main | PR gates + EAS Build preview + EAS Update preview + Detox regression (15 tests on Pixel 8 Pro emu API 35 + Pixel 6 Pro emu API 33) + FTL fan-out on T1-Mid/T2-Vendor/T2-Large |
| `release.yml` | tag `v*` | main gates + EAS Build production + EAS Submit Internal track + manual QA sign-off (§5) + 1× soak run on Pixel 4a |

GitHub Actions + EAS Secrets: `EXPO_TOKEN`, `EAS_GOOGLE_SERVICES_JSON`,
`SENTRY_AUTH_TOKEN`, `ANDROID_PLAY_SERVICE_ACCOUNT_JSON`.

### 2.12 Telemetry (S4 §13)

Sentry 6.4.0 with `tracesSampleRate: 0.1`, ANR detection on by default,
`beforeSend` PII scrub (drops title/body/email/name/content fields). Custom
analytics POST to `/api/telemetry/event` (Stage 5 to add) with events:
`capture.started/completed`, `push.received/tapped`, `card.move`,
`ws.disconnect`, `auth.failed`. **PII rules:** no card titles, no emails,
no message bodies, no card IDs — only counts/durations/categoricals.

---

## 3. Design (from S3 — condensed)

### 3.1 Design language (S3 §1)

**Choice:** Material 3 via `react-native-paper` v5 with custom token overlay
(S4 §1.1 confirmed RN+Paper path).

**Brand seed:** `#6C4CFF` (saturated violet, neighbor of web's `#7C4DFF`).
Both light and dark themes derive from the same seed.

**Color tokens (S3 §1.3 — abbreviated; full table preserved):**

| Token | Light | Dark | Used for |
|---|---|---|---|
| `primary` | `#6C4CFF` | `#C7B2FF` | FAB, primary buttons, active nav tab |
| `onPrimary` | `#FFFFFF` | `#2A1A78` | Text/icon on primary |
| `primaryContainer` | `#E6DFFF` | `#4D3CB8` | Selected chip, lane drop highlight |
| `surface` | `#FBF8F4` (ceramic) | `#161618` | Card background |
| `onSurface` | `#1C1B1F` | `#E6E2DA` | Body text |
| `surfaceVariant` | `#E7E2DB` | `#2A2A2D` | Hairline outlines, dividers |
| `outline` | `#79747E` | `#938F99` | Card outline, input border |
| `error` | `#BA1A1A` | `#FFB4AB` | Destructive, error states |
| `errorContainer` | `#FFDAD6` | `#93000A` | Error banner background |

**Lane accent palette (S3 §1.4):**

| Lane | Light accent | Light bloom (6% α) | Dark accent | Dark bloom (8% α) |
|---|---|---|---|---|
| `backlog` | `#94A3B8` slate | rgba(148,163,184,0.06) | `#7C8FA6` | rgba(124,143,166,0.08) |
| `today` | `#F59E0B` amber | rgba(245,158,11,0.06) | `#FBBF24` | rgba(251,191,36,0.08) |
| `in_progress` | `#6C4CFF` brand violet | rgba(108,76,255,0.06) | `#C7B2FF` | rgba(199,178,255,0.08) |
| `done` | `#10B981` emerald | rgba(16,185,129,0.06) | `#34D399` | rgba(52,211,153,0.08) |

**Typography (S3 §1.5):** Spectral (display/headline/title); Inter (body/label/caption);
JetBrains Mono (mono caption + mono small). Dynamic scale 1.0–1.5x; card
titles cap at 28 sp.

**Motion (S3 §1.7):** `duration.short` 150 ms, `duration.medium` 250 ms,
`duration.long` 400 ms, `spring.gentle` and `spring.snappy` presets, `easing.standard`
= `FastOutSlowInEasing`. **Reduced motion** respects
`Settings.Global.TRANSITION_ANIMATION_SCALE` / `ANIMATOR_DURATION_SCALE` ≤0.5
→ replaces springs with `tween(150, LinearEasing)` fades, disables press
lift, disables shared-axis-Z, replaces F-096 pending pulse with static
"Thinking…" text. **No idle motion anywhere.**

**Iconography (S3 §1.8):** Material Symbols (Rounded variant). **Emoji rule:
NEVER in chrome** (lane headers, buttons, badges, tab labels, empty-state
CTAs). Emoji only inside user-authored content (titles, descriptions, bodies).

**Mascot decision (S3 §1.10 — BINDING):** **NO mascot anywhere in the Android
app, in any state, in any release.** Honors project memory
`feedback_mascot_walle.md` (rejected across four iterations) over the
pipeline brief's softer "optional WALL-E" suggestion. Empty states use
better copy + static line-art glyphs (no animation).

### 3.2 12 Screens (S3 §3)

Each screen specced with ASCII wireframe (preserved in S3), state list, and
F-NNN-keyed interaction tables. Full detail in S3 §3.1–§3.13; here is the
screen catalog:

| # | Screen | F-NNN scope | MVP/V1/V2 | Sections |
|---|---|---|---|---|
| 1 | `LoginScreen` | F-001..F-011 | MVP | brand mark, mode label, full-name (CREATE), short-name, email, password, error banner, submit, mode toggle |
| 2 | `BoardScreen` | F-050..F-110 + F-660..F-680 | MVP | TopAppBar (scope/search/bell/avatar), lane title row, search field, LanePager (HorizontalPager), card list (FlashList of KanbanCard), FAB, NavigationBar |
| 3 | `CaptureSheet` (modal) | F-120..F-131 | MVP | drag handle, lane chip, draft input, mode row (Photo/Template/Voice), send button, helper caption |
| 4 | `CardDetailScreen` | F-150..F-183 + F-720..F-740 | MVP | TopAppBar (back, copyable id chip, chain V2, QR V2, overflow), title, status row, description, tags, due, AI insights, attachments grid, assignees, shares + "Share now", knowledge, timeline, sticky chat input |
| 5 | `AiInsightsCard` (embedded) | F-200..F-215 | MVP | First-run / Pending / Failed / Ok / Ok-degraded variants |
| 6 | `KnowledgeListScreen` | F-540..F-549 + F-570..F-579 | MVP (read+share) | TopAppBar, FlashList of `<KnowledgeRow>`, FAB (V1), NavigationBar |
| 7 | `KnowledgeDetailScreen` | F-600..F-612 | MVP (read-only) | title, URL+host+meta, fetch-error banner, body block (SelectionContainer mono), linked cards, owner actions (V1) |
| 8 | `KnowledgeEditScreen` | F-630..F-639 | MVP (create-via-share) | URL, title, body, tags (V1), visibility radio, auto-fetch checkbox, error caption |
| 9 | `SettingsScreen` | F-440..F-461 | MVP (theme+name) | theme SegmentedButtons, display-name input + save, nested V1/V2 rows |
| 10 | `ArchiveScreen` | F-510..F-519 | V1 | TopAppBar (count + Empty-all), rows with Restore + Delete-forever, empty state |
| 11 | `ShareTargetScreen` | F-547 (Android-native) | MVP | transient (<200 ms) routing screen |
| 12 | `NotificationListScreen` | F-340..F-351 | MVP | TopAppBar (back + Mark-all), list of `<NotificationRow>`, empty state |

**Additional screens spec'd by S5:** `MoreScreen`, `ChainScreen` (WebView,
V2), `WeeklyReviewScreen` (V2). Engineer total = **14 routes** (excluding
embedded AiInsightsCard).

### 3.3 Component states library (S3 §4 + S5 §2)

**12 core components (S3 §4):**

| # | Component | F-NNN | States |
|---|---|---|---|
| 1 | `KanbanCard` | F-090..F-110 | Rest, Pressed, Dragging, Disabled, Pending-AI, Has-unread, Reduced-motion, TalkBack-focused |
| 2 | `LaneHeader` | F-070..F-073 | Default, Active, Drop-target, Dragging-from |
| 3 | `CaptureFab` | F-057 | Rest, Pressed, Disabled-busy, Success-flash, Long-press-menu-open |
| 4 | `AiInsightChip` | F-318 | Queued, Pending, Ok, Applied, Failed, Degraded |
| 5 | `DueBadge` | F-102 | Overdue, Today, Soon, Future, None |
| 6 | `AssigneeAvatarStack` | F-107/F-108 | 1, 2, 3, +N, Empty |
| 7 | `StatusPill` | F-073 | per-lane × Compact/Standard (8 variants) |
| 8 | `AttachmentTile` | F-731 | Loading, Loaded (image/audio/file), Failed, Long-press-open |
| 9 | `Toast/Snackbar host` | F-820..F-824 | Success (2 s), Info (3 s), Error+action (5 s), Persistent |
| 10 | `NotificationRow` | F-346 | Unread, Read, Pressed |
| 11 | `EmptyStateBlock` | — | Loading, Empty, Error |
| 12 | `LoadingSkeleton` | — | CardTile, KnowledgeRow, ListRowGeneric, Avatar, DetailPage (single shimmer cycle, then static; reduced-motion → static from frame 1) |

**12 glue components (S5 §2.13–§2.24):** `LanePager`, `CaptureSheet`,
`ScopePicker`, `SearchBar`, `KnowledgeRow`, `TagChip`, `ChatInput`,
`MessageBubble`, `SuggestionChip` (alias), `ImageLightbox`, `ConfirmDialog`,
`LongPressActionSheet`.

**Total components: 24** (12 core + 12 glue). 48+ visual states across the
core 12 alone.

### 3.4 Interaction patterns (S3 §5)

- **Lane navigation:** `HorizontalPager` with snap; page-settle light-tick haptic; lane title row tap → `ModalBottomSheet` picker.
- **Drag-to-move (V1):** long-press 500 ms → medium-tick haptic + lift (elevation 5, scale 1.02, 0.6 alpha ghost); cross-lane drag past edge auto-advances pager after 600 ms hover; intra-lane reorder via `animateItemPlacement`; trash zone (V1, F-840) appears bottom-center on drag begin; success → `HapticFeedbackConstants.CONFIRM`; failure → snap-back + snackbar Retry.
- **Capture FAB:** tap opens CaptureSheet (text mode); long-press fans 4 mini-FAB chips (Text/Photo/Voice/Template) with 30 ms stagger.
- **Pull-to-refresh:** Material 3 `PullToRefreshContainer` on Board/Knowledge/Archive, 80 dp threshold, system spinner.
- **Swipe actions (V1, list views):** left=archive, right=mark-done; 5 s Undo snackbar.
- **Long-press card on Board:** `MobileCardActions` sheet (Move-to rows / Archive / Cancel).
- **Pinch-zoom image attachment:** lightbox 1x–4x; swipe-down dismisses; left/right between attachments.
- **In-card chat thread:** always-visible; sticky input via `imePadding`; new event → auto-scroll if at bottom, else "New ↓" floating chip; `PUT events/read` on mount + per appended event.
- **AI suggestion chips:** tap → optimistic UI change + `PATCH /api/cards/:id`; transitions to `surfaceVariant` + ✓ prefix after success.
- **System back priority:** modal sheet → lightbox → CardDetail → tab root switches to Board (not exit) → on Board root: confirm exit dialog.
- **Haptic map:** card press light-tick; long-press medium; drag-drop CONFIRM; AI ready two-tick pattern; destructive REJECT; pull-refresh / page-snap light. All gated by device `hapticFeedbackEnabled`.

### 3.5 Notification UX (S3 §6, S4 §8)

3 channels (table above §2.8). Per-message layout: `"<ShortName> on <CardTitle>"`
title + BigTextStyle body + hash-color avatar large icon + monochrome small
icon + `card-<id>` group key. Actions: `Reply` (RemoteInput POST messages) +
`Mark read` (PUT events/read). Insight notification deep-links to AI
Insights section. Reminders (V2) via `AlarmManager`. Badge via
`NotificationManagerCompat.from(context).setBadgeIconType(BADGE_ICON_LARGE)`.

### 3.6 Onboarding + empty states (S3 §7)

- Splash: Android 12+ system `SplashScreen` API; brand mark `K` centered on `surface` background; min 250 ms / max 1 s; one-cycle breath-in/out if longer wait.
- First launch: Splash → LoginScreen SIGN-IN mode by default → after auth, optional onboarding card overlay on Board (FAB hint / lane swipe / long-press) → notification permission prompt.
- Per-lane empty copy (per S3 §3.2): Backlog "Nothing's parked here", Today "Today is open", In Progress "Quiet on the work front", Done "No wins yet".
- Knowledge empty: "Your second brain starts here." Static open-book line-art.
- Notifications empty: "You're all caught up." Static bell line-art.
- Error: red `error_outline` glyph + heading + body + Retry CTA + optional Report (V2 Sentry-like).
- Offline: full-screen "Couldn't reach your board" on first launch; mid-session = silent `cloud_off` icon in TopAppBar.

### 3.7 Accessibility + i18n (S3 §8)

**TalkBack:** every interactive composable has `contentDescription`/`semantics`.
KanbanCard exposes custom actions Open / Move-to-Today / Move-to-In-Progress
/ Archive. Drag handle "Drag to dismiss". FAB "Capture new card". Snackbar
announced via `LiveRegion`. AI suggestion chips spoken as "Suggestion: …
Tap to apply." **Drag has accessibility-action-only path** (required by Play
A11y guidelines).

**Dynamic font scale:** respect `Configuration.fontScale` 1.0–1.5x; clamp
above 1.5x; card titles cap at 28 sp.

**RTL:** layouts use `start`/`end`. MVP English only; layouts RTL-ready.

**High contrast:** when `isHighTextContrastEnabled()`, bump outlines
`surfaceVariant → outline`; hairlines 1 dp → 1.5 dp; captions
`onSurfaceVariant → onSurface`.

**Reduced motion:** see §3.1 motion.

**String externalization:** `strings.xml` for native, `i18next` for RN; no
hard-coded English in components; plurals via `plurals` resources.

**Color-blind safety:** 4 lane accents verified in protanopia/deuteranopia/
tritanopia at ≥4.5:1; color is never sole signal (lane accent + dot
position + lane name).

---

## 4. Engineering (from S5 — condensed)

### 4.1 12-phase build order (S5 §1)

| Phase | Goal | F-NNN shipped | Routes (key) | Journeys | Backend BLOCKERS | Days |
|---|---|---|---|---|---|---|
| 0 | Project scaffold | none (infra) | none | none | — | 2 |
| 1 | Design tokens + theme | none (theme infra) | none | none | — | 2 |
| 2 | Auth + bearer-token bootstrap | F-001..F-011 | POST `/api/auth/native/token` (NEW), `/register`, `/login`, `/logout`, `/me` | J1 | **3** (B-001 endpoint, B-002 CHECK constraint, B-003 requireUser ext) | 3 |
| 3 | API client + zod schemas | none (infra) | all 51 (definitions) | none | — | 3 |
| 4 | Board MVP read-only | F-050, F-056, F-057, F-070..F-073, F-074, F-075, F-077, F-090..F-110, F-665, F-666, F-669, F-670, F-671 | `GET /api/cards`, `GET /api/messages/unread`, `GET /api/users` | partial J4 (read) | — | 3 |
| 5 | WebSocket integration | F-678, F-991, F-980..F-985 | `GET /ws` | reconciliation leg of all | **1** (B-004 WS bearer subprotocol) | 2 |
| 6 | Capture flow MVP | F-120..F-131, F-547, F-867 | POST `/api/cards`, `/from-image`, `/api/knowledge`, GET `/api/templates`, POST `/instantiate` | J2, J3, partial J1 | — | 3 |
| 7 | Card detail + chat MVP | F-152, F-153, F-155, F-157, F-161..F-163, F-165..F-170, F-171, F-172, F-173..F-180, F-182, F-183, F-310..F-327, F-720..F-740 | GET `/api/cards/:id`, PATCH, `/events`, POST `/messages`, PUT `/events/read`, GET `/knowledge`, link/unlink, POST `/attachments`, DELETE | J4, J5 (mention round-trip) | — | 4 |
| 8 | AI Insights | F-200..F-215, F-318, F-989 | POST `/insights/brainstorm`, GET `/insights`, GET `/insights/:id` | J6 | — | 2 |
| 9 | Card extras (V2 pre-flight) | F-153, F-154, F-158..F-160, F-163, F-230..F-237, F-250..F-260 | GET `/links`, `/chain`, POST/DELETE `/links`, GET `/qr.svg`, POST `/from-card/:id` | chain nav, QR handoff | — (App-Links needs bearer flow from P2) | 3 |
| 10 | FCM push end-to-end | F-342, F-863..F-865, F-868..F-870 | POST/DELETE `/api/push/fcm/subscribe` (NEW), POST `/messages` (from RemoteInput), PUT `/events/read` | J5 push leg | **5** (B-005..B-008 + fcm table, firebase-admin, fan-out, test ping) | 3 |
| 11 | Knowledge tab (read + share-create) | F-547..F-549, F-570..F-579, F-600..F-606, F-630..F-639 | GET `/api/knowledge?...`, GET `/:id`, POST `/api/knowledge` | J2 completion | — | 2 |
| 12 | Polish + V1 closure | F-440..F-461, F-510..F-519, F-410..F-420 (feature-flagged), F-051/F-053/F-110 drag, F-840..F-842 trash, F-127 voice (BLOCKER), V1 biometric, F-820..F-824 toasts, F-461+F-480..F-495 templates CRUD | `/archived`, `/restore`, `/permanent`, `/purge`, `/from-audio` (NEW), `/templates*`, `/api/auth/me PATCH`, `/api/review` | voice path of J1, archive paths | **1** (B-009 audio endpoint + AUDIO_MAX_BYTES + MIME list extension) | 5 |
| **Total** | | | | | **10** items across 7 prereqs (de-dupe → 7 distinct backend prereqs per S4 §15.1, +1 from S6 §15.5 for test-seed = **8** in §7) | **37** |

### 4.2 Component implementation specs (S5 §2 — 24 components)

Each component specced with file path, props interface, internal state,
hooks used, render tree, visual-state-to-implementation map, a11y semantics,
Reanimated patterns, memoization, and test plan. See S5 §2 for the full
detail. Component count breakdown:

- **Core (S3 §4):** 12 — `KanbanCard`, `LaneHeader`, `CaptureFab`, `AiInsightChip`, `DueBadge`, `AssigneeAvatarStack`, `StatusPill`, `AttachmentTile`, `Toast`/Snackbar host, `NotificationRow`, `EmptyStateBlock`, `LoadingSkeleton`.
- **Glue (S3 §3 implied):** 12 — `LanePager`, `CaptureSheet`, `ScopePicker`, `SearchBar`, `KnowledgeRow`, `TagChip`, `ChatInput`, `MessageBubble`, `SuggestionChip` (alias), `ImageLightbox`, `ConfirmDialog`, `LongPressActionSheet`.

### 4.3 Screen implementation specs (S5 §3 — 14 screens)

Each screen specced with file path (Expo Router file), route params, data
deps (which React Query hooks), layout, sections, RULE 9 verb-check table
(per F-NNN row → mounted component verb), loading/empty/error/success states,
haptic + animation map, WS subscriptions (filtered to current entity id),
optimistic mutations, navigation in/out, tests. **14 routes** total (incl.
`ChainScreen` V2 + `WeeklyReviewScreen` V2 + embedded `AiInsightsCard`
spec'd as a Screen-grade artifact per S5 §3.15).

### 4.4 API service layer (S5 §4 — 51 endpoints)

Every Stage 5 hook cites server file:line from S1 §2 (RULE 1 pre-flight
artifact). Resource files: `auth.ts`, `cards.ts`, `knowledge.ts`,
`insights.ts`, `templates.ts`, `notifications.ts`, `push.ts`, `review.ts`,
`tokens.ts`, `attachments.ts`. Endpoint count by group (from S1 §2.14
preserved):

| Group | Endpoints |
|---|---|
| auth | 6 (incl. new `POST /api/auth/native/token`) |
| cards (incl. links/chain/chat/qr/attachments_upload) | 19 |
| insights | 3 |
| knowledge | 9 |
| templates | 5 |
| mirror tokens | 3 |
| api tokens | 3 |
| telegram (HTTP) | 4 (server-side; client uses only `/api/telegram/*` 3 V2 routes) |
| notifications + push | 6 (incl. new `POST/DELETE /api/push/fcm/subscribe`) |
| review | 1 |
| attachments (static) | 1 |
| WebSocket | 1 |
| health | 1 |
| **Total** | **51** + 2 NEW endpoints + 1 NEW audio endpoint |

### 4.5 Zustand stores (S5 §5 — 3 stores)

Full TypeScript interfaces preserved in S5 §5; see §2.5 above. Selectors use
`useShallow` from Zustand 5.

### 4.6 React Query hooks (S5 §6 — 15 queries + 30 mutations)

**15 queries (query keys preserved verbatim):**

| Hook | Query key | Endpoint | Stale | WS invalidation |
|---|---|---|---|---|
| `useCards(scope, project?)` | `['cards', scope, project]` | GET `/api/cards?...` | 30 s | `card.created/updated/deleted` |
| `useArchive()` | `['cards', 'archived']` | GET `/api/cards/archived` | 60 s | — |
| `useCard(id)` | `['card', id]` | GET `/api/cards/:id` | 30 s | `card.updated/deleted` (id match) |
| `useCardEvents(id)` | `['card', id, 'events']` | GET `/api/cards/:id/events` | 0 (refetch on focus) | `card.message/ai_response` |
| `useUnreadCounts()` | `['messages', 'unread']` | GET `/api/messages/unread` | 30 s | `card.message/ai_response` |
| `useCardKnowledge(id)` | `['card', id, 'knowledge']` | GET `/api/cards/:id/knowledge` | 30 s | `knowledge.link.created/deleted` |
| `useInsights(cardId)` | `['card', cardId, 'insights']` | GET `/api/cards/:id/insights` | 30 s | `insight.queued/updated/failed` |
| `useInsight(id)` | `['insight', id]` | GET `/api/insights/:id` | 30 s | — |
| `useKnowledge(scope, q, tag, cursor)` | `['knowledge', scope, q, tag, cursor]` | GET `/api/knowledge?...` (cursor) | 60 s | `knowledge.created/updated/deleted` |
| `useKnowledgeItem(id)` | `['knowledge', id]` | GET `/api/knowledge/:id` | 60 s | `knowledge.updated/link.*` (id match) |
| `useTemplates()` | `['templates']` | GET `/api/templates` | 5 min | `template.created/updated/deleted` |
| `useNotifications()` | `['notifications']` | GET `/api/notifications` | 30 s | `card.message/ai_response` |
| `useUsers()` | `['users']` | GET `/api/users` | 10 min | — |
| `useReview()` | `['review']` | GET `/api/review` | 5 min | — |
| `useTokens()` / `useMirrorTokens()` (V2) | `['tokens']` / `['mirror-tokens']` | GET `/api/tokens` / `/api/mirror/tokens` | on-demand | — |

**30 mutations with optimistic patterns** (S4 §5.4 full table preserved):

| Mutation | Endpoint | Optimistic | Rollback |
|---|---|---|---|
| `createCard` | POST `/api/cards` | Prepend stub to `['cards', scope]` with temp id | Remove stub; toast |
| `patchCard` | PATCH `/api/cards/:id` | Merge into `['card', id]` + `['cards', scope]` | Restore prior snapshot |
| `archiveCard` | DELETE `/api/cards/:id` | Remove from `['cards', scope]` | Re-insert at original index |
| `restoreCard` | PATCH `/api/cards/:id/restore` | Remove from `['cards', 'archived']` | Re-insert |
| `deleteCardPermanent` | DELETE `/api/cards/:id/permanent` | Remove from archived | Re-insert |
| `purgeArchived` | POST `/api/cards/archived/purge` | Clear archived | Restore on error |
| `uploadAttachment` | POST `/api/cards/:id/attachments` | Append placeholder tile | Remove placeholder |
| `cardFromImage` | POST `/api/cards/from-image` | Prepend stub `needs_review:true` | Remove |
| `cardFromAudio` (V1) | POST `/api/cards/from-audio` (NEW) | Same | Same |
| `postMessage` | POST `/api/cards/:id/messages` | Append event with temp id | Remove; preserve input text |
| `markEventsRead` | PUT `/api/cards/:id/events/read` | Decrement `['messages', 'unread'][id]` | Restore |
| `enqueueInsight` | POST `/insights/brainstorm` | Prepend pending insight | Remove |
| `createKnowledge` | POST `/api/knowledge` | Insert head of `['knowledge', scope]` | Remove |
| `patchKnowledge` (V1) | PATCH `/api/knowledge/:id` | Merge | Restore |
| `archiveKnowledge` (V1) | DELETE `/api/knowledge/:id` | Remove | Re-insert |
| `linkKnowledgeToCard` | POST `/api/knowledge/:id/links` | Append to `['card', cardId, 'knowledge']` | Remove |
| `unlinkKnowledge` (V1) | DELETE `/api/knowledge/:id/links/:cardId` | Remove | Re-insert |
| `refetchKnowledge` (V1) | POST `/api/knowledge/:id/refetch` | `fetch_status='pending'` | Restore |
| `createTemplate` (V1) | POST `/api/templates` | Append to `['templates']` | Remove |
| `instantiateTemplate` | POST `/api/templates/:id/instantiate` | Prepend Card stub | Remove |
| `markNotificationsRead` | PUT `/api/notifications/read` | Set `read:true` on entries | Revert |
| `markAllNotificationsRead` | PUT `/api/notifications/read-all` | Set all `read:true` | Revert |
| `subscribeFcm` | POST `/api/push/fcm/subscribe` (NEW) | none | toast |
| `unsubscribeFcm` | DELETE `/api/push/fcm/subscribe` (NEW) | none | toast |
| `createMirrorToken` (V2) | POST `/api/mirror/tokens` | none | toast |
| `deleteMirrorToken` (V2) | DELETE `/api/mirror/tokens/:token` | Remove from list | Restore |
| `createApiToken` (V2) | POST `/api/tokens` | none | toast |
| `deleteApiToken` (V2) | DELETE `/api/tokens/:token` | Remove | Restore |
| `register` | POST `/api/auth/register` | none | none |
| `login` / `nativeToken` | POST `/api/auth/login` / `/api/auth/native/token` (NEW) | none | none |

### 4.7 WebSocket module (S5 §7)

State machine `idle→connecting→open→closing→closed→reconnecting`. Backoff
`min(500 * 2^attempt, 10_000)` ms; reset on `hello`. Ping every 25 s; 90 s
silence → reconnect. Auth = `Sec-WebSocket-Protocol: bearer.<token>`.

**19 event handlers (S4 §5.5 map preserved verbatim; complete table):**

| WS `type` | Cache action |
|---|---|
| `hello` | `ui.setWsConnected(true)` |
| `card.created` | `setQueryData(['cards', scope])`: prepend; invalidate other scopes |
| `card.updated` | replace by id in `['cards', scope]` + merge `['card', id]` |
| `card.deleted` | filter out; clear `['card', id]`; if focused → snackbar + nav back |
| `card.message` | append to `['card', id, 'events']`; increment `['messages', 'unread'][id]` |
| `card.ai_response` | same as `card.message` |
| `card.link.created` (V2) | invalidate `['card', from_card_id, 'links']` + `[to_card_id]` |
| `card.link.deleted` (V2) | same |
| `template.created` | prepend to `['templates']` |
| `template.updated` | replace by id |
| `template.deleted` | remove |
| `knowledge.created` | insert into `['knowledge', 'mine']` (+ `['knowledge', 'inbox']` if applicable) |
| `knowledge.updated` | replace |
| `knowledge.deleted` | remove |
| `knowledge.link.created` | invalidate `['card', card_id, 'knowledge']` + `['knowledge', knowledge_id]` |
| `knowledge.link.deleted` | same |
| `insight.queued` | prepend to `['card', card_id, 'insights']` |
| `insight.updated` | replace by id |
| `insight.failed` | replace by id (`status='failed'`) |

Event union typed via `zod.discriminatedUnion('type', ...)` — RULE 2 drift
fails closed.

### 4.8 FCM push module (S5 §8)

`src/push/fcm.ts` (init + token + refresh + teardown), `src/push/channels.ts`
(3 channels), `src/push/handler.ts` (foreground via `messaging().onMessage`,
background via `setBackgroundMessageHandler`, tap + RemoteInput via Notifee
`onForegroundEvent`/`onBackgroundEvent`). RemoteInput Reply background
handler reads `input` payload → `POST /api/cards/:id/messages` → cancel
notification on success. Tap routes via `router.push('/board/:id')` or
`/knowledge/:id` from `data.cardId`/`knowledgeId`.

AndroidManifest emitted via Notifee config plugin:

```xml
<service android:name="io.invertase.firebase.messaging.ReactNativeFirebaseMessagingService"
         android:exported="false">
  <intent-filter><action android:name="com.google.firebase.MESSAGING_EVENT"/></intent-filter>
</service>
<receiver android:name="app.notifee.core.ForegroundService"/>
```

### 4.9 Share intent handler (S5 §9)

`src/share/intent-parser.ts` parses `{mime, text, subject, uri}` → `CaptureDraft`
or `KnowledgeDraft`. AndroidManifest:

```xml
<intent-filter>
  <action android:name="android.intent.action.SEND"/>
  <category android:name="android.intent.category.DEFAULT"/>
  <data android:mimeType="text/plain"/>
  <data android:mimeType="image/*"/>
</intent-filter>
```

`app/share-target.tsx` calls `parseShareIntent` and `router.replace` to
`/knowledge/edit` or `/capture`.

### 4.10 Storage layers (S5 §10)

| Layer | File | Used for |
|---|---|---|
| SecureStore | `src/storage/secure.ts` (EncryptedSharedPreferences) | `authToken`, `deviceId` ONLY (runtime `ALLOWED_KEYS` guard) |
| MMKV cache | `src/storage/cache.ts` | React Query persistence, theme, last lane/scope, capture-draft fallback |
| Query persister | `src/storage/persister.ts` | `createSyncStoragePersister` over MMKV, `throttleTime: 1_000` |
| ESLint ban | `.eslintrc.js` | `no-restricted-imports` for `@react-native-async-storage/async-storage` |

### 4.11 RULE-compliance checklists (S5 §11) — must be filled in per PR

- **RULE 1 — Pre-flight:** for every endpoint hook, `grep -nE '<METHOD>.*<path>' server/src/routes/*.ts` confirms route exists at cited line; cross-check `web/src/api.ts` for shape drift.
- **RULE 2 — Verbatim mirror:** bare-array → `z.array(X)`; bare-object Record → `z.record(k, v)`; wrapper → `z.object({...})`. Fixtures test fail-closed.
- **RULE 3 — Concurrency (RN translation):** no fire-and-forget promises; `AbortController` instead of `Promise.race`; React Query `useMutation` over ad-hoc `fetch` in `useEffect`; single WS reconnect timer; idempotent FCM `onTokenRefresh`; effects cancel in-flight via `AbortSignal` on unmount.
- **RULE 9 — Verb verification:** every "button/chip/toggle/tap" mounts real `Pressable`/`Button`/`Chip`/`IconButton`/`TextButton` with `onPress`; long-press uses `Pressable onLongPress` or gesture handler; swipe via `Swipeable`/`PanGestureHandler`; drag via long-press detector + Reanimated shared values; no decorative `<View>` posing as a button.
- **RULE 13 — Decompose containers:** parent composables mount named children (not anonymous inline render functions); each child independently snapshot-tested; no file >300 LOC.
- **RULE 16 — Post-edit grep:** before commit, on every touched file: `grep -nE 'AsyncStorage|setTimeout\(.*0\)|/\* TODO\*/'` = 0; `grep -nE 'await fetch\('` only in `src/api/client.ts`; flag any `as any`; `npm run lint && npm run typecheck && npm test -- --findRelatedTests <files>` green; `npm run verify:pinned` exits 0.

### 4.12 Test plan summary (defer detail to §5)

Per S5 §12: unit (Jest + RTL, coverage thresholds in §5 below), integration
(Jest + msw, full-screen mount), E2E (Detox 20.32 on Pixel 6 Pro emu API 33
+ Pixel 8 Pro emu API 35), snapshot (theme tokens + screens + components ×
states). **6 E2E journey tests** map 1:1 to S2 §5 journeys.

---

## 5. QA Plan (from S6 — condensed)

### 5.1 Device matrix (S6 §1)

| Tier | Device | OS / API | RAM | Year | Justification |
|---|---|---|---|---|---|
| **T1-Primary** | Pixel 8 | Android 15 / API 35 | 8 GB | 2023 | Modern flagship, canonical reference for performance metrics (S2 §6 cold-start <3.5 s). Replaces Pixel 6a (out of retail). |
| **T1-Mid (OEM skin)** | Samsung Galaxy A54 5G | Android 14 / API 34 | 8 GB | 2023 | One UI 6 quirks: split-screen, Edge Panels back-swipe, Samsung Keyboard IME padding, aggressive FCM battery optimization |
| **T1-Floor** | Pixel 4a | Android 13 / API 33 (lab-rooted) | 6 GB | 2020 | Performance floor at `minSdkVersion=29`. RN 0.76 + Hermes + Reanimated 3 budget validation. Fallback: Samsung Galaxy A14 API 33 / 4 GB |
| **T2-Vendor** | Xiaomi Redmi Note 12 | Android 13 / API 33 + MIUI 14 | 4 GB | 2023 | MIUI aggressive auto-start manager kills background FCM; tests vendor-restriction survival |
| **T2-Large screen** | Pixel Tablet | Android 14 / API 34 | 8 GB | 2023 | Validates non-regression on large screens (tablet split-view explicit non-goal MVP, but layouts must not break) |

**Test environment per device:** T1-Primary physical + FTL emu; T1-Mid FTL
physical pool; T1-Floor physical (perf budget non-negotiable); T2-Vendor FTL
Robo physical pool; T2-Large FTL.

### 5.2 CI gates (S6 §2)

| Workflow | Threshold |
|---|---|
| **PR (`pr.yml`)** | lint 0 errors; typecheck 0 errors; `verify:pinned` exits 0; jest coverage (`src/api/` ≥80%, `src/state/` ≥80%, `src/components/` ≥70%, `src/utils/` ≥80%); Detox smoke (3 tests, <5 min) on Pixel 6 Pro emu API 33 100% pass; schema-roundtrip parses + drift-mutation fails |
| **main (`main.yml`)** | PR gates + EAS Build preview + EAS Update preview + Detox regression (15 tests, ~30 min) on Pixel 8 Pro emu API 35 + Pixel 6 Pro emu API 33 + FTL fan-out on T1-Mid/T2-Vendor/T2-Large |
| **release (`v*` tag)** | main gates + EAS Build production (AAB) + EAS Submit Internal + Manual QA sign-off (§5.7) + Soak run on Pixel 4a physical (~2 h) |

**Coverage budget (per surface):** `src/api/` ≥80%, `src/state/` ≥80%,
`src/components/` ≥70%, `src/utils/` ≥80%, `src/hooks/` ≥70% (advisory MVP,
hard V1), `src/ws/ /push/ /share/` ≥70%, `app/` screens covered by RTL
integration + Detox smoke (no line-coverage gate).

### 5.3 Unit / integration / E2E test counts (S6 §3–§5)

| Tier | Count | Notes |
|---|---|---|
| **Per-component snapshot+behavior** | 24 components × ~5 visual states avg = ~120 snapshots + 24+ behavior tests | per S3 §4 + S5 §2 |
| **Per Zustand store** | 3 stores × full action coverage + persistence + reset tests | per S5 §5 |
| **Per React Query hook** | 15 query hooks + 30 mutations (sample 12 most critical detailed in S6 §3.3) | per S5 §6 |
| **Per zod schema** | 14 fixtures with fail-closed drift mutation tests | per S5 §3 |
| **Integration (msw + screen)** | 14 screen × primary interaction + WS + mutation + error path | per S5 §3 |
| **E2E (Detox)** | Smoke 3 (PR) + Regression 15 (main) + Soak 1 (nightly Pixel 4a) | per S6 §5.3 |
| **Journeys covered E2E** | **6 / 6** — J1 login.test.ts, J2 share-target.test.ts, J3 capture-photo.test.ts, J4 move-card-drag/sheet.test.ts, J5 ai-chat.test.ts, J6 brainstorm.test.ts | per S2 §5 |

### 5.4 Performance tests (S6 §6 — measured on Pixel 4a unless noted)

| Metric | Target | Measurement |
|---|---|---|
| Cold start to Board visible | < 3.5 s (S2 §6) | `react-native-performance` markers + Sentry trace; CI via Detox |
| Capture funnel text | < 4 s (S2 §6) | Detox tap-to-card-visible delta |
| Capture funnel photo | < 8 s (S2 §6) | Detox |
| Drag-to-move latency | < 250 ms | timestamps `onDragEnd` → next frame paint |
| Memory steady-state | < 200 MB after 30 min | `adb shell dumpsys meminfo` every 5 min in soak |
| APK base / aggregate size | < 25 MB / < 40 MB | EAS Build size report; CI fails on >40 MB |
| WS reconnect | < 3 s | Detox: disable+enable connectivity |
| Cold-start WS handshake | < 800 ms | Sentry trace |
| Crash-free sessions | > 99.5% | Sentry/Crashlytics 30-day rolling |
| ANR rate | < 0.5% | Play Console |
| Push deliverability | > 95% within 30 s | 4 h synthetic ping |
| Notification permission grant | > 70% first prompt | Sentry events |

**Regression budget:** measure on every main push via FTL game-loop; >15%
regression from 7-day median → CI warn; >30% → CI block.

### 5.5 Push notification test plan (S6 §7) — 3 channels × 4 states

| Channel | Foreground | Background | Quit-state | RemoteInput |
|---|---|---|---|---|
| `card-activity` | ✅ in-app snackbar + Notifee | ✅ system notif + group key | ✅ cold-start to deep link <2 s | ✅ Reply posts message |
| `insights` | ✅ tap → AI Insights section | ✅ silent (DND respect) | ✅ | n/a |
| `reminders` (V2) | ✅ | ✅ | ✅ | ✅ Snooze 1h reschedules |

**FCM token lifecycle tests:** first auth grant → subscribe POST; token
refresh → re-POST; sign-out → DELETE + `deleteToken()`; server 410 →
auto-delete row.

**adb test harness** preserved in S6 §7.3 (synthetic FCM broadcast, channel
state inspection, deep-link injection, force-stop + cold push, FCM REST API
direct send).

### 5.6 Accessibility test plan (S6 §8)

| Pillar | Test |
|---|---|
| TalkBack navigability | Every screen logical reading order; no orphan focus |
| Labels | Every IconButton/FAB/Chip/KanbanCard/sheet-handle has `accessibilityLabel` + `accessibilityRole` |
| Custom actions | KanbanCard exposes Open / Move-to-Today / Move-to-IP / Archive via `accessibilityActions` |
| Drag a11y-only path | TalkBack-only move via custom actions (Play A11y mandate) — completes without gesture |
| LiveRegion | Snackbar auto-announced |
| Dynamic font scale | Render each of 14 screens at 1.0/1.15/1.3/1.5x (56 snapshots) — no clipping, no overlap, titles cap at 28 sp |
| High contrast | 5 key screens with `isHighTextContrastEnabled()` — outlines bumped, captions ≥4.5:1 |
| Color-blind | 4 lane accents tested in protanopia/deuteranopia/tritanopia ≥4.5:1; color never sole signal |
| Reduced motion | Snapshots with `useReducedMotion=true`: KanbanCard outline-only press, sheet cross-fade, AiInsightsCard static "Thinking…", skeleton static, page cross-fade |
| Keyboard nav (V1+) | External BT keyboard: Tab traversal, Enter activates, Esc dismisses modals; MVP smoke on LoginScreen + BoardScreen |

### 5.7 Visual parity test (S6 §9) — RULE 12 / RULE 14

Procedure: capture web baseline (Chrome mobile shell on Pixel 8) +
native screenshot per route → manual diff → catalog every divergence
(`qa-reports/visual-parity-v<version>.md`) → sign-off blocks tag `v*` if any
unjustified diff is open. 14 screens in scope; adapted (🔄) elements per S2
parity matrix MUST have written justification.

MVP recommendation: manual; V1 adds Percy on 5 stable screens (LoginScreen,
BoardScreen, CardDetailScreen, KnowledgeListScreen, NotificationListScreen).

### 5.8 Security test plan (S6 §10 — 8 adb-based tests)

| # | Test | Expected |
|---|---|---|
| 1 | Token storage plaintext check (`adb shell run-as ... cat shared_prefs/*.xml | grep token`) | No plaintext; opaque blobs only |
| 2 | OkHttp logcat `Authorization:` leak | No cleartext bearer in logcat |
| 3 | `adb backup` exclusion (`<full-backup-content>`) | SecureStore + MMKV NOT included |
| 4 | Cleartext HTTP rejection (production build) | `CleartextNotPermittedException` |
| 5 | MITM with self-signed cert | App rejects (system trust only; no user-installed certs) |
| 6 | Lazy runtime permissions | CAMERA/RECORD_AUDIO/READ_MEDIA_IMAGES/POST_NOTIFICATIONS only prompted at use site |
| 7 | Deep-link injection (SQL/path-traversal/base64) | No crash; coerced to string; backend 404 via 22P02 handler |
| 8 | R8/ProGuard regression | Smoke + regression Detox packs pass on minified build; Sentry symbolicates |

### 5.9 Per-phase acceptance criteria (S6 §11 — 12 phases × evidence-required)

Every phase has explicit checkboxes with **evidence required** (screenshot /
log / test pass output). QA signs off in the phase manifest before next
phase begins. See S6 §11 verbatim for the per-phase checklist; representative
examples:

- **P0 Scaffold:** `verify:pinned` exits 0; APK opens within 3 s on Pixel 8; Detox+Expo Router spike: 1 login test passes (or Maestro fallback documented per §15.4).
- **P2 Auth:** Backend prereqs verified (curl + `psql \d mirror_tokens`); token survives cold-start; sign-out clears SecureStore (§5.8 adb dump).
- **P5 WS:** All 19 events route correctly (CI log of `__tests__/ws/events.test.ts`); auto-reconnect 500ms→10s; `cloud_off` icon on disconnect; desktop create → native reconciles within 2 s.
- **P10 FCM:** Backend prereqs verified (`fcm_subscriptions` table; subscribe/unsubscribe; `firebase-admin` init; `pushToUser` fan-out); 3 channels × 4 states (table §5.5); push deliverability >95% within 30 s over 100 sends.
- **P12 V1 closure:** Audio endpoint verified; parity ≥ 80% per S2 §6 (audit script output); §5.10 manual checklist signed.

### 5.10 Manual QA one-pager (S6 §12)

Run before promoting Play Internal → Closed → Production. Sections: install/upgrade,
auth, capture (J1/J2/J3), board, card detail (chat/AI/edit), knowledge,
settings, notifications (3 channels × 4 states matrix), accessibility,
security adb checks, performance (cold-start <3.5 s, capture <4 s, photo <8 s,
drag <250 ms, APK <25 MB, memory <200 MB after 30 min, WS reconnect <3 s),
sign-off (name/date/commit/outcome). Outcome must be **Ready to promote**;
**Block** rolls back or hotfixes.

### 5.11 Bug triage & SLAs (S6 §13)

| Severity | Definition | SLA | Hotfix path |
|---|---|---|---|
| **P0** | Crash / data loss / auth lock-out | Block release; immediate | JS-only → EAS Update OTA (hours); native → EAS Build + Play Internal patch <24 h |
| **P1** | Critical journey (J1–J6) broken | Block release; fix in next dot release <7 days | EAS Update OTA if JS; native dot release if Kotlin |
| **P2** | Polish / UX paper cut | Backlog; next minor | Minor release cadence |
| **P3** | Edge case <1% sessions | Backlog; no SLA | Opportunistic |

Bug template: title, severity, repro steps (numbered, adb commands), expected
vs actual, screenshot/recording, device (§5.1), build commit, Sentry link,
F-NNN scope, journey affected (J1–J6 or "non-journey"), workaround.

### 5.12 Test data fixtures (S6 §14)

**Seeded backend test user:** `qa-user@kanban.test` / `qa-password-do-not-use-in-prod`,
short_name `QA`. Reset script `scripts/qa-seed.sh` calls server-side
`/api/_test/seed` (NEW backend prereq — see §7 B-008) which deletes all
cards/knowledge for the user and re-seeds 20 cards across 4 lanes (5 each)
+ 5 knowledge items + 1 archived + 1 needs_review + 1 linked-KB + 1 with
3 unread + 1 with pending insight. Gated by `X-Test-Auth` header + `NODE_ENV !== 'production'`.

**FCM test sender per env:** dev `smartkanban-dev` topic `/topics/qa-test`;
preview `smartkanban-preview` `/topics/qa-test-preview`; production
`smartkanban-prod` `/topics/qa-synthetic`. **3 separate Firebase projects
recommended (S6 §15.3)** to prevent dev push leaking to real prod users.

**18 fixture files** stored at `__tests__/fixtures/<resource>-<endpoint>.json`
covering every distinct envelope shape (bare-array / bare-object / wrapper);
captured once via curl from seeded dev backend; version-controlled. Includes
binary attachment fixtures for image/audio cap testing.

---

## 6. Inventory Reference (from S1 — condensed)

Full detail in `ANDROID_PLAN_S1_ANALYST.md`. Quick reference:

### 6.1 Backend routes (S1 §2 — 51 total)

| Group | Count | Sample |
|---|---|---|
| auth | 6 | `POST /api/auth/{register, login, logout}`, `GET/PATCH /api/auth/me`, `GET /api/users` |
| cards (incl. links/chain/chat/qr/attachments) | 19 | `GET/POST /api/cards`, `PATCH /:id`, `/:id/restore`, `/:id/permanent`, `/archived`, `/from-image`, `/:id/attachments`, `/:id/messages`, `/:id/events`, `/:id/events/read`, `/:id/knowledge`, `/:id/links*`, `/:id/chain`, `/:id/qr.svg`, `/:id/activity` (api-token), `/messages/unread` |
| insights | 3 | `POST /:id/insights/brainstorm`, `GET /:id/insights`, `GET /api/insights/:id` |
| knowledge | 9 | `GET/POST /api/knowledge`, `GET/PATCH/DELETE /:id`, `POST /:id/refetch`, `POST /:id/links`, `DELETE /:id/links/:cardId`, `POST /from-card/:id` |
| templates | 5 | full CRUD + `POST /:id/instantiate` |
| mirror tokens (V2) | 3 | `POST/GET /api/mirror/tokens`, `DELETE /:token` |
| api tokens (V2) | 3 | `POST/GET /api/tokens`, `DELETE /:token` |
| telegram (HTTP) | 4 | webhook + `POST /api/telegram/link`, `GET/DELETE /api/telegram/identities*` |
| notifications + push | 6 | `GET /api/notifications`, `PUT /read`, `PUT /read-all`, `POST/DELETE /api/push/subscribe` (web-push), `GET /api/push/vapid-public-key` (unused by native) |
| review (V2) | 1 | `GET /api/review` |
| attachments static | 1 | `GET /attachments/<storage_path>` (session\|mirror auth) |
| WebSocket | 1 | `GET /ws` |
| health | 1 | `GET /health` |
| **TOTAL** | **51** | + 3 NEW endpoints for Android: `POST /api/auth/native/token`, `POST/DELETE /api/push/fcm/subscribe`, `POST /api/cards/from-audio` |

### 6.2 WS events (S1 §3.2 — 19 events)

`hello`, `card.{created,updated,deleted,message,ai_response,link.created,link.deleted}`,
`template.{created,updated,deleted}`,
`knowledge.{created,updated,deleted,link.created,link.deleted}`,
`insight.{queued,updated,failed}`.

All payloads JSON `{type, ...}`. Server-side visibility filtering already
enforced (S1 §5.7); client does NOT re-filter.

### 6.3 Data model (S1 §4 — 18 tables)

| Group | Tables |
|---|---|
| Auth / identity | `users`, `sessions`, `mirror_tokens` (CHECK extended for `scope='native'`), `telegram_identities` |
| Cards | `cards`, `card_assignees`, `card_shares`, `card_attachments`, `card_events`, `card_event_reads`, `card_links` |
| Knowledge | `knowledge_items`, `knowledge_shares`, `knowledge_card_links` |
| Templates | `card_templates` |
| AI | `ai_insights` |
| Notifications | `notifications`, `push_subscriptions` (web-push) |

**NEW table for Android:** `fcm_subscriptions(id, user_id, fcm_token UNIQUE,
device_id, device_label, created_at, last_seen_at)` + `idx_fcm_sub_user`.

### 6.4 Auth & visibility predicate (S1 §5)

Session cookie `kanban_session` 30 d (httpOnly, sameSite=lax,
secure=APP_URL.startsWith('https://') or `COOKIE_SECURE=true`). argon2id
hashing. Bearer API tokens (`scope='api'`) write capability via
`Authorization: Bearer`. Mirror tokens (`scope='mirror'`) read-only via
`X-Mirror-Token` header or `?mirror=` WS query.

**NEW for Android:** `scope='native'` bearer tokens via `POST /api/auth/native/token`
extend `requireUser` to accept ALL routes.

**Visibility predicate (canonical SQL fragment, mirrored client-side at
`src/utils/visibility.ts`):**

```sql
(
  c.created_by = $1
  OR EXISTS (SELECT 1 FROM card_assignees WHERE card_id = c.id AND user_id = $1)
  OR EXISTS (SELECT 1 FROM card_shares    WHERE card_id = c.id AND user_id = $1)
  OR NOT EXISTS (SELECT 1 FROM card_assignees WHERE card_id = c.id)        -- Family Inbox
)
```

### 6.5 Business rules & invariants (S1 §6)

- Card lifecycle: `backlog → today → in_progress → done` (no enforced order).
  Archived = soft delete; permanent delete only on already-archived; purge
  deletes all caller-visible archived.
- Position: `DOUBLE PRECISION` mid-point; new card = `MIN(position) - 1`;
  client picks midpoint between neighbors on move; no rebalancing.
- Attachment caps: 5 MB image MIME allowlist `png/jpeg/webp/gif`. **NEW for
  audio: 10 MB cap, MIMEs `audio/ogg|m4a|mp4|webm`.**
- AI insights concurrency: pending per user 5; per card 1; per day 50;
  `BRAINSTORM_TIMEOUT_MS=30_000`; 429 when exceeded.
- Insight pipeline recovery: on boot, pending >1 h marked failed; younger
  re-enqueued.
- Knowledge SSRF guard: blocks localhost + IPv4 RFC 1918 + IPv6 link-local;
  10 s fetch timeout; 5 MiB response cap; HTML/XHTML only; Readability extract
  → 200 K body cap.
- Templates: name regex `/^\S(?:.{0,38}\S)?$/`; title ≤120; ≤5 tags;
  `due_offset_days` 0–365; unique `(owner_id, lower(name))`.
- Card links: 6 labels (`evolves_from, supersedes, split_from, related, inspired_by, duplicate_of`); self-link blocked; chain BFS depth 1–6 default 2.
- `@ai` mention triggers async `processCardChatAI` → `card.ai_response` WS event with up to 3 suggestion chips parsed from `<!-- suggestions: [...] -->` block.

### 6.6 External services dependency map (S1 §7)

| Service | Use | Native impact |
|---|---|---|
| OpenAI (`gpt-4o-mini` + `whisper-1`) | Chat fallback + Whisper transcribe (only OpenAI offers audio) + Vision fallback | Indirect — native triggers via card chat / from-image / from-audio |
| OpenRouter | Primary chat + vision via `openai` SDK with `baseURL='https://openrouter.ai/api/v1'` | Indirect |
| Tavily | Web search for brainstorm; missing → `degraded=true` insight | Indirect — surfaces "(degraded: web unavailable)" caption |
| Open-Meteo (client-side weather) | PWA only | Not used in native MVP (weather chip V2) |
| Web Push (VAPID) | PWA browser push | NOT USED by native (FCM replaces) |
| **FCM (NEW for native)** | Background push | Required Phase 10 |

---

## 7. Backend Prerequisites (BLOCKERS for Android MVP)

Per S4 §15.1 (7 items) + S6 §15.5 (1 added item for test seed) = **8 items**.
Owner placeholder: **TBD — server team**.

| ID | Description | File / Migration | Owner | Blocks Android phase | Acceptance test |
|---|---|---|---|---|---|
| **B-001** | `POST /api/auth/native/token` endpoint — body `{email, password, device_label?}` → `{token, scope:'native', user: User}`; insert row into `mirror_tokens` with `scope='native'`; argon2id verify | `server/src/routes/auth.ts` (extend) | TBD | **Phase 2** | curl returns `{token, scope:'native', user}` for valid creds; 401 on wrong password; row visible in `mirror_tokens` with `scope='native'` |
| **B-002** | `mirror_tokens.scope` CHECK constraint extended to allow `'native'` | `server/migrations/2026-05-21-mirror-tokens-native-scope.sql` (drop+re-add constraint) | TBD | **Phase 2** | `psql \d mirror_tokens` shows constraint `scope IN ('mirror','api','native')`; inserting `scope='native'` succeeds; inserting any other rejects |
| **B-003** | `requireUser` / `requireUserOrApiToken` preHandlers extended to accept `Authorization: Bearer` matching any `scope IN ('api','native')` for ALL routes | `server/src/auth.ts` (extend preHandlers) | TBD | **Phase 2** | bearer-only request to `/api/knowledge`, `/api/templates`, `/api/insights/*`, `/api/notifications`, `/api/push/subscribe`, `/api/telegram/link`, `/api/review`, `/api/cards/archived`, `/api/cards/:id/events` all return 200 with valid native token |
| **B-004** | WS upgrade handler reads `Sec-WebSocket-Protocol: bearer.<token>`; matches against `mirror_tokens WHERE token=$1 AND scope IN ('api','native')`; echoes header per RFC 6455. Cookie path unchanged | `server/src/ws.ts:102-114` | TBD | **Phase 5** | WS upgrade with `Sec-WebSocket-Protocol: bearer.<valid-token>` succeeds and receives `hello`; invalid → close code 4401 |
| **B-005** | `fcm_subscriptions` table | `server/migrations/2026-05-21-fcm-subscriptions.sql` (schema in S5 §13.2) | TBD | **Phase 10** | `psql \d fcm_subscriptions` shows schema; `idx_fcm_sub_user` exists |
| **B-006** | `POST /api/push/fcm/subscribe` + `DELETE /api/push/fcm/subscribe` endpoints (idempotent upsert on `fcm_token` UNIQUE) | new `server/src/routes/push_fcm.ts` | TBD | **Phase 10** | curl POST returns 204; row visible; second POST same `fcm_token` upserts; DELETE removes |
| **B-007** | `pushToUser(uid, payload)` fan-out extended to FCM via `firebase-admin@13.x` (pinned exact in `server/package.json`); on `messaging/registration-token-not-registered` → delete row (mirrors web-push 410 cleanup) | `server/src/push.ts` extend 47-72 fan-out + new env `FCM_SERVICE_ACCOUNT_JSON` | TBD | **Phase 10** | trigger card.message; FCM token receives notification within 30 s; corrupted token row auto-deleted on 410 |
| **B-008** | `POST /api/cards/from-audio` — multipart `file` field with `audio/ogg|audio/m4a|audio/mp4|audio/webm`; saves attachment kind='audio', transcribes via Whisper, runs `proposeFromText`, creates card `needs_review=true`, swaps title/desc on success. New env `AUDIO_MAX_BYTES=10_000_000` | `server/src/routes/attachments_upload.ts` extend (mirror `from-image`) | TBD | **Phase 12** | curl POST with sample `.m4a` returns 201 Card; card has `needs_review=true`, audio attachment, AI-generated title within 30 s |
| **B-008a** *(S6 §15.5 add-on)* | `POST /api/_test/seed` and `POST /api/_test/teardown` — gated by `process.env.NODE_ENV !== 'production'` AND `X-Test-Auth` header; seeds 20 cards + 5 knowledge + 1 archived + 1 needs_review + 1 linked KB + 1 with unread + 1 with pending insight for QA user; teardown deletes | new `server/src/routes/_test.ts`; CI smoke confirms 404 on prod | TBD | **Phase 6+ (E2E)** | dev env: returns 200 on auth header present; prod env: returns 404 regardless |
| **B-009** | `/.well-known/assetlinks.json` published at production `APP_URL` (HTTPS) — contains `com.smartkanban.app` package + SHA-256 fingerprints of upload + release keys (obtained from Play Console after first publish) | static route in `server/src/index.ts` OR CDN/reverse-proxy | TBD | **V1 GA** (App Link autoVerify) | `adb shell pm verify-app-links --re-verify com.smartkanban.app` succeeds; tapping `https://kanban.YOUR-DOMAIN/m/card/<id>` opens app directly without chooser |

**Total prereqs: 9 line items across 8 distinct backend deliverables.**
Phases 2, 5, 10, 12 are BLOCKED on the corresponding items.

---

## 8. Open Risks & Remediation (from PART A review)

### 8.1 Dimension scores

| # | Dimension | Score | Worst-link contributor |
|---|---|---|---|
| 1 | Completeness | 9/10 | 10 spot-checks (F-001, F-050, F-090, F-120, F-150, F-200, F-310, F-340, F-547, F-660, F-700, F-720, F-820, F-860, F-970, F-1010): every spot-check appears in (a) parity matrix decision, (b) screen home, (c) test pack. Minor gap: F-1010 backend-only (R2) by design. |
| 2 | Consistency | 7/10 | S3 was written "framework-agnostic with Compose fallback" then S4 locked RN+Expo. S3 §1.1 explicitly maps to `react-native-paper`, and S4 §1.1 honors that mapping — clean translation. S5 has **24 components** vs S3 **12 components** — but S5 §2 explicitly labels 12 core + 12 glue (`LanePager`, `CaptureSheet`, `ScopePicker`, `SearchBar`, `KnowledgeRow`, `TagChip`, `ChatInput`, `MessageBubble`, `SuggestionChip` (alias), `ImageLightbox`, `ConfirmDialog`, `LongPressActionSheet`), all of which are referenced (not invented) in S3 §3 layout specs and S3 §5 interaction patterns. Not scope creep — justified glue. S6 covers all 6 journeys (J1–J6) with a 1:1 Detox spec. **Mascot consistency confirmed**: caveman-mode prompt mentioned "WALL-E mascot, not pet blob" in MEMORY but project memory `feedback_mascot_walle.md` records *all four* mascot iterations were rejected; S3 §1.10 honors the harder-won constraint as BINDING. CLAUDE.md hierarchy says memory takes precedence — correct call. |
| 3 | Feasibility | 7/10 | 37 dev days for a solo dev across 12 phases is aggressive but achievable for an experienced RN engineer. **Detox + Expo Router** flagged in S4 §15 R3, S5 §14.4, S6 §15.1 — explicit mitigation = P0 spike (1 Detox login test on scaffold). Backup mitigation = swap to Maestro (YAML). Detox 20.32 supports Expo Router with `testID` configuration but historic flakiness with Reanimated 3 gestures noted. |
| 4 | Risk coverage | 8/10 | 15 risks in S4 §15, 8 open questions in S5 §14, 8 in S6 §15. Every risk has a mitigation OR explicit deferral. R-001 (App Link autoVerify) flagged HIGH due to current LAN-only prod (192.168.50.13) — surfaced in §0 + §8.4. |
| 5 | Backend dependency clarity | 9/10 | S4 §15.1 lists 7 prereqs; S6 §15.5 adds 1 (test-seed); total = 8 distinct items (9 line items with B-009 App Link assetlinks) enumerated in §7 with owner placeholder, file paths, and acceptance tests. Phase-by-phase BLOCKER column in §4.1. |
| 6 | Agent-rules compliance | 8/10 | RULE 1 cited in S5 §11.1 (pre-flight grep per endpoint hook). RULE 2 cited in S5 §11.2 + verbatim envelopes in §4 (bare-array vs Record vs wrapper). RULE 3 translated to JS/RN async patterns in S5 §11.3. RULE 9 verb-check per F-NNN preserved in S5 §3 screen specs + S3 §3 verb tables. RULE 13 decompose-containers in S5 §11.5 (12 glue components are decomposed children of S3 screen specs; LazyColumn lane render = parent + named child renderItem, not inline anon fn). RULE 16 post-edit grep in S5 §11.6. Watchlist: S5 P12 must verify drag-to-move state machine respects RULE 9 (long-press gesture must mount real `LongPressGestureHandler` not a `View` posing). |
| 7 | Security posture | 8/10 | SecureStore-only for tokens with runtime `ALLOWED_KEYS` guard + ESLint ban on AsyncStorage (S4 §7.1, S5 §10.1). NetworkSecurityConfig blocks cleartext in production (S4 §7.3). Backup excludes (S4 §7.6). Cert pinning deferred to V2 with explicit risk rationale (S4 §7.4). Biometric V1 (S4 §7.5). Lazy runtime permissions (S4 §7.7). PII scrub in Sentry (S4 §13.1). Telemetry endpoint promises no PII (S4 §13.2). One gap: no rate-limiting on `/api/auth/native/token` itself — recommend Stage 5 backend add a simple per-IP rate limit (e.g. 5 attempts / 15 min) to prevent credential stuffing. Filed as R-004. |
| 8 | Push completeness | 9/10 | Backend B-005 (table), B-006 (subscribe/unsubscribe endpoints), B-007 (firebase-admin fan-out + 410 cleanup), client `src/push/{fcm,channels,handler}.ts` with 3 channels (S4 §8.3), foreground/background/quit-state handling (S4 §8.4), tap deep-link routing (S5 §8.3), RemoteInput Reply (S3 §6.3), group key collapse (S3 §6.2). Test pack covers 3 channels × 4 states matrix (S6 §5.5) + token lifecycle + 410 cleanup. **One gap**: §3.5 in S3 mentions notification permission grant flow at "first foreground after sign-in" — verify this fires BEFORE first push attempt, not just on NotificationListScreen mount (S3 §3.13 F-342). Filed as minor R-005. |
| 9 | Accessibility | 8/10 | TalkBack flows in S3 §8.1; KanbanCard custom actions with drag-via-action (Play A11y mandate). Font scale tested at 1.0/1.15/1.3/1.5x with 56 snapshots (S6 §8.2). Reduced motion replaces springs/shimmer/pulse (S3 §1.7 + S6 §8.5). High contrast bumps outlines (S3 §8.4). Color-blind tested in 3 sims (S3 §8.7 + S6 §8.4). MVP English only, RTL-ready layouts (S3 §8.3). **Gap**: keyboard navigation noted as V1+ in S6 §8.6; MVP smoke check on LoginScreen + BoardScreen only — acceptable for phone-first MVP. |
| 10 | Testability | 7/10 | Every phase has evidence-required acceptance criteria in S6 §11. CI gates enforce coverage (S6 §2). Manual QA one-pager (S6 §12). **Worst-link risk**: Detox + Expo Router compatibility (carried over from #3). If Phase 0 spike fails, the entire E2E pack must be ported to Maestro — which adds 2-3 days estimate slip. Coverage thresholds for `src/components/` are 70% (snapshot-heavy) which is appropriate but lighter than `src/api/` (80%). |

**Overall confidence (worst-link / MIN across dimensions): 7/10.**

Satisfies user mandate of ≥7/10. The 7/10 floor is set by Dimension 2
(Consistency) and Dimension 3/10 (Feasibility + Testability), driven by the
single Detox+Expo Router unknown — which has a documented Phase 0 spike +
Maestro fallback. No remediation required to ship; the spike outcome
determines whether to upgrade to 8/10.

### 8.2 Veto count

**Vetoes (dimensions <7): 0.**

Plan is shippable. No dimension scored below 7. Remediation actions in §8.4
are tracked but do not block.

### 8.3 Findings (R-001..R-006)

| ID | Severity | Description | Cross-ref | Recommended remediation | Status |
|---|---|---|---|---|---|
| **R-001** | HIGH | App Link `autoVerify` requires public HTTPS hostname hosting `/.well-known/assetlinks.json`; prod today is LAN `192.168.50.13` per S1 §10.1 / S4 §15 R5 / S6 §15. Until prod gets a verified HTTPS hostname, App Links degrade to system chooser. | S1 §10.1, S4 §4.4, §15.1 (B-009), S6 §15 | (a) Provision public HTTPS hostname + TLS cert before V1 GA. (b) Host assetlinks.json with the Play Console-issued SHA-256 fingerprints. (c) MVP ships with custom `kanban://` scheme working AND HTTPS links going through chooser — degraded but functional. | **open — accepted-risk for MVP; resolved before V1 GA** |
| **R-002** | HIGH | 8 backend BLOCKERS in §7 — without them, Android phases 2/5/10/12 cannot ship. Backend owner is currently **TBD**. | S4 §15.1, S5 §13, S6 §11, this §7 | (a) Assign single owner to backend prereqs **immediately**. (b) Sequence backend work so B-001/B-002/B-003 (bearer auth) ship before Android Phase 2 begins. (c) Stage backend prereq verification as a hard gate in each affected Android phase done-test. (d) If a prereq slips, see fallback plans: cookie auth (`@react-native-cookies/cookies`) for B-001..B-003 (S5 §14.5 — "break glass"); voice deferred to V1 if B-008 slips (S5 §14.6); App Link chooser fallback if B-009 slips (R-001). | **open — owner assignment required** |
| **R-003** | MEDIUM | V1 parity coverage projects 77.6% vs S2 §6 target ≥80%. | S2 §4.5, §6 | Stage 5 P12 audit explicitly closes the 2.4% gap by promoting cheap V1 wins: Toasts F-820..F-824 (already in V1), Archive list rows F-510..F-519 (already in V1), Templates CRUD F-461+F-480..F-495 (already in V1). Cumulative V1 rows estimated at 263 / 339 non-out-of-scope = 77.6%. To hit 80%, promote ~7 more rows from V2. Recommendation: promote `F-820..F-824` Toasts polish + `F-461` Templates row (already V1) + 5 cheap items from V2 list (e.g. F-158..F-160 QR which Phase 9 already spec'd; F-660 weather chip half) — would hit 80% by V1 ship. | **open — Stage 5 P12 audit decision** |
| **R-004** | MEDIUM | No rate limiting on `POST /api/auth/native/token` (B-001) — credential stuffing risk on the bearer endpoint. | S4 §7 security posture, S5 §13.1, this §8.1 #7 | Backend B-001 implementation MUST include per-IP rate limit (e.g. 5 attempts / 15 min sliding window). Reuse Fastify plugin or simple in-memory counter. Document in B-001 acceptance test. | **open — added to B-001 acceptance criteria** |
| **R-005** | MINOR | S3 §3.13 F-342 places notification permission grant at "first foreground after sign-in"; need to verify it fires BEFORE first push attempt, not only on NotificationListScreen mount. | S3 §3.13, S4 §8.2, S5 §8 | `src/push/fcm.ts` `initFcmAfterAuth()` MUST: (1) request `POST_NOTIFICATIONS` permission, (2) await result, (3) only then call `messaging().getToken()` and POST subscribe. If permission denied, do NOT subscribe; surface in Settings (V1). Add test in `__tests__/push/handler.test.ts` asserting permission requested before token fetched. | **open — Phase 10 implementation detail** |
| **R-006** | MINOR | S5 §3 lists 14 routes including embedded `AiInsightsCard` as "Screen-grade artifact" — but `AiInsightsCard` is a `<View>` embedded inside `CardDetailScreen`, not a route. This is a counting nit, not a bug. | S5 §3.6, §3 footer | Treat as 13 routes + 1 embedded component spec. Update counts in any future regeneration: routes=13, embedded-screen-grade-components=1. | **open — cosmetic, no remediation needed** |

### 8.4 Resolution timeline for open BLOCKERs

| Item | Resolve before | Why |
|---|---|---|
| R-001 | V1 GA | App Link autoVerify wants prod HTTPS hostname; MVP can ship without |
| R-002 | Phase 2 start | Bearer endpoint blocks entire auth slice; assign owner now |
| R-003 | Phase 12 (V1 closure) | Parity audit decides which V2 items to promote |
| R-004 | B-001 implementation | Rate limit must ship with the endpoint |
| R-005 | Phase 10 | One-line ordering fix in `initFcmAfterAuth()` |
| R-006 | Cosmetic — no deadline | Counting clarification |

---

## 9. Decision Log

Notable decisions made by the pipeline that the user should sign off on:

1. **Mascot rejected despite caveman-prompt mention.** S3 §1.10 honors
   project memory `feedback_mascot_walle.md` (rejected across 4 iterations)
   over the pipeline brief's "optional WALL-E" suggestion. CLAUDE.md
   hierarchy → memory takes precedence. **Decision: BINDING — no mascot in
   any release.**
2. **Expo Managed + EAS Build chosen over Bare.** S4 §1.2 picks Managed
   first; eject to Bare only if a feature blocker hits (Custom Java code,
   Quick Settings tile, App Widget — all V2). Decision gate at Stage 5
   first build.
3. **WebView for chain modal in MVP/V2.** S3 §3.4 hides chain in MVP; S5
   Phase 9 ships V2 as `WebView` embed of `/m/card/:id/chain` (existing
   ReactFlow viz) with `Authorization: Bearer` injection. V3 considers
   native Compose graph (deferred).
4. **FCM-only push (no web-push tunnel).** S2 §8.2 + S4 §8. Web-push payload
   format incompatible with FCM; doubling code paths rejected.
5. **Cookie auth NOT used for native — new bearer endpoint required.**
   S2 §8.1, S4 §6.2, B-001..B-003 in §7. Cookie-via-OkHttp fragile when
   APP_URL HTTPS. New `POST /api/auth/native/token` returns
   `mirror_tokens` row with `scope='native'`. Fallback: `@react-native-cookies/cookies`
   (break-glass per S5 §14.5).
6. **No offline-first sync engine in MVP.** S2 §7. Cached reads via React
   Query gcTime 24 h; online-only writes with snackbar+Retry on failure;
   mid-edit conflict resolution = V2+.
7. **No tablet layouts in MVP.** S2 §7. Phone-only single-pane; tablet split-view = V2 at earliest.
8. **No iOS — Android only.** S2 §7. PWA covers iOS users.
9. **WS in foreground only; FCM in background.** S2 §8.6, S4 §9. No foreground
   service for WS (battery + persistent notification cost). `cloud_off` icon
   in TopAppBar when disconnected.
10. **24 components = 12 core + 12 glue.** S5 §2 inventory. Not scope creep
    — all 12 glue components referenced in S3 §3 layouts and §5 interaction
    patterns. Total decomposed per RULE 13.
11. **Detox + Expo Router compatibility = Phase 0 spike.** S4 §15 R3, S5 §14.4,
    S6 §15.1. If 1 Detox login test fails on scaffold, swap to Maestro. E2E
    specs framework-agnostic except selector syntax.
12. **3 separate Firebase projects (dev / preview / production).** S6 §15.3.
    Prevents dev test pushes leaking to real prod users. 3 EAS Secrets, 3
    `google-services.json` files.
13. **Visual parity check = manual in MVP; Percy for 5 stable screens in V1.**
    S6 §15.4. Manual checklist + sign-off blocks tag `v*`.
14. **Test seed endpoint `/api/_test/seed` is a backend prereq (B-008a).**
    Gated by `NODE_ENV !== 'production'` + `X-Test-Auth` header; CI smoke
    confirms 404 on prod.
15. **No client-side visibility re-filtering of WS events.** S1 §5.7
    server-side predicate is canonical; client trusts server. Over-render
    risk only, never under-render (S4 §15 R14).
16. **`expo-av` 15.0.1 pinned despite SDK 53 deprecation.** S4 §15 R11.
    Plan: V1.1 milestone bumps Expo + swaps to `expo-audio`.
17. **AI suggestion chip apply is optimistic.** S3 §5.9. Chip transitions
    to `surfaceVariant` + ✓ prefix immediately; rollback on PATCH failure
    surfaces snackbar Retry.
18. **No multi-account login.** S2 §7. One account per install (household
    trust model).

---

## 10. Appendices

### A. Glossary

| Term | Meaning |
|---|---|
| **M3** | Material Design 3 (Material You) — Google's latest design system; Compose Material3 in native Kotlin, `react-native-paper` v5 in RN |
| **FCM** | Firebase Cloud Messaging — Google's push delivery service for Android |
| **NSC** | Network Security Config — Android XML defining trust anchors and cleartext policy |
| **MMKV** | Tencent's key-value store for mobile; faster than AsyncStorage; used for non-secret cache and React Query persistence |
| **SecureStore** | `expo-secure-store` — Expo wrapper around Android `EncryptedSharedPreferences` (API 23+) / iOS Keychain |
| **App Link** | Verified HTTPS deep link (autoVerify=true) that opens the app directly without chooser when `/.well-known/assetlinks.json` is hosted at the domain |
| **EAS** | Expo Application Services — Expo's cloud build + OTA update + submit service |
| **OTA** | Over-the-air JS-bundle update via EAS Update (no Play Store re-review) |
| **AAB** | Android App Bundle — Play Store's preferred upload format (replaces APK for distribution) |
| **APK** | Android Package — installable binary used for sideloading/internal distribution |
| **ANR** | Application Not Responding — Android system dialog when main thread blocked >5 s |
| **TalkBack** | Android's built-in screen reader |
| **Notifee** | `@notifee/react-native` — rich notification display library with full RemoteInput / channel control |
| **RemoteInput** | Android NotificationCompat API allowing typing reply directly from notification shade |
| **VAPID** | Voluntary Application Server Identification — keypair scheme for browser Web Push (not used by native) |
| **Hermes** | Meta's JS engine optimized for RN; default since RN 0.74 |
| **Reanimated 3** | RN library for declarative animations + gesture handler integration |
| **WALL-E** | The animated robot character referenced in `feedback_mascot_walle.md`; mascot concept rejected for SmartKanban |

### B. Reference links

- **React Native:** https://reactnative.dev (0.76 release notes)
- **Expo SDK 52:** https://expo.dev/changelog/2024/11-12-sdk-52
- **Expo Router:** https://docs.expo.dev/router/introduction/
- **react-native-paper (M3):** https://callstack.github.io/react-native-paper/
- **Material 3 spec:** https://m3.material.io/
- **FCM (Android):** https://firebase.google.com/docs/cloud-messaging/android/client
- **Notifee:** https://notifee.app/react-native/docs/overview
- **EncryptedSharedPreferences:** https://developer.android.com/topic/security/data
- **App Links (verify):** https://developer.android.com/training/app-links/verify-android-applinks
- **Detox:** https://wix.github.io/Detox/
- **Zod:** https://zod.dev
- **TanStack Query 5:** https://tanstack.com/query/v5
- **Zustand:** https://github.com/pmndrs/zustand
- **MMKV:** https://github.com/mrousavy/react-native-mmkv

### C. File pointers to the 6 source stage docs

| Stage | Doc | Lines | Cited as |
|---|---|---|---|
| S1 Analyst | `/Users/assistant/WorkingFolder/KanbanClaude/ANDROID_PLAN_S1_ANALYST.md` | 1253 | S1 §X.Y |
| S2 PM | `/Users/assistant/WorkingFolder/KanbanClaude/ANDROID_PLAN_S2_PM.md` | 1048 | S2 §X.Y |
| S3 Designer | `/Users/assistant/WorkingFolder/KanbanClaude/ANDROID_PLAN_S3_DESIGNER.md` | 1746 | S3 §X.Y |
| S4 Architect | `/Users/assistant/WorkingFolder/KanbanClaude/ANDROID_PLAN_S4_ARCHITECT.md` | 1575 | S4 §X.Y |
| S5 Engineer | `/Users/assistant/WorkingFolder/KanbanClaude/ANDROID_PLAN_S5_ENGINEER.md` | 2563 | S5 §X.Y / P0..P12 |
| S6 QA | `/Users/assistant/WorkingFolder/KanbanClaude/ANDROID_PLAN_S6_QA.md` | 1035 | S6 §X.Y |

Registry: `/Users/assistant/WorkingFolder/KanbanClaude/FEATURE_PARITY_REGISTRY.md` (759 lines).
Agent rules: `/Users/assistant/WorkingFolder/KanbanClaude/agent-rules.md` (915 lines).

---

STAGE_COMPLETE: plan vetoes=0 confidence=7
