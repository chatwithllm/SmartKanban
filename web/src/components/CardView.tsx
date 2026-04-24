import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { getServerClockSkewMs } from '../api.ts';
import type { Card, User } from '../types.ts';

type Props = {
  card: Card;
  users?: User[];
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

export function CardView({ card, users = [], onClick, onDelete, dragging, compact }: Props) {
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

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={`
        group cursor-grab active:cursor-grabbing rounded-lg border border-neutral-800 bg-neutral-900 p-3
        hover:border-neutral-700 hover:bg-neutral-900/80
        ${isDragging || dragging ? 'opacity-40' : ''}
        ${card.needs_review ? 'ring-1 ring-amber-700/60' : ''}
      `}
    >
      {firstImage && !compact && (
        <img
          src={`/attachments/${firstImage.storage_path}`}
          alt=""
          className="mb-2 w-full max-h-40 object-cover rounded-md"
        />
      )}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm text-neutral-100 break-words">{card.title}</div>
          {card.description && !compact && (
            <div className="mt-1 text-xs text-neutral-400 line-clamp-2 break-words">
              {card.description}
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {card.tags.map((t) => (
              <span
                key={t}
                className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-300"
              >
                #{t}
              </span>
            ))}
            {card.source === 'telegram' && (
              <span className="rounded bg-sky-900/40 px-1.5 py-0.5 text-[10px] text-sky-200">
                telegram
              </span>
            )}
            {card.ai_summarized && (
              <span className="rounded bg-violet-900/40 px-1.5 py-0.5 text-[10px] text-violet-200">
                AI
              </span>
            )}
            {hasAudio && (
              <span className="rounded bg-emerald-900/40 px-1.5 py-0.5 text-[10px] text-emerald-200">
                voice
              </span>
            )}
            {card.needs_review && (
              <span className="rounded bg-amber-900/40 px-1.5 py-0.5 text-[10px] text-amber-200">
                review
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          {onDelete && (
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-neutral-200 text-xs"
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
                      ? 'bg-neutral-800 text-neutral-300 border border-dashed border-neutral-600'
                      : 'bg-neutral-700 text-neutral-100'
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
          className="mt-2 text-[10px] text-neutral-500"
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
