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

export function MobileCardActions({ card, onClose, onMove, onArchive }: Props) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-end bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full rounded-t-2xl bg-neutral-900 p-3 pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="px-3 pb-2 text-sm text-neutral-300 truncate">{card.title || 'Untitled'}</p>
        <hr className="border-neutral-800" />
        {STATUSES.map((s) => {
          const isCurrent = card.status === s;
          return (
            <button
              key={s}
              onClick={() => !isCurrent && onMove(s)}
              disabled={isCurrent}
              className="flex w-full items-center gap-3 px-3 py-3 text-sm text-neutral-100 disabled:opacity-30"
            >
              <span className="text-lg">{STATUS_EMOJI[s]}</span>
              <span>Move to {STATUS_LABELS[s]}</span>
            </button>
          );
        })}
        <button
          onClick={onArchive}
          className="flex w-full items-center gap-3 px-3 py-3 text-sm text-red-300"
        >
          <span className="text-lg">🗑</span>
          <span>Archive</span>
        </button>
        <hr className="my-1 border-neutral-800" />
        <button
          onClick={onClose}
          className="w-full px-3 py-3 text-center text-sm text-neutral-400"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
