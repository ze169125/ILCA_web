/* Copyright (c) 2026 PopSolutions Cooperativa
 * SPDX-License-Identifier: CHARRUA-1.2
 * Licença CHARRUA v1.2 — ver LICENSE ou https://gitlab.fing.edu.uy/charrua/licencia
 *
 * sw.js — cache-first shell, network-first for /api/*.
 *
 * Bump VERSION on any shell change to force clients to update.
 */
const VERSION = 'pampero-v24';
const SHELL = [
  './',
  'index.html',
  'setup.html',
  'como-usar.html',
  'baixar.html',
  'style.css',
  'app.js',
  'sensors.js',
  'ui.js',
  'storage.js',
  'share.js',
  'gpx.js',
  'csv.js',
  'startline.js',
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

  // Skip API paths (kept for forward-compat if a backend is later attached).
  if (url.pathname.startsWith('/api/')) return;

  // Cache-first for same-origin GETs.
  if (req.method !== 'GET' || url.origin !== location.origin) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        // opportunistically cache successful shell-scope responses,
        // but skip large binaries (e.g. the APK download) to avoid bloat.
        const isBinary = url.pathname.endsWith('.apk');
        if (res.ok && res.type === 'basic' && !isBinary) {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => cached);
    })
  );
});
