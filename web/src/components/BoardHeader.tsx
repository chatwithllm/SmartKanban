import { useState, useRef, useEffect } from 'react';
import type { Scope } from '../types.ts';
import { useAuth } from '../auth.tsx';

const SCOPES: Array<{ id: Scope; label: string; description: string }> = [
  { id: 'personal', label: 'My board',     description: 'Cards you created, assigned, or shared with you.' },
  { id: 'inbox',    label: 'Family inbox', description: 'Unassigned cards from the family group.' },
  { id: 'all',      label: 'Everything',   description: 'All cards visible to you.' },
];

type Section = 'board' | 'knowledge' | 'archive';

type Props = {
  scope: Scope;
  onScope: (s: Scope) => void;
  cardCount: number;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onOpenReview: () => void;
  onOpenSettings: () => void;
  section: Section;
  onSection: (s: Section) => void;
  notificationBell?: React.ReactNode;
  scopeCounts?: Record<Scope, number>;
};

export function BoardHeader({
  scope, onScope, cardCount, searchQuery, onSearchChange,
  onOpenReview, onOpenSettings, section, onSection,
  notificationBell, scopeCounts,
}: Props) {
  const { user, logout } = useAuth();
  const [scopeOpen, setScopeOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const scopeRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (scopeRef.current && !scopeRef.current.contains(e.target as Node)) setScopeOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const activeScope = SCOPES.find(s => s.id === scope)!;

  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 30,
      background: 'rgb(var(--canvas) / 0.85)',
      backdropFilter: 'saturate(140%) blur(10px)',
      WebkitBackdropFilter: 'saturate(140%) blur(10px)',
      borderBottom: '1px solid rgb(var(--hairline) / 0.08)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 20px',
        maxWidth: '100%', minWidth: 0,
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{
            width: 28, height: 28,
            background: 'rgb(var(--violet))',
            borderRadius: 7,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', fontWeight: 700, fontSize: 14,
            fontFamily: 'Spectral, serif',
            letterSpacing: '-0.04em',
          }}>K</div>
          <span style={{ fontFamily: 'Spectral, serif', fontSize: 17, fontWeight: 600, letterSpacing: '-0.015em' }}>
            SmartKanban
          </span>
        </div>

        {/* View tabs */}
        <nav style={{ display: 'flex', gap: 2, marginLeft: 8, flexShrink: 0 }}>
          {(['board', 'knowledge', 'archive'] as Section[]).map(v => (
            <button
              key={v}
              onClick={() => onSection(v)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                height: 26, padding: '0 8px',
                fontSize: 12, fontWeight: section === v ? 600 : 500,
                color: section === v ? 'rgb(var(--ink))' : 'rgb(var(--ink-3))',
                background: section === v ? 'rgb(var(--hairline) / 0.06)' : 'transparent',
                border: '1px solid transparent', borderRadius: 6,
                cursor: 'pointer', letterSpacing: '-0.005em',
              }}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </nav>

        {/* Scope switcher (board only) */}
        {section === 'board' && (
          <div ref={scopeRef} style={{ position: 'relative', flexShrink: 0 }}>
            <button
              onClick={() => setScopeOpen(!scopeOpen)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                justifyContent: 'space-between',
                minWidth: 160, height: 32, padding: '0 10px',
                fontSize: 13, fontWeight: 500,
                border: '1px solid rgb(var(--hairline) / 0.14)',
                borderRadius: 8, background: 'transparent',
                color: 'rgb(var(--ink))', cursor: 'pointer',
              }}
            >
              <span>{activeScope.label}</span>
              <span style={{ fontSize: 10, opacity: 0.6 }}>▾</span>
            </button>
            {scopeOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', left: 0,
                width: 280, padding: 6, zIndex: 20,
                background: 'rgb(var(--surface))',
                borderRadius: 10, boxShadow: 'var(--sh-3)',
                border: '1px solid rgb(var(--hairline) / 0.08)',
                animation: 'fadeIn 240ms ease both',
              }}>
                {SCOPES.map(s => (
                  <button
                    key={s.id}
                    onClick={() => { onScope(s.id); setScopeOpen(false); }}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10,
                      padding: '10px 10px',
                      border: 'none',
                      background: scope === s.id ? 'rgb(var(--violet-tint))' : 'transparent',
                      borderRadius: 8, width: '100%', textAlign: 'left',
                      cursor: 'pointer', color: 'rgb(var(--ink))',
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{s.label}</div>
                      <div style={{ fontSize: 11.5, color: 'rgb(var(--ink-3))', lineHeight: 1.4 }}>{s.description}</div>
                    </div>
                    {scopeCounts && (
                      <span style={{ fontSize: 11, color: 'rgb(var(--ink-3))', fontFamily: 'JetBrains Mono, monospace', marginTop: 1 }}>
                        {scopeCounts[s.id]}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0 }} />

        {/* Search */}
        <div style={{ position: 'relative', flex: '0 1 220px', minWidth: 140 }}>
          <input
            placeholder={section === 'knowledge' ? 'Search knowledge…' : 'Search cards…'}
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            style={{
              height: 34, width: '100%',
              paddingLeft: 32, paddingRight: 36,
              background: 'rgb(var(--surface))',
              border: '1px solid rgb(var(--hairline) / 0.12)',
              borderRadius: 8, fontSize: 13, color: 'rgb(var(--ink))',
              outline: 'none',
            }}
          />
          <span style={{ position: 'absolute', left: 10, top: 10, color: 'rgb(var(--ink-3))', pointerEvents: 'none', fontSize: 14 }}>🔍</span>
          {!searchQuery && (
            <span style={{
              position: 'absolute', right: 8, top: 8,
              fontSize: 10, padding: '1.5px 5px',
              borderRadius: 4, background: 'rgb(var(--hairline) / 0.07)',
              border: '1px solid rgb(var(--hairline) / 0.10)',
              color: 'rgb(var(--ink-2))',
              fontFamily: 'JetBrains Mono, monospace',
            }}>⌘K</span>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
          <button onClick={onOpenReview} title="Weekly review" style={iconBtnStyle}>✦</button>
          {notificationBell}
          <button onClick={onOpenSettings} title="Settings" style={iconBtnStyle}>⚙</button>

          <div style={{ width: 1, height: 22, background: 'rgb(var(--hairline) / 0.10)', margin: '0 4px' }} />

          {/* Profile dropdown */}
          <div ref={profileRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setProfileOpen(!profileOpen)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '0 6px 0 4px', height: 32,
                border: 'none', background: 'transparent', cursor: 'pointer',
                color: 'rgb(var(--ink))', fontSize: 13, fontWeight: 500,
              }}
            >
              <span style={{
                width: 24, height: 24, borderRadius: 999,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 600, color: 'white',
                background: 'rgb(var(--violet))',
              }}>
                {user?.short_name?.charAt(0).toUpperCase()}
              </span>
              {user?.short_name}
              <span style={{ fontSize: 10, opacity: 0.6 }}>▾</span>
            </button>
            {profileOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                width: 200, padding: 6, zIndex: 20,
                background: 'rgb(var(--surface))',
                borderRadius: 10, boxShadow: 'var(--sh-3)',
                border: '1px solid rgb(var(--hairline) / 0.08)',
                animation: 'fadeIn 240ms ease both',
              }}>
                <div style={{ padding: '8px 10px 10px', borderBottom: '1px solid rgb(var(--hairline) / 0.08)' }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{user?.name}</div>
                  <div style={{ fontSize: 11.5, color: 'rgb(var(--ink-3))' }}>{user?.email}</div>
                </div>
                <button onClick={onOpenSettings} style={profileItemStyle}>⚙ Settings</button>
                <div style={{ height: 1, background: 'rgb(var(--hairline) / 0.08)', margin: '4px 0' }} />
                <button onClick={logout} style={{ ...profileItemStyle, color: 'rgb(var(--ink-2))' }}>↩ Sign out</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

const iconBtnStyle: React.CSSProperties = {
  width: 32, height: 32, padding: 0,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  border: '1px solid transparent', borderRadius: 8,
  background: 'transparent', cursor: 'pointer',
  color: 'rgb(var(--ink-3))', fontSize: 15,
  transition: 'background 120ms ease',
};

const profileItemStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10,
  padding: '8px 10px',
  border: 'none', background: 'transparent',
  borderRadius: 6, width: '100%', textAlign: 'left',
  cursor: 'pointer', color: 'rgb(var(--ink))',
  fontSize: 13,
};
