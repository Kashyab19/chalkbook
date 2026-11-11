import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import webpush from 'web-push';
import {
  parsePushSubscription,
  parseRestAlarmHold,
  parseRestAlarmSchedule,
  readVapidConfig,
  restAlarmShouldExpire,
  restAlarmShouldSend,
  restPushNotification,
  type RestAlarm,
} from '../lib/rest-alarm';
import type { User } from './auth';
import { database } from './postgres';

/**
 * One alarm per signed-in owner. The page schedules it when rest starts, releases
 * the foreground hold when the app hides, and cancels on skip, undo, finish, or
 * the in-app chime. Missing VAPID keys or the push tables disable this path.
 * The workout API keeps working either way.
 */

let enabled = false;
let storageErrorLogged = false;
let ticking = false;
const retryAt = new Map<string, number>();

function json(res: ServerResponse, value: unknown, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(value));
}

async function readJson(req: IncomingMessage) {
  let length = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > 16_000) throw Error('PAYLOAD_TOO_LARGE');
    chunks.push(buffer);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

function pushStatus(error: unknown) {
  if (error instanceof webpush.WebPushError) return error.statusCode;
  if (typeof error === 'object' && error && 'statusCode' in error) {
    const status = Number((error as { statusCode: unknown }).statusCode);
    return Number.isFinite(status) ? status : 0;
  }
  return 0;
}

function logStorageOnce(error: unknown) {
  if (storageErrorLogged) return;
  storageErrorLogged = true;
  const message = error instanceof Error ? error.message : 'UnknownError';
  console.error(
    'Rest push storage is not ready. Run node scripts/postgres-admin.mjs migrate. ' +
      message,
  );
}

export function startRestPush(): () => void {
  const config = readVapidConfig(process.env);
  if (!config) {
    console.log(
      'Rest push disabled. Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT to enable background rest alerts.',
    );
    return () => {};
  }
  try {
    webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  } catch {
    console.error('Rest push disabled. The VAPID environment variables were rejected.');
    return () => {};
  }
  enabled = true;
  console.log('Rest push enabled.');
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  void (async () => {
    try {
      await recoverSending();
    } catch (error) {
      logStorageOnce(error);
    }
    if (stopped) return;
    void tick();
    timer = setInterval(() => void tick(), 1000);
  })();
  return () => {
    stopped = true;
    enabled = false;
    if (timer) clearInterval(timer);
  };
}

async function recoverSending() {
  await database().query(
    `UPDATE fitness.rest_alarms SET state = 'scheduled' WHERE state = 'sending'`,
  );
}

async function tick() {
  if (!enabled || ticking) return;
  ticking = true;
  try {
    const now = Date.now();
    const due = await database().query<{
      owner_id: string;
      ends_at_ms: string;
      held: boolean;
      token: string;
    }>(
      `SELECT owner_id,
              (EXTRACT(EPOCH FROM ends_at) * 1000)::bigint AS ends_at_ms,
              held,
              token
       FROM fitness.rest_alarms
       WHERE state = 'scheduled' AND ends_at <= now()`,
    );
    for (const row of due.rows) {
      const alarm: RestAlarm = {
        endsAt: Number(row.ends_at_ms),
        held: row.held,
        state: 'scheduled',
      };
      if (restAlarmShouldExpire(alarm, now)) {
        await database().query(
          `UPDATE fitness.rest_alarms SET state = 'cancelled'
           WHERE owner_id = $1 AND token = $2 AND state = 'scheduled'`,
          [row.owner_id, row.token],
        );
        continue;
      }
      if (!restAlarmShouldSend(alarm, now)) continue;
      if ((retryAt.get(row.owner_id) ?? 0) > now) continue;
      await deliver(row.owner_id, row.token);
    }
  } catch (error) {
    logStorageOnce(error);
  } finally {
    ticking = false;
  }
}

async function deliver(ownerId: string, token: string) {
  const claim = await database().query(
    `UPDATE fitness.rest_alarms SET state = 'sending'
     WHERE owner_id = $1 AND token = $2 AND state = 'scheduled'`,
    [ownerId, token],
  );
  if (!claim.rowCount) return;
  const subs = await database().query<{
    endpoint: string;
    p256dh: string;
    auth_secret: string;
  }>(
    `SELECT endpoint, p256dh, auth_secret FROM fitness.push_subscriptions WHERE owner_id = $1`,
    [ownerId],
  );
  if (!subs.rows.length) {
    await database().query(
      `UPDATE fitness.rest_alarms SET state = 'cancelled'
       WHERE owner_id = $1 AND token = $2 AND state = 'sending'`,
      [ownerId, token],
    );
    return;
  }
  const payload = JSON.stringify(restPushNotification());
  let delivered = false;
  let retry = false;
  for (const sub of subs.rows) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_secret } },
        payload,
        { TTL: 120, urgency: 'high', topic: 'rest-complete', timeout: 10_000 },
      );
      delivered = true;
    } catch (error) {
      const status = pushStatus(error);
      if (status === 404 || status === 410) {
        await database().query(`DELETE FROM fitness.push_subscriptions WHERE endpoint = $1`, [
          sub.endpoint,
        ]);
      } else {
        retry = true;
        console.error('Rest push failed', status || 'unknown');
      }
    }
  }
  if (delivered || !retry) retryAt.delete(ownerId);
  else retryAt.set(ownerId, Date.now() + 5_000);
  await database().query(
    `UPDATE fitness.rest_alarms SET state = $3
     WHERE owner_id = $1 AND token = $2 AND state = 'sending'`,
    [ownerId, token, delivered || !retry ? 'sent' : 'scheduled'],
  );
}

export async function handleRestPush(
  req: IncomingMessage,
  res: ServerResponse,
  user: User,
  url: URL,
): Promise<boolean> {
  const path = url.pathname;
  if (
    path !== '/api/rest-push' &&
    path !== '/api/rest-push/subscription' &&
    path !== '/api/rest-alarm' &&
    path !== '/api/rest-alarm/hold'
  ) {
    return false;
  }
  try {
    if (path === '/api/rest-push' && req.method === 'GET') {
      const config = readVapidConfig(process.env);
      json(res, config && enabled ? { enabled: true, publicKey: config.publicKey } : { enabled: false });
      return true;
    }
    if (!enabled) {
      json(res, { error: 'Push is not configured' }, 503);
      return true;
    }
    if (path === '/api/rest-push/subscription' && req.method === 'PUT') {
      const subscription = parsePushSubscription(await readJson(req));
      if (!subscription) {
        json(res, { error: 'Invalid subscription' }, 400);
        return true;
      }
      await database().query(
        `INSERT INTO fitness.push_subscriptions (endpoint, owner_id, p256dh, auth_secret)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (endpoint) DO UPDATE
         SET owner_id = EXCLUDED.owner_id,
             p256dh = EXCLUDED.p256dh,
             auth_secret = EXCLUDED.auth_secret`,
        [subscription.endpoint, user.id, subscription.keys.p256dh, subscription.keys.auth],
      );
      json(res, { ok: true });
      return true;
    }
    if (path === '/api/rest-alarm' && req.method === 'PUT') {
      const schedule = parseRestAlarmSchedule(await readJson(req), Date.now());
      if (!schedule) {
        json(res, { error: 'Invalid rest alarm' }, 400);
        return true;
      }
      await database().query(
        `INSERT INTO fitness.rest_alarms (owner_id, ends_at, held, token, state)
         VALUES ($1, to_timestamp($2 / 1000.0), $3, $4, 'scheduled')
         ON CONFLICT (owner_id) DO UPDATE
         SET ends_at = EXCLUDED.ends_at,
             held = EXCLUDED.held,
             token = EXCLUDED.token,
             state = 'scheduled'`,
        [user.id, schedule.endsAt, schedule.held, randomUUID()],
      );
      json(res, { ok: true });
      return true;
    }
    if (path === '/api/rest-alarm/hold' && req.method === 'POST') {
      const hold = parseRestAlarmHold(await readJson(req));
      if (!hold) {
        json(res, { error: 'Invalid rest alarm' }, 400);
        return true;
      }
      await database().query(
        `UPDATE fitness.rest_alarms SET held = $2
         WHERE owner_id = $1 AND state = 'scheduled'`,
        [user.id, hold.held],
      );
      json(res, { ok: true });
      return true;
    }
    if (path === '/api/rest-alarm' && req.method === 'DELETE') {
      await database().query(
        `UPDATE fitness.rest_alarms SET state = 'cancelled'
         WHERE owner_id = $1 AND state IN ('scheduled', 'sending')`,
        [user.id],
      );
      json(res, { ok: true });
      return true;
    }
    json(res, { error: 'Not found' }, 404);
    return true;
  } catch (error) {
    if (error instanceof SyntaxError || (error instanceof Error && error.message === 'PAYLOAD_TOO_LARGE')) {
      throw error;
    }
    logStorageOnce(error);
    json(res, { error: 'Push storage is not ready' }, 503);
    return true;
  }
}
