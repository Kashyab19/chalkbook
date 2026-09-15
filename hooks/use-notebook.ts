'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  commit,
  transact,
  acknowledge,
  mergeServer,
  type Snapshot,
} from '@/lib/notebook-store';
import {
  applyAction,
  validateAction,
  type Action,
  type Operation,
} from '@/lib/operations';
import { type Data } from '@/lib/training';
import { deviceOwner } from '@/lib/device-account';
import { syncRequestError } from '@/lib/sync-error';

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
      signal: AbortSignal.timeout(15000),
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
  const [localError, setLocalError] = useState('');
  const [writingLocally, setWritingLocally] = useState(false);
  const running = useRef<Promise<void> | null>(null);
  const again = useRef(false);
  const writing = useRef(0);
  const channel = useRef<BroadcastChannel | null>(null);
  const publish = useCallback((s: Snapshot) => {
    if (writing.current) return;
    setSnapshot((current) =>
      !current || s.revision >= current.revision ? s : current,
    );
  }, []);
  const sync = useCallback(() => {
    if (running.current) {
      again.current = true;
      return running.current;
    }
    running.current = (async () => {
      setSyncing(true);
      try {
        do {
          again.current = false;
          let s = await transact();
          publish(s);
          while (s.pending.length) {
            const op = s.pending[0];
            await request(op);
            s = await acknowledge(op.id);
            publish(s);
          }
          const revision = s.revision;
          const data = (await request()) as Data;
          const result = await mergeServer(data, revision);
          s = result.snapshot;
          publish(s);
          if (s.pending.length || !result.merged) again.current = true;
          setError('');
        } while (again.current && navigator.onLine);
        channel.current?.postMessage('refresh');
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setSyncing(false);
        running.current = null;
      }
    })();
    return running.current;
  }, [publish]);
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
        void sync();
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
    [publish, sync],
  );
  useEffect(() => {
    void (async () => {
      try {
        const snapshot = await transact();
        publish(snapshot);
        await sync();
      } catch (e) {
        setLocalError(String(e));
      } finally {
        setInitializing(false);
      }
    })();
    const foreground = () => {
      if (document.visibilityState === 'visible') {
        void sync();
        void navigator.storage?.persist?.().catch(() => {});
      }
    };
    const online = () => {
      void sync();
    };
    const storageError = (event: Event) =>
      setLocalError((event as CustomEvent<string>).detail);
    window.addEventListener('gym-storage-error', storageError);
    window.addEventListener('online', online);
    document.addEventListener('visibilitychange', foreground);
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine)
        void sync();
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
      document.removeEventListener('visibilitychange', foreground);
      clearInterval(timer);
      channel.current?.close();
    };
  }, [publish, sync]);
  return {
    data: snapshot?.data,
    initializing,
    save,
    sync,
    localError,
    error,
    pending: snapshot?.pending.length ?? 0,
    status: localError
      ? 'Not saved on device'
      : writingLocally
        ? 'Saving on device…'
        : syncing
          ? 'Syncing'
          : snapshot?.pending.length || error
            ? 'Saved on device'
            : snapshot?.lastSync
              ? 'Synced'
              : 'Loading…',
  };
}
