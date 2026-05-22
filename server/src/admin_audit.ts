import type { Pool, PoolClient } from 'pg';

export type AdminAction =
  | 'promote'
  | 'demote'
  | 'reset_password'
  | 'revoke_sessions'
  | 'approve_user'
  | 'reject_user'
  | 'env_promote';

export type AuditEntry = {
  actor_id: string | null;
  action: AdminAction;
  target_user_id?: string | null;
  target_pending_id?: string | null;
  metadata?: Record<string, unknown>;
};

export async function writeAudit(
  db: Pool | PoolClient,
  entry: AuditEntry,
): Promise<void> {
  await db.query(
    `INSERT INTO admin_audit (actor_id, action, target_user_id, target_pending_id, metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [
      entry.actor_id,
      entry.action,
      entry.target_user_id ?? null,
      entry.target_pending_id ?? null,
      JSON.stringify(entry.metadata ?? {}),
    ],
  );
}
