// Offline support: serve the app shell from cache, refresh it in the background.
// Bump VERSION whenever you change files so phones pick up the update.
const VERSION = 'ukmppd-v3';
const SHELL = [
  './', './index.html', './css/styles.css', './js/app.js', './js/schedule.js', './js/stats.js', './js/store.js', './js/config.js',
  './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.endsWith('supabase.co')) return; // never cache API calls
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: url.origin === location.origin });
      const fresh = fetch(req).then((res) => { if (res && res.ok && (url.origin === location.origin || url.hostname.includes('fonts') || url.hostname.includes('jsdelivr'))) cache.put(req, res.clone()); return res; }).catch(() => cached);
      return cached || fresh;
    })
  );
});
