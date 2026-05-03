import { useState } from 'react';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import type { Card, User } from '../types.ts';
import { CardView } from './CardView.tsx';
import type { Status } from '../types.ts';

const LANE_ACCENT: Record<string, string> = {
  backlog:     'backlog',
  today:       'today',
  in_progress: 'doing',
  done:        'done',
};

const LANE_LABEL: Record<string, string> = {
  backlog:     'Backlog',
  today:       'Today',
  in_progress: 'In progress',
  done:        'Done',
};

const EMPTY_MSG: Record<string, string> = {
  backlog:     'Empty backlog.',
  today:       'Nothing planned for today.',
  in_progress: 'Quiet here.',
  done:        'Nothing finished yet.',
};

function stableHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i);
  return Math.abs(h);
}

type Props = {
  status: Status;
  cards: Card[];
  users: User[];
  searchActive?: boolean;
  unreadCounts?: Record<string, number>;
  onCreate: (status: Status) => void;
  onEdit: (card: Card) => void;
  onDelete: (id: string) => void;
};

export function Column({ status, cards, users, unreadCounts, onCreate, onEdit, onDelete }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const accent = LANE_ACCENT[status] ?? 'backlog';

  return (
    <div
      className="lane"
      style={{
        '--lane-color': `var(--lane-${accent})`,
        boxShadow: dragOver
          ? '0 0 0 3px rgb(255 255 255 / 0.6), inset 0 0 0 1px rgb(0 0 0 / 0.06)'
          : 'inset 0 0 0 1px rgb(0 0 0 / 0.06), inset 0 1px 0 rgb(255 255 255 / 0.18)',
        transition: 'box-shadow 160ms ease',
      } as React.CSSProperties}
    >
      {/* Header */}
      <div className="lane-header">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span className="lane-title">{LANE_LABEL[status]}</span>
          <span className="lane-count">{cards.length}</span>
        </div>
        <button
          className="lane-add"
          onClick={() => onCreate(status)}
          title="Add card"
          aria-label="Add card"
        >
          +
        </button>
      </div>

      {/* Cards */}
      <div className="lane-body">
        <SortableContext items={cards.map(c => c.id)} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <SortableCard
              key={card.id}
              card={card}
              users={users}
              unreadCount={unreadCounts?.[card.id] ?? 0}
              onEdit={onEdit}
            />
          ))}
        </SortableContext>

        {cards.length === 0 && (
          <div style={{
            border: '1.5px dashed rgb(255 255 255 / 0.45)',
            borderRadius: 10,
            padding: '28px 12px',
            textAlign: 'center',
            fontSize: 12.5,
            color: 'rgb(255 255 255 / 0.78)',
            fontFamily: 'Spectral, serif',
            fontStyle: 'italic',
          }}>
            {EMPTY_MSG[status] ?? 'Nothing here.'}
          </div>
        )}
      </div>

      <style>{`
        .lane {
          background: rgb(var(--lane-color));
          border-radius: 14px;
          padding: 18px 14px 14px;
          display: flex;
          flex-direction: column;
          min-height: 380px;
          max-height: calc(100vh - 105px);
          position: relative;
        }
        .lane::before {
          content: "";
          position: absolute; inset: 0;
          border-radius: inherit;
          background-image:
            radial-gradient(rgb(255 255 255 / 0.06) 1px, transparent 1px),
            radial-gradient(rgb(0 0 0 / 0.04) 1px, transparent 1px);
          background-size: 22px 22px, 14px 14px;
          background-position: 0 0, 7px 7px;
          pointer-events: none;
          opacity: 0.6;
        }
        [data-theme="dark"] .lane::before { opacity: 0.4; }
        .lane-header {
          display: flex; align-items: baseline; justify-content: space-between;
          padding: 0 4px 12px;
          position: relative; z-index: 1;
        }
        .lane-title {
          font-family: 'Spectral', serif;
          font-weight: 600;
          font-size: 22px;
          color: rgb(255 255 255 / 0.96);
          letter-spacing: -0.01em;
          text-shadow: 0 1px 0 rgb(0 0 0 / 0.08);
        }
        .lane-count {
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px;
          color: rgb(255 255 255 / 0.78);
          background: rgb(0 0 0 / 0.14);
          padding: 2px 8px;
          border-radius: 999px;
        }
        .lane-add {
          background: rgb(255 255 255 / 0.18);
          color: rgb(255 255 255 / 0.95);
          border-radius: 999px;
          width: 26px; height: 26px;
          display: inline-flex; align-items: center; justify-content: center;
          border: none; cursor: pointer;
          font-size: 18px; line-height: 1;
          transition: background 120ms ease, transform 80ms ease;
        }
        .lane-add:hover { background: rgb(255 255 255 / 0.28); }
        .lane-add:active { transform: scale(0.95); }
        .lane-body {
          flex: 1; overflow-y: auto;
          overflow-x: visible;
          padding: 8px 4px 6px;
          position: relative; z-index: 1;
          display: flex; flex-direction: column;
          gap: 18px;
        }
        .lane-body::-webkit-scrollbar-thumb { background: rgb(0 0 0 / 0.18); }
      `}</style>
    </div>
  );
}

function SortableCard({ card, users, unreadCount, onEdit }: {
  card: Card; users: User[]; unreadCount: number;
  onEdit: (card: Card) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({ id: card.id });
  const rotation = (stableHash(card.id) % 9 - 4) * 0.18;

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        transform: transform
          ? `translate(${transform.x}px, ${transform.y}px) rotate(${rotation}deg)`
          : `rotate(${rotation}deg)`,
        transition: isDragging ? 'none' : 'transform 200ms ease',
        touchAction: 'none',
      }}
    >
      <CardView
        card={card}
        users={users}
        unreadCount={unreadCount}
        onClick={() => onEdit(card)}
        dragging={isDragging}
      />
    </div>
  );
}
