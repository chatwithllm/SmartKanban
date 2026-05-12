-- Notifications and Web Push subscriptions.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS notifications (
  id          serial primary key,
  user_id     uuid not null references users(id) on delete cascade,
  card_id     uuid not null references cards(id) on delete cascade,
  event_id    bigint not null references card_events(id) on delete cascade,
  actor_name  text not null,
  preview     text not null,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS notifications_user_unread
  ON notifications(user_id) WHERE read = false;

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          serial primary key,
  user_id     uuid not null references users(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);
