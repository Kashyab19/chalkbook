import {deviceOwner} from './device-account';
import { type Data } from './training';
import {
  applyAction,
  validateAction,
  validateData,
  type Action,
  type Operation,
} from './operations';
import { createOrderedBackground } from './ordered-background';
import { assembleStartupSnapshot } from './startup-snapshot';

export type Snapshot = {
  data: Data | null;
  pending: Operation[];
  revision: number;
  lastSync: string | null;
};
const recoveryCache = 'gym-notebook-recovery-v1';
const recoveryKey = () =>
  `/__gym-notebook-recovery__/${encodeURIComponent(deviceOwner() ?? 'unassigned')}`;
const empty = (): Snapshot => ({
  data: null,
  pending: [],
  revision: 0,
  lastSync: null,
});
let opening: Promise<IDBDatabase> | undefined;
const recoveryMirrors = createOrderedBackground();

// IndexedDB is the source of truth. This is a deliberately small second local
// copy of the same committed snapshot: it gives us a recovery path if a browser
// loses or corrupts the IndexedDB record while retaining its Cache Storage.
// It never leaves the device and is not used to answer network requests.
async function mirrorRecovery(snapshot: Snapshot) {
  if (!snapshot.data || !('caches' in window)) return;
  try {
    const cache = await caches.open(recoveryCache);
    await cache.put(
      recoveryKey(),
      new Response(JSON.stringify(snapshot), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  } catch {
    // A successful IndexedDB transaction remains a successful local save even
    // when this optional second copy cannot be written.
  }
}

function validRecovery(value: unknown): value is Snapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Partial<Snapshot>;
  try {
    if (!snapshot.data || !Array.isArray(snapshot.pending)) return false;
    validateData(snapshot.data);
    snapshot.pending.forEach((operation) => {
      if (!operation || typeof operation.id !== 'string') throw Error();
      validateAction(operation.action);
    });
    return typeof snapshot.revision === 'number' && Number.isFinite(snapshot.revision);
  } catch {
    return false;
  }
}

async function readRecoverySnapshot(): Promise<Snapshot | null> {
  if (!deviceOwner() || !('caches' in globalThis)) return null;
  try {
    const cache = await caches.open(recoveryCache);
    const response = await cache.match(recoveryKey());
    if (!response) return null;
    const value: unknown = await response.json().catch(() => null);
    return validRecovery(value) ? value : null;
  } catch {
    return null;
  }
}
export function loadLocal() {
  return assembleStartupSnapshot({
    readDatabase: () => transact(),
    readRecovery: readRecoverySnapshot,
    writeIfEmpty: async (candidate) => {
      let used = false;
      const snapshot = await transact((current) => {
        if (current.data) return current;
        used = true;
        return candidate;
      });
      return { snapshot, used };
    },
    mirror: (snapshot) => {
      recoveryMirrors.enqueue(() => mirrorRecovery(snapshot));
    },
  });
}
export async function recover() {
  if (!deviceOwner() || !('caches' in globalThis)) return false;
  return (await loadLocal()).recovered;
}
function database() {
  return (opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(deviceOwner() ? `gym-notebook-${deviceOwner()}` : 'gym-notebook', 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore('notebook');
    request.onsuccess = () => {
      request.result.onversionchange = () => {
        request.result.close();
        opening = undefined;
      };
      resolve(request.result);
    };
    request.onerror = () => {
      opening = undefined;
      reject(request.error);
    };
    request.onblocked = () => {
      opening = undefined;
      reject(
        Error('Close other Gym Notebook windows to finish opening storage.'),
      );
    };
  }));
}
// A single read/write transaction commits the displayed data and its outbox together.
// All edits, acknowledgements, and server merges share this serialization point,
// including edits made in a second tab. No network work happens inside a transaction.
export async function transact(
  change?: (snapshot: Snapshot) => Snapshot,
): Promise<Snapshot> {
  const db = await database();
  const snapshot = await new Promise<Snapshot>((resolve, reject) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction('notebook', change ? 'readwrite' : 'readonly', {
        durability: 'strict',
      });
    } catch {
      tx = db.transaction('notebook', change ? 'readwrite' : 'readonly');
    }
    const store = tx.objectStore('notebook');
    const request = store.get('state');
    let snapshot: Snapshot;
    let error: unknown;
    request.onsuccess = () => {
      try {
        snapshot = request.result ?? empty();
        if (change) {
          snapshot = change(snapshot);
          store.put(snapshot, 'state');
        }
      } catch (e) {
        error = e;
        tx.abort();
      }
    };
    tx.oncomplete = () => resolve(snapshot);
    tx.onabort = tx.onerror = () =>
      reject(
        error ?? tx.error ?? Error('Device storage could not save this edit.'),
      );
  });
  // IndexedDB is the save. Mirror the snapshot afterwards, in order, so logging
  // a set does not wait on Cache Storage and an older copy cannot finish last.
  if (change) recoveryMirrors.enqueue(() => mirrorRecovery(snapshot));
  return snapshot;
}
export async function commit(actions: Action[]) {
  actions.forEach(validateAction);
  const operations = actions.map((action) => ({
    id: crypto.randomUUID(),
    action,
  }));
  return transact((s) => {
    if (!s.data)
      throw Error('Connect once to load your existing notebook first.');
    return {
      ...s,
      data: actions.reduce(applyAction, s.data),
      pending: [...s.pending, ...operations],
      revision: s.revision + 1,
    };
  });
}
export async function acknowledge(id: string) {
  return transact((s) => ({
    ...s,
    pending: s.pending.filter((op) => op.id !== id),
    revision: s.revision + 1,
  }));
}
export async function mergeServer(data: Data, expectedRevision: number) {
  validateData(data);
  let merged = false;
  const snapshot = await transact((s) => {
    // If another tab acknowledged a newer operation during this GET, its server
    // result may be stale. Keep local data and fetch again on the next sync pass.
    if (s.revision !== expectedRevision) return s;
    merged = true;
    return {
      ...s,
      data: s.pending.reduce((d, op) => applyAction(d, op.action), data),
      lastSync: new Date().toISOString(),
      revision: s.revision + 1,
    };
  });
  return { snapshot, merged };
}

export async function draftValue<T>(key: string, write?: { value: T }): Promise<T | undefined> {
  const db=await database();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('notebook',write?'readwrite':'readonly');
    const store=tx.objectStore('notebook');
    const request=write?store.put(write.value,`draft:${key}`):store.get(`draft:${key}`);
    tx.oncomplete=()=>resolve(write?write.value:request.result as T|undefined);
    tx.onerror=tx.onabort=()=>reject(tx.error??Error('Could not save the draft on this device.'));
  });
}
