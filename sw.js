/* SentenceGlish service worker
   - App shell (page, manifest, icons): precached; page requests are network-first
     so updates arrive as soon as the user is online, with the cache as the offline fallback.
   - sentences*.json: stale-while-revalidate — instant on repeat visits, refreshed in the
     background. Only languages the user has opened are cached (nothing is bulk-downloaded).
   - Google Fonts: CSS stale-while-revalidate, font files cache-first.
   - YouGlish / YouTube and everything else: left to the network (no caching).
   Bump CACHE_VERSION whenever the shell files change. */
const CACHE_VERSION = 'v1';
const SHELL_CACHE = 'sg-shell-' + CACHE_VERSION;
const DATA_CACHE  = 'sg-data-' + CACHE_VERSION;
const FONT_CACHE  = 'sg-fonts-' + CACHE_VERSION;
const SHELL_FILES = [
  './', './index.html', './manifest.json',
  './icons/icon-192.png', './icons/icon-512.png',
  './icons/maskable-192.png', './icons/maskable-512.png', './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  const keep = [SHELL_CACHE, DATA_CACHE, FONT_CACHE];
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('sg-') && !keep.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isCacheable(res){ return res && (res.ok || res.type === 'opaque'); }

async function networkFirstPage(request){
  const cache = await caches.open(SHELL_CACHE);
  try{
    const res = await fetch(request);
    if(res.ok) cache.put('./index.html', res.clone());
    return res;
  }catch(err){
    return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
  }
}

async function staleWhileRevalidate(request, cacheName){
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreSearch: true });
  const refresh = fetch(request).then((res) => {
    if(isCacheable(res)) cache.put(request, res.clone());
    return res;
  }).catch(() => null);
  if(cached){ refresh.catch(() => {}); return cached; }
  return (await refresh) || Response.error();
}

async function cacheFirst(request, cacheName){
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if(cached) return cached;
  const res = await fetch(request);
  if(isCacheable(res)) cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);

  if(url.origin === self.location.origin){
    if(req.mode === 'navigate'){ event.respondWith(networkFirstPage(req)); return; }
    if(/\/sentences[^/]*\.json$/.test(url.pathname)){ event.respondWith(staleWhileRevalidate(req, DATA_CACHE)); return; }
    event.respondWith(
      caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req))
    );
    return;
  }
  if(url.hostname === 'fonts.googleapis.com'){      // font CSS: may change, refresh in background
    event.respondWith(staleWhileRevalidate(req, FONT_CACHE));
  } else if(url.hostname === 'fonts.gstatic.com'){   // font files: immutable URLs
    event.respondWith(cacheFirst(req, FONT_CACHE));
  }
});
