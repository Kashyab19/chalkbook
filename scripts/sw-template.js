const CACHE = 'gym-shell-__VERSION__';
const ASSETS = __ASSETS__;
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
          !(await shell.clone().text()).includes('Repwise')
        )
          throw Error('Notebook shell unavailable');
        await cache.addAll(ASSETS);
        await cache.put('/', shell);
      } catch (error) {
        await caches.delete(CACHE);
        throw error;
      }
    })(),
  );
});
self.addEventListener('message', (event) => {
  if (event.data?.type === 'skip-waiting') self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys())
        if (key.startsWith('gym-shell-') && key !== CACHE)
          await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== 'GET')
    return;
  // Data and authentication are never served from the HTTP cache. IndexedDB owns
  // offline records. The cached HTML contains no workout data or credentials.
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.includes('signin') ||
    url.pathname.includes('signout') ||
    url.pathname.includes('callback')
  )
    return;
  if (event.request.mode === 'navigate' && url.pathname === '/') {
    event.respondWith(
      caches
        .open(CACHE)
        .then(
          async (cache) => (await cache.match('/')) || fetch(event.request),
        ),
    );
  } else if (ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches
        .open(CACHE)
        .then(
          async (cache) =>
            (await cache.match(url.pathname)) || fetch(event.request),
        ),
    );
  }
});
