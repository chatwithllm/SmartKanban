import type { Card, Status } from '../types.ts';
import { STATUSES, STATUS_LABELS } from '../types.ts';

const STATUS_EMOJI: Record<Status, string> = {
  backlog: '📥',
  today: '📅',
  in_progress: '⚡',
  done: '✅',
};

type Props = {
  card: Card;
  onClose: () => void;
  onMove: (status: Status) => void;
  onArchive: () => void;
};

type Action = {
  key: string;
  icon: string;
  label: string;
  run: () => void;
  destructive?: boolean;
  disabled?: boolean;
};

export function MobileCardActions({ card, onClose, onMove, onArchive }: Props) {
  const moveActions: Action[] = STATUSES.map((s) => ({
    key: `move-${s}`,
    icon: STATUS_EMOJI[s],
    label: `Move to ${STATUS_LABELS[s]}`,
    run: () => { if (card.status !== s) onMove(s); },
    disabled: card.status === s,
  }));

  const destructiveActions: Action[] = [
    {
      key: 'archive',
      icon: '🗑',
      label: 'Archive',
      run: onArchive,
      destructive: true,
    },
  ];

  const allActions = [...moveActions, ...destructiveActions];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-ink/40"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-card rounded-sheet w-full max-h-[80vh] overflow-y-auto p-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto h-1 w-8 rounded-full bg-ceramic my-2" aria-hidden />
        <p className="px-3 pb-2 text-2 text-ink-soft tracking-tight2 truncate">{card.title || 'Untitled'}</p>
        <ul className="divide-y divide-ink/10">
          {allActions.map((action) => (
            <li key={action.key}>
              <button
                type="button"
                onClick={action.disabled ? undefined : action.run}
                disabled={action.disabled}
                className={`w-full flex items-center gap-3 py-3 px-3 text-3 tracking-tight2 disabled:opacity-30 ${
                  action.destructive ? 'text-red' : 'text-ink'
                }`}
              >
                <span className={action.destructive ? 'text-red' : 'text-green-accent'} aria-hidden>{action.icon}</span>
                <span className="flex-1 text-left">{action.label}</span>
                {!action.disabled && <span className="text-ink-soft" aria-hidden>›</span>}
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-1 border-t border-ink/10 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 px-3 text-center text-3 text-ink-soft tracking-tight2"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
