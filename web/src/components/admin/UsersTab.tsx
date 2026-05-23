import { useEffect, useState } from 'react';
import { api } from '../../api.ts';
import type { AdminUserRow } from '../../types.ts';

export function UsersTab() {
  const [rows, setRows] = useState<AdminUserRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refresh = () => {
    api.adminListUsers()
      .then(setRows)
      .catch(e => setErr(e instanceof Error ? e.message : 'failed'));
  };

  useEffect(() => { refresh(); }, []);

  if (err) return <div style={{ color: 'rgb(var(--pin-doing))', padding: 24 }}>Failed to load: {err}</div>;
  if (!rows) return <div style={{ color: 'rgb(var(--ink-soft))', padding: 24 }}>Loading…</div>;
  if (rows.length <= 1) {
    return <div style={{ color: 'rgb(var(--ink-soft))', padding: 24 }}>
      Only you. Family will appear here after they sign in.
    </div>;
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr style={{ textAlign: 'left', color: 'rgb(var(--ink-soft))' }}>
          <th style={{ padding: '8px 4px' }}>Name</th>
          <th>Email</th>
          <th>Identities</th>
          <th>Admin</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(u => <UserRow key={u.id} u={u} onChanged={refresh} />)}
      </tbody>
    </table>
  );
}

function UserRow({ u, onChanged }: { u: AdminUserRow; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const onlyGoogle = u.identities.length > 0 && u.identities.every(i => i.provider === 'google');

  const togglePromo = async () => {
    setBusy(true);
    try {
      if (u.is_admin) await api.adminDemote(u.id); else await api.adminPromote(u.id);
      onChanged();
    } catch (e) { alert(e instanceof Error ? e.message : 'failed'); }
    finally { setBusy(false); }
  };
  const revoke = async () => {
    if (!confirm(`Revoke all sessions for ${u.short_name}?`)) return;
    setBusy(true);
    try { await api.adminRevoke(u.id); onChanged(); }
    catch (e) { alert(e instanceof Error ? e.message : 'failed'); }
    finally { setBusy(false); }
  };
  const resetPw = async () => {
    const pw = prompt(`Set a temporary password for ${u.short_name} (min 6 chars).`);
    if (!pw) return;
    setBusy(true);
    try {
      await api.adminResetPassword(u.id, pw);
      alert('Done. Tell them the new password — they must change it on next login.');
      onChanged();
    } catch (e) { alert(e instanceof Error ? e.message : 'failed'); }
    finally { setBusy(false); }
  };

  const pillStyle: React.CSSProperties = {
    padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600,
    border: 'none', cursor: busy ? 'wait' : 'pointer',
    background: u.is_admin ? 'rgb(var(--violet) / 0.18)' : 'rgb(var(--hairline) / 0.10)',
    color: u.is_admin ? 'rgb(var(--violet))' : 'rgb(var(--ink-soft))',
  };
  const actionBtn: React.CSSProperties = {
    padding: '4px 10px', borderRadius: 6, fontSize: 12,
    border: '1px solid rgb(var(--hairline) / 0.16)',
    background: 'transparent', color: 'rgb(var(--ink))',
    cursor: busy ? 'wait' : 'pointer',
  };

  return (
    <tr style={{ borderTop: '1px solid rgb(var(--hairline) / 0.08)' }}>
      <td style={{ padding: '10px 4px' }}>{u.short_name}</td>
      <td>{u.email}</td>
      <td style={{ color: 'rgb(var(--ink-soft))', fontSize: 11 }}>
        {u.identities.length ? u.identities.map(i => i.provider).join(', ') : 'password'}
      </td>
      <td>
        <button disabled={busy} onClick={togglePromo} style={pillStyle}>
          {u.is_admin ? 'Admin' : 'Make admin'}
        </button>
      </td>
      <td style={{ display: 'flex', gap: 6, padding: '10px 4px' }}>
        <button disabled={busy || onlyGoogle} onClick={resetPw} style={{
          ...actionBtn, opacity: onlyGoogle ? 0.4 : 1,
        }} title={onlyGoogle ? "User signs in via Google; password reset doesn't apply." : ''}>
          Reset pw
        </button>
        <button disabled={busy} onClick={revoke} style={actionBtn}>Revoke</button>
      </td>
    </tr>
  );
}
