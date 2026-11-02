'use client';
import { useState } from 'react';
import { type Data } from '@/lib/training';
import { parseBackup, type Action } from '@/lib/operations';
import { transact } from '@/lib/notebook-store';

type Props = {
  data: Data | null | undefined;
  pending: number;
  save: (actions: Action[]) => Promise<boolean>;
  open?: boolean;
  offlineReady?: boolean;
  updateReady?: boolean;
  applyUpdate?: () => void;
  runtimeMessage?: string;
};
export function PwaTools({
  data,
  pending,
  save,
  open = false,
  offlineReady = false,
  updateReady = false,
  applyUpdate,
  runtimeMessage = '',
}: Props) {
  const [message, setMessage] = useState('');
  const [backup, setBackup] = useState<Data>();
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
      a.download = `chalkbook-${new Date().toISOString().slice(0, 10)}.json`;
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
            Open Chalkbook online once before taking it offline.
          </p>
          {updateReady && applyUpdate && (
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
          Chalkbook keeps an offline copy on this device. For edits to the same
          set, body-weight date, or program, the latest synced change wins.
          Restoring a backup only replaces matching records.
        </p>
      </details>
      {(message || runtimeMessage) && (
        <output className="settings-message">{message || runtimeMessage}</output>
      )}
    </section>
  );
}
