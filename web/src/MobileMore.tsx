import { useState } from 'react';
import { useAuth } from './auth.tsx';
import { useInstallPrompt } from './hooks/useInstallPrompt.ts';
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
  const [reviewOpen, setReviewOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const Row = ({
    icon,
    label,
    onClick,
    danger,
  }: {
    icon: string;
    label: string;
    onClick: () => void;
    danger?: boolean;
  }) => (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 border-b border-neutral-800 px-4 py-4 text-left text-sm ${
        danger ? 'text-red-400' : 'text-neutral-100'
      }`}
    >
      <span className="text-lg">{icon}</span>
      <span className="flex-1">{label}</span>
      <span className="text-neutral-600">›</span>
    </button>
  );

  return (
    <div className="text-neutral-100">
      <div className="border-b border-neutral-800 px-4 py-4 text-sm">
        Hi, {user?.short_name || user?.name || 'there'}
      </div>
      <Row icon="📅" label="Weekly review" onClick={() => setReviewOpen(true)} />
      <Row icon="📦" label="Archived cards" onClick={() => setArchiveOpen(true)} />
      <Row icon="⚙" label="Settings" onClick={() => setSettingsOpen(true)} />
      {canInstall && (
        <Row icon="📲" label="Install as app" onClick={() => { install(); }} />
      )}
      <Row icon="🚪" label="Sign out" onClick={() => logout()} danger />

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
