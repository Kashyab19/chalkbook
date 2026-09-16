'use client';
import { useEffect, useRef, useState } from 'react';
import { type Data } from '@/lib/training';
import { parseBackup, type Action } from '@/lib/operations';
import { transact } from '@/lib/notebook-store';

type Props = {
  data: Data | null | undefined;
  pending: number;
  save: (actions: Action[]) => Promise<boolean>;
  sync: () => Promise<void>;
  open?: boolean;
  onUpdateReady?: (apply: (() => void) | null) => void;
};
export function PwaTools({
  data,
  pending,
  save,
  sync,
  open = false,
  onUpdateReady,
}: Props) {
  const [offlineReady, setOfflineReady] = useState(false);
  const [update, setUpdate] = useState(false);
  const [message, setMessage] = useState('');
  const [backup, setBackup] = useState<Data>();
  const registration = useRef<ServiceWorkerRegistration | null>(null);
  const reloadAfterUpdate = useRef(false);
  const applyUpdate = () => {
    if (!registration.current?.waiting) return;
    reloadAfterUpdate.current = true;
    registration.current.waiting.postMessage({ type: 'skip-waiting' });
  };
  useEffect(() => {
    const viewport = window.visualViewport;
    let controllerChanged: (() => void) | undefined;
    const resize = () => {
      const keyboard = !!viewport && window.innerHeight - viewport.height > 150;
      document.documentElement.style.setProperty(
        '--keyboard-offset',
        keyboard
          ? `${Math.max(0, window.innerHeight - viewport!.height - viewport!.offsetTop)}px`
          : '0px',
      );
      if (keyboard && document.activeElement instanceof HTMLInputElement)
        requestAnimationFrame(() =>
          document.activeElement?.scrollIntoView({
            block: 'center',
            behavior: 'auto',
          }),
        );
    };
    viewport?.addEventListener('resize', resize);
    viewport?.addEventListener('scroll', resize);
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      controllerChanged = () => {
        setUpdate(false);
        onUpdateReady?.(null);
        // Reload only after the person explicitly chose Update. Background
        // service-worker activity must never interrupt a workout.
        if (reloadAfterUpdate.current) location.reload();
      };
      navigator.serviceWorker.addEventListener(
        'controllerchange',
        controllerChanged,
      );
      void navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .then((nextRegistration) => {
          registration.current = nextRegistration;
          const inspect = () => {
            setOfflineReady(!!nextRegistration.active);
            const ready = !!nextRegistration.waiting;
            setUpdate(ready);
            onUpdateReady?.(ready ? applyUpdate : null);
          };
          inspect();
          nextRegistration.addEventListener('updatefound', () =>
            nextRegistration.installing?.addEventListener('statechange', inspect),
          );
          void navigator.serviceWorker.ready.then(() => setOfflineReady(true));
          void nextRegistration.update().catch(() => {});
        })
        .catch(() =>
          setMessage(
            'Offline setup has not finished. Reconnect and reopen before training offline.',
          ),
        );
    }
    return () => {
      viewport?.removeEventListener('resize', resize);
      viewport?.removeEventListener('scroll', resize);
      if (controllerChanged)
        navigator.serviceWorker?.removeEventListener(
          'controllerchange',
          controllerChanged,
        );
      onUpdateReady?.(null);
    };
  }, []);
  async function exportBackup() {
    try {
      const current = await transact();
      if (!current.data) throw Error('Load your notebook before exporting.');
      const file = new Blob(
        [
          JSON.stringify(
            {
              format: 'gym-notebook',
              version: 1,
              exportedAt: new Date().toISOString(),
              data: current.data,
            },
            null,
            2,
          ),
        ],
        { type: 'application/json' },
      );
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gym-notebook-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      setMessage(
        'Backup exported, including changes waiting to sync. Keep this private file somewhere safe.',
      );
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  async function restore() {
    if (!backup) return;
    const actions: Action[] = [
      { type: 'program', program: backup.program },
      ...backup.sessions.map((session) => ({
        type: 'restoreSession' as const,
        session,
      })),
      ...backup.body.map((b) => ({ type: 'body' as const, ...b })),
    ];
    if (await save(actions)) {
      setBackup(undefined);
      setMessage('Backup restored on device. It will sync when connected.');
    }
  }
  return (
    <details
      className={`app-tools${open ? '' : ' settings-closed'}`}
      open={open}
    >
      <summary>Install, backup &amp; app settings</summary>
      <h2>Install on your iPhone</h2>
      <p>
        Open this address in Safari, tap Share, then Add to Home Screen. Keep
        Open as Web App enabled if shown, then tap Add.
      </p>
      <p>
        The first visit needs internet. After installing, open the home-screen
        app online once, sign in if asked, and wait for “Synced” and “Ready
        offline” before leaving reception.
      </p>
      <output>
        {offlineReady && data
          ? 'Ready offline'
          : 'Offline setup needs a successful online load'}
        {pending ? ` · ${pending} changes waiting to sync` : ''}
      </output>
      {update && (
        <p>
          A new version is ready. Finish your entry, then{' '}
          <button className="text-button" onClick={applyUpdate}>
            update now
          </button>
          . Saved device changes stay queued across updates.
        </p>
      )}
      <p>
        Your notebook stays on this device for offline use. A device passcode
        protects access. Clearing website data removes unsynced edits; export a
        backup periodically.
      </p>
      <div className="backup-actions">
        <button
          className="text-button"
          disabled={!data}
          onClick={() => void exportBackup()}
        >
          Export backup
        </button>
        <label className="restore-label">
          Choose backup
          <input
            type="file"
            accept="application/json,.json"
            disabled={!data}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              try {
                if (file.size > 20_000_000)
                  throw Error('Backup is too large (20 MB maximum).');
                setBackup(parseBackup(JSON.parse(await file.text())));
                setMessage('');
              } catch (error) {
                setBackup(undefined);
                setMessage((error as Error).message);
              }
            }}
          />
        </label>
      </div>
      {backup && (
        <div className="restore-preview">
          <p>
            Restore {backup.sessions.length} workouts and {backup.body.length}{' '}
            body-weight entries. This replaces your program and matching
            records; records absent from the backup are kept.
          </p>
          <button className="primary" onClick={() => void restore()}>
            Restore this backup
          </button>
          <button className="text-button" onClick={() => setBackup(undefined)}>
            Cancel
          </button>
        </div>
      )}
      <p>
        Sync conflicts: the last change received wins for the same set,
        body-weight date, or program. Different sets are independent. Editing a
        deleted workout does not bring it back. Restoring a backup explicitly
        can.
      </p>
      <output>{message}</output>
    </details>
  );
}
