-- Allow 'share' as a valid entry_type in card_events.
-- Idempotent: safe to re-run.

ALTER TABLE card_events
  DROP CONSTRAINT IF EXISTS card_events_entry_type_check;

ALTER TABLE card_events
  ADD CONSTRAINT card_events_entry_type_check
  CHECK (entry_type IN ('system', 'message', 'ai', 'share'));
