import { useEffect } from 'react';
import { STATUSES } from '../types.ts';

type Options = {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  editing: boolean;
  reviewOpen: boolean;
  settingsOpen: boolean;
  onCloseDialog: () => void;
};

export function useKeyboardShortcuts({
  searchQuery,
  onSearchChange,
  editing,
  reviewOpen,
  settingsOpen,
  onCloseDialog,
}: Options) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const tag = target.tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
      const dialogOpen = editing || reviewOpen || settingsOpen;

      // Escape: close dialog or clear search (always active)
      if (e.key === 'Escape') {
        if (dialogOpen) {
          onCloseDialog();
          return;
        }
        if (searchQuery) {
          onSearchChange('');
          return;
        }
        return;
      }

      // Suppress all other shortcuts when typing or dialog open
      if (isInput || dialogOpen) return;

      // '/' or Cmd+K: focus search
      if (e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        // SearchBar already handles '/' focus via its own listener,
        // but Cmd+K needs to be handled here
        const searchInput = document.querySelector<HTMLInputElement>('input[placeholder="Search cards…"]');
        searchInput?.focus();
        return;
      }

      // 'n': trigger add card in backlog column
      if (e.key === 'n') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('kanban:add-card', { detail: { status: 'backlog' } }));
        return;
      }

      // '1'-'4': scroll to column
      const colIndex = parseInt(e.key, 10);
      if (colIndex >= 1 && colIndex <= 4) {
        e.preventDefault();
        const status = STATUSES[colIndex - 1];
        const column = document.querySelector(`[data-column-status="${status}"]`);
        column?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [searchQuery, onSearchChange, editing, reviewOpen, settingsOpen, onCloseDialog]);
}
