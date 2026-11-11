import assert from 'node:assert/strict';
import { test } from 'node:test';
import { REST_COMPLETE_VIBRATION } from '../lib/rest-cue';
import {
  FOREGROUND_CUE_GRACE_MS,
  REST_ALARM_HOLD_GRACE_MS,
  REST_ALARM_MAX_LATE_MS,
  applyRestAlarm,
  parsePushSubscription,
  parseRestAlarmHold,
  parseRestAlarmSchedule,
  readVapidConfig,
  restAlarmShouldExpire,
  restAlarmShouldSend,
  restEndAction,
  restPushNotification,
  restPushShouldNotify,
  vapidPublicKeyBytes,
  type RestAlarm,
} from '../lib/rest-alarm';
import { createRestPush, type RestPushDeps, type RestPushPermission } from '../lib/rest-push';

const now = 1_700_000_000_000;

function alarm(partial: Partial<RestAlarm> = {}): RestAlarm {
  return {
    endsAt: now + 60_000,
    held: true,
    state: 'scheduled',
    ...partial,
  };
}

void test('foreground rest plays the chime and a backgrounded rest leaves the push', () => {
  const running = {
    until: now + 30_000,
    now,
    visible: true,
    alreadySignaled: false,
    pushArmed: true,
    leftForeground: false,
  };
  assert.equal(restEndAction(running), 'wait');
  assert.equal(
    restEndAction({ ...running, now: running.until, visible: true, leftForeground: false }),
    'play',
  );
  assert.equal(
    restEndAction({ ...running, now: running.until, visible: false, pushArmed: true }),
    'skip',
  );
  assert.equal(
    restEndAction({ ...running, now: running.until, visible: false, pushArmed: false }),
    'wait',
  );
  assert.equal(
    restEndAction({
      ...running,
      now: running.until + 1_000,
      visible: true,
      pushArmed: false,
      leftForeground: true,
    }),
    'play',
    'without push, returning to the app still plays the chime',
  );
  assert.equal(
    restEndAction({
      ...running,
      now: running.until + 1_000,
      visible: true,
      pushArmed: true,
      leftForeground: true,
    }),
    'skip',
    'a rest that ended in the background belongs to the notification',
  );
  assert.equal(
    restEndAction({
      ...running,
      now: running.until + FOREGROUND_CUE_GRACE_MS + 1,
      visible: true,
      pushArmed: true,
      leftForeground: false,
    }),
    'skip',
  );
  assert.equal(restEndAction({ ...running, until: 0, now: running.until }), 'skip');
  assert.equal(
    restEndAction({ ...running, now: running.until, alreadySignaled: true }),
    'skip',
  );
});

void test('a push notifies only when the app is not on screen', () => {
  assert.equal(restPushShouldNotify([]), true);
  assert.equal(restPushShouldNotify([{ visibilityState: 'hidden' }]), true);
  assert.equal(restPushShouldNotify([{ visibilityState: 'visible' }]), false);
  assert.equal(
    restPushShouldNotify([{ visibilityState: 'hidden' }, { visibilityState: 'visible' }]),
    false,
  );
});

void test('scheduling, skip, and finish follow one alarm', () => {
  const endsAt = now + 90_000;
  let current = applyRestAlarm(null, { type: 'schedule', endsAt, held: true });
  assert.deepEqual(current, alarm({ endsAt, held: true }));
  assert.equal(restAlarmShouldSend(current!, now + 90_000), false);
  assert.equal(restAlarmShouldSend(current!, endsAt + REST_ALARM_HOLD_GRACE_MS), true);

  current = applyRestAlarm(current, { type: 'hold', held: false });
  assert.equal(current?.held, false);
  assert.equal(restAlarmShouldSend(current!, endsAt), true);

  current = applyRestAlarm(current, { type: 'cancel' });
  assert.equal(current?.state, 'cancelled');
  assert.equal(restAlarmShouldSend(current!, endsAt + REST_ALARM_HOLD_GRACE_MS), false);

  const replaced = applyRestAlarm(alarm({ endsAt }), {
    type: 'schedule',
    endsAt: endsAt + 30_000,
    held: true,
  });
  assert.equal(replaced?.endsAt, endsAt + 30_000);
  assert.equal(replaced?.state, 'scheduled');

  const sending = applyRestAlarm(replaced, { type: 'claim' });
  assert.equal(sending?.state, 'sending');
  const rescheduled = applyRestAlarm(sending, {
    type: 'schedule',
    endsAt: endsAt + 60_000,
    held: false,
  });
  assert.equal(applyRestAlarm(rescheduled, { type: 'sent' })?.state, 'scheduled');
  assert.equal(applyRestAlarm(sending, { type: 'sent' })?.state, 'sent');
  assert.equal(applyRestAlarm(sending, { type: 'cancel' })?.state, 'cancelled');
  assert.equal(applyRestAlarm(sending, { type: 'release' })?.state, 'scheduled');

  const stale = alarm({ endsAt: now - REST_ALARM_MAX_LATE_MS - 1, held: false });
  assert.equal(restAlarmShouldExpire(stale, now), true);
  assert.equal(restAlarmShouldSend(stale, now), false);
});

void test('alarm and subscription payloads are rejected when they are unsafe', () => {
  assert.deepEqual(parseRestAlarmSchedule({ endsAt: now + 60_000, held: false }, now), {
    endsAt: now + 60_000,
    held: false,
  });
  assert.equal(parseRestAlarmSchedule({ endsAt: now + 31 * 60_000, held: true }, now), null);
  assert.equal(parseRestAlarmSchedule({ endsAt: now - 6_000, held: true }, now), null);
  assert.equal(parseRestAlarmSchedule({ endsAt: now + 1_000, held: 'yes' }, now), null);
  assert.deepEqual(parseRestAlarmHold({ held: true }), { held: true });
  assert.equal(parseRestAlarmHold({ held: 1 }), null);

  const subscription = {
    endpoint: 'https://web.push.apple.com/example',
    keys: { p256dh: 'a'.repeat(20), auth: 'b'.repeat(16) },
  };
  assert.deepEqual(parsePushSubscription(subscription), subscription);
  assert.equal(parsePushSubscription({ ...subscription, endpoint: 'http://nope' }), null);

  assert.equal(readVapidConfig({}), null);
  assert.equal(
    readVapidConfig({
      VAPID_PUBLIC_KEY: 'pub',
      VAPID_PRIVATE_KEY: 'priv',
      VAPID_SUBJECT: 'http://example.com',
    }),
    null,
  );
  assert.deepEqual(
    readVapidConfig({
      VAPID_PUBLIC_KEY: ' pub ',
      VAPID_PRIVATE_KEY: ' priv ',
      VAPID_SUBJECT: 'mailto:owner@example.com',
    }),
    { publicKey: 'pub', privateKey: 'priv', subject: 'mailto:owner@example.com' },
  );
  assert.deepEqual([...vapidPublicKeyBytes('AQID')], [1, 2, 3]);
  assert.deepEqual(restPushNotification().vibrate, [...REST_COMPLETE_VIBRATION]);
  assert.equal(restPushNotification().title, 'Rest done');
});

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

function deferred<T = void>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

void test('a granted phone schedules on rest and cancels on skip or finish', async () => {
  const calls: { path: string; method: string; body?: unknown }[] = [];
  const gate = deferred();
  let permission: RestPushPermission = 'granted';
  const storage = memoryStorage();
  const session = memoryStorage();
  const deps: RestPushDeps = {
    permission: () => permission,
    requestPermission: () => Promise.reject(new Error('prompt is not a user gesture here')),
    subscribe: async () => ({
      endpoint: 'https://web.push.apple.com/device',
      keys: { p256dh: 'p'.repeat(20), auth: 'a'.repeat(16) },
    }),
    storage,
    session,
    fetch: async (path, init) => {
      const body = init.body ? (JSON.parse(init.body) as unknown) : undefined;
      calls.push({ path, method: init.method ?? 'GET', body });
      if (path === '/api/rest-push') return { ok: true, status: 200, json: async () => ({ enabled: true, publicKey: 'QQ' }) };
      if (path === '/api/rest-alarm' && init.method === 'PUT') await gate.promise;
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    },
  };
  const push = createRestPush(deps);
  const endsAt = now + 60_000;
  const syncing = push.sync(endsAt, true);
  void push.hold(false);
  assert.equal(calls.some((call) => call.path === '/api/rest-alarm'), false);
  gate.resolve();
  await syncing;
  await push.hold(false);
  assert.equal(push.isArmed(endsAt), true);
  const schedule = calls.find((call) => call.path === '/api/rest-alarm' && call.method === 'PUT');
  assert.deepEqual(schedule?.body, { endsAt, held: false });
  const hold = calls.find((call) => call.path === '/api/rest-alarm/hold');
  assert.deepEqual(hold?.body, { held: false });

  calls.length = 0;
  await push.cancel();
  assert.equal(push.isArmed(endsAt), false);
  assert.deepEqual(calls.map((call) => `${call.method} ${call.path}`), ['DELETE /api/rest-alarm']);
  permission = 'denied';
  await push.sync(endsAt + 1_000, true);
  assert.equal(push.isArmed(endsAt + 1_000), false);
});

void test('notification permission is asked once from a gesture and denial does not arm', async () => {
  let permission: RestPushPermission = 'default';
  let prompts = 0;
  const storage = memoryStorage();
  const session = memoryStorage();
  const deps: RestPushDeps = {
    permission: () => permission,
    requestPermission: () => {
      prompts++;
      permission = 'denied';
      return Promise.resolve('denied');
    },
    subscribe: async () => null,
    storage,
    session,
    fetch: async () => {
      throw new Error('denied phones do not call the server');
    },
  };
  const push = createRestPush(deps);
  push.armFromGesture();
  push.armFromGesture();
  assert.equal(prompts, 1);
  await Promise.resolve();
  await push.sync(now + 30_000, true);
  assert.equal(push.isArmed(now + 30_000), false);

  permission = 'unsupported';
  prompts = 0;
  push.armFromGesture();
  assert.equal(prompts, 0);
});

void test('a missing push configuration leaves the alarm unarmed', async () => {
  const storage = memoryStorage();
  const push = createRestPush({
    permission: () => 'granted',
    requestPermission: () => Promise.resolve('granted'),
    subscribe: async () => {
      throw new Error('no key');
    },
    storage,
    session: memoryStorage(),
    fetch: async (path) => {
      if (path === '/api/rest-push') return { ok: true, status: 200, json: async () => ({ enabled: false }) };
      throw new Error(`unexpected ${path}`);
    },
  });
  await push.sync(now + 45_000, true);
  assert.equal(push.isArmed(now + 45_000), false);
});
