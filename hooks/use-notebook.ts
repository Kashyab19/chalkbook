'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  commit,
  loadLocal,
  transact,
  acknowledge,
  mergeServer,
  type Snapshot,
} from '@/lib/notebook-store';
import { flushPending } from '@/lib/sync-flush';
import {
  applyAction,
  validateAction,
  type Action,
  type Operation,
} from '@/lib/operations';
import { type Data } from '@/lib/training';
import { deviceOwner } from '@/lib/device-account';
import { syncRequestError } from '@/lib/sync-error';
import {
  backoffDelayMs,
  decideSync,
  isAuthSyncError,
  SYNC_REQUEST_TIMEOUT_MS,
} from '@/lib/sync-schedule';

async function request(operation?: Operation): Promise<Data | { ok: boolean }> {
  let response: Response;
  try {
    response = await fetch('/api/log', {
      method: operation ? 'POST' : 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: {
        ...(operation ? { 'Content-Type': 'application/json' } : {}),
        ...(deviceOwner() ? { 'X-Notebook-Owner': deviceOwner()! } : {}),
      },
      body: operation ? JSON.stringify(operation) : undefined,
      signal: AbortSignal.timeout(SYNC_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw syncRequestError(error);
  }
  if (
    !response.ok ||
    !response.headers.get('content-type')?.includes('application/json')
  ) {
    if (
      response.status === 401 ||
      response.status === 403 ||
      response.status === 409 ||
      response.redirected
    )
      throw Error(
        'Sign in online to resume sync. Your device changes are safe.',
      );
    throw Error(
      'Sync unavailable. Changes stay on this device and will retry.',
    );
  }
  const value = (await response.json()) as
    | Data
    | { data: Data; user: { id: string } }
    | { ok: boolean };
  return 'data' in value && 'user' in value ? value.data : value;
}
export function useNotebook() {
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [initializing, setInitializing] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [syncPaused, setSyncPaused] = useState(false);
  const [localError, setLocalError] = useState('');
  const [writingLocally, setWritingLocally] = useState(false);
  const [recovered, setRecovered] = useState(false);
  const running = useRef<Promise<void> | null>(null);
  const again = useRef(false);
  const writing = useRef(0);
  const failures = useRef(0);
  const nextAttemptAt = useRef(0);
  const channel = useRef<BroadcastChannel | null>(null);
  const runSyncRef = useRef<(force?: boolean) => Promise<void>>(async () => {});
  const publish = useCallback((s: Snapshot) => {
    if (writing.current) return;
    setSnapshot((current) =>
      !current || s.revision >= current.revision ? s : current,
    );
  }, []);
  const runSync = useCallback((force = false) => {
    if (running.current) {
      again.current = true;
      return running.current;
    }
    const decision = decideSync({
      now: Date.now(),
      nextAttemptAt: nextAttemptAt.current,
      online: navigator.onLine,
      force,
    });
    if (decision.type === 'wait') return Promise.resolve();
    if (decision.type === 'offline') {
      setSyncPaused(true);
      return Promise.resolve();
    }
    running.current = (async () => {
      setSyncing(true);
      try {
        do {
          again.current = false;
          if (!navigator.onLine) {
            setSyncPaused(true);
            return;
          }
          let s = await transact();
          publish(s);
          const flushed = await flushPending({
            snapshot: s,
            post: async (operation) => {
              await request(operation);
            },
            acknowledge,
            online: () => navigator.onLine,
            publish,
          });
          if (flushed.paused) {
            setSyncPaused(true);
            return;
          }
          s = flushed.snapshot;
          if (!navigator.onLine) {
            setSyncPaused(true);
            return;
          }
          const revision = s.revision;
          const data = (await request()) as Data;
          const result = await mergeServer(data, revision);
          s = result.snapshot;
          publish(s);
          if (s.pending.length || !result.merged) again.current = true;
          failures.current = 0;
          nextAttemptAt.current = 0;
          setSyncPaused(false);
          setError('');
        } while (again.current && navigator.onLine);
        if (!navigator.onLine) setSyncPaused(true);
      } catch (e) {
        if (isAuthSyncError(e)) {
          failures.current = 0;
          nextAttemptAt.current = 0;
          setSyncPaused(false);
          setError(e.message);
        } else {
          // One timed-out request is enough. Logging stays local, and the next
          // set or the foreground retry sends the same operation ids again.
          failures.current += 1;
          nextAttemptAt.current = Date.now() + backoffDelayMs(failures.current);
          setSyncPaused(true);
          setError('');
        }
      } finally {
        setSyncing(false);
        const followUp = again.current;
        again.current = false;
        running.current = null;
        if (followUp) void runSyncRef.current(false);
      }
    })();
    return running.current;
  }, [publish]);
  const sync = useCallback(() => runSyncRef.current(true), []);
  const save = useCallback(
    async (action: Action | Action[]) => {
      const actions = Array.isArray(action) ? action : [action];
      try {
        actions.forEach(validateAction);
      } catch (error) {
        setLocalError((error as Error).message);
        return false;
      }
      writing.current++;
      setWritingLocally(true);
      setSnapshot((current) =>
        current?.data
          ? { ...current, data: actions.reduce(applyAction, current.data) }
          : current,
      );
      try {
        const s = await commit(actions);
        writing.current--;
        setWritingLocally(writing.current > 0);
        publish(s);
        setLocalError('');
        channel.current?.postMessage('refresh');
        void runSyncRef.current(false);
        return true;
      } catch (e) {
        writing.current--;
        setWritingLocally(writing.current > 0);
        // Keep the attempted value visible, with an explicit failure. Never call it
        // saved until the IndexedDB transaction has completed.
        setLocalError(
          `Not saved on device: ${(e as Error).message} Keep the app open and retry this edit.`,
        );
        return false;
      }
    },
    [publish],
  );
  useEffect(() => {
    runSyncRef.current = runSync;
  }, [runSync]);
  useEffect(() => {
    void (async () => {
      try {
        // Do this before the first read. It is a no-op on browsers that do not
        // expose persistent storage, but improves iOS/Android eviction odds.
        void navigator.storage?.persist?.().catch(() => {});
        const loaded = await loadLocal();
        if (loaded.recovered) setRecovered(true);
        const snapshot = loaded.snapshot;
        publish(snapshot);
        // A notebook already on the device opens immediately. The network is
        // only allowed to delay the first paint when there is nothing local yet.
        if (snapshot.data) {
          setInitializing(false);
          void runSyncRef.current(false);
        } else {
          await runSyncRef.current(false);
        }
      } catch (e) {
        setLocalError(String(e));
      } finally {
        setInitializing(false);
      }
    })();
    const foreground = () => {
      if (document.visibilityState === 'visible') {
        void runSyncRef.current(false);
        void navigator.storage?.persist?.().catch(() => {});
      }
    };
    const online = () => {
      void runSyncRef.current(true);
    };
    const offline = () => setSyncPaused(true);
    const storageError = (event: Event) =>
      setLocalError((event as CustomEvent<string>).detail);
    window.addEventListener('gym-storage-error', storageError);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    document.addEventListener('visibilitychange', foreground);
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine)
        void runSyncRef.current(false);
    }, 30000);
    if ('BroadcastChannel' in window) {
      channel.current = new BroadcastChannel('gym-notebook');
      channel.current.onmessage = () => {
        void transact().then(publish);
      };
    }
    return () => {
      window.removeEventListener('gym-storage-error', storageError);
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      document.removeEventListener('visibilitychange', foreground);
      clearInterval(timer);
      channel.current?.close();
    };
  }, [publish]);
  return {
    data: snapshot?.data,
    initializing,
    save,
    sync,
    localError,
    error,
    syncPaused,
    pending: snapshot?.pending.length ?? 0,
    recovered,
    status: localError
      ? 'Not saved on device'
      : writingLocally
        ? 'Saving on device…'
        : syncing
          ? 'Syncing'
          : snapshot?.pending.length || syncPaused || error
            ? 'Saved on device'
            : snapshot?.lastSync
              ? 'Synced'
              : 'Loading…',
  };
}
