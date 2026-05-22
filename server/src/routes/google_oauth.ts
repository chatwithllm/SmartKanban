import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { pool } from '../db.js';
import { setSessionCookie, createSession, reconcileEnvAdmin } from '../auth.js';
import { writeAudit } from '../admin_audit.js';
import { issueTicket } from '../auth_tickets.js';
import { googleEnabled, buildAuthUrl, exchangeCode, verifyIdToken } from '../google.js';

const STATE_COOKIE = 'g_oauth_state';
const STATE_TTL_MS = 10 * 60 * 1000;

function disabled(reply: import('fastify').FastifyReply) {
  return reply.code(503).send({ error: 'google_oauth_disabled' });
}

export async function googleOauthRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { return?: 'web' | 'macos' } }>(
    '/api/auth/google/start',
    async (req, reply) => {
      if (!googleEnabled()) return disabled(reply);
      const ret = req.query.return === 'macos' ? 'macos' : 'web';
      const state = `${ret}.${crypto.randomBytes(16).toString('base64url')}`;
      reply.setCookie(STATE_COOKIE, state, {
        path: '/api/auth/google',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: STATE_TTL_MS / 1000,
      });
      return reply.redirect(buildAuthUrl(state));
    },
  );

  app.get<{ Querystring: { code?: string; state?: string } }>(
    '/api/auth/google/callback',
    async (req, reply) => {
      if (!googleEnabled()) return disabled(reply);
      const { code, state } = req.query;
      const cookieState = req.cookies?.[STATE_COOKIE];
      reply.clearCookie(STATE_COOKIE, { path: '/api/auth/google' });
      if (!code || !state || !cookieState || cookieState !== state) {
        return reply.code(400).send({ error: 'csrf_invalid' });
      }
      const ret = state.startsWith('macos.') ? 'macos' : 'web';
      const { id_token } = await exchangeCode(code);
      const payload = await verifyIdToken(id_token);
      await handleCallback(req, reply, ret, payload);
    },
  );
}

async function handleCallback(
  req: import('fastify').FastifyRequest,
  reply: import('fastify').FastifyReply,
  ret: 'web' | 'macos',
  payload: { sub: string; email: string; email_verified: boolean; name?: string; picture?: string },
) {
  // (1) Existing identity → log in.
  const identity = await pool.query<{ user_id: string; email: string }>(
    `SELECT user_id, email FROM user_identities WHERE provider = 'google' AND provider_sub = $1`,
    [payload.sub],
  );
  if (identity.rowCount! > 0) {
    const userId = identity.rows[0]!.user_id;
    const email = identity.rows[0]!.email;
    await reconcileEnvAdmin(userId, email);
    return finishLogin(reply, ret, userId);
  }

  // (2) Email match (verified) → auto-link.
  if (payload.email_verified) {
    const match = await pool.query<{ id: string }>(
      `SELECT id FROM users WHERE LOWER(email) = LOWER($1)`, [payload.email],
    );
    if (match.rowCount! > 0) {
      const userId = match.rows[0]!.id;
      await pool.query(
        `INSERT INTO user_identities (user_id, provider, provider_sub, email, email_verified)
         VALUES ($1, 'google', $2, $3, $4)`,
        [userId, payload.sub, payload.email, payload.email_verified],
      );
      await reconcileEnvAdmin(userId, payload.email);
      return finishLogin(reply, ret, userId);
    }
  }

  // (3) Bootstrap exception: verified email in ADMIN_EMAILS → create user as admin.
  if (payload.email_verified) {
    const adminEmails = (process.env.ADMIN_EMAILS ?? '')
      .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    if (adminEmails.includes(payload.email.toLowerCase())) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const name = payload.name ?? payload.email;
        const shortName = name.split(' ')[0]!.slice(0, 16);
        let userId: string;
        try {
          const { rows } = await client.query<{ id: string }>(
            `INSERT INTO users (name, short_name, email, auth_hash, is_admin)
             VALUES ($1, $2, $3, 'oauth:google', TRUE) RETURNING id`,
            [name, shortName, payload.email],
          );
          userId = rows[0]!.id;
        } catch (e) {
          await client.query('ROLLBACK');
          if ((e as { code?: string }).code === '23505') {
            // Race: another request created the same email between branch checks.
            const match = await pool.query<{ id: string }>(
              `SELECT id FROM users WHERE LOWER(email) = LOWER($1)`, [payload.email],
            );
            if (match.rowCount! > 0) {
              const existingId = match.rows[0]!.id;
              await pool.query(
                `INSERT INTO user_identities (user_id, provider, provider_sub, email, email_verified)
                 VALUES ($1, 'google', $2, $3, $4)
                 ON CONFLICT (provider, provider_sub) DO NOTHING`,
                [existingId, payload.sub, payload.email, payload.email_verified],
              );
              await reconcileEnvAdmin(existingId, payload.email);
              return finishLogin(reply, ret, existingId);
            }
            return reply.code(409).send({ error: 'email_in_use' });
          }
          throw e;
        }
        await client.query(
          `INSERT INTO user_identities (user_id, provider, provider_sub, email, email_verified)
           VALUES ($1, 'google', $2, $3, $4)`,
          [userId, payload.sub, payload.email, payload.email_verified],
        );
        await writeAudit(client, {
          actor_id: userId,
          action: 'env_promote',
          target_user_id: userId,
          metadata: { source: 'ADMIN_EMAILS', via: 'google_bootstrap', email: payload.email },
        });
        await client.query('COMMIT');
        return finishLogin(reply, ret, userId);
      } catch (e) {
        try { await client.query('ROLLBACK'); } catch { /* already rolled back */ }
        throw e;
      } finally {
        client.release();
      }
    }
  }

  // (4) Unknown email → approval queue.
  const upsert = await pool.query<{ id: string }>(
    `INSERT INTO pending_users (provider, provider_sub, email, email_verified, name, picture_url)
     VALUES ('google', $1, $2, $3, $4, $5)
     ON CONFLICT (provider, provider_sub) DO UPDATE
       SET email = EXCLUDED.email,
           email_verified = EXCLUDED.email_verified,
           name = EXCLUDED.name,
           picture_url = EXCLUDED.picture_url,
           outcome = CASE WHEN pending_users.outcome = 'rejected' THEN 'pending'
                          ELSE pending_users.outcome END,
           outcome_ticket = CASE WHEN pending_users.outcome = 'rejected' THEN NULL
                                 ELSE pending_users.outcome_ticket END,
           outcome_at = CASE WHEN pending_users.outcome = 'rejected' THEN NULL
                             ELSE pending_users.outcome_at END
     RETURNING id`,
    [payload.sub, payload.email, payload.email_verified, payload.name ?? payload.email, payload.picture ?? null],
  );
  return reply.redirect(`${process.env.PUBLIC_APP_URL ?? ''}/awaiting-approval?id=${upsert.rows[0]!.id}`);
}

async function finishLogin(
  reply: import('fastify').FastifyReply,
  ret: 'web' | 'macos',
  userId: string,
) {
  const token = await createSession(userId);
  if (ret === 'web') {
    setSessionCookie(reply, token);
    return reply.redirect(`${process.env.PUBLIC_APP_URL ?? ''}/`);
  }
  const ticket = await issueTicket(token);
  const scheme = process.env.MACOS_URL_SCHEME ?? 'kanbanclaude';
  return reply.redirect(`${scheme}://auth?ticket=${encodeURIComponent(ticket)}`);
}
