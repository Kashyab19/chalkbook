export const SYNC_BACKOFF_MS = [5_000, 15_000, 30_000, 60_000] as const;
export const SYNC_REQUEST_TIMEOUT_MS = 25_000;

const AUTH_SYNC_PREFIX = 'Sign in online';

export function backoffDelayMs(failureCount: number) {
  if (failureCount <= 0) return 0;
  const index = Math.min(failureCount, SYNC_BACKOFF_MS.length) - 1;
  return SYNC_BACKOFF_MS[index];
}

export type SyncDecision =
  | { type: 'start' }
  | { type: 'wait' }
  | { type: 'offline' };

// A forced retry still stays on device while the radio is offline. iOS often
// reports `onLine === true` for an unusable link; callers treat those timeouts
// as ordinary failures and wait out the backoff before trying again.
export function decideSync(input: {
  now: number;
  nextAttemptAt: number;
  online: boolean;
  force: boolean;
}): SyncDecision {
  if (!input.online) return { type: 'offline' };
  if (!input.force && input.now < input.nextAttemptAt) return { type: 'wait' };
  return { type: 'start' };
}

export function isAuthSyncError(error: unknown): error is Error {
  return error instanceof Error && error.message.startsWith(AUTH_SYNC_PREFIX);
}

export type NetworkHint = {
  saveData?: boolean;
  effectiveType?: string;
  downlink?: number;
};

// Bulk icon warmup competes with workout sync. Slow 3G in Chrome is reported
// as 2g (high RTT) or as a downlink under 0.4 Mbps, so those links only fetch
// the icon that is actually on screen.
export function currentArtPrefetchAllowed() {
  if (typeof navigator === 'undefined') return false;
  const connection = (navigator as Navigator & { connection?: NetworkHint })
    .connection;
  return allowArtPrefetch(connection);
}

export function allowArtPrefetch(connection?: NetworkHint | null) {
  if (!connection) return true;
  if (connection.saveData) return false;
  if (
    connection.effectiveType === 'slow-2g' ||
    connection.effectiveType === '2g'
  )
    return false;
  if (
    typeof connection.downlink === 'number' &&
    connection.downlink > 0 &&
    connection.downlink < 0.4
  )
    return false;
  return true;
}
