import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultProgram } from '../lib/training';
import {
  customSwapName,
  exerciseId,
  muscleGroupFor,
  swapCandidates,
} from '../lib/exercise-catalog';

const programExercises = defaultProgram.flatMap((day) => day.exercises);

void test('every programmed exercise keeps its id and muscle group', () => {
  const groups: Record<string, string> = {
    'Back Squat': 'quads',
    'Glute Bridge (heavy · 8-8-8)': 'glutes',
    'Leg Curl': 'hamstrings',
    Abductors: 'abductors',
    'Calf Raise': 'calves',
    'Chest Press': 'chest',
    'Incline Dumbbell Press': 'chest',
    'Overhead Press': 'shoulders',
    'Lateral Raise': 'shoulders',
    'Face Pull': 'shoulders',
    'Tricep Pushdown (V bar)': 'triceps',
    'Tricep Extension': 'triceps',
    'Lat Pulldown': 'back',
    'Chest-Supported Row': 'back',
    'Rear Delt Fly': 'shoulders',
    'Preacher Curl': 'biceps',
    'Hammer Curl': 'biceps',
    'Biceps Curl': 'biceps',
    'Triceps Pushdown': 'triceps',
    'Romanian Deadlift': 'hamstrings',
    'Leg Press': 'quads',
    'Leg Extension': 'quads',
    'Bulgarian Split Squat': 'quads',
    Adductors: 'adductors',
  };
  for (const exercise of programExercises) {
    assert.equal(exerciseId(exercise.name), exercise.id, exercise.name);
    assert.equal(
      muscleGroupFor(exercise.name),
      groups[exercise.name],
      exercise.name,
    );
  }
});

void test('swapping a chest exercise lists a handful of other chest movements', () => {
  const choices = swapCandidates('Chest Press', '');
  assert.ok(choices.length >= 4, 'chest swaps need several alternatives');
  assert.ok(choices.length <= 8, 'the default list stays a handful');
  assert.ok(choices.every((choice) => choice.group === 'chest'));
  assert.equal(
    choices.some((choice) => choice.name === 'Chest Press'),
    false,
  );
  const incline = choices.find(
    (choice) => choice.name === 'Incline Dumbbell Press',
  );
  assert.equal(incline?.id, 'incline-dumbbell-press');
  assert.deepEqual(
    choices.map((choice) => choice.name),
    [...choices]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((choice) => choice.name),
  );
});

void test('search narrows the current group and can reach other groups', () => {
  const narrowed = swapCandidates('Chest Press', 'incline');
  assert.ok(narrowed.length >= 1);
  assert.ok(
    narrowed.every((choice) => choice.name.toLowerCase().includes('incline')),
  );
  assert.ok(narrowed.some((choice) => choice.group === 'chest'));

  const beyond = swapCandidates('Chest Press', 'row');
  assert.ok(beyond.some((choice) => choice.group === 'back'));
  assert.ok(
    beyond.every((choice) => choice.name.toLowerCase().includes('row')),
  );
  assert.equal(
    beyond.some((choice) => choice.name === 'Chest Press'),
    false,
  );
});

void test('a name that is not in the catalog stays available as a custom swap', () => {
  const query = 'Cable Rear Delt';
  const choices = swapCandidates('Rear Delt Fly', query);
  assert.equal(
    customSwapName(query, 'Rear Delt Fly', choices),
    'Cable Rear Delt',
  );
  assert.equal(
    customSwapName(
      '  incline dumbbell press  ',
      'Chest Press',
      swapCandidates('Chest Press', 'incline dumbbell press'),
    ),
    null,
  );
  assert.equal(customSwapName('   ', 'Chest Press', []), null);
  assert.equal(customSwapName('Chest Press', 'Chest Press', []), null);
});

void test('an unrecognized exercise shows the whole catalog until search narrows it', () => {
  const all = swapCandidates('Weird Machine Thing', '');
  assert.ok(all.length > programExercises.length);
  const squats = swapCandidates('Weird Machine Thing', 'squat');
  assert.ok(squats.length >= 1);
  assert.ok(
    squats.every((choice) => choice.name.toLowerCase().includes('squat')),
  );
});

void test('a program exercise missing from the curated list is still searchable by its id', () => {
  const choices = swapCandidates('Chest Press', 'band', [
    { id: 'band-pull-apart', name: 'Band Pull Apart' },
  ]);
  assert.deepEqual(choices[0], {
    id: 'band-pull-apart',
    name: 'Band Pull Apart',
    group: 'shoulders',
    sameGroup: false,
  });
});
