import { REST_COMPLETE_VIBRATION } from './rest-cue';

/**
 * Foreground rest-end cue versus the background push.
 *
 * iOS suspends page timers and Web Audio when an installed PWA is backgrounded
 * or the screen locks, so the in-app chime cannot fire then. The server sends
 * one Web Push at the end of rest instead. Safari revokes push permission if a
 * delivered push does not show a notification, so the server must not send
 * while the page is going to play the chime itself.
 *
 * While the page is visible it holds the alarm. The server waits
 * `REST_ALARM_HOLD_GRACE_MS` after rest ends for a cancel. Hiding the page
 * releases the hold, and the push goes out at the scheduled time. Cancelling
 * covers skip, undo, finish, and a foreground chime.
 */

export const REST_ALARM_HOLD_GRACE_MS = 10_000;
export const REST_ALARM_MAX_LATE_MS = 120_000;
export const FOREGROUND_CUE_GRACE_MS = 3_000;

export type RestAlarmState = 'scheduled' | 'sending' | 'sent' | 'cancelled';

export type RestAlarm = {
  endsAt: number;
  held: boolean;
  state: RestAlarmState;
};

export type RestAlarmCommand =
  | { type: 'schedule'; endsAt: number; held: boolean }
  | { type: 'hold'; held: boolean }
  | { type: 'cancel' }
  | { type: 'claim' }
  | { type: 'sent' }
  | { type: 'release' }
  | { type: 'expire' };

export type RestEndAction = 'play' | 'wait' | 'skip';

export function restEndAction(input: {
  until: number;
  now: number;
  visible: boolean;
  alreadySignaled: boolean;
  pushArmed: boolean;
  leftForeground: boolean;
}): RestEndAction {
  if (input.alreadySignaled || input.until <= 0) return 'skip';
  if (input.now < input.until) return 'wait';
  // A hidden page cannot play audio reliably. Leave the push in place when it
  // is armed. Otherwise wait until the page is visible and play the chime then.
  if (!input.visible) return input.pushArmed ? 'skip' : 'wait';
  if (
    input.pushArmed &&
    (input.leftForeground || input.now - input.until > FOREGROUND_CUE_GRACE_MS)
  ) {
    return 'skip';
  }
  return 'play';
}

/** Show the system notification only when no open window is already on screen. */
export function restPushShouldNotify(
  clients: readonly { visibilityState?: string }[],
): boolean {
  return !clients.some((client) => client.visibilityState === 'visible');
}

export function applyRestAlarm(
  current: RestAlarm | null,
  command: RestAlarmCommand,
): RestAlarm | null {
  if (command.type === 'schedule') {
    return { endsAt: command.endsAt, held: command.held, state: 'scheduled' };
  }
  if (!current) return null;
  if (command.type === 'hold') {
    if (current.state !== 'scheduled') return current;
    return { ...current, held: command.held };
  }
  if (command.type === 'cancel' || command.type === 'expire') {
    if (current.state !== 'scheduled' && current.state !== 'sending') return current;
    return { ...current, state: 'cancelled' };
  }
  if (command.type === 'claim') {
    if (current.state !== 'scheduled') return current;
    return { ...current, state: 'sending' };
  }
  if (command.type === 'sent') {
    if (current.state !== 'sending') return current;
    return { ...current, state: 'sent' };
  }
  if (command.type === 'release') {
    if (current.state !== 'sending') return current;
    return { ...current, state: 'scheduled' };
  }
  return current;
}

export function restAlarmShouldSend(alarm: RestAlarm, now: number): boolean {
  if (alarm.state !== 'scheduled') return false;
  if (now < alarm.endsAt || now > alarm.endsAt + REST_ALARM_MAX_LATE_MS) return false;
  if (!alarm.held) return true;
  return now >= alarm.endsAt + REST_ALARM_HOLD_GRACE_MS;
}

export function restAlarmShouldExpire(alarm: RestAlarm, now: number): boolean {
  return (
    alarm.state === 'scheduled' && now > alarm.endsAt + REST_ALARM_MAX_LATE_MS
  );
}

export function parseRestAlarmSchedule(
  value: unknown,
  now: number,
): { endsAt: number; held: boolean } | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as { endsAt?: unknown; held?: unknown };
  if (typeof record.endsAt !== 'number' || !Number.isFinite(record.endsAt)) return null;
  if (typeof record.held !== 'boolean') return null;
  if (record.endsAt < now - 5_000 || record.endsAt > now + 30 * 60 * 1000) return null;
  return { endsAt: record.endsAt, held: record.held };
}

export function parseRestAlarmHold(value: unknown): { held: boolean } | null {
  if (!value || typeof value !== 'object') return null;
  const held = (value as { held?: unknown }).held;
  if (typeof held !== 'boolean') return null;
  return { held };
}

export type PushSubscriptionRecord = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export function parsePushSubscription(value: unknown): PushSubscriptionRecord | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as { endpoint?: unknown; keys?: unknown };
  if (!record.keys || typeof record.keys !== 'object') return null;
  const keys = record.keys as { p256dh?: unknown; auth?: unknown };
  if (typeof record.endpoint !== 'string' || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') {
    return null;
  }
  if (!record.endpoint.startsWith('https://') || record.endpoint.length > 2000) return null;
  if (keys.p256dh.length < 16 || keys.p256dh.length > 200) return null;
  if (keys.auth.length < 8 || keys.auth.length > 200) return null;
  return { endpoint: record.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } };
}

export type VapidConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

export function readVapidConfig(env: { [key: string]: string | undefined }): VapidConfig | null {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim() ?? '';
  const privateKey = env.VAPID_PRIVATE_KEY?.trim() ?? '';
  const subject = env.VAPID_SUBJECT?.trim() ?? '';
  if (!publicKey || !privateKey || !subject) return null;
  if (!subject.startsWith('mailto:') && !subject.startsWith('https://')) return null;
  try {
    const url = new URL(subject);
    if (url.protocol !== 'mailto:' && url.protocol !== 'https:') return null;
  } catch {
    return null;
  }
  return { publicKey, privateKey, subject };
}

export function restPushNotification() {
  return {
    title: 'Rest done',
    body: 'Time for the next set.',
    vibrate: [...REST_COMPLETE_VIBRATION],
  };
}

export function vapidPublicKeyBytes(publicKey: string): Uint8Array {
  const pad = publicKey.length % 4 === 0 ? '' : '='.repeat(4 - (publicKey.length % 4));
  const binary = atob(publicKey.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
