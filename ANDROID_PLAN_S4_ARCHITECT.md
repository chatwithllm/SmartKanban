# ANDROID PLAN — STAGE 4: ARCHITECT (Tech Stack & Architecture Lockdown)

Upstream binding inputs (read in order):

- `ANDROID_PLAN_S1_ANALYST.md` — 51 routes, 18 tables, 19 WS events, env vars,
  visibility predicate, ID shape. Cited as **S1 §X.Y**.
- `ANDROID_PLAN_S2_PM.md` — MVP=188 rows, V1=263, V2=339, 6 journeys, target
  Pixel 6a / Android 13+, **three new backend endpoints flagged**:
  `POST /api/auth/native/token`, `POST/DELETE /api/push/fcm/subscribe`,
  `POST /api/cards/from-audio`. Cited as **S2 §X.Y**.
- `ANDROID_PLAN_S3_DESIGNER.md` — Material 3 design tokens, screen specs,
  every F-NNN → API+WS map. Cited as **S3 §X.Y**.
- `agent-rules.md` — RULE 1 pre-flight grep, RULE 2 verbatim backend mirror,
  RULE 3 concurrency hygiene (translated to JS/RN async patterns), RULE 5
  registry workflow, RULE 9 verb verification.

Stage 4 deviation from S3: Stage 3 was written assuming Compose was on the
table. **The user has locked React Native + Expo** per the task constraints.
Every Stage 3 token, motion, and component spec is retained verbatim — only
the implementation primitive changes (Compose `LazyColumn` → RN `FlashList`;
Compose `ModalBottomSheet` → `@gorhom/bottom-sheet`; etc.).

USER-LOCKED CONSTRAINTS (BINDING):

- React Native + Expo (managed if feasible, **bare** if push/share-intent force
  it; decision in §1.2 below).
- ALL DEPS PINNED EXACT — no `^`, no `~`.
- Expo Router for navigation.
- Zustand + React Query (Zustand for client/UI; React Query for server state).
- `expo-secure-store` (EncryptedSharedPreferences backing) — NEVER AsyncStorage
  for tokens/auth.
- minSdkVersion 29 (Android 10), targetSdkVersion 35.
- FCM push (not web-push).

---

## 1. Stack Decision (with rationale)

### 1.1 Framework: React Native + Expo

| Decision | React Native 0.76.x + Expo SDK 52 |
|---|---|
| Language | TypeScript 5.6.x — strict mode (`"strict": true`, `"noUncheckedIndexedAccess": true`) |
| Engine | Hermes (default in RN 0.74+) — no explicit Hermes flag needed |
| Bundler | Metro (Expo default) |
| Architecture | New Architecture **OFF** for MVP (Fabric+TurboModules); some Firebase + Notifee combos still emit warnings under New Arch as of 2026-05. Re-evaluate at V1. |

**Alternative considered: Compose (native Kotlin).** Rejected — user-locked.

**S3 design-language compatibility.** Stage 3 §1.1 selected Material 3 and
listed `react-native-paper` v5 as the RN port. We adopt that recommendation.
Custom design tokens (S3 §1.3–§1.7) are layered on top of `react-native-paper`'s
`MD3Theme` via `extendTheme()` so we keep the seed-derived palette but
override surface/typography/elevation to the Stage 3 values verbatim.

### 1.2 Workflow: Expo Bare (with **strong recommendation to start Managed + EAS, eject only if blocked**)

**Recommendation: Start in Expo Managed + EAS Build with config plugins;
plan to eject to Bare at first concrete blocker.**

Reasoning:

| Feature | Managed-with-plugin works? | Notes |
|---|---|---|
| `expo-secure-store` (EncryptedSharedPreferences) | ✅ | First-class Expo module |
| `expo-notifications` (notification channels, basic display) | ✅ | First-class |
| `@react-native-firebase/messaging` (FCM) | ✅ via config plugin | Requires `@react-native-firebase/app` config plugin; google-services.json declared in `app.json` |
| `@notifee/react-native` (rich notifications + RemoteInput Reply) | ✅ via config plugin | Has an Expo config plugin; coexists with `expo-notifications` if channels are owned by Notifee only |
| Custom `<intent-filter android:name="android.intent.action.SEND">` | ⚠️ requires custom config plugin OR app.json `android.intentFilters` | Expo's `app.json` supports `android.intentFilters` since SDK 50 — share-target IS reachable from managed |
| App Links autoVerify | ✅ via `app.json` `android.intentFilters` + `expo-router` linking | Need `/.well-known/assetlinks.json` hosted at `APP_URL` |
| RemoteInput Reply (from notification panel) | ⚠️ via Notifee — managed-friendly config plugin path | OK for V1 ship |
| Foreground service for long voice capture | ❌ if recording >30s background | MVP records foreground-only; no FG service needed |
| ProGuard/R8 release config | ✅ EAS handles | Standard EAS profile |

**Conclusion:** Managed + EAS covers MVP. Bare is required only if we add
features that can't be expressed via `app.json` or a community config plugin
(e.g. custom Java code, a Quick Settings tile, an App Widget — all V2 per S2
§4.3). Stage 5 Engineer should attempt **Managed first**; track ejection
gates in §15.

### 1.3 Build & Distribution

| Layer | Choice |
|---|---|
| Dev iteration | Expo Dev Client (custom, since we need `@react-native-firebase`); `npx expo start` + `eas build --profile development` produces an installable APK with dev menu |
| Production build | EAS Build (`eas.json` profiles in §12) |
| OTA updates | EAS Update — JS-only patches, no Play review |
| Distribution | Play Internal Track for beta, Closed → Open → Production |

### 1.4 Module sourcing rule

Per S1 §1.1 the backend pins exact versions. We do the same. **Every entry in
§2 below must be exact** — no `^`, no `~`, no version ranges. Quality gate in
CI: `node -e "JSON.parse(require('fs').readFileSync('package.json')).dependencies && ..."` script verifies no caret/tilde present (§11).

---

## 2. Pinned Dependency Manifest

Versions current as of **2026-05-20** from npm registry. Where a release was
in flight on cutoff day, the entry is marked `// confirm latest` — Stage 5
Engineer must verify before `npm install`.

### 2.1 `dependencies`

```jsonc
{
  "dependencies": {
    // --- Expo core (SDK 52) ---
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

    // --- Expo capabilities (capture path) ---
    "expo-image": "2.0.3",
    "expo-image-picker": "16.0.3",
    "expo-document-picker": "13.0.1",
    "expo-file-system": "18.0.5",
    "expo-sharing": "13.0.0",
    "expo-camera": "16.0.10",          // CameraX-backed (Photo capture, F-125 / S3 §3.3)
    "expo-av": "15.0.1",                // Voice capture (F-127, replaces stub; expo-audio still SDK 53+)

    // --- Secrets / storage ---
    "expo-secure-store": "14.0.0",      // RULE: auth token storage ONLY (EncryptedSharedPreferences-backed on Android)
    "react-native-mmkv": "3.1.0",       // Non-secret cache (React Query persistence, theme prefs)
    "expo-local-authentication": "15.0.1", // V1 biometric unlock (gated read of secure-store)

    // --- Fonts (Spectral, Inter, JetBrains Mono — S3 §1.5) ---
    "@expo-google-fonts/spectral": "0.2.3",
    "@expo-google-fonts/inter": "0.2.3",
    "@expo-google-fonts/jetbrains-mono": "0.2.3",

    // --- React + RN core ---
    "react": "18.3.1",
    "react-native": "0.76.5",
    "react-native-safe-area-context": "4.12.0",
    "react-native-screens": "4.4.0",
    "react-native-gesture-handler": "2.21.2",
    "react-native-reanimated": "3.16.6",
    "react-native-keyboard-controller": "1.15.2",

    // --- UI library + tokens (S3 §1.1) ---
    "react-native-paper": "5.12.5",
    "@shopify/flash-list": "1.7.2",
    "@gorhom/bottom-sheet": "5.0.6",

    // --- State + server-state ---
    "zustand": "5.0.2",
    "@tanstack/react-query": "5.62.7",
    "@tanstack/react-query-persist-client": "5.62.7",
    "@tanstack/query-async-storage-persister": "5.62.7",

    // --- HTTP + runtime validation (RULE 2 verbatim mirror) ---
    "ky": "1.7.4",
    "zod": "3.24.1",

    // --- Connectivity ---
    "@react-native-community/netinfo": "11.4.1",

    // --- Notifications (FCM via Firebase; rich actions via Notifee) ---
    "expo-notifications": "0.29.10",
    "@react-native-firebase/app": "21.6.1",
    "@react-native-firebase/messaging": "21.6.1",
    "@notifee/react-native": "9.1.2",

    // --- Telemetry ---
    "@sentry/react-native": "6.4.0",

    // --- Utilities ---
    "date-fns": "4.1.0",
    "react-native-mime-types": "2.5.0"
  }
}
```

### 2.2 `devDependencies`

```jsonc
{
  "devDependencies": {
    "typescript": "5.6.3",
    "@types/react": "18.3.18",
    "@types/react-native": "0.73.0",
    "@types/node": "22.10.2",
    "@babel/core": "7.26.0",

    "eslint": "9.17.0",
    "@react-native/eslint-config": "0.76.5",
    "eslint-plugin-import": "2.31.0",

    "prettier": "3.4.2",

    "jest": "29.7.0",
    "jest-expo": "52.0.2",
    "@testing-library/react-native": "13.0.1",
    "@testing-library/jest-native": "5.4.3",
    "@types/jest": "29.5.14",

    "detox": "20.32.0",                 // confirm latest; verify RN 0.76 + API 29-35 support
    "@types/detox": "18.1.0",

    "husky": "9.1.7",
    "lint-staged": "15.2.11"
  }
}
```

### 2.3 Verification script (added to `package.json` `scripts`)

```jsonc
{
  "scripts": {
    "verify:pinned": "node -e \"const p=require('./package.json'); for (const d of [p.dependencies, p.devDependencies]) for (const [k,v] of Object.entries(d||{})) if (/^[\\^~]/.test(v)) { console.error('not pinned:',k,v); process.exit(1) }; console.log('all pinned')\"",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "jest --config jest.config.ts",
    "e2e:build": "detox build -c android.emu.release",
    "e2e:test": "detox test -c android.emu.release"
  }
}
```

CI gate (§11) runs `npm run verify:pinned`.

### 2.4 Dependency count summary

| Bucket | Count |
|---|---|
| Expo core | 10 |
| Expo capabilities | 7 |
| Secrets/storage | 3 |
| Fonts | 3 |
| RN core | 7 |
| UI / lists / sheets | 3 |
| State + server-state | 4 |
| HTTP + validation | 2 |
| Connectivity | 1 |
| Push / notifications | 4 |
| Telemetry | 1 |
| Utilities | 2 |
| **Total `dependencies`** | **47** |
| **Total `devDependencies`** | **15** |

---

## 3. Project Structure

```
smartkanban-android/
├── app/                                  # expo-router file routes (S3 §2.1)
│   ├── _layout.tsx                       # Root Stack + PaperProvider + QueryClientProvider + AuthGate
│   ├── +not-found.tsx
│   ├── (auth)/
│   │   ├── _layout.tsx                   # Stack, headerShown:false
│   │   └── login.tsx                     # LoginScreen — S3 §3.1, F-001..F-011
│   ├── (tabs)/
│   │   ├── _layout.tsx                   # NavigationBar (3 tabs) S3 §2.2
│   │   ├── board/
│   │   │   ├── _layout.tsx               # Board Stack
│   │   │   ├── index.tsx                 # BoardScreen — S3 §3.2
│   │   │   ├── [id].tsx                  # CardDetailScreen — S3 §3.4
│   │   │   └── chain/[id].tsx            # V2: ChainScreen (WebView embed)
│   │   ├── knowledge/
│   │   │   ├── _layout.tsx
│   │   │   ├── index.tsx                 # KnowledgeListScreen — S3 §3.6
│   │   │   ├── [id].tsx                  # KnowledgeDetailScreen — S3 §3.7
│   │   │   └── edit.tsx                  # KnowledgeEditScreen — S3 §3.8
│   │   └── more/
│   │       ├── _layout.tsx
│   │       ├── index.tsx                 # MoreScreen — S2 §3.27
│   │       ├── settings.tsx              # SettingsScreen (theme, short-name)
│   │       ├── archive.tsx               # V1 — ArchiveScreen
│   │       └── weekly-review.tsx         # V2
│   ├── capture.tsx                       # Modal: CaptureSheet — S3 §3.3
│   ├── notifications.tsx                 # Modal: NotificationListScreen — S3 §3.13
│   └── share-target.tsx                  # ACTION_SEND intent landing (F-547)
│
├── src/
│   ├── api/
│   │   ├── client.ts                     # ky instance + auth + retry + zod parse
│   │   ├── endpoints/
│   │   │   ├── auth.ts                   # /api/auth/*  + /api/auth/native/token
│   │   │   ├── cards.ts                  # /api/cards*  (incl. archived, attachments, from-image, from-audio)
│   │   │   ├── knowledge.ts              # /api/knowledge*
│   │   │   ├── insights.ts               # /api/cards/:id/insights*
│   │   │   ├── templates.ts              # /api/templates*
│   │   │   ├── notifications.ts          # /api/notifications, /api/messages/unread
│   │   │   ├── push.ts                   # /api/push/fcm/{subscribe,unsubscribe}
│   │   │   ├── review.ts                 # /api/review
│   │   │   ├── tokens.ts                 # /api/tokens, /api/mirror/tokens (V2)
│   │   │   └── attachments.ts            # signed-url GET for /attachments/*
│   │   ├── schemas/                      # Zod RULE-2 verbatim mirrors of backend JSON
│   │   │   ├── card.ts                   # Card, CardEvent, CardLink, Attachment
│   │   │   ├── knowledge.ts              # KnowledgeItem
│   │   │   ├── insight.ts                # Insight (status, body, degraded)
│   │   │   ├── notification.ts
│   │   │   ├── template.ts
│   │   │   ├── user.ts
│   │   │   └── envelopes.ts              # BareArray, MessagesUnread, KnowledgeList, etc.
│   │   ├── errors.ts                     # ApiError class; 401/403/410/429/5xx mapping
│   │   └── types.ts                      # Inferred types from Zod schemas
│   │
│   ├── state/
│   │   ├── auth-store.ts                 # Zustand: { token, user, signIn, signOut }
│   │   ├── ui-store.ts                   # Zustand: { activeLane, search, openSheet, theme }
│   │   └── capture-draft-store.ts        # Zustand: pending text/photo/voice not yet sent
│   │
│   ├── hooks/                            # React Query hooks (one file per resource)
│   │   ├── useCards.ts                   # list + invalidation
│   │   ├── useCard.ts                    # single card + mutations
│   │   ├── useCardEvents.ts              # timeline + read-marker
│   │   ├── useUnreadCounts.ts            # /api/messages/unread
│   │   ├── useKnowledge.ts
│   │   ├── useKnowledgeItem.ts
│   │   ├── useInsights.ts
│   │   ├── useNotifications.ts
│   │   ├── useTemplates.ts
│   │   ├── useArchive.ts
│   │   ├── useReview.ts                  # V2
│   │   ├── useWs.ts                      # WebSocket connection + flow → queryClient
│   │   ├── useDeepLink.ts                # parse incoming URL → router push
│   │   ├── useShareIntent.ts             # ACTION_SEND handler
│   │   ├── useFcm.ts                     # token registration + refresh + sign-out cleanup
│   │   └── useHaptics.ts                 # wrapper respecting reduced-motion
│   │
│   ├── components/
│   │   ├── KanbanCard.tsx                # F-090..F-110 (S3 §3.5)
│   │   ├── LaneHeader.tsx                # F-070..F-073
│   │   ├── CaptureFab.tsx                # F-057
│   │   ├── CaptureSheet.tsx              # F-120..F-131
│   │   ├── AiInsightsCard.tsx            # F-200..F-215 (S3 §3.5)
│   │   ├── DueBadge.tsx                  # F-102
│   │   ├── AssigneeAvatarStack.tsx       # F-107/F-108
│   │   ├── StatusPill.tsx                # F-073
│   │   ├── AttachmentTile.tsx            # F-731
│   │   ├── Snackbar.tsx                  # F-820..F-824
│   │   ├── NotificationRow.tsx           # F-346
│   │   ├── EmptyStateBlock.tsx
│   │   ├── LoadingSkeleton.tsx
│   │   ├── CardTimeline.tsx              # F-310..F-327
│   │   ├── KnowledgeRow.tsx              # F-570..F-579
│   │   └── …
│   │
│   ├── design/
│   │   ├── theme.ts                      # MD3 theme builder (light+dark) per S3 §1.3
│   │   ├── colors.ts                     # tokens (S3 §1.3, §1.4 lane accents)
│   │   ├── typography.ts                 # Spectral / Inter / JetBrains Mono scales (S3 §1.5)
│   │   ├── spacing.ts                    # 4/8/12/16/24/32 grid
│   │   ├── elevation.ts                  # S3 §1.6 shadow tokens (RN approximation)
│   │   └── motion.ts                     # spring/tween presets + reduced-motion gate
│   │
│   ├── navigation/
│   │   ├── linking.ts                    # expo-router linking config (TS snippet in §4)
│   │   └── deep-links.ts                 # URL parsers (card/{id}, knowledge/{id})
│   │
│   ├── push/
│   │   ├── fcm.ts                        # init, getToken, refresh, sign-out cleanup
│   │   ├── channels.ts                   # 3 channels: card-activity / insights / reminders
│   │   └── handler.ts                    # tap routing → deep link
│   │
│   ├── ws/
│   │   ├── socket.ts                     # native WebSocket wrapper + reconnect backoff (S2 §8.6)
│   │   ├── events.ts                     # typed event union mirroring S1 §3.2
│   │   └── queue.ts                      # offline message queue (V1)
│   │
│   ├── storage/
│   │   ├── secure.ts                     # expo-secure-store wrapper — AUTH TOKEN ONLY
│   │   ├── cache.ts                      # MMKV wrapper for non-secret cache
│   │   └── persister.ts                  # MMKV-backed React Query persister
│   │
│   ├── share/
│   │   └── intent-parser.ts              # ACTION_SEND text vs image vs URL → CaptureDraft|KnowledgeDraft
│   │
│   ├── utils/
│   │   ├── relative-time.ts              # date-fns wrapper matching web's pattern
│   │   ├── visibility.ts                 # RULE 2 — mirror S1 §5.7 client-side predicate
│   │   ├── color-hash.ts                 # deterministic avatar tint (F-107)
│   │   └── debounce.ts
│   │
│   └── env.ts                            # EXPO_PUBLIC_* loader + zod validation
│
├── android/                              # bare-workflow native dir (ONLY if ejected)
│   └── app/src/main/
│       ├── AndroidManifest.xml
│       ├── res/xml/network_security_config.xml
│       ├── res/xml/backup_rules.xml
│       └── google-services.json          # gitignored; pulled at build time by EAS Secret
│
├── assets/
│   ├── icon.png                          # adaptive icon foreground
│   ├── adaptive-icon-background.png
│   ├── splash.png
│   └── fonts/                            # local fallbacks (offline first launch)
│
├── e2e/                                  # Detox specs
│   ├── jest.config.js
│   ├── login.test.ts
│   ├── capture.test.ts
│   ├── card-detail.test.ts
│   └── share-target.test.ts
│
├── __tests__/                            # jest unit tests
│   ├── api/
│   ├── state/
│   └── utils/
│
├── app.json                              # expo config + plugins + intent filters
├── eas.json                              # build profiles (§12)
├── tsconfig.json                         # strict
├── babel.config.js                       # expo-router preset + reanimated plugin
├── metro.config.js
├── .eslintrc.js
├── .prettierrc
├── jest.config.ts
├── .github/workflows/
│   ├── pr.yml                            # lint + typecheck + jest + detox
│   ├── main.yml                          # eas build preview + eas update
│   └── release.yml                       # tag v* → eas build prod + submit
└── package.json
```

---

## 4. Navigation Architecture (Expo Router)

### 4.1 Route tree (matches S3 §2.3)

```
RootStack
├── (auth)/login                          # gate; full-screen
└── (tabs)                                 # NavigationBar wrapper
    ├── board/
    │   ├── index                          # BoardScreen
    │   ├── [id]                           # CardDetailScreen
    │   └── chain/[id]                     # ChainScreen (V2)
    ├── knowledge/
    │   ├── index                          # KnowledgeListScreen
    │   ├── [id]                           # KnowledgeDetailScreen
    │   └── edit                           # KnowledgeEditScreen
    └── more/
        ├── index                          # MoreScreen
        ├── settings
        ├── archive                        # V1
        └── weekly-review                  # V2

Modal/global routes (presented above tabs):
├── capture                                # CaptureSheet
├── notifications                          # NotificationListScreen
└── share-target                           # ACTION_SEND landing
```

### 4.2 Deep link map (S3 §2.4)

| URL / Scheme | Resolves to | Notes |
|---|---|---|
| `kanban://card/{id}` | `(tabs)/board/[id]` | Card detail, chat scrolled to bottom |
| `kanban://knowledge/{id}` | `(tabs)/knowledge/[id]` | Knowledge detail |
| `kanban://capture` | `/capture` | App Shortcut (V2) |
| `https://<APP_URL_HOST>/m/card/{id}` (App Link, autoVerify=true) | `(tabs)/board/[id]` | Mirror token-aware (`?token=`) — token stripped if user authenticated |
| `https://<APP_URL_HOST>/knowledge/{id}` | `(tabs)/knowledge/[id]` | Same |
| `https://<APP_URL_HOST>/?card={id}` (legacy F-867) | `(tabs)/board/[id]` | Back goes to Board (not browser) |
| `ACTION_SEND` text/plain | `/share-target` | Routes to `KnowledgeEditScreen` pre-filled |
| `ACTION_SEND` image/* | `/share-target` | Routes to `CaptureSheet` with photo attached |
| FCM `data.cardId={id}` (notification tap) | `(tabs)/board/[id]` | Handled by `src/push/handler.ts` |
| FCM `data.knowledgeId={id}` | `(tabs)/knowledge/[id]` | Same |

Unauthenticated deep link → `(auth)/login` with `pendingDeepLink` query
param; replayed on successful auth via Zustand `auth-store.onSignIn`.

### 4.3 Linking config (`src/navigation/linking.ts`)

```ts
import type { LinkingOptions } from "@react-navigation/native";
import * as Linking from "expo-linking";
import { CONFIG } from "@/env";

// host derived from APP_URL at build time; fallback to a placeholder for dev
const HTTPS_HOST = new URL(CONFIG.APP_URL).host;

export const linking: LinkingOptions<ReactNavigation.RootParamList> = {
  prefixes: [
    Linking.createURL("/"),               // kanban://
    `https://${HTTPS_HOST}`,
    `http://${HTTPS_HOST}`,               // dev only; release manifest excludes http
  ],
  config: {
    screens: {
      "(auth)/login": "login",
      "(tabs)": {
        screens: {
          "board/index": "",
          "board/[id]": {
            path: "m/card/:id",
            parse: { id: String },
          },
          "board/chain/[id]": {
            path: "m/card/:id/chain",
          },
          "knowledge/index": "knowledge",
          "knowledge/[id]": "knowledge/:id",
          "knowledge/edit": "knowledge/edit",
          "more/index": "more",
          "more/settings": "more/settings",
          "more/archive": "more/archive",
          "more/weekly-review": "more/review",
        },
      },
      capture: "capture",
      notifications: "notifications",
      "share-target": "share",
    },
  },
};
```

### 4.4 AndroidManifest intent filters (excerpt — emitted via Expo config plugin from `app.json`)

```xml
<!-- App Link autoVerify (requires /.well-known/assetlinks.json hosted at APP_URL) -->
<intent-filter android:autoVerify="true">
  <action android:name="android.intent.action.VIEW"/>
  <category android:name="android.intent.category.DEFAULT"/>
  <category android:name="android.intent.category.BROWSABLE"/>
  <data android:scheme="https" android:host="kanban.YOUR-DOMAIN"/>
  <data android:scheme="https" android:host="kanban.YOUR-DOMAIN" android:pathPrefix="/m/card/"/>
  <data android:scheme="https" android:host="kanban.YOUR-DOMAIN" android:pathPrefix="/knowledge/"/>
</intent-filter>

<!-- Custom scheme fallback -->
<intent-filter>
  <action android:name="android.intent.action.VIEW"/>
  <category android:name="android.intent.category.DEFAULT"/>
  <category android:name="android.intent.category.BROWSABLE"/>
  <data android:scheme="kanban"/>
</intent-filter>

<!-- ACTION_SEND share target (F-547) -->
<intent-filter>
  <action android:name="android.intent.action.SEND"/>
  <category android:name="android.intent.category.DEFAULT"/>
  <data android:mimeType="text/plain"/>
  <data android:mimeType="image/*"/>
</intent-filter>
```

In `app.json` (managed-friendly form):

```json
{
  "expo": {
    "android": {
      "intentFilters": [
        {
          "autoVerify": true,
          "action": "VIEW",
          "category": ["DEFAULT", "BROWSABLE"],
          "data": [
            { "scheme": "https", "host": "kanban.YOUR-DOMAIN" },
            { "scheme": "https", "host": "kanban.YOUR-DOMAIN", "pathPrefix": "/m/card/" },
            { "scheme": "https", "host": "kanban.YOUR-DOMAIN", "pathPrefix": "/knowledge/" }
          ]
        },
        { "action": "VIEW", "category": ["DEFAULT", "BROWSABLE"], "data": [{ "scheme": "kanban" }] },
        { "action": "SEND", "category": ["DEFAULT"], "data": [{ "mimeType": "text/plain" }, { "mimeType": "image/*" }] }
      ]
    }
  }
}
```

### 4.5 Back-stack rules

| From | System back goes to | Reason |
|---|---|---|
| Card detail (entered from board tap) | Board lane (preserved scroll) | Standard back |
| Card detail (entered from notification) | Board lane (replaces notification stub) | Synthesize parent per Android guidelines |
| Card detail (entered from deep link cold-start) | Board lane (synthesize parent) | Same |
| Capture modal | Previous screen (dismiss) | Modal pop |
| Share-target landing | System (closes app, returns to source) | Per platform convention |
| Knowledge edit (from share) | System (close) | One-shot |

---

## 5. State Management

### 5.1 Zustand stores (client-only state)

| Store | Shape | Persisted? |
|---|---|---|
| `auth-store` | `{ token: string \| null; user: UserSchema \| null; isHydrated: boolean; signIn(creds), signOut(), setUser(u), hydrate() }` | **Token persisted via SecureStore** (NOT MMKV). User profile mirrored to MMKV for cold-start render before token validation. |
| `ui-store` | `{ activeLane: 'backlog'\|'today'\|'in_progress'\|'done'; scope: 'personal'\|'inbox'\|'all'\|'shared'; search: string; openSheet: 'capture'\|'lanePicker'\|'profile'\|null; theme: 'light'\|'dark'\|'system'; }` | Theme persisted via MMKV. Active lane / scope mirrored to MMKV so cold start preserves last-viewed lane. |
| `capture-draft-store` | `{ pendingText: string; pendingPhotos: PhotoDraft[]; pendingVoice: VoiceDraft \| null; flush(): Promise<void> }` | Persisted via MMKV (V1 offline queue per S2 §1.1). MVP keeps in-memory; mutation persists draft only if send fails. |

### 5.2 React Query (server state)

**Defaults:**

```ts
new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 24 * 60 * 60_000,            // 24h offline read
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
      networkMode: "offlineFirst",         // serve from cache when offline (NetInfo gate)
    },
    mutations: {
      retry: false,                        // mutations never auto-retry; user retries explicitly
    },
  },
})
```

**Persistence:** `persistQueryClient` with `createSyncStoragePersister(MMKV)`.
SecureStore is **NOT** used for the React Query cache (per §15 risk: 2 KB
per-key cap; cache regularly exceeds). Auth token lives in SecureStore
directly via `auth-store`.

### 5.3 Query catalog (S1 §2 mapped to S3 screens)

| Hook | Query key | Endpoint | Stale time | Consumed by |
|---|---|---|---|---|
| `useCards(scope, project?)` | `['cards', scope, project]` | `GET /api/cards?scope=&project=` | 30s | BoardScreen, ScopeSheet |
| `useArchive()` | `['cards', 'archived']` | `GET /api/cards/archived` | 60s | ArchiveScreen (V1) |
| `useCard(id)` | `['card', id]` | `GET /api/cards/:id` | 30s | CardDetailScreen |
| `useCardEvents(id)` | `['card', id, 'events']` | `GET /api/cards/:id/events` | 0 (always refetch on focus) | CardTimeline |
| `useUnreadCounts()` | `['messages', 'unread']` | `GET /api/messages/unread` (bare object Record<id,number>) | 30s | BoardScreen, NotificationListScreen |
| `useCardKnowledge(id)` | `['card', id, 'knowledge']` | `GET /api/cards/:id/knowledge` | 30s | CardDetailScreen knowledge section |
| `useInsights(cardId)` | `['card', cardId, 'insights']` | `GET /api/cards/:id/insights` | 30s | AiInsightsCard |
| `useInsight(id)` | `['insight', id]` | `GET /api/insights/:id` | 30s | (push deep-link target) |
| `useKnowledge(scope, q?, tag?, cursor?)` | `['knowledge', scope, q, tag, cursor]` | `GET /api/knowledge?...` (cursor pagination) | 60s | KnowledgeListScreen |
| `useKnowledgeItem(id)` | `['knowledge', id]` | `GET /api/knowledge/:id` | 60s | KnowledgeDetailScreen |
| `useTemplates()` | `['templates']` | `GET /api/templates` | 5 min | CaptureSheet, TemplatesTab (V1) |
| `useNotifications()` | `['notifications']` | `GET /api/notifications` | 30s | NotificationListScreen, bell badge |
| `useUsers()` | `['users']` | `GET /api/users` | 10 min | Assignee/share chips |
| `useReview()` | `['review']` | `GET /api/review` | 5 min | WeeklyReviewScreen (V2) |
| `useTokens()` | `['tokens']` | `GET /api/tokens` | on-demand | Settings (V2) |
| `useMirrorTokens()` | `['mirror-tokens']` | `GET /api/mirror/tokens` | on-demand | Settings (V2) |

### 5.4 Mutation catalog with optimistic update + rollback

| Mutation | Endpoint | Optimistic | Rollback |
|---|---|---|---|
| `createCard` | `POST /api/cards` | Prepend Card stub to `['cards', scope]` with temporary id | Remove stub on error; toast |
| `patchCard` | `PATCH /api/cards/:id` | Merge fields into `['card', id]` + `['cards', scope]` cache entries | Restore prior snapshot from `onMutate` context |
| `archiveCard` | `DELETE /api/cards/:id` | Remove from `['cards', scope]` | Re-insert at original index |
| `restoreCard` | `PATCH /api/cards/:id/restore` | Remove from `['cards', 'archived']` | Re-insert |
| `deleteCardPermanent` | `DELETE /api/cards/:id/permanent` | Remove from archived list | Re-insert |
| `purgeArchived` | `POST /api/cards/archived/purge` | Clear archived list | Restore on error |
| `uploadAttachment` | `POST /api/cards/:id/attachments` | Append placeholder tile to `['card', id]` | Remove placeholder; toast |
| `cardFromImage` | `POST /api/cards/from-image` | Prepend stub with `needs_review=true` | Remove stub |
| `cardFromAudio` | `POST /api/cards/from-audio` | Same | Same |
| `postMessage` | `POST /api/cards/:id/messages` | Append CardEvent with `entry_type:'message'` to `['card', id, 'events']` with temp id | Remove on error; preserve message text in input |
| `markEventsRead` | `PUT /api/cards/:id/events/read` | Decrement `['messages', 'unread']` entry | Restore |
| `enqueueInsight` | `POST /api/cards/:id/insights/brainstorm` | Prepend pending Insight to `['card', id, 'insights']` | Remove |
| `createKnowledge` | `POST /api/knowledge` | Insert into `['knowledge', scope]` head | Remove |
| `patchKnowledge` | `PATCH /api/knowledge/:id` | Merge | Restore |
| `archiveKnowledge` | `DELETE /api/knowledge/:id` | Remove | Re-insert |
| `linkKnowledgeToCard` | `POST /api/knowledge/:id/links` | Append to `['card', cardId, 'knowledge']` | Remove |
| `unlinkKnowledge` | `DELETE /api/knowledge/:id/links/:cardId` | Remove | Re-insert |
| `refetchKnowledge` | `POST /api/knowledge/:id/refetch` | Set fetch_status='pending' optimistically | Restore |
| `createTemplate` | `POST /api/templates` | Append to `['templates']` | Remove |
| `instantiateTemplate` | `POST /api/templates/:id/instantiate` | Prepend Card stub to `['cards', scope]` | Remove |
| `markNotificationsRead` | `PUT /api/notifications/read` | Set `read=true` on entries | Revert |
| `markAllNotificationsRead` | `PUT /api/notifications/read-all` | Set all `read=true` | Revert |
| `subscribeFcm` | `POST /api/push/fcm/subscribe` | none | toast |
| `unsubscribeFcm` | `DELETE /api/push/fcm/subscribe` | none | toast |
| `createMirrorToken` | `POST /api/mirror/tokens` | none | toast |
| `deleteMirrorToken` | `DELETE /api/mirror/tokens/:token` | Remove from list | Restore |
| `createApiToken` | `POST /api/tokens` | none | toast |
| `deleteApiToken` | `DELETE /api/tokens/:token` | Remove | Restore |

### 5.5 WebSocket → React Query mutation map

Per S1 §3.2 (19 events). Each WS event triggers a `queryClient.setQueryData`
or `invalidateQueries`. Visibility predicate is **already enforced server-side**
(S1 §5.7) — client does NOT re-filter.

| WS `type` | Cache action |
|---|---|
| `hello` | Mark WS connected in `ui-store` (no cache change) |
| `card.created` | `setQueryData(['cards', scope])`: prepend; if card belongs to a non-loaded scope, `invalidateQueries(['cards', otherScope])` |
| `card.updated` | `setQueryData(['cards', scope])`: replace by id; `setQueryData(['card', id])`: merge |
| `card.deleted` | `setQueryData(['cards', scope])`: filter out; `setQueryData(['card', id], undefined)`; if currently focused on that detail screen, snackbar + nav back |
| `card.message` | `setQueryData(['card', id, 'events'])`: append; `setQueryData(['messages', 'unread'])`: increment |
| `card.ai_response` | same as `card.message` |
| `card.link.created` | `invalidateQueries(['card', from_card_id, 'links'])`, same for `to_card_id` (V2 only) |
| `card.link.deleted` | same |
| `template.created` | `setQueryData(['templates'])`: prepend |
| `template.updated` | replace by id |
| `template.deleted` | remove |
| `knowledge.created` | `setQueryData(['knowledge', 'mine'])` + `['knowledge', 'inbox']` depending on visibility |
| `knowledge.updated` | replace |
| `knowledge.deleted` | remove |
| `knowledge.link.created` | `invalidateQueries(['card', card_id, 'knowledge'])` and `invalidateQueries(['knowledge', knowledge_id])` |
| `knowledge.link.deleted` | same |
| `insight.queued` | `setQueryData(['card', card_id, 'insights'])`: prepend |
| `insight.updated` | replace by id |
| `insight.failed` | replace by id (status='failed') |

---

## 6. Networking Layer

### 6.1 `ky` instance (`src/api/client.ts`)

```ts
import ky from "ky";
import { z } from "zod";
import { CONFIG } from "@/env";
import { secureStore } from "@/storage/secure";
import { ApiError, mapStatusError } from "./errors";

export const api = ky.create({
  prefixUrl: CONFIG.API_URL,             // e.g. https://kanban.example.com
  timeout: 15_000,
  retry: {
    limit: 2,
    methods: ["get", "head"],            // idempotent only
    statusCodes: [408, 500, 502, 503, 504],
    backoffLimit: 4_000,
  },
  hooks: {
    beforeRequest: [
      async (req) => {
        const token = await secureStore.get("authToken");
        if (token) req.headers.set("Authorization", `Bearer ${token}`);
        req.headers.set("X-Client", "android-rn");
        req.headers.set("X-Client-Version", CONFIG.APP_VERSION);
      },
    ],
    beforeError: [async (err) => mapStatusError(err)],
  },
});

// Typed GET helper that runs Zod parse — RULE 2 verbatim mirror gate
export async function getJson<T extends z.ZodTypeAny>(
  path: string,
  schema: T,
  searchParams?: Record<string, string | number>,
): Promise<z.infer<T>> {
  const raw = await api.get(path, { searchParams }).json();
  return schema.parse(raw);             // throws ZodError on shape drift
}
```

### 6.2 Auth strategy — `POST /api/auth/native/token` (NEW endpoint, per S2 §8.1)

Stage 2 flagged that cookies-via-OkHttp are fragile and recommended a new
bearer endpoint. We adopt that path. Stage 5 backend work:

- New route `POST /api/auth/native/token`
  - Body: `{ email, password, device_label? }` OR `{ session_cookie }` (exchange existing)
  - Response: `{ token, scope: 'native', user: User }`
  - Implementation: insert row into `mirror_tokens` with `scope='native'`
    (extend CHECK constraint `mirror_tokens_scope_chk` to allow `'native'`).
  - `userFromApiToken` already accepts any non-mirror scope as authenticated
    write user (S1 §5.3) — verify and extend.

Client sends `Authorization: Bearer <token>` on every request. No cookies.

### 6.3 Zod schemas — RULE 2 verbatim mirror

Per S1 §2 every list shape is recorded precisely (bare-array vs wrapper).
Example schemas (truncated):

```ts
// src/api/schemas/envelopes.ts
import { z } from "zod";
import { Card } from "./card";
import { KnowledgeItem } from "./knowledge";
import { Notification } from "./notification";

// GET /api/cards            → BARE ARRAY      (S1 §2.2)
export const CardsList = z.array(Card);
// GET /api/cards/archived   → BARE ARRAY
export const ArchivedList = z.array(Card);
// GET /api/cards/:id/events → BARE ARRAY
export const EventsList = z.array(CardEvent);
// GET /api/messages/unread  → BARE OBJECT Record<cardId, count>
export const UnreadCounts = z.record(z.string().uuid(), z.number().int());
// GET /api/users            → BARE ARRAY
export const UsersList = z.array(User);
// GET /api/templates        → BARE ARRAY
export const TemplatesList = z.array(Template);
// GET /api/notifications    → BARE ARRAY
export const NotificationsList = z.array(Notification);
// GET /api/mirror/tokens    → BARE ARRAY
// GET /api/tokens           → BARE ARRAY
// GET /api/telegram/identities → BARE ARRAY

// GET /api/knowledge        → WRAPPER OBJECT
export const KnowledgeList = z.object({
  items: z.array(KnowledgeItem),
  next_cursor: z.string().nullable(),
});
// GET /api/cards/:id/insights → WRAPPER
export const InsightsList = z.object({ insights: z.array(Insight) });
// GET /api/cards/:id/knowledge → WRAPPER
export const CardKnowledgeList = z.object({ items: z.array(KnowledgeItem) });
// GET /api/cards/:id/links     → WRAPPER (V2)
export const CardLinksList = z.object({
  links: z.array(CardLink),
  related_cards: z.array(Card),
});
// GET /api/cards/:id/chain     → WRAPPER (V2)
export const CardChain = z.object({
  nodes: z.array(Card),
  edges: z.array(CardLink),
  insights: z.array(Insight),
});
// GET /api/review               → WRAPPER (V2)
export const ReviewSummary = z.object({
  done: z.array(Card),
  stale: z.array(Card),
  stuck: z.array(Card),
  summary: z.string().nullable(),
});
```

**RULE 1 / Stage-4 pre-flight reference table** (every endpoint Stage 5 will
implement — pre-flight grep target):

| Stage 5 hook | Backend handler | S1 §ref | Envelope |
|---|---|---|---|
| `useCards` | `routes/cards.ts:33-41` | §2.2 | bare array |
| `useArchive` | `routes/cards.ts:44-50` | §2.2 | bare array |
| `useCard` | `routes/cards.ts:52-64` | §2.2 | bare object |
| `useCardEvents` | `routes/chat.ts` | §2.2 | bare array |
| `useUnreadCounts` | `routes/chat.ts` (`GET /api/messages/unread`) | §2.2 | bare object Record |
| `useCardKnowledge` | `routes/cards.ts:272-284` | §2.2 | wrapper `{items}` |
| `useInsights` | `routes/insights.ts` | §2.3 | wrapper `{insights}` |
| `useKnowledge` | `routes/knowledge.ts` | §2.4 | wrapper `{items, next_cursor}` |
| `useTemplates` | `routes/templates.ts` | §2.5 | bare array |
| `useNotifications` | `routes/notifications.ts` | §2.9 | bare array |
| `useReview` | `routes/review.ts` | §2.10 | wrapper |

### 6.4 Error mapping

```ts
// src/api/errors.ts
export class ApiError extends Error {
  constructor(public readonly status: number, public readonly body: unknown, message: string) {
    super(message);
  }
}

export async function mapStatusError(err: any) {
  const status = err?.response?.status as number | undefined;
  if (!status) return err;
  const body = await err.response?.json().catch(() => undefined);
  const apiErr = new ApiError(status, body, body?.error ?? `HTTP ${status}`);
  if (status === 401) await onAuth401(apiErr);             // refresh once; if still 401 → signOut + nav to login
  if (status === 410) return apiErr;                        // FCM push subscription cleanup — swallow at caller
  return apiErr;
}
```

| Status | Handling |
|---|---|
| 401 | Attempt one silent re-auth via `/api/auth/native/token` exchange (if email+password cached in SecureStore). On second 401 → `authStore.signOut()` → nav `(auth)/login`, preserve current route as `pendingDeepLink` |
| 403 | Toast "You don't have access to that." — typical for signup-disabled or non-owner template |
| 404 | Component-level: empty state or "no longer exists" (S3 §3.4 F-740) |
| 409 | Inline error caption (e.g. email taken, template name conflict) |
| 410 | FCM subscription gone — `unsubscribeFcm` locally + delete from SecureStore device-token record. NEVER surface to user. |
| 413 | Toast "File too large (max 5 MB)." |
| 415 | Toast "Unsupported file type." (only `png/jpeg/webp/gif` per S1 §6.3) |
| 429 | Toast with the body's specific limit message (per S1 §6.4: per-card 1 / per-user 5 / per-day 50) + retry-after backoff |
| 5xx | After 2 retries (idempotent only) → toast "Couldn't reach the board." + Snackbar Retry action |

### 6.5 Multipart upload helper

```ts
export async function postMultipart<T extends z.ZodTypeAny>(
  path: string,
  parts: { name: string; uri: string; mime: string; filename?: string }[],
  extra: Record<string, string> = {},
  schema: T,
): Promise<z.infer<T>> {
  const form = new FormData();
  for (const p of parts) {
    // RN-specific FormData blob shape:
    form.append(p.name, { uri: p.uri, name: p.filename ?? p.name, type: p.mime } as any);
  }
  for (const [k, v] of Object.entries(extra)) form.append(k, v);
  const raw = await api.post(path, { body: form }).json();
  return schema.parse(raw);
}
```

Used by: `POST /api/cards/:id/attachments`, `POST /api/cards/from-image`,
`POST /api/cards/from-audio` (new — S2 §8.3).

### 6.6 WebSocket client (`src/ws/socket.ts`)

```ts
const url = `${CONFIG.WS_URL}/ws`;       // ws:// or wss://
// Authentication: per Stage 2 §8.1 recommendation, prefer bearer in subprotocol.
// Backend must accept Sec-WebSocket-Protocol: "bearer.<token>" (Stage 5 work).
// MVP fallback: cookie via @react-native-cookies/cookies — explicit fragility risk.
const socket = new WebSocket(url, [`bearer.${token}`]);
```

Reconnect loop:

```ts
let attempt = 0;
function scheduleReconnect() {
  const delay = Math.min(500 * 2 ** attempt, 10_000);
  setTimeout(() => connect(), delay);
  attempt++;
}
```

Heartbeat: server does NOT ping (S1 §3.1). Client sends a JSON `{type:"ping"}`
every 25 s; server ignores (no schema for client→server messages per S1 §3.3,
backend should accept and discard). If no message received for 90 s, close
and reconnect.

### 6.7 Connectivity awareness

`@react-native-community/netinfo` provides `useNetInfo()`. React Query's
`onlineManager.setOnline()` is bound to NetInfo state, so when offline:

- Queries pause; cached data still served.
- Mutations queue (via `MutationCache`) and replay on reconnect (V1 polish).
- UI surface: `BoardScreen` TopAppBar grows a `cloud_off` icon (S3 §3.2
  "Offline (WS down)" state).

---

## 7. Security & Secrets

### 7.1 Auth token storage — `expo-secure-store` ONLY

| Property | Value |
|---|---|
| Library | `expo-secure-store@14.0.0` |
| Android backing | EncryptedSharedPreferences (API 23+) with AES256-GCM hardware-backed key on API 29+ (our minSdkVersion = 29 so hardware-backed always) |
| Keys stored | `authToken` (bearer from `/api/auth/native/token`), `deviceId` (UUID v4 generated on first launch, used in FCM subscribe body) |
| Item size | Tokens are ~32 base64url bytes ≈ 43 chars — well under SecureStore 2048-byte cap |
| AsyncStorage banned for tokens | yes — explicit lint rule (see §7.7) |
| API | `secureStore.set/get/delete` wrapper in `src/storage/secure.ts` (always `await` — never sync) |

### 7.2 No secrets in the JS bundle

- `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_WS_URL`, `SENTRY_DSN` — these are
  public by design (URL + crash reporter DSN).
- `google-services.json` — bundled at build by EAS Secret (`EAS_GOOGLE_SERVICES_JSON`).
  Contains FCM sender ID; safe per Firebase model.
- VAPID public key — NOT used by native app (FCM replaces web-push entirely).
- OpenAI / OpenRouter / Tavily / Telegram tokens — server-only (S1 §1.3).
  Native never knows them.
- Cookie secret — server-only.

### 7.3 HTTPS only — Network Security Config

`android/app/src/main/res/xml/network_security_config.xml` (managed:
`expo-build-properties` plugin can emit):

```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false">
    <trust-anchors>
      <certificates src="system"/>
    </trust-anchors>
  </base-config>
  <!-- Dev only: allow plaintext to LAN backend at 192.168.50.13 -->
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">192.168.50.13</domain>
  </domain-config>
</network-security-config>
```

The dev exception is ONLY in the development EAS profile's manifest overlay;
preview and production manifests exclude the `<domain-config>` block.

### 7.4 Certificate pinning

MVP: rely on system trust (Play-managed CA store). V2: add pinning via
OkHttp `CertificatePinner` (Bare workflow) or `react-native-ssl-pinning` —
defer due to operational risk if cert rotates.

### 7.5 Biometric unlock (V1 per S3)

`expo-local-authentication`. On app **foregrounded after >5 min in background**:

```ts
const result = await LocalAuthentication.authenticateAsync({
  promptMessage: "Unlock SmartKanban",
  fallbackLabel: "Use device PIN",
});
if (!result.success) { authStore.signOut(); return; }
const token = await secureStore.get("authToken");
```

Configurable via Settings (V1).

### 7.6 Backup rules — `android:fullBackupContent`

`android/app/src/main/res/xml/backup_rules.xml`:

```xml
<full-backup-content>
  <exclude domain="sharedpref" path="SecureStore"/>
  <exclude domain="sharedpref" path="MMKV"/>
  <exclude domain="database" path="expo-secure-store.db"/>
</full-backup-content>
```

`app.json`: `"android": { "allowBackup": true, "fullBackupContent": "@xml/backup_rules" }`.
Prevents adb-backup exfiltration of the auth token even on a rooted phone.

### 7.7 Runtime permissions (declared in manifest, requested at use site)

| Permission | When requested | Why |
|---|---|---|
| `android.permission.INTERNET` | install (auto-granted) | All API + WS traffic |
| `android.permission.ACCESS_NETWORK_STATE` | install | NetInfo |
| `android.permission.VIBRATE` | install | Haptics |
| `android.permission.CAMERA` | first time user taps Camera (F-125 / F-733) | Photo capture; F-126 fallback path |
| `android.permission.RECORD_AUDIO` | first time user taps Voice (F-127) | Voice capture |
| `android.permission.READ_MEDIA_IMAGES` (API 33+) | first time user taps Photo Library (F-734) | `PickVisualMedia` |
| `android.permission.READ_EXTERNAL_STORAGE` (API ≤32) | same as above (legacy) | Same |
| `android.permission.POST_NOTIFICATIONS` (API 33+) | first foreground after sign-in (S3 §3.13 push permission flow) | FCM display |

Lint rule (eslintrc): forbid `AsyncStorage` import; require all token reads
through `src/storage/secure.ts`:

```js
// .eslintrc.js
rules: {
  "no-restricted-imports": ["error", {
    paths: [
      { name: "@react-native-async-storage/async-storage",
        message: "Use src/storage/secure.ts for tokens, src/storage/cache.ts (MMKV) for non-secret cache." },
    ],
  }],
}
```

---

## 8. Push Notifications (FCM)

### 8.1 Backend changes required (Stage 5 to implement before Android push works)

Per S2 §8.2:

| Item | Spec |
|---|---|
| Table | `CREATE TABLE fcm_subscriptions ( id SERIAL PK, user_id UUID FK users CASCADE, fcm_token TEXT UNIQUE NOT NULL, device_id TEXT NOT NULL, device_label TEXT, created_at TIMESTAMPTZ default now(), last_seen_at TIMESTAMPTZ default now() );` plus `CREATE INDEX idx_fcm_sub_user(user_id);` |
| Endpoint | `POST /api/push/fcm/subscribe` body `{ token, device_id, device_label? }` → 204 (idempotent upsert on `fcm_token`) |
| Endpoint | `DELETE /api/push/fcm/subscribe` body `{ token }` → 204 |
| Fan-out | Extend `pushToUser(uid, payload)` in `server/src/push.ts` (S1 §7.5) to ALSO post to FCM via `firebase-admin` (new server dep). 410/404 from FCM → auto-delete subscription row (mirror existing web-push 410 cleanup pattern S1 §7.5) |
| Env vars | `FCM_SERVICE_ACCOUNT_JSON` (path or inline base64) for `firebase-admin.initializeApp({ credential: cert(...) })` |
| Endpoint | New `POST /api/auth/native/token` (§6.2) — required for bearer flow |

### 8.2 Client-side init (`src/push/fcm.ts`)

```ts
import messaging from "@react-native-firebase/messaging";
import * as Application from "expo-application";

export async function initFcmAfterAuth() {
  // 1. Notification permission (Android 13+)
  if (Platform.Version >= 33) {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    if (granted !== "granted") return;        // user declined; respect choice
  }
  // 2. Ensure channels (idempotent)
  await ensureChannels();
  // 3. Get token
  const token = await messaging().getToken();
  await api.post("api/push/fcm/subscribe", {
    json: { token, device_id: await getOrCreateDeviceId(), device_label: deviceLabel() },
  });
  // 4. Refresh listener
  messaging().onTokenRefresh(async (newToken) => {
    await api.post("api/push/fcm/subscribe", { json: { token: newToken, device_id: ... } });
  });
}

export async function teardownFcmOnSignOut() {
  const token = await messaging().getToken();
  await api.delete("api/push/fcm/subscribe", { json: { token } }).catch(() => {});
  await messaging().deleteToken();
}
```

### 8.3 Notification channels (`src/push/channels.ts`)

Per S3 §3.13 — 3 channels created on first launch via `@notifee/react-native`:

```ts
import notifee, { AndroidImportance } from "@notifee/react-native";

export async function ensureChannels() {
  await notifee.createChannel({
    id: "card-activity",
    name: "Card activity",
    description: "Messages, mentions, AI replies, share announcements",
    importance: AndroidImportance.HIGH,
    sound: "default",
    vibration: true,
  });
  await notifee.createChannel({
    id: "insights",
    name: "AI insights",
    description: "Brainstorm results",
    importance: AndroidImportance.DEFAULT,
  });
  await notifee.createChannel({
    id: "reminders",
    name: "Due-date reminders",
    description: "Cards approaching or past due",
    importance: AndroidImportance.HIGH,
    sound: "default",
  });
}
```

`expo-notifications` and `@notifee/react-native` coexist by convention:
**Notifee owns all display logic**; `expo-notifications` is kept only for its
`registerTaskAsync` background-message hook plumbing (Notifee uses it too).
Channels are created by Notifee. `expo-notifications.setNotificationChannel`
is NOT called.

### 8.4 Foreground / background / quit-state handling (`src/push/handler.ts`)

```ts
import messaging from "@react-native-firebase/messaging";
import notifee, { EventType } from "@notifee/react-native";
import { router } from "expo-router";

// Foreground — Notifee displays explicitly (FCM hides foreground notifications)
messaging().onMessage(async (msg) => {
  await displayFromFcm(msg);
});

// Background — must be registered at app entry (RN headlessTask)
messaging().setBackgroundMessageHandler(async (msg) => {
  await displayFromFcm(msg);
});

async function displayFromFcm(msg: FirebaseMessagingTypes.RemoteMessage) {
  const { cardId, knowledgeId, type, title, body } = msg.data ?? {};
  await notifee.displayNotification({
    title: title ?? "SmartKanban",
    body: body ?? "",
    android: {
      channelId: channelForType(type),    // card-activity / insights / reminders
      smallIcon: "ic_notif",
      pressAction: { id: "open", launchActivity: "default" },
      actions: type === "card.message" ? [
        { title: "Reply", pressAction: { id: "reply" },
          input: { placeholder: "Type a reply…", allowFreeFormInput: true } },
        { title: "Mark read", pressAction: { id: "mark-read" } },
      ] : undefined,
      groupId: cardId ?? knowledgeId,
    },
    data: msg.data,
  });
}

// Tap handler — Notifee dispatch
notifee.onForegroundEvent(({ type, detail }) => {
  if (type === EventType.PRESS) handleTap(detail.notification?.data);
  if (type === EventType.ACTION_PRESS) handleAction(detail);
});
notifee.onBackgroundEvent(async ({ type, detail }) => {
  if (type === EventType.PRESS) handleTap(detail.notification?.data);
  if (type === EventType.ACTION_PRESS) await handleAction(detail);
});

function handleTap(data: any) {
  if (data?.cardId) router.push(`/board/${data.cardId}`);
  else if (data?.knowledgeId) router.push(`/knowledge/${data.knowledgeId}`);
}

async function handleAction(detail: any) {
  const { pressAction, input, notification } = detail;
  if (pressAction.id === "reply" && input) {
    await api.post(`api/cards/${notification.data.cardId}/messages`, { json: { content: input } });
    await notifee.cancelNotification(notification.id);
  }
  if (pressAction.id === "mark-read") {
    await api.put(`api/cards/${notification.data.cardId}/events/read`, {
      json: { last_read_id: Number(notification.data.eventId) },
    });
    await notifee.cancelNotification(notification.id);
  }
}
```

### 8.5 Background data sync

NOT in MVP. Notification payload is self-contained (title + body + cardId).
Tap → app foregrounds → screen mount triggers `useCard(id)` GET which fetches
fresh data. No WorkManager job.

V2 candidate: WorkManager periodic sync to pre-warm board cache.

---

## 9. WebSocket Lifecycle (foreground only per S2 §8.6)

| Trigger | Action |
|---|---|
| App foregrounded **and** authenticated | Connect to `wss://APP_URL/ws` with `Sec-WebSocket-Protocol: bearer.<token>` |
| App backgrounded | Start 30 s grace timer; if app still backgrounded at expiry, close socket with code 1000 |
| App re-foregrounded within grace | Cancel timer; keep socket open |
| Connection drops (any reason) | Exponential backoff 500 ms → 10 s cap (S1 §3.1, S2 F-991) |
| Auth fails (4401 from server) | Try one silent re-auth; on second failure → `authStore.signOut()` |
| 90 s without server message | Send client ping `{type:"ping"}`; if still no inbound within next 30 s → reconnect |
| App killed (notification tap, deep link cold start) | Lazy connect after auth resolves on mount |

WS message → cache mutation map: see §5.5.

---

## 10. Build Configuration

### 10.1 Gradle (managed by Expo / EAS; values declared in `app.json` and `eas.json`)

| Setting | Value |
|---|---|
| `minSdkVersion` | 29 |
| `targetSdkVersion` | 35 |
| `compileSdkVersion` | 35 |
| `buildToolsVersion` | 35.0.0 |
| `versionCode` | auto-incremented per EAS Build via `eas-cli` (`autoIncrement: "version"`) |
| `versionName` | derived from git tag for release builds (`v1.2.3` → `1.2.3`); `0.0.0-dev.<short-sha>` for preview |
| Hermes | enabled (default RN 0.76+) |
| ProGuard / R8 | enabled in release; RN-safe `proguard-rules.pro` from RN docs |
| Signing | Play App Signing via EAS Build managed credentials |
| Architectures | `arm64-v8a`, `armeabi-v7a`, `x86_64` (x86_64 for emulators), `x86` excluded |

### 10.2 `app.json` excerpt

```json
{
  "expo": {
    "name": "SmartKanban",
    "slug": "smartkanban",
    "version": "1.0.0",
    "scheme": "kanban",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#FBF8F4"
    },
    "userInterfaceStyle": "automatic",
    "android": {
      "package": "com.smartkanban.app",
      "versionCode": 1,
      "permissions": ["CAMERA", "RECORD_AUDIO", "POST_NOTIFICATIONS", "VIBRATE"],
      "allowBackup": true,
      "fullBackupContent": "@xml/backup_rules",
      "googleServicesFile": "./google-services.json",
      "adaptiveIcon": {
        "foregroundImage": "./assets/icon.png",
        "backgroundColor": "#6C4CFF"
      },
      "blockedPermissions": ["READ_EXTERNAL_STORAGE"],
      "intentFilters": [/* … per §4.4 … */]
    },
    "plugins": [
      "expo-router",
      "expo-font",
      ["expo-secure-store", { "faceIDPermission": "Unlock SmartKanban with biometrics." }],
      ["expo-image-picker", { "photosPermission": "Attach images to your cards." }],
      ["expo-camera", { "cameraPermission": "Capture a photo of a card." }],
      ["expo-av", { "microphonePermission": "Record voice notes for cards." }],
      ["expo-build-properties", {
        "android": {
          "minSdkVersion": 29,
          "compileSdkVersion": 35,
          "targetSdkVersion": 35,
          "kotlinVersion": "1.9.25",
          "networkSecurityConfig": "./android-resources/network_security_config.xml"
        }
      }],
      "@react-native-firebase/app",
      "@notifee/react-native"
    ],
    "extra": {
      "router": { "origin": false },
      "eas": { "projectId": "PLACEHOLDER" }
    }
  }
}
```

### 10.3 Adaptive icon / splash

- Adaptive icon: 108 dp foreground (brand "K" mark on transparent), 108 dp
  background (solid `#6C4CFF` brand seed — S3 §1.2).
- Splash screen: `expo-splash-screen` with branded "K" centered on `#FBF8F4`
  ceramic surface (S3 §1.3) light theme; `#161618` dark theme.

---

## 11. CI/CD

### 11.1 GitHub Actions matrix

| Workflow | Trigger | Steps |
|---|---|---|
| `pr.yml` | PR opened/sync | `npm ci` → `npm run verify:pinned` → `npm run lint` → `npm run typecheck` → `npm run test -- --coverage` → upload coverage → Detox build + test on Android API 33 emulator (Pixel 6 Pro) |
| `main.yml` | push to `main` | `eas build --profile preview --platform android --non-interactive` → `eas update --branch preview --message "$(git log -1 --pretty=%s)"` |
| `release.yml` | tag matching `v*` | `eas build --profile production --platform android --non-interactive` → `eas submit -p android --latest --track internal` |

### 11.2 Quality gates (PR-blocking)

| Gate | Threshold |
|---|---|
| Lint | 0 errors |
| Typecheck | 0 errors |
| `verify:pinned` | exits 0 (no `^` or `~`) |
| Jest coverage | ≥ 80% on `src/api/`, `src/state/`, `src/utils/` |
| Detox suite | 100% pass on the 4 smoke flows (login, capture, card-detail, share-target) |

### 11.3 Secrets (GitHub Actions + EAS Secret)

| Name | Where | Used by |
|---|---|---|
| `EXPO_TOKEN` | GitHub Actions | `eas-cli` auth |
| `EAS_GOOGLE_SERVICES_JSON` | EAS Secret | Bundled into `google-services.json` at build |
| `SENTRY_AUTH_TOKEN` | GitHub Actions | Sentry release sourcemap upload |
| `ANDROID_PLAY_SERVICE_ACCOUNT_JSON` | EAS Secret | `eas submit` Play upload |

---

## 12. Environment Configuration

### 12.1 EAS profiles (`eas.json`)

```json
{
  "cli": { "version": ">= 13.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "android": { "gradleCommand": ":app:assembleDebug" },
      "env": {
        "EXPO_PUBLIC_API_URL": "http://192.168.50.13",
        "EXPO_PUBLIC_WS_URL": "ws://192.168.50.13",
        "EXPO_PUBLIC_ENV": "development"
      }
    },
    "preview": {
      "distribution": "internal",
      "android": { "buildType": "apk" },
      "env": {
        "EXPO_PUBLIC_API_URL": "https://kanban-preview.YOUR-DOMAIN",
        "EXPO_PUBLIC_WS_URL": "wss://kanban-preview.YOUR-DOMAIN",
        "EXPO_PUBLIC_ENV": "preview"
      },
      "channel": "preview"
    },
    "production": {
      "android": { "buildType": "app-bundle" },
      "env": {
        "EXPO_PUBLIC_API_URL": "https://kanban.YOUR-DOMAIN",
        "EXPO_PUBLIC_WS_URL": "wss://kanban.YOUR-DOMAIN",
        "EXPO_PUBLIC_ENV": "production"
      },
      "autoIncrement": "version",
      "channel": "production"
    }
  },
  "submit": {
    "production": {
      "android": {
        "serviceAccountKeyPath": "./play-service-account.json",
        "track": "internal",
        "releaseStatus": "draft"
      }
    }
  }
}
```

### 12.2 `src/env.ts`

```ts
import { z } from "zod";

const EnvSchema = z.object({
  EXPO_PUBLIC_API_URL: z.string().url(),
  EXPO_PUBLIC_WS_URL: z.string().regex(/^wss?:\/\//),
  EXPO_PUBLIC_ENV: z.enum(["development", "preview", "production"]),
  EXPO_PUBLIC_SENTRY_DSN: z.string().url().optional(),
});

export const CONFIG = {
  ...EnvSchema.parse({
    EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
    EXPO_PUBLIC_WS_URL: process.env.EXPO_PUBLIC_WS_URL,
    EXPO_PUBLIC_ENV: process.env.EXPO_PUBLIC_ENV,
    EXPO_PUBLIC_SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN,
  }),
  APP_URL: process.env.EXPO_PUBLIC_API_URL!,
  APP_VERSION: Application.nativeApplicationVersion ?? "0.0.0",
};
```

Fails fast at app boot if env is malformed.

---

## 13. Telemetry & Monitoring

### 13.1 Sentry

`@sentry/react-native@6.4.0`. Initialized in `app/_layout.tsx`:

```ts
Sentry.init({
  dsn: CONFIG.EXPO_PUBLIC_SENTRY_DSN,
  enableAutoPerformanceTracing: true,
  enableNative: true,
  tracesSampleRate: 0.1,
  environment: CONFIG.EXPO_PUBLIC_ENV,
  beforeSend(event) {
    // PII scrub: drop card titles, user emails, message bodies
    if (event.request?.data) delete event.request.data;
    if (event.extra) {
      for (const k of Object.keys(event.extra)) {
        if (/title|body|email|name|content/i.test(k)) delete event.extra[k];
      }
    }
    return event;
  },
});
```

ANR detection enabled (default in v6.x). Crash reports include device info,
RN stack, native stack — no card content.

### 13.2 Custom analytics

POST `/api/telemetry/event` (Stage 5 to add — minimal endpoint, server stores
in a new `telemetry_events` table or fans to a log file). Events emitted:

| Event | Properties | Why |
|---|---|---|
| `capture.started` | `mode: text\|photo\|voice\|template`, `from: fab\|sharetarget\|shortcut` | Capture funnel top |
| `capture.completed` | `mode`, `duration_ms`, `result: ok\|error\|cancelled` | Conversion + speed |
| `push.received` | `type: card.message\|card.ai_response\|insight\|reminder`, `latency_ms_estimate` | Compare server-sent count vs client-received |
| `push.tapped` | `type`, `cold_start: boolean` | Engagement |
| `card.move` | `from: status`, `to: status`, `via: drag\|sheet`, `success: bool` | Drag-success rate |
| `ws.disconnect` | `reason`, `duration_connected_ms` | Connection health |
| `auth.failed` | `code: 401\|403\|500`, `attempt: 1\|2` | Friction signal |

**PII rules:** NO card titles, NO user emails, NO message bodies, NO card
IDs. Only counts + durations + categorical values.

### 13.3 Sentry release tagging

Each EAS Build runs `sentry-expo` postBuild hook to upload sourcemaps tagged
`${app.version}+${eas.buildNumber}`. Symbolicated stack traces land in
Sentry within minutes.

---

## 14. Migration / Upgrade Strategy

### 14.1 EAS Update for JS-only OTA

Channel mapping:

| Build profile | Channel | Update cadence |
|---|---|---|
| development | none (Dev Client only) | n/a |
| preview | `preview` | Auto on every `main` push |
| production | `production` | Manual `eas update --branch production` after release tag |

### 14.2 Native binary updates

| Track | Audience | Promotion |
|---|---|---|
| Internal | 5-10 family + agents | Auto via `eas submit` on tag |
| Closed | Beta opt-ins | Manual promote in Play Console |
| Open | Larger beta (V2+) | Manual |
| Production | All | Manual |

### 14.3 Min-app-version enforcement

Backend may return `HTTP 426 Upgrade Required` with header
`X-Required-App-Version: 2.0.0`. Client:

- Compares against `Application.nativeApplicationVersion` (semver).
- If lower → render `UpdateWallScreen` (full-screen, no dismissal), "Open Play Store" button → `Linking.openURL("market://details?id=com.smartkanban.app")`.

Stage 5 backend addition: `ky.beforeError` hook reads this header before
routing to `mapStatusError`.

---

## 15. Risks & Open Questions for Stage 5 Engineer

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| R1 | `@react-native-firebase` + `@notifee/react-native` coexistence — channel ownership clashes or duplicate notifications if both register handlers | Medium | Convention: **Notifee owns display + actions**; `expo-notifications` is NOT used for `setNotificationChannel`. Verify in Detox E2E that a single tap fires one handler. |
| R2 | `expo-secure-store` 2048-byte cap — fine for token (~43 bytes) but **disqualifies it for React Query cache persistence** | Low | Locked decision: React Query persists via **MMKV**, NOT SecureStore. Auth token only in SecureStore. |
| R3 | `expo-router` + Detox file-based-routing — Detox setup historically uses native ids; verify before committing to Detox | Medium | Stage 5 spike: write 1 Detox login test before locking the entire suite. Alternative: Maestro (YAML-based, RN-friendly). |
| R4 | Custom `ACTION_SEND` intent — Managed workflow path via `app.json android.intentFilters` is supported but historically buggy on Expo SDK <50 | Low (we're on SDK 52) | If managed share-target fails to register, eject to Bare and hand-edit AndroidManifest. Decision gate at Stage 5 first build. |
| R5 | App Link `autoVerify` — requires `/.well-known/assetlinks.json` hosted at the HTTPS APP_URL (S1 §1.3 notes prod is `192.168.50.13` LAN today). Until prod gets a verified HTTPS hostname, App Links degrade to chooser (still works, just less seamless). | High (current infra) | Stage 5: confirm production hostname and host assetlinks.json. Until then, only `kanban://` custom scheme + manual chooser for HTTPS links. |
| R6 | Voice capture endpoint `POST /api/cards/from-audio` is NEW (S2 §8.3) — Stage 5 must build it before F-127 ships | Medium | Backend task explicit in Stage 5 plan; client falls back to "Voice capture coming soon" if endpoint returns 404. |
| R7 | New `POST /api/auth/native/token` endpoint — Stage 5 backend work; without it MVP must use cookie auth (fragile) | High | Make bearer endpoint a **hard prerequisite** for the MVP merge. Document fallback to cookie + `@react-native-cookies/cookies` only as a last resort. |
| R8 | WS bearer-in-subprotocol — `@fastify/websocket` parses `Sec-WebSocket-Protocol` but server (S1 §3.1) currently only reads cookie. Stage 5 backend work: add subprotocol parse path. | Medium | Same as R7 — backend prereq. Cookie fallback survives but `@react-native-cookies/cookies` adds risk. |
| R9 | RN 0.76 + New Architecture compatibility — some third-party libs (Notifee, MMKV) still warn under New Arch | Low | Ship MVP with New Arch OFF. Re-evaluate at V1 when Notifee 9.x stable on Fabric. |
| R10 | `react-native-reanimated` 3.16 + Expo Router transitions — known issues with shared-element transitions on Fabric | Low (Fabric off) | Use plain `react-native-screens` transitions; reanimated only for press/spring micro-interactions. |
| R11 | `expo-av` deprecation — Expo SDK 53+ migrates to `expo-audio`. We pin `expo-av@15.0.1` (SDK 52). Migration on next Expo bump. | Low | Plan: V1.1 milestone bumps Expo + swaps to `expo-audio`. |
| R12 | Spectral + Inter + JetBrains Mono via Google Fonts — adds 3 font download requests on first launch (~150 KB total). Slow on poor connection. | Low | Bundle Inter Regular + Spectral 600 locally as fallback (in `assets/fonts/`); rest stream on demand. |
| R13 | Detox + Reanimated 3 — gestures sometimes flaky | Medium | Pin Detox 20.32+. If flakiness blocks CI, swap to Maestro. |
| R14 | Visibility predicate (S1 §5.7) — server-side filter is canonical; client must NOT re-implement to avoid drift. But WS events include cards the user might not yet have in cache (e.g. newly shared) | Low | Trust server: on `card.created/updated`, always `setQueryData` and let the cache hold it; the only risk is over-rendering, never under-rendering. |
| R15 | Hermes vs JIT — Hermes occasionally serializes Zod schemas slower than expected | Very low | Profile at V1 if slow; pre-compile schemas via `zod-to-json-schema` only if measured. |

### 15.1 Stage 5 backend prerequisites checklist

Before any android client code calling these can ship:

- [ ] `POST /api/auth/native/token` — bearer issuance (S2 §8.1)
- [ ] `POST /api/push/fcm/subscribe`, `DELETE /api/push/fcm/subscribe` (S2 §8.2)
- [ ] `POST /api/cards/from-audio` — Whisper + propose (S2 §8.3)
- [ ] `pushToUser()` fan-out extended to `fcm_subscriptions` (S2 §8.2)
- [ ] WS upgrade handler reads `Sec-WebSocket-Protocol: bearer.<token>` (Stage 5 backend addition; cookie path stays as fallback)
- [ ] `mirror_tokens.scope` CHECK constraint extended to `('mirror','api','native')`
- [ ] `/.well-known/assetlinks.json` published at production `APP_URL`
- [ ] Optional: `X-Required-App-Version` header on 426 responses (V1 polish)

---

## 16. Summary table — what Stage 5 receives

| Decision | Value |
|---|---|
| Framework | React Native 0.76.5 + Expo SDK 52 (Managed first, eject if blocked) |
| Language | TypeScript 5.6.3 strict |
| Navigation | Expo Router 4.0.15 (file-based) |
| UI | react-native-paper 5.12.5 (Material 3) + custom token overlay |
| Client state | Zustand 5.0.2 — 3 stores (auth, ui, capture-draft) |
| Server state | @tanstack/react-query 5.62.7 — 15 query hooks, 30 mutation hooks |
| HTTP | ky 1.7.4 + zod 3.24.1 (RULE 2 verbatim parse) |
| WebSocket | native WebSocket + bearer subprotocol + 500ms→10s backoff |
| Secrets | expo-secure-store 14.0.0 (auth token), MMKV 3.1.0 (cache) |
| Push | @react-native-firebase/messaging 21.6.1 + @notifee/react-native 9.1.2 |
| Channels | 3 — card-activity, insights, reminders |
| Min/Target SDK | 29 / 35 |
| CI | GitHub Actions: pr.yml, main.yml, release.yml |
| OTA | EAS Update channels: preview, production |
| Telemetry | Sentry 6.4.0 + custom event endpoint |
| Total deps | 47 dependencies + 15 devDependencies, all pinned |
| Stage 5 backend prereqs | 7 items (§15.1) |

---

STAGE_COMPLETE: architect deps=47 stores=3 queries=15 channels=3
