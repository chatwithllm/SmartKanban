import { useEffect, useRef, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { api } from '../api.ts';
import type { Card, Status, User } from '../types.ts';
import { STATUS_LABELS } from '../types.ts';
import { CardView } from './CardView.tsx';
import { EmptyColumn } from './EmptyColumn.tsx';
import { useTemplates } from '../hooks/useTemplates.ts';
import { useToast } from '../hooks/useToast.ts';

type Props = {
  status: Status;
  cards: Card[];
  users: User[];
  searchActive?: boolean;
  onCreate: (title: string) => void;
  onEdit: (card: Card) => void;
  onDelete: (id: string) => void;
};

export function Column({ status, cards, users, searchActive, onCreate, onEdit, onDelete }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${status}`, data: { status } });
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const { templates } = useTemplates();
  const { addToast } = useToast();
  const pickerRef = useRef<HTMLDivElement | null>(null);
  // Synchronous re-entry guard for submit(). State-based guards don't work here
  // because Enter→submit triggers setAdding(false) which unmounts the textarea
  // and fires onBlur={submit} in the same tick before state has flushed.
  const submittingRef = useRef(false);

  useEffect(() => {
    const onAddCard = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.status === status) setAdding(true);
    };
    window.addEventListener('kanban:add-card', onAddCard);
    return () => window.removeEventListener('kanban:add-card', onAddCard);
  }, [status]);

  useEffect(() => {
    if (!showPicker) return;
    const onDocClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [showPicker]);

  const submit = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      const t = draft.trim();
      setDraft('');
      setAdding(false);
      if (!t) return;
      if (t.startsWith('/') && !/\s/.test(t)) {
        const name = t.slice(1);
        const tpl = templates.find((tt) => tt.name.toLowerCase() === name.toLowerCase());
        if (tpl) {
          try {
            await api.instantiateTemplate(tpl.id, { status_override: status });
          } catch (e) {
            addToast(`Failed to use template: ${e instanceof Error ? e.message : 'error'}`, 'error');
          }
          return;
        }
      }
      onCreate(t);
    } finally {
      // Release the guard on the next tick so the blur-after-unmount that
      // fires in the same tick as Enter cannot re-trigger submit().
      setTimeout(() => { submittingRef.current = false; }, 0);
    }
  };

  const useTemplate = async (id: string) => {
    setShowPicker(false);
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      await api.instantiateTemplate(id, { status_override: status });
    } catch (e) {
      addToast(`Failed to use template: ${e instanceof Error ? e.message : 'error'}`, 'error');
    } finally {
      setTimeout(() => { submittingRef.current = false; }, 0);
    }
  };

  return (
    <div
      ref={setNodeRef}
      data-column-status={status}
      className={`flex flex-col rounded-card bg-ceramic/40 p-3 min-h-[60vh] transition-colors
        ${status === 'in_progress' ? 'border-l-4 border-green-uplift' : ''}
        ${isOver ? 'bg-ceramic' : ''}`}
    >
      <div className="mb-3 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <h2 className="text-3 font-normal text-ink tracking-tight2">{STATUS_LABELS[status]}</h2>
          <span className="text-1 text-ink-soft tracking-tight2">{cards.length}</span>
        </div>
        <div className="flex items-center gap-1">
          {templates.length > 0 && (
            <div className="relative" ref={pickerRef}>
              <button
                onClick={() => setShowPicker((v) => !v)}
                className="text-ink-soft hover:text-ink text-2"
                aria-label={`Use template in ${STATUS_LABELS[status]}`}
                aria-haspopup="menu"
                aria-expanded={showPicker}
                title="Use template"
              >
                📋
              </button>
              {showPicker && (
                <ul className="absolute right-0 top-6 z-10 w-48 rounded-card border border-ink/10 bg-card py-1 shadow-modal">
                  {templates.map((t) => (
                    <li key={t.id}>
                      <button
                        onClick={() => useTemplate(t.id)}
                        className="block w-full px-3 py-1 text-left text-2 text-ink hover:bg-ceramic tracking-tight2"
                      >
                        <span className="mr-1">{t.visibility === 'private' ? '🔒' : '👥'}</span>
                        {t.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <button
            onClick={() => setAdding(true)}
            className="text-green-accent hover:text-green-starbucks text-lg leading-none"
            aria-label={`Add card to ${STATUS_LABELS[status]}`}
          >
            +
          </button>
        </div>
      </div>

      <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2">
          {adding && (
            <div className="rounded-card border border-dashed border-ink/20 bg-card p-2 hover:border-green-accent transition-colors">
              <textarea
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  } else if (e.key === 'Escape') {
                    setDraft('');
                    setAdding(false);
                  }
                }}
                onBlur={submit}
                placeholder="New card… (or /template-name)"
                className="w-full resize-none bg-transparent text-3 text-ink outline-none placeholder:text-ink-soft tracking-tight2"
                rows={2}
              />
            </div>
          )}
          {cards.map((card) => (
            <CardView
              key={card.id}
              card={card}
              users={users}
              onClick={() => onEdit(card)}
              onDelete={() => onDelete(card.id)}
            />
          ))}
          {!adding && cards.length === 0 && (
            <EmptyColumn status={status} searchActive={searchActive} />
          )}
        </div>
      </SortableContext>
    </div>
  );
}
