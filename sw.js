/* FP-10 Instrument Box service worker: works offline once opened */
const SHELL = 'fp10-shell-v1';
const SOUNDS = 'fp10-sounds-v2';
const FILES = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png',
  './js/core.js', './js/band.js', './js/studio.js', './js/learn.js', './js/extras.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (/\/(sf2|pro)\//.test(url.pathname)) {
    e.respondWith(caches.open(SOUNDS).then(c => c.match(req).then(hit => hit || fetch(req))));
    return;
  }
  // app files: network first so updates show up, cache as offline fallback
  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(SHELL).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req).then(hit => hit || caches.match('./index.html'))));
});
