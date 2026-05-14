import { useEffect, useRef, useState } from 'react';
import { api } from './api.ts';
import type { Card, Scope, Status, User } from './types.ts';
import { STATUSES, STATUS_LABELS } from './types.ts';
import { connectWS } from './ws.ts';
import { useToast } from './hooks/useToast.ts';
import { applyTemplateEvent } from './hooks/useTemplates.ts';
import { CaptureBar } from './components/CaptureBar.tsx';
import { applyKnowledgeEvent } from './hooks/useKnowledge.ts';
import { applyInsightEvent } from './hooks/useInsights.ts';
import { applyCardLinkEvent } from './hooks/useCardLinks.ts';
import { useLongPress } from './hooks/useLongPress.ts';
import { useInstallPrompt } from './hooks/useInstallPrompt.ts';
import { MobileCardActions } from './components/MobileCardActions.tsx';
import { KnowledgeView } from './KnowledgeView.tsx';
import { ActivityTicker } from './components/ActivityTicker.tsx';
import { ArchiveDialog } from './components/ArchiveDialog.tsx';
import { Board } from './components/Board.tsx';
import { useWeather, wmoEmoji } from './hooks/useWeather.ts';

type Tab = 'board' | 'knowledge' | 'archive';

const SCOPES: { value: Scope; label: string }[] = [
  { value: 'personal', label: 'My board' },
  { value: 'inbox', label: 'Family Inbox' },
  { value: 'all', label: 'Everything' },
  { value: 'shared', label: 'Shared with me' },
];

const LANE_BG: Record<Status, string> = {
  backlog:     'rgb(var(--lane-backlog))',
  today:       'rgb(var(--lane-today))',
  in_progress: 'rgb(var(--lane-doing))',
  done:        'rgb(var(--lane-done))',
};

// Matches Column.tsx — used for the status dot before the lane title.
const LANE_ACCENT: Record<Status, string> = {
  backlog:     'backlog',
  today:       'today',
  in_progress: 'doing',
  done:        'done',
};

const EMPTY_MSG: Record<Status, string> = {
  backlog:     'Empty backlog.',
  today:       'Nothing planned for today.',
  in_progress: 'Quiet here.',
  done:        'Nothing finished yet.',
};

function formatDate(): string {
  const d = new Date();
  const day = d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
  const mon = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
  return `${day} · ${mon} ${d.getDate()}`;
}

function userColor(id: string): string {
  const colors = ['#5B37C4', '#c84b31', '#2b8a6e', '#b07d2a', '#2a6ab0', '#8b3a8b'];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h) + id.charCodeAt(i);
  return colors[Math.abs(h) % colors.length]!;
}

function relTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  return Math.floor(diff / 86400) + 'd ago';
}

export function MobileShell({ meId }: { meId: string }) {
  const [tab, setTab] = useState<Tab>('board');
  const [scope, setScope] = useState<Scope>('personal');
  const [activeStatus, setActiveStatus] = useState<Status>('today');
  const [cards, setCards] = useState<Card[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [actionsCard, setActionsCard] = useState<Card | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  // Lane picker is view-only now; the target picker lives inside CaptureBar.
  const [lanePicker, setLanePicker] = useState<'view' | null>(null);
  const swipeStartRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const [installDismissed, setInstallDismissed] = useState(
    () => typeof localStorage !== 'undefined' && !!localStorage.getItem('install-dismissed'),
  );
  const { addToast } = useToast();
  const { canInstall, install } = useInstallPrompt();

  const me = users.find((u) => u.id === meId);
  const { data: weather } = useWeather();
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    if (!profileOpen) return;
    const close = () => setProfileOpen(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [profileOpen]);

  useEffect(() => {
    api.listCards(scope).then(setCards).catch((e) => addToast(`Load failed: ${e}`, 'error'));
  }, [scope]);

  useEffect(() => {
    api.users().then(setUsers).catch(() => {});
  }, []);

  useEffect(() => {
    const disconnect = connectWS((ev) => {
      if (ev.type === 'template.created' || ev.type === 'template.updated' || ev.type === 'template.deleted') {
        applyTemplateEvent(ev);
        return;
      }
      if (
        ev.type === 'knowledge.created' || ev.type === 'knowledge.updated' ||
        ev.type === 'knowledge.deleted' || ev.type === 'knowledge.link.created' ||
        ev.type === 'knowledge.link.deleted'
      ) {
        applyKnowledgeEvent(ev, meId);
        return;
      }
      if (
        ev.type === 'insight.queued' ||
        ev.type === 'insight.updated' ||
        ev.type === 'insight.failed'
      ) {
        applyInsightEvent(ev);
        return;
      }
      if (ev.type === 'card.link.created' || ev.type === 'card.link.deleted') {
        applyCardLinkEvent(ev);
        return;
      }
      if (ev.type === 'card.created' || ev.type === 'card.updated') {
        const incoming = ev.card;
        if (incoming.archived) {
          setCards((prev) => prev.filter((c) => c.id !== incoming.id));
          return;
        }
        const isMine = incoming.created_by === meId || incoming.assignees.includes(meId) || incoming.shares.includes(meId);
        const isInbox = incoming.assignees.length === 0;
        const isSharedWithMe = incoming.shares.includes(meId) && incoming.created_by !== meId;
        const visible = scope === 'inbox' ? isInbox : scope === 'personal' ? isMine : scope === 'shared' ? isSharedWithMe : isMine || isInbox;
        setCards((prev) => {
          const without = prev.filter((c) => c.id !== incoming.id);
          return visible ? [...without, incoming] : without;
        });
      } else if (ev.type === 'card.deleted') {
        setCards((prev) => prev.filter((c) => c.id !== ev.id));
      }
    });
    return disconnect;
  }, [scope, meId]);

  const visible = cards.filter((c) => !c.archived);
  const counts: Record<Status, number> = { backlog: 0, today: 0, in_progress: 0, done: 0 };
  for (const c of visible) counts[c.status]++;
  const filtered = visible
    .filter((c) => c.status === activeStatus)
    .filter((c) =>
      searchQuery
        ? (c.title + ' ' + (c.description ?? '') + ' ' + c.tags.join(' ')).toLowerCase().includes(searchQuery.toLowerCase())
        : true,
    )
    .sort((a, b) => a.position - b.position);


  // Lateral swipe on the card list cycles through lanes. Horizontal-dominant
  // gestures only; vertical scroll passes through. ~30px threshold avoids
  // accidental swipes on long-press flows.
  const onSwipeStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    swipeStartRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  };
  const onSwipeEnd = (e: React.TouchEvent) => {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start) return;
    const end = e.changedTouches[0];
    if (!end) return;
    const dx = end.clientX - start.x;
    const dy = end.clientY - start.y;
    const dt = Date.now() - start.t;
    if (dt > 600) return;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const idx = STATUSES.indexOf(activeStatus);
    const next = dx < 0 ? STATUSES[idx + 1] : STATUSES[idx - 1];
    if (next) setActiveStatus(next);
  };

  const handleMove = async (status: Status) => {
    if (!actionsCard) return;
    const card = actionsCard;
    setActionsCard(null);
    try {
      const updated = await api.updateCard(card.id, { status });
      setCards((prev) => prev.map((c) => (c.id === card.id ? updated : c)));
      addToast(`Moved to ${STATUS_LABELS[status]}`, 'success');
    } catch (e) {
      addToast(`Move failed: ${e}`, 'error');
    }
  };

  const handleArchive = async () => {
    if (!actionsCard) return;
    const card = actionsCard;
    if (!confirm(`Archive "${card.title}"?`)) { setActionsCard(null); return; }
    setActionsCard(null);
    try {
      await api.deleteCard(card.id);
      setCards((prev) => prev.filter((c) => c.id !== card.id));
      addToast('Archived', 'success');
    } catch (e) {
      addToast(`Archive failed: ${e}`, 'error');
    }
  };

  const onCardRestored = (card: Card) => {
    setCards((prev) => (prev.some((c) => c.id === card.id) ? prev : [...prev, card]));
    addToast(`Restored "${card.title}"`, 'success');
  };

  const NAV_TABS = [
    { id: 'board' as Tab, label: 'Board', icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="10" rx="1"/><rect x="14" y="17" width="7" height="4" rx="1"/>
      </svg>
    )},
    { id: 'knowledge' as Tab, label: 'Knowledge', icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
      </svg>
    )},
    { id: 'archive' as Tab, label: 'Archive', icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5" rx="1"/><line x1="10" y1="12" x2="14" y2="12"/>
      </svg>
    )},
  ];

  return (
    <div style={{ background: 'rgb(var(--canvas))', minHeight: '100vh', paddingBottom: 'calc(56px + 60px + env(safe-area-inset-bottom))' }}>

      {tab === 'board' && (
        <>
          {/* ── Header: dark canvas like desktop, no per-lane color flood ── */}
          <header
            className="sticky top-0 z-10"
            style={{ background: 'rgb(var(--canvas))', transition: 'background 200ms ease' }}
          >
            {/* Top bar: date + weather + scope + avatar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px 0' }}>
              <span style={{
                fontSize: 11, fontWeight: 600, letterSpacing: '0.06em',
                color: 'rgb(var(--ink-3))', fontFamily: 'JetBrains Mono, monospace',
              }}>
                {formatDate()}
              </span>
              {weather && (
                <span style={{
                  fontSize: 12, fontWeight: 500,
                  color: 'rgb(var(--ink-2))',
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                  background: 'rgb(var(--hairline) / 0.06)', borderRadius: 999,
                  padding: '2px 8px',
                }}>
                  {wmoEmoji(weather.current.code)} {Math.round(weather.current.temp)}°
                </span>
              )}
              <div style={{ flex: 1 }} />
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as Scope)}
                style={{
                  background: 'rgb(var(--hairline) / 0.06)', color: 'rgb(var(--ink-2))',
                  border: '1px solid rgb(var(--hairline) / 0.10)', borderRadius: 8, padding: '4px 8px',
                  fontSize: 12, fontWeight: 500, outline: 'none', cursor: 'pointer',
                }}
              >
                {SCOPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              {me && (
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); setProfileOpen((v) => !v); }}
                    style={{
                      width: 32, height: 32, borderRadius: 999,
                      background: userColor(me.id),
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, fontWeight: 700, color: 'white',
                      border: '1px solid rgb(var(--hairline) / 0.18)',
                      cursor: 'pointer',
                    }}
                  >
                    {(me.short_name || me.name).charAt(0).toUpperCase()}
                  </button>
                  {profileOpen && (
                    <div
                      style={{
                        position: 'absolute', top: 40, right: 0, zIndex: 100,
                        background: 'rgb(var(--surface))',
                        borderRadius: 12, padding: '6px 0',
                        boxShadow: 'var(--sh-3)',
                        border: '1px solid rgb(var(--hairline) / 0.1)',
                        minWidth: 160,
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div style={{ padding: '8px 14px 6px', borderBottom: '1px solid rgb(var(--hairline) / 0.08)', marginBottom: 4 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'rgb(var(--ink))' }}>{me.name}</div>
                        <div style={{ fontSize: 11, color: 'rgb(var(--ink-3))', marginTop: 1 }}>{me.email}</div>
                      </div>
                      <button
                        onClick={async () => { await api.logout(); location.reload(); }}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left',
                          padding: '8px 14px', background: 'none', border: 'none',
                          fontSize: 13, color: 'rgb(var(--danger))', cursor: 'pointer',
                          fontFamily: 'Inter, sans-serif',
                        }}
                      >
                        ↩ Sign out
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Lane heading — tap to switch lanes via bottom-sheet picker */}
            <button
              type="button"
              onClick={() => setLanePicker('view')}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 16px 12px',
                background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left',
              }}
            >
              <span aria-hidden style={{
                display: 'inline-block', width: 9, height: 9, borderRadius: 999,
                background: `rgb(var(--pin-${LANE_ACCENT[activeStatus]}))`,
                boxShadow: `0 0 0 3px rgb(var(--pin-${LANE_ACCENT[activeStatus]}) / 0.15)`,
              }} />
              <h1 style={{
                fontSize: 22, fontWeight: 600, lineHeight: 1.1,
                color: 'rgb(var(--ink))', margin: 0,
                fontFamily: 'Spectral, serif', letterSpacing: '-0.012em',
              }}>
                {STATUS_LABELS[activeStatus]}
              </h1>
              <span style={{
                fontSize: 11, fontWeight: 500,
                color: 'rgb(var(--ink-3))',
                background: 'rgb(var(--hairline) / 0.05)',
                border: '1px solid rgb(var(--hairline) / 0.08)',
                padding: '2px 7px', borderRadius: 999,
                fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.04em',
              }}>
                {String(counts[activeStatus]).padStart(2, '0')}
              </span>
              <span aria-hidden style={{ fontSize: 12, color: 'rgb(var(--ink-3))' }}>▾</span>
            </button>
          </header>

          {/* ── Activity ticker ── */}
          <ActivityTicker cards={visible} onCardClick={(c) => location.assign(`/m/card/${c.id}`)} />

          {/* ── Search bar (always visible, subtle) ── */}
          <div style={{ padding: '10px 12px 0', background: 'rgb(var(--canvas))' }}>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search cards…"
              style={{
                width: '100%', background: 'rgb(var(--card))',
                color: 'rgb(var(--ink))',
                border: '1px solid rgb(var(--hairline) / 0.10)',
                borderRadius: 999, padding: '8px 14px',
                fontSize: 13, outline: 'none', fontFamily: 'Inter, sans-serif',
              }}
            />
          </div>

          {/* ── Card list (swipe left/right to cycle lanes) ── */}
          <ul
            onTouchStart={onSwipeStart}
            onTouchEnd={onSwipeEnd}
            style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: '16px 12px', listStyle: 'none', margin: 0 }}
          >
            {filtered.length === 0 && (
              <li style={{
                padding: '40px 0', textAlign: 'center',
                fontSize: 14, color: 'rgb(var(--ink-3))',
                fontStyle: 'italic', fontFamily: 'Spectral, serif',
              }}>
                {EMPTY_MSG[activeStatus]}
              </li>
            )}
            {filtered.map((c) => (
              <MobileNoteCard
                key={c.id}
                card={c}
                users={users}
                accentColor={LANE_BG[c.status]}
                onLongPress={() => setActionsCard(c)}
              />
            ))}
          </ul>

          {actionsCard && (
            <MobileCardActions
              card={actionsCard}
              onClose={() => setActionsCard(null)}
              onMove={handleMove}
              onArchive={handleArchive}
            />
          )}

          {/* ── Install prompt ── */}
          {canInstall && !installDismissed && (
            <div style={{
              position: 'fixed', left: 12, right: 12,
              bottom: 'calc(56px + 60px + 12px + env(safe-area-inset-bottom))',
              zIndex: 30,
              background: 'rgb(var(--green-house))',
              color: 'white', borderRadius: 14, padding: '14px 16px',
              display: 'flex', alignItems: 'center', gap: 12,
              boxShadow: 'var(--sh-3)',
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Install SmartKanban</div>
                <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>Add to home screen for full-screen access</div>
              </div>
              <button onClick={async () => { await install(); setInstallDismissed(true); }}
                style={{ background: 'white', color: 'rgb(var(--green-house))', border: 'none', borderRadius: 999, padding: '6px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                Install
              </button>
              <button onClick={() => { localStorage.setItem('install-dismissed', '1'); setInstallDismissed(true); }}
                style={{ background: 'rgba(255,255,255,0.15)', color: 'white', border: 'none', borderRadius: 999, padding: '6px 14px', fontSize: 13, cursor: 'pointer' }}>
                Dismiss
              </button>
            </div>
          )}
        </>
      )}

      {tab === 'knowledge' && <KnowledgeView />}

      {tab === 'archive' && (
        <ArchiveDialog onClose={() => setTab('board')} onRestore={onCardRestored} />
      )}

      {/* ── Capture bar (above nav, board only) ── */}
      {tab === 'board' && (
        <div style={{
          position: 'fixed', left: 8, right: 8,
          bottom: 'calc(56px + env(safe-area-inset-bottom) + 8px)',
          zIndex: 30,
        }}>
          <CaptureBar
            initialStatus={activeStatus}
            counts={counts}
            onCreate={async (title, status) => {
              try {
                const created = await api.createCard({ title, status });
                setCards((prev) => prev.some((c) => c.id === created.id) ? prev : [...prev, created]);
                addToast(`Created in ${STATUS_LABELS[status]}`, 'success');
              } catch (e) {
                addToast(`Failed: ${e instanceof Error ? e.message : 'error'}`, 'error');
              }
            }}
            onCreateFromImage={async (file, status) => {
              try {
                const created = await api.createCardFromImage(file, status);
                setCards((prev) => prev.some((c) => c.id === created.id) ? prev : [...prev, created]);
                addToast(`Photo card in ${STATUS_LABELS[status]}`, 'success');
              } catch (err) {
                addToast(`Photo failed: ${err instanceof Error ? err.message : 'error'}`, 'error');
              }
            }}
            onInstantiateTemplate={async (id, status) => {
              try {
                await api.instantiateTemplate(id, { status_override: status });
                addToast(`Template added to ${STATUS_LABELS[status]}`, 'success');
              } catch (err) {
                addToast(`Template failed: ${err instanceof Error ? err.message : 'error'}`, 'error');
              }
            }}
            onVoiceTodo={() => addToast('Voice capture coming soon')}
          />
        </div>
      )}

      {/* ── View-switch lane picker (tap big title at top) ── */}
      {lanePicker === 'view' && (
        <div
          onClick={() => setLanePicker(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 70, background: 'rgb(0 0 0 / 0.4)',
            display: 'flex', alignItems: 'flex-end',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'rgb(var(--surface))', width: '100%',
              borderTopLeftRadius: 18, borderTopRightRadius: 18,
              padding: '18px 12px calc(20px + env(safe-area-inset-bottom))',
              boxShadow: 'var(--sh-3)',
            }}
          >
            <div style={{ padding: '0 6px 12px', fontSize: 12, fontWeight: 600, color: 'rgb(var(--ink-3))', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Show lane…
            </div>
            {STATUSES.map((s) => {
              const active = activeStatus === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setActiveStatus(s); setLanePicker(null); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
                    padding: '14px 14px', borderRadius: 12, margin: '2px 0',
                    background: active ? 'rgb(var(--hairline) / 0.06)' : 'none',
                    border: '1px solid ' + (active ? 'rgb(var(--hairline) / 0.12)' : 'transparent'),
                    cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                  }}
                >
                  <span style={{
                    display: 'inline-block', width: 14, height: 14, borderRadius: 999,
                    background: `rgb(var(--pin-${LANE_ACCENT[s]}))`,
                  }} />
                  <span style={{ flex: 1, fontSize: 15, fontWeight: active ? 600 : 500, color: 'rgb(var(--ink))' }}>
                    {STATUS_LABELS[s]}
                  </span>
                  <span style={{ fontSize: 13, color: 'rgb(var(--ink-3))', fontFamily: 'JetBrains Mono, monospace' }}>
                    {counts[s]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Bottom nav ── */}
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 40,
        background: 'rgb(var(--surface))',
        borderTop: '1px solid rgb(var(--hairline) / 0.08)',
        height: 'calc(56px + env(safe-area-inset-bottom))',
        paddingBottom: 'env(safe-area-inset-bottom)',
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
      }}>
        {NAV_TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                background: 'none', border: 'none', cursor: 'pointer',
                color: active ? 'rgb(var(--violet))' : 'rgb(var(--ink-3))',
                position: 'relative',
              }}
            >
              {t.icon}
              <span style={{ fontSize: 11, fontWeight: active ? 600 : 400, letterSpacing: '-0.01em' }}>
                {t.label}
              </span>
              {active && (
                <span style={{
                  position: 'absolute', bottom: 6, width: 4, height: 4, borderRadius: 999,
                  background: 'rgb(var(--violet))',
                }} aria-hidden />
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function MobileNoteCard({
  card, users, onLongPress,
}: {
  card: Card; users: User[]; accentColor?: string; onLongPress: () => void;
}) {
  const lp = useLongPress(onLongPress, 500);
  const assignees = card.assignees
    .map((id) => users.find((u) => u.id === id))
    .filter((u): u is NonNullable<typeof u> => !!u);

  const handleClick = () => {
    if (lp.didLongPress()) return;
    location.assign(`/m/card/${card.id}`);
  };

  // Status accent (dot + bloom) — same palette as desktop Column.tsx.
  const accent = LANE_ACCENT[card.status] ?? 'backlog';

  return (
    <li
      onClick={handleClick}
      onTouchStart={lp.onTouchStart}
      onTouchEnd={lp.onTouchEnd}
      onTouchMove={lp.onTouchMove}
      onTouchCancel={lp.onTouchCancel}
      onContextMenu={lp.onContextMenu}
      style={{ listStyle: 'none', position: 'relative', cursor: 'pointer' }}
    >
      {/* Desktop-style flat card: dark surface, hairline border, status dot */}
      <div style={{
        position: 'relative',
        background: 'rgb(var(--card))',
        border: '1px solid rgb(var(--hairline) / 0.08)',
        borderRadius: 12,
        padding: '14px 14px 12px 18px',
        boxShadow: 'var(--sh-1)',
        '--pin-color': `var(--pin-${accent})`,
      } as React.CSSProperties}>
        {/* Status pill on the left edge — like desktop column accent */}
        <span style={{
          position: 'absolute', top: 12, bottom: 12, left: 6,
          width: 3, borderRadius: 2,
          background: `rgb(var(--pin-${accent}))`,
          opacity: 0.7,
        }} />
          {/* Source badge */}
          {(card.source === 'telegram' || card.ai_summarized || card.needs_review) && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontFamily: 'JetBrains Mono, monospace', fontSize: 10,
              color: 'rgb(var(--ink-3))', marginBottom: 6, letterSpacing: '0.02em',
            }}>
              {card.source === 'telegram' && <span>⟰ telegram</span>}
              {card.ai_summarized && <span style={{ color: 'rgb(var(--violet))' }}> · ✦ ai</span>}
              {card.needs_review && <span style={{ color: 'rgb(var(--danger))' }}> · needs review</span>}
            </div>
          )}

          {/* Title */}
          <div style={{
            fontFamily: 'Spectral, serif', fontWeight: 500, fontSize: 15,
            lineHeight: 1.3, color: 'rgb(var(--ink))', letterSpacing: '-0.005em', marginBottom: 8,
          }}>
            {card.title}
          </div>

          {/* Description */}
          {card.description && (
            <div style={{
              fontSize: 12.5, color: 'rgb(var(--ink-2))', marginBottom: 10, lineHeight: 1.45,
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>
              {card.description}
            </div>
          )}

          {/* Tags */}
          {card.tags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
              {card.tags.map((t) => (
                <span key={t} style={{
                  fontSize: 11, fontWeight: 500, padding: '4px 8px', borderRadius: 999,
                  background: 'rgb(var(--surface-2))', color: 'rgb(var(--ink-2))',
                  border: '1px solid rgb(var(--hairline) / 0.08)',
                }}>
                  {t}
                </span>
              ))}
            </div>
          )}

          {/* Footer */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            fontSize: 11.5, color: 'rgb(var(--ink-3))',
          }}>
            <span>{relTime(card.updated_at)}</span>
            {assignees.length > 0 && (
              <div style={{ display: 'inline-flex' }}>
                {assignees.slice(0, 3).map((u, i) => (
                  <span
                    key={u.id}
                    title={u.name}
                    style={{
                      width: 22, height: 22, borderRadius: 999,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 600, color: 'white',
                      background: userColor(u.id),
                      border: '2px solid rgb(var(--card))',
                      marginLeft: i > 0 ? -6 : 0,
                    }}
                  >
                    {u.short_name.charAt(0).toUpperCase()}
                  </span>
                ))}
              </div>
            )}
          </div>
      </div>
    </li>
  );
}
