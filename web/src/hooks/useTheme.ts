import { useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'theme';

function readStored(): ThemeMode {
  if (typeof localStorage === 'undefined') return 'system';
  const v = localStorage.getItem(STORAGE_KEY);
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia
    && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function effectiveOf(mode: ThemeMode): 'light' | 'dark' {
  return mode === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : mode;
}

function applyTheme(effective: 'light' | 'dark') {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = effective;
}

export function useTheme(): {
  mode: ThemeMode;
  effective: 'light' | 'dark';
  set: (m: ThemeMode) => void;
} {
  const [mode, setMode] = useState<ThemeMode>(() => readStored());
  const [effective, setEffective] = useState<'light' | 'dark'>(() => effectiveOf(readStored()));

  useEffect(() => {
    applyTheme(effective);
  }, [effective]);

  useEffect(() => {
    if (mode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => setEffective(systemPrefersDark() ? 'dark' : 'light');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [mode]);

  const set = (m: ThemeMode) => {
    localStorage.setItem(STORAGE_KEY, m);
    setMode(m);
    setEffective(effectiveOf(m));
  };

  return { mode, effective, set };
}
