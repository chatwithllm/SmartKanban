import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { motion, useReducedMotion } from 'framer-motion';
import type { Card, User } from '../types.ts';
import { getCachedLatest } from '../hooks/useInsights.ts';

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

// Premium: single neutral tag chip (no rainbow)
const NEUTRAL_TAG = { bg: 'rgb(var(--ceramic))', fg: 'rgb(var(--ink-2))' };

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
  const reduce = useReducedMotion();

  const accent = STATUS_ACCENT[card.status] ?? 'backlog';
  const due = formatDue(card.due_date);
  const assignees = card.assignees
    .map(id => users.find(u => u.id === id))
    .filter((u): u is NonNullable<typeof u> => !!u);
  const shares = card.shares
    .map(id => users.find(u => u.id === id))
    .filter((u): u is NonNullable<typeof u> => !!u);
  const insightLatest = getCachedLatest(card.id);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
    >
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={reduce ? undefined : { y: -2 }}
        whileTap={reduce ? undefined : { scale: 0.99 }}
        transition={{ type: 'spring', stiffness: 380, damping: 28, mass: 0.5 }}
        className="note-wrap"
        style={{ '--accent-color': `var(--pin-${accent})` } as React.CSSProperties}
        onClick={onClick}
      >
        {/* Card body */}
        <div className="note" style={{ opacity: isDragging || dragging ? 0.4 : 1, position: 'relative' }}>{/* status accent bar */}
          <span aria-hidden className="note-accent" style={{ background: `rgb(var(--pin-${accent}))` }} />
          {/* status-tinted gradient bloom — subtle premium tone */}
          <span aria-hidden className="note-bloom" style={{
            background: `linear-gradient(135deg, rgb(var(--pin-${accent}) / 0.07) 0%, rgb(var(--pin-${accent}) / 0.02) 32%, transparent 65%)`,
          }} />
          {/* Source row */}
          {(card.source === 'telegram' || card.ai_summarized || card.needs_review || insightLatest?.status === 'pending' || insightLatest?.status === 'ok') && (
            <div className="note-source">
              {card.source === 'telegram' && <span>⟰ telegram</span>}
              {card.ai_summarized && <span style={{ color: 'rgb(var(--violet))' }}> · ✦ ai</span>}
              {card.needs_review && <span style={{ color: 'rgb(var(--danger))' }}> · needs review</span>}
              {insightLatest?.status === 'pending' && (
                <span className="text-1 animate-pulse" title="Researching…" aria-label="Researching"> · 🤔</span>
              )}
              {insightLatest?.status === 'ok' && (
                <span className="text-1" title="AI Insights ready" aria-label="AI Insights ready"> · ✨</span>
              )}
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
              marginBottom: insightLatest?.status === 'ok' && insightLatest.summary ? 4 : 10,
              lineHeight: 1.45,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}>
              {card.description}
            </div>
          )}

          {/* AI insight summary snippet */}
          {!compact && insightLatest?.status === 'ok' && insightLatest.summary && (
            <p className="mt-1 text-1 text-ink-soft tracking-tight2 line-clamp-1" style={{ marginBottom: 10 }}>
              ✨ {insightLatest.summary}
            </p>
          )}

          {/* Tags — neutral chip */}
          {card.tags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
              {card.tags.map(t => (
                <span
                  key={t}
                  style={{
                    display: 'inline-flex', alignItems: 'center',
                    fontSize: 11, fontWeight: 500, lineHeight: 1,
                    padding: '3px 8px', borderRadius: 4,
                    background: NEUTRAL_TAG.bg,
                    color: NEUTRAL_TAG.fg,
                    letterSpacing: '-0.005em',
                  }}
                >
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
              {due && (() => {
                const styles = {
                  overdue: { fg: 'rgb(var(--danger))', dot: 'rgb(var(--danger))', weight: 600 },
                  today:   { fg: 'rgb(var(--ink))',     dot: 'rgb(var(--violet))', weight: 600 },
                  soon:    { fg: 'rgb(var(--ink-2))',   dot: 'rgb(var(--gold))',   weight: 500 },
                  future:  { fg: 'rgb(var(--ink-3))',   dot: 'rgb(var(--ink-3))',  weight: 500 },
                } as const;
                const s = styles[due.tone];
                return (
                  <span
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      color: s.fg,
                      fontWeight: s.weight, fontSize: 11,
                    }}
                  >
                    <span aria-hidden style={{
                      width: 6, height: 6, borderRadius: 9999,
                      background: s.dot,
                      display: 'inline-block',
                    }} />
                    {due.label}
                  </span>
                );
              })()}
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

            {/* Assignee + share initials */}
            <div style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
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
              {shares.length > 0 && (
                <div style={{ display: 'inline-flex' }}>
                  {shares.slice(0, 3).map((u, i) => (
                    <span key={u.id} style={{
                      width: 22, height: 22, borderRadius: 999,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 600, color: 'white',
                      background: 'rgb(var(--violet))',
                      border: '2px solid rgb(var(--surface))',
                      marginLeft: i > 0 ? -6 : 0,
                    }} title={`Shared with ${u.name}`}>
                      {u.short_name.charAt(0).toUpperCase()}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <style>{`
          .note-wrap {
            position: relative;
            cursor: pointer;
          }
          .note {
            position: relative;
            background: rgb(var(--surface));
            border: 1px solid rgb(var(--hairline) / 0.06);
            border-radius: 10px;
            padding: 14px 14px 12px;
            box-shadow:
              0 1px 0 rgb(var(--hairline) / 0.04),
              0 1px 2px rgb(var(--hairline) / 0.06),
              0 6px 16px rgb(var(--hairline) / 0.04);
            transition: box-shadow 200ms ease, border-color 200ms ease;
            overflow: hidden;
          }
          .note-wrap:hover .note {
            border-color: rgb(var(--accent-color) / 0.22);
            box-shadow:
              0 0 0 1px rgb(var(--accent-color) / 0.10),
              0 1px 0 rgb(var(--hairline) / 0.05),
              0 4px 10px rgb(var(--hairline) / 0.08),
              0 14px 32px rgb(var(--accent-color) / 0.12);
          }
          .note-wrap:hover .note-bloom { opacity: 1.15; }
          [data-theme="dark"] .note {
            background: rgb(var(--surface));
            border-color: rgb(var(--hairline) / 0.12);
            box-shadow:
              0 1px 2px rgb(0 0 0 / 0.4),
              0 6px 16px rgb(0 0 0 / 0.25);
          }
          [data-theme="dark"] .note-wrap:hover .note {
            border-color: rgb(var(--accent-color) / 0.45);
            box-shadow:
              0 0 0 1px rgb(var(--accent-color) / 0.20),
              0 4px 14px rgb(0 0 0 / 0.5),
              0 18px 36px rgb(var(--accent-color) / 0.18);
          }
          .note-accent {
            position: absolute;
            left: 0; top: 0; bottom: 0;
            width: 3px;
            opacity: 0.85;
            z-index: 1;
          }
          .note-bloom {
            position: absolute;
            inset: 0;
            pointer-events: none;
            opacity: 1;
            transition: opacity 220ms ease;
            border-radius: inherit;
          }
          .note > *:not(.note-accent):not(.note-bloom) {
            position: relative;
            z-index: 1;
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
      </motion.div>
    </div>
  );
}

function userColor(id: string): string {
  const colors = ['#5B37C4','#c84b31','#2b8a6e','#b07d2a','#2a6ab0','#8b3a8b'];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h) + id.charCodeAt(i);
  return colors[Math.abs(h) % colors.length]!;
}
