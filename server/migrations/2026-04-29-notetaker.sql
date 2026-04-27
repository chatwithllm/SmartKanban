-- notetaker-kanban Phase 1
-- Adds project column for cross-project grouping and scope on tokens
-- to distinguish mirror (read-only) from api (write) capability.
-- Idempotent — safe to re-run.

ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS project TEXT;

CREATE INDEX IF NOT EXISTS cards_project_idx
  ON cards(project)
  WHERE archived = false;

ALTER TABLE mirror_tokens
  ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'mirror';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mirror_tokens_scope_chk'
  ) THEN
    ALTER TABLE mirror_tokens
      ADD CONSTRAINT mirror_tokens_scope_chk CHECK (scope IN ('mirror', 'api'));
  END IF;
END $$;
