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
        // HTML, JS, CSS, and the manifest do not depend on each other. The art
        // set stays out of install: iOS kills a worker that downloads it here,
        // and one failed response used to delete the entire shell.
        const shellPromise = fetch(
          new Request('/', { cache: 'reload', credentials: 'same-origin' }),
        ).then(async (shell) => {
          // Never cache a sign-in redirect or failed response as the notebook shell.
          if (
            !shell.ok ||
            shell.redirected ||
            !shell.headers.get('content-type')?.includes('text/html') ||
            !(await shell.clone().text()).includes('Chalkbook')
          )
            throw Error('Notebook shell unavailable');
          return shell;
        });
        const assets = await Promise.all([
          shellPromise,
          ...CRITICAL.map(async (path) => {
            const response = await fetch(
              new Request(path, { cache: 'reload', credentials: 'same-origin' }),
            );
            if (!cacheable(response))
              throw Error(`Shell asset unavailable: ${path}`);
            return { path, response };
          }),
        ]);
        const [shell, ...files] = assets;
        await Promise.all([
          cache.put('/', shell),
          ...files.map(({ path, response }) => cache.put(path, response)),
        ]);
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
  // One file at a time, and stop at the first network error. A weak gym link
  // should not be asked for every remaining icon after it has already failed.
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
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith('gym-shell-') && key !== CACHE)
          .map((key) => caches.delete(key)),
      );
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
          // ignoreSearch: an installed iOS home-screen launch can add a query.
          const cached = await caches.match('/', {
            cacheName: CACHE,
            ignoreSearch: true,
          });
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
      const cacheName = art ? ART_CACHE : CACHE;
      const cached = await caches.match(url.pathname, { cacheName });
      if (cached) return cached;
      const opening = caches.open(cacheName);
      try {
        const fresh = await fetch(event.request);
        if (cacheable(fresh)) await (await opening).put(url.pathname, fresh.clone());
        else void opening.catch(() => {});
        return fresh;
      } catch {
        void opening.catch(() => {});
        // A rejected respondWith becomes the browser's offline error page on
        // iOS. An empty miss lets <img> fall back without taking down the shell.
        return new Response('', { status: 504, statusText: 'Offline' });
      }
    })(),
  );
});
