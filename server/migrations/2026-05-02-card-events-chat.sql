-- Rename activity_log → card_events and add chat columns.
-- Idempotent: safe to re-run if partially applied.

ALTER TABLE IF EXISTS activity_log RENAME TO card_events;

ALTER TABLE card_events
  ADD COLUMN IF NOT EXISTS entry_type TEXT NOT NULL DEFAULT 'system'
    CHECK (entry_type IN ('system', 'message', 'ai')),
  ADD COLUMN IF NOT EXISTS content TEXT,
  ADD COLUMN IF NOT EXISTS ai_suggestions JSONB;

ALTER TABLE card_events ALTER COLUMN action DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_card_events_card
  ON card_events(card_id, created_at ASC);

CREATE TABLE IF NOT EXISTS card_event_reads (
  card_id      UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_id BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (card_id, user_id)
);
