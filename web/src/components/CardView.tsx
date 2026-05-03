import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Card, User } from '../types.ts';

const STATUS_ACCENT: Record<string, string> = {
  backlog:     'backlog',
  today:       'today',
  in_progress: 'doing',
  done:        'done',
};

function stableHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i);
  return Math.abs(h);
}

function relTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  if (diff < 86400 * 30) return Math.floor(diff / 86400) + 'd ago';
  return Math.floor(diff / 86400 / 30) + 'mo ago';
}

function formatDue(iso: string | null): { label: string; tone: 'overdue' | 'today' | 'soon' | 'future' } | null {
  if (!iso) return null;
  const d = new Date(iso + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return { label: 'Today', tone: 'today' };
  if (diff === 1) return { label: 'Tomorrow', tone: 'soon' };
  if (diff === -1) return { label: 'Yesterday', tone: 'overdue' };
  if (diff < 0) return { label: Math.abs(diff) + 'd overdue', tone: 'overdue' };
  if (diff < 7) return { label: 'In ' + diff + 'd', tone: 'soon' };
  return { label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), tone: 'future' };
}

type Props = {
  card: Card;
  users?: User[];
  unreadCount?: number;
  onClick?: () => void;
  onDelete?: (id: string) => void;
  dragging?: boolean;
  compact?: boolean;
};

export function CardView({ card, users = [], unreadCount = 0, onClick, dragging, compact }: Props) {
  const sortable = useSortable({ id: card.id, data: { status: card.status } });
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = sortable;

  const accent = STATUS_ACCENT[card.status] ?? 'backlog';
  const rotation = (stableHash(card.id) % 9 - 4) * 0.18;
  const due = formatDue(card.due_date);
  const assignees = card.assignees
    .map(id => users.find(u => u.id === id))
    .filter((u): u is NonNullable<typeof u> => !!u);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
    >
      <div
        className="note-wrap"
        style={{ '--pin-color': `var(--pin-${accent})`, transform: `rotate(${rotation}deg)` } as React.CSSProperties}
        onClick={onClick}
      >
        {/* Pushpin */}
        <span className="pin" aria-hidden="true">
          <span className="pin-head" />
          <span className="pin-needle" />
        </span>

        {/* Card body */}
        <div className="note" style={{ opacity: isDragging || dragging ? 0.4 : 1 }}>
          {/* Source row */}
          {(card.source === 'telegram' || card.ai_summarized || card.needs_review) && (
            <div className="note-source">
              {card.source === 'telegram' && <span>⟰ telegram</span>}
              {card.ai_summarized && <span style={{ color: 'rgb(var(--violet))' }}> · ✦ ai</span>}
              {card.needs_review && <span style={{ color: 'rgb(var(--danger))' }}> · needs review</span>}
            </div>
          )}

          {/* Title */}
          <div className="note-title" style={{ fontSize: compact ? 13 : 15, marginBottom: 8 }}>
            {card.title}
          </div>

          {/* Description (non-compact only) */}
          {!compact && card.description && (
            <div style={{
              fontSize: 12.5,
              color: 'rgb(var(--ink-2))',
              marginBottom: 10,
              lineHeight: 1.45,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}>
              {card.description}
            </div>
          )}

          {/* Tags */}
          {card.tags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
              {card.tags.map(t => (
                <span key={t} style={{
                  display: 'inline-flex', alignItems: 'center',
                  fontSize: 11, fontWeight: 500, lineHeight: 1,
                  padding: '4px 8px', borderRadius: 999,
                  background: 'rgb(var(--surface-2, 246 245 242))',
                  color: 'rgb(var(--ink-2))',
                  border: '1px solid rgb(var(--hairline) / 0.08)',
                }}>
                  {t}
                </span>
              ))}
            </div>
          )}

          {/* Footer */}
          <div style={{
            display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', gap: 8,
            fontSize: 11.5, color: 'rgb(var(--ink-3))',
            paddingRight: 22,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {due && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                  color: due.tone === 'overdue' ? 'rgb(var(--danger))'
                       : due.tone === 'today' ? 'rgb(var(--violet))'
                       : 'rgb(var(--ink-3))',
                  fontWeight: due.tone === 'overdue' || due.tone === 'today' ? 600 : 500,
                }}>
                  {due.tone === 'overdue' ? '🔥' : '📅'} {due.label}
                </span>
              )}
              {card.attachments.some(a => a.kind !== 'image') && (
                <span>📎 {card.attachments.filter(a => a.kind !== 'image').length}</span>
              )}
              {unreadCount > 0 && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                  color: 'rgb(var(--violet))', fontWeight: 600,
                }}>
                  💬 {unreadCount}
                </span>
              )}
              {!due && card.attachments.length === 0 && unreadCount === 0 && (
                <span>{relTime(card.updated_at)}</span>
              )}
            </div>

            {/* Image thumbnails */}
            {card.attachments.filter(a => a.kind === 'image').length > 0 && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                {card.attachments.filter(a => a.kind === 'image').slice(0, 3).map((a, i, arr) => (
                  <div key={a.id} style={{ position: 'relative', flexShrink: 0 }}>
                    <img
                      src={`/attachments/${a.storage_path}`}
                      alt=""
                      style={{
                        width: 48, height: 48, objectFit: 'cover',
                        borderRadius: 6,
                        border: '1px solid rgb(var(--hairline) / 0.15)',
                      }}
                    />
                    {i === 2 && card.attachments.filter(a => a.kind === 'image').length > 3 && (
                      <div style={{
                        position: 'absolute', inset: 0, borderRadius: 6,
                        background: 'rgba(0,0,0,0.5)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 700, color: 'white',
                      }}>
                        +{card.attachments.filter(a => a.kind === 'image').length - 3}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Assignee initials */}
            {assignees.length > 0 && (
              <div style={{ display: 'inline-flex' }}>
                {assignees.slice(0, 3).map((u, i) => (
                  <span key={u.id} style={{
                    width: 22, height: 22, borderRadius: 999,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 600, color: 'white',
                    background: userColor(u.id),
                    border: '2px solid rgb(var(--surface))',
                    marginLeft: i > 0 ? -6 : 0,
                  }} title={u.name}>
                    {u.short_name.charAt(0).toUpperCase()}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <style>{`
          .note-wrap {
            position: relative;
            cursor: pointer;
            filter: drop-shadow(0 6px 14px rgb(0 0 0 / 0.10)) drop-shadow(0 14px 24px rgb(0 0 0 / 0.06));
            transition: transform 160ms cubic-bezier(0.2, 0.8, 0.2, 1);
          }
          .note-wrap:hover { filter: drop-shadow(0 8px 18px rgb(0 0 0 / 0.16)) drop-shadow(0 16px 28px rgb(0 0 0 / 0.08)); transform: translateY(-2px) rotate(var(--note-rot, 0deg)); }
          [data-theme="dark"] .note-wrap {
            filter: drop-shadow(0 6px 14px rgb(0 0 0 / 0.45)) drop-shadow(0 14px 24px rgb(0 0 0 / 0.35));
          }
          .note-wrap::before {
            content: "";
            position: absolute;
            right: 0; bottom: 0;
            width: 26px; height: 26px;
            background: rgb(var(--paper-fold));
            clip-path: polygon(100% 0, 100% 100%, 0 100%);
            z-index: 1;
          }
          .note {
            position: relative;
            background: rgb(var(--paper));
            clip-path: polygon(0 0, 100% 0, 100% calc(100% - 22px), calc(100% - 22px) 100%, 0 100%);
            padding: 22px 14px 14px;
          }
          .pin {
            display: block;
            position: absolute;
            top: -10px; left: 16px;
            width: 22px; height: 22px;
            z-index: 3;
          }
          .pin-head {
            display: block;
            width: 20px; height: 20px;
            border-radius: 50%;
            background: rgb(var(--pin-color));
            margin: 0 auto;
            box-shadow:
              inset -3px -4px 0 rgb(0 0 0 / 0.18),
              inset 3px 3px 0 rgb(255 255 255 / 0.28),
              0 2px 4px rgb(0 0 0 / 0.35),
              0 0 0 1px rgb(0 0 0 / 0.18);
            position: relative;
          }
          .pin-head::after {
            content: "";
            position: absolute;
            top: 3px; left: 4px;
            width: 6px; height: 5px;
            border-radius: 50%;
            background: rgb(255 255 255 / 0.7);
            filter: blur(0.5px);
          }
          .pin-needle {
            display: block;
            width: 3px; height: 5px;
            background: rgb(60 50 40);
            margin: -3px auto 0;
            border-radius: 0 0 2px 2px;
            box-shadow: 0 1px 2px rgb(0 0 0 / 0.3);
          }
          .note-source {
            display: inline-flex; align-items: center; gap: 4px;
            font-family: 'JetBrains Mono', monospace;
            font-size: 10px;
            color: rgb(var(--ink-3));
            margin-bottom: 6px;
            letter-spacing: 0.02em;
          }
          .note-title {
            font-family: 'Spectral', serif;
            font-weight: 500;
            line-height: 1.3;
            color: rgb(var(--ink));
            letter-spacing: -0.005em;
            text-wrap: pretty;
            margin-bottom: 8px;
          }
        `}</style>
      </div>
    </div>
  );
}

function userColor(id: string): string {
  const colors = ['#5B37C4','#c84b31','#2b8a6e','#b07d2a','#2a6ab0','#8b3a8b'];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h) + id.charCodeAt(i);
  return colors[Math.abs(h) % colors.length]!;
}
