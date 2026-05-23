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

### I-6: WebSocket reconnect storm — auth-failed loop without backoff escalation
- **Symptom**: Server log shows `GET /ws` every ~1s, continuously. Existing client had exponential backoff (500ms→10s cap) but it wasn't working.
- **Root cause**: Two compounding issues. (1) Session cookie not reliably attached to WS handshake — `URLSessionWebSocketTask` cookie behavior is undocumented; in practice the WS opened unauthenticated and the server closed with 4401 immediately. (2) `backoffMS` was reset on every `.hello` message — even a brief connect-then-drop (auth fail → close after handshake → hello never received → 5s armHelloDeadline fires → reconnect) cycled fast. (3) Floor was 500ms, cap was 10s — insufficient to rate-limit a storm.
- **User prompt that exposed it**: > "/ws once per second forever."
- **Fix**: `WebSocketClient.connect()` now builds an explicit `URLRequest` with a `Cookie: kanban_session=<token>` header from `KeychainStore` before calling `webSocketTask(with: req)`. Backoff floor raised 500ms → 1s, cap raised 10s → 30s. `backoffMS` resets to floor ONLY after a sustained connection (`connectedAt` > 5s ago). A brief connect-then-drop no longer resets the floor. `connectedAt: Date?` tracks when the connection last received hello. `handleWake()` clears `connectedAt` alongside `backoffMS`. `macOS/Scripts/ws_backoff_smoke_test.swift` added to verify the arithmetic.
- **Rule locked in**: RULE 15 — every reconnect/retry loop must use capped exponential backoff (floor ≥1s, cap ≥10s, doubling), with reset only after a sustained successful operation.
