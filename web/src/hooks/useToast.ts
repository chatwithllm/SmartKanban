import { createContext, useCallback, useContext, useState } from 'react';

export type ToastLevel = 'error' | 'info' | 'success';

export type Toast = {
  id: string;
  message: string;
  level: ToastLevel;
};

type ToastCtx = {
  toasts: Toast[];
  addToast: (message: string, level?: ToastLevel) => void;
  removeToast: (id: string) => void;
};

const ToastContext = createContext<ToastCtx | null>(null);
export const ToastProvider = ToastContext.Provider;

let nextId = 0;
const MAX_VISIBLE = 5;
const AUTO_DISMISS_MS = 4000;

export function useToastState(): ToastCtx {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (message: string, level: ToastLevel = 'error') => {
      const id = `toast-${++nextId}`;
      setToasts((prev) => [...prev.slice(-(MAX_VISIBLE - 1)), { id, message, level }]);
      setTimeout(() => removeToast(id), AUTO_DISMISS_MS);
    },
    [removeToast],
  );

  return { toasts, addToast, removeToast };
}

export function useToast(): ToastCtx {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast outside provider');
  return ctx;
}
