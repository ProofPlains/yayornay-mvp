const CACHE_NAME = 'flashfeedback-pwa-v1';
const STATIC_ASSETS = [
  '/Favicon.png',
  '/logo.png',
  '/assets/pwa-icon-192.png',
  '/assets/pwa-icon-512.png',
  '/assets/pwa-icon-maskable-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;

  if (request.method !== 'GET') return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => new Response(
        '<!doctype html><title>FlashFeedback is offline</title><meta name="viewport" content="width=device-width, initial-scale=1"><body style="margin:0;font-family:system-ui,sans-serif;background:#212121;color:#ece8dc;display:grid;min-height:100vh;place-items:center;text-align:center;padding:24px;"><main><h1 style="font-size:24px;margin:0 0 12px;">You are offline</h1><p style="margin:0;color:#c7c1b3;">Reconnect to open FlashFeedback.</p></main></body>',
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      ))
    );
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !STATIC_ASSETS.includes(url.pathname)) return;

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        return response;
      });
    })
  );
});
