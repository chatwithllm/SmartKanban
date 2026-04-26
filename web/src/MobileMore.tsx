import { useState } from 'react';
import { useAuth } from './auth.tsx';
import { useInstallPrompt } from './hooks/useInstallPrompt.ts';
import { useTheme } from './hooks/useTheme.ts';
import { ArchiveDialog } from './components/ArchiveDialog.tsx';
import { SettingsDialog } from './components/SettingsDialog.tsx';
import { WeeklyReview } from './components/WeeklyReview.tsx';
import type { Card } from './types.ts';

type Props = {
  onCardRestored: (card: Card) => void;
};

export function MobileMore({ onCardRestored }: Props) {
  const { user, logout } = useAuth();
  const { canInstall, install } = useInstallPrompt();
  const { mode, set: setTheme } = useTheme();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="bg-canvas min-h-screen p-4 pb-[calc(56px+16px)] flex flex-col gap-3">
      {/* Greeting */}
      <div className="card-surface p-4 text-3 text-ink tracking-tight2">
        Hi, {user?.short_name || user?.name || 'there'}
      </div>

      {/* Theme toggle */}
      <section className="card-surface p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-3 font-semibold text-ink tracking-tight2">Theme</div>
            <div className="text-1 text-ink-soft tracking-tight2">Light, dark, or follow your system</div>
          </div>
          <div className="flex rounded-pill bg-ceramic p-0.5">
            {(['light', 'dark', 'system'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setTheme(m)}
                className={`rounded-pill px-3 py-1 text-2 font-medium tracking-tight2 transition-colors ${
                  mode === m ? 'bg-card text-green-starbucks' : 'text-ink-soft'
                }`}
              >
                {m === 'light' ? 'Light' : m === 'dark' ? 'Dark' : 'System'}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Utility rows */}
      <button
        type="button"
        onClick={() => setReviewOpen(true)}
        className="card-surface w-full flex items-center justify-between p-4 text-3 text-ink tracking-tight2"
      >
        <span className="flex items-center gap-3"><span aria-hidden>📅</span> Weekly review</span>
        <span className="text-ink-soft" aria-hidden>›</span>
      </button>

      <button
        type="button"
        onClick={() => setArchiveOpen(true)}
        className="card-surface w-full flex items-center justify-between p-4 text-3 text-ink tracking-tight2"
      >
        <span className="flex items-center gap-3"><span aria-hidden>📦</span> Archived cards</span>
        <span className="text-ink-soft" aria-hidden>›</span>
      </button>

      <button
        type="button"
        onClick={() => setSettingsOpen(true)}
        className="card-surface w-full flex items-center justify-between p-4 text-3 text-ink tracking-tight2"
      >
        <span className="flex items-center gap-3"><span aria-hidden>⚙</span> Settings</span>
        <span className="text-ink-soft" aria-hidden>›</span>
      </button>

      {canInstall && (
        <button
          type="button"
          onClick={() => { install(); }}
          className="card-surface w-full flex items-center justify-between p-4 text-3 text-ink tracking-tight2"
        >
          <span className="flex items-center gap-3"><span aria-hidden>📲</span> Install as app</span>
          <span className="text-ink-soft" aria-hidden>›</span>
        </button>
      )}

      <button
        type="button"
        onClick={() => logout()}
        className="card-surface w-full flex items-center justify-between p-4 text-3 text-red tracking-tight2"
      >
        <span className="flex items-center gap-3"><span aria-hidden>🚪</span> Sign out</span>
        <span className="text-red/60" aria-hidden>›</span>
      </button>

      {reviewOpen && <WeeklyReview onClose={() => setReviewOpen(false)} />}
      {archiveOpen && (
        <ArchiveDialog
          onClose={() => setArchiveOpen(false)}
          onRestore={onCardRestored}
        />
      )}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
