import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import {
  SESSION_COOKIE,
  clearSessionCookie,
  createSession,
  deleteSession,
  hashPassword,
  requireUser,
  setSessionCookie,
  userFromSession,
  verifyPassword,
} from '../auth.js';

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
      // If any users exist AND OPEN_SIGNUP is off, only the first user can be created without invite.
      const { rows: existing } = await pool.query<{ c: string }>(`SELECT COUNT(*)::text c FROM users`);
      const userCount = Number(existing[0]!.c);
      if (userCount > 0 && !OPEN_SIGNUP) {
        return reply.code(403).send({ error: 'signup disabled' });
      }

      const hash = await hashPassword(password);
      try {
        const { rows } = await pool.query<{ id: string }>(
          `INSERT INTO users (name, short_name, email, auth_hash) VALUES ($1, $2, $3, $4) RETURNING id`,
          [name.trim(), shortTrim, email.trim().toLowerCase(), hash],
        );
        const userId = rows[0]!.id;

        // First registered user inherits any pre-existing (Phase 1) cards with no created_by.
        if (userCount === 0) {
          await pool.query(`UPDATE cards SET created_by = $1 WHERE created_by IS NULL`, [userId]);
          await pool.query(
            `INSERT INTO card_assignees (card_id, user_id) SELECT id, $1 FROM cards WHERE NOT archived ON CONFLICT DO NOTHING`,
            [userId],
          );
        }

        const token = await createSession(userId);
        setSessionCookie(reply, token);
        return reply.code(201).send({ id: userId, name, short_name: shortTrim, email });
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === '23505') return reply.code(409).send({ error: 'email already registered' });
        throw e;
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
    const token = await createSession(user.id);
    setSessionCookie(reply, token);
    return { id: user.id, name: user.name, short_name: user.short_name, email: user.email };
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
}
