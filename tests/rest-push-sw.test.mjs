import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const template = await readFile(new URL('../scripts/sw-template.js', import.meta.url), 'utf8');

function loadWorker() {
  const source = template
    .replaceAll('__VERSION__', 'test')
    .replaceAll('__CRITICAL__', '[]')
    .replaceAll('__OPTIONAL__', '[]')
    .replaceAll('__ART__', '[]');
  const listeners = {};
  const notifications = [];
  const context = vm.createContext({
    self: {
      addEventListener(type, fn) {
        listeners[type] = fn;
      },
      registration: {
        showNotification(title, options) {
          notifications.push({ title, options });
          return Promise.resolve();
        },
      },
      clients: {
        async matchAll() {
          return context.clients;
        },
        openWindow() {
          return Promise.resolve();
        },
      },
      location: { origin: 'https://chalk.test' },
    },
    clients: [],
    caches: { open() {}, keys() {}, delete() {} },
    fetch() {
      return Promise.resolve();
    },
    Request: class {},
    Response: class {},
    URL,
  });
  vm.runInContext(source, context, { filename: 'sw.js' });
  return {
    listeners,
    notifications,
    setClients(clients) {
      context.clients = clients;
    },
  };
}

function push(worker, payload) {
  let job = Promise.resolve();
  worker.listeners.push({
    data: payload === undefined ? null : { json: () => payload },
    waitUntil(promise) {
      job = promise;
    },
  });
  return job;
}

void test('the service worker alerts only when the workout is not on screen', async () => {
  const worker = loadWorker();
  worker.setClients([{ visibilityState: 'visible', focus() {} }]);
  await push(worker, { title: 'Rest done', body: 'Time for the next set.', vibrate: [50, 80, 90] });
  assert.equal(worker.notifications.length, 0);

  worker.setClients([{ visibilityState: 'hidden', focus() {} }]);
  await push(worker, { title: 'Rest done', body: 'Time for the next set.', vibrate: [50, 80, 90] });
  assert.equal(worker.notifications.length, 1);
  assert.equal(worker.notifications[0].title, 'Rest done');
  assert.deepEqual([...worker.notifications[0].options.vibrate], [50, 80, 90]);
  assert.equal(worker.notifications[0].options.silent, undefined);

  worker.setClients([]);
  await push(worker, undefined);
  assert.equal(worker.notifications[1].title, 'Rest done');
  assert.deepEqual([...worker.notifications[1].options.vibrate], [50, 80, 50, 80, 90]);
});
