import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { test } from 'node:test';
import vm from 'node:vm';

const NET_MS = 150;
const CACHE_MS = 80;
const CRITICAL = ['/assets/app.js', '/assets/app.css', '/manifest.webmanifest'];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class FakeRequest {
  constructor(input, init = {}) {
    this.url = typeof input === 'string' ? input : input.url;
    this.method = init.method || 'GET';
    this.mode = init.mode;
    this.headers = { get: () => null };
  }
}
class FakeResponse {
  constructor(body, init = {}) {
    this.bodyText = typeof body === 'string' ? body : '';
    this.status = init.status ?? 200;
    this.ok = this.status >= 200 && this.status < 300;
    this.redirected = !!init.redirected;
    this.type = init.type ?? 'basic';
    const headers = {};
    for (const [key, value] of Object.entries(init.headers ?? {}))
      headers[key.toLowerCase()] = value;
    this.headers = { get: (name) => headers[name.toLowerCase()] ?? null };
  }
  clone() {
    return new FakeResponse(this.bodyText, {
      status: this.status,
      redirected: this.redirected,
      type: this.type,
      headers: { 'content-type': this.headers.get('content-type') ?? '' },
    });
  }
  async text() {
    return this.bodyText;
  }
}

function createCaches() {
  const stores = new Map();
  const stats = { open: 0, match: 0, put: 0, inFlightDeletes: 0, maxDeletes: 0 };
  return {
    stats,
    stores,
    async open(name) {
      stats.open += 1;
      await sleep(CACHE_MS);
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async match(key) {
          stats.match += 1;
          await sleep(CACHE_MS);
          return store.get(String(key));
        },
        async put(key, value) {
          stats.put += 1;
          await sleep(CACHE_MS);
          store.set(String(key), value);
        },
      };
    },
    async match(request, options = {}) {
      stats.match += 1;
      await sleep(CACHE_MS);
      return stores.get(options.cacheName)?.get(String(request));
    },
    async keys() {
      await sleep(CACHE_MS);
      return [...stores.keys()];
    },
    async delete(name) {
      stats.inFlightDeletes += 1;
      stats.maxDeletes = Math.max(stats.maxDeletes, stats.inFlightDeletes);
      await sleep(CACHE_MS);
      stats.inFlightDeletes -= 1;
      return stores.delete(name);
    },
  };
}

function responseFor(url) {
  const path = String(url);
  if (path.includes('fail')) throw Error('offline');
  if (path.endsWith('/bad.js'))
    return new FakeResponse('missing', { status: 500, type: 'basic' });
  const html = path === '/' || path.endsWith('/');
  return new FakeResponse(html ? '<html>Chalkbook</html>' : 'asset', {
    type: 'basic',
    headers: {
      'content-type': html ? 'text/html; charset=utf-8' : 'text/javascript',
    },
  });
}

async function time(fn) {
  const start = performance.now();
  await fn();
  return performance.now() - start;
}

function installWorker(caches, fetchImpl, critical = CRITICAL, optional = [], art = []) {
  const source = template
    .replaceAll('__VERSION__', 'bench')
    .replaceAll('__CRITICAL__', JSON.stringify(critical))
    .replaceAll('__OPTIONAL__', JSON.stringify(optional))
    .replaceAll('__ART__', JSON.stringify(art));
  const listeners = {};
  let deletesWhenClaimed = -1;
  const context = vm.createContext({
    self: {
      addEventListener(type, fn) {
        listeners[type] = fn;
      },
      skipWaiting() {},
      clients: {
        claim: async () => {
          deletesWhenClaimed = caches.stats.inFlightDeletes;
        },
      },
      location: { origin: 'https://chalk.test' },
    },
    caches,
    fetch: fetchImpl,
    Request: FakeRequest,
    Response: FakeResponse,
    URL,
  });
  vm.runInContext(source, context, { filename: 'sw.js' });
  return {
    listeners,
    deletesWhenClaimed: () => deletesWhenClaimed,
  };
}

function track(event, listener) {
  let job = Promise.resolve();
  listener({
    ...event,
    waitUntil(promise) {
      job = promise;
    },
    respondWith(promise) {
      job = promise;
    },
  });
  return job;
}

const template = await readFile(new URL('../scripts/sw-template.js', import.meta.url), 'utf8');

void test('service worker install and cache hits overlap independent cache work', async () => {
  const fetched = [];
  const fetchImpl = async (request) => {
    const url = typeof request === 'string' ? request : request.url;
    fetched.push(url);
    await sleep(NET_MS);
    return responseFor(url);
  };
  const legacyCaches = createCaches();
  const before = await time(async () => {
    const cache = await legacyCaches.open('gym-shell-bench');
    const shell = await fetchImpl(new FakeRequest('/'));
    await shell.clone().text();
    await cache.put('/', shell);
    for (const path of CRITICAL) {
      const response = await fetchImpl(new FakeRequest(path));
      await cache.put(path, response);
    }
  });

  fetched.length = 0;
  const caches = createCaches();
  const worker = installWorker(caches, fetchImpl);
  const after = await time(() => track({}, worker.listeners.install));
  assert.ok(caches.stores.get('gym-shell-bench')?.has('/'));
  for (const path of CRITICAL)
    assert.ok(caches.stores.get('gym-shell-bench')?.has(path));
  assert.ok(after < before * 0.45, `install ${after} vs ${before}`);

  caches.stats.open = 0;
  caches.stats.match = 0;
  const hit = await time(() =>
    track(
      {
        request: {
          url: 'https://chalk.test/assets/app.js',
          method: 'GET',
          mode: 'same-origin',
          headers: { get: () => null },
        },
      },
      worker.listeners.fetch,
    ),
  );
  assert.equal(caches.stats.open, 0);
  assert.equal(caches.stats.match, 1);
  const legacyHit = await time(async () => {
    const cache = await legacyCaches.open('gym-shell-bench');
    await cache.match('/assets/app.js');
  });
  assert.ok(hit < legacyHit * 0.75, `asset hit ${hit} vs ${legacyHit}`);

  const navigate = await time(() =>
    track(
      {
        request: {
          url: 'https://chalk.test/?source=home',
          method: 'GET',
          mode: 'navigate',
          headers: { get: () => null },
        },
      },
      worker.listeners.fetch,
    ),
  );
  assert.ok(navigate < legacyHit * 0.75);

  console.log('\n| Service worker | Time before | Time after |');
  console.log('| --- | ---: | ---: |');
  console.log(
    `| install shell + ${CRITICAL.length} critical files | ${before.toFixed(1)} ms | ${after.toFixed(1)} ms |`,
  );
  console.log(
    `| cached shell asset | ${legacyHit.toFixed(1)} ms | ${hit.toFixed(1)} ms |`,
  );
  console.log(
    `| navigate with a cached shell | ${legacyHit.toFixed(1)} ms | ${navigate.toFixed(1)} ms |`,
  );
  console.log(
    `Injected latency: network ${NET_MS} ms, each Cache Storage open/match/put ${CACHE_MS} ms.`,
  );
});

void test('a failed shell file still aborts install, and optional warming stays sequential', async () => {
  const fetched = [];
  const fetchImpl = async (request) => {
    const url = request.url;
    fetched.push(url);
    await sleep(5);
    return responseFor(url);
  };
  const caches = createCaches();
  const worker = installWorker(
    caches,
    fetchImpl,
    ['/assets/app.js', '/bad.js'],
    ['/optional/one.png', '/optional/fail.png', '/optional/three.png'],
    ['/exercise-icons-v2/squat.webp'],
  );
  await assert.rejects(track({}, worker.listeners.install), /Shell asset unavailable/);
  assert.equal(caches.stores.has('gym-shell-bench'), false);

  fetched.length = 0;
  await track({ data: { type: 'warm-cache', includeArt: false } }, worker.listeners.message);
  assert.deepEqual(fetched, ['/optional/one.png', '/optional/fail.png']);
});

void test('activating a new shell deletes old shells together and then claims clients', async () => {
  const caches = createCaches();
  await caches.open('gym-shell-old-a');
  await caches.open('gym-shell-old-b');
  await caches.open('gym-shell-bench');
  await caches.open('gym-art-v1');
  const worker = installWorker(caches, async () => responseFor('/'));
  const before = await time(async () => {
    const keys = await caches.keys();
    for (const key of keys)
      if (key.startsWith('gym-shell-') && key !== 'gym-shell-bench') await caches.delete(key);
    worker.deletesWhenClaimed();
  });
  await caches.open('gym-shell-old-a');
  await caches.open('gym-shell-old-b');
  const after = await time(() => track({}, worker.listeners.activate));
  assert.equal(caches.stats.maxDeletes >= 2, true);
  assert.equal(worker.deletesWhenClaimed(), 0);
  assert.equal(caches.stores.has('gym-shell-old-a'), false);
  assert.equal(caches.stores.has('gym-shell-old-b'), false);
  assert.equal(caches.stores.has('gym-shell-bench'), true);
  assert.equal(caches.stores.has('gym-art-v1'), true);
  assert.ok(after < before, `activate ${after.toFixed(1)} vs legacy ${before.toFixed(1)}`);
  console.log(
    `| delete 2 old shells, then claim | ${before.toFixed(1)} ms | ${after.toFixed(1)} ms |`,
  );
});
