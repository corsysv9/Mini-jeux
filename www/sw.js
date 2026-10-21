// Service worker minimal : rend le site installable et garde l'interface en cache.
// L'API n'est jamais mise en cache (l'état des parties doit toujours être frais).
const CACHE = 'mini-jeux-v5';
const SHELL = ['./', 'index.html', 'assets/style.css?v=5', 'assets/app.js?v=5', 'assets/icon.svg', 'manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.includes('/api/')) return;
  // Réseau d'abord, cache en secours (hors connexion).
  e.respondWith(fetch(e.request)
    .then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    })
    .catch(() => caches.match(e.request, { ignoreSearch: url.pathname.endsWith('/') })));
});
