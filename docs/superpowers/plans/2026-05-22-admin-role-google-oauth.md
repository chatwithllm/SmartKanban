# Admin Role + Google OAuth + Approval Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship household-owner admin role (promote/demote, reset password, revoke sessions, audit log) together with a Google OAuth sign-in path that coexists with email+password auth and gates unknown signups through an admin approval queue.

**Architecture:** Three intertwined capabilities ship as one milestone. Postgres schema gains `is_admin` on `users`, plus `user_identities`, `pending_users`, `auth_tickets`, and `admin_audit` tables (all additive, idempotent). Fastify routes split into `routes/admin.ts` (gated by new `requireAdmin` preHandler), `routes/google_oauth.ts` (start + callback), and additions to `routes/auth.ts` (pending poll, ticket exchange, change-password). Web gets a new `/admin` route and an "Awaiting approval" landing page after Google OAuth for unknown emails. macOS opens the system browser for Google sign-in and receives the session via a one-time `kanbanclaude://auth?ticket=...` URL scheme that exchanges for a session token.

**Tech Stack:** TypeScript / Fastify 4 / Postgres (pg 8) / argon2 / @fastify/cookie / @fastify/websocket / `google-auth-library` (new dep) / `@fastify/rate-limit` (new dep) on the server; React 18 / Vite / TypeScript on the web; SwiftUI on macOS. Tests use `node:test` via `tsx` against a real Postgres test DB.

**Spec:** [docs/superpowers/specs/2026-05-22-admin-role-google-oauth-design.md](../specs/2026-05-22-admin-role-google-oauth-design.md)

---

## File Structure

### New server files

- `server/migrations/2026-05-22-admin-and-google-oauth.sql` — additive schema for `is_admin`, `must_change_password`, `user_identities`, `pending_users`, `auth_tickets`, `admin_audit`
- `server/src/admin_audit.ts` — typed helpers for inserting audit rows (single source of action names)
- `server/src/google.ts` — `verifyIdToken()` with cached JWKS, `exchangeCode()`, env-var checks
- `server/src/auth_tickets.ts` — `issueTicket(sessionToken)`, `consumeTicket(ticket)`
- `server/src/routes/google_oauth.ts` — `GET /api/auth/google/start`, `GET /api/auth/google/callback`
- `server/src/routes/admin.ts` — all `/api/admin/*` endpoints
- `server/src/__tests__/admin_users.test.ts` — promote/demote/reset/revoke
- `server/src/__tests__/admin_pending.test.ts` — approve/reject queue
- `server/src/__tests__/google_oauth.test.ts` — id_token verification, callback branches, bootstrap
- `server/src/__tests__/auth_tickets.test.ts` — issue/consume/expire
- `server/src/__tests__/admin_audit.test.ts` — CTE atomicity, env_promote

### Modified server files

- `server/schema.sql` — append the new SQL block at the bottom (matches existing additive style)
- `server/src/auth.ts` — add `requireAdmin`, `reconcileEnvAdmin`, expand `AuthUser` type
- `server/src/routes/auth.ts` — `/api/auth/me` returns `is_admin` + `must_change_password`; `/api/auth/login` calls `reconcileEnvAdmin`; new `POST /api/auth/change-password`, `GET /api/auth/pending/:id`, `POST /api/auth/ticket/exchange`, `GET /api/auth/config`
- `server/src/index.ts` — register `googleOauthRoutes`, `adminRoutes`; start the reaper interval
- `server/src/ws.ts` — accept admin-only `pending_changed` broadcast

### New web files

- `web/src/views/AdminView.tsx`
- `web/src/views/admin/UsersTab.tsx`
- `web/src/views/admin/ApprovalsTab.tsx`
- `web/src/views/admin/AuditTab.tsx`
- `web/src/views/AwaitingApproval.tsx`
- `web/src/views/ChangePassword.tsx`
- `web/src/components/GoogleSignInButton.tsx`

### Modified web files

- `web/src/App.tsx` — add `/admin`, `/awaiting-approval`, `/change-password` routes
- `web/src/auth.tsx` — `User` type adds `is_admin`, `must_change_password`; auto-redirect on flag
- `web/src/api.ts` — admin endpoints, OAuth config endpoint, change-password
- `web/src/types.ts` — `AdminUser`, `PendingUser`, `AuditEntry`
- Existing login view — render `GoogleSignInButton` when `/api/auth/config` reports `google_enabled`

### New macOS files

- `macOS/KanbanClaude/App/URLSchemeHandler.swift` — handle `kanbanclaude://auth?ticket=...`
- `macOS/KanbanClaude/Networking/AuthClient+Google.swift` — opens system browser for OAuth
- `macOS/KanbanClaude/UI/Admin/AdminWindow.swift`
- `macOS/KanbanClaude/UI/Admin/AdminUsersView.swift`
- `macOS/KanbanClaude/UI/Admin/AdminApprovalsView.swift`
- `macOS/KanbanClaude/UI/Admin/AdminAuditView.swift`

### Modified macOS files

- `macOS/KanbanClaude.xcodeproj/project.yml` — add `CFBundleURLTypes` for `kanbanclaude` scheme
- `macOS/KanbanClaude/App/KanbanClaudeApp.swift` — wire URL handler, add Admin menu item
- `macOS/KanbanClaude/UI/Preferences/AccountTab.swift` — add "Sign in with Google" button
- `macOS/KanbanClaude/Models/User.swift` — add `isAdmin`, `mustChangePassword`

### Env / dependency changes

- New dependency (`server/package.json`): `google-auth-library`, `@fastify/rate-limit`
- New env vars: `ADMIN_EMAILS`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `PUBLIC_APP_URL`, `MACOS_URL_SCHEME`

---

## Phase 1 — Schema & migration

### Task 1: Add additive SQL migration

**Files:**
- Create: `server/migrations/2026-05-22-admin-and-google-oauth.sql`
- Modify: `server/schema.sql` (append the same block at the bottom for fresh-DB consistency)

- [ ] **Step 1: Write the migration SQL**

Create `server/migrations/2026-05-22-admin-and-google-oauth.sql` with exactly this content:

```sql
-- 2026-05-22 — admin role, Google OAuth identities, approval queue, audit log.
-- Additive + idempotent. Safe to re-run on existing databases.

-- admin role
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin) WHERE is_admin = TRUE;

-- forced-change-pw flag (admin reset path)
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

-- OAuth identities (one row per (user, provider) link)
CREATE TABLE IF NOT EXISTS user_identities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL,
  provider_sub    TEXT NOT NULL,
  email           TEXT NOT NULL,
  email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_sub)
);
CREATE INDEX IF NOT EXISTS idx_identities_user ON user_identities(user_id);

-- approval queue (one row per (provider, sub) attempt; survives outcome via reaper)
CREATE TABLE IF NOT EXISTS pending_users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider        TEXT NOT NULL,
  provider_sub    TEXT NOT NULL,
  email           TEXT NOT NULL,
  email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
  name            TEXT NOT NULL,
  picture_url     TEXT,
  outcome         TEXT NOT NULL DEFAULT 'pending',
  outcome_ticket  TEXT,
  outcome_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_sub)
);
CREATE INDEX IF NOT EXISTS idx_pending_outcome ON pending_users(outcome, outcome_at);

-- macOS native-auth handoff tickets (60s TTL, single-use)
CREATE TABLE IF NOT EXISTS auth_tickets (
  ticket         TEXT PRIMARY KEY,
  session_token  TEXT NOT NULL REFERENCES sessions(token) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consumed       BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at     TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_tickets_expiry ON auth_tickets(expires_at);

-- admin audit log (immutable; INSERT-only at the API layer)
-- actor_id intentionally nullable so audit rows outlive deleted users.
CREATE TABLE IF NOT EXISTS admin_audit (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id          UUID REFERENCES users(id) ON DELETE SET NULL,
  action            TEXT NOT NULL,
  target_user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  target_pending_id UUID REFERENCES pending_users(id) ON DELETE SET NULL,
  metadata          JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_actor   ON admin_audit(actor_id);
```

- [ ] **Step 2: Append the same block to `server/schema.sql`**

Open `server/schema.sql`. Find the last existing section (currently the notetaker Phase 1 additions near the bottom — confirm by reading the file). Append a blank line and the entire SQL block from Step 1 verbatim, preceded by the comment `-- 2026-05-22 — admin role, Google OAuth identities, approval queue, audit log.`

- [ ] **Step 3: Apply locally**

Run:
```bash
cd server && npm run db:init
```
Expected output: a stream of `NOTICE: ...` lines (because of `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`) and exit code 0. Re-running must produce the same output without errors.

- [ ] **Step 4: Verify columns and tables exist**

Run:
```bash
psql postgresql://kanban:kanban@localhost:5432/kanban -c "\d users" \
  | grep -E 'is_admin|must_change_password'
psql postgresql://kanban:kanban@localhost:5432/kanban -c "\dt" \
  | grep -E 'user_identities|pending_users|auth_tickets|admin_audit'
```
Expected: both grep commands produce non-empty output naming all six items.

- [ ] **Step 5: Commit**

```bash
git add server/migrations/2026-05-22-admin-and-google-oauth.sql server/schema.sql
git commit -m "feat(admin): add additive schema for admin role, OAuth identities, approval queue, audit log"
```

---

## Phase 2 — Auth helpers, types, and `/api/auth/me`

### Task 2: Extend `AuthUser` type and helpers

**Files:**
- Modify: `server/src/auth.ts`

- [ ] **Step 1: Read the current `auth.ts`**

Open `server/src/auth.ts`. Note the existing `AuthUser` type and the `requireUser` preHandler (already exported per the import in `server/src/routes/auth.ts`).

- [ ] **Step 2: Widen the `AuthUser` type**

Replace the existing line:
```ts
export type AuthUser = { id: string; name: string; short_name: string; email: string };
```
with:
```ts
export type AuthUser = {
  id: string;
  name: string;
  short_name: string;
  email: string;
  is_admin: boolean;
  must_change_password: boolean;
};
```

- [ ] **Step 3: Update the SQL projections that build `AuthUser`**

In the same file, every `pool.query<AuthUser>` (currently `userFromSession`, `userFromMirrorToken`, `userFromApiToken`) selects `u.id, u.name, COALESCE(u.short_name, u.name) AS short_name, u.email`. Append two columns to each: `, u.is_admin, u.must_change_password`. Example for `userFromSession`:
```ts
const { rows } = await pool.query<AuthUser>(
  `SELECT u.id, u.name, COALESCE(u.short_name, u.name) AS short_name, u.email,
          u.is_admin, u.must_change_password
   FROM sessions s JOIN users u ON u.id = s.user_id
   WHERE s.token = $1 AND s.expires_at > NOW()`,
  [token],
);
```
Repeat for `userFromMirrorToken` and `userFromApiToken`.

- [ ] **Step 4: Add `requireAdmin` and `reconcileEnvAdmin`**

Append to the bottom of `server/src/auth.ts`:
```ts
export async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  await requireUser(req, reply);
  if (reply.sent) return;
  if (!req.user?.is_admin) {
    return reply.code(403).send({ error: 'admin_required' });
  }
}

/**
 * Promote a user to admin if their email appears in the ADMIN_EMAILS env list.
 * UPDATE + audit INSERT run as a single CTE so a crash between them is impossible.
 * Additive only: removing an email from the env list never demotes anyone.
 */
export async function reconcileEnvAdmin(userId: string, email: string): Promise<boolean> {
  const list = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  if (!list.includes(email.toLowerCase())) return false;

  await pool.query(
    `WITH promoted AS (
       UPDATE users SET is_admin = TRUE
       WHERE id = $1 AND is_admin = FALSE
       RETURNING id
     )
     INSERT INTO admin_audit (actor_id, action, target_user_id, metadata)
     SELECT id, 'env_promote', id, '{"source":"ADMIN_EMAILS"}'::jsonb FROM promoted`,
    [userId],
  );
  return true;
}
```
If `FastifyRequest` / `FastifyReply` aren't already imported, add them to the existing `import type` line at the top.

- [ ] **Step 5: Reject non-argon2 hashes in `verifyPassword`**

Find `verifyPassword`. Wrap the existing body so it returns `false` early when the hash doesn't look like argon2:
```ts
export async function verifyPassword(hash: string, pw: string): Promise<boolean> {
  if (!hash.startsWith('$argon2')) return false; // OAuth-only users have 'oauth:google'
  try {
    return await argon2.verify(hash, pw);
  } catch {
    return false;
  }
}
```

- [ ] **Step 6: Build + typecheck**

```bash
cd server && npm run build
```
Expected: no TS errors.

- [ ] **Step 7: Commit**

```bash
git add server/src/auth.ts
git commit -m "feat(auth): widen AuthUser, add requireAdmin + reconcileEnvAdmin (single CTE), guard non-argon2 hashes"
```

---

### Task 3: Wire `is_admin` into `/api/auth/me` and `/api/auth/login`

**Files:**
- Modify: `server/src/routes/auth.ts`

- [ ] **Step 1: Make `/api/auth/me` return the new fields**

In `server/src/routes/auth.ts`, the existing handler returns `user` directly from `userFromSession`. Confirm that — `AuthUser` now includes `is_admin` and `must_change_password`, so the response already contains them once Task 2 is merged.

If the handler builds a partial object (`return { id, name, short_name, email }`) anywhere, replace with `return user;` to expose all fields.

- [ ] **Step 2: Call `reconcileEnvAdmin` after a successful login**

Find the `'/api/auth/login'` handler. After `verifyPassword` succeeds and before `createSession`, add:
```ts
await reconcileEnvAdmin(user.id, user.email);
```
Add `reconcileEnvAdmin` to the existing import block from `'../auth.js'`.

- [ ] **Step 3: Refetch the user after reconciliation so the response carries the freshly-flipped flag**

Replace the existing return value of the login handler:
```ts
const token = await createSession(user.id);
setSessionCookie(reply, token);
return { id: user.id, name: user.name, short_name: user.short_name, email: user.email };
```
with:
```ts
await reconcileEnvAdmin(user.id, user.email);
const token = await createSession(user.id);
setSessionCookie(reply, token);
const fresh = await userFromSession(token);
return fresh!;
```
Add `userFromSession` to the import block if not already there.

- [ ] **Step 4: Add a unit test**

Create `server/src/__tests__/auth_admin_helpers.test.ts`:
```ts
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../db.js';
import { reconcileEnvAdmin } from '../auth.js';

let userId = '';

before(async () => {
  process.env.ADMIN_EMAILS = 'owner@test.local';
  const email = `owner_${Math.random().toString(36).slice(2, 8)}@test.local`;
  process.env.ADMIN_EMAILS = email;
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (name, short_name, email, auth_hash)
     VALUES ('Owner', 'O', $1, '$argon2id$placeholder') RETURNING id`,
    [email],
  );
  userId = rows[0]!.id;
});

after(async () => {
  await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
  delete process.env.ADMIN_EMAILS;
});

test('reconcileEnvAdmin promotes matching email and writes audit row', async () => {
  const email = process.env.ADMIN_EMAILS!;
  const matched = await reconcileEnvAdmin(userId, email);
  assert.equal(matched, true);
  const u = await pool.query<{ is_admin: boolean }>(`SELECT is_admin FROM users WHERE id = $1`, [userId]);
  assert.equal(u.rows[0]!.is_admin, true);
  const a = await pool.query(
    `SELECT count(*)::int AS c FROM admin_audit
     WHERE actor_id = $1 AND action = 'env_promote'`, [userId],
  );
  assert.equal(a.rows[0]!.c, 1);
});

test('reconcileEnvAdmin is idempotent — second call writes no new audit row', async () => {
  await reconcileEnvAdmin(userId, process.env.ADMIN_EMAILS!);
  const a = await pool.query(
    `SELECT count(*)::int AS c FROM admin_audit
     WHERE actor_id = $1 AND action = 'env_promote'`, [userId],
  );
  assert.equal(a.rows[0]!.c, 1);
});

test('reconcileEnvAdmin returns false when email not in env list', async () => {
  const ok = await reconcileEnvAdmin(userId, 'someone-else@test.local');
  assert.equal(ok, false);
});
```

- [ ] **Step 5: Run the test**

```bash
cd server && npm test -- src/__tests__/auth_admin_helpers.test.ts
```
Expected: 3 tests pass.

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/auth.ts server/src/__tests__/auth_admin_helpers.test.ts
git commit -m "feat(auth): wire is_admin into /me + login; reconcile ADMIN_EMAILS on every login"
```

---

## Phase 3 — Audit helper and admin endpoints (users)

### Task 4: Audit helper module

**Files:**
- Create: `server/src/admin_audit.ts`
- Test: `server/src/__tests__/admin_audit.test.ts`

- [ ] **Step 1: Write the failing test first**

Create `server/src/__tests__/admin_audit.test.ts`:
```ts
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../db.js';
import { writeAudit } from '../admin_audit.js';

let actorId = '';
let targetId = '';

before(async () => {
  const a = await pool.query<{ id: string }>(
    `INSERT INTO users (name, short_name, email, auth_hash)
     VALUES ('Actor', 'A', $1, '$argon2id$x') RETURNING id`,
    [`audit_actor_${Math.random()}@test.local`],
  );
  actorId = a.rows[0]!.id;
  const b = await pool.query<{ id: string }>(
    `INSERT INTO users (name, short_name, email, auth_hash)
     VALUES ('Target', 'T', $1, '$argon2id$x') RETURNING id`,
    [`audit_target_${Math.random()}@test.local`],
  );
  targetId = b.rows[0]!.id;
});

after(async () => {
  await pool.query(`DELETE FROM users WHERE id IN ($1, $2)`, [actorId, targetId]);
});

test('writeAudit inserts a row with the expected fields', async () => {
  await writeAudit(pool, {
    actor_id: actorId,
    action: 'promote',
    target_user_id: targetId,
    metadata: { reason: 'unit test' },
  });
  const { rows } = await pool.query(
    `SELECT actor_id, action, target_user_id, metadata
     FROM admin_audit WHERE actor_id = $1 ORDER BY created_at DESC LIMIT 1`, [actorId],
  );
  assert.equal(rows[0]!.action, 'promote');
  assert.equal(rows[0]!.target_user_id, targetId);
  assert.deepEqual(rows[0]!.metadata, { reason: 'unit test' });
});
```

- [ ] **Step 2: Run the test, watch it fail**

```bash
cd server && npm test -- src/__tests__/admin_audit.test.ts
```
Expected: FAIL — "Cannot find module '../admin_audit.js'".

- [ ] **Step 3: Implement the helper**

Create `server/src/admin_audit.ts`:
```ts
import type { Pool, PoolClient } from 'pg';

export type AdminAction =
  | 'promote'
  | 'demote'
  | 'reset_password'
  | 'revoke_sessions'
  | 'approve_user'
  | 'reject_user'
  | 'env_promote';

export type AuditEntry = {
  actor_id: string | null;
  action: AdminAction;
  target_user_id?: string | null;
  target_pending_id?: string | null;
  metadata?: Record<string, unknown>;
};

export async function writeAudit(
  db: Pool | PoolClient,
  entry: AuditEntry,
): Promise<void> {
  await db.query(
    `INSERT INTO admin_audit (actor_id, action, target_user_id, target_pending_id, metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [
      entry.actor_id,
      entry.action,
      entry.target_user_id ?? null,
      entry.target_pending_id ?? null,
      JSON.stringify(entry.metadata ?? {}),
    ],
  );
}
```

- [ ] **Step 4: Run the test again, watch it pass**

```bash
cd server && npm test -- src/__tests__/admin_audit.test.ts
```
Expected: 1 test passes.

- [ ] **Step 5: Commit**

```bash
git add server/src/admin_audit.ts server/src/__tests__/admin_audit.test.ts
git commit -m "feat(admin): add writeAudit helper with typed AdminAction enum"
```

---

### Task 5: `GET /api/admin/users` + `requireAdmin` gating

**Files:**
- Create: `server/src/routes/admin.ts`
- Modify: `server/src/index.ts`
- Test: `server/src/__tests__/admin_users.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/src/__tests__/admin_users.test.ts` with the standard helper at the top:
```ts
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { pool } from '../db.js';
import { authRoutes } from '../routes/auth.js';
import { adminRoutes } from '../routes/admin.js';

const app = Fastify();
await app.register(cookie, { secret: 'test-secret' });
await app.register(authRoutes);
await app.register(adminRoutes);
await app.ready();

async function register(name: string, makeAdmin = false) {
  const email = `${name}_${Math.random().toString(36).slice(2, 8)}@test.local`;
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { name, short_name: name, email, password: 'password123' },
  });
  const setCookie = res.headers['set-cookie'];
  const cookieStr = (Array.isArray(setCookie) ? setCookie[0] : setCookie) as string;
  const id = (res.json() as { id: string }).id;
  if (makeAdmin) await pool.query(`UPDATE users SET is_admin = TRUE WHERE id = $1`, [id]);
  return { cookie: cookieStr.split(';')[0]!, id, email };
}

let adminCookie = '';
let userCookie = '';

before(async () => {
  adminCookie = (await register('admin', true)).cookie;
  userCookie  = (await register('regular', false)).cookie;
});

after(async () => {
  await app.close();
  await pool.end();
});

test('GET /api/admin/users rejects non-admin with 403', async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/api/admin/users',
    headers: { cookie: userCookie },
  });
  assert.equal(res.statusCode, 403);
  assert.equal(res.json().error, 'admin_required');
});

test('GET /api/admin/users returns the list when called by an admin', async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/api/admin/users',
    headers: { cookie: adminCookie },
  });
  assert.equal(res.statusCode, 200);
  const list = res.json() as Array<{ id: string; is_admin: boolean; identities: unknown[] }>;
  assert.ok(list.length >= 2);
  assert.ok(list.some(u => u.is_admin === true));
});
```

- [ ] **Step 2: Run, watch it fail**

```bash
cd server && npm test -- src/__tests__/admin_users.test.ts
```
Expected: FAIL — "Cannot find module '../routes/admin.js'".

- [ ] **Step 3: Implement `adminRoutes` with `GET /api/admin/users`**

Create `server/src/routes/admin.ts`:
```ts
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { requireAdmin } from '../auth.js';

export async function adminRoutes(app: FastifyInstance) {
  app.get('/api/admin/users', { preHandler: requireAdmin }, async () => {
    const { rows } = await pool.query<{
      id: string;
      name: string;
      short_name: string;
      email: string;
      is_admin: boolean;
      last_login_at: string | null;
      session_count: number;
      created_at: string;
      identities: Array<{ provider: string; email: string }>;
    }>(`
      SELECT u.id, u.name,
             COALESCE(u.short_name, u.name) AS short_name,
             u.email, u.is_admin, u.created_at,
             (SELECT MAX(s.created_at) FROM sessions s WHERE s.user_id = u.id) AS last_login_at,
             (SELECT COUNT(*)::int FROM sessions s
                WHERE s.user_id = u.id AND s.expires_at > NOW()) AS session_count,
             COALESCE(
               (SELECT json_agg(json_build_object('provider', i.provider, 'email', i.email))
                FROM user_identities i WHERE i.user_id = u.id),
               '[]'::json
             ) AS identities
      FROM users u
      ORDER BY u.created_at ASC
    `);
    return rows;
  });
}
```

- [ ] **Step 4: Register the route in `index.ts`**

Open `server/src/index.ts`. In the import block near the top, add:
```ts
import { adminRoutes } from './routes/admin.js';
```
Find the section where other routes are registered (`await app.register(authRoutes); ...`) and add after `authRoutes`:
```ts
await app.register(adminRoutes);
```

- [ ] **Step 5: Run the test, watch it pass**

```bash
cd server && npm test -- src/__tests__/admin_users.test.ts
```
Expected: 2 tests pass.

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/admin.ts server/src/index.ts server/src/__tests__/admin_users.test.ts
git commit -m "feat(admin): add GET /api/admin/users gated by requireAdmin"
```

---

### Task 6: Promote / demote with last-admin guard

**Files:**
- Modify: `server/src/routes/admin.ts`
- Test: `server/src/__tests__/admin_users.test.ts` (extend)

- [ ] **Step 1: Add failing tests for promote, demote, last-admin guard**

Append to `server/src/__tests__/admin_users.test.ts`:
```ts
test('POST /api/admin/users/:id/promote flips is_admin and writes audit row', async () => {
  const target = await register('promote_target');
  const res = await app.inject({
    method: 'POST',
    url: `/api/admin/users/${target.id}/promote`,
    headers: { cookie: adminCookie },
  });
  assert.equal(res.statusCode, 200);
  const u = await pool.query(`SELECT is_admin FROM users WHERE id = $1`, [target.id]);
  assert.equal(u.rows[0]!.is_admin, true);
  const a = await pool.query(
    `SELECT count(*)::int AS c FROM admin_audit WHERE action='promote' AND target_user_id=$1`,
    [target.id],
  );
  assert.equal(a.rows[0]!.c, 1);
});

test('promote on an already-admin user returns 409 already_admin', async () => {
  const target = await register('already_admin', true);
  const res = await app.inject({
    method: 'POST',
    url: `/api/admin/users/${target.id}/promote`,
    headers: { cookie: adminCookie },
  });
  assert.equal(res.statusCode, 409);
  assert.equal(res.json().error, 'already_admin');
});

test('demote blocks when it would leave zero admins (last_admin)', async () => {
  // Find the sole admin in an isolated DB state by creating a fresh admin and demoting all others.
  await pool.query(`UPDATE users SET is_admin = FALSE WHERE email <> $1`,
    [(await pool.query(`SELECT email FROM users WHERE is_admin LIMIT 1`)).rows[0]!.email]);
  const soleAdmin = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE is_admin = TRUE LIMIT 1`,
  );
  const res = await app.inject({
    method: 'POST',
    url: `/api/admin/users/${soleAdmin.rows[0]!.id}/demote`,
    headers: { cookie: adminCookie },
  });
  assert.equal(res.statusCode, 409);
  assert.equal(res.json().error, 'last_admin');
});

test('demote succeeds when at least one other admin remains', async () => {
  const second = await register('second_admin', true);
  // adminCookie's user is still admin from the earlier test setup
  const res = await app.inject({
    method: 'POST',
    url: `/api/admin/users/${second.id}/demote`,
    headers: { cookie: adminCookie },
  });
  assert.equal(res.statusCode, 200);
  const u = await pool.query(`SELECT is_admin FROM users WHERE id = $1`, [second.id]);
  assert.equal(u.rows[0]!.is_admin, false);
});
```

- [ ] **Step 2: Run, watch the four new tests fail**

```bash
cd server && npm test -- src/__tests__/admin_users.test.ts
```
Expected: the original two tests still pass; the four new tests fail with 404 (route missing).

- [ ] **Step 3: Implement promote**

Add to `server/src/routes/admin.ts` inside `adminRoutes`:
```ts
import { writeAudit } from '../admin_audit.js';

app.post<{ Params: { id: string } }>(
  '/api/admin/users/:id/promote',
  { preHandler: requireAdmin },
  async (req, reply) => {
    const { id } = req.params;
    const { rows } = await pool.query<{ was_admin: boolean }>(
      `UPDATE users SET is_admin = TRUE WHERE id = $1 AND is_admin = FALSE
       RETURNING (SELECT is_admin FROM users WHERE id = $1) AS was_admin`,
      [id],
    );
    if (rows.length === 0) {
      // either user not found or already admin — disambiguate
      const exists = await pool.query(`SELECT is_admin FROM users WHERE id = $1`, [id]);
      if (exists.rowCount === 0) return reply.code(404).send({ error: 'not_found' });
      return reply.code(409).send({ error: 'already_admin' });
    }
    await writeAudit(pool, {
      actor_id: req.user!.id,
      action: 'promote',
      target_user_id: id,
    });
    return { ok: true };
  },
);
```

- [ ] **Step 4: Implement demote with row-lock last-admin guard**

Add after the promote handler:
```ts
app.post<{ Params: { id: string } }>(
  '/api/admin/users/:id/demote',
  { preHandler: requireAdmin },
  async (req, reply) => {
    const { id } = req.params;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const target = await client.query<{ is_admin: boolean }>(
        `SELECT is_admin FROM users WHERE id = $1 FOR UPDATE`, [id],
      );
      if (target.rowCount === 0) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'not_found' });
      }
      if (!target.rows[0]!.is_admin) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'already_not_admin' });
      }
      // Row-lock every OTHER admin. If zero rows are returned, demote would leave nobody.
      const others = await client.query(
        `SELECT id FROM users WHERE is_admin = TRUE AND id <> $1 FOR UPDATE`, [id],
      );
      if (others.rowCount === 0) {
        await client.query('ROLLBACK');
        const errorCode = id === req.user!.id ? 'cannot_demote_self_last_admin' : 'last_admin';
        return reply.code(409).send({ error: errorCode });
      }
      await client.query(`UPDATE users SET is_admin = FALSE WHERE id = $1`, [id]);
      await writeAudit(client, {
        actor_id: req.user!.id,
        action: 'demote',
        target_user_id: id,
      });
      await client.query('COMMIT');
      return { ok: true };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },
);
```

- [ ] **Step 5: Run, watch all tests pass**

```bash
cd server && npm test -- src/__tests__/admin_users.test.ts
```
Expected: 6 tests pass.

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/admin.ts server/src/__tests__/admin_users.test.ts
git commit -m "feat(admin): promote/demote endpoints with row-locked last-admin guard"
```

---

### Task 7: Reset-password and revoke-sessions

**Files:**
- Modify: `server/src/routes/admin.ts`
- Test: `server/src/__tests__/admin_users.test.ts` (extend)

- [ ] **Step 1: Add failing tests**

Append to `server/src/__tests__/admin_users.test.ts`:
```ts
test('POST /api/admin/users/:id/reset-password updates hash, sets must_change_password, kills sessions', async () => {
  const target = await register('reset_target');
  const res = await app.inject({
    method: 'POST',
    url: `/api/admin/users/${target.id}/reset-password`,
    headers: { cookie: adminCookie },
    payload: { new_password: 'newpassword' },
  });
  assert.equal(res.statusCode, 200);
  const u = await pool.query<{ must_change_password: boolean; auth_hash: string }>(
    `SELECT must_change_password, auth_hash FROM users WHERE id = $1`, [target.id],
  );
  assert.equal(u.rows[0]!.must_change_password, true);
  assert.ok(u.rows[0]!.auth_hash.startsWith('$argon2'));
  const s = await pool.query(`SELECT count(*)::int AS c FROM sessions WHERE user_id = $1`, [target.id]);
  assert.equal(s.rows[0]!.c, 0);
});

test('reset-password rejects passwords shorter than 6 chars', async () => {
  const target = await register('short_pw');
  const res = await app.inject({
    method: 'POST',
    url: `/api/admin/users/${target.id}/reset-password`,
    headers: { cookie: adminCookie },
    payload: { new_password: 'abc' },
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, 'password_too_short');
});

test('POST /api/admin/users/:id/revoke-sessions deletes all sessions and audits the count', async () => {
  const target = await register('revoke_target');
  // create a second session
  await app.inject({
    method: 'POST', url: '/api/auth/login',
    payload: { email: target.email, password: 'password123' },
  });
  const before = await pool.query(`SELECT count(*)::int AS c FROM sessions WHERE user_id = $1`, [target.id]);
  assert.ok(before.rows[0]!.c >= 1);
  const res = await app.inject({
    method: 'POST',
    url: `/api/admin/users/${target.id}/revoke-sessions`,
    headers: { cookie: adminCookie },
  });
  assert.equal(res.statusCode, 200);
  const after = await pool.query(`SELECT count(*)::int AS c FROM sessions WHERE user_id = $1`, [target.id]);
  assert.equal(after.rows[0]!.c, 0);
  const a = await pool.query<{ metadata: { count: number } }>(
    `SELECT metadata FROM admin_audit
     WHERE action='revoke_sessions' AND target_user_id=$1
     ORDER BY created_at DESC LIMIT 1`, [target.id],
  );
  assert.equal(a.rows[0]!.metadata.count, before.rows[0]!.c);
});
```

- [ ] **Step 2: Run, watch them fail**

```bash
cd server && npm test -- src/__tests__/admin_users.test.ts
```
Expected: previous 6 pass; the three new ones fail.

- [ ] **Step 3: Implement both endpoints**

Append to `server/src/routes/admin.ts` inside `adminRoutes`:
```ts
import { hashPassword } from '../auth.js'; // add to existing import if not already

app.post<{ Params: { id: string }; Body: { new_password: string } }>(
  '/api/admin/users/:id/reset-password',
  { preHandler: requireAdmin },
  async (req, reply) => {
    const { id } = req.params;
    const { new_password } = req.body ?? {};
    if (!new_password || new_password.length < 6) {
      return reply.code(400).send({ error: 'password_too_short' });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const exists = await client.query(`SELECT 1 FROM users WHERE id = $1`, [id]);
      if (exists.rowCount === 0) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'not_found' });
      }
      const hash = await hashPassword(new_password);
      await client.query(
        `UPDATE users SET auth_hash = $1, must_change_password = TRUE WHERE id = $2`,
        [hash, id],
      );
      await client.query(`DELETE FROM sessions WHERE user_id = $1`, [id]);
      await writeAudit(client, {
        actor_id: req.user!.id,
        action: 'reset_password',
        target_user_id: id,
      });
      await client.query('COMMIT');
      return { ok: true };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },
);

app.post<{ Params: { id: string } }>(
  '/api/admin/users/:id/revoke-sessions',
  { preHandler: requireAdmin },
  async (req, reply) => {
    const { id } = req.params;
    const exists = await pool.query(`SELECT 1 FROM users WHERE id = $1`, [id]);
    if (exists.rowCount === 0) return reply.code(404).send({ error: 'not_found' });
    const del = await pool.query(`DELETE FROM sessions WHERE user_id = $1`, [id]);
    await writeAudit(pool, {
      actor_id: req.user!.id,
      action: 'revoke_sessions',
      target_user_id: id,
      metadata: { count: del.rowCount ?? 0 },
    });
    return { ok: true, count: del.rowCount ?? 0 };
  },
);
```

- [ ] **Step 4: Run all admin_users tests**

```bash
cd server && npm test -- src/__tests__/admin_users.test.ts
```
Expected: all 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/admin.ts server/src/__tests__/admin_users.test.ts
git commit -m "feat(admin): reset-password (forces change + revokes sessions) + revoke-sessions endpoints"
```

---

### Task 8: Audit log endpoint

**Files:**
- Modify: `server/src/routes/admin.ts`
- Test: `server/src/__tests__/admin_users.test.ts` (extend) — keeps the audit endpoint covered by the existing harness

- [ ] **Step 1: Add a failing test for `GET /api/admin/audit`**

Append to `server/src/__tests__/admin_users.test.ts`:
```ts
test('GET /api/admin/audit returns recent rows ordered desc with cursor pagination', async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/api/admin/audit?limit=5',
    headers: { cookie: adminCookie },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json() as { items: Array<{ action: string; created_at: string }>; next_before?: string };
  assert.ok(Array.isArray(body.items));
  assert.ok(body.items.length <= 5);
  if (body.items.length >= 2) {
    assert.ok(new Date(body.items[0]!.created_at) >= new Date(body.items[1]!.created_at));
  }
});
```

- [ ] **Step 2: Watch it fail**

```bash
cd server && npm test -- src/__tests__/admin_users.test.ts
```
Expected: 9 pass, 1 fails (404).

- [ ] **Step 3: Implement the endpoint**

Append to `adminRoutes`:
```ts
app.get<{ Querystring: { limit?: string; before?: string } }>(
  '/api/admin/audit',
  { preHandler: requireAdmin },
  async (req) => {
    const rawLimit = Number(req.query.limit ?? '100');
    const limit = Math.max(1, Math.min(200, Number.isFinite(rawLimit) ? rawLimit : 100));
    const before = req.query.before;
    const params: unknown[] = [limit];
    let where = '';
    if (before) {
      params.push(before);
      where = `WHERE a.created_at < $2`;
    }
    const { rows } = await pool.query(
      `SELECT a.id, a.action, a.metadata, a.created_at,
              a.actor_id, ua.name AS actor_name,
              a.target_user_id, ut.name AS target_user_name,
              a.target_pending_id
       FROM admin_audit a
       LEFT JOIN users ua ON ua.id = a.actor_id
       LEFT JOIN users ut ON ut.id = a.target_user_id
       ${where}
       ORDER BY a.created_at DESC
       LIMIT $1`,
      params,
    );
    const next_before = rows.length === limit ? rows[rows.length - 1].created_at : undefined;
    return { items: rows, next_before };
  },
);
```

- [ ] **Step 4: Run, watch all 10 pass**

```bash
cd server && npm test -- src/__tests__/admin_users.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/admin.ts server/src/__tests__/admin_users.test.ts
git commit -m "feat(admin): paginated GET /api/admin/audit with cursor by created_at"
```

---

### Task 9: `GET /api/admin/env-admins`

**Files:**
- Modify: `server/src/routes/admin.ts`

- [ ] **Step 1: Implement (small enough to skip TDD for a pure env-read endpoint, but verify with a smoke test)**

Append to `adminRoutes`:
```ts
app.get('/api/admin/env-admins', { preHandler: requireAdmin }, async () => {
  const list = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  return { emails: list };
});
```

- [ ] **Step 2: Smoke test via curl after restart (or `npm test` after writing a quick test if time permits)**

```bash
cd server && npm run build && npm test -- src/__tests__/admin_users.test.ts
```
Expected: still 10 pass (no regressions).

- [ ] **Step 3: Commit**

```bash
git add server/src/routes/admin.ts
git commit -m "feat(admin): expose ADMIN_EMAILS env list via GET /api/admin/env-admins"
```

---

## Phase 4 — Google OAuth + identities

### Task 10: Add Google deps and env scaffolding

**Files:**
- Modify: `server/package.json`, `server/.env.example` (create if missing)

- [ ] **Step 1: Install dependencies**

```bash
cd server && npm install google-auth-library @fastify/rate-limit
```

- [ ] **Step 2: Document env vars**

Create or append `server/.env.example` with:
```
# Admin
ADMIN_EMAILS=

# Google OAuth (disabling these makes /api/auth/google/* return 503)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
PUBLIC_APP_URL=
MACOS_URL_SCHEME=kanbanclaude
```

- [ ] **Step 3: Commit**

```bash
git add server/package.json server/package-lock.json server/.env.example
git commit -m "chore(server): add google-auth-library + fastify rate-limit; document new env vars"
```

---

### Task 11: `verifyIdToken` + `exchangeCode` module

**Files:**
- Create: `server/src/google.ts`
- Test: `server/src/__tests__/google_oauth.test.ts`

- [ ] **Step 1: Write failing tests**

Create `server/src/__tests__/google_oauth.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { googleEnabled, verifyIdToken } from '../google.js';

test('googleEnabled() returns false when GOOGLE_CLIENT_ID/SECRET are unset', () => {
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  assert.equal(googleEnabled(), false);
});

test('googleEnabled() returns true when both are set', () => {
  process.env.GOOGLE_CLIENT_ID = 'x';
  process.env.GOOGLE_CLIENT_SECRET = 'y';
  assert.equal(googleEnabled(), true);
});

test('verifyIdToken rejects an empty token', async () => {
  await assert.rejects(() => verifyIdToken(''), /id_token_invalid/);
});
```

- [ ] **Step 2: Watch fail**

```bash
cd server && npm test -- src/__tests__/google_oauth.test.ts
```
Expected: module-not-found.

- [ ] **Step 3: Implement `google.ts`**

Create `server/src/google.ts`:
```ts
import { OAuth2Client } from 'google-auth-library';

export type GooglePayload = {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
};

export function googleEnabled(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function client(): OAuth2Client {
  if (!googleEnabled()) throw new Error('google_oauth_disabled');
  return new OAuth2Client({
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    redirectUri: process.env.GOOGLE_REDIRECT_URI!,
  });
}

export async function verifyIdToken(idToken: string): Promise<GooglePayload> {
  if (!idToken) throw new Error('id_token_invalid');
  const c = client();
  let ticket;
  try {
    ticket = await c.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
  } catch {
    throw new Error('id_token_invalid');
  }
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email) throw new Error('id_token_invalid');
  return {
    sub: payload.sub,
    email: payload.email,
    email_verified: payload.email_verified === true,
    name: payload.name,
    picture: payload.picture,
  };
}

export async function exchangeCode(code: string): Promise<{ id_token: string }> {
  try {
    const c = client();
    const { tokens } = await c.getToken(code);
    if (!tokens.id_token) throw new Error('oauth_failed');
    return { id_token: tokens.id_token };
  } catch (e) {
    if ((e as Error).message === 'google_oauth_disabled') throw e;
    throw new Error('oauth_failed');
  }
}

export function buildAuthUrl(state: string): string {
  const c = client();
  return c.generateAuthUrl({
    access_type: 'online',
    scope: ['openid', 'email', 'profile'],
    state,
    prompt: 'select_account',
  });
}
```

- [ ] **Step 4: Run, all 3 tests pass**

```bash
cd server && npm test -- src/__tests__/google_oauth.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add server/src/google.ts server/src/__tests__/google_oauth.test.ts
git commit -m "feat(auth): google.ts wraps OAuth2Client with verifyIdToken + exchangeCode + enabled-check"
```

---

### Task 12: `auth_tickets` helper module

**Files:**
- Create: `server/src/auth_tickets.ts`
- Test: `server/src/__tests__/auth_tickets.test.ts`

- [ ] **Step 1: Write failing tests**

Create `server/src/__tests__/auth_tickets.test.ts`:
```ts
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../db.js';
import { issueTicket, consumeTicket } from '../auth_tickets.js';
import { createSession } from '../auth.js';

let userId = '';
let sessionToken = '';

before(async () => {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (name, short_name, email, auth_hash)
     VALUES ('Ticket', 'T', $1, '$argon2id$x') RETURNING id`,
    [`ticket_${Math.random()}@test.local`],
  );
  userId = rows[0]!.id;
  sessionToken = await createSession(userId);
});

after(async () => {
  await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
});

test('issueTicket creates a 60s ticket bound to the session', async () => {
  const t = await issueTicket(sessionToken);
  assert.ok(t.length > 20);
  const { rows } = await pool.query(
    `SELECT consumed, expires_at FROM auth_tickets WHERE ticket = $1`, [t],
  );
  assert.equal(rows[0]!.consumed, false);
  assert.ok(new Date(rows[0]!.expires_at).getTime() > Date.now());
});

test('consumeTicket returns the session token and marks consumed', async () => {
  const t = await issueTicket(sessionToken);
  const token = await consumeTicket(t);
  assert.equal(token, sessionToken);
  await assert.rejects(() => consumeTicket(t), /ticket_invalid/);
});

test('consumeTicket rejects unknown tickets', async () => {
  await assert.rejects(() => consumeTicket('does-not-exist'), /ticket_invalid/);
});

test('consumeTicket rejects expired tickets', async () => {
  const t = await issueTicket(sessionToken);
  await pool.query(`UPDATE auth_tickets SET expires_at = NOW() - INTERVAL '1 second' WHERE ticket = $1`, [t]);
  await assert.rejects(() => consumeTicket(t), /ticket_invalid/);
});
```

- [ ] **Step 2: Watch fail**

```bash
cd server && npm test -- src/__tests__/auth_tickets.test.ts
```

- [ ] **Step 3: Implement `auth_tickets.ts`**

Create `server/src/auth_tickets.ts`:
```ts
import crypto from 'node:crypto';
import { pool } from './db.js';

const TICKET_TTL_SECONDS = 60;

export async function issueTicket(sessionToken: string): Promise<string> {
  const ticket = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + TICKET_TTL_SECONDS * 1000);
  await pool.query(
    `INSERT INTO auth_tickets (ticket, session_token, expires_at) VALUES ($1, $2, $3)`,
    [ticket, sessionToken, expires],
  );
  return ticket;
}

export async function consumeTicket(ticket: string): Promise<string> {
  const { rows } = await pool.query<{ session_token: string }>(
    `UPDATE auth_tickets
       SET consumed = TRUE
     WHERE ticket = $1 AND consumed = FALSE AND expires_at > NOW()
     RETURNING session_token`,
    [ticket],
  );
  if (rows.length === 0) throw new Error('ticket_invalid');
  return rows[0]!.session_token;
}

export async function reapExpired(): Promise<number> {
  const { rowCount } = await pool.query(
    `DELETE FROM auth_tickets WHERE expires_at < NOW() OR consumed = TRUE`,
  );
  return rowCount ?? 0;
}
```

- [ ] **Step 4: All 4 tests pass**

```bash
cd server && npm test -- src/__tests__/auth_tickets.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add server/src/auth_tickets.ts server/src/__tests__/auth_tickets.test.ts
git commit -m "feat(auth): auth_tickets module with 60s single-use issue/consume + reaper"
```

---

### Task 13: `/api/auth/google/start` + `/api/auth/google/callback`

**Files:**
- Create: `server/src/routes/google_oauth.ts`
- Modify: `server/src/index.ts`
- Test: `server/src/__tests__/google_oauth.test.ts` (extend with mock)

This is the longest task in the plan. Split into 7 sub-steps.

- [ ] **Step 1: Add `/start` to a new file**

Create `server/src/routes/google_oauth.ts`:
```ts
import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { pool } from '../db.js';
import { setSessionCookie, createSession, reconcileEnvAdmin } from '../auth.js';
import { writeAudit } from '../admin_audit.js';
import { issueTicket } from '../auth_tickets.js';
import { googleEnabled, buildAuthUrl, exchangeCode, verifyIdToken } from '../google.js';

const STATE_COOKIE = 'g_oauth_state';
const STATE_TTL_MS = 10 * 60 * 1000;

function disabled(reply: import('fastify').FastifyReply) {
  return reply.code(503).send({ error: 'google_oauth_disabled' });
}

export async function googleOauthRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { return?: 'web' | 'macos' } }>(
    '/api/auth/google/start',
    async (req, reply) => {
      if (!googleEnabled()) return disabled(reply);
      const ret = req.query.return === 'macos' ? 'macos' : 'web';
      const state = `${ret}.${crypto.randomBytes(16).toString('base64url')}`;
      reply.setCookie(STATE_COOKIE, state, {
        path: '/api/auth/google',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: STATE_TTL_MS / 1000,
      });
      return reply.redirect(buildAuthUrl(state));
    },
  );
}
```

- [ ] **Step 2: Register and smoke-test `/start`**

In `server/src/index.ts`, import and register:
```ts
import { googleOauthRoutes } from './routes/google_oauth.js';
// ...
await app.register(googleOauthRoutes);
```
Run `cd server && npm run build`. Expected: TS clean.

- [ ] **Step 3: Implement the callback skeleton (no DB writes yet, only state check)**

Append to `server/src/routes/google_oauth.ts` inside `googleOauthRoutes`:
```ts
app.get<{ Querystring: { code?: string; state?: string } }>(
  '/api/auth/google/callback',
  async (req, reply) => {
    if (!googleEnabled()) return disabled(reply);
    const { code, state } = req.query;
    const cookieState = req.cookies?.[STATE_COOKIE];
    reply.clearCookie(STATE_COOKIE, { path: '/api/auth/google' });
    if (!code || !state || !cookieState || cookieState !== state) {
      return reply.code(400).send({ error: 'csrf_invalid' });
    }
    const ret = state.startsWith('macos.') ? 'macos' : 'web';
    const { id_token } = await exchangeCode(code);
    const payload = await verifyIdToken(id_token);
    // Branches added in next steps.
    await handleCallback(req, reply, ret, payload);
  },
);
```

- [ ] **Step 4: Implement `handleCallback` with the four branches**

Append inside the same file (still inside `googleOauthRoutes`):
```ts
async function handleCallback(
  req: import('fastify').FastifyRequest,
  reply: import('fastify').FastifyReply,
  ret: 'web' | 'macos',
  payload: { sub: string; email: string; email_verified: boolean; name?: string; picture?: string },
) {
  // (1) Existing identity → log in.
  const identity = await pool.query<{ user_id: string; email: string }>(
    `SELECT user_id, email FROM user_identities WHERE provider = 'google' AND provider_sub = $1`,
    [payload.sub],
  );
  if (identity.rowCount! > 0) {
    const userId = identity.rows[0]!.user_id;
    const email = identity.rows[0]!.email;
    await reconcileEnvAdmin(userId, email);
    return finishLogin(reply, ret, userId);
  }

  // (2) Email match (verified) → auto-link.
  if (payload.email_verified) {
    const match = await pool.query<{ id: string }>(
      `SELECT id FROM users WHERE LOWER(email) = LOWER($1)`, [payload.email],
    );
    if (match.rowCount! > 0) {
      const userId = match.rows[0]!.id;
      await pool.query(
        `INSERT INTO user_identities (user_id, provider, provider_sub, email, email_verified)
         VALUES ($1, 'google', $2, $3, $4)`,
        [userId, payload.sub, payload.email, payload.email_verified],
      );
      await reconcileEnvAdmin(userId, payload.email);
      return finishLogin(reply, ret, userId);
    }
  }

  // (3) Bootstrap exception: verified email in ADMIN_EMAILS → create user as admin.
  if (payload.email_verified) {
    const adminEmails = (process.env.ADMIN_EMAILS ?? '')
      .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    if (adminEmails.includes(payload.email.toLowerCase())) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const name = payload.name ?? payload.email;
        const shortName = name.split(' ')[0]!.slice(0, 16);
        let userId: string;
        try {
          const { rows } = await client.query<{ id: string }>(
            `INSERT INTO users (name, short_name, email, auth_hash, is_admin)
             VALUES ($1, $2, $3, 'oauth:google', TRUE) RETURNING id`,
            [name, shortName, payload.email],
          );
          userId = rows[0]!.id;
        } catch (e) {
          await client.query('ROLLBACK');
          if ((e as { code?: string }).code === '23505') {
            // Race: another request created the same email between branch checks.
            // Fall through to the email-match branch by re-querying.
            const match = await pool.query<{ id: string }>(
              `SELECT id FROM users WHERE LOWER(email) = LOWER($1)`, [payload.email],
            );
            if (match.rowCount! > 0) {
              const existingId = match.rows[0]!.id;
              await pool.query(
                `INSERT INTO user_identities (user_id, provider, provider_sub, email, email_verified)
                 VALUES ($1, 'google', $2, $3, $4)
                 ON CONFLICT (provider, provider_sub) DO NOTHING`,
                [existingId, payload.sub, payload.email, payload.email_verified],
              );
              await reconcileEnvAdmin(existingId, payload.email);
              return finishLogin(reply, ret, existingId);
            }
            return reply.code(409).send({ error: 'email_in_use' });
          }
          throw e;
        }
        await client.query(
          `INSERT INTO user_identities (user_id, provider, provider_sub, email, email_verified)
           VALUES ($1, 'google', $2, $3, $4)`,
          [userId, payload.sub, payload.email, payload.email_verified],
        );
        await writeAudit(client, {
          actor_id: userId,
          action: 'env_promote',
          target_user_id: userId,
          metadata: { source: 'ADMIN_EMAILS', via: 'google_bootstrap' },
        });
        await client.query('COMMIT');
        return finishLogin(reply, ret, userId);
      } catch (e) {
        try { await client.query('ROLLBACK'); } catch { /* already rolled back */ }
        throw e;
      } finally {
        client.release();
      }
    }
  }

  // (4) Unknown email → approval queue.
  const upsert = await pool.query<{ id: string }>(
    `INSERT INTO pending_users (provider, provider_sub, email, email_verified, name, picture_url)
     VALUES ('google', $1, $2, $3, $4, $5)
     ON CONFLICT (provider, provider_sub) DO UPDATE
       SET email = EXCLUDED.email,
           email_verified = EXCLUDED.email_verified,
           name = EXCLUDED.name,
           picture_url = EXCLUDED.picture_url,
           outcome = CASE WHEN pending_users.outcome = 'rejected' THEN 'pending'
                          ELSE pending_users.outcome END,
           outcome_ticket = CASE WHEN pending_users.outcome = 'rejected' THEN NULL
                                 ELSE pending_users.outcome_ticket END,
           outcome_at = CASE WHEN pending_users.outcome = 'rejected' THEN NULL
                             ELSE pending_users.outcome_at END
     RETURNING id`,
    [payload.sub, payload.email, payload.email_verified, payload.name ?? payload.email, payload.picture ?? null],
  );
  return reply.redirect(`${process.env.PUBLIC_APP_URL ?? ''}/awaiting-approval?id=${upsert.rows[0]!.id}`);
}

async function finishLogin(
  reply: import('fastify').FastifyReply,
  ret: 'web' | 'macos',
  userId: string,
) {
  const token = await createSession(userId);
  if (ret === 'web') {
    setSessionCookie(reply, token);
    return reply.redirect(`${process.env.PUBLIC_APP_URL ?? ''}/`);
  }
  const ticket = await issueTicket(token);
  const scheme = process.env.MACOS_URL_SCHEME ?? 'kanbanclaude';
  return reply.redirect(`${scheme}://auth?ticket=${encodeURIComponent(ticket)}`);
}
```

- [ ] **Step 5: Add tests with a mocked `verifyIdToken`**

Append to `server/src/__tests__/google_oauth.test.ts` (the existing test file does not import the routes yet — extend it):
```ts
import { test as test2, before as before2, after as after2 } from 'node:test';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { pool } from '../db.js';

// Stub the google module so callback tests don't hit Google.
process.env.GOOGLE_CLIENT_ID = 'test';
process.env.GOOGLE_CLIENT_SECRET = 'test';
process.env.GOOGLE_REDIRECT_URI = 'http://localhost/callback';
process.env.PUBLIC_APP_URL = 'http://localhost:5173';
process.env.MACOS_URL_SCHEME = 'kanbanclaude';

const google = await import('../google.js');
let fakePayload = { sub: '', email: '', email_verified: true } as any;
(google as any).exchangeCode = async () => ({ id_token: 'stub' });
(google as any).verifyIdToken = async () => fakePayload;

const { googleOauthRoutes } = await import('../routes/google_oauth.js');

const app2 = Fastify();
await app2.register(cookie, { secret: 't' });
await app2.register(googleOauthRoutes);
await app2.ready();

after2(async () => { await app2.close(); });

test2('callback with mismatched state returns 400 csrf_invalid', async () => {
  const res = await app2.inject({
    method: 'GET',
    url: '/api/auth/google/callback?code=c&state=web.aaa',
    headers: { cookie: 'g_oauth_state=web.bbb' },
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, 'csrf_invalid');
});

test2('callback with new verified email NOT in ADMIN_EMAILS creates a pending row and redirects to /awaiting-approval', async () => {
  delete process.env.ADMIN_EMAILS;
  fakePayload = { sub: 'sub-new', email: `new_${Math.random()}@ex.com`, email_verified: true, name: 'Alice' };
  const res = await app2.inject({
    method: 'GET',
    url: '/api/auth/google/callback?code=c&state=web.zzz',
    headers: { cookie: 'g_oauth_state=web.zzz' },
  });
  assert.equal(res.statusCode, 302);
  assert.match(res.headers.location ?? '', /\/awaiting-approval\?id=/);
  const p = await pool.query(`SELECT outcome FROM pending_users WHERE provider_sub = 'sub-new'`);
  assert.equal(p.rows[0]!.outcome, 'pending');
});

test2('callback bootstrap branch creates an admin directly when email in ADMIN_EMAILS', async () => {
  const email = `boot_${Math.random()}@ex.com`;
  process.env.ADMIN_EMAILS = email;
  fakePayload = { sub: `sub-boot-${Math.random()}`, email, email_verified: true, name: 'Owner' };
  const res = await app2.inject({
    method: 'GET',
    url: '/api/auth/google/callback?code=c&state=web.boot',
    headers: { cookie: 'g_oauth_state=web.boot' },
  });
  assert.equal(res.statusCode, 302);
  assert.equal(res.headers.location, 'http://localhost:5173/');
  const u = await pool.query(`SELECT is_admin FROM users WHERE email = $1`, [email]);
  assert.equal(u.rows[0]!.is_admin, true);
});
```

- [ ] **Step 6: Run, all pass**

```bash
cd server && npm test -- src/__tests__/google_oauth.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add server/src/routes/google_oauth.ts server/src/index.ts server/src/__tests__/google_oauth.test.ts
git commit -m "feat(auth): /api/auth/google/start + /callback with 4 branches (identity, auto-link, bootstrap, pending)"
```

---

## Phase 5 — Approval queue endpoints + reaper

### Task 14: Pending poll + ticket exchange

**Files:**
- Modify: `server/src/routes/auth.ts`

- [ ] **Step 1: Add `GET /api/auth/pending/:id`**

In `server/src/routes/auth.ts` inside `authRoutes`:
```ts
app.get<{ Params: { id: string } }>('/api/auth/pending/:id', async (req, reply) => {
  const { rows } = await pool.query<{ outcome: string; outcome_ticket: string | null }>(
    `SELECT outcome, outcome_ticket FROM pending_users WHERE id = $1`, [req.params.id],
  );
  if (rows.length === 0) return reply.code(404).send({ error: 'not_found' });
  const { outcome, outcome_ticket } = rows[0]!;
  if (outcome === 'approved') return { status: 'approved', ticket: outcome_ticket };
  if (outcome === 'rejected') return { status: 'rejected' };
  return { status: 'pending' };
});
```

- [ ] **Step 2: Add `POST /api/auth/ticket/exchange`**

```ts
import { consumeTicket } from '../auth_tickets.js'; // add to existing import block

app.post<{ Body: { ticket: string } }>('/api/auth/ticket/exchange', async (req, reply) => {
  const { ticket } = req.body ?? {};
  if (!ticket) return reply.code(400).send({ error: 'ticket_required' });
  try {
    const sessionToken = await consumeTicket(ticket);
    setSessionCookie(reply, sessionToken);
    return { token: sessionToken };
  } catch (e) {
    if ((e as Error).message === 'ticket_invalid') {
      return reply.code(410).send({ error: 'ticket_invalid' });
    }
    throw e;
  }
});
```

- [ ] **Step 3: Add `GET /api/auth/config`**

```ts
import { googleEnabled } from '../google.js';

app.get('/api/auth/config', async () => {
  return {
    google_enabled: googleEnabled(),
    open_signup: process.env.OPEN_SIGNUP !== 'false',
  };
});
```

- [ ] **Step 4: Build**

```bash
cd server && npm run build
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/auth.ts
git commit -m "feat(auth): pending poll, ticket exchange, and /api/auth/config endpoints"
```

---

### Task 15: Admin approval + rejection endpoints

**Files:**
- Modify: `server/src/routes/admin.ts`
- Test: `server/src/__tests__/admin_pending.test.ts`

- [ ] **Step 1: Failing tests**

Create `server/src/__tests__/admin_pending.test.ts`:
```ts
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { pool } from '../db.js';
import { authRoutes } from '../routes/auth.js';
import { adminRoutes } from '../routes/admin.js';

const app = Fastify();
await app.register(cookie, { secret: 't' });
await app.register(authRoutes);
await app.register(adminRoutes);
await app.ready();

let adminCookie = '';

async function makePending(email: string, sub: string) {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO pending_users (provider, provider_sub, email, email_verified, name)
     VALUES ('google', $1, $2, true, 'Tester') RETURNING id`,
    [sub, email],
  );
  return rows[0]!.id;
}

before(async () => {
  const email = `admin_${Math.random()}@test.local`;
  const res = await app.inject({
    method: 'POST', url: '/api/auth/register',
    payload: { name: 'A', short_name: 'A', email, password: 'password123' },
  });
  adminCookie = (Array.isArray(res.headers['set-cookie'])
    ? res.headers['set-cookie'][0]
    : res.headers['set-cookie']!)!.split(';')[0]!;
  await pool.query(`UPDATE users SET is_admin = TRUE WHERE email = $1`, [email]);
});

after(async () => { await app.close(); });

test('approve creates user, identity, ticket, sets outcome=approved, writes audit', async () => {
  const email = `pend_${Math.random()}@ex.com`;
  const id = await makePending(email, `sub-${Math.random()}`);
  const res = await app.inject({
    method: 'POST',
    url: `/api/admin/pending/${id}/approve`,
    headers: { cookie: adminCookie },
    payload: { short_name: 'Pend' },
  });
  assert.equal(res.statusCode, 200);
  const u = await pool.query(`SELECT id FROM users WHERE LOWER(email) = LOWER($1)`, [email]);
  assert.equal(u.rowCount, 1);
  const p = await pool.query(`SELECT outcome, outcome_ticket FROM pending_users WHERE id = $1`, [id]);
  assert.equal(p.rows[0]!.outcome, 'approved');
  assert.ok(p.rows[0]!.outcome_ticket);
  const i = await pool.query(`SELECT 1 FROM user_identities WHERE user_id = $1`, [u.rows[0]!.id]);
  assert.equal(i.rowCount, 1);
  const a = await pool.query(
    `SELECT 1 FROM admin_audit WHERE action='approve_user' AND target_pending_id=$1`, [id],
  );
  assert.equal(a.rowCount, 1);
});

test('approving an already-approved row returns 409 pending_gone', async () => {
  const email = `dup_${Math.random()}@ex.com`;
  const id = await makePending(email, `sub-${Math.random()}`);
  await app.inject({
    method: 'POST', url: `/api/admin/pending/${id}/approve`,
    headers: { cookie: adminCookie }, payload: { short_name: 'X' },
  });
  const res2 = await app.inject({
    method: 'POST', url: `/api/admin/pending/${id}/approve`,
    headers: { cookie: adminCookie }, payload: { short_name: 'X' },
  });
  assert.equal(res2.statusCode, 409);
  assert.equal(res2.json().error, 'pending_gone');
});

test('reject sets outcome=rejected and writes audit with email + name snapshot', async () => {
  const email = `r_${Math.random()}@ex.com`;
  const id = await makePending(email, `sub-${Math.random()}`);
  const res = await app.inject({
    method: 'POST', url: `/api/admin/pending/${id}/reject`,
    headers: { cookie: adminCookie },
  });
  assert.equal(res.statusCode, 200);
  const p = await pool.query(`SELECT outcome FROM pending_users WHERE id = $1`, [id]);
  assert.equal(p.rows[0]!.outcome, 'rejected');
  const a = await pool.query<{ metadata: { email?: string; name?: string } }>(
    `SELECT metadata FROM admin_audit
     WHERE action='reject_user' AND target_pending_id=$1
     ORDER BY created_at DESC LIMIT 1`, [id],
  );
  assert.equal(a.rows[0]!.metadata.email, email);
  assert.equal(a.rows[0]!.metadata.name, 'Tester');
});

test('approve with email of an existing user returns 409 email_in_use', async () => {
  const email = `taken_${Math.random()}@ex.com`;
  await pool.query(
    `INSERT INTO users (name, short_name, email, auth_hash) VALUES ('Taken','T',$1,'$argon2id$x')`,
    [email],
  );
  const id = await makePending(email, `sub-${Math.random()}`);
  const res = await app.inject({
    method: 'POST', url: `/api/admin/pending/${id}/approve`,
    headers: { cookie: adminCookie }, payload: { short_name: 'X' },
  });
  assert.equal(res.statusCode, 409);
  assert.equal(res.json().error, 'email_in_use');
});

test('GET /api/admin/pending lists only outcome=pending rows', async () => {
  const id = await makePending(`only_${Math.random()}@ex.com`, `sub-${Math.random()}`);
  const res = await app.inject({
    method: 'GET', url: '/api/admin/pending',
    headers: { cookie: adminCookie },
  });
  assert.equal(res.statusCode, 200);
  const list = res.json() as Array<{ id: string }>;
  assert.ok(list.some(r => r.id === id));
});
```

- [ ] **Step 2: Watch fail**

```bash
cd server && npm test -- src/__tests__/admin_pending.test.ts
```

- [ ] **Step 3: Implement `GET /api/admin/pending`**

Append to `adminRoutes`:
```ts
app.get('/api/admin/pending', { preHandler: requireAdmin }, async () => {
  const { rows } = await pool.query(
    `SELECT id, email, email_verified, name, picture_url, created_at
     FROM pending_users
     WHERE outcome = 'pending'
     ORDER BY created_at ASC`,
  );
  return rows;
});
```

- [ ] **Step 4: Implement approve**

```ts
import crypto from 'node:crypto';

app.post<{ Params: { id: string }; Body: { short_name: string } }>(
  '/api/admin/pending/:id/approve',
  { preHandler: requireAdmin },
  async (req, reply) => {
    const { id } = req.params;
    const { short_name } = req.body ?? ({} as { short_name: string });
    if (!short_name || short_name.trim().length < 1 || short_name.trim().length > 16) {
      return reply.code(400).send({ error: 'short_name must be 1-16 characters' });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const pending = await client.query<{
        provider: string; provider_sub: string; email: string;
        email_verified: boolean; name: string;
      }>(
        `SELECT provider, provider_sub, email, email_verified, name
         FROM pending_users WHERE id = $1 AND outcome = 'pending' FOR UPDATE`,
        [id],
      );
      if (pending.rowCount === 0) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'pending_gone' });
      }
      const p = pending.rows[0]!;
      // Pre-check is best-effort; the catch on 23505 below is the authoritative guard
      // because another admin could insert the same email between this SELECT and the INSERT.
      const dup = await client.query(`SELECT 1 FROM users WHERE LOWER(email) = LOWER($1)`, [p.email]);
      if (dup.rowCount! > 0) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'email_in_use' });
      }
      let userId: string;
      try {
        const newUser = await client.query<{ id: string }>(
          `INSERT INTO users (name, short_name, email, auth_hash)
           VALUES ($1, $2, $3, 'oauth:google') RETURNING id`,
          [p.name, short_name.trim(), p.email],
        );
        userId = newUser.rows[0]!.id;
      } catch (e) {
        await client.query('ROLLBACK');
        if ((e as { code?: string }).code === '23505') {
          return reply.code(409).send({ error: 'email_in_use' });
        }
        throw e;
      }
      await client.query(
        `INSERT INTO user_identities (user_id, provider, provider_sub, email, email_verified)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, p.provider, p.provider_sub, p.email, p.email_verified],
      );
      const sessionToken = crypto.randomBytes(32).toString('base64url');
      const sessionExpires = new Date(Date.now() + 30 * 86400 * 1000);
      await client.query(
        `INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)`,
        [sessionToken, userId, sessionExpires],
      );
      const ticket = crypto.randomBytes(32).toString('base64url');
      const ticketExpires = new Date(Date.now() + 60 * 1000);
      await client.query(
        `INSERT INTO auth_tickets (ticket, session_token, expires_at) VALUES ($1, $2, $3)`,
        [ticket, sessionToken, ticketExpires],
      );
      await writeAudit(client, {
        actor_id: req.user!.id,
        action: 'approve_user',
        target_user_id: userId,
        target_pending_id: id,
      });
      await client.query(
        `UPDATE pending_users
           SET outcome = 'approved',
               outcome_ticket = $1,
               outcome_at = NOW()
         WHERE id = $2`,
        [ticket, id],
      );
      await client.query('COMMIT');
      broadcastPendingChanged(app, id);
      return { user_id: userId };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },
);
```

- [ ] **Step 5: Implement reject (single transaction, snapshot email + name into audit metadata)**

The pending row gets reaped 5 minutes after rejection — its email and name disappear with it. The audit row outlives the pending row, so snapshot the identifying fields into `metadata` at reject time. The UPDATE and the audit INSERT must run on the same client inside one transaction; otherwise a crash between them leaves a rejected row with no audit trail.

```ts
app.post<{ Params: { id: string } }>(
  '/api/admin/pending/:id/reject',
  { preHandler: requireAdmin },
  async (req, reply) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const updated = await client.query<{ email: string; name: string }>(
        `UPDATE pending_users
            SET outcome = 'rejected', outcome_at = NOW()
          WHERE id = $1 AND outcome = 'pending'
          RETURNING email, name`,
        [req.params.id],
      );
      if (updated.rowCount === 0) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'pending_gone' });
      }
      const snap = updated.rows[0]!;
      await writeAudit(client, {
        actor_id: req.user!.id,
        action: 'reject_user',
        target_pending_id: req.params.id,
        metadata: { email: snap.email, name: snap.name },
      });
      await client.query('COMMIT');
      broadcastPendingChanged(app, req.params.id);
      return { ok: true };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },
);
```

- [ ] **Step 6: Stub `broadcastPendingChanged` (real impl in Task 16)**

Add near the top of `adminRoutes`:
```ts
function broadcastPendingChanged(app: FastifyInstance, pendingId: string) {
  // Implemented properly in ws integration task. Safe no-op for now.
  // Once `ws.ts` exposes a `broadcastAdmin` helper, replace this stub.
  void app;
  void pendingId;
}
```

- [ ] **Step 7: Run, all 5 pending tests pass**

```bash
cd server && npm test -- src/__tests__/admin_pending.test.ts
```

- [ ] **Step 8: Commit**

```bash
git add server/src/routes/admin.ts server/src/__tests__/admin_pending.test.ts
git commit -m "feat(admin): approve/reject endpoints with outcome lifecycle and ticket creation"
```

---

### Task 16: WebSocket admin channel for `pending_changed`

**Files:**
- Modify: `server/src/ws.ts`, `server/src/routes/admin.ts`

- [ ] **Step 1: Read the existing `ws.ts` to understand the broadcast pattern**

Open `server/src/ws.ts`. Note how clients connect (likely `app.get('/ws', { websocket: true }, ...)`) and how the existing code keeps a set of connections.

- [ ] **Step 2: Add an admin-only broadcast helper**

Append to `server/src/ws.ts`:
```ts
import type { FastifyInstance } from 'fastify';

const adminSockets = new Set<import('ws').WebSocket>();

export function registerAdminSocket(ws: import('ws').WebSocket, isAdmin: boolean) {
  if (!isAdmin) return;
  adminSockets.add(ws);
  ws.once('close', () => adminSockets.delete(ws));
}

export function broadcastAdmin(event: string, payload: Record<string, unknown>) {
  const msg = JSON.stringify({ type: event, ...payload });
  for (const ws of adminSockets) {
    try { ws.send(msg); } catch { /* ignore */ }
  }
}
```
In the existing WS connection handler (whichever function handles `/ws` upgrades), after the user is identified, call:
```ts
registerAdminSocket(connection.socket, user.is_admin);
```
(Adapt to the exact handler name used by `@fastify/websocket` in this codebase.)

- [ ] **Step 3: Replace the stub in `admin.ts`**

In `server/src/routes/admin.ts`, replace the stub:
```ts
import { broadcastAdmin } from '../ws.js';

function broadcastPendingChanged(_app: FastifyInstance, pendingId: string) {
  broadcastAdmin('pending_changed', { pending_id: pendingId });
}
```

- [ ] **Step 4: Run all admin tests; smoke-test build**

```bash
cd server && npm test -- src/__tests__/admin_users.test.ts src/__tests__/admin_pending.test.ts
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add server/src/ws.ts server/src/routes/admin.ts
git commit -m "feat(ws): admin-only pending_changed broadcast; wire into approve/reject"
```

---

### Task 17: Reaper for `auth_tickets` + non-pending `pending_users`

**Files:**
- Create: `server/src/reaper.ts`
- Modify: `server/src/index.ts`

- [ ] **Step 1: Implement the reaper**

Create `server/src/reaper.ts`:
```ts
import { pool } from './db.js';

const INTERVAL_MS = 60 * 1000;

export function startReaper(): NodeJS.Timeout {
  const handle = setInterval(async () => {
    try {
      await pool.query(`DELETE FROM auth_tickets WHERE expires_at < NOW() OR consumed = TRUE`);
      await pool.query(
        `DELETE FROM pending_users
         WHERE outcome <> 'pending' AND outcome_at < NOW() - INTERVAL '5 minutes'`,
      );
      await pool.query(`DELETE FROM sessions WHERE expires_at < NOW()`);
    } catch (err) {
      console.error('[reaper] cleanup error', err);
    }
  }, INTERVAL_MS);
  handle.unref?.();
  return handle;
}
```

- [ ] **Step 2: Start in `index.ts`**

Import + call:
```ts
import { startReaper } from './reaper.js';
// after app.listen(...) succeeds:
startReaper();
```

- [ ] **Step 3: Smoke-test build**

```bash
cd server && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add server/src/reaper.ts server/src/index.ts
git commit -m "feat(server): periodic reaper deletes expired tickets, stale pending rows, expired sessions"
```

---

## Phase 6 — Change-password flow + rate limit

### Task 18: `POST /api/auth/change-password` and must-change enforcement

**Files:**
- Modify: `server/src/routes/auth.ts`, `server/src/auth.ts`

- [ ] **Step 1: Add the endpoint**

In `authRoutes`:
```ts
app.post<{ Body: { current_password: string; new_password: string } }>(
  '/api/auth/change-password',
  { preHandler: requireUser },
  async (req, reply) => {
    const { current_password, new_password } = req.body ?? ({} as { current_password: string; new_password: string });
    if (!new_password || new_password.length < 6) {
      return reply.code(400).send({ error: 'password_too_short' });
    }
    const { rows } = await pool.query<{ auth_hash: string }>(
      `SELECT auth_hash FROM users WHERE id = $1`, [req.user!.id],
    );
    if (rows.length === 0) return reply.code(404).send({ error: 'not_found' });
    if (!(await verifyPassword(rows[0]!.auth_hash, current_password))) {
      return reply.code(401).send({ error: 'invalid_credentials' });
    }
    const hash = await hashPassword(new_password);
    await pool.query(
      `UPDATE users SET auth_hash = $1, must_change_password = FALSE WHERE id = $2`,
      [hash, req.user!.id],
    );
    return { ok: true };
  },
);
```
Make sure `verifyPassword`, `hashPassword`, and `requireUser` are in the existing import block.

- [ ] **Step 2: Build**

```bash
cd server && npm run build
```

- [ ] **Step 3: Add a smoke test**

Append to `server/src/__tests__/auth_admin_helpers.test.ts` (or create a new `change_password.test.ts` if preferred):
```ts
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { authRoutes } from '../routes/auth.js';

const cpApp = Fastify();
await cpApp.register(cookie, { secret: 't' });
await cpApp.register(authRoutes);
await cpApp.ready();

test('change-password updates hash and clears must_change_password', async () => {
  const email = `cp_${Math.random()}@test.local`;
  const reg = await cpApp.inject({
    method: 'POST', url: '/api/auth/register',
    payload: { name: 'CP', short_name: 'CP', email, password: 'oldpass1' },
  });
  const c = (Array.isArray(reg.headers['set-cookie'])
    ? reg.headers['set-cookie'][0] : reg.headers['set-cookie']!)!.split(';')[0]!;
  await pool.query(`UPDATE users SET must_change_password = TRUE WHERE email = $1`, [email]);
  const ch = await cpApp.inject({
    method: 'POST', url: '/api/auth/change-password',
    headers: { cookie: c },
    payload: { current_password: 'oldpass1', new_password: 'newpass2' },
  });
  assert.equal(ch.statusCode, 200);
  const u = await pool.query<{ must_change_password: boolean }>(
    `SELECT must_change_password FROM users WHERE email = $1`, [email]);
  assert.equal(u.rows[0]!.must_change_password, false);
});
```

- [ ] **Step 4: Run**

```bash
cd server && npm test -- src/__tests__/auth_admin_helpers.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/auth.ts server/src/__tests__/auth_admin_helpers.test.ts
git commit -m "feat(auth): POST /api/auth/change-password verifies current pw and clears must_change flag"
```

---

### Task 19: Rate-limit `/api/auth/google/callback`

**Files:**
- Modify: `server/src/index.ts`, `server/src/routes/google_oauth.ts`

- [ ] **Step 1: Register `@fastify/rate-limit`**

In `server/src/index.ts`, after the cookie/cors registrations:
```ts
import rateLimit from '@fastify/rate-limit';
await app.register(rateLimit, { global: false });
```

- [ ] **Step 2: Apply per-IP limit to callback**

In `server/src/routes/google_oauth.ts`, update the callback registration to include `config.rateLimit`:
```ts
app.get<{ Querystring: { code?: string; state?: string } }>(
  '/api/auth/google/callback',
  { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
  async (req, reply) => { /* unchanged body */ },
);
```

- [ ] **Step 3: Build**

```bash
cd server && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add server/src/index.ts server/src/routes/google_oauth.ts
git commit -m "feat(security): per-IP rate limit on /api/auth/google/callback to bound queue spam"
```

---

## Phase 7 — Web UI: shared types, auth context, login button

### Task 20: Widen `User` type, expose `is_admin` and `must_change_password`

**Files:**
- Modify: `web/src/auth.tsx`, `web/src/types.ts`, `web/src/api.ts`

- [ ] **Step 1: Update the `User` type**

In `web/src/auth.tsx`, find the `User` interface (or `type User = { ... }`). Add fields:
```ts
is_admin: boolean;
must_change_password: boolean;
```
Adjust the `useAuth` hook so the typed user picks these up.

- [ ] **Step 2: Add API helpers in `web/src/api.ts`**

Append:
```ts
export async function fetchAuthConfig(): Promise<{ google_enabled: boolean; open_signup: boolean }> {
  const res = await fetch('/api/auth/config');
  if (!res.ok) throw new Error('config_failed');
  return res.json();
}

export async function changePassword(current_password: string, new_password: string) {
  const res = await fetch('/api/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ current_password, new_password }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? 'failed');
  return res.json();
}

export async function exchangeTicket(ticket: string): Promise<{ token: string }> {
  const res = await fetch('/api/auth/ticket/exchange', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticket }),
  });
  if (res.status === 410) throw new Error('ticket_invalid');
  if (!res.ok) throw new Error('failed');
  return res.json();
}

export async function fetchPendingStatus(id: string): Promise<{ status: 'pending' | 'approved' | 'rejected'; ticket?: string }> {
  const res = await fetch(`/api/auth/pending/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error('failed');
  return res.json();
}
```

- [ ] **Step 3: Build**

```bash
cd web && npm run build
```
Expected: no TS errors.

- [ ] **Step 4: Commit**

```bash
git add web/src/auth.tsx web/src/api.ts
git commit -m "feat(web): widen User type with is_admin/must_change_password; add auth helpers"
```

---

### Task 21: Google sign-in button + login page wire-up

**Files:**
- Create: `web/src/components/GoogleSignInButton.tsx`
- Modify: existing login view (locate via `grep -ri 'login' web/src/*.tsx | head` and pick the file rendering the email/password form)

- [ ] **Step 1: Create the button**

`web/src/components/GoogleSignInButton.tsx`:
```tsx
type Props = { onClick?: () => void };

export function GoogleSignInButton({ onClick }: Props) {
  const handleClick = () => {
    onClick?.();
    window.location.href = '/api/auth/google/start?return=web';
  };
  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex w-full items-center justify-center gap-3 rounded-md border border-white/10 bg-white text-zinc-900 px-4 py-2 text-sm font-medium shadow-sm hover:bg-zinc-50"
      aria-label="Sign in with Google"
    >
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
        <path d="M17.64 9.2c0-.64-.06-1.25-.17-1.84H9v3.48h4.84c-.21 1.13-.84 2.09-1.79 2.73v2.27h2.9c1.7-1.57 2.69-3.88 2.69-6.64z" fill="#4285F4"/>
        <path d="M9 18c2.43 0 4.46-.81 5.95-2.18l-2.9-2.27c-.81.54-1.84.86-3.05.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.34A9 9 0 0 0 9 18z" fill="#34A853"/>
        <path d="M3.95 10.69A5.4 5.4 0 0 1 3.66 9c0-.59.1-1.16.29-1.69V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.03l2.99-2.34z" fill="#FBBC05"/>
        <path d="M9 3.58c1.32 0 2.5.45 3.44 1.34l2.58-2.58C13.45.89 11.43 0 9 0A9 9 0 0 0 .96 4.97l2.99 2.34C4.66 5.18 6.65 3.58 9 3.58z" fill="#EA4335"/>
      </svg>
      Sign in with Google
    </button>
  );
}
```

- [ ] **Step 2: Render conditionally on the login view**

In the existing login form file, add at the top:
```tsx
import { useEffect, useState } from 'react';
import { GoogleSignInButton } from './components/GoogleSignInButton';
import { fetchAuthConfig } from './api';
```
Inside the component:
```tsx
const [googleEnabled, setGoogleEnabled] = useState(false);
useEffect(() => {
  fetchAuthConfig().then(c => setGoogleEnabled(c.google_enabled)).catch(() => {});
}, []);
```
Render the button above the email/password fields, gated on `googleEnabled`:
```tsx
{googleEnabled && (
  <>
    <GoogleSignInButton />
    <div className="my-3 flex items-center gap-2 text-xs text-ink-soft">
      <div className="h-px flex-1 bg-white/10" /> or <div className="h-px flex-1 bg-white/10" />
    </div>
  </>
)}
```

- [ ] **Step 3: Manual smoke test**

```bash
cd web && npm run dev
```
Visit `http://localhost:5173/`. Without env vars set, button stays hidden (config returns `google_enabled: false`). With vars set, button appears.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/GoogleSignInButton.tsx web/src/<login-view-file>.tsx
git commit -m "feat(web): GoogleSignInButton with gated render on /api/auth/config"
```

---

### Task 22: `AwaitingApproval.tsx`

**Files:**
- Create: `web/src/views/AwaitingApproval.tsx`
- Modify: `web/src/App.tsx`

- [ ] **Step 1: Create the view**

`web/src/views/AwaitingApproval.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { fetchPendingStatus, exchangeTicket } from '../api';

export function AwaitingApproval() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const [state, setState] = useState<'pending' | 'approved' | 'rejected' | 'expired' | 'error'>('pending');

  useEffect(() => {
    if (!id) { setState('error'); return; }
    let cancelled = false;
    const tick = async () => {
      try {
        const status = await fetchPendingStatus(id);
        if (cancelled) return;
        if (status.status === 'pending') return;
        if (status.status === 'rejected') { setState('rejected'); return; }
        // approved: exchange the ticket
        try {
          await exchangeTicket(status.ticket!);
          window.location.replace('/');
        } catch (e) {
          if ((e as Error).message === 'ticket_invalid') setState('expired');
          else setState('error');
        }
      } catch {
        if (!cancelled) setState('error');
      }
    };
    tick();
    const handle = setInterval(tick, 5000);
    return () => { cancelled = true; clearInterval(handle); };
  }, [id]);

  if (state === 'pending') return <Card title="Waiting for an admin to approve your sign-in" body="You'll be redirected automatically once approved. Feel free to leave this tab open." />;
  if (state === 'rejected') return <Card title="Sign-in denied" body="An admin declined this request. Contact the owner of this kanban to ask why." />;
  if (state === 'expired') return (
    <Card title="Session expired — sign in again"
      body="Your approval came through, but the one-time sign-in link expired. Click below to finish signing in.">
      <button
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
        onClick={() => { window.location.href = '/api/auth/google/start?return=web'; }}
      >
        Sign in with Google
      </button>
    </Card>
  );
  return <Card title="Something went wrong" body="Refresh and try signing in with Google again." />;
}

function Card({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className="mx-auto mt-24 max-w-md rounded-2xl bg-ink-card p-6 shadow-card">
      <h1 className="text-lg font-semibold text-white">{title}</h1>
      <p className="mt-2 text-sm text-ink-soft">{body}</p>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Register route in `App.tsx`**

Open `web/src/App.tsx` and add a path check for `/awaiting-approval`:
```tsx
import { AwaitingApproval } from './views/AwaitingApproval';
// ...
if (window.location.pathname === '/awaiting-approval') return <AwaitingApproval />;
```
Place this branch above the existing auth-gate so it renders even without a session.

- [ ] **Step 3: Build**

```bash
cd web && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add web/src/views/AwaitingApproval.tsx web/src/App.tsx
git commit -m "feat(web): AwaitingApproval page with poll + ticket exchange + 410-recovery flow"
```

---

### Task 23: `ChangePassword.tsx` with forced-change redirect

**Files:**
- Create: `web/src/views/ChangePassword.tsx`
- Modify: `web/src/App.tsx`, `web/src/auth.tsx`

- [ ] **Step 1: Create the view**

`web/src/views/ChangePassword.tsx`:
```tsx
import { useState } from 'react';
import { changePassword } from '../api';

export function ChangePassword() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (next !== confirm) { setErr('Passwords do not match.'); return; }
    if (next.length < 6) { setErr('New password must be at least 6 characters.'); return; }
    setBusy(true);
    try {
      await changePassword(current, next);
      window.location.replace('/');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mx-auto mt-24 max-w-sm rounded-2xl bg-ink-card p-6 shadow-card">
      <h1 className="text-lg font-semibold text-white">Set a new password</h1>
      <p className="mt-2 text-sm text-ink-soft">An admin reset your password. Choose a new one to continue.</p>
      {(['Current password', 'New password', 'Confirm new password'] as const).map((label, i) => (
        <label key={label} className="mt-4 block text-sm text-ink-soft">
          {label}
          <input
            type="password"
            required
            className="mt-1 w-full rounded-md bg-zinc-900 px-3 py-2 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-blue-500"
            value={i === 0 ? current : i === 1 ? next : confirm}
            onChange={e => (i === 0 ? setCurrent : i === 1 ? setNext : setConfirm)(e.target.value)}
          />
        </label>
      ))}
      {err && <p className="mt-3 text-sm text-red-400">{err}</p>}
      <button
        disabled={busy}
        className="mt-4 w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
      >
        {busy ? 'Updating…' : 'Update password'}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Force-redirect in `auth.tsx`**

In the place where `useAuth` resolves the current user (after `/api/auth/me`), add a side effect:
```tsx
useEffect(() => {
  if (user?.must_change_password && window.location.pathname !== '/change-password') {
    window.location.replace('/change-password');
  }
}, [user]);
```

- [ ] **Step 3: Register the route**

In `App.tsx`:
```tsx
import { ChangePassword } from './views/ChangePassword';
if (window.location.pathname === '/change-password') return <ChangePassword />;
```

- [ ] **Step 4: Build**

```bash
cd web && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add web/src/views/ChangePassword.tsx web/src/App.tsx web/src/auth.tsx
git commit -m "feat(web): ChangePassword view with forced redirect on must_change_password"
```

---

## Phase 8 — Web admin UI

### Task 24: `AdminView.tsx` shell with tab strip

**Files:**
- Create: `web/src/views/AdminView.tsx`
- Modify: `web/src/App.tsx`, `web/src/types.ts`

- [ ] **Step 1: Types**

Append to `web/src/types.ts`:
```ts
export type AdminUserRow = {
  id: string;
  name: string;
  short_name: string;
  email: string;
  is_admin: boolean;
  identities: Array<{ provider: string; email: string }>;
  last_login_at: string | null;
  session_count: number;
  created_at: string;
};

export type PendingUserRow = {
  id: string;
  email: string;
  email_verified: boolean;
  name: string;
  picture_url: string | null;
  created_at: string;
};

export type AuditEntryRow = {
  id: string;
  action: string;
  metadata: Record<string, unknown>;
  created_at: string;
  actor_id: string | null;
  actor_name: string | null;
  target_user_id: string | null;
  target_user_name: string | null;
  target_pending_id: string | null;
};
```

- [ ] **Step 2: Admin API helpers**

In `web/src/api.ts`, append:
```ts
import type { AdminUserRow, PendingUserRow, AuditEntryRow } from './types';

export async function adminListUsers(): Promise<AdminUserRow[]> {
  const res = await fetch('/api/admin/users');
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}
export async function adminPromote(id: string)  { return adminPost(`/api/admin/users/${id}/promote`); }
export async function adminDemote(id: string)   { return adminPost(`/api/admin/users/${id}/demote`); }
export async function adminRevoke(id: string)   { return adminPost(`/api/admin/users/${id}/revoke-sessions`); }
export async function adminResetPw(id: string, new_password: string) {
  return adminPost(`/api/admin/users/${id}/reset-password`, { new_password });
}
export async function adminListPending(): Promise<PendingUserRow[]> {
  const res = await fetch('/api/admin/pending');
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}
export async function adminApprove(id: string, short_name: string) {
  return adminPost(`/api/admin/pending/${id}/approve`, { short_name });
}
export async function adminReject(id: string) {
  return adminPost(`/api/admin/pending/${id}/reject`);
}
export async function adminAudit(params: { limit?: number; before?: string } = {}):
  Promise<{ items: AuditEntryRow[]; next_before?: string }>
{
  const qs = new URLSearchParams();
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.before) qs.set('before', params.before);
  const res = await fetch(`/api/admin/audit?${qs.toString()}`);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

async function adminPost(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(e.error ?? `${res.status}`);
  }
  return res.json().catch(() => ({}));
}
```

- [ ] **Step 3: Create the shell**

`web/src/views/AdminView.tsx`:
```tsx
import { useState } from 'react';
import { UsersTab } from './admin/UsersTab';
import { ApprovalsTab } from './admin/ApprovalsTab';
import { AuditTab } from './admin/AuditTab';

type Tab = 'users' | 'approvals' | 'audit';

export function AdminView() {
  const [tab, setTab] = useState<Tab>('users');
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-2xl font-semibold text-white">Admin</h1>
      <div className="mt-6 flex gap-2 border-b border-white/10">
        {(['users', 'approvals', 'audit'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm ${tab === t ? 'border-b-2 border-blue-500 text-white' : 'text-ink-soft hover:text-white'}`}
          >
            {t === 'users' ? 'Users' : t === 'approvals' ? 'Approvals' : 'Audit'}
          </button>
        ))}
      </div>
      <div className="mt-6">
        {tab === 'users' && <UsersTab />}
        {tab === 'approvals' && <ApprovalsTab />}
        {tab === 'audit' && <AuditTab />}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Route gate in `App.tsx`**

```tsx
import { AdminView } from './views/AdminView';
// after the user is resolved
if (window.location.pathname === '/admin') {
  if (!user) { window.location.replace('/'); return null; }
  if (!user.is_admin) { window.location.replace('/'); return null; }
  return <AdminView />;
}
```

- [ ] **Step 5: Sidebar/Nav link (locate Sidebar via `grep -ri 'Sidebar' web/src/components`)**

Wherever nav items are rendered, add a conditional link:
```tsx
{user.is_admin && (
  <a href="/admin" className="...">Admin</a>
)}
```

- [ ] **Step 6: Build**

```bash
cd web && npm run build
```
Expected: errors about missing UsersTab/ApprovalsTab/AuditTab modules — fixed in next tasks.

- [ ] **Step 7: Commit (with placeholder tabs to keep the tree green — write minimal stubs)**

Create stubs so the build is green:

`web/src/views/admin/UsersTab.tsx`, `ApprovalsTab.tsx`, `AuditTab.tsx`, each:
```tsx
export function UsersTab()    { return <div className="text-ink-soft">Users (coming up)</div>; }
export function ApprovalsTab(){ return <div className="text-ink-soft">Approvals (coming up)</div>; }
export function AuditTab()    { return <div className="text-ink-soft">Audit (coming up)</div>; }
```

```bash
cd web && npm run build  # confirm green
git add web/src/views/AdminView.tsx web/src/views/admin/*.tsx web/src/App.tsx web/src/types.ts web/src/api.ts
git commit -m "feat(web): AdminView shell with tab strip and admin API helpers"
```

---

### Task 25: `UsersTab.tsx` — list, promote/demote toggle, reset, revoke

**Files:**
- Modify: `web/src/views/admin/UsersTab.tsx`

- [ ] **Step 1: Replace the stub with the real implementation**

```tsx
import { useEffect, useState } from 'react';
import {
  adminListUsers, adminPromote, adminDemote, adminRevoke, adminResetPw,
} from '../../api';
import type { AdminUserRow } from '../../types';

export function UsersTab() {
  const [rows, setRows] = useState<AdminUserRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const refresh = () => adminListUsers().then(setRows).catch(e => setErr(String(e)));
  useEffect(() => { refresh(); }, []);

  if (err) return <div className="text-red-400">Failed to load: {err}</div>;
  if (!rows) return <div className="text-ink-soft">Loading…</div>;
  if (rows.length <= 1) return <div className="text-ink-soft">Only you. Family will appear here after they sign in.</div>;

  return (
    <table className="w-full text-sm">
      <thead className="text-ink-soft">
        <tr><th className="py-2 text-left">Name</th><th>Email</th><th>Identities</th><th>Admin</th><th>Actions</th></tr>
      </thead>
      <tbody>
        {rows.map(u => (
          <UserRow key={u.id} u={u} onChanged={refresh} />
        ))}
      </tbody>
    </table>
  );
}

function UserRow({ u, onChanged }: { u: AdminUserRow; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const onlyGoogle = u.identities.length > 0 && u.identities.every(i => i.provider === 'google');

  const togglePromo = async () => {
    setBusy(true);
    try { u.is_admin ? await adminDemote(u.id) : await adminPromote(u.id); onChanged(); }
    catch (e) { alert((e as Error).message); }
    finally { setBusy(false); }
  };

  const revoke = async () => {
    if (!confirm(`Revoke all sessions for ${u.short_name}?`)) return;
    setBusy(true);
    try { await adminRevoke(u.id); onChanged(); }
    catch (e) { alert((e as Error).message); }
    finally { setBusy(false); }
  };

  const resetPw = async () => {
    const pw = prompt(`Set a temporary password for ${u.short_name} (min 6 chars).`);
    if (!pw) return;
    setBusy(true);
    try { await adminResetPw(u.id, pw); alert('Done. Tell them the new password — they must change it on next login.'); onChanged(); }
    catch (e) { alert((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <tr className="border-t border-white/5">
      <td className="py-2">{u.short_name}</td>
      <td>{u.email}</td>
      <td className="text-xs text-ink-soft">{u.identities.map(i => i.provider).join(', ') || 'password'}</td>
      <td>
        <button disabled={busy} onClick={togglePromo}
          className={`rounded-full px-3 py-1 text-xs ${u.is_admin ? 'bg-blue-500/20 text-blue-300' : 'bg-zinc-700 text-ink-soft'}`}>
          {u.is_admin ? 'Admin' : 'Make admin'}
        </button>
      </td>
      <td className="space-x-2">
        <button
          disabled={busy || onlyGoogle}
          title={onlyGoogle ? "User signs in via Google; password reset doesn't apply." : ''}
          onClick={resetPw}
          className="rounded-md px-2 py-1 text-xs ring-1 ring-white/10 hover:bg-white/5 disabled:opacity-40"
        >Reset password</button>
        <button disabled={busy} onClick={revoke}
          className="rounded-md px-2 py-1 text-xs ring-1 ring-white/10 hover:bg-white/5">
          Revoke sessions
        </button>
      </td>
    </tr>
  );
}
```

- [ ] **Step 2: Build**

```bash
cd web && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add web/src/views/admin/UsersTab.tsx
git commit -m "feat(web): UsersTab with promote toggle, reset-password (gated for google-only), and revoke"
```

---

### Task 26: `ApprovalsTab.tsx`

**Files:**
- Modify: `web/src/views/admin/ApprovalsTab.tsx`

- [ ] **Step 1: Replace stub**

```tsx
import { useEffect, useState } from 'react';
import { adminListPending, adminApprove, adminReject } from '../../api';
import type { PendingUserRow } from '../../types';

export function ApprovalsTab() {
  const [rows, setRows] = useState<PendingUserRow[] | null>(null);
  const refresh = () => adminListPending().then(setRows).catch(() => setRows([]));
  useEffect(() => { refresh(); }, []);

  if (!rows) return <div className="text-ink-soft">Loading…</div>;
  if (rows.length === 0) return <div className="text-ink-soft">No pending sign-ins.</div>;

  return (
    <ul className="space-y-3">
      {rows.map(r => <Row key={r.id} r={r} onDone={refresh} />)}
    </ul>
  );
}

function Row({ r, onDone }: { r: PendingUserRow; onDone: () => void }) {
  const [busy, setBusy] = useState(false);

  const approve = async () => {
    const short = prompt(`Short display name for ${r.name} (1-16 chars):`, r.name.split(' ')[0]?.slice(0, 16) ?? '');
    if (!short) return;
    setBusy(true);
    try { await adminApprove(r.id, short); onDone(); }
    catch (e) { alert((e as Error).message); }
    finally { setBusy(false); }
  };

  const reject = async () => {
    if (!confirm(`Reject sign-in from ${r.email}?`)) return;
    setBusy(true);
    try { await adminReject(r.id); onDone(); }
    catch (e) { alert((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <li className="flex items-center gap-4 rounded-xl bg-ink-card/60 p-4">
      {r.picture_url
        ? <img src={r.picture_url} alt="" className="h-10 w-10 rounded-full" />
        : <div className="h-10 w-10 rounded-full bg-zinc-700" />}
      <div className="flex-1">
        <div className="text-white">{r.name}</div>
        <div className="text-xs text-ink-soft">
          {r.email} {!r.email_verified && <span className="ml-2 rounded bg-amber-500/20 px-1.5 text-amber-300">unverified</span>}
        </div>
      </div>
      <button disabled={busy} onClick={approve}
        className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500">
        Approve
      </button>
      <button disabled={busy} onClick={reject}
        className="rounded-md bg-red-600/20 px-3 py-1.5 text-sm text-red-300 hover:bg-red-600/30">
        Reject
      </button>
    </li>
  );
}
```

- [ ] **Step 2: Build**

```bash
cd web && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add web/src/views/admin/ApprovalsTab.tsx
git commit -m "feat(web): ApprovalsTab listing pending users with Approve/Reject actions"
```

---

### Task 27: `AuditTab.tsx`

**Files:**
- Modify: `web/src/views/admin/AuditTab.tsx`

- [ ] **Step 1: Replace stub**

```tsx
import { useEffect, useState } from 'react';
import { adminAudit } from '../../api';
import type { AuditEntryRow } from '../../types';

export function AuditTab() {
  const [items, setItems] = useState<AuditEntryRow[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [done, setDone] = useState(false);

  const load = async (before?: string) => {
    const page = await adminAudit({ limit: 50, before });
    setItems(prev => before ? [...prev, ...page.items] : page.items);
    setCursor(page.next_before);
    if (!page.next_before) setDone(true);
  };

  useEffect(() => { load(); }, []);

  if (items.length === 0) return <div className="text-ink-soft">No admin actions yet.</div>;

  return (
    <div>
      <ul className="space-y-1 text-sm">
        {items.map(it => (
          <li key={it.id} className="flex items-baseline gap-3 border-b border-white/5 py-1.5">
            <span className="w-44 text-ink-soft">{new Date(it.created_at).toLocaleString()}</span>
            <span className="font-medium text-white">{it.actor_name ?? '(deleted)'}</span>
            <span className="text-blue-300">{it.action}</span>
            <span className="text-ink-soft">{it.target_user_name ?? it.target_pending_id ?? ''}</span>
            <details className="ml-auto text-xs text-ink-soft">
              <summary className="cursor-pointer">metadata</summary>
              <pre className="mt-1 max-w-md whitespace-pre-wrap break-all rounded bg-black/30 p-2">{JSON.stringify(it.metadata, null, 2)}</pre>
            </details>
          </li>
        ))}
      </ul>
      {!done && (
        <button
          onClick={() => load(cursor)}
          className="mt-4 rounded-md px-3 py-1.5 text-sm ring-1 ring-white/10 hover:bg-white/5"
        >
          Load more
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build**

```bash
cd web && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add web/src/views/admin/AuditTab.tsx
git commit -m "feat(web): AuditTab paginated by cursor with collapsible metadata"
```

---

## Phase 9 — macOS auth + URL scheme + admin UI

### Task 28: Register `kanbanclaude://` URL scheme

**Files:**
- Modify: `macOS/KanbanClaude/project.yml`

- [ ] **Step 1: Add URL types**

Open `macOS/KanbanClaude/project.yml`. Find the `targets.KanbanClaude.info.plist` (or equivalent) section. Add (or merge into) `CFBundleURLTypes`:
```yaml
CFBundleURLTypes:
  - CFBundleURLName: com.kanbanclaude.auth
    CFBundleURLSchemes:
      - kanbanclaude
```

- [ ] **Step 2: Regenerate the xcodeproj**

```bash
cd macOS && xcodegen generate
```
Expected: completes without errors. The generated `Info.plist` should now declare the URL scheme.

- [ ] **Step 3: Commit**

```bash
git add macOS/KanbanClaude/project.yml macOS/KanbanClaude.xcodeproj
git commit -m "feat(macos): register kanbanclaude:// URL scheme via project.yml"
```

---

### Task 29: `URLSchemeHandler` + Keychain session storage

**Files:**
- Create: `macOS/KanbanClaude/App/URLSchemeHandler.swift`
- Modify: `macOS/KanbanClaude/App/KanbanClaudeApp.swift`

- [ ] **Step 1: Locate the existing Keychain helper (if any)**

```bash
grep -ri 'Keychain\|kSecAttr' macOS/KanbanClaude --include='*.swift' | head
```
If a helper exists, use it. If not, the snippet below stores via the existing session-token storage layer (locate via `grep -r 'sessionToken' macOS/KanbanClaude/Networking/`).

- [ ] **Step 2: Create the handler**

`macOS/KanbanClaude/App/URLSchemeHandler.swift`:
```swift
import Foundation

enum URLSchemeError: Error { case missingTicket, exchangeFailed }

struct URLSchemeHandler {
    static func handle(_ url: URL, api: AuthAPI) async throws {
        guard url.scheme == "kanbanclaude",
              url.host == "auth",
              let comps = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let ticket = comps.queryItems?.first(where: { $0.name == "ticket" })?.value,
              !ticket.isEmpty
        else { throw URLSchemeError.missingTicket }

        do {
            let token = try await api.exchangeTicket(ticket: ticket)
            try SessionStore.shared.set(token)
            NotificationCenter.default.post(name: .authStateChanged, object: nil)
        } catch {
            throw URLSchemeError.exchangeFailed
        }
    }
}

extension Notification.Name {
    static let authStateChanged = Notification.Name("KanbanAuthStateChanged")
}
```

If `AuthAPI`, `SessionStore`, or `exchangeTicket` don't exist under those exact names, locate the equivalents via:
```bash
grep -ri 'class AuthAPI\|struct AuthAPI\|sessionToken\|class SessionStore' macOS/KanbanClaude --include='*.swift'
```
Add an `exchangeTicket(ticket:)` method on the existing API client that POSTs `/api/auth/ticket/exchange` and returns the `token` field.

- [ ] **Step 3: Wire `.onOpenURL` in the app entry**

In `KanbanClaudeApp.swift`:
```swift
WindowGroup {
    ContentView()
        .onOpenURL { url in
            Task {
                do { try await URLSchemeHandler.handle(url, api: AuthAPI.shared) }
                catch { NSLog("auth url failed: \(error)") }
            }
        }
}
```

- [ ] **Step 4: Build the app**

```bash
cd macOS && xcodebuild -scheme KanbanClaude -configuration Debug -derivedDataPath DerivedData build | tail -20
```
Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 5: Commit**

```bash
git add macOS/KanbanClaude/App/URLSchemeHandler.swift macOS/KanbanClaude/App/KanbanClaudeApp.swift macOS/KanbanClaude/Networking/
git commit -m "feat(macos): handle kanbanclaude:// auth callback; exchange ticket and store session"
```

---

### Task 30: "Sign in with Google" on `AccountTab`

**Files:**
- Modify: `macOS/KanbanClaude/UI/Preferences/AccountTab.swift`
- Create: `macOS/KanbanClaude/Networking/AuthClient+Google.swift`

- [ ] **Step 1: Add the helper**

`macOS/KanbanClaude/Networking/AuthClient+Google.swift`:
```swift
import AppKit
import Foundation

extension AuthAPI {
    static func openGoogleSignIn(baseURL: URL) {
        let url = baseURL.appendingPathComponent("/api/auth/google/start")
            .appending(queryItem: URLQueryItem(name: "return", value: "macos"))
        NSWorkspace.shared.open(url)
    }
}

private extension URL {
    func appending(queryItem: URLQueryItem) -> URL {
        var c = URLComponents(url: self, resolvingAgainstBaseURL: true)!
        c.queryItems = (c.queryItems ?? []) + [queryItem]
        return c.url!
    }
}
```

- [ ] **Step 2: Add the button to `AccountTab`**

In `AccountTab.swift`, locate the existing email/password form. Above it add:
```swift
Button {
    AuthAPI.openGoogleSignIn(baseURL: api.baseURL)
} label: {
    Label("Sign in with Google", systemImage: "g.circle.fill")
}
.controlSize(.large)
.buttonStyle(.borderedProminent)
.padding(.bottom, 8)
```
If there's no obvious `api.baseURL`, locate the existing server-URL property via `grep -r 'baseURL\|serverURL' macOS/KanbanClaude/Networking`.

- [ ] **Step 3: Build**

```bash
cd macOS && xcodebuild -scheme KanbanClaude -configuration Debug -derivedDataPath DerivedData build | tail -10
```

- [ ] **Step 4: Commit**

```bash
git add macOS/KanbanClaude/UI/Preferences/AccountTab.swift macOS/KanbanClaude/Networking/AuthClient+Google.swift
git commit -m "feat(macos): Sign in with Google button on AccountTab opens system browser with return=macos"
```

---

### Task 31: macOS `User` type + admin window menu item

**Files:**
- Modify: `macOS/KanbanClaude/Models/User.swift`, `macOS/KanbanClaude/App/KanbanClaudeApp.swift`
- Create: `macOS/KanbanClaude/UI/Admin/AdminWindow.swift`

- [ ] **Step 1: Extend the `User` model**

Open `macOS/KanbanClaude/Models/User.swift`. Add fields:
```swift
public let isAdmin: Bool
public let mustChangePassword: Bool
```
Update any `CodingKeys` enum to include `is_admin` and `must_change_password`. Update any initializers.

- [ ] **Step 2: Create the admin window shell**

`macOS/KanbanClaude/UI/Admin/AdminWindow.swift`:
```swift
import SwiftUI

struct AdminWindow: View {
    @State private var tab: AdminTab = .users

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Picker("", selection: $tab) {
                Text("Users").tag(AdminTab.users)
                Text("Approvals").tag(AdminTab.approvals)
                Text("Audit").tag(AdminTab.audit)
            }
            .pickerStyle(.segmented)
            .padding(.horizontal)
            .padding(.vertical, 8)

            Divider()

            Group {
                switch tab {
                case .users:     AdminUsersView()
                case .approvals: AdminApprovalsView()
                case .audit:     AdminAuditView()
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .frame(minWidth: 720, minHeight: 480)
    }
}

enum AdminTab { case users, approvals, audit }
```

- [ ] **Step 3: Add the menu item**

In `KanbanClaudeApp.swift`, add a new `Window` scene + a `MenuBarExtra` / `.commands` entry:
```swift
Window("Admin", id: "admin") {
    AdminWindow()
}
.commands {
    CommandMenu("Admin") {
        Button("Admin Console…") {
            NSWorkspace.shared.open(URL(string: "x-callback://admin")!)  // or use openWindow env
        }
        .disabled(!(AuthState.shared.user?.isAdmin ?? false))
    }
}
```
(The exact menu-wiring pattern depends on what already exists in the app — adapt to the existing menu structure rather than inventing a parallel one.)

- [ ] **Step 4: Build**

```bash
cd macOS && xcodebuild -scheme KanbanClaude -configuration Debug -derivedDataPath DerivedData build | tail -10
```

- [ ] **Step 5: Commit**

```bash
git add macOS/KanbanClaude/Models/User.swift macOS/KanbanClaude/App/KanbanClaudeApp.swift macOS/KanbanClaude/UI/Admin/AdminWindow.swift
git commit -m "feat(macos): User.isAdmin + Admin menu item opening AdminWindow"
```

---

### Task 32: macOS `AdminUsersView`

**Files:**
- Create: `macOS/KanbanClaude/UI/Admin/AdminUsersView.swift`
- Modify: `AuthAPI` (Networking) to add admin endpoints

- [ ] **Step 1: Add `AdminAPI` extensions**

Append to the existing API client (or create `macOS/KanbanClaude/Networking/AdminAPI.swift`):
```swift
struct AdminUserDTO: Decodable, Identifiable {
    let id: String
    let name: String
    let short_name: String
    let email: String
    let is_admin: Bool
    let identities: [AdminIdentity]
    let last_login_at: String?
    let session_count: Int
    let created_at: String
}
struct AdminIdentity: Decodable { let provider: String; let email: String }

extension AuthAPI {
    func adminListUsers() async throws -> [AdminUserDTO] { try await get("/api/admin/users") }
    func adminPromote(_ id: String) async throws { try await post("/api/admin/users/\(id)/promote") }
    func adminDemote(_ id: String) async throws  { try await post("/api/admin/users/\(id)/demote") }
    func adminRevoke(_ id: String) async throws  { try await post("/api/admin/users/\(id)/revoke-sessions") }
    func adminResetPassword(_ id: String, newPassword: String) async throws {
        try await post("/api/admin/users/\(id)/reset-password", body: ["new_password": newPassword])
    }
}
```
Adapt `get`/`post` helper signatures to whatever the existing client uses.

- [ ] **Step 2: Implement the view**

`macOS/KanbanClaude/UI/Admin/AdminUsersView.swift`:
```swift
import SwiftUI

struct AdminUsersView: View {
    @State private var users: [AdminUserDTO] = []
    @State private var loading = true
    @State private var errorText: String?

    var body: some View {
        Group {
            if loading { ProgressView() }
            else if let e = errorText { Text(e).foregroundStyle(.red) }
            else if users.count <= 1 { Text("Only you. Family will appear here after they sign in.").foregroundStyle(.secondary).padding() }
            else { table }
        }
        .task { await load() }
    }

    private var table: some View {
        Table(users) {
            TableColumn("Name", value: \.short_name)
            TableColumn("Email", value: \.email)
            TableColumn("Identities") { Text($0.identities.map(\.provider).joined(separator: ", ")) }
            TableColumn("Admin") { u in
                Button(u.is_admin ? "Admin" : "Make admin") { Task { await toggle(u) } }
                    .controlSize(.small)
            }
            TableColumn("Actions") { u in
                HStack {
                    Button("Reset pw") { Task { await resetPw(u) } }
                        .disabled(u.identities.contains { $0.provider == "google" } && u.identities.count == 1)
                    Button("Revoke") { Task { await revoke(u) } }
                }
            }
        }
        .padding()
    }

    private func load() async {
        do { users = try await AuthAPI.shared.adminListUsers(); loading = false }
        catch { errorText = String(describing: error); loading = false }
    }
    private func toggle(_ u: AdminUserDTO) async {
        do { u.is_admin ? try await AuthAPI.shared.adminDemote(u.id) : try await AuthAPI.shared.adminPromote(u.id); await load() }
        catch { errorText = String(describing: error) }
    }
    private func revoke(_ u: AdminUserDTO) async {
        do { try await AuthAPI.shared.adminRevoke(u.id); await load() } catch { errorText = String(describing: error) }
    }
    private func resetPw(_ u: AdminUserDTO) async {
        let alert = NSAlert()
        alert.messageText = "Set a temporary password for \(u.short_name)"
        let input = NSSecureTextField(frame: NSRect(x: 0, y: 0, width: 240, height: 24))
        alert.accessoryView = input
        alert.addButton(withTitle: "Set"); alert.addButton(withTitle: "Cancel")
        if alert.runModal() == .alertFirstButtonReturn, input.stringValue.count >= 6 {
            do { try await AuthAPI.shared.adminResetPassword(u.id, newPassword: input.stringValue) }
            catch { errorText = String(describing: error) }
        }
    }
}
```

- [ ] **Step 3: Build**

```bash
cd macOS && xcodebuild -scheme KanbanClaude -configuration Debug -derivedDataPath DerivedData build | tail -10
```

- [ ] **Step 4: Commit**

```bash
git add macOS/KanbanClaude/Networking/ macOS/KanbanClaude/UI/Admin/AdminUsersView.swift
git commit -m "feat(macos): AdminUsersView with promote/demote/reset/revoke actions"
```

---

### Task 33: macOS `AdminApprovalsView` + `AdminAuditView`

**Files:**
- Create: `macOS/KanbanClaude/UI/Admin/AdminApprovalsView.swift`, `AdminAuditView.swift`
- Modify: `AuthAPI` (admin endpoints for pending + audit)

- [ ] **Step 1: API additions**

```swift
struct PendingUserDTO: Decodable, Identifiable {
    let id: String; let email: String; let email_verified: Bool
    let name: String; let picture_url: String?; let created_at: String
}
struct AuditEntryDTO: Decodable, Identifiable {
    let id: String; let action: String
    let metadata: [String: AnyCodable]
    let created_at: String
    let actor_name: String?
    let target_user_name: String?
    let target_pending_id: String?
}

extension AuthAPI {
    func adminListPending() async throws -> [PendingUserDTO] { try await get("/api/admin/pending") }
    func adminApprove(_ id: String, shortName: String) async throws {
        try await post("/api/admin/pending/\(id)/approve", body: ["short_name": shortName])
    }
    func adminReject(_ id: String) async throws { try await post("/api/admin/pending/\(id)/reject") }
    func adminAudit(before: String? = nil, limit: Int = 50) async throws -> AuditPage {
        var path = "/api/admin/audit?limit=\(limit)"
        if let b = before { path += "&before=\(b)" }
        return try await get(path)
    }
}

struct AuditPage: Decodable { let items: [AuditEntryDTO]; let next_before: String? }
```
Use the existing `AnyCodable` if present; otherwise add a minimal one:
```swift
struct AnyCodable: Decodable { let value: Any
    init(from d: Decoder) throws {
        let c = try d.singleValueContainer()
        if let v = try? c.decode(String.self) { value = v }
        else if let v = try? c.decode(Int.self) { value = v }
        else if let v = try? c.decode(Bool.self) { value = v }
        else if let v = try? c.decode([String: AnyCodable].self) { value = v }
        else if let v = try? c.decode([AnyCodable].self) { value = v }
        else { value = "" }
    }
}
```

- [ ] **Step 2: `AdminApprovalsView.swift`**

```swift
import SwiftUI

struct AdminApprovalsView: View {
    @State private var rows: [PendingUserDTO] = []
    var body: some View {
        List {
            if rows.isEmpty { Text("No pending sign-ins.").foregroundStyle(.secondary) }
            ForEach(rows) { r in
                HStack {
                    AsyncImage(url: r.picture_url.flatMap(URL.init)) { img in img.resizable() } placeholder: { Color.gray }
                        .frame(width: 32, height: 32).clipShape(Circle())
                    VStack(alignment: .leading) {
                        Text(r.name)
                        Text(r.email).font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button("Approve") { Task { await approve(r) } }
                    Button("Reject")  { Task { await reject(r) } }.tint(.red)
                }
            }
        }
        .task { await reload() }
    }
    private func reload() async { rows = (try? await AuthAPI.shared.adminListPending()) ?? [] }
    private func approve(_ r: PendingUserDTO) async {
        let alert = NSAlert(); alert.messageText = "Short name for \(r.name) (1-16 chars):"
        let input = NSTextField(string: String(r.name.prefix(16))); input.frame = NSRect(x: 0, y: 0, width: 240, height: 24)
        alert.accessoryView = input
        alert.addButton(withTitle: "Approve"); alert.addButton(withTitle: "Cancel")
        if alert.runModal() == .alertFirstButtonReturn, !input.stringValue.isEmpty {
            try? await AuthAPI.shared.adminApprove(r.id, shortName: input.stringValue)
            await reload()
        }
    }
    private func reject(_ r: PendingUserDTO) async {
        try? await AuthAPI.shared.adminReject(r.id)
        await reload()
    }
}
```

- [ ] **Step 3: `AdminAuditView.swift`**

```swift
import SwiftUI

struct AdminAuditView: View {
    @State private var items: [AuditEntryDTO] = []
    @State private var cursor: String? = nil
    @State private var done = false

    var body: some View {
        List {
            if items.isEmpty { Text("No admin actions yet.").foregroundStyle(.secondary) }
            ForEach(items) { it in
                VStack(alignment: .leading) {
                    Text("\(it.actor_name ?? "(deleted)") · \(it.action) · \(it.target_user_name ?? it.target_pending_id ?? "")")
                    Text(it.created_at).font(.caption).foregroundStyle(.secondary)
                }
            }
            if !done {
                Button("Load more") { Task { await load(cursor) } }
            }
        }
        .task { await load(nil) }
    }

    private func load(_ before: String?) async {
        guard let page = try? await AuthAPI.shared.adminAudit(before: before, limit: 50) else { return }
        items = before == nil ? page.items : items + page.items
        cursor = page.next_before
        if page.next_before == nil { done = true }
    }
}
```

- [ ] **Step 4: Build**

```bash
cd macOS && xcodebuild -scheme KanbanClaude -configuration Debug -derivedDataPath DerivedData build | tail -10
```

- [ ] **Step 5: Commit**

```bash
git add macOS/KanbanClaude/UI/Admin/AdminApprovalsView.swift macOS/KanbanClaude/UI/Admin/AdminAuditView.swift macOS/KanbanClaude/Networking/
git commit -m "feat(macos): AdminApprovalsView + AdminAuditView with pagination"
```

---

## Phase 10 — End-to-end QA

### Task 34: Run the full server test suite

**Files:** none

- [ ] **Step 1: Full test run**

```bash
cd server && npm test
```
Expected: all suites green. If a test fails, fix the underlying issue and recommit before moving on. Do not skip.

- [ ] **Step 2: Build the web bundle**

```bash
cd web && npm run build
```
Expected: clean build, no TS errors.

- [ ] **Step 3: Build the macOS app**

```bash
cd macOS && xcodebuild -scheme KanbanClaude -configuration Debug -derivedDataPath DerivedData build | tail -20
```
Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 4: No commit needed — green ticks across the matrix is the signal to proceed.**

---

### Task 35: Manual QA against the spec checklist

**Files:** none (record results in a temporary scratchpad you discard after the session)

Walk the 12-item manual QA checklist from `docs/superpowers/specs/2026-05-22-admin-role-google-oauth-design.md` Section 11. For each:

- [ ] **Step 1:** Fresh DB. Register first user via password → `is_admin=true` (existing first-user logic gives admin status implicitly via the bootstrap rule once `ADMIN_EMAILS` is also set; without ADMIN_EMAILS, the first user is NOT auto-admin in this design — confirm and update behaviour if you disagree)
- [ ] **Step 2:** Set `ADMIN_EMAILS=second@x.com`, login → `is_admin` flips, audit row exists
- [ ] **Step 3:** Promote a third user via UI → audit row, third user sees `/admin` link after refresh
- [ ] **Step 4:** Demote the first user with ≥2 admins → succeeds. Demote when sole admin → 409
- [ ] **Step 5:** Reset another user's password → logged out, forced into `/change-password` next login
- [ ] **Step 6:** Google sign-in for existing matching `email_verified=true` user → linked, in
- [ ] **Step 7:** Google sign-in for new email → `/awaiting-approval`. Admin approves → user lands in app
- [ ] **Step 8:** Admin rejects → user sees denial message
- [ ] **Step 9:** macOS: click "Sign in with Google" → browser opens → consent → app comes to foreground, signed in
- [ ] **Step 10:** Audit tab paginates, shows actor/target/timestamp correctly
- [ ] **Step 11:** Remove a user from `ADMIN_EMAILS` → user retains `is_admin`
- [ ] **Step 12:** Disable `GOOGLE_CLIENT_*` env vars → Google button hidden, `/api/auth/google/start` → 503

- [ ] **Step 13: Final commit on green QA**

If all 12 items pass without code changes, no commit needed. If you uncover a defect, fix it under a focused commit (`fix: ...`) before considering the milestone shipped.

---

## Self-Review

**Spec coverage check** — every spec section maps to at least one task:

| Spec section | Task(s) |
|--------------|---------|
| §3 Architecture | Tasks 1, 13 (bootstrap), 15 (approve), 16 (WS), 17 (reaper) |
| §4 Database schema | Task 1 |
| §5 Backend endpoints — auth additions (google start/callback, pending poll, ticket exchange, change-pw, config) | Tasks 13, 14, 18 |
| §5 Backend endpoints — admin (users, audit, env-admins, promote/demote, reset, revoke, pending, approve, reject) | Tasks 5, 6, 7, 8, 9, 15 |
| §5 New auth helpers (`requireAdmin`, `reconcileEnvAdmin`) | Task 2 |
| §6 Web UI (AdminView, Users/Approvals/Audit tabs, Awaiting, ChangePassword, GoogleSignInButton, data caveats, empty states) | Tasks 20–27 |
| §6 macOS UI (URLSchemeHandler, AccountTab Google button, Admin window + 3 views, User model widen) | Tasks 28–33 |
| §7 Auth flows A–D (incl. macOS new-user recovery, 410 expired-ticket recovery) | Tasks 13, 22, 29 |
| §8 Config env vars | Task 10 |
| §9 Errors (machine codes returned) | Tasks 5–8, 13, 14, 15 |
| §10 Security (state cookie, id_token verify, ticket, URL hijack note, rate limit, last-admin guard, password reset, audit immutability, ADMIN_EMAILS, argon2 placeholder, pending_id URL) | Tasks 2, 6, 11, 12, 13, 19 |
| §11 Tests (unit + integration + macOS smoke + manual QA) | Tasks 2, 3, 4, 5–8, 11, 12, 13, 15, 34, 35 |
| §12 Rollout | Tasks 1, 10, 35 |

No gaps.

**Placeholder scan:** the only "(coming up)" strings are in Task 24 step 7 — they're intentional stubs that get replaced in Tasks 25–27. No TBD / TODO / "implement later" elsewhere.

**Type consistency:** `AdminAction` enum (Task 4) is the canonical action vocabulary and matches every audit write in Tasks 6, 7, 13, 15. `AdminUserDTO`/`AdminUserRow` field names match the SQL columns in Task 5. `PendingUserRow.email_verified` is consistent with the `pending_users.email_verified` column.

**Note on `node:test` reuse across files:** several tests register Fastify routes at module top-level and call `pool.end()` in `after()`. If multiple test files run in the same process and one calls `pool.end()`, later files break. The existing test suite in this repo avoids this by relying on the default `npm test` which executes files sequentially via `tsx --test`. Each test file owns its lifecycle; do not share Fastify instances across files.

---

Plan complete and saved to `docs/superpowers/plans/2026-05-22-admin-role-google-oauth.md`. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
