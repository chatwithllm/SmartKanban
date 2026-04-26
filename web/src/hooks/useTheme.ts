import { useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'theme';

function readStored(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
  } catch {
    return 'system';
  }
}

function writeStored(m: ThemeMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, m);
  } catch {
    /* private mode / quota — silently ignore */
  }
}

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
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
  const initial = (() => readStored())();
  const [mode, setMode] = useState<ThemeMode>(initial);
  const [effective, setEffective] = useState<'light' | 'dark'>(() => effectiveOf(initial));

  useEffect(() => {
    applyTheme(effective);
  }, [effective]);

  useEffect(() => {
    if (mode !== 'system') return;
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => setEffective(systemPrefersDark() ? 'dark' : 'light');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [mode]);

  const set = (m: ThemeMode) => {
    writeStored(m);
    setMode(m);
    setEffective(effectiveOf(m));
  };

  return { mode, effective, set };
}
