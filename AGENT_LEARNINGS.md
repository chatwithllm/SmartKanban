# Agent Learnings — Admin Role + Google OAuth + Approval Queue Build

Prior macOS-build learnings archived at `AGENT_LEARNINGS.macos-build.md`.

Format per incident:

```
### I-N: <one-line symptom>
- **Symptom:** what was observed
- **Root cause:** why it happened
- **User prompt that exposed it:** quote it
- **Fix:** what was changed
- **Rule locked in:** the numbered rule appended to agent-rules.md
```

---

## Seed (from spec/plan review — closed before execution)

The plan and spec for this build were reviewed twice before execution started. Both review passes turned into baseline rules in `agent-rules.md`:

- **Reject endpoint ran UPDATE + audit INSERT as two queries.** → Rule 3 (single-transaction audit writes).
- **Last-admin guard used `SELECT COUNT(*) ... FOR UPDATE`.** → Rule 4 (lock rows, count in code).
- **`admin_audit.actor_id` was `NOT NULL` with `ON DELETE SET NULL`.** → Rule 5.
- **`INSERT INTO users` had no `23505` handling on email collision.** → Rule 6.
- **Pending row reaped after 5 min while audit FK was `ON DELETE SET NULL` — rejected user identity lost.** → Rule 7 (snapshot identifying fields into audit metadata).
- **Approve was described as DELETE in three sections and UPDATE in the endpoint spec.** → Rule 11 (one authoritative home per fact).

Plan patches landed at commit `ece7d1c` before any task ran.

---

## Incidents (post-execution)

### I-2: First-user-auto-admin bootstrap silently no-op'd
- **Symptom**: Fresh DB, registered first user via /api/auth/register, `is_admin = false`, no audit row. Spec §11 step 1 expected `is_admin = true`.
- **Root cause**: The register handler had an `if (userCount === 0)` block (legacy, from Phase 1 of the kanban project) that inherited cards but never set `is_admin = true`. Plan Task 3 added env-admin reconciliation in `/login` but never touched the register path. Every test that exercised admin endpoints seeded users directly + flipped `is_admin` manually, so the real registration path was never tested empty.
- **User prompt that exposed it**: > "Manual QA Step 1 (spec §11): fresh DB, first user registers — is_admin should be true. It was false."
- **Fix**: Wrap register in a transaction with `pg_advisory_xact_lock('first_user_bootstrap')`; INSERT users with `is_admin = (userCount === 0)`; if first user, write env_promote audit row with metadata `{source: 'first_user_bootstrap'}` in the same transaction.
- **Rule locked in**: RULE 12 — empty-state bootstrap tests must run against the empty state.

### I-3: macOS Google sign-in entry point absent from LoginView
- **Symptom**: QA Step 9 — clicked through to the macOS app, LoginView only shows email/password. The Google button exists in AccountTab.swift but sits inside `if let user = auth.currentUser`, so it's invisible pre-login. Even when signed-in, it doesn't gate on /api/auth/config.
- **Root cause**: Plan Task 30 scoped Google to AccountTab (post-login linking) instead of LoginView (pre-login auth method). Plan never added an AuthConfig codable, Endpoint case, or /api/auth/config fetch on the macOS client. Web LoginView did this correctly — macOS lacked feature parity.
- **User prompt that exposed it**: > "QA Step 9: on macOS, click Sign in with Google. The button isn't there."
- **Fix**: Added `AuthConfig` codable + `Endpoint.authConfig` case. LoginView fetches config on mount, shows Google button + OR divider when `google_enabled == true`. AccountTab linking button now also gates on the same config — hides when google_enabled is false.
- **Rule locked in**: RULE 13 — login-affecting features must reach every client; gate on config, not on hardcoded assumptions.

### I-4: macOS AdminUserRow decoding failed against real server response
- **Symptom**: After Google sign-in, macOS app showed "Couldn't load users: Decoding error: The data couldn't be read because it is missing." Web admin path worked fine — same endpoint, different decoder.
- **Root cause**: `short_name` is nullable in the DB schema (`short_name text` with no `NOT NULL`). The server query uses `COALESCE(u.short_name, u.name)` as protection, but the Swift struct declared `shortName: String` (non-optional). If `short_name` is `null` in the JSON — either because the COALESCE didn't apply in an earlier code state, or via a direct DB row — Swift's `JSONDecoder` raises `DecodingError.keyNotFound` (localized: "The data couldn't be read because it is missing"). Web's `JSON.parse` is permissive with nulls; Swift is strict.
- **User prompt that exposed it**: > "QA Step 9 succeeded — Google sign-in landed user 'Narc' in the app. Immediately after, red toast on macOS: 'Couldn't load users: Decoding error: The data couldn't be read because it is missing.'"
- **Fix**: Added a custom `init(from:)` to `AdminUserRow` that decodes `short_name` via `decodeIfPresent` and falls back to `name` when null or absent. `identities`, `lastLoginAt`, and `sessionCount` also hardened with safe fallbacks.
- **Why tests missed it**: macOS has no test target wired up. Codables get verified only when the running app touches the real endpoint. A standalone swift script `macOS/Scripts/decode_smoke_test.swift` now smoke-tests this decode against a captured real payload, including null/missing `short_name` regression cases.
- **Rule locked in**: RULE 14 — every cross-client Codable must have a decoding smoke test against a captured real payload.

### I-5: AdminUserRow decode failed against real server response (re-occurrence after I-4 defensive fix)
- **Symptom**: Same toast as I-4 — "Couldn't load users: Decoding error..." — even after I-4's defensive widening.
- **Root cause**: The I-4 fix was structurally correct (short_name null was the original root cause, and the defensive `decodeIfPresent` handles it). The re-occurrence was caused by the smoke test using a hardcoded inline payload rather than a committed file loadable from disk. When the user base grows (new Google-signed-in admin, new rows with different shapes), the inline sample silently diverges from reality. Confirmed via: curl → real JSON → standalone swift decode → all 4 rows decoded correctly. The inline sample happened to match the live DB at time of writing; it had no mechanism to stay in sync.
- **User prompt that exposed it**: > "QA: admin window → still failing after I-4."
- **Fix**: Updated `macOS/Scripts/decode_smoke_test.swift` to load from `macOS/Scripts/decode_samples/admin_users.json` (committed file, sourced from a real curl). Added `server/scripts/dump_admin_users.sh` to re-capture the payload on demand. Added I-5 regression test case (google admin user with identity). `decode_samples/admin_users.json` committed alongside the test.
- **Why I-4 missed it**: I-4's smoke test used a hardcoded inline payload constructed to match the known schema, not loaded from a file. The file-load pattern forces re-capture when the schema changes; the inline pattern hides drift. Rule 14 was correct in spirit — "captured real payload" — but "captured" was interpreted as "written by hand to match the schema," not "curl'd from the live server." Updated done-gate to be explicit: the sample must come from a real curl-capture, not be hand-constructed.
- **Rule reinforcement**: Rule 14 already exists. Done-gate checkbox tightened to require file-loaded curl-captured sample.

### I-7: WS storm — prior I-6 fix didn't address pre-login connect
- **Symptom**: Server log shows /ws every ~500ms BEFORE login, even though I-6 raised the backoff floor to 1s.
- **Root cause**: bootstrap()'s cached-user fallback restores a stored user without verifying session token still exists in keychain → starts WS → server 4401 → reconnect loop. The I-6 backoff math is correct in isolation, but the storm was driven by the bootstrap-cache path triggering connect() pre-auth, with no gate to block it. The cap-and-double logic was on the right code, but called too aggressively because each "successful" 4401 close resets connectedAt to nil.
- **User prompt that exposed it**: > "/ws every 500ms BEFORE login. Storm happens with no session."
- **Fix**: Added two gates. (1) WebSocketClient.connect() returns immediately if KeychainStore.read() == nil. (2) AuthStore.bootstrap() cached-fallback now also checks KeychainStore.read() — no token, no cached restore. (3) logout() now disconnects WS before clearing keychain so any queued reconnect fires connect() → hits guard → bails cleanly.
- **Rule locked in**: RULE 16 — a retry/reconnect loop fix is incomplete until verified there is exactly ONE reconnect entry point AND every caller path respects the unauthenticated guard.

### I-8: notifications table absent from schema.sql — migration-only
- **Symptom**: GET /api/notifications returns 500 "relation notifications does not exist". 6 notifications tests fail. QA found via 500 in browser.
- **Root cause**: notifications schema lived in server/migrations/2026-05-03-notifications.sql only. `npm run db:init` runs schema.sql, not migrations/. Fresh DBs had no table. The pre-existing failure was misclassified as infra noise during Task 34 — should have been a SCHEMA gap.
- **User prompt that exposed it**: > "GET /api/notifications returns 500. The QA database was built from schema.sql. There is no notifications table."
- **Fix**: Appended notifications + push_subscriptions DDL to server/schema.sql with idempotent IF NOT EXISTS clauses. db:init now produces a complete DB.
- **Rule locked in**: RULE 17 — schema.sql is the single source of truth for `npm run db:init`. Every feature's tables must be in schema.sql, and every feature's tests must pass against a freshly-initialized DB.

### I-6: WebSocket reconnect storm — auth-failed loop without backoff escalation
- **Symptom**: Server log shows `GET /ws` every ~1s, continuously. Existing client had exponential backoff (500ms→10s cap) but it wasn't working.
- **Root cause**: Two compounding issues. (1) Session cookie not reliably attached to WS handshake — `URLSessionWebSocketTask` cookie behavior is undocumented; in practice the WS opened unauthenticated and the server closed with 4401 immediately. (2) `backoffMS` was reset on every `.hello` message — even a brief connect-then-drop (auth fail → close after handshake → hello never received → 5s armHelloDeadline fires → reconnect) cycled fast. (3) Floor was 500ms, cap was 10s — insufficient to rate-limit a storm.
- **User prompt that exposed it**: > "/ws once per second forever."
- **Fix**: `WebSocketClient.connect()` now builds an explicit `URLRequest` with a `Cookie: kanban_session=<token>` header from `KeychainStore` before calling `webSocketTask(with: req)`. Backoff floor raised 500ms → 1s, cap raised 10s → 30s. `backoffMS` resets to floor ONLY after a sustained connection (`connectedAt` > 5s ago). A brief connect-then-drop no longer resets the floor. `connectedAt: Date?` tracks when the connection last received hello. `handleWake()` clears `connectedAt` alongside `backoffMS`. `macOS/Scripts/ws_backoff_smoke_test.swift` added to verify the arithmetic.
- **Rule locked in**: RULE 15 — every reconnect/retry loop must use capped exponential backoff (floor ≥1s, cap ≥10s, doubling), with reset only after a sustained successful operation.

### I-9: WS reconnect storm — actually the WEB client, misattributed to macOS across THREE prior fix rounds
- **Symptom**: Server log shows `GET /ws` every ~507ms continuously. I-6, I-7, and a stale-binary diagnosis all "fixed" the macOS WS client; storm persisted.
- **Root cause**: The web client `web/src/ws.ts` had its own broken reconnect: `retry = 500` initial floor, `retry = 500` reset inside `onopen`. A flap (open → immediate close, e.g. server restart while tab held an orphaned session) reset the delay every cycle and looped at 500ms forever. The same Rule 15 / Rule 16 defects that bit the macOS client also lived in the web client, untouched throughout the build. Server logs alone don't distinguish which client opened a given `/ws` — the storm's 507ms cadence happened to match the OLD macOS floor too, masking the misattribution. No User-Agent / source IP triage was done.
- **User prompt that exposed it**: > "Fix the web frontend WebSocket reconnect storm... This was previously MISATTRIBUTED to the macOS app — it is not a macOS bug."
- **Fix**: Rewrote `connectWS` in `web/src/ws.ts` to match Rule 15 discipline — 1s floor, 30s cap, jittered, reset only after onopen + first-frame + ≥10s stable. Added single-socket guard, pending-timeout clear, and a 1008 (policy close) circuit-breaker. Bumped service-worker `CACHE = 'kanban-v1' → 'kanban-v2'` and added an activate handler that deletes non-current caches — without the bump, every open tab keeps serving the buggy bundle from cache and the fix never reaches users.
- **Process lesson (NOT a separate rule — extends Rule 13 + Rule 16)**: when a multi-client app shows a network-level symptom, audit EVERY client implementation of the affected protocol before declaring any one of them the culprit. Three fix rounds on macOS while the web code sat untouched is the cost of skipping that audit. For a WS storm specifically: tag log lines with the client identity (User-Agent or a custom header) so server logs distinguish web vs native.
- **Rule locked in**: RULE 18 — service-worker cache name MUST bump on every frontend fix; activate handler MUST delete non-current caches. (Existing Rules 15 + 16 already covered the backoff discipline — the new code follows them.)

### I-10: rate-limit unpinned + downgrade fix stashed → prod crash-loop on cutover
- **Symptom**: PR #40 cut over to prod, server crashed immediately + restart-looped: `FastifyError: fastify-plugin: @fastify/rate-limit — expected '5.x' fastify version, '4.29.1' is installed (FST_ERR_PLUGIN_VERSION_MISMATCH)`. Site 502 for ~3 min until hot-patched on the VM.
- **Root cause (two layers)**:
  (1) **Unpinned dependency install.** Task 10 of the admin-role build ran `npm install google-auth-library @fastify/rate-limit` with no version constraint. npm grabbed `@fastify/rate-limit@10.3.0`, which requires `fastify@5.x`. Project is on `fastify@^4.28.1`. The mismatch only surfaced at boot — `npm install` succeeded, `tsc` passed, all 228 tests passed (none exercised the rate-limit plugin under a real Fastify-app boot), `docker compose build` succeeded.
  (2) **Fix-in-stash never shipped.** The downgrade to `^9.1.0` was identified locally during the macos-build push, the fix was applied to `package.json` + `package-lock.json` in the working tree, and the user (or me) stashed it instead of committing. The stash held the correct version for hours, the broken version stayed in source, and prod cut over to the broken version. Prod was hot-patched on the VM; the local stash was popped and only THEN committed (PR #41).
- **User prompt that exposed it**: > "[server log] FastifyError: fastify-plugin: @fastify/rate-limit — expected '5.x' fastify version, '4.29.1' is installed"
- **Fix**: Prod sed-pinned `@fastify/rate-limit` to `^9.1.0`, deleted lock, rebuilt image (`81ad933350172bb`), recreated container. Site recovered ~5 min later. PR #41 then aligned `main` with prod by popping the stash, committing, opening + merging the PR.
- **Rules locked in**: RULE 19 (pin dependency installs to a version compatible with the project's framework major) + RULE 20 (a fix is not "done" until committed — a stash is not a deliverable).
