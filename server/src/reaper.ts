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
