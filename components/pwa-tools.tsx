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
  const shellIsCached = async () => {
    if (!('caches' in window)) return false;
    const keys = await caches.keys();
    const shell = keys.find((key) => key.startsWith('gym-shell-'));
    return (
      !!shell &&
      !!(await caches.open(shell)).match(new URL('/', location.href).toString())
    );
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
          const inspect = async () => {
            // An active worker alone is not enough: a failed install can leave
            // a worker present without a complete shell for the next offline
            // launch. Only promise offline use after the root shell is cached.
            setOfflineReady(
              !!navigator.serviceWorker.controller && (await shellIsCached()),
            );
            const ready = !!nextRegistration.waiting;
            setUpdate(ready);
            onUpdateReady?.(ready ? applyUpdate : null);
          };
          void inspect();
          nextRegistration.addEventListener('updatefound', () =>
            nextRegistration.installing?.addEventListener('statechange', () =>
              void inspect(),
            ),
          );
          void navigator.serviceWorker.ready.then(() => void inspect());
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
  if (!open) return null;
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
      a.download = `repwise-${new Date().toISOString().slice(0, 10)}.json`;
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
    <section className="app-tools settings-tools settings-section" aria-labelledby="device-settings-title">
      <div className="settings-section-heading">
        <div><span>02</span><h2 id="device-settings-title">Data &amp; device</h2></div>
        <p>Offline access, updates, and private backups.</p>
      </div>
      <div className="device-settings-grid">
        <section className="device-setting-card">
          <div className="device-setting-title">
            <div><span className="device-setting-number">A</span><h3>Install on iPhone</h3></div>
            <output className={offlineReady && data ? 'is-ready' : ''}>
              {offlineReady && data ? 'Ready offline' : 'Online setup needed'}
              {pending ? ` · ${pending} waiting` : ''}
            </output>
          </div>
          <p>
            In Safari, tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.
            Open Repwise online once before taking it offline.
          </p>
          {update && (
            <p className="device-update">
              A new version is ready. Finish your entry, then{' '}
              <button className="text-button" onClick={applyUpdate}>update now</button>.
            </p>
          )}
        </section>
        <section className="device-setting-card">
          <div className="device-setting-title">
            <div><span className="device-setting-number">B</span><h3>Backup &amp; restore</h3></div>
          </div>
          <p>Keep a private copy of workouts, body weight, and your program.</p>
          <div className="backup-actions">
            <button
              className="text-button"
              disabled={!data}
              onClick={() => void exportBackup()}
            >
              Export backup
            </button>
            <label className="restore-label">
              Import backup
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
        </section>
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
      <details className="sync-details">
        <summary>How data and sync work</summary>
        <p>
          Repwise keeps an offline copy on this device. For edits to the same
          set, body-weight date, or program, the latest synced change wins.
          Restoring a backup only replaces matching records.
        </p>
      </details>
      {message && <output className="settings-message">{message}</output>}
    </section>
  );
}
