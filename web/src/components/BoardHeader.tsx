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
  section: 'board' | 'knowledge';
  onSection: (s: 'board' | 'knowledge') => void;
};

const SCOPES: Array<{ id: Scope; label: string }> = [
  { id: 'personal', label: 'My board' },
  { id: 'inbox', label: 'Family Inbox' },
  { id: 'all', label: 'Everything' },
];

export function BoardHeader({ scope, onScope, cardCount, searchQuery, onSearchChange, onOpenReview, onOpenArchive, onOpenSettings, section, onSection }: Props) {
  const { user, logout } = useAuth();
  const [showShortcuts, setShowShortcuts] = useState(false);
  return (
    <header className="app-bar relative mb-4 flex flex-wrap items-center justify-between gap-2 px-4 py-3 rounded-card">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold text-green-starbucks tracking-tight2">Kanban</h1>
        <div className="flex rounded-pill bg-ceramic p-0.5">
          {(['board', 'knowledge'] as const).map((s) => (
            <button
              key={s}
              onClick={() => onSection(s)}
              className={`rounded-pill px-3 py-1 text-2 font-medium transition-colors tracking-tight2 ${
                section === s ? 'bg-card text-green-starbucks shadow-sm' : 'text-ink-soft hover:text-ink'
              }`}
            >
              {s === 'board' ? 'Board' : 'Knowledge'}
            </button>
          ))}
        </div>
        {section === 'board' && (
          <>
            <div className="flex rounded-pill bg-ceramic p-0.5">
              {SCOPES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => onScope(s.id)}
                  className={`rounded-pill px-3 py-1 text-2 font-medium transition-colors tracking-tight2 ${
                    scope === s.id
                      ? 'bg-card text-green-starbucks shadow-sm'
                      : 'text-ink-soft hover:text-ink'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <span className="text-1 text-ink-soft tracking-tight2">{cardCount} cards</span>
            <SearchBar value={searchQuery} onChange={onSearchChange} />
          </>
        )}
      </div>
      <div className="flex items-center gap-3 text-sm">
        <button onClick={onOpenReview} className="text-2 text-ink-soft hover:text-ink tracking-tight2">
          Weekly review
        </button>
        <button onClick={onOpenArchive} className="text-2 text-ink-soft hover:text-ink tracking-tight2">
          Archive
        </button>
        <button
          onClick={onOpenSettings}
          className="text-2 text-ink-soft hover:text-ink tracking-tight2"
        >
          Settings
        </button>
        <span className="text-1 text-ink-soft tracking-tight2">{user?.name}</span>
        <button onClick={logout} className="text-2 text-ink-soft hover:text-ink tracking-tight2">
          Sign out
        </button>
        <button
          onClick={() => setShowShortcuts((v) => !v)}
          className="rounded-pill border border-ink/20 px-2 py-0.5 text-1 text-ink hover:bg-ink/5 tracking-tight2"
          title="Keyboard shortcuts"
          aria-label="Keyboard shortcuts"
          aria-expanded={showShortcuts}
        >
          ?
        </button>
      </div>
      {showShortcuts && (
        <div className="absolute right-0 top-full z-50 mt-1 rounded-card border border-ink/10 bg-card p-3 shadow-modal">
          <h3 className="mb-2 text-2 font-semibold text-ink tracking-tight2">Keyboard shortcuts</h3>
          <ul className="space-y-1">
            {SHORTCUTS.map((s) => (
              <li key={s.key} className="flex items-center gap-2 text-xs">
                <kbd className="rounded bg-ceramic px-1.5 py-0.5 font-mono text-ink">{s.key}</kbd>
                <span className="text-ink-soft">{s.description}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </header>
  );
}
