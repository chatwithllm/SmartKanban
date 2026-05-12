import { pool } from './db.js';

export type Notification = {
  id: number;
  user_id: string;
  card_id: string;
  event_id: number;
  actor_name: string;
  preview: string;
  read: boolean;
  created_at: string;
};

export async function fanOutNotification(
  cardId: string,
  eventId: number,
  actorUserId: string | null,
  actorName: string,
  preview: string,
): Promise<string[]> {
  // Assignees
  const { rows: assigneeRows } = await pool.query<{ user_id: string }>(
    `SELECT user_id::text FROM card_assignees WHERE card_id = $1`,
    [cardId],
  );

  // Thread participants (posted a message previously)
  const { rows: participantRows } = await pool.query<{ actor_id: string }>(
    `SELECT DISTINCT actor_id::text FROM card_events
     WHERE card_id = $1 AND entry_type = 'message' AND actor_id IS NOT NULL`,
    [cardId],
  );

  const seen = new Set<string>();
  const recipients: string[] = [];

  for (const r of assigneeRows) {
    if (r.user_id !== actorUserId && !seen.has(r.user_id)) {
      seen.add(r.user_id);
      recipients.push(r.user_id);
    }
  }
  for (const r of participantRows) {
    if (r.actor_id !== actorUserId && !seen.has(r.actor_id)) {
      seen.add(r.actor_id);
      recipients.push(r.actor_id);
    }
  }

  if (recipients.length === 0) return [];

  const preview120 = preview.slice(0, 120);

  await pool.query(
    `INSERT INTO notifications (user_id, card_id, event_id, actor_name, preview)
     SELECT unnest($1::uuid[]), $2, $3, $4, $5`,
    [recipients, cardId, eventId, actorName, preview120],
  );

  return recipients;
}

export async function getNotifications(userId: string): Promise<Notification[]> {
  const { rows } = await pool.query<Notification>(
    `SELECT id, user_id, card_id, event_id, actor_name, preview, read, created_at
     FROM notifications
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 100`,
    [userId],
  );
  return rows;
}

export async function markNotificationsRead(userId: string, ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  await pool.query(
    `UPDATE notifications SET read = true WHERE user_id = $1 AND id = ANY($2::int[])`,
    [userId, ids],
  );
}

export async function markAllRead(userId: string): Promise<void> {
  await pool.query(
    `UPDATE notifications SET read = true WHERE user_id = $1 AND read = false`,
    [userId],
  );
}
