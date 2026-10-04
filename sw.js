/* Expense Tracker service worker
   1) lets the app appear in Android's share list for images (manifest "share_target")
   2) keeps the app working offline */
const V = 'expense-tracker-sw-v3';
const ASSETS = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png',
  'AppLogoLight.png', 'AppLogoDark.jpeg', 'logol.png', 'logod.png'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(V)
      .then(c => Promise.all(ASSETS.map(a => c.add(a).catch(() => {}))))   /* a missing file never blocks install */
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== V && k !== 'et-shared').map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);

  /* an image was shared to the app: read it, relay to all clients, then redirect */
  if (r.method === 'POST' && (u.pathname.includes('share-target') || u.pathname.endsWith('share-target'))) {
    e.respondWith((async () => {
      try {
        const data = await r.formData();
        let file = null, mimeType = 'image/jpeg';
        // Try common field names first, then fall back to any Blob
        for (const key of ['image', 'media', 'file', 'files']) {
          const v = data.get(key);
          if (v && typeof v === 'object' && v.size > 0) { file = v; break; }
        }
        if (!file) {
          for (const [, v] of data.entries()) {
            if (v && typeof v === 'object' && v.size > 0) { file = v; break; }
          }
        }
        if (file && typeof file.arrayBuffer === 'function') {
          mimeType = file.type || 'image/jpeg';
          const buf = await file.arrayBuffer();
          // 1) Write to cache as a backup path
          try {
            const cache = await caches.open('et-shared');
            await cache.delete('/__shared-image');       // clear stale entry
            await cache.put('/__shared-image', new Response(buf, {
              headers: { 'content-type': mimeType, 'content-length': String(buf.byteLength) }
            }));
          } catch (_) {}
          // 2) PRIMARY path: postMessage the buffer to every open client
          const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
          for (const client of clients) {
            try {
              client.postMessage({ type: 'SHARED_IMAGE', mimeType, buffer: buf }, [buf]);
            } catch (_) {}
          }
        }
      } catch (err) {
        console.error('Service worker share-target error:', err);
      }
      return Response.redirect(new URL('./?shared=' + Date.now(), self.registration.scope).href, 303);
    })());
    return;
  }

  if (r.method !== 'GET' || u.origin !== location.origin) return;

  /* network first (so updates arrive), cache as fallback when offline */
  e.respondWith(
    fetch(r)
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(V).then(c => c.put(r, copy)); }
        return res;
      })
      .catch(() => caches.match(r, { ignoreSearch: true })
        .then(m => m || (r.mode === 'navigate' ? caches.match('./') : Response.error())))
  );
});
