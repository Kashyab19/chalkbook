import { parsePushSubscription, vapidPublicKeyBytes, type PushSubscriptionRecord } from './rest-alarm';

/**
 * Browser side of the background rest alert.
 *
 * Permission is requested from the logging tap. Denial, a missing service
 * worker, or a server without VAPID keys leaves the foreground chime alone.
 * Scheduling, hold, and cancel run in order so a skip cannot lose to a late
 * schedule, and a lock cannot lose to a schedule that still says "visible".
 */

const ARMED_KEY = 'chalk-rest-alarm-until';
const ASKED_KEY = 'chalk-rest-push-asked';

export type RestPushPermission = 'default' | 'granted' | 'denied' | 'unsupported';

type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

type RestPushResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

export type RestPushDeps = {
  fetch: (
    path: string,
    init: {
      method?: string;
      credentials?: 'same-origin';
      keepalive?: boolean;
      headers?: Record<string, string>;
      body?: string;
    },
  ) => Promise<RestPushResponse>;
  permission: () => RestPushPermission;
  requestPermission: () => Promise<'default' | 'granted' | 'denied'>;
  subscribe: (publicKey: string) => Promise<PushSubscriptionRecord | null>;
  storage: StorageLike;
  session: Pick<StorageLike, 'getItem' | 'setItem'>;
};

export function createRestPush(deps: RestPushDeps) {
  let desired: { endsAt: number; held: boolean } | null = null;
  let chain: Promise<void> = Promise.resolve();
  let subscription: Promise<boolean> | null = null;

  const enqueue = (work: () => Promise<void>) => {
    const run = chain.then(work, work);
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  const remember = (endsAt: number | null) => {
    if (endsAt === null) deps.storage.removeItem(ARMED_KEY);
    else deps.storage.setItem(ARMED_KEY, String(endsAt));
  };

  const request = async (
    path: string,
    init: Parameters<RestPushDeps['fetch']>[1],
  ): Promise<RestPushResponse | null> => {
    try {
      return await deps.fetch(path, init);
    } catch {
      return null;
    }
  };

  const startSubscribe = (prompt: boolean): Promise<boolean> => {
    const current = deps.permission();
    if (current === 'unsupported' || current === 'denied') return Promise.resolve(false);
    if (subscription) return subscription;
    if (current === 'default' && !prompt) return Promise.resolve(false);
    const pendingPermission =
      current === 'granted' ? Promise.resolve('granted' as const) : deps.requestPermission();
    const pending = pendingPermission
      .then(async (permission) => {
        if (permission !== 'granted') return false;
        const config = await request('/api/rest-push', {
          method: 'GET',
          credentials: 'same-origin',
        });
        if (!config?.ok) return false;
        const body = (await config.json()) as { enabled?: unknown; publicKey?: unknown };
        if (body.enabled !== true || typeof body.publicKey !== 'string' || !body.publicKey) {
          return false;
        }
        const record = await deps.subscribe(body.publicKey);
        if (!record) return false;
        const saved = await request('/api/rest-push/subscription', {
          method: 'PUT',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(record),
        });
        return !!saved?.ok;
      })
      .then(
        (ok) => {
          if (!ok) subscription = null;
          return ok;
        },
        () => {
          subscription = null;
          return false;
        },
      );
    subscription = pending;
    return pending;
  };

  const postAlarm = async (endsAt: number) => {
    if (!desired || desired.endsAt !== endsAt) return;
    const saved = await request('/api/rest-alarm', {
      method: 'PUT',
      credentials: 'same-origin',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endsAt: desired.endsAt, held: desired.held }),
    });
    if (!desired || desired.endsAt !== endsAt) {
      remember(null);
      if (saved?.ok) {
        await request('/api/rest-alarm', {
          method: 'DELETE',
          credentials: 'same-origin',
          keepalive: true,
        });
      }
      return;
    }
    remember(saved?.ok ? endsAt : null);
  };

  return {
    isArmed(endsAt: number) {
      return deps.storage.getItem(ARMED_KEY) === String(endsAt);
    },
    armFromGesture() {
      const permission = deps.permission();
      if (permission === 'unsupported' || permission === 'denied') return;
      if (permission === 'default') {
        if (deps.session.getItem(ASKED_KEY) === '1') return;
        deps.session.setItem(ASKED_KEY, '1');
      }
      void startSubscribe(true);
    },
    sync(endsAt: number, held: boolean) {
      desired = { endsAt, held };
      return enqueue(async () => {
        if (!desired || desired.endsAt !== endsAt) return;
        const ready = await startSubscribe(false);
        if (!ready || !desired || desired.endsAt !== endsAt) return;
        await postAlarm(endsAt);
      });
    },
    hold(held: boolean) {
      if (desired) desired.held = held;
      return enqueue(async () => {
        if (!desired) return;
        if (deps.storage.getItem(ARMED_KEY) !== String(desired.endsAt)) return;
        await request('/api/rest-alarm/hold', {
          method: 'POST',
          credentials: 'same-origin',
          keepalive: true,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ held: desired.held }),
        });
      });
    },
    cancel() {
      desired = null;
      remember(null);
      return enqueue(async () => {
        await request('/api/rest-alarm', {
          method: 'DELETE',
          credentials: 'same-origin',
          keepalive: true,
        });
      });
    },
  };
}

export type RestPushClient = ReturnType<typeof createRestPush>;

let browserPush: RestPushClient | null = null;

function browserStorage(): StorageLike {
  const memory = new Map<string, string>();
  const area = () => {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  };
  return {
    getItem(key) {
      try {
        return area()?.getItem(key) ?? memory.get(key) ?? null;
      } catch {
        return memory.get(key) ?? null;
      }
    },
    setItem(key, value) {
      memory.set(key, value);
      try {
        area()?.setItem(key, value);
      } catch {
        // The page copy still covers this visit when storage is blocked.
      }
    },
    removeItem(key) {
      memory.delete(key);
      try {
        area()?.removeItem(key);
      } catch {
        // The page copy is already cleared.
      }
    },
  };
}

function browserSession(): Pick<StorageLike, 'getItem' | 'setItem'> {
  const memory = new Map<string, string>();
  const area = () => {
    try {
      return window.sessionStorage;
    } catch {
      return null;
    }
  };
  return {
    getItem(key) {
      try {
        return area()?.getItem(key) ?? memory.get(key) ?? null;
      } catch {
        return memory.get(key) ?? null;
      }
    },
    setItem(key, value) {
      memory.set(key, value);
      try {
        area()?.setItem(key, value);
      } catch {
        // Asking once per page visit still holds in memory.
      }
    },
  };
}

async function browserSubscribe(publicKey: string): Promise<PushSubscriptionRecord | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  const existing = await navigator.serviceWorker.getRegistration();
  if (!existing) return null;
  const registration = await navigator.serviceWorker.ready;
  const current = await registration.pushManager.getSubscription();
  const subscription =
    current ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidPublicKeyBytes(publicKey) as BufferSource,
    }));
  return parsePushSubscription(subscription.toJSON());
}

function browserRestPush(): RestPushClient | null {
  if (browserPush) return browserPush;
  if (typeof window === 'undefined') return null;
  browserPush = createRestPush({
    fetch: async (path, init) => {
      const response = await fetch(path, init);
      return { ok: response.ok, status: response.status, json: () => response.json() };
    },
    permission: () => {
      if (typeof Notification === 'undefined') return 'unsupported';
      return Notification.permission;
    },
    requestPermission: () => Notification.requestPermission(),
    subscribe: browserSubscribe,
    storage: browserStorage(),
    session: browserSession(),
  });
  return browserPush;
}

export function armRestPushFromGesture(): void {
  browserRestPush()?.armFromGesture();
}

export function syncRestAlarm(endsAt: number, held: boolean): Promise<void> {
  return browserRestPush()?.sync(endsAt, held) ?? Promise.resolve();
}

export function holdRestAlarm(held: boolean): Promise<void> {
  return browserRestPush()?.hold(held) ?? Promise.resolve();
}

export function cancelRestAlarm(): Promise<void> {
  return browserRestPush()?.cancel() ?? Promise.resolve();
}

export function restAlarmIsArmed(endsAt: number): boolean {
  return browserRestPush()?.isArmed(endsAt) ?? false;
}
