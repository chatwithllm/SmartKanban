# Admin Role + Google OAuth + Approval Queue — Design Spec

**Date:** 2026-05-22
**Status:** Approved — ready for plan
**Scope:** Single combined milestone covering admin role, Google OAuth (coexisting with email/password), and admin-gated approval queue for new Google sign-ins.

---

## 1. Goals

Give the household owner a real administrative role so they can:

1. **Gate signups.** Random Gmail users cannot get into the app via Google OAuth without explicit admin approval.
2. **Manage users.** Promote/demote other admins, reset passwords, revoke sessions.
3. **Moderate content (future).** Schema and audit log accommodate this; v1 ships only the user-management actions above.

Secondary goals:

- Add **Google OAuth** as a second sign-in method alongside email + password, with same-email auto-link when Google reports `email_verified=true`.
- Provide **transparency** via an immutable admin audit log.
- Keep household trust model intact — small group (2–5 people), additive schema, no breaking changes for existing users.

## 2. Non-Goals (Out of Scope for v1)

- Mobile admin UI (web + macOS only).
- Telegram bot admin commands.
- User deletion (deferred to v2; cards already `ON DELETE SET NULL`).
- SSO providers beyond Google.
- Email-based password reset (admin sets temporary password inline; user changes on next login).
- PKCE on macOS URL scheme (documented as deferred hardening).
- Bulk "Reject all" action on the approval queue.

## 3. Architecture Overview

Three intertwined capabilities ship as one milestone:

1. **Admin role.** New `is_admin` boolean on `users`. Bootstrap by "first user auto-admin" (already aligns with existing first-user logic in `server/src/routes/auth.ts`) plus an `ADMIN_EMAILS` env safety net (additive only — never demotes). Admins promote/demote others via UI. Last-admin guard prevents lockout.

2. **Google OAuth.** Added as second auth method alongside argon2 password. New `user_identities` table stores `(user_id, provider, provider_sub, email, email_verified)`. Auto-link to existing user when Google `email_verified=true` matches an existing `users.email`. Server runs the OAuth dance; macOS opens the system browser and receives a session via a custom URL scheme (`kanbanclaude://auth?ticket=...`) that exchanges for a session token.

3. **Approval queue.** Google login for an unknown email creates a row in `pending_users` — *not* in `users`. The callback returns 202 with `pending_id`. The web client renders an "Awaiting approval" page that polls `/api/auth/pending/:id`. The admin sees the queue at `/admin`, clicks Approve → row migrates to `users` + identity linked + audit row written + ticket issued — all in one transaction. Reject deletes the pending row.

Cross-cutting:

- `admin_audit` table logs every admin action.
- `requireAdmin` Fastify preHandler gates all `/api/admin/*` routes.
- Web + macOS get a new `/admin` surface, hidden when `!user.is_admin`.

## 4. Database Schema

All changes additive + idempotent (matches existing `schema.sql` style).

```sql
-- admin role
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin) WHERE is_admin = TRUE;

-- forced-change-pw flag (admin reset path)
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

-- OAuth identities
CREATE TABLE IF NOT EXISTS user_identities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL,                  -- 'google'
  provider_sub    TEXT NOT NULL,                  -- Google 'sub' claim
  email           TEXT NOT NULL,                  -- email at time of link
  email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_sub)
);
CREATE INDEX IF NOT EXISTS idx_identities_user ON user_identities(user_id);

-- approval queue
CREATE TABLE IF NOT EXISTS pending_users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider        TEXT NOT NULL,                  -- 'google'
  provider_sub    TEXT NOT NULL,
  email           TEXT NOT NULL,
  email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
  name            TEXT NOT NULL,                  -- from Google profile
  picture_url     TEXT,                           -- optional avatar
  outcome         TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected'
  outcome_ticket  TEXT,                            -- single-use ticket, populated on approve
  outcome_at      TIMESTAMPTZ,                     -- when admin acted
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_sub)
);
CREATE INDEX IF NOT EXISTS idx_pending_outcome ON pending_users(outcome, outcome_at);

-- macOS native-auth handoff tickets
CREATE TABLE IF NOT EXISTS auth_tickets (
  ticket         TEXT PRIMARY KEY,                -- random 32-byte base64url
  session_token  TEXT NOT NULL REFERENCES sessions(token) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consumed       BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at     TIMESTAMPTZ NOT NULL             -- 60s TTL
);
CREATE INDEX IF NOT EXISTS idx_auth_tickets_expiry ON auth_tickets(expires_at);

-- admin audit log
CREATE TABLE IF NOT EXISTS admin_audit (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id          UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  action            TEXT NOT NULL,                -- 'promote' | 'demote' | 'reset_password' |
                                                  -- 'revoke_sessions' | 'approve_user' |
                                                  -- 'reject_user' | 'env_promote'
  target_user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  target_pending_id UUID REFERENCES pending_users(id) ON DELETE SET NULL,
  metadata          JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_actor   ON admin_audit(actor_id);
```

**Notes:**

- `auth_hash` stays `NOT NULL`. Google-only users get `auth_hash='oauth:google'`, which never matches argon2 verification (no `$argon2id$` prefix). Defense-in-depth: also reject login when `auth_hash NOT LIKE '$argon2%'`.
- `ADMIN_EMAILS` is **not** stored in DB. Reconciled on every successful login — if `email` is in the env list and `is_admin=false`, flip to true and write an `env_promote` audit row.
- `pending_users` is independent from `users` until approval. Approve runs a single transaction: INSERT users + INSERT user_identities + INSERT admin_audit + DELETE pending_users.
- `auth_tickets` cleanup: `DELETE WHERE expires_at < NOW()` is added to the existing session-cleanup job.

## 5. Backend Endpoints

All `/api/admin/*` routes use the new `requireAdmin` preHandler (rejects 403 if `!user.is_admin`). All admin actions write to `admin_audit` in the same transaction as the underlying mutation.

### Auth endpoints (new + changed)

```
GET  /api/auth/google/start?return=web|macos
        → 302 to Google OAuth consent. Sets state cookie (CSRF), 10-minute TTL.

GET  /api/auth/google/callback
        → Verify state cookie. Exchange code with Google. Verify id_token signature, aud, iss, exp.
        → If identity exists by (provider, provider_sub): reconcile env-admin → create session.
        → Else if email_verified=true and users.email matches: auto-link identity → create session.
        → Else: INSERT INTO pending_users (UPSERT on (provider, provider_sub)) → 202 with pending_id.
        → web return: redirect to /awaiting-approval?id=<pending_id> OR set Set-Cookie session + redirect to /.
        → macos return: redirect to kanbanclaude://auth?ticket=<one-time> (only after session created).

GET  /api/auth/pending/:id
        → Reads pending_users.outcome. Returns:
          { status: 'pending' }                                — outcome='pending'
          { status: 'approved', ticket: '<one-time>' }         — outcome='approved'
          { status: 'rejected' }                               — outcome='rejected'
        → Used by /awaiting-approval to poll every 5s.
        → ticket is the single-use, 60s-TTL value populated by /approve.
        → Reading the row does NOT consume the ticket; only ticket/exchange does.

POST /api/auth/ticket/exchange { ticket }
        → Consumes auth_ticket. Returns { token } (for native clients) and Set-Cookie session.
        → 410 if unknown, consumed, or expired.

POST /api/auth/change-password { current_password, new_password }
        → Required when must_change_password=true; otherwise also usable by any signed-in user.
        → Clears must_change_password on success.

GET  /api/auth/config
        → { google_enabled: boolean, open_signup: boolean }
        → Lets clients hide UI when env vars missing.
```

**Changed existing endpoints:**

- `POST /api/auth/register` — unchanged. ADMIN_EMAILS reconciliation runs at first login, not register.
- `POST /api/auth/login` — after `verifyPassword` succeeds, call `reconcileEnvAdmin(user.id, email)`.
- `GET  /api/auth/me` — response gains `is_admin: boolean` and `must_change_password: boolean`.

### Admin endpoints

```
GET  /api/admin/users
        → [{ id, name, short_name, email, is_admin, identities: [{ provider, email }],
             last_login_at, session_count, created_at }]

POST /api/admin/users/:id/promote
        → UPDATE users SET is_admin=true. Audit. 409 already_admin if already true.

POST /api/admin/users/:id/demote
        → UPDATE users SET is_admin=false. Audit.
        → 409 last_admin if this would leave zero admins (transactional check).
        → 409 cannot_demote_self_last_admin if self + sole admin.

POST /api/admin/users/:id/reset-password { new_password }
        → argon2 hash, UPDATE users SET auth_hash, must_change_password=true.
        → DELETE FROM sessions WHERE user_id=$1 (same txn).
        → Audit. 400 password_too_short if length < 6.

POST /api/admin/users/:id/revoke-sessions
        → DELETE FROM sessions WHERE user_id=$1. Audit with metadata { count: N }.

GET  /api/admin/pending
        → [{ id, email, name, picture_url, email_verified, created_at }]

POST /api/admin/pending/:id/approve { short_name }
        → Single transaction (FOR UPDATE row lock on pending_users):
            verify outcome='pending'                            (else 409 pending_gone)
            INSERT users (name, short_name, email, auth_hash='oauth:google')
            INSERT user_identities (from pending_users row)
            INSERT sessions  (new session for the approved user)
            INSERT auth_tickets (60s ticket bound to that session)
            INSERT admin_audit
            UPDATE pending_users
              SET outcome='approved', outcome_ticket=<ticket>, outcome_at=NOW()
              WHERE id=$1
        → Returns { user_id }. Pending user's poll picks up status='approved' + ticket,
          then exchanges for a cookie via /api/auth/ticket/exchange.
        → WS broadcast 'pending_changed' { pending_id } over admin WS channel — used
          ONLY to refresh other admin browsers' queue lists, NOT to notify the pending
          user (the pending browser is on plain HTTP polling, not WS).
        → Reaper job deletes pending_users rows where outcome != 'pending' AND
          outcome_at < NOW() - INTERVAL '5 minutes'. Runs alongside session cleanup.
        → 409 pending_gone if outcome != 'pending'.
        → 409 email_in_use if pending email collides with existing users.email.

POST /api/admin/pending/:id/reject
        → UPDATE pending_users SET outcome='rejected', outcome_at=NOW() WHERE id=$1
          AND outcome='pending'. 409 pending_gone if zero rows updated.
        → Audit. WS broadcast 'pending_changed' to refresh other admin queue lists.

GET  /api/admin/audit?limit=100&before=<iso>
        → Paginated audit log. Joins actor + target names. Max 200 per page. Cursor by created_at.

GET  /api/admin/env-admins
        → Reads ADMIN_EMAILS env, returns sanitized list. Lets UI label admins promoted via env.
```

### New auth helpers

```ts
// server/src/auth.ts

export async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  await requireUser(req, reply);
  if (!req.user?.is_admin) return reply.code(403).send({ error: 'admin_required' });
}

export async function reconcileEnvAdmin(userId: string, email: string): Promise<boolean> {
  const list = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  if (!list.includes(email.toLowerCase())) return false;
  const { rowCount } = await pool.query(
    `UPDATE users SET is_admin=true WHERE id=$1 AND is_admin=false`,
    [userId],
  );
  if (rowCount && rowCount > 0) {
    await pool.query(
      `INSERT INTO admin_audit (actor_id, action, target_user_id, metadata)
       VALUES ($1, 'env_promote', $1, '{"source":"ADMIN_EMAILS"}')`,
      [userId],
    );
  }
  return true;
}
```

## 6. Frontend UI

### Web (`web/src/`)

**New files:**

- `views/AdminView.tsx` — top-level page mounted at `/admin`. Tab strip: Users · Approvals · Audit.
- `views/admin/UsersTab.tsx` — table of users: short_name, email, identity badges (password / google), is_admin toggle, "Reset password" button, "Revoke sessions" button.
- `views/admin/ApprovalsTab.tsx` — list of `pending_users` with avatar, name, email, "Approve" + "Reject" actions. Approve opens a modal asking for `short_name`.
- `views/admin/AuditTab.tsx` — paginated audit log. Each row: actor → action → target, timestamp, expand for metadata JSON.
- `views/AwaitingApproval.tsx` — landing page after Google OAuth callback when account is pending. Polls `/api/auth/pending/:id` every 5s. Auto-redirects to `/` on approval, shows error on reject.
- `views/ChangePassword.tsx` — forced redirect target when `must_change_password=true`.
- `components/GoogleSignInButton.tsx` — styled per Google brand guidelines. Posts to `/api/auth/google/start?return=web`.

**Modified:**

- `App.tsx` — register `/admin`, `/awaiting-approval`, `/change-password` routes. Redirect `/admin` → `/` when not admin.
- `auth.tsx` — `User` type adds `is_admin: boolean` and `must_change_password: boolean`. After login/refresh, redirect to `/change-password` when flagged.
- `components/Sidebar.tsx` (or equivalent nav) — conditional "Admin" link gated on `user.is_admin`.
- Existing login view — add `GoogleSignInButton` above the email/password form. Hide button when `/api/auth/config` reports `google_enabled: false`.

### macOS (`macOS/KanbanClaude/`)

**New files:**

- `UI/Admin/AdminWindow.swift` — separate window opened from a menu bar "Admin…" item (only enabled when `currentUser.isAdmin`).
- `UI/Admin/AdminUsersView.swift`, `AdminApprovalsView.swift`, `AdminAuditView.swift` — SwiftUI mirrors of the web tabs.
- `App/URLSchemeHandler.swift` — registers `kanbanclaude://` URL scheme via `Info.plist` `CFBundleURLTypes`. Handles `kanbanclaude://auth?ticket=...` by POSTing to `/api/auth/ticket/exchange` and storing the returned session token in Keychain.
- `Networking/AuthClient+Google.swift` — `openGoogleSignIn()` opens `https://server/api/auth/google/start?return=macos` in the default browser via `NSWorkspace.shared.open(_:)`.

**Modified:**

- `UI/Preferences/AccountTab.swift` — add "Sign in with Google" button under the existing email/password form.
- `App/KanbanClaudeApp.swift` (main `App`) — wire the URL scheme handler.
- `Models/User.swift` — add `isAdmin: Bool` and `mustChangePassword: Bool`.

### Empty states

- Users tab when no other users exist: "Only you. Family will appear here after they sign in."
- Approvals tab empty: "No pending sign-ins."
- Audit tab empty: "No admin actions yet."

### Visual conventions

- Match the existing premium tone (no rainbow, no emoji in chrome — per project memory `feedback_premium_not_slop`).
- Promote/demote = subtle pill toggle, not a big switch.
- Reject in approvals = danger-tinted button with confirm dialog.

## 7. Auth Flows

### Flow A — Web: existing-user Google sign-in

```
Browser                 Server                   Google
   │ click "Sign in w/ Google"
   │ GET /api/auth/google/start
   │─────────────────────►│
   │                      │ generate state, set state_cookie
   │ 302 → google.com/o/oauth2/v2/auth?...
   │◄─────────────────────│
   │
   │ user consents
   │────────────────────────────────────────────►│
   │ 302 → /api/auth/google/callback?code&state
   │◄────────────────────────────────────────────│
   │ GET callback?code,state
   │─────────────────────►│
   │                      │ verify state cookie
   │                      │ exchange code for tokens
   │                      │ verify id_token (sig, aud, iss, exp)
   │                      │ lookup user_identities by (provider, sub)
   │                      │ found → reconcileEnvAdmin → createSession
   │                      │ Set-Cookie kanban_session=...
   │ 302 → /
   │◄─────────────────────│
```

### Flow B — Web: new user (approval queue)

```
Browser                 Server
   │ ... same up to callback ...
   │                      │ verify id_token
   │                      │ identity lookup → none
   │                      │ users lookup by email_verified email → none
   │                      │ UPSERT pending_users → pending_id
   │ 302 → /awaiting-approval?id=<pending_id>
   │◄─────────────────────│
   │ render AwaitingApproval, poll every 5s
   │─────────────────────►│
   │ { status: 'pending' }
   │◄─────────────────────│
   │
   │   (admin approves)
   │                      │ ws broadcast 'pending_approved'
   │                      │ users + identity row inserted, pending row deleted
   │ next poll
   │─────────────────────►│
   │ { status: 'approved', ticket }
   │◄─────────────────────│
   │ POST /api/auth/ticket/exchange
   │─────────────────────►│
   │                      │ consume ticket, Set-Cookie session
   │ 302 → /
   │◄─────────────────────│
```

### Flow C — macOS: native Google sign-in via system browser

```
macOS app          system browser         Server
   │ user clicks "Sign in w/ Google"
   │ NSWorkspace.open(https://server/api/auth/google/start?return=macos)
   │──────────────►│
   │               │ ... Google consent ...
   │               │ GET /api/auth/google/callback?code,state
   │               │──────────────────────────►│
   │               │                           │ verify, find/create identity
   │               │                           │ createSession + auth_tickets row (60s)
   │               │ 302 → kanbanclaude://auth?ticket=<random>
   │               │◄──────────────────────────│
   │ OS routes URL scheme to KanbanClaude.app
   │◄──────────────│
   │ URLSchemeHandler.handle(url)
   │ POST /api/auth/ticket/exchange { ticket }  (no cookie)
   │────────────────────────────────────────►│
   │                                         │ verify ticket: not consumed, not expired
   │                                         │ mark consumed, return session token
   │ { token: '<base64url>' }                │
   │◄────────────────────────────────────────│
   │ Keychain.set(sessionToken)
   │ refresh auth state, land in app
```

### Flow D — Approval action (admin side)

```
Admin browser              Server                  Pending browser
   │ GET /api/admin/pending
   │─────────────────────────►│
   │ [...]
   │◄─────────────────────────│
   │ POST /api/admin/pending/:id/approve { short_name }
   │─────────────────────────►│
   │                          │ BEGIN
   │                          │   INSERT users
   │                          │   INSERT user_identities (from pending row)
   │                          │   INSERT admin_audit
   │                          │   DELETE pending_users
   │                          │ COMMIT
   │                          │ ws broadcast 'pending_approved' { pending_id, user_id }
   │ { user_id }              │
   │◄─────────────────────────│
   │                          │                        │ poll picks up status='approved'
   │                          │                        │ exchange ticket, land in app
```

### Edge cases

| Case | Behavior |
|------|----------|
| Concurrent approve + reject on same pending row | Second action sees zero rows in `DELETE ... RETURNING` → 409 `pending_gone`. |
| Stale `auth_tickets` | Swept on every login + nightly job in session cleanup. |
| Google `sub` changes for same user | Cannot happen; `sub` is permanent per Google identity. |
| User changes Google email later | `user_identities.email` stored only for display. Lookup is by `provider_sub`. |
| `email_verified=false` from Google | Treat as unknown email; goes to pending queue. Admin can still approve manually. |
| OAuth state cookie missing/mismatch | 400 `csrf_invalid`. User restarts flow. |
| Existing pending row for same `(provider, sub)` with outcome='pending' | UPDATE name/picture in place, return existing pending_id. Idempotent retry. |
| Existing pending row with outcome='rejected', user retries Google login | UPDATE the row: set outcome='pending', clear outcome_ticket + outcome_at, refresh name/picture. Admin sees them in the queue again. |
| Existing pending row with outcome='approved' (race before reaper) | Identity lookup at top of callback should already have matched (since approve inserted user_identities). Pending path unreachable in this state. |

## 8. Config

Environment variables:

```
# existing
OPEN_SIGNUP=true                          # password registration toggle (kept)

# new
ADMIN_EMAILS=owner@example.com,spouse@example.com
GOOGLE_CLIENT_ID=<Google Cloud Console>
GOOGLE_CLIENT_SECRET=<Google Cloud Console>
GOOGLE_REDIRECT_URI=https://kanban.example.com/api/auth/google/callback
PUBLIC_APP_URL=https://kanban.example.com
MACOS_URL_SCHEME=kanbanclaude
```

Boot validation: if `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET` is missing, log a warning and disable Google routes (`/api/auth/google/*` return 503 `google_oauth_disabled`). The server still starts. `/api/auth/config` reports `google_enabled: false`; the UI hides the Google button.

## 9. Errors

Consistent shape: `{ error: '<machine_code>', message?: '<human>' }`.

| Code | Status | Cause |
|------|--------|-------|
| `unauthorized` | 401 | No session |
| `admin_required` | 403 | Session valid but `!is_admin` |
| `last_admin` | 409 | Demote would leave 0 admins |
| `cannot_demote_self_last_admin` | 409 | Self-demote while sole admin |
| `not_found` | 404 | Target user / pending row gone |
| `already_admin` | 409 | Promote on already-admin |
| `already_not_admin` | 409 | Demote on non-admin |
| `password_too_short` | 400 | reset-password new_password < 6 chars |
| `google_oauth_disabled` | 503 | Google env vars missing |
| `csrf_invalid` | 400 | OAuth state mismatch / missing |
| `oauth_failed` | 502 | Google token exchange error |
| `id_token_invalid` | 400 | Signature / aud / iss / exp check failed |
| `ticket_invalid` | 410 | auth_ticket unknown / consumed / expired |
| `pending_gone` | 409 | Approve/reject targets row that's been acted on |
| `email_in_use` | 409 | Approve would create user with email of existing user |

## 10. Security

1. **OAuth state cookie** — random 32 bytes, `HttpOnly`, `SameSite=Lax`, 10-minute TTL, single-use. Verified before code exchange.
2. **id_token verification** — `google-auth-library`. Verify `aud == GOOGLE_CLIENT_ID`, `iss in { https://accounts.google.com, accounts.google.com }`, `exp > now`, signature against Google JWKS (cached 1h).
3. **auth_ticket** — 32-byte `crypto.randomBytes` base64url. 60-second TTL. Single-use; row marked consumed on first exchange. Plaintext storage matches existing `sessions.token` style; acceptable for the 60-second window.
4. **URL scheme hijack on macOS** — another app could register `kanbanclaude://`. The ticket's single-use + 60-second + server-side validation are partial mitigations. A malicious app on the same device could still race the legitimate one. Documented as a known limitation; PKCE-style code_verifier from the macOS app is the planned hardening for v2.
5. **Approval queue spam** — UNIQUE `(provider, provider_sub)` collapses repeated attempts from the same Google account into one row. Add per-IP rate limit on `/api/auth/google/callback` (use `@fastify/rate-limit`; confirm dep status during planning, add if missing).
6. **Last-admin guard** — enforced inside the demote transaction with `SELECT COUNT(*) WHERE is_admin AND id != $target FOR UPDATE`.
7. **Admin password reset** — sets `must_change_password=true` and deletes all existing sessions. Login flow refuses all routes except `/api/auth/change-password` until the flag clears.
8. **Audit immutability** — no UPDATE/DELETE endpoint exists. INSERT-only. Retention indefinite (household scale, low volume).
9. **ADMIN_EMAILS** — additive only. Removing an email never demotes. Demote happens explicitly via UI. Documented.
10. **Argon2 placeholder for OAuth-only users** — `auth_hash='oauth:google'`. `verifyPassword` returns false. Defense-in-depth: login rejects when `auth_hash NOT LIKE '$argon2%'`.

## 11. Testing Strategy

### Unit tests (extend `server/src/__tests__/`)

- **`auth.test.ts`**: `reconcileEnvAdmin` promotes on match, no-op otherwise, idempotent on second call. `verifyPassword` returns false for `oauth:google` hash. `requireAdmin` rejects 403 for non-admin, passes for admin.
- **`google_oauth.test.ts`** (new): valid id_token passes; wrong aud, wrong iss, expired, bad signature all fail. State cookie missing → `csrf_invalid`. Disabled (no env vars) → 503 `google_oauth_disabled`.
- **`auth_tickets.test.ts`** (new): exchange unknown → 410. Exchange consumed → 410. Exchange expired → 410. Successful consume marks `consumed=true` and returns session.

### Integration tests (real Postgres via existing test setup)

- **`admin_users.test.ts`**: Non-admin → 403 on `GET /api/admin/users`. Admin sees list with identities + session_count. Promote: 200, audit row. Demote last admin → 409. Demote when ≥2 admins → 200. Self-demote when sole admin → 409. Reset password: hash changes, sessions deleted, `must_change_password=true`, audit row. Revoke sessions: count in audit metadata.
- **`admin_pending.test.ts`**: Google callback for unknown email_verified=true → 202 + pending row. Approve creates user + identity, deletes pending, audit row, WS broadcast. Concurrent approves → one wins, other gets `pending_gone`. Reject deletes + audits. Approve when email exists → `email_in_use`.
- **`google_flow.test.ts`** (mocks Google JWKS + token endpoint): linked identity → session cookie. Verified-email auto-link → identity row + cookie. Unverified email → pending queue (no auto-link). New verified email → pending queue, then approved poll returns ticket → exchange → cookie.

### macOS tests

- **`URLSchemeHandlerTests.swift`**: Valid `kanbanclaude://auth?ticket=X` posts to exchange endpoint, stores token in Keychain. Missing ticket query → no-op + error log. Exchange returns 410 → user-visible "sign-in expired" toast.
- UI smoke test in `KanbanClaudeUITests` for Admin window, gated behind a mocked admin user.

### Manual QA checklist (for SHIP_READY)

1. Fresh DB. Register first user via password → `is_admin=true` (first-user auto-admin path).
2. Set `ADMIN_EMAILS=second@x.com`, login as that user → is_admin flips, audit row written.
3. Promote a third user via UI → audit row; third user sees `/admin` link after refresh.
4. Demote the first user when ≥2 admins exist → succeeds. Demote when sole admin → 409.
5. Reset another user's password → they get logged out + forced into change-password on next login.
6. Google sign-in for existing matching `email_verified=true` user → linked, signed in.
7. Google sign-in for new email → AwaitingApproval. Admin approves → user lands in app.
8. Admin rejects → user sees "denied" page.
9. macOS: click "Sign in with Google" → browser opens → consent → app comes to foreground, signed in.
10. Audit tab paginates, shows correct actor / target / timestamp.
11. Remove a user from `ADMIN_EMAILS` → user retains `is_admin` (additive-only env reconciliation).
12. Disable Google env vars → button hidden, `/api/auth/google/start` → 503.

### Explicitly NOT tested in v1

- Mobile UI (out of scope).
- Telegram bot admin commands (out of scope).
- User deletion (out of scope).
- PKCE on macOS URL scheme (deferred hardening).
- Email-based password reset flow (deferred; admin sets temp pw inline).

## 12. Rollout

1. Apply schema migrations (additive; safe on prod re-run).
2. Deploy backend with Google routes gated on env-var presence (default: disabled until `GOOGLE_CLIENT_*` set).
3. Deploy web with Admin route and Google button (button hidden when `google_enabled=false`).
4. Deploy macOS build with URL scheme registered + admin window.
5. Owner sets `ADMIN_EMAILS=<owner-email>` in `.env`, restarts server. Logs in → confirms `is_admin=true` in `/api/auth/me`.
6. Owner configures Google Cloud OAuth client, sets `GOOGLE_CLIENT_*` env vars, restarts server.
7. Owner invites family by sharing the login URL. New Google sign-ins land in the approval queue.
