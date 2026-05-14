import { useState } from 'react';
import { useAuth } from '../auth.tsx';

type Props = {
  redirectTo?: string;
};

function isSafeRelativePath(p: string | undefined): boolean {
  if (!p) return false;
  if (!p.startsWith('/')) return false;
  if (p.startsWith('//')) return false;     // protocol-relative
  if (p.includes('://')) return false;      // absolute URL
  if (p.length > 200) return false;
  return true;
}

export function LoginView({ redirectTo }: Props) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'login') {
        await login(email, password);
        if (isSafeRelativePath(redirectTo)) {
          location.assign(redirectTo!);
        }
      } else {
        await register(name, shortName, email, password);
        if (isSafeRelativePath(redirectTo)) {
          location.assign(redirectTo!);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: 'rgb(var(--canvas))',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px 16px',
        position: 'relative', overflow: 'hidden',
      }}
    >
      {/* Soft status-tinted blooms behind the card — premium without slop */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background:
          'radial-gradient(ellipse 60% 50% at 20% 25%, rgb(var(--violet) / 0.18), transparent 60%),' +
          'radial-gradient(ellipse 50% 50% at 80% 80%, rgb(var(--pin-doing) / 0.10), transparent 65%)',
      }} />

      <div
        style={{
          position: 'relative', width: '100%', maxWidth: 420,
          background: 'rgb(var(--surface))',
          border: '1px solid rgb(var(--hairline) / 0.10)',
          borderRadius: 18,
          padding: '32px 28px',
          boxShadow: 'var(--sh-3)',
        }}
      >
        {/* Brand row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <span
            aria-hidden
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 38, height: 38, borderRadius: 10,
              background: 'rgb(var(--violet))',
              color: 'white', fontWeight: 700, fontSize: 18,
              fontFamily: 'Inter, sans-serif', letterSpacing: '-0.02em',
              boxShadow: '0 0 0 1px rgb(var(--violet) / 0.4), 0 4px 12px rgb(var(--violet) / 0.25)',
            }}
          >
            K
          </span>
          <div>
            <h1 style={{
              margin: 0, fontFamily: 'Spectral, serif',
              fontSize: 22, fontWeight: 600, color: 'rgb(var(--ink))',
              letterSpacing: '-0.02em', lineHeight: 1.1,
            }}>
              SmartKanban
            </h1>
            <div style={{
              marginTop: 2, fontFamily: 'JetBrains Mono, monospace',
              fontSize: 11, color: 'rgb(var(--ink-3))', letterSpacing: '0.04em',
            }}>
              {mode === 'login' ? 'SIGN IN' : 'CREATE ACCOUNT'}
            </div>
          </div>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {mode === 'register' && (
            <>
              <LoginInput
                value={name}
                onChange={setName}
                placeholder="Your name"
                required
              />
              <LoginInput
                value={shortName}
                onChange={(v) => setShortName(v.slice(0, 16))}
                placeholder="Short name shown on cards (e.g. Jay)"
                required
                minLength={1}
                maxLength={16}
              />
            </>
          )}
          <LoginInput
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="Email"
            required
            autoComplete={mode === 'login' ? 'username' : 'email'}
          />
          <LoginInput
            type="password"
            value={password}
            onChange={setPassword}
            placeholder="Password"
            required
            minLength={6}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />

          {error && (
            <div style={{
              fontSize: 12, color: 'rgb(var(--danger))',
              padding: '6px 12px', borderRadius: 8,
              background: 'rgb(var(--danger) / 0.08)',
              border: '1px solid rgb(var(--danger) / 0.18)',
              fontFamily: 'Inter, sans-serif',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            style={{
              marginTop: 8,
              padding: '12px 16px', borderRadius: 999,
              background: busy ? 'rgb(var(--hairline) / 0.12)' : 'rgb(var(--violet))',
              color: busy ? 'rgb(var(--ink-3))' : 'white',
              border: 'none', cursor: busy ? 'wait' : 'pointer',
              fontSize: 14, fontWeight: 600, fontFamily: 'Inter, sans-serif',
              letterSpacing: '-0.005em',
              transition: 'background 150ms ease',
            }}
          >
            {busy ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setError(null);
          }}
          style={{
            display: 'block', width: '100%',
            marginTop: 18, padding: '8px 0',
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 13, color: 'rgb(var(--ink-3))', fontFamily: 'Inter, sans-serif',
            textAlign: 'center',
          }}
        >
          {mode === 'login'
            ? "No account yet? Register"
            : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  );
}

function LoginInput({
  value, onChange, placeholder, type = 'text', required, minLength, maxLength, autoComplete,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  autoComplete?: string;
}) {
  const [focus, setFocus] = useState(false);
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      minLength={minLength}
      maxLength={maxLength}
      autoComplete={autoComplete}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      style={{
        width: '100%', boxSizing: 'border-box',
        background: 'rgb(var(--canvas))',
        color: 'rgb(var(--ink))',
        border: '1px solid ' + (focus ? 'rgb(var(--violet) / 0.6)' : 'rgb(var(--hairline) / 0.12)'),
        borderRadius: 10, padding: '12px 14px',
        // 16px so iOS Safari doesn't auto-zoom on focus.
        fontSize: 16, outline: 'none',
        fontFamily: 'Inter, sans-serif',
        boxShadow: focus ? '0 0 0 3px rgb(var(--violet) / 0.12)' : 'none',
        transition: 'border-color 120ms ease, box-shadow 120ms ease',
      }}
    />
  );
}
