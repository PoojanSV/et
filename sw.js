/* Expense Tracker service worker
   1) lets the app appear in Android's share list for images (manifest "share_target")
   2) keeps the app working offline */
const V = 'expense-tracker-sw-v1';
const ASSETS = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png',
  'AppLogoLight.png', 'AppLogoDark.jpeg', 'logol.png', 'logod.png'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(V)
      .then(c => Promise.all(ASSETS.map(a => c.add(a).catch(() => {}))))   /* a missing file never blocks install */
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);

  /* an image was shared to the app: open it on the "Add expense" sheet */
  if (r.method === 'POST' && u.pathname.endsWith('/share-target')) {
    e.respondWith(Response.redirect(new URL('./?shared=1', self.registration.scope).href, 303));
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
