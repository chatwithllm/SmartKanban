import { useEffect, useState } from 'react';
import { api, ApiError } from '../api';

type Phase = 'pending' | 'rejected' | 'expired' | 'error';

export function AwaitingApproval() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const [phase, setPhase] = useState<Phase>('pending');

  useEffect(() => {
    if (!id) { setPhase('error'); return; }
    let cancelled = false;

    const tick = async () => {
      try {
        const status = await api.pendingStatus(id);
        if (cancelled) return;
        if (status.status === 'pending') return; // keep polling
        if (status.status === 'rejected') { setPhase('rejected'); return; }
        // approved — exchange ticket
        if (!status.ticket) { setPhase('error'); return; }
        try {
          await api.exchangeTicket(status.ticket);
          if (!cancelled) window.location.replace('/');
        } catch (e) {
          if (cancelled) return;
          if (e instanceof ApiError && e.status === 410) setPhase('expired');
          else setPhase('error');
        }
      } catch {
        if (!cancelled) setPhase('error');
      }
    };

    void tick();
    const handle = setInterval(tick, 5000);
    return () => { cancelled = true; clearInterval(handle); };
  }, [id]);

  const retryGoogle = () => { window.location.href = '/api/auth/google/start?return=web'; };

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgb(var(--canvas))', padding: '24px 16px',
    }}>
      <div style={{
        width: '100%', maxWidth: 440, background: 'rgb(var(--surface))',
        border: '1px solid rgb(var(--hairline) / 0.10)', borderRadius: 18,
        padding: '32px 28px', boxShadow: 'var(--sh-3)',
      }}>
        {phase === 'pending' && (
          <>
            <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
              Waiting for an admin to approve your sign-in
            </h1>
            <p style={{ color: 'rgb(var(--ink-soft))', fontSize: 14 }}>
              You'll be redirected automatically once approved. You can leave this tab open.
            </p>
          </>
        )}
        {phase === 'rejected' && (
          <>
            <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Sign-in denied</h1>
            <p style={{ color: 'rgb(var(--ink-soft))', fontSize: 14 }}>
              An admin declined this request. Contact the owner of this kanban to ask why.
            </p>
          </>
        )}
        {phase === 'expired' && (
          <>
            <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Session expired — sign in again</h1>
            <p style={{ color: 'rgb(var(--ink-soft))', fontSize: 14, marginBottom: 16 }}>
              Your approval came through, but the one-time sign-in link expired. Click below to finish signing in.
            </p>
            <button
              onClick={retryGoogle}
              style={{
                padding: '10px 16px', borderRadius: 10,
                background: 'rgb(var(--violet))', color: 'white',
                border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600,
              }}
            >
              Sign in with Google
            </button>
          </>
        )}
        {phase === 'error' && (
          <>
            <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Something went wrong</h1>
            <p style={{ color: 'rgb(var(--ink-soft))', fontSize: 14 }}>
              Refresh and try signing in with Google again.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
