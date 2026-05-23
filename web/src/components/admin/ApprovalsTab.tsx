import { useEffect, useState } from 'react';
import { api } from '../../api.ts';
import type { PendingUserRow } from '../../types.ts';

export function ApprovalsTab() {
  const [rows, setRows] = useState<PendingUserRow[] | null>(null);

  const refresh = () => {
    api.adminListPending().then(setRows).catch(() => setRows([]));
  };

  useEffect(() => { refresh(); }, []);

  if (!rows) return <div style={{ color: 'rgb(var(--ink-soft))', padding: 24 }}>Loading…</div>;
  if (rows.length === 0) {
    return <div style={{ color: 'rgb(var(--ink-soft))', padding: 24 }}>No pending sign-ins.</div>;
  }

  return (
    <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {rows.map(r => <Row key={r.id} r={r} onDone={refresh} />)}
    </ul>
  );
}

function Row({ r, onDone }: { r: PendingUserRow; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const approve = async () => {
    const short = prompt(
      `Short display name for ${r.name} (1-16 chars):`,
      (r.name.split(' ')[0] ?? r.name).slice(0, 16),
    );
    if (!short) return;
    setBusy(true);
    try { await api.adminApprove(r.id, short); onDone(); }
    catch (e) { alert(e instanceof Error ? e.message : 'failed'); }
    finally { setBusy(false); }
  };
  const reject = async () => {
    if (!confirm(`Reject sign-in from ${r.email}?`)) return;
    setBusy(true);
    try { await api.adminReject(r.id); onDone(); }
    catch (e) { alert(e instanceof Error ? e.message : 'failed'); }
    finally { setBusy(false); }
  };
  const primary: React.CSSProperties = {
    padding: '8px 14px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600,
    background: 'rgb(var(--violet))', color: 'white', cursor: busy ? 'wait' : 'pointer',
  };
  const danger: React.CSSProperties = {
    padding: '8px 14px', borderRadius: 8, border: '1px solid rgb(var(--pin-doing) / 0.3)',
    background: 'rgb(var(--pin-doing) / 0.08)', color: 'rgb(var(--pin-doing))',
    fontSize: 13, fontWeight: 600, cursor: busy ? 'wait' : 'pointer',
  };
  return (
    <li style={{
      display: 'flex', alignItems: 'center', gap: 16, padding: 14,
      background: 'rgb(var(--surface))', borderRadius: 12,
      border: '1px solid rgb(var(--hairline) / 0.08)',
    }}>
      {r.picture_url ? (
        <img src={r.picture_url} alt="" style={{ width: 40, height: 40, borderRadius: 999 }} />
      ) : (
        <div style={{ width: 40, height: 40, borderRadius: 999, background: 'rgb(var(--hairline) / 0.16)' }} />
      )}
      <div style={{ flex: 1 }}>
        <div style={{ color: 'rgb(var(--ink))' }}>{r.name}</div>
        <div style={{ color: 'rgb(var(--ink-soft))', fontSize: 12 }}>
          {r.email}
          {!r.email_verified && (
            <span style={{
              marginLeft: 8, padding: '2px 6px', borderRadius: 4,
              background: 'rgb(var(--pin-doing) / 0.18)',
              color: 'rgb(var(--pin-doing))', fontSize: 10,
            }}>unverified</span>
          )}
        </div>
      </div>
      <button disabled={busy} onClick={approve} style={primary}>Approve</button>
      <button disabled={busy} onClick={reject} style={danger}>Reject</button>
    </li>
  );
}
