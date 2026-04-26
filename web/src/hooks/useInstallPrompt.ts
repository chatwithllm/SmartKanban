import { useCallback, useEffect, useState } from 'react';

type DeferredPrompt = {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

/**
 * Captures the browser's `beforeinstallprompt` event and exposes a manual
 * `install()` trigger. iOS Safari does not fire this event; `canInstall`
 * stays false there.
 */
export function useInstallPrompt() {
  const [prompt, setPrompt] = useState<DeferredPrompt | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setPrompt(e as unknown as DeferredPrompt);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const install = useCallback(async () => {
    if (!prompt) return null;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    setPrompt(null);
    return choice.outcome;
  }, [prompt]);

  return { canInstall: !!prompt, install };
}
