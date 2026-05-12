import webpush from 'web-push';
import { pool } from './db.js';

let vapidReady = false;

function initVapid() {
  if (vapidReady) return;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const sub = process.env.VAPID_SUBJECT;
  if (!pub || !priv || !sub) return;
  webpush.setVapidDetails(sub, pub, priv);
  vapidReady = true;
}

export type PushPayload = {
  title: string;
  body: string;
  cardId: string;
};

type StoredSub = {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export async function saveSubscription(
  userId: string,
  endpoint: string,
  p256dh: string,
  auth: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
    [userId, endpoint, p256dh, auth],
  );
}

export async function deleteSubscription(endpoint: string): Promise<void> {
  await pool.query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [endpoint]);
}

async function sendPush(sub: StoredSub, payload: PushPayload): Promise<void> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
    );
  } catch (err: unknown) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 410) {
      await pool.query(`DELETE FROM push_subscriptions WHERE id = $1`, [sub.id]);
    } else {
      console.warn('[push] delivery failed:', String(err).slice(0, 200));
    }
  }
}

export async function pushToUser(userId: string, payload: PushPayload): Promise<void> {
  initVapid();
  if (!vapidReady) return;

  const { rows } = await pool.query<StoredSub>(
    `SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1`,
    [userId],
  );
  await Promise.all(rows.map(sub => sendPush(sub, payload)));
}

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}
