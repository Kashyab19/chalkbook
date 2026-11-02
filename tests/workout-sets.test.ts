import assert from 'node:assert/strict';
import { test } from 'node:test';
import { currentExerciseAddSet } from '../lib/workout-sets';

void test('the current exercise offers one labeled add-set action', () => {
  const action = currentExerciseAddSet({
    finished: false,
    entryCount: 3,
    exerciseName: 'Back Squat',
  });
  assert.deepEqual(action, {
    label: 'Add set',
    accessibleName: 'Add set to Back Squat',
  });
});

void test('add set stays available until the exercise reaches thirty sets', () => {
  assert.equal(
    currentExerciseAddSet({
      finished: false,
      entryCount: 29,
      exerciseName: 'Row',
    })?.label,
    'Add set',
  );
  assert.equal(
    currentExerciseAddSet({
      finished: false,
      entryCount: 30,
      exerciseName: 'Row',
    }),
    null,
  );
});

void test('a finished workout does not offer another set on the current exercise', () => {
  assert.equal(
    currentExerciseAddSet({
      finished: true,
      entryCount: 3,
      exerciseName: 'Back Squat',
    }),
    null,
  );
});
