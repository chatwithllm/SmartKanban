import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import {
  SESSION_COOKIE,
  clearSessionCookie,
  createSession,
  deleteSession,
  hashPassword,
  reconcileEnvAdmin,
  requireUser,
  setSessionCookie,
  userFromSession,
  verifyPassword,
} from '../auth.js';
import { consumeTicket } from '../auth_tickets.js';
import { googleEnabled } from '../google.js';
import { writeAudit } from '../admin_audit.js';

const OPEN_SIGNUP = process.env.OPEN_SIGNUP !== 'false'; // default true (household trust)

export async function authRoutes(app: FastifyInstance) {
  app.post<{ Body: { name: string; short_name: string; email: string; password: string } }>(
    '/api/auth/register',
    async (req, reply) => {
      const { name, short_name, email, password } = req.body ?? {};
      if (!name || !short_name || !email || !password || password.length < 6) {
        return reply
          .code(400)
          .send({ error: 'name, short_name, email, password (>=6) required' });
      }
      const shortTrim = short_name.trim();
      if (shortTrim.length < 1 || shortTrim.length > 16) {
        return reply.code(400).send({ error: 'short_name must be 1-16 characters' });
      }

      // Wrap in a transaction with an advisory lock so two simultaneous first
      // registrations cannot both see userCount=0 and both become admin (Rule 3).
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`SELECT pg_advisory_xact_lock(hashtext('first_user_bootstrap'))`);

        // Re-check OPEN_SIGNUP gate inside the lock (count is now stable).
        const { rows: existing } = await client.query<{ c: string }>(`SELECT COUNT(*)::text c FROM users`);
        const userCount = Number(existing[0]!.c);
        if (userCount > 0 && !OPEN_SIGNUP) {
          await client.query('ROLLBACK');
          return reply.code(403).send({ error: 'signup disabled' });
        }

        const hash = await hashPassword(password);
        const { rows } = await client.query<{ id: string }>(
          `INSERT INTO users (name, short_name, email, auth_hash, is_admin) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [name.trim(), shortTrim, email.trim().toLowerCase(), hash, userCount === 0],
        );
        const userId = rows[0]!.id;

        // First registered user inherits any pre-existing (Phase 1) cards with no
        // created_by and receives an env_promote audit row (spec §3 + §11 step 1).
        if (userCount === 0) {
          await client.query(`UPDATE cards SET created_by = $1 WHERE created_by IS NULL`, [userId]);
          await client.query(
            `INSERT INTO card_assignees (card_id, user_id) SELECT id, $1 FROM cards WHERE NOT archived ON CONFLICT DO NOTHING`,
            [userId],
          );
          await writeAudit(client, {
            actor_id: userId,
            action: 'env_promote',
            target_user_id: userId,
            metadata: { source: 'first_user_bootstrap' },
          });
        }

        await client.query('COMMIT');
        // createSession writes to a separate sessions table — safe outside the txn.
        const token = await createSession(userId);
        setSessionCookie(reply, token);
        return reply.code(201).send({ id: userId, name, short_name: shortTrim, email });
      } catch (e: unknown) {
        try { await client.query('ROLLBACK'); } catch { /* already rolled back */ }
        const err = e as { code?: string };
        if (err.code === '23505') return reply.code(409).send({ error: 'email already registered' });
        throw e;
      } finally {
        client.release();
      }
    },
  );

  app.post<{ Body: { email: string; password: string } }>('/api/auth/login', async (req, reply) => {
    const { email, password } = req.body ?? {};
    if (!email || !password) return reply.code(400).send({ error: 'email and password required' });
    const { rows } = await pool.query<{
      id: string;
      name: string;
      short_name: string | null;
      email: string;
      auth_hash: string;
    }>(
      `SELECT id, name, COALESCE(short_name, name) AS short_name, email, auth_hash FROM users WHERE email = $1`,
      [email.trim().toLowerCase()],
    );
    const user = rows[0];
    if (!user || !(await verifyPassword(user.auth_hash, password))) {
      return reply.code(401).send({ error: 'invalid credentials' });
    }
    await reconcileEnvAdmin(user.id, user.email);
    const token = await createSession(user.id);
    setSessionCookie(reply, token);
    const fresh = await userFromSession(token);
    return fresh!;
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const tok = req.cookies?.[SESSION_COOKIE];
    if (tok) await deleteSession(tok);
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.get('/api/auth/me', async (req, reply) => {
    const user = await userFromSession(req.cookies?.[SESSION_COOKIE]);
    if (!user) return reply.code(401).send({ error: 'unauthorized' });
    return user;
  });

  app.get('/api/users', { preHandler: requireUser }, async () => {
    const { rows } = await pool.query<{
      id: string;
      name: string;
      short_name: string;
      email: string;
    }>(
      `SELECT id, name, COALESCE(short_name, name) AS short_name, email FROM users ORDER BY name`,
    );
    return rows;
  });

  app.patch<{ Body: { short_name?: string; name?: string } }>(
    '/api/auth/me',
    { preHandler: requireUser },
    async (req, reply) => {
      const { short_name, name } = req.body ?? {};
      const sets: string[] = [];
      const vals: unknown[] = [];
      const push = (col: string, val: unknown) => {
        vals.push(val);
        sets.push(`${col} = $${vals.length}`);
      };
      if (short_name !== undefined) {
        const s = short_name.trim();
        if (s.length < 1 || s.length > 16) {
          return reply.code(400).send({ error: 'short_name must be 1-16 characters' });
        }
        push('short_name', s);
      }
      if (name !== undefined) {
        const s = name.trim();
        if (!s) return reply.code(400).send({ error: 'name required' });
        push('name', s);
      }
      if (sets.length === 0) return reply.code(400).send({ error: 'nothing to update' });
      vals.push(req.user!.id);
      const { rows } = await pool.query<{
        id: string;
        name: string;
        short_name: string;
        email: string;
      }>(
        `UPDATE users SET ${sets.join(', ')} WHERE id = $${vals.length}
         RETURNING id, name, COALESCE(short_name, name) AS short_name, email`,
        vals,
      );
      return rows[0];
    },
  );

  // --- Pending-approval poll ---------------------------------------------------

  app.get<{ Params: { id: string } }>('/api/auth/pending/:id', async (req, reply) => {
    const { rows } = await pool.query<{ outcome: string; outcome_ticket: string | null }>(
      `SELECT outcome, outcome_ticket FROM pending_users WHERE id = $1`, [req.params.id],
    );
    if (rows.length === 0) return reply.code(404).send({ error: 'not_found' });
    const { outcome, outcome_ticket } = rows[0]!;
    if (outcome === 'approved') return { status: 'approved', ticket: outcome_ticket };
    if (outcome === 'rejected') return { status: 'rejected' };
    return { status: 'pending' };
  });

  // --- One-time ticket exchange ------------------------------------------------

  app.post<{ Body: { ticket: string } }>('/api/auth/ticket/exchange', async (req, reply) => {
    const { ticket } = req.body ?? ({} as { ticket: string });
    if (!ticket) return reply.code(400).send({ error: 'ticket_required' });
    try {
      const sessionToken = await consumeTicket(ticket);
      setSessionCookie(reply, sessionToken);
      return { token: sessionToken };
    } catch (e) {
      if ((e as Error).message === 'ticket_invalid') {
        return reply.code(410).send({ error: 'ticket_invalid' });
      }
      throw e;
    }
  });

  // --- Change password ---------------------------------------------------------

  app.post<{ Body: { current_password: string; new_password: string } }>(
    '/api/auth/change-password',
    { preHandler: requireUser },
    async (req, reply) => {
      const { current_password, new_password } = req.body ?? ({} as { current_password: string; new_password: string });
      if (!new_password || new_password.length < 6) {
        return reply.code(400).send({ error: 'password_too_short' });
      }
      const { rows } = await pool.query<{ auth_hash: string }>(
        `SELECT auth_hash FROM users WHERE id = $1`, [req.user!.id],
      );
      if (rows.length === 0) return reply.code(404).send({ error: 'not_found' });
      if (!(await verifyPassword(rows[0]!.auth_hash, current_password))) {
        return reply.code(401).send({ error: 'invalid_credentials' });
      }
      const hash = await hashPassword(new_password);
      await pool.query(
        `UPDATE users SET auth_hash = $1, must_change_password = FALSE WHERE id = $2`,
        [hash, req.user!.id],
      );
      return { ok: true };
    },
  );

  // --- Auth config flags -------------------------------------------------------

  app.get('/api/auth/config', async () => {
    return {
      google_enabled: googleEnabled(),
      open_signup: process.env.OPEN_SIGNUP !== 'false',
    };
  });
}
