// Minimal offline-aware service worker: network-first for HTML; cache-first for hashed assets.
const CACHE = 'kanban-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Never cache API, websocket upgrades, or attachments.
  if (
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/attachments') ||
    url.pathname.startsWith('/ws') ||
    url.pathname.startsWith('/telegram')
  ) {
    return;
  }

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match(req).then((r) => r || caches.match('/'))),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});

// Push notification handler
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'SmartKanban', body: event.data.text(), cardId: null };
  }
  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'SmartKanban', {
      body: payload.body ?? '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-72.png',
      data: { cardId: payload.cardId },
      tag: payload.cardId ?? 'default',
      renotify: true,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const cardId = event.notification.data?.cardId;
  const url = cardId ? `/?card=${encodeURIComponent(cardId)}` : '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.postMessage({ type: 'open-card', cardId });
          return client.focus();
        }
      }
      return clients.openWindow(url);
    }),
  );
});
