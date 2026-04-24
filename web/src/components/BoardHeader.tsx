import type { Scope } from '../types.ts';
import { useAuth } from '../auth.tsx';

type Props = {
  scope: Scope;
  onScope: (s: Scope) => void;
  cardCount: number;
  onOpenReview: () => void;
  onOpenSettings: () => void;
};

const SCOPES: Array<{ id: Scope; label: string }> = [
  { id: 'personal', label: 'My board' },
  { id: 'inbox', label: 'Family Inbox' },
  { id: 'all', label: 'Everything' },
];

export function BoardHeader({ scope, onScope, cardCount, onOpenReview, onOpenSettings }: Props) {
  const { user, logout } = useAuth();
  return (
    <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold text-neutral-100">Kanban</h1>
        <div className="flex rounded-lg bg-neutral-900 p-0.5">
          {SCOPES.map((s) => (
            <button
              key={s.id}
              onClick={() => onScope(s.id)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                scope === s.id
                  ? 'bg-neutral-700 text-neutral-100'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-neutral-500">{cardCount} cards</span>
      </div>
      <div className="flex items-center gap-3 text-sm">
        <button onClick={onOpenReview} className="text-neutral-400 hover:text-neutral-100 text-xs">
          Weekly review
        </button>
        <button
          onClick={onOpenSettings}
          className="text-neutral-400 hover:text-neutral-100 text-xs"
        >
          Settings
        </button>
        <span className="text-neutral-500 text-xs">{user?.name}</span>
        <button onClick={logout} className="text-neutral-400 hover:text-neutral-100 text-xs">
          Sign out
        </button>
      </div>
    </header>
  );
}
