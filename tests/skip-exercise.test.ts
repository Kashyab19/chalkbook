import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { writeOperationWith } from '../lib/notebook-round-trips';
import {
  applyAction,
  parseBackup,
  validateAction,
  validateData,
} from '../lib/operations';
import {
  canFinishWorkout,
  currentExerciseSkip,
  exerciseHistoryLabel,
  exerciseProgressLabel,
  exercisesToSkip,
  isExercisePending,
  nextPendingExerciseIndex,
  pendingExerciseIndex,
  skipCurrentExerciseIndexes,
  skipExerciseJsonPaths,
  skipToExerciseChip,
} from '../lib/skip-exercise';
import { defaultProgram, newSession, previous } from '../lib/training';

const blank = () => ({
  program: structuredClone(defaultProgram),
  sessions: [],
  body: [],
});
const sets = (completed: boolean[], skipped?: boolean) => ({
  ...(skipped === undefined ? {} : { skipped }),
  entries: completed.map((done) => ({ completed: done })),
});

void test('the current exercise can be skipped, and a later one can be jumped to', () => {
  const exercises = [sets([false, false]), sets([false]), sets([false, false])];
  assert.equal(pendingExerciseIndex(exercises), 0);
  assert.equal(nextPendingExerciseIndex(exercises, 0), 1);
  assert.deepEqual(skipCurrentExerciseIndexes(exercises), [0]);
  assert.deepEqual(exercisesToSkip(exercises, 1), [0]);
  assert.deepEqual(exercisesToSkip(exercises, 2), [0, 1]);
  assert.deepEqual(exercisesToSkip(exercises, 0), []);
  assert.deepEqual(exercisesToSkip(exercises, 3), []);

  const mixed = [sets([true, false]), sets([true, true]), sets([false], true), sets([false])];
  assert.equal(isExercisePending(mixed[0]), true);
  assert.equal(isExercisePending(mixed[1]), false);
  assert.equal(isExercisePending(mixed[2]), false);
  assert.equal(pendingExerciseIndex(mixed), 0);
  assert.equal(nextPendingExerciseIndex(mixed, 0), 3);
  assert.deepEqual(exercisesToSkip(mixed, 3), [0]);
  assert.deepEqual(exercisesToSkip(mixed, 2), []);
  assert.deepEqual(skipCurrentExerciseIndexes([sets([true, true])]), []);

  assert.deepEqual(
    currentExerciseSkip({ finished: false, exerciseName: 'Back Squat', pending: true }),
    { label: 'Skip', accessibleName: 'Skip Back Squat' },
  );
  assert.equal(
    currentExerciseSkip({ finished: true, exerciseName: 'Back Squat', pending: true }),
    null,
  );
  assert.equal(
    currentExerciseSkip({ finished: false, exerciseName: '  ', pending: true }),
    null,
  );
  assert.equal(
    currentExerciseSkip({ finished: false, exerciseName: 'Back Squat', pending: false }),
    null,
  );
  assert.deepEqual(
    skipToExerciseChip({ finished: false, exerciseName: 'Leg Curl', available: true }),
    { label: 'Skip to here', accessibleName: 'Skip to Leg Curl' },
  );
  assert.equal(
    skipToExerciseChip({ finished: false, exerciseName: 'Leg Curl', available: false }),
    null,
  );
  assert.equal(
    skipToExerciseChip({ finished: true, exerciseName: 'Leg Curl', available: true }),
    null,
  );
});

void test('a skipped exercise is labeled as skipped instead of an empty log', () => {
  assert.equal(exerciseProgressLabel(sets([false, false, false])), '0/3');
  assert.equal(exerciseProgressLabel(sets([true, false])), '1/2');
  assert.equal(exerciseProgressLabel(sets([false, false, false], true)), 'Skipped');
  assert.equal(exerciseProgressLabel(sets([true, false, false], true)), '1/3 · Skipped');
  assert.equal(
    exerciseHistoryLabel(sets([false], true), 'No completed sets yet'),
    'Skipped',
  );
  assert.equal(
    exerciseHistoryLabel(sets([true], true), '20 kg × 8'),
    '20 kg × 8 · Skipped',
  );
  assert.equal(exerciseHistoryLabel(sets([true]), '20 kg × 8'), '20 kg × 8');
});

void test('finishing stays available after the remaining exercises are skipped', () => {
  assert.equal(
    canFinishWorkout({ finished: false, completedSets: 0, pendingExercise: true }),
    false,
  );
  assert.equal(
    canFinishWorkout({ finished: false, completedSets: 2, pendingExercise: true }),
    true,
  );
  assert.equal(
    canFinishWorkout({ finished: false, completedSets: 0, pendingExercise: false }),
    true,
  );
  assert.equal(
    canFinishWorkout({ finished: true, completedSets: 0, pendingExercise: false }),
    true,
  );
});

void test('skipping keeps logged sets, survives replay and undo, and still allows later logs', () => {
  const session = newSession('2026-09-07', defaultProgram[0], []);
  let data = applyAction(blank(), { type: 'start', session });
  data = applyAction(data, {
    type: 'set',
    id: session.id,
    exercise: 0,
    set: 0,
    value: { weightKg: 60, reps: 5, completed: true },
  });
  const skip = {
    type: 'skipExercises' as const,
    id: session.id,
    exercises: [0, 1],
    skipped: true,
  };
  validateAction(skip);
  data = applyAction(data, skip);
  data = applyAction(data, skip);
  const [first, second, third] = data.sessions[0].exercises;
  assert.equal(first.skipped, true);
  assert.equal(first.entries[0].weightKg, 60);
  assert.equal(first.entries[0].reps, 5);
  assert.equal(first.entries[0].completed, true);
  assert.equal(first.entries[1].completed, false);
  assert.equal(second.skipped, true);
  assert.ok(second.entries.every((entry) => !entry.completed && entry.weightKg === null));
  assert.equal(third.skipped, undefined);
  assert.equal(data.sessions[0].completedAt, null);
  assert.equal(pendingExerciseIndex(data.sessions[0].exercises), 2);
  assert.equal(previous(data.sessions, 'glute-bridge-heavy-8-8-8', '2026-09-14'), null);

  data = applyAction(data, {
    type: 'set',
    id: session.id,
    exercise: 2,
    set: 0,
    value: { weightKg: 40, reps: 10, completed: true },
  });
  assert.equal(data.sessions[0].exercises[2].entries[0].completed, true);
  assert.equal(data.sessions[0].exercises[0].skipped, true);
  assert.equal(data.sessions[0].completedAt, null);

  data = applyAction(data, {
    type: 'finish',
    id: session.id,
    completedAt: '2026-09-07T12:00:00.000Z',
  });
  assert.equal(data.sessions[0].completedAt, '2026-09-07T12:00:00.000Z');
  assert.equal(data.sessions[0].exercises[1].skipped, true);

  const undo = { ...skip, skipped: false };
  validateAction(undo);
  data = applyAction(data, undo);
  assert.equal(data.sessions[0].exercises[0].skipped, false);
  assert.equal(data.sessions[0].exercises[1].skipped, false);
  assert.equal(data.sessions[0].exercises[0].entries[0].weightKg, 60);
  assert.equal(data.sessions[0].completedAt, '2026-09-07T12:00:00.000Z');
  assert.deepEqual(parseBackup({ format: 'gym-notebook', version: 1, data }), data);

  const length = data.sessions[0].exercises.length;
  data = applyAction(data, { ...skip, exercises: [29] });
  assert.equal(data.sessions[0].exercises.length, length);
  assert.equal(data.sessions[0].exercises.at(-1)?.skipped, undefined);
  data = applyAction(data, { ...skip, id: 'missing-session' });
  assert.equal(data.sessions.length, 1);

  assert.throws(() => validateAction({ ...skip, exercises: [] }));
  assert.throws(() => validateAction({ ...skip, exercises: [0, 0] }));
  assert.throws(() => validateAction({ ...skip, exercises: [30] }));
  assert.throws(() => validateAction({ ...skip, exercises: [1.5] }));
  assert.throws(() => validateAction({ ...skip, skipped: 'yes' }));
  const bad = structuredClone(data);
  bad.sessions[0].exercises[0].skipped = 'yes' as unknown as boolean;
  assert.throws(() => validateData(bad));
});

void test('a skipped exercise with no logged sets is not previous performance', () => {
  const session = newSession('2026-09-07', defaultProgram[0], []);
  const data = applyAction(
    applyAction(blank(), { type: 'start', session }),
    { type: 'skipExercises', id: session.id, exercises: [0], skipped: true },
  );
  assert.equal(previous(data.sessions, session.exercises[0].id, '2026-09-14'), null);
  const later = newSession('2026-09-14', defaultProgram[0], data.sessions);
  assert.equal(later.exercises[0].entries[0].weightKg, null);
  assert.equal(later.exercises[0].skipped, undefined);
});

void test('skip patches only the skipped flag on the ordered session write', async () => {
  const session = newSession('2026-09-07', defaultProgram[0], []);
  const calls: string[] = [];
  await writeOperationWith(
    async (sql, values) => {
      calls.push(sql);
      if (calls.length === 1) {
        assert.match(sql, /FOR UPDATE/);
        assert.match(sql, /fitness\.workout_sessions/);
        assert.equal(values?.[2], session.id);
        return { rows: [{ data: session }], rowCount: 1 };
      }
      const updated = JSON.parse(String(values?.[0])) as typeof session;
      assert.equal(updated.exercises[0].skipped, true);
      assert.equal(updated.exercises[1].skipped, true);
      assert.equal(updated.exercises[2].skipped, undefined);
      assert.equal(updated.exercises[0].entries[0].completed, false);
      assert.equal(updated.completedAt, null);
      assert.match(sql, /^UPDATE fitness\.workout_sessions/);
      assert.equal(sql.includes('body_weight'), false);
      return { rows: [], rowCount: 0 };
    },
    '11111111-1111-1111-1111-111111111111',
    {
      id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      action: { type: 'skipExercises', id: session.id, exercises: [0, 1], skipped: true },
    },
  );
  assert.equal(calls.length, 2);

  let replay = 0;
  await writeOperationWith(
    async () => {
      replay += 1;
      return { rows: [], rowCount: 0 };
    },
    '11111111-1111-1111-1111-111111111111',
    {
      id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      action: { type: 'skipExercises', id: session.id, exercises: [0], skipped: false },
    },
  );
  assert.equal(replay, 1);

  assert.deepEqual(skipExerciseJsonPaths([0, 2], true), [
    { path: '$.exercises[0].skipped', json: 'true', objectPath: '$.exercises[0]' },
    { path: '$.exercises[2].skipped', json: 'true', objectPath: '$.exercises[2]' },
  ]);
  assert.equal(skipExerciseJsonPaths([1], false)[0]?.json, 'false');
});
