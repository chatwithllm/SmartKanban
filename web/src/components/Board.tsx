import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import type { Card, Status, User } from '../types.ts';
import { STATUSES } from '../types.ts';
import { Column } from './Column.tsx';
import { CardView } from './CardView.tsx';

type Props = {
  cards: Card[];
  users: User[];
  searchQuery: string;
  onCreate: (title: string, status: Status) => void;
  onEdit: (card: Card) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, status: Status, position: number) => void;
};

export function Board({ cards, users, searchQuery, onCreate, onEdit, onDelete, onMove }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const searchActive = searchQuery.trim().length > 0;

  const filteredCards = useMemo(() => {
    if (!searchActive) return cards;
    const q = searchQuery.trim().toLowerCase();
    return cards.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        (c.description ?? '').toLowerCase().includes(q),
    );
  }, [cards, searchQuery, searchActive]);

  const byStatus = useMemo(() => {
    const map: Record<Status, Card[]> = { backlog: [], today: [], in_progress: [], done: [] };
    for (const c of filteredCards) map[c.status].push(c);
    for (const s of STATUSES) map[s].sort((a, b) => a.position - b.position);
    return map;
  }, [filteredCards]);

  const activeCard = activeId ? cards.find((c) => c.id === activeId) ?? null : null;

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;

    const activeCard = cards.find((c) => c.id === active.id);
    if (!activeCard) return;

    const overId = String(over.id);
    let targetStatus: Status;
    let targetCards: Card[];
    let targetIndex: number;

    if (overId.startsWith('column:')) {
      targetStatus = overId.slice('column:'.length) as Status;
      targetCards = byStatus[targetStatus].filter((c) => c.id !== activeCard.id);
      targetIndex = targetCards.length;
    } else {
      const overCard = cards.find((c) => c.id === overId);
      if (!overCard) return;
      targetStatus = overCard.status;
      targetCards = byStatus[targetStatus].filter((c) => c.id !== activeCard.id);
      targetIndex = targetCards.findIndex((c) => c.id === overCard.id);
      if (targetIndex < 0) targetIndex = targetCards.length;
    }

    const before = targetIndex > 0 ? targetCards[targetIndex - 1]!.position : null;
    const after = targetIndex < targetCards.length ? targetCards[targetIndex]!.position : null;
    let newPosition: number;
    if (before === null && after === null) newPosition = 0;
    else if (before === null) newPosition = after! - 1;
    else if (after === null) newPosition = before + 1;
    else newPosition = (before + after) / 2;

    if (activeCard.status === targetStatus && activeCard.position === newPosition) return;
    onMove(activeCard.id, targetStatus, newPosition);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        {STATUSES.map((status) => (
          <Column
            key={status}
            status={status}
            cards={byStatus[status]}
            users={users}
            searchActive={searchActive}
            onCreate={(title) => onCreate(title, status)}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
      <DragOverlay>
        {activeCard ? <CardView card={activeCard} users={users} dragging /> : null}
      </DragOverlay>
    </DndContext>
  );
}
