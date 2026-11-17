import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  bestWeightDelta,
  compareProgramPeriods,
  currentWindow,
  formatBestSet,
  formatSigned,
  formatVolume,
  inWindow,
  periodStats,
  priorWindow,
  programExercises,
  volumeDelta,
} from '../lib/history-period';
import { defaultProgram, type Session } from '../lib/training';

const NOW = Date.parse('2026-11-17T18:00:00Z');

const session = (
  id: string,
  date: string,
  exerciseId: string,
  name: string,
  entries: { weightKg: number; reps: number; completed?: boolean; failed?: boolean }[],
): Session => ({
  id,
  date,
  templateId: 'monday',
  name: 'Lift',
  startedAt: `${date}T10:00:00.000Z`,
  completedAt: `${date}T11:00:00.000Z`,
  exercises: [
    {
      id: exerciseId,
      name,
      sets: entries.length,
      min: 5,
      max: 8,
      entries: entries.map((entry) => ({
        weightKg: entry.weightKg,
        reps: entry.reps,
        completed: entry.completed !== false,
        ...(entry.failed ? { failed: true } : {}),
      })),
    },
  ],
});

void test('program exercises stay unique in program order', () => {
  const ids = programExercises(defaultProgram).map((exercise) => exercise.id);
  assert.ok(ids.includes('back-squat'));
  assert.equal(new Set(ids).size, ids.length);
});

void test('rolling windows are adjacent and equal length', () => {
  const current = currentWindow(NOW, 30);
  const prior = priorWindow(NOW, 30);
  assert.equal(current.end, NOW);
  assert.equal(current.start, NOW - 30 * 86400000);
  assert.equal(prior.end, current.start);
  assert.equal(prior.start, NOW - 60 * 86400000);
  assert.deepEqual(currentWindow(NOW, null), { start: 0, end: NOW });
});

void test('inWindow uses an exclusive start and inclusive end', () => {
  const window = currentWindow(NOW, 30);
  assert.equal(inWindow('2026-11-17', window), true);
  // Noon on the day the window opens is still at or before the exclusive start.
  assert.equal(inWindow('2026-10-18', window), false);
  assert.equal(inWindow('2026-10-19', window), true);
});

void test('period stats pick the best set, volume, and session count', () => {
  const sessions = [
    session('a', '2026-11-10', 'back-squat', 'Back Squat', [
      { weightKg: 100, reps: 5 },
      { weightKg: 110, reps: 3 },
    ]),
    session('b', '2026-11-03', 'back-squat', 'Back Squat', [
      { weightKg: 105, reps: 5 },
      { weightKg: 120, reps: 1, failed: true },
    ]),
  ];
  const stats = periodStats(
    sessions,
    'back-squat',
    currentWindow(NOW, 30),
    'kg',
  );
  assert.deepEqual(stats.best, { weight: 110, reps: 3 });
  assert.equal(stats.setCount, 3);
  assert.equal(stats.sessionCount, 2);
  assert.equal(stats.volume, 100 * 5 + 110 * 3 + 105 * 5);
});

void test('compareProgramPeriods attaches a prior window only for rolling ranges', () => {
  const sessions = [
    session('now', '2026-11-10', 'back-squat', 'Back Squat', [
      { weightKg: 120, reps: 5 },
    ]),
    session('then', '2026-10-01', 'back-squat', 'Back Squat', [
      { weightKg: 100, reps: 5 },
    ]),
  ];
  const rolling = compareProgramPeriods(
    defaultProgram,
    sessions,
    'kg',
    NOW,
    30,
  );
  const squat = rolling.find((row) => row.id === 'back-squat')!;
  assert.equal(squat.current.best?.weight, 120);
  assert.equal(squat.prior?.best?.weight, 100);
  assert.equal(bestWeightDelta(squat.current.best, squat.prior!.best), 20);
  assert.equal(
    volumeDelta(squat.current.volume, squat.prior!.volume),
    120 * 5 - 100 * 5,
  );

  const allTime = compareProgramPeriods(
    defaultProgram,
    sessions,
    'kg',
    NOW,
    null,
  );
  const allSquat = allTime.find((row) => row.id === 'back-squat')!;
  assert.equal(allSquat.prior, null);
  assert.equal(allSquat.current.best?.weight, 120);
  assert.equal(allSquat.current.setCount, 2);
});

void test('formatters handle empty and signed deltas', () => {
  assert.equal(formatBestSet(null, 'kg'), '—');
  assert.equal(formatBestSet({ weight: 100, reps: 5 }, 'kg'), '100 kg × 5');
  assert.equal(formatVolume(0, 'kg'), '—');
  assert.equal(formatVolume(4200, 'kg'), '4200 kg');
  assert.equal(formatSigned(5, 'kg'), '+5 kg');
  assert.equal(formatSigned(-2.5, 'kg'), '-2.5 kg');
  assert.equal(formatSigned(null), '—');
});
