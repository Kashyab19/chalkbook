import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  defaultProgram,
  newSession,
  previous,
  target,
  display,
  toKg,
  dateKey,
} from '../lib/training';
import {
  applyAction,
  parseBackup,
  validateAction,
  validateData,
} from '../lib/operations';
import { SYNC_PAUSED_MESSAGE, syncRequestError } from '../lib/sync-error';
const blank = () => ({
  program: structuredClone(defaultProgram),
  sessions: [],
  body: [],
});
void test('default program is preserved and blank lifting weights are never invented', () => {
  const day = defaultProgram[0];
  const s = newSession('2026-09-07', day, []);
  assert.equal(s.exercises.length, 5);
  assert.equal(s.exercises[0].name, 'Back Squat');
  assert.ok(
    s.exercises.every((e) =>
      e.entries.every(
        (v) => v.weightKg === null && v.reps === null && !v.completed,
      ),
    ),
  );
});
void test('local reducer preserves changes and deletions are idempotent', () => {
  const session = newSession('2026-09-07', defaultProgram[0], []);
  let d = applyAction(blank(), { type: 'start', session });
  d = applyAction(d, { type: 'start', session });
  assert.equal(d.sessions.length, 1);
  d = applyAction(d, {
    type: 'set',
    id: session.id,
    exercise: 0,
    set: 0,
    value: { weightKg: 20, reps: 8, completed: true },
  });
  d = applyAction(d, { type: 'body', date: session.date, weightKg: 55 });
  d = applyAction(d, { type: 'body', date: session.date, weightKg: 56 });
  assert.equal(d.body.length, 1);
  const later = newSession('2026-09-14', defaultProgram[0], d.sessions);
  assert.equal(later.exercises[0].entries[0].weightKg, 20);
  assert.equal(later.exercises[0].entries[0].reps, 8);
  assert.equal(later.exercises[0].entries[0].completed, false);
  assert.equal(later.exercises[0].entries[1].weightKg, null);
  assert.equal(previous(d.sessions, 'back-squat', session.date), null);
  d = applyAction(d, { type: 'deleteSession', id: session.id });
  d = applyAction(d, {
    type: 'set',
    id: session.id,
    exercise: 0,
    set: 0,
    value: { weightKg: 30, reps: 8, completed: true },
  });
  assert.equal(d.sessions.length, 0);
  d = applyAction(d, { type: 'deleteBody', date: session.date });
  assert.equal(d.body.length, 0);
});
void test('unit conversion keeps canonical kg and suggestions do not change weights', () => {
  for (const kg of [0, 20, 53.5, 100])
    assert.ok(Math.abs(toKg(kg * 2.2046226218, 'lb') - kg) < 1e-8);
  assert.equal(display(20, 'lb'), 44.1);
  const entries = Array.from({ length: 3 }, () => ({
    weightKg: 20,
    reps: 8,
    completed: true,
  }));
  const s = target(defaultProgram[0].exercises[0], entries);
  assert.equal(s.increase, true);
  assert.deepEqual(s.entries, entries);
});
void test('backup validation preserves records and rejects malformed data', () => {
  const d = applyAction(blank(), {
    type: 'start',
    session: newSession('2026-09-07', defaultProgram[0], []),
  });
  assert.deepEqual(
    parseBackup({ format: 'gym-notebook', version: 1, data: d }),
    d,
  );
  assert.throws(() =>
    parseBackup({ format: 'gym-notebook', version: 2, data: d }),
  );
  assert.throws(() =>
    validateAction({ type: 'body', date: '2026-02-30', weightKg: 55 }),
  );
  assert.throws(() =>
    validateAction({
      type: 'set',
      id: 'a',
      exercise: 0,
      set: 0,
      value: { weightKg: null, reps: 8, completed: true },
    }),
  );
  const bad = structuredClone(d);
  bad.program[1].day = bad.program[0].day;
  assert.throws(() => validateData(bad));
});
void test('date selection uses device local calendar components', () => {
  const d = new Date(2026, 8, 7, 23, 59);
  assert.equal(dateKey(d), '2026-09-07');
});
void test('browser fetch failures never expose raw abort messages', () => {
  assert.equal(
    syncRequestError(new DOMException('Fetch is aborted', 'AbortError'))
      .message,
    SYNC_PAUSED_MESSAGE,
  );
  assert.equal(
    syncRequestError(new TypeError('Load failed')).message,
    SYNC_PAUSED_MESSAGE,
  );
});
void test('extra sets preserve planned sets, survive backups, and do not duplicate on replay', () => {
  const session = newSession('2026-09-07', defaultProgram[0], []);
  let data = applyAction(blank(), { type: 'start', session });
  const add = {
    type: 'addSet' as const,
    id: session.id,
    exercise: 0,
    set: 3,
    value: { weightKg: 40, reps: 8, completed: false },
  };
  validateAction(add);
  data = applyAction(data, add);
  data = applyAction(data, add);
  assert.equal(data.sessions[0].exercises[0].sets, 3);
  assert.equal(data.sessions[0].exercises[0].entries.length, 4);
  data = applyAction(data, { ...add, set: 4 });
  assert.equal(data.sessions[0].exercises[0].entries.length, 5);
  validateData(data);
  const backup = parseBackup({ format: 'gym-notebook', version: 1, data });
  assert.equal(backup.sessions[0].exercises[0].entries.length, 5);
  data = applyAction(data, {
    type: 'set',
    id: session.id,
    exercise: 0,
    set: 4,
    value: { weightKg: 42.5, reps: 8, completed: true },
  });
  const noRemove = applyAction(data, {
    type: 'removeSet',
    id: session.id,
    exercise: 0,
    set: 4,
  });
  assert.equal(noRemove.sessions[0].exercises[0].entries.length, 5);
  data = applyAction(data, {
    type: 'finish',
    id: session.id,
    completedAt: '2026-09-07T14:00:00Z',
  });
  assert.ok(data.sessions[0].completedAt);
  data = applyAction(data, {
    type: 'finish',
    id: session.id,
    completedAt: null,
  });
  assert.equal(data.sessions[0].completedAt, null);
  data = applyAction(data, {
    type: 'set',
    id: session.id,
    exercise: 0,
    set: 4,
    value: { weightKg: 42.5, reps: 8, completed: false },
  });
  data = applyAction(data, {
    type: 'removeSet',
    id: session.id,
    exercise: 0,
    set: 4,
  });
  assert.equal(data.sessions[0].exercises[0].entries.length, 4);
  data = applyAction(data, {
    type: 'removeSet',
    id: session.id,
    exercise: 0,
    set: 2,
  });
  assert.equal(data.sessions[0].exercises[0].entries.length, 4);
  data = applyAction(data, { type: 'deleteSession', id: session.id });
  data = applyAction(data, add);
  assert.equal(data.sessions.length, 0);
  assert.throws(() => validateAction({ ...add, set: 30 }));
  assert.throws(() =>
    validateAction({ ...add, value: { ...add.value, completed: true } }),
  );
});
