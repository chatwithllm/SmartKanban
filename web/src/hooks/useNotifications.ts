import { useState, useEffect, useCallback, useRef } from 'react';
import type { Notification } from '../types.ts';
import { api } from '../api.ts';

export function useNotifications(wsLastEvent: { type: string } | null, currentUserId: string | undefined) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const loaded = useRef(false);

  const load = useCallback(async () => {
    try {
      const data = await api.notifications();
      setNotifications(data);
    } catch {}
  }, []);

  // Initial load
  useEffect(() => {
    if (!currentUserId || loaded.current) return;
    loaded.current = true;
    void load();
  }, [currentUserId, load]);

  // WS real-time: reload when chat events arrive
  useEffect(() => {
    if (!wsLastEvent || !currentUserId) return;
    if (wsLastEvent.type !== 'card.message' && wsLastEvent.type !== 'card.ai_response') return;
    void load();
  }, [wsLastEvent, currentUserId, load]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markRead = useCallback(async (ids: number[]) => {
    if (ids.length === 0) return;
    setNotifications(prev => prev.map(n => ids.includes(n.id) ? { ...n, read: true } : n));
    try { await api.markNotificationsRead(ids); } catch {}
  }, []);

  const markAllRead = useCallback(async () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    try { await api.markAllNotificationsRead(); } catch {}
  }, []);

  return { notifications, unreadCount, markRead, markAllRead, reload: load };
}
