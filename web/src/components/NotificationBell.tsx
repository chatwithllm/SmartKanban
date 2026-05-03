import { useState, useRef, useEffect, useCallback } from 'react';
import type { Notification } from '../types.ts';
import { usePushNotifications } from '../hooks/usePushNotifications.ts';

function relTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  return Math.floor(diff / 86400) + 'd ago';
}

type Props = {
  notifications: Notification[];
  unreadCount: number;
  onMarkRead: (ids: number[]) => void;
  onMarkAllRead: () => void;
  onCardOpen: (cardId: string) => void;
};

export function NotificationBell({ notifications, unreadCount, onMarkRead, onMarkAllRead, onCardOpen }: Props) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const { supported, permission, subscribe } = usePushNotifications();
  const [pushPrompted, setPushPrompted] = useState(false);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleBellClick = useCallback(async () => {
    setOpen(v => !v);
    if (supported && permission === 'default' && !pushPrompted) {
      setPushPrompted(true);
      await subscribe();
    }
  }, [supported, permission, pushPrompted, subscribe]);

  const handleNotifClick = (n: Notification) => {
    onMarkRead([n.id]);
    onCardOpen(n.card_id);
    setOpen(false);
  };

  return (
    <div ref={panelRef} style={{ position: 'relative' }}>
      <button
        onClick={handleBellClick}
        title="Notifications"
        style={{
          width: 32, height: 32, padding: 0,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          border: '1px solid transparent', borderRadius: 8,
          background: 'transparent', cursor: 'pointer',
          color: unreadCount > 0 ? 'rgb(var(--violet))' : 'rgb(var(--ink-3))',
          fontSize: 15, position: 'relative',
          transition: 'background 120ms ease',
        }}
      >
        🔔
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: 3, right: 3,
            minWidth: 16, height: 16, padding: '0 4px',
            background: 'rgb(var(--danger))', color: 'white',
            borderRadius: 999, fontSize: 9, fontWeight: 700,
            fontFamily: "'JetBrains Mono', monospace",
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            border: '1.5px solid rgb(var(--canvas))',
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
          width: 380, maxHeight: 480,
          background: 'rgb(var(--surface))',
          borderRadius: 12, boxShadow: 'var(--sh-3)',
          border: '1px solid rgb(var(--hairline) / 0.08)',
          overflow: 'hidden', display: 'flex', flexDirection: 'column',
          zIndex: 50,
          animation: 'fadeIn 200ms ease both',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid rgb(var(--hairline) / 0.08)',
          }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={onMarkAllRead}
                style={{
                  fontSize: 11.5, color: 'rgb(var(--violet))',
                  background: 'none', border: 'none',
                  cursor: 'pointer', padding: '2px 6px',
                  borderRadius: 4, fontWeight: 500,
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          <div style={{ overflowY: 'auto', flex: 1 }}>
            {notifications.length === 0 ? (
              <div style={{
                padding: '40px 20px', textAlign: 'center',
                color: 'rgb(var(--ink-3))', fontSize: 13,
              }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🔔</div>
                No new notifications
              </div>
            ) : (
              notifications.slice(0, 50).map(n => (
                <button
                  key={n.id}
                  onClick={() => handleNotifClick(n)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    padding: '12px 16px', width: '100%',
                    border: 'none', borderBottom: '1px solid rgb(var(--hairline) / 0.06)',
                    background: n.read ? 'transparent' : 'rgb(var(--violet-tint))',
                    cursor: 'pointer', textAlign: 'left',
                    transition: 'background 120ms ease',
                    borderLeft: n.read ? '3px solid transparent' : '3px solid rgb(var(--violet))',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgb(var(--hairline) / 0.04)')}
                  onMouseLeave={e => (e.currentTarget.style.background = n.read ? 'transparent' : 'rgb(var(--violet-tint))')}
                >
                  <span style={{
                    width: 32, height: 32, borderRadius: 999, flexShrink: 0,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 600, color: 'white',
                    background: avatarColor(n.actor_name),
                    marginTop: 2,
                  }}>
                    {n.actor_name.charAt(0).toUpperCase()}
                  </span>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 2, color: 'rgb(var(--ink))' }}>
                      {n.actor_name}
                    </div>
                    <div style={{
                      fontSize: 12, color: 'rgb(var(--ink-2))', lineHeight: 1.4,
                      overflow: 'hidden', textOverflow: 'ellipsis',
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    }}>
                      {n.preview}
                    </div>
                    <div style={{ fontSize: 11, color: 'rgb(var(--ink-3))', marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>
                      {relTime(n.created_at)}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function avatarColor(name: string): string {
  const colors = ['#5B37C4', '#c84b31', '#2b8a6e', '#b07d2a', '#2a6ab0', '#8b3a8b'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h) + name.charCodeAt(i);
  return colors[Math.abs(h) % colors.length]!;
}
