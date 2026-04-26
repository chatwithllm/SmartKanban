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
    <div className="mx-auto mt-24 w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          {mode === 'login' ? 'Sign in' : 'Create account'}
        </h1>
        <button
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setError(null);
          }}
          className="text-xs text-neutral-400 hover:text-neutral-200"
        >
          {mode === 'login' ? 'Need an account?' : 'Have an account?'}
        </button>
      </div>
      <form onSubmit={submit} className="space-y-3">
        {mode === 'register' && (
          <>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              required
              className="w-full rounded-lg bg-neutral-950 px-3 py-2 text-sm outline-none border border-neutral-800 focus:border-neutral-600"
            />
            <input
              value={shortName}
              onChange={(e) => setShortName(e.target.value.slice(0, 16))}
              placeholder="Short name shown on cards (e.g. Jay)"
              required
              minLength={1}
              maxLength={16}
              className="w-full rounded-lg bg-neutral-950 px-3 py-2 text-sm outline-none border border-neutral-800 focus:border-neutral-600"
            />
          </>
        )}
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          required
          className="w-full rounded-lg bg-neutral-950 px-3 py-2 text-sm outline-none border border-neutral-800 focus:border-neutral-600"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          required
          minLength={6}
          className="w-full rounded-lg bg-neutral-950 px-3 py-2 text-sm outline-none border border-neutral-800 focus:border-neutral-600"
        />
        {error && <div className="text-xs text-red-300">{error}</div>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-900 hover:bg-white disabled:opacity-50"
        >
          {busy ? '…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
      </form>
    </div>
  );
}
