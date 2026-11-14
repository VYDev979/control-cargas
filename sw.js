const VERSION = 'cargas-v3';
const ARCHIVOS = ['./', 'index.html', 'style.css', 'app.js', 'manifest.json', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ARCHIVOS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(redPrimero(e.request));
});

async function redPrimero(req) {
  const cache = await caches.open(VERSION);
  try {
    const resp = await Promise.race([
      fetch(req, { cache: 'no-cache' }),
      new Promise((_, no) => setTimeout(no, 3000))
    ]);
    if (resp && resp.ok) cache.put(req, resp.clone());
    return resp;
  } catch (err) {
    return (await cache.match(req)) || (await cache.match('index.html'));
  }
}
