import { useEffect, useState } from 'react';
import { api } from './api.ts';
import type { Card, Scope, Status, User } from './types.ts';
import { STATUSES, STATUS_LABELS } from './types.ts';
import { connectWS } from './ws.ts';
import { useToast } from './hooks/useToast.ts';
import { useTemplates, applyTemplateEvent } from './hooks/useTemplates.ts';
import { applyKnowledgeEvent } from './hooks/useKnowledge.ts';
import { useLongPress } from './hooks/useLongPress.ts';
import { useInstallPrompt } from './hooks/useInstallPrompt.ts';
import { MobileCardActions } from './components/MobileCardActions.tsx';
import { KnowledgeView } from './KnowledgeView.tsx';
import { ActivityTicker } from './components/ActivityTicker.tsx';
import { ArchiveDialog } from './components/ArchiveDialog.tsx';
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
  const [draft, setDraft] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [installDismissed, setInstallDismissed] = useState(
    () => typeof localStorage !== 'undefined' && !!localStorage.getItem('install-dismissed'),
  );
  const { addToast } = useToast();
  const { templates } = useTemplates();
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

  const submitCreate = async () => {
    const t = draft.trim();
    setDraft('');
    if (!t) return;
    if (t.startsWith('/') && !/\s/.test(t)) {
      const name = t.slice(1);
      const tpl = templates.find((tt) => tt.name.toLowerCase() === name.toLowerCase());
      if (tpl) {
        try { await api.instantiateTemplate(tpl.id, { status_override: activeStatus }); }
        catch (e) { addToast(`Template failed: ${e instanceof Error ? e.message : 'error'}`, 'error'); }
        return;
      }
    }
    try {
      const created = await api.createCard({ title: t, status: activeStatus });
      setCards((prev) => prev.some((c) => c.id === created.id) ? prev : [...prev, created]);
      addToast('Card created', 'success');
    } catch (e) {
      addToast(`Failed: ${e instanceof Error ? e.message : 'error'}`, 'error');
    }
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
          {/* ── Lane-colored header ── */}
          <header
            className="sticky top-0 z-10"
            style={{ background: LANE_BG[activeStatus], transition: 'background 350ms ease' }}
          >
            {/* Top bar: date + scope + avatar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px 0' }}>
              <span style={{
                fontSize: 11, fontWeight: 600, letterSpacing: '0.06em',
                color: 'rgba(255,255,255,0.7)', fontFamily: 'JetBrains Mono, monospace',
              }}>
                {formatDate()}
              </span>
              {weather && (
                <span style={{
                  fontSize: 12, fontWeight: 500,
                  color: 'rgba(255,255,255,0.85)',
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                  background: 'rgba(0,0,0,0.15)', borderRadius: 999,
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
                  background: 'rgba(0,0,0,0.20)', color: 'rgba(255,255,255,0.88)',
                  border: 'none', borderRadius: 8, padding: '4px 8px',
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
                      width: 34, height: 34, borderRadius: 999,
                      background: userColor(me.id),
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, fontWeight: 700, color: 'white',
                      border: '2px solid rgba(255,255,255,0.35)',
                      cursor: 'pointer',
                    }}
                  >
                    {(me.short_name || me.name).charAt(0).toUpperCase()}
                  </button>
                  {profileOpen && (
                    <div
                      style={{
                        position: 'absolute', top: 42, right: 0, zIndex: 100,
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

            {/* Large status title */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '6px 16px 12px' }}>
              <h1 style={{
                fontSize: 42, fontWeight: 700, lineHeight: 1.05,
                color: 'rgba(255,255,255,0.96)',
                fontFamily: 'Spectral, serif', letterSpacing: '-0.02em',
              }}>
                {STATUS_LABELS[activeStatus]}
              </h1>
              <span style={{
                fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.55)',
                fontFamily: 'JetBrains Mono, monospace',
              }}>
                {counts[activeStatus]}
              </span>
            </div>

            {/* Status tabs */}
            <div style={{
              display: 'flex', gap: 8, overflowX: 'auto',
              padding: '0 16px 14px', scrollbarWidth: 'none',
            }}>
              {STATUSES.map((s) => {
                const active = activeStatus === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setActiveStatus(s)}
                    style={{
                      flexShrink: 0, padding: '6px 14px', borderRadius: 999,
                      background: active ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.18)',
                      color: active ? 'rgba(0,0,0,0.78)' : 'rgba(255,255,255,0.82)',
                      fontWeight: active ? 600 : 400, fontSize: 13,
                      border: 'none', cursor: 'pointer',
                      transition: 'background 150ms ease, color 150ms ease',
                    }}
                  >
                    {STATUS_LABELS[s]}
                  </button>
                );
              })}
            </div>
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

          {/* ── Card list ── */}
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: '16px 12px', listStyle: 'none', margin: 0 }}>
            {filtered.length === 0 && (
              <li style={{
                padding: '40px 0', textAlign: 'center',
                fontSize: 14, color: 'rgba(255,255,255,0.7)',
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
          position: 'fixed', left: 0, right: 0,
          bottom: 'calc(56px + env(safe-area-inset-bottom))',
          zIndex: 30,
          background: 'rgb(var(--surface))',
          borderTop: '1px solid rgb(var(--hairline) / 0.08)',
          padding: '8px 12px',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 18, opacity: 0.45, flexShrink: 0 }}>🤖</span>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitCreate(); }}
            placeholder="Capture as card…"
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              fontSize: 14, color: 'rgb(var(--ink))', fontFamily: 'Inter, sans-serif',
            }}
          />
          <button
            aria-label="Voice input"
            style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', opacity: 0.5, padding: '0 2px', flexShrink: 0 }}
          >
            🎙️
          </button>
          <button
            onClick={submitCreate}
            style={{
              flexShrink: 0, width: 36, height: 36, borderRadius: 999,
              background: 'rgb(var(--violet))', color: 'white',
              border: 'none', cursor: 'pointer', fontSize: 16,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            →
          </button>
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
  card, users, accentColor, onLongPress,
}: {
  card: Card; users: User[]; accentColor: string; onLongPress: () => void;
}) {
  const lp = useLongPress(onLongPress, 500);
  const assignees = card.assignees
    .map((id) => users.find((u) => u.id === id))
    .filter((u): u is NonNullable<typeof u> => !!u);

  const handleClick = () => {
    if (lp.didLongPress()) return;
    location.assign(`/m/card/${card.id}`);
  };

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
      {/* Drop-shadow wrapper */}
      <div style={{
        position: 'relative',
        filter: 'drop-shadow(0 6px 14px rgb(0 0 0 / 0.10)) drop-shadow(0 14px 24px rgb(0 0 0 / 0.06))',
      }}>
        {/* Pin */}
        <span style={{ position: 'absolute', top: -10, left: 16, zIndex: 3 }}>
          <span style={{
            display: 'block', width: 20, height: 20, borderRadius: '50%',
            background: accentColor, margin: '0 auto',
            boxShadow: 'inset -3px -4px 0 rgba(0,0,0,0.18), inset 3px 3px 0 rgba(255,255,255,0.28), 0 2px 4px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,0,0,0.18)',
          }} />
          <span style={{ display: 'block', width: 3, height: 5, background: 'rgb(60,50,40)', margin: '-3px auto 0', borderRadius: '0 0 2px 2px' }} />
        </span>

        {/* Fold corner */}
        <div style={{
          position: 'absolute', right: 0, bottom: 0, width: 26, height: 26,
          background: 'rgb(var(--paper-fold))',
          clipPath: 'polygon(100% 0, 100% 100%, 0 100%)',
          zIndex: 1,
        }} />

        {/* Card body */}
        <div style={{
          background: 'rgb(var(--paper))',
          clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 22px), calc(100% - 22px) 100%, 0 100%)',
          padding: '22px 14px 14px',
        }}>
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
            fontSize: 11.5, color: 'rgb(var(--ink-3))', paddingRight: 22,
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
                      border: '2px solid rgb(var(--paper))',
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
      </div>
    </li>
  );
}
