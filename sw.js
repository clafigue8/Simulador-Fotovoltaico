/* © 2026 Claudia Figueroa, Dennis Johan López y M.Sc. Daniel Flores · Simulador de Sistemas Fotovoltaicos. Todos los derechos reservados. Prohibida su copia, modificación o redistribución sin autorización escrita. */
/* Service worker: permite instalar el simulador como app y usarlo sin conexión.
   - Páginas: primero la red (siempre la versión más nueva); sin conexión, la copia guardada.
   - Archivos del sitio (JS, CSS, datos, imágenes): copia guardada al instante y se actualiza en segundo plano.
   - Firebase, clima y otros servicios externos no se guardan. */
const CACHE = 'sfv-v3';
const CORE = ['/', '/index.html', '/manifest.webmanifest', '/assets/img/icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET') return;
  const fonts = /fonts\.(googleapis|gstatic)\.com$/.test(u.hostname);
  if (u.origin !== location.origin && !fonts) return;
  if (r.mode === 'navigate') {
    e.respondWith(fetch(r).then(res => { const c = res.clone(); caches.open(CACHE).then(k => k.put(r, c)); return res; }).catch(() => caches.match(r).then(m => m || caches.match('/'))));
    return;
  }
  e.respondWith(caches.open(CACHE).then(k => k.match(r).then(m => {
    const net = fetch(r).then(res => { if (res.ok || res.type === 'opaque') k.put(r, res.clone()); return res; }).catch(() => m);
    return m || net;
  })));
});
