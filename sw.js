/* Expense Tracker service worker
   1) lets the app appear in Android's share list for images (manifest "share_target")
   2) keeps the app working offline */
const V = 'expense-tracker-sw-v2';
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

  /* an image was shared to the app: cache it and open the "Add expense" sheet */
  if (r.method === 'POST' && (u.pathname.includes('share-target') || u.pathname.endsWith('share-target'))) {
    e.respondWith((async () => {
      try {
        const data = await r.formData();
        let file = data.get('image');
        if (!file || typeof file === 'string' || !file.size) {
          for (const [k, v] of data.entries()) {
            if (v && typeof v === 'object' && v.size > 0) {
              file = v;
              break;
            }
          }
        }
        if (file && typeof file.arrayBuffer === 'function') {
          const buf = await file.arrayBuffer();
          const cache = await caches.open('et-shared');
          const resp = new Response(buf, {
            headers: {
              'content-type': file.type || 'image/jpeg',
              'content-length': String(buf.byteLength)
            }
          });
          await cache.put('/__shared-image', resp.clone());
          const scopeUrl = new URL('./__shared-image', self.registration.scope).href;
          await cache.put(scopeUrl, resp);
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
