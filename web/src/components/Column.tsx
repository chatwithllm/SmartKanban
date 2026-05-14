import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { motion, AnimatePresence } from 'framer-motion';
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
  in_progress: 'In Progress',
  done:        'Done',
};

const EMPTY_MSG: Record<string, string> = {
  backlog:     'Nothing here yet.',
  today:       'Nothing planned for today.',
  in_progress: 'Quiet here.',
  done:        'Nothing finished yet.',
};

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

export function Column({ status, cards, users, unreadCounts, onCreate, onEdit }: Props) {
  const accent = LANE_ACCENT[status] ?? 'backlog';
  const { setNodeRef: setDropRef, isOver: isColumnOver } = useDroppable({ id: `column:${status}` });

  return (
    <motion.div
      className="lane"
      animate={{
        boxShadow: isColumnOver
          ? '0 0 0 2px rgb(var(--pin-color) / 0.35), 0 0 0 6px rgb(var(--pin-color) / 0.08)'
          : '0 0 0 0px rgb(var(--pin-color) / 0)',
      }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      style={{ '--pin-color': `var(--pin-${accent})` } as React.CSSProperties}
    >
      {/* Header */}
      <div className="lane-header">
        <div className="lane-header-row">
          <span className="lane-dot" aria-hidden style={{ background: `rgb(var(--pin-${accent}))` }} />
          <span className="lane-title">{LANE_LABEL[status]}</span>
          <span className="lane-count">{String(cards.length).padStart(2, '0')}</span>
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
      <div ref={setDropRef} className="lane-body">
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

        <AnimatePresence>
          {cards.length === 0 && (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.25 }}
              className="lane-empty"
            >
              {EMPTY_MSG[status] ?? 'Nothing here.'}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <style>{`
        .lane {
          background: transparent;
          padding: 4px 8px 14px;
          display: flex;
          flex-direction: column;
          min-height: 380px;
          max-height: calc(100vh - 105px);
          position: relative;
          border-radius: 14px;
          isolation: isolate;
        }
        /* Subtle column bloom — tinted glow behind each lane */
        .lane::before {
          content: "";
          position: absolute;
          inset: -8px -4px auto -4px;
          height: 140px;
          pointer-events: none;
          z-index: -1;
          background: radial-gradient(
            ellipse 70% 100% at 50% 0%,
            rgb(var(--pin-color) / 0.08),
            transparent 70%
          );
          border-radius: 14px;
          opacity: 0.85;
        }
        .lane-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 4px 6px 14px;
          margin-bottom: 10px;
          position: relative;
        }
        .lane-header::after {
          content: "";
          position: absolute;
          left: 6px; right: 6px; bottom: 0;
          height: 1px;
          background: linear-gradient(
            to right,
            rgb(var(--pin-color) / 0.28),
            rgb(var(--hairline) / 0.06) 40%,
            transparent 100%
          );
        }
        .lane-header-row {
          display: flex; align-items: center; gap: 10px;
        }
        .lane-dot {
          display: inline-block;
          width: 8px; height: 8px;
          border-radius: 9999px;
          flex-shrink: 0;
          box-shadow: 0 0 0 3px rgb(var(--pin-color) / 0.12);
        }
        .lane-title {
          font-family: 'Spectral', 'Iowan Old Style', Georgia, serif;
          font-weight: 500;
          font-size: 18px;
          color: rgb(var(--ink));
          letter-spacing: -0.012em;
        }
        .lane-count {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-weight: 500;
          font-size: 10.5px;
          color: rgb(var(--ink-3));
          background: rgb(var(--hairline) / 0.05);
          border: 1px solid rgb(var(--hairline) / 0.07);
          padding: 2px 7px;
          border-radius: 999px;
          letter-spacing: 0.04em;
          font-feature-settings: 'tnum' 1;
          line-height: 1;
        }
        .lane-add {
          background: transparent;
          color: rgb(var(--ink-3));
          border-radius: 9999px;
          width: 24px; height: 24px;
          display: inline-flex; align-items: center; justify-content: center;
          border: none; cursor: pointer;
          font-size: 18px; line-height: 1;
          font-weight: 300;
          transition: color 120ms ease, background 120ms ease, transform 120ms ease;
        }
        .lane-add:hover { color: rgb(var(--ink)); background: rgb(var(--hairline) / 0.06); transform: rotate(90deg); }
        .lane-body {
          flex: 1; overflow-y: auto;
          overflow-x: visible;
          padding: 8px 6px 10px;
          display: flex; flex-direction: column;
          gap: 10px;
          background: rgb(var(--hairline) / 0.015);
          border-radius: 12px;
          box-shadow: inset 0 0 0 1px rgb(var(--hairline) / 0.04);
        }
        [data-theme="dark"] .lane-body {
          background: rgb(var(--hairline) / 0.025);
          box-shadow: inset 0 0 0 1px rgb(var(--hairline) / 0.06);
        }
        .lane-empty {
          padding: 32px 12px;
          text-align: center;
          font-size: 13px;
          color: rgb(var(--ink-3));
          font-family: 'Spectral', serif;
          font-style: italic;
          font-weight: 400;
        }
      `}</style>
    </motion.div>
  );
}

function SortableCard({ card, users, unreadCount, onEdit }: {
  card: Card; users: User[]; unreadCount: number;
  onEdit: (card: Card) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({ id: card.id });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        transform: transform
          ? `translate(${transform.x}px, ${transform.y}px)`
          : undefined,
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
