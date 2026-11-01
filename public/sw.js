// The build fills these in (vite.config.ts, src/swStamp.ts): an id for this
// build and every hashed bundle it serves. A new build is a new worker with a
// cache of its own; see the note in swStamp.ts. Unstamped (the dev server),
// the worker is never registered — index.html skips localhost.
const BUILD = '__BUILD_ID__';
const ASSETS = /*__ASSETS__*/[];
const PREFIX = 'budget-';
const CACHE = PREFIX + BUILD;
const PRECACHE = ['/', '/index.html', '/manifest.json', ...ASSETS];

self.addEventListener('install', e => {
  // Every bundle up front, so starting offline needs nothing that was only
  // ever fetched on the way. If any of it fails, the install fails and the
  // previous worker keeps serving its own complete cache.
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  // Drop older builds' caches — this is what keeps storage from growing with
  // every deploy. The one just before this build is kept for one more
  // generation: a tab still open on it may yet load a lazy bundle of its own.
  // Only caches this app named are touched, and nothing here is user data.
  e.waitUntil(
    caches.keys().then(keys => {
      const ours = keys.filter(k => k.startsWith(PREFIX));
      const others = ours.filter(k => k !== CACHE);
      const keep = new Set([CACHE, others[others.length - 1]]);
      return Promise.all(ours.filter(k => !keep.has(k)).map(k => caches.delete(k)));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Never intercept Vite dev server requests (HMR, module scripts, etc.)
  if (
    url.hostname === 'localhost' ||
    url.pathname.startsWith('/@') ||
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/node_modules/')
  ) {
    return; // let browser handle it normally
  }

  if (e.request.method !== 'GET') return;

  // Network-first for navigation, cache-first for static assets
  const isNavigation = e.request.mode === 'navigate';
  if (isNavigation) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request).then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, clone));
        }
        return res;
      });
      return cached || network;
    })
  );
});
