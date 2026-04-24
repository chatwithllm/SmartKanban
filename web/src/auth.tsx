import { createContext, useContext, useEffect, useState } from 'react';
import { ApiError, api } from './api.ts';
import type { User } from './types.ts';

type Ctx = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, short_name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateMe: (patch: { short_name?: string; name?: string }) => Promise<void>;
};

const AuthContext = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .me()
      .then(setUser)
      .catch((e: unknown) => {
        if (!(e instanceof ApiError && e.status === 401)) console.error(e);
      })
      .finally(() => setLoading(false));
  }, []);

  const value: Ctx = {
    user,
    loading,
    login: async (email, password) => setUser(await api.login({ email, password })),
    register: async (name, short_name, email, password) =>
      setUser(await api.register({ name, short_name, email, password })),
    logout: async () => {
      await api.logout();
      setUser(null);
    },
    updateMe: async (patch) => setUser(await api.updateMe(patch)),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): Ctx {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside provider');
  return ctx;
}
