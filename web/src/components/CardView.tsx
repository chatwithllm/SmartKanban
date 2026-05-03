import { useEffect } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { getServerClockSkewMs } from '../api.ts';
import type { Card, User } from '../types.ts';

type Props = {
  card: Card;
  users?: User[];
  unreadCount?: number;
  onClick?: () => void;
  onDelete?: () => void;
  dragging?: boolean;
  compact?: boolean;
};

// Short name falls back to first word of full name for legacy users.
function displayShort(u: User): string {
  return (u.short_name?.trim() || u.name.split(/\s+/)[0] || u.name).slice(0, 16);
}

function relativeTime(iso: string): string {
  const d = new Date(iso);
  // Use server time as the reference so local clock drift doesn't show "8h ago"
  // for a card that's a few minutes old.
  const nowMs = Date.now() + getServerClockSkewMs();
  const diff = nowMs - d.getTime();
  if (diff < 0) return 'just now';
  const m = Math.round(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function absoluteTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

function dueDateBadge(due: string): { label: string; cls: string } {
  const nowMs = Date.now() + getServerClockSkewMs();
  const today = new Date(nowMs);
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(due + 'T00:00:00');
  const diffDays = Math.round((dueDate.getTime() - today.getTime()) / 86_400_000);
  const label = dueDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (diffDays < 0) return { label, cls: 'bg-red/5 border border-red text-red' };
  if (diffDays === 0) return { label: 'Today', cls: 'bg-gold-lightest border border-gold text-gold' };
  if (diffDays <= 3) return { label, cls: 'bg-yellow/10 border border-yellow text-yellow' };
  return { label, cls: 'bg-ceramic text-ink-soft' };
}

export function CardView({ card, users = [], unreadCount = 0, onClick, onDelete, dragging, compact }: Props) {
  const sortable = useSortable({ id: card.id, data: { status: card.status } });
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = sortable;

  const assignees = card.assignees
    .map((id) => users.find((u) => u.id === id))
    .filter((u): u is User => !!u);
  const creator = card.created_by ? users.find((u) => u.id === card.created_by) : null;
  // Fall back to creator if nobody is assigned (e.g. Family Inbox cards captured via Telegram).
  const avatarPeople: Array<{ user: User; role: 'assignee' | 'creator' }> =
    assignees.length > 0
      ? assignees.map((u) => ({ user: u, role: 'assignee' }))
      : creator
        ? [{ user: creator, role: 'creator' }]
        : [];
  const firstImage = card.attachments.find((a) => a.kind === 'image');
  const hasAudio = card.attachments.some((a) => a.kind === 'audio');

  useEffect(() => {
    if (card.source !== 'telegram') return;
    if (document.getElementById('font-kalam-link')) return;
    const link = document.createElement('link');
    link.id = 'font-kalam-link';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Kalam:wght@400&display=swap';
    document.head.appendChild(link);
  }, [card.source]);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={`
        group relative card-surface cursor-grab active:cursor-grabbing p-3
        ${isDragging || dragging ? 'opacity-40' : ''}
        ${card.ai_summarized || card.needs_review ? 'border-l-4 border-l-gold pl-3' : ''}
      `}
      data-dragging={isDragging || dragging ? 'true' : undefined}
    >
      {firstImage && !compact && (
        <img
          src={`/attachments/${firstImage.storage_path}`}
          alt=""
          className="mb-2 w-full max-h-40 object-cover rounded-card"
          style={{ transition: 'opacity 0.3s ease-in' }}
        />
      )}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-3 text-ink font-semibold break-words tracking-tight2">{card.title}</div>
          {card.source === 'telegram' && creator && (
            <div className="font-script text-1 text-ink-soft mt-0.5">
              from {displayShort(creator)} via bot
            </div>
          )}
          {card.description && !compact && (
            <div className="mt-1 text-1 text-ink-soft line-clamp-2 break-words tracking-tight2">
              {card.description}
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {card.tags.map((t) => (
              <span
                key={t}
                className="tag-pill text-1"
              >
                #{t}
              </span>
            ))}
            {card.source === 'telegram' && (
              <span className="tag-pill text-1">
                telegram
              </span>
            )}
            {card.ai_summarized && (
              <span className="tag-pill text-1 bg-gold-lightest text-gold">
                AI
              </span>
            )}
            {hasAudio && (
              <span className="tag-pill text-1 bg-green-light text-green-accent">
                voice
              </span>
            )}
            {card.needs_review && (
              <span className="tag-pill text-1 bg-gold-lightest text-gold">
                review
              </span>
            )}
            {card.due_date && (() => {
              const badge = dueDateBadge(card.due_date);
              return (
                <span className={`inline-flex items-center rounded-pill px-2 py-0.5 text-1 tracking-tight2 ${badge.cls}`}>
                  📅 {badge.label}
                </span>
              );
            })()}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          {unreadCount > 0 && (
            <span className="inline-flex items-center justify-center h-4 min-w-[1rem] rounded-full bg-green-accent text-white text-1 font-medium px-1">
              {unreadCount}
            </span>
          )}
          {onDelete && (
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="opacity-0 group-hover:opacity-100 text-ink-soft hover:text-red text-2"
              aria-label="Delete card"
            >
              ✕
            </button>
          )}
          {avatarPeople.length > 0 && (
            <div className="flex flex-wrap justify-end gap-1">
              {avatarPeople.slice(0, 3).map(({ user, role }) => (
                <span
                  key={user.id}
                  title={role === 'creator' ? `from ${user.name}` : user.name}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap ${
                    role === 'creator'
                      ? 'bg-ceramic text-ink-soft border border-dashed border-ink/20'
                      : 'bg-green-light text-green-starbucks'
                  }`}
                >
                  {displayShort(user)}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      {!compact && (
        <div
          className="mt-2 text-1 text-ink-soft tracking-tight2"
          title={`Created ${absoluteTime(card.created_at)}${
            card.updated_at !== card.created_at ? `\nUpdated ${absoluteTime(card.updated_at)}` : ''
          }`}
        >
          {relativeTime(card.created_at)}
        </div>
      )}
    </div>
  );
}
