/* sw.js — cache-first shell, network-first for /api/*.
 *
 * Bump VERSION on any shell change to force clients to update.
 */
const VERSION = 'pampero-v1';
const SHELL = [
  './',
  'index.html',
  'setup.html',
  'style.css',
  'app.js',
  'sensors.js',
  'ui.js',
  'storage.js',
  'uploader.js',
  'gpx.js',
  'manifest.webmanifest',
  'vendor/dexie.min.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Never intercept API calls — let the uploader/app handle offline state.
  if (url.pathname.startsWith('/api/')) return;

  // Cache-first for same-origin GETs.
  if (req.method !== 'GET' || url.origin !== location.origin) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        // opportunistically cache successful shell-scope responses
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => cached);
    })
  );
});
