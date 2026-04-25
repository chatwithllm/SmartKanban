import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Card, Status, User } from '../types.ts';
import { STATUS_LABELS } from '../types.ts';
import { CardView } from './CardView.tsx';
import { EmptyColumn } from './EmptyColumn.tsx';

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

  const submit = () => {
    const t = draft.trim();
    if (t) onCreate(t);
    setDraft('');
    setAdding(false);
  };

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col rounded-xl bg-neutral-900/40 p-3 min-h-[60vh] transition-colors
        ${isOver ? 'bg-neutral-800/60' : ''}`}
    >
      <div className="mb-3 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-neutral-200">{STATUS_LABELS[status]}</h2>
          <span className="text-xs text-neutral-500">{cards.length}</span>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="text-neutral-500 hover:text-neutral-200 text-lg leading-none"
          aria-label={`Add card to ${STATUS_LABELS[status]}`}
        >
          +
        </button>
      </div>

      <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2">
          {adding && (
            <div className="rounded-lg border border-neutral-700 bg-neutral-900 p-2">
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
                placeholder="New card…"
                className="w-full resize-none bg-transparent text-sm text-neutral-100 outline-none placeholder:text-neutral-500"
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
            searchActive ? (
              <p className="py-8 text-center text-xs text-neutral-500">No cards match your search</p>
            ) : (
              <EmptyColumn status={status} />
            )
          )}
        </div>
      </SortableContext>
    </div>
  );
}
