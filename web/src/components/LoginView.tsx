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
    <div className="min-h-screen bg-canvas flex items-center justify-center p-4">
      <div className="card-surface w-full max-w-[500px] p-8">
        <h1 className="text-9 font-semibold text-green-starbucks tracking-tight2 mb-6">SmartKanban</h1>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-3 font-semibold text-ink tracking-tight2">
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </h2>
        </div>
        <form onSubmit={submit} className="space-y-3">
          {mode === 'register' && (
            <>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                required
                className="bg-card border border-ink/10 rounded-card px-3 py-2 text-3 text-ink tracking-tight2 placeholder:text-ink-soft focus:border-green-accent focus:outline-none w-full mb-3"
              />
              <input
                value={shortName}
                onChange={(e) => setShortName(e.target.value.slice(0, 16))}
                placeholder="Short name shown on cards (e.g. Jay)"
                required
                minLength={1}
                maxLength={16}
                className="bg-card border border-ink/10 rounded-card px-3 py-2 text-3 text-ink tracking-tight2 placeholder:text-ink-soft focus:border-green-accent focus:outline-none w-full mb-3"
              />
            </>
          )}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
            className="bg-card border border-ink/10 rounded-card px-3 py-2 text-3 text-ink tracking-tight2 placeholder:text-ink-soft focus:border-green-accent focus:outline-none w-full mb-3"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
            minLength={6}
            className="bg-card border border-ink/10 rounded-card px-3 py-2 text-3 text-ink tracking-tight2 placeholder:text-ink-soft focus:border-green-accent focus:outline-none w-full mb-3"
          />
          {error && <div className="text-2 text-red tracking-tight2 mt-2">{error}</div>}
          <button
            type="submit"
            disabled={busy}
            className="btn-pill btn-pill-filled-black w-full mt-2"
          >
            {busy ? '…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>
        <button
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setError(null);
          }}
          className="mt-4 text-2 text-ink-soft hover:text-ink tracking-tight2"
        >
          {mode === 'login' ? 'Need an account? Register' : 'Have an account? Sign in'}
        </button>
      </div>
    </div>
  );
}
