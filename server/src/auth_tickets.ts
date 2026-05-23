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
