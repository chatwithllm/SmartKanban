-- Additive, idempotent schema covering all phases.
-- Run repeatedly on a fresh DB; safe to re-run on an existing one.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- enums ----------
DO $$ BEGIN CREATE TYPE card_status AS ENUM ('backlog', 'today', 'in_progress', 'done');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE card_source AS ENUM ('manual', 'telegram', 'mirror');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE attachment_kind AS ENUM ('audio', 'image', 'file');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- users + auth ----------
CREATE TABLE IF NOT EXISTS users (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  email      TEXT UNIQUE NOT NULL,
  auth_hash  TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Short display handle shown on cards (e.g. "Jay", "JC"). Kept nullable so
-- upgrades from earlier schemas don't break; API requires it on register.
ALTER TABLE users ADD COLUMN IF NOT EXISTS short_name TEXT;
-- Backfill for users created before this column existed.
UPDATE users SET short_name = SPLIT_PART(name, ' ', 1) WHERE short_name IS NULL OR short_name = '';

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- Long-lived mirror tokens (not real sessions; no user).
CREATE TABLE IF NOT EXISTS mirror_tokens (
  token      TEXT PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label      TEXT NOT NULL DEFAULT 'mirror',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- cards ----------
CREATE TABLE IF NOT EXISTS cards (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status      card_status NOT NULL DEFAULT 'backlog',
  tags        TEXT[] NOT NULL DEFAULT '{}',
  due_date    DATE,
  source      card_source NOT NULL DEFAULT 'manual',
  position    DOUBLE PRECISION NOT NULL DEFAULT 0,
  archived    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Phase 2 adds created_by; nullable so Phase 1 rows remain valid.
ALTER TABLE cards ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
-- Phase 3.5 adds a flag for cards that were AI-summarized.
ALTER TABLE cards ADD COLUMN IF NOT EXISTS ai_summarized BOOLEAN NOT NULL DEFAULT FALSE;
-- Phase 2.5 adds a flag for cards that need manual review (transcription failed, etc).
ALTER TABLE cards ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT FALSE;
-- Phase 5+ tracks which Telegram message created each card, for reply-based commands.
ALTER TABLE cards ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS telegram_message_id BIGINT;
CREATE INDEX IF NOT EXISTS idx_cards_tg_msg ON cards(telegram_chat_id, telegram_message_id);

CREATE INDEX IF NOT EXISTS idx_cards_status_position
  ON cards (status, position) WHERE NOT archived;

-- ---------- sharing ----------
CREATE TABLE IF NOT EXISTS card_assignees (
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (card_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_card_assignees_user ON card_assignees(user_id);

CREATE TABLE IF NOT EXISTS card_shares (
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (card_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_card_shares_user ON card_shares(user_id);

-- ---------- telegram ----------
CREATE TABLE IF NOT EXISTS telegram_identities (
  telegram_user_id    BIGINT PRIMARY KEY,
  app_user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  telegram_username   TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- attachments ----------
CREATE TABLE IF NOT EXISTS card_attachments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id           UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  kind              attachment_kind NOT NULL,
  storage_path      TEXT NOT NULL,
  original_filename TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_attachments_card ON card_attachments(card_id);

-- ---------- activity ----------
CREATE TABLE IF NOT EXISTS activity_log (
  id         BIGSERIAL PRIMARY KEY,
  actor_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  card_id    UUID REFERENCES cards(id) ON DELETE CASCADE,
  action     TEXT NOT NULL,
  details    JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at DESC);

-- ---------- card templates ----------
CREATE TABLE IF NOT EXISTS card_templates (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  visibility       TEXT NOT NULL CHECK (visibility IN ('private','shared')),
  title            TEXT NOT NULL,
  description      TEXT NOT NULL DEFAULT '',
  tags             TEXT[] NOT NULL DEFAULT '{}',
  status           card_status NOT NULL DEFAULT 'today',
  due_offset_days  INTEGER,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS card_templates_owner_name_key
  ON card_templates (owner_id, lower(name));

CREATE INDEX IF NOT EXISTS card_templates_visibility_idx
  ON card_templates (visibility);

-- ---------- knowledge ----------
CREATE TABLE IF NOT EXISTS knowledge_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  title_auto    BOOLEAN NOT NULL DEFAULT FALSE,
  url           TEXT,
  body          TEXT NOT NULL DEFAULT '',
  tags          TEXT[] NOT NULL DEFAULT '{}',
  visibility    TEXT NOT NULL CHECK (visibility IN ('private','inbox','shared')),
  source        TEXT NOT NULL DEFAULT 'manual'
                CHECK (source IN ('manual','telegram','share_target','from_card')),
  fetch_status  TEXT CHECK (fetch_status IN ('pending','ok','failed','skipped')),
  fetch_error   TEXT,
  fetched_at    TIMESTAMPTZ,
  archived      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE knowledge_items ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english',
      coalesce(title,'') || ' ' || coalesce(body,'') || ' ' || coalesce(url,'')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_knowledge_fts   ON knowledge_items USING GIN(fts);
CREATE INDEX IF NOT EXISTS idx_knowledge_owner ON knowledge_items(owner_id) WHERE NOT archived;
CREATE INDEX IF NOT EXISTS idx_knowledge_tags  ON knowledge_items USING GIN(tags);

CREATE TABLE IF NOT EXISTS knowledge_shares (
  knowledge_id UUID NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (knowledge_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_knowledge_shares_user ON knowledge_shares(user_id);

CREATE TABLE IF NOT EXISTS knowledge_card_links (
  knowledge_id UUID NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
  card_id      UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (knowledge_id, card_id)
);
CREATE INDEX IF NOT EXISTS idx_klc_card ON knowledge_card_links(card_id);
