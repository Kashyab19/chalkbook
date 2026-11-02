import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { exerciseArtPath } from '../lib/exercise-art';
import { syncRequestError } from '../lib/sync-error';
import {
  allowArtPrefetch,
  backoffDelayMs,
  decideSync,
  isAuthSyncError,
  SYNC_BACKOFF_MS,
} from '../lib/sync-schedule';

void test('sync backs off after a weak connection and still retries when asked', () => {
  assert.deepEqual(
    [0, 1, 2, 3, 4, 9].map((n) => backoffDelayMs(n)),
    [0, ...SYNC_BACKOFF_MS, SYNC_BACKOFF_MS.at(-1)],
  );
  assert.deepEqual(
    decideSync({ now: 1_000, nextAttemptAt: 5_000, online: true, force: false }),
    { type: 'wait' },
  );
  assert.deepEqual(
    decideSync({ now: 1_000, nextAttemptAt: 5_000, online: true, force: true }),
    { type: 'start' },
  );
  assert.equal(
    decideSync({ now: 1_000, nextAttemptAt: 0, online: false, force: true }).type,
    'offline',
  );
  assert.equal(isAuthSyncError(syncRequestError(new TypeError('Load failed'))), false);
  assert.equal(
    isAuthSyncError(
      Error('Sign in online to resume sync. Your device changes are safe.'),
    ),
    true,
  );
});

void test('exercise icons are the compressed set and are not prefetched on a slow link', () => {
  assert.equal(exerciseArtPath('Back Squat'), '/exercise-icons-v2/squat.webp');
  assert.equal(exerciseArtPath('Glute Bridge'), '/exercise-icons-v2/glute-bridge.webp');
  assert.equal(exerciseArtPath('Not an exercise'), null);
  assert.equal(allowArtPrefetch(null), true);
  assert.equal(allowArtPrefetch({ effectiveType: '3g', downlink: 1.6 }), true);
  assert.equal(allowArtPrefetch({ effectiveType: '2g', downlink: 0.4 }), false);
  assert.equal(allowArtPrefetch({ effectiveType: '4g', downlink: 0.2 }), false);
  assert.equal(allowArtPrefetch({ saveData: true, effectiveType: '4g', downlink: 10 }), false);
});
