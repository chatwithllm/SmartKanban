import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { requireAdmin } from '../auth.js';

export async function adminRoutes(app: FastifyInstance) {
  app.get('/api/admin/users', { preHandler: requireAdmin }, async () => {
    const { rows } = await pool.query<{
      id: string;
      name: string;
      short_name: string;
      email: string;
      is_admin: boolean;
      last_login_at: string | null;
      session_count: number;
      created_at: string;
      identities: Array<{ provider: string; email: string }>;
    }>(`
      SELECT u.id, u.name,
             COALESCE(u.short_name, u.name) AS short_name,
             u.email, u.is_admin, u.created_at,
             (SELECT MAX(s.created_at) FROM sessions s WHERE s.user_id = u.id) AS last_login_at,
             (SELECT COUNT(*)::int FROM sessions s
                WHERE s.user_id = u.id AND s.expires_at > NOW()) AS session_count,
             COALESCE(
               (SELECT json_agg(json_build_object('provider', i.provider, 'email', i.email))
                FROM user_identities i WHERE i.user_id = u.id),
               '[]'::json
             ) AS identities
      FROM users u
      ORDER BY u.created_at ASC
    `);
    return rows;
  });
}
