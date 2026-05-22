import { useState } from 'react';
import { api } from '../api.ts';

export function ChangePassword() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (next !== confirm) { setErr('Passwords do not match.'); return; }
    if (next.length < 6) { setErr('New password must be at least 6 characters.'); return; }
    setBusy(true);
    try {
      await api.changePassword({ current_password: current, new_password: next });
      window.location.replace('/');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed');
    } finally {
      setBusy(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', marginTop: 6, padding: '10px 12px', borderRadius: 8,
    border: '1px solid rgb(var(--hairline) / 0.16)',
    background: 'rgb(var(--canvas))', color: 'rgb(var(--ink))',
    fontSize: 14, outline: 'none',
  };

  return (
    <form onSubmit={submit} style={{
      minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgb(var(--canvas))', padding: '24px 16px',
    }}>
      <div style={{
        width: '100%', maxWidth: 400, background: 'rgb(var(--surface))',
        border: '1px solid rgb(var(--hairline) / 0.10)', borderRadius: 18,
        padding: '32px 28px', boxShadow: 'var(--sh-3)',
      }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Set a new password</h1>
        <p style={{ color: 'rgb(var(--ink-soft))', fontSize: 13, marginBottom: 20 }}>
          An admin reset your password. Choose a new one to continue.
        </p>
        <label style={{ display: 'block', marginBottom: 14, fontSize: 13, color: 'rgb(var(--ink-soft))' }}>
          Current password
          <input type="password" required value={current}
            onChange={e => setCurrent(e.target.value)} style={inputStyle} autoFocus />
        </label>
        <label style={{ display: 'block', marginBottom: 14, fontSize: 13, color: 'rgb(var(--ink-soft))' }}>
          New password
          <input type="password" required value={next}
            onChange={e => setNext(e.target.value)} style={inputStyle} />
        </label>
        <label style={{ display: 'block', marginBottom: 16, fontSize: 13, color: 'rgb(var(--ink-soft))' }}>
          Confirm new password
          <input type="password" required value={confirm}
            onChange={e => setConfirm(e.target.value)} style={inputStyle} />
        </label>
        {err && <p style={{ color: 'rgb(var(--pin-doing))', fontSize: 13, marginBottom: 14 }}>{err}</p>}
        <button type="submit" disabled={busy} style={{
          width: '100%', padding: '10px 16px', borderRadius: 10,
          background: 'rgb(var(--violet))', color: 'white', border: 'none',
          cursor: busy ? 'wait' : 'pointer', fontSize: 14, fontWeight: 600,
          opacity: busy ? 0.6 : 1,
        }}>
          {busy ? 'Updating…' : 'Update password'}
        </button>
      </div>
    </form>
  );
}
