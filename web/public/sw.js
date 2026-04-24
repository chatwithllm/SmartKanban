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
