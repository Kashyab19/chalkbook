const CACHE = 'gym-shell-__VERSION__';
const ART_CACHE = 'gym-art-v1';
const CRITICAL = __CRITICAL__;
const OPTIONAL = __OPTIONAL__;
const ART = __ART__;
const SHELL = new Set([...CRITICAL, ...OPTIONAL]);

function cacheable(response) {
  return (
    !!response &&
    response.ok &&
    !response.redirected &&
    response.type === 'basic'
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        const shell = await fetch(
          new Request('/', { cache: 'reload', credentials: 'same-origin' }),
        );
        // Never cache a sign-in redirect or failed response as the notebook shell.
        if (
          !shell.ok ||
          shell.redirected ||
          !shell.headers.get('content-type')?.includes('text/html') ||
          !(await shell.clone().text()).includes('Chalkbook')
        )
          throw Error('Notebook shell unavailable');
        await cache.put('/', shell);
        // Only the HTML, JS, CSS, and manifest block installation. iOS will
        // kill a service worker whose install handler downloads the art set,
        // and one failed response used to delete the entire shell.
        for (const path of CRITICAL) {
          const response = await fetch(
            new Request(path, { cache: 'reload', credentials: 'same-origin' }),
          );
          if (!cacheable(response)) throw Error(`Shell asset unavailable: ${path}`);
          await cache.put(path, response);
        }
      } catch (error) {
        await caches.delete(CACHE);
        throw error;
      }
    })(),
  );
});

let warming = null;
async function warm(cacheName, paths) {
  const cache = await caches.open(cacheName);
  for (const path of paths) {
    if (await cache.match(path)) continue;
    let response;
    try {
      response = await fetch(
        new Request(path, { credentials: 'same-origin' }),
      );
    } catch {
      // Stop on the first network failure so a weak link is not retried for
      // every remaining file. The next visit continues where this left off.
      return;
    }
    if (!cacheable(response)) continue;
    await cache.put(path, response);
  }
}

self.addEventListener('message', (event) => {
  if (event.data?.type === 'skip-waiting') self.skipWaiting();
  if (event.data?.type === 'warm-cache') {
    const includeArt = !!event.data.includeArt;
    if (warming) return;
    warming = (async () => {
      await warm(CACHE, OPTIONAL);
      if (includeArt) await warm(ART_CACHE, ART);
    })().finally(() => {
      warming = null;
    });
    event.waitUntil(warming);
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys())
        if (key.startsWith('gym-shell-') && key !== CACHE) await caches.delete(key);
      // gym-art-v1 is kept across shell updates so icons are not downloaded again.
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (
    url.origin !== self.location.origin ||
    event.request.method !== 'GET' ||
    event.request.headers.get('range')
  )
    return;
  // Data and authentication are never served from the HTTP cache. IndexedDB owns
  // offline records. The cached HTML contains no workout data or credentials.
  // Background Sync is not used: iOS Safari does not support it.
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.includes('signin') ||
    url.pathname.includes('signout') ||
    url.pathname.includes('callback')
  )
    return;
  if (event.request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const cache = await caches.open(CACHE);
          // ignoreSearch: an installed iOS home-screen launch can add a query.
          const cached = await cache.match('/', { ignoreSearch: true });
          if (cached) return cached;
          return await fetch(event.request);
        } catch {
          return new Response(
            'Chalkbook needs one online visit before it can open offline.',
            {
              status: 503,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            },
          );
        }
      })(),
    );
    return;
  }
  const art = url.pathname.startsWith('/exercise-icons');
  if (!art && !SHELL.has(url.pathname)) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(art ? ART_CACHE : CACHE);
      const cached = await cache.match(url.pathname);
      if (cached) return cached;
      try {
        const fresh = await fetch(event.request);
        if (cacheable(fresh)) await cache.put(url.pathname, fresh.clone());
        return fresh;
      } catch {
        // A rejected respondWith becomes the browser's offline error page on
        // iOS. An empty miss lets <img> fall back without taking down the shell.
        return new Response('', { status: 504, statusText: 'Offline' });
      }
    })(),
  );
});
