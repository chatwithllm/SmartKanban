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
