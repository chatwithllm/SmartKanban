import { useState } from 'react';
import type { Scope } from '../types.ts';
import { useAuth } from '../auth.tsx';
import { SearchBar } from './SearchBar.tsx';

const SHORTCUTS = [
  { key: '/', description: 'Search' },
  { key: 'Esc', description: 'Close dialog / Clear search' },
  { key: 'N', description: 'New card' },
];

type Props = {
  scope: Scope;
  onScope: (s: Scope) => void;
  cardCount: number;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onOpenReview: () => void;
  onOpenArchive: () => void;
  onOpenSettings: () => void;
};

const SCOPES: Array<{ id: Scope; label: string }> = [
  { id: 'personal', label: 'My board' },
  { id: 'inbox', label: 'Family Inbox' },
  { id: 'all', label: 'Everything' },
];

export function BoardHeader({ scope, onScope, cardCount, searchQuery, onSearchChange, onOpenReview, onOpenArchive, onOpenSettings }: Props) {
  const { user, logout } = useAuth();
  const [showShortcuts, setShowShortcuts] = useState(false);
  return (
    <header className="relative mb-4 flex flex-wrap items-center justify-between gap-2">
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
        <SearchBar value={searchQuery} onChange={onSearchChange} />
      </div>
      <div className="flex items-center gap-3 text-sm">
        <button onClick={onOpenReview} className="text-neutral-400 hover:text-neutral-100 text-xs">
          Weekly review
        </button>
        <button onClick={onOpenArchive} className="text-neutral-400 hover:text-neutral-100 text-xs">
          Archive
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
        <button
          onClick={() => setShowShortcuts((v) => !v)}
          className="rounded border border-neutral-700 px-1.5 py-0.5 text-xs text-neutral-400 hover:text-neutral-100"
          title="Keyboard shortcuts"
        >
          ?
        </button>
      </div>
      {showShortcuts && (
        <div className="absolute right-0 top-full z-50 mt-1 rounded-lg border border-neutral-700 bg-neutral-800 p-3 shadow-lg">
          <h3 className="mb-2 text-xs font-semibold text-neutral-200">Keyboard shortcuts</h3>
          <ul className="space-y-1">
            {SHORTCUTS.map((s) => (
              <li key={s.key} className="flex items-center gap-2 text-xs">
                <kbd className="rounded bg-neutral-700 px-1.5 py-0.5 font-mono text-neutral-300">{s.key}</kbd>
                <span className="text-neutral-400">{s.description}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </header>
  );
}
