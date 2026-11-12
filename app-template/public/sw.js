/* The service worker of the web app and the installed PWA. Generated at build time from core/update/sw.js
   (core/update/vite-plugin.mjs fills in the version and the file list); do not edit the copy in dist/.

   It keeps one version of the app in a cache and serves it from there, so the app opens at once and offline. A new
   deploy changes this file (the version in it), so the browser installs it again next to the running one:
     - only what changed is downloaded: a file with a content hash in its name (assets/…) is the same file in every
       version that has it, and is taken from the older cache;
     - the new version then WAITS. The page decides how it is taken (core/update/client.js): silently at the next
       launch, offered to the user, or at once: the three update levels of release.json. */
const VERSION = "99fdc7ca4ffa";
const FILES = ["index.html","assets/index-DAFhbxkc.js","assets/index-St6zOo6P.css","assets/jost-latin-300-normal-DkBQXsFU.woff2","assets/jost-latin-400-normal-q-RKOgPK.woff2","assets/jost-latin-600-normal-C497H-z9.woff2","assets/rolldown-runtime-BWaJ3C7D.js","assets/vendor-C998EtrW.js","icons/192x192.png","icons/512x512.png","icons/apple-touch-icon.png","icons/favicon.png","manifest.webmanifest"];                       // relative to the app's folder; index.html first
const PREFIX = 'app-';
const CACHE = PREFIX + VERSION;
const at = (path) => new URL(path, self.registration.scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const older = (await caches.keys()).filter((n) => n.startsWith(PREFIX) && n !== CACHE);
    for (const path of FILES) {
      const url = at(path);
      let res = null;
      if (/^assets\//.test(path)) {
        for (const name of older) { res = await (await caches.open(name)).match(url); if (res) break; }
      }
      if (!res) {
        // asked past the HTTP cache's word for it, but not past its copy: an unchanged icon costs one 304
        res = await fetch(new Request(url, { cache: 'no-cache' }));
        if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);       // all of a version, or none of it
      }
      await cache.put(url, res);
    }
    // The first worker of all takes over at once: the app works offline from the first visit. A later one waits.
    if (!self.registration.active) await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith(PREFIX) && n !== CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

// the page says: take the new version now
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'skip-waiting') self.skipWaiting();
});

// Cache first: the cached files are one consistent version. Opening the app (a navigation) gets index.html whatever
// the address says after it. The update manifest and this file always come from the network. Anything else that is
// not cached falls through to the network.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!url.href.startsWith(self.registration.scope)) return;
  const path = url.href.slice(self.registration.scope.length).split(/[?#]/)[0];
  if (path === 'app-manifest.json' || path === 'sw.js') return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (req.mode === 'navigate') return (await cache.match(at('index.html'))) || fetch(req);
    return (await cache.match(url.origin + url.pathname)) || fetch(req);
  })());
});
