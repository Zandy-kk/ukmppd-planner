// Offline support. Network first (so updates show up straight away), cache as fallback.
// Bump VERSION whenever you change files.
const VERSION = 'ukmppd-v9';
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
  const cacheable = url.origin === location.origin || url.hostname.includes('fonts') || url.hostname.includes('jsdelivr');
  if (!cacheable) return;
  e.respondWith(
    fetch(req).then((res) => {
      if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: url.origin === location.origin }).then((r) => r || caches.match('./index.html')))
  );
});
