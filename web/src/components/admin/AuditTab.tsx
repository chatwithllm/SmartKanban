import { useEffect, useState } from 'react';
import { api } from '../../api.ts';
import type { AuditEntryRow } from '../../types.ts';

export function AuditTab() {
  const [items, setItems] = useState<AuditEntryRow[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async (before?: string) => {
    setLoading(true);
    try {
      const page = await api.adminAudit({ limit: 50, before });
      setItems(prev => before ? [...prev, ...page.items] : page.items);
      setCursor(page.next_before);
      if (!page.next_before) setDone(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  if (loading && items.length === 0) {
    return <div style={{ color: 'rgb(var(--ink-soft))', padding: 24 }}>Loading…</div>;
  }
  if (items.length === 0) {
    return <div style={{ color: 'rgb(var(--ink-soft))', padding: 24 }}>No admin actions yet.</div>;
  }

  return (
    <div>
      <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.map(it => (
          <li key={it.id} style={{
            display: 'flex', alignItems: 'baseline', gap: 12,
            padding: '8px 4px',
            borderBottom: '1px solid rgb(var(--hairline) / 0.06)',
            fontSize: 13,
          }}>
            <span style={{ width: 180, color: 'rgb(var(--ink-soft))' }}>
              {new Date(it.created_at).toLocaleString()}
            </span>
            <span style={{ fontWeight: 600 }}>{it.actor_name ?? '(deleted)'}</span>
            <span style={{ color: 'rgb(var(--violet))' }}>{it.action}</span>
            <span style={{ color: 'rgb(var(--ink-soft))' }}>
              {it.target_user_name ?? (it.target_pending_id ? `pending:${it.target_pending_id.slice(0,8)}` : '')}
            </span>
            <details style={{ marginLeft: 'auto', fontSize: 11, color: 'rgb(var(--ink-soft))' }}>
              <summary style={{ cursor: 'pointer' }}>metadata</summary>
              <pre style={{
                marginTop: 4, maxWidth: 360, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                background: 'rgb(0 0 0 / 0.18)', padding: 8, borderRadius: 6,
              }}>{JSON.stringify(it.metadata, null, 2)}</pre>
            </details>
          </li>
        ))}
      </ul>
      {!done && (
        <button onClick={() => load(cursor)} disabled={loading} style={{
          marginTop: 16, padding: '8px 14px',
          background: 'transparent', color: 'rgb(var(--ink))',
          border: '1px solid rgb(var(--hairline) / 0.16)',
          borderRadius: 8, cursor: loading ? 'wait' : 'pointer', fontSize: 13,
        }}>
          {loading ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}
