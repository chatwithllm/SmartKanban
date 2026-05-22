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

3. **Approval queue.** Google login for an unknown email creates a row in `pending_users` — *not* in `users`. The callback 302-redirects the browser to `/awaiting-approval?id=<pending_id>`. That page polls `/api/auth/pending/:id`. The admin sees the queue at `/admin`, clicks Approve → a single transaction INSERTs the new `users` row, links the identity, writes the audit row, creates a session + 60s ticket, and UPDATEs the pending row to `outcome='approved'` with the ticket attached. Reject UPDATEs the pending row to `outcome='rejected'`. The pending row survives until the reaper deletes it (rows with `outcome != 'pending'` older than 5 minutes). Bootstrap exception: if the pending email is in `ADMIN_EMAILS` and `email_verified=true`, skip the queue entirely — create the user directly as admin with an `env_promote` audit row (see Section 5 callback spec).

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
  actor_id          UUID REFERENCES users(id) ON DELETE SET NULL,  -- nullable so audit
                                                                   -- rows outlive deleted users
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
- `pending_users` is independent from `users` until approval. Approve runs a single transaction: INSERT users + INSERT user_identities + INSERT sessions + INSERT auth_tickets + INSERT admin_audit + UPDATE pending_users SET outcome='approved', outcome_ticket=<ticket>, outcome_at=NOW(). The pending row is **not** deleted at approval — the reaper sweeps `outcome != 'pending'` rows after 5 minutes (same job as session/ticket cleanup) so the pending user's HTTP poll can still read `outcome` and pick up the ticket.
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
        → Else (no identity, no email match):
            Bootstrap exception — if email_verified=true AND email is in ADMIN_EMAILS:
              Single transaction:
                INSERT users (name, short_name=split_part(name,' ',1), email,
                              auth_hash='oauth:google', is_admin=true)
                INSERT user_identities (provider='google', provider_sub, email, email_verified)
                INSERT admin_audit (actor_id=<new_user_id>, action='env_promote',
                                    target_user_id=<new_user_id>,
                                    metadata='{"source":"ADMIN_EMAILS","via":"google_bootstrap"}')
              Treat as logged in (create session) just like the auto-link branch.
              No row written to pending_users.
            Otherwise:
              UPSERT pending_users on (provider, provider_sub). If existing row has
              outcome='rejected', reset outcome='pending' and clear outcome_ticket/outcome_at.
              Always end the response as a top-level browser navigation:
              302 redirect (NOT a 202 JSON response — the callback is a browser GET).
        → web return (302 targets):
            existing-identity / auto-link / bootstrap branch → /
            pending branch                                   → /awaiting-approval?id=<pending_id>
        → macos return (302 targets):
            existing-identity / auto-link / bootstrap branch → kanbanclaude://auth?ticket=<one-time>
            pending branch                                   → /awaiting-approval?id=<pending_id>
            (After admin approves later, the macOS user re-clicks "Sign in with Google" in
             the app. That second pass hits the existing-identity branch above and returns
             a kanbanclaude:// ticket. See Section 7 Flow C note.)

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

  // UPDATE + audit INSERT must be atomic. A crash between them would promote a
  // user with no audit row, violating the rule that every admin action writes
  // admin_audit in the same transaction. Use a single CTE.
  await pool.query(
    `WITH promoted AS (
       UPDATE users SET is_admin=true
       WHERE id=$1 AND is_admin=false
       RETURNING id
     )
     INSERT INTO admin_audit (actor_id, action, target_user_id, metadata)
     SELECT id, 'env_promote', id, '{"source":"ADMIN_EMAILS"}'::jsonb FROM promoted`,
    [userId],
  );
  return true;
}
```

## 6. Frontend UI

### Web (`web/src/`)

**New files:**

- `views/AdminView.tsx` — top-level page mounted at `/admin`. Tab strip: Users · Approvals · Audit.
- `views/admin/UsersTab.tsx` — table of users: short_name, email, identity badges (password / google), is_admin toggle, "Reset password" button, "Revoke sessions" button. "Reset password" is **disabled** for users whose only identity is `google` (no `password` row in their identities and `auth_hash='oauth:google'`) — forcing a password they never had only creates confusion. Tooltip on the disabled button: "User signs in via Google; password reset doesn't apply."
- `views/admin/ApprovalsTab.tsx` — list of `pending_users` with avatar, name, email, "Approve" + "Reject" actions. Approve opens a modal asking for `short_name`.
- `views/admin/AuditTab.tsx` — paginated audit log. Each row: actor → action → target, timestamp, expand for metadata JSON.
- `views/AwaitingApproval.tsx` — landing page after Google OAuth callback when account is pending. Polls `/api/auth/pending/:id` every 5s. On `status='approved'`, POSTs the ticket to `/api/auth/ticket/exchange`; on success redirects to `/`. **If the exchange returns 410 `ticket_invalid` (user came back after 60s ticket TTL), render a "Session expired — sign in again" view with a button that re-initiates Google OAuth.** That second pass takes the existing-identity branch and signs the user in normally. On `status='rejected'`, show denial message; no retry button.
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

### Data caveats

- `pending_users.picture_url` is **dropped at approval time** — `users` and `user_identities` have no avatar column. The Google profile picture is used only in the Approvals tab to help the admin recognize the person. Adding an avatar column to `users` is out of scope for v1.

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
   │                      │ ws broadcast 'pending_changed' (admin UIs only)
   │                      │ users + identity inserted; pending row UPDATEd
   │                      │ outcome='approved' with outcome_ticket
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

**macOS new-user case (not shown above).** Flow C covers the existing-identity
path only. A new macOS user lands in the queue: the system browser is sent to
`/awaiting-approval?id=<pending_id>` (same as Flow B), and the macOS app never
receives a `kanbanclaude://` URL. `pending_users` carries no `return=macos`
hint, so the approval transaction cannot redirect back to the URL scheme.

After the admin approves, the user identity now exists in `user_identities`.
The user re-opens the macOS app, clicks "Sign in with Google" again — this
second pass takes the existing-identity branch of `/api/auth/google/callback`,
which already issues a `kanbanclaude://auth?ticket=...` redirect. From there
the flow above runs end-to-end. AwaitingApproval in the system browser tells
the user this in plain language: "Approved — return to the KanbanClaude app
and sign in with Google again."

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
   │                          │   SELECT * FROM pending_users WHERE id=$1
   │                          │     AND outcome='pending' FOR UPDATE
   │                          │   INSERT users
   │                          │   INSERT user_identities (from pending row)
   │                          │   INSERT sessions
   │                          │   INSERT auth_tickets (60s)
   │                          │   INSERT admin_audit
   │                          │   UPDATE pending_users
   │                          │     SET outcome='approved',
   │                          │         outcome_ticket=<ticket>,
   │                          │         outcome_at=NOW()
   │                          │     WHERE id=$1
   │                          │ COMMIT
   │                          │ ws broadcast 'pending_changed' { pending_id }  (admin UIs only)
   │ { user_id }              │
   │◄─────────────────────────│
   │                          │                        │ poll picks up status='approved'
   │                          │                        │ + ticket; exchange for cookie
```

### Edge cases

| Case | Behavior |
|------|----------|
| Concurrent approve + reject on same pending row | Second action sees zero rows in `UPDATE ... WHERE outcome='pending' RETURNING` → 409 `pending_gone`. |
| User returns to AwaitingApproval after ticket expires | Ticket TTL is 60s; the reaper holds the pending row for 5 min. A user who closes the tab and returns after 60s sees `status='approved'` with an expired ticket; `/api/auth/ticket/exchange` returns 410 `ticket_invalid`. **Recovery:** `user_identities` already exists, so `AwaitingApproval.tsx` catches 410 from the exchange call and renders an action: "Session expired — sign in again." The button restarts Google OAuth; the next callback takes the existing-identity branch (Flow A) and lands the user normally. Same recovery applies on macOS — re-click "Sign in with Google" in the app. |
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
6. **Last-admin guard** — enforced inside the demote transaction. Postgres rejects `FOR UPDATE` with aggregates, so do not use `SELECT COUNT(*) ... FOR UPDATE`. Instead row-lock the candidate set and count in application code:
   ```sql
   BEGIN;
     SELECT id FROM users
     WHERE is_admin = true AND id <> $target_user_id
     FOR UPDATE;
   -- if the returned row count is 0 → ROLLBACK and respond 409 last_admin
     UPDATE users SET is_admin=false WHERE id=$target_user_id;
     INSERT INTO admin_audit (...) VALUES (...);
   COMMIT;
   ```
   The `FOR UPDATE` on the other-admins rowset blocks a concurrent demote from racing the check.
7. **Admin password reset** — sets `must_change_password=true` and deletes all existing sessions. Login flow refuses all routes except `/api/auth/change-password` until the flag clears.
8. **Audit immutability** — no UPDATE/DELETE endpoint exists. INSERT-only. Retention indefinite (household scale, low volume).
9. **ADMIN_EMAILS** — additive only. Removing an email never demotes. Demote happens explicitly via UI. Documented.
10. **Argon2 placeholder for OAuth-only users** — `auth_hash='oauth:google'`. `verifyPassword` returns false. Defense-in-depth: login rejects when `auth_hash NOT LIKE '$argon2%'`.
11. **`pending_id` in URL** — `/api/auth/pending/:id` is unauthenticated and can return a session-granting ticket. The `id` is a UUIDv4 (122 bits of entropy), so guessing is infeasible. The risk is incidental disclosure: the id rides in the URL, so it can land in browser history, referer headers (e.g. if the AwaitingApproval page is iframed by a third party), and reverse-proxy access logs. Mitigations in scope for v1: short ticket TTL (60s), single-use consume, and the fact that the id alone is useless until an admin acts. **Optional hardening (v2):** bind the ticket retrieval to the original OAuth `state` cookie — set a long-lived `pending_session=<random>` cookie at callback time and require it on `/api/auth/pending/:id`. This adds one more secret the attacker would need from the same browser. Not implemented in v1 to keep the polling endpoint behaviorally simple.

## 11. Testing Strategy

### Unit tests (extend `server/src/__tests__/`)

- **`auth.test.ts`**: `reconcileEnvAdmin` promotes on match, no-op otherwise, idempotent on second call. `verifyPassword` returns false for `oauth:google` hash. `requireAdmin` rejects 403 for non-admin, passes for admin.
- **`google_oauth.test.ts`** (new): valid id_token passes; wrong aud, wrong iss, expired, bad signature all fail. State cookie missing → `csrf_invalid`. Disabled (no env vars) → 503 `google_oauth_disabled`.
- **`auth_tickets.test.ts`** (new): exchange unknown → 410. Exchange consumed → 410. Exchange expired → 410. Successful consume marks `consumed=true` and returns session.

### Integration tests (real Postgres via existing test setup)

- **`admin_users.test.ts`**: Non-admin → 403 on `GET /api/admin/users`. Admin sees list with identities + session_count. Promote: 200, audit row. Demote last admin → 409. Demote when ≥2 admins → 200. Self-demote when sole admin → 409. Reset password: hash changes, sessions deleted, `must_change_password=true`, audit row. Revoke sessions: count in audit metadata.
- **`admin_pending.test.ts`**: Google callback for unknown email_verified=true → 302 to `/awaiting-approval` + pending row created with outcome='pending'. Approve creates user + identity + session + ticket; pending row UPDATEd to outcome='approved' with outcome_ticket populated; audit row written; `pending_changed` WS broadcast emitted. Concurrent approves → one wins (UPDATE returns row), other gets `pending_gone` (UPDATE returns zero rows due to outcome filter). Reject UPDATEs to outcome='rejected' + audit. Approve when email exists → `email_in_use`. Bootstrap branch: Google callback with email in `ADMIN_EMAILS` and email_verified=true creates user directly as admin and writes `env_promote` audit row (no pending row).
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
5. Owner sets `ADMIN_EMAILS=<owner-email>` in `.env`, restarts server. Logs in (password or Google) → confirms `is_admin=true` in `/api/auth/me`. **This closes the bootstrap hole:** even if the owner's first-ever sign-in is via Google on a fresh DB, the callback's bootstrap exception (Section 5) creates them as admin directly instead of dropping them into a queue with no admin to approve.
6. Owner configures Google Cloud OAuth client, sets `GOOGLE_CLIENT_*` env vars, restarts server.
7. Owner invites family by sharing the login URL. New Google sign-ins (emails NOT in `ADMIN_EMAILS`) land in the approval queue.
