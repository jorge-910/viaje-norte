/* Service worker: guarda la app para usarla sin conexión. Los PDF no pasan por aquí:
   se importan con el JSON privado y viven en IndexedDB, solo en el dispositivo. */
const CACHE = 'ruta-norte-v2';
const SHELL = ['./', 'index.html', 'app.css', 'app.js', 'data.js', 'engine.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(async c => {
    await c.addAll(SHELL);
  }).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// App: primero la red (para recibir cambios) y, sin conexión, la caché.
// Iconos: primero la caché.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  const put = res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return res; };
  const cacheFirst = /\.(png|svg)$/i.test(url.pathname);
  e.respondWith(cacheFirst
    ? caches.match(e.request).then(hit => hit || fetch(e.request).then(put))
    : fetch(e.request).then(put).catch(() =>
        caches.match(e.request, { ignoreSearch: true }).then(hit => hit || caches.match('index.html'))));
});
