import crypto from 'node:crypto';
import argon2 from 'argon2';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { pool } from './db.js';

export const SESSION_COOKIE = 'kanban_session';
export const MIRROR_HEADER = 'x-mirror-token';
const SESSION_DAYS = 30;

export type AuthUser = { id: string; name: string; short_name: string; email: string };

export async function hashPassword(pw: string): Promise<string> {
  return argon2.hash(pw, { type: argon2.argon2id });
}
export async function verifyPassword(hash: string, pw: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, pw);
  } catch {
    return false;
  }
}

export function newToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export async function createSession(userId: string): Promise<string> {
  const token = newToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86400 * 1000);
  await pool.query(
    `INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)`,
    [token, userId, expires],
  );
  return token;
}

export async function deleteSession(token: string): Promise<void> {
  await pool.query(`DELETE FROM sessions WHERE token = $1`, [token]);
}

export async function userFromSession(token: string | undefined): Promise<AuthUser | null> {
  if (!token) return null;
  const { rows } = await pool.query<AuthUser>(
    `SELECT u.id, u.name, COALESCE(u.short_name, u.name) AS short_name, u.email
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = $1 AND s.expires_at > NOW()`,
    [token],
  );
  return rows[0] ?? null;
}

export async function userFromMirrorToken(token: string | undefined): Promise<AuthUser | null> {
  if (!token) return null;
  const { rows } = await pool.query<AuthUser>(
    `SELECT u.id, u.name, COALESCE(u.short_name, u.name) AS short_name, u.email
     FROM mirror_tokens m JOIN users u ON u.id = m.user_id
     WHERE m.token = $1`,
    [token],
  );
  return rows[0] ?? null;
}

export async function userFromApiToken(token: string | undefined): Promise<AuthUser | null> {
  if (!token) return null;
  const { rows } = await pool.query<AuthUser>(
    `SELECT u.id, u.name, COALESCE(u.short_name, u.name) AS short_name, u.email
     FROM mirror_tokens m JOIN users u ON u.id = m.user_id
     WHERE m.token = $1 AND m.scope = 'api'`,
    [token],
  );
  return rows[0] ?? null;
}

function bearerToken(req: FastifyRequest): string | undefined {
  const h = req.headers.authorization;
  if (typeof h !== 'string') return undefined;
  const m = h.match(/^Bearer\s+(\S+)$/i);
  return m ? m[1] : undefined;
}

export async function requireApiToken(req: FastifyRequest, reply: FastifyReply) {
  const tok = bearerToken(req);
  const user = await userFromApiToken(tok);
  if (!user) {
    reply.code(403).send({ error: 'api token required' });
    return;
  }
  req.user = user;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
    isMirror?: boolean;
  }
}

export async function requireUser(req: FastifyRequest, reply: FastifyReply) {
  const sessionToken = req.cookies?.[SESSION_COOKIE];
  const user = await userFromSession(sessionToken);
  if (!user) {
    reply.code(401).send({ error: 'unauthorized' });
    return;
  }
  req.user = user;
}

export async function requireUserOrApiToken(req: FastifyRequest, reply: FastifyReply) {
  const sessionToken = req.cookies?.[SESSION_COOKIE];
  if (sessionToken) {
    const user = await userFromSession(sessionToken);
    if (user) { req.user = user; return; }
  }
  const tok = bearerToken(req);
  const user = await userFromApiToken(tok);
  if (!user) {
    reply.code(401).send({ error: 'auth required' });
    return;
  }
  req.user = user;
}

export async function requireUserOrMirror(req: FastifyRequest, reply: FastifyReply) {
  const mirrorTok = req.headers[MIRROR_HEADER];
  if (typeof mirrorTok === 'string') {
    const user = await userFromMirrorToken(mirrorTok);
    if (user) {
      req.user = user;
      req.isMirror = true;
      return;
    }
  }
  await requireUser(req, reply);
}

// Session cookie is `secure` (HTTPS-only) when APP_URL is https://, so the
// browser never transmits it over plain HTTP. Falls back to non-secure for
// local dev and HTTP-only deployments. Override with COOKIE_SECURE=true|false.
function cookieSecure(): boolean {
  const env = process.env.COOKIE_SECURE;
  if (env === 'true') return true;
  if (env === 'false') return false;
  return (process.env.APP_URL ?? '').startsWith('https://');
}

export function setSessionCookie(reply: FastifyReply, token: string) {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieSecure(),
    path: '/',
    maxAge: SESSION_DAYS * 86400,
  });
}

export function clearSessionCookie(reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE, { path: '/', secure: cookieSecure() });
}
