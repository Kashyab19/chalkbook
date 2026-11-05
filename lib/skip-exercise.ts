type PendingExercise = {
  skipped?: boolean;
  entries: { completed: boolean }[];
};

/** An exercise still needs a set. A skip is a choice, so those sets are not waiting. */
export function isExercisePending(exercise: PendingExercise) {
  return exercise.skipped !== true && exercise.entries.some((entry) => !entry.completed);
}

export function pendingExerciseIndex(exercises: readonly PendingExercise[]) {
  return exercises.findIndex(isExercisePending);
}

export function nextPendingExerciseIndex(
  exercises: readonly PendingExercise[],
  afterIndex: number,
) {
  for (let index = afterIndex + 1; index < exercises.length; index++) {
    if (isExercisePending(exercises[index])) return index;
  }
  return -1;
}

export function skipCurrentExerciseIndexes(exercises: readonly PendingExercise[]) {
  const current = pendingExerciseIndex(exercises);
  return current < 0 ? [] : [current];
}

/** Pending exercises from the current one up to, but not including, a later target. */
export function exercisesToSkip(
  exercises: readonly PendingExercise[],
  targetIndex: number,
) {
  if (
    !Number.isInteger(targetIndex) ||
    targetIndex < 0 ||
    targetIndex >= exercises.length ||
    !isExercisePending(exercises[targetIndex])
  )
    return [];
  const current = pendingExerciseIndex(exercises);
  if (current < 0 || targetIndex <= current) return [];
  const indexes: number[] = [];
  for (let index = current; index < targetIndex; index++) {
    if (isExercisePending(exercises[index])) indexes.push(index);
  }
  return indexes;
}

export function currentExerciseSkip(options: {
  finished: boolean;
  exerciseName: string;
  pending: boolean;
}) {
  const name = options.exerciseName.trim();
  if (options.finished || !options.pending || !name) return null;
  return { label: 'Skip', accessibleName: `Skip ${name}` };
}

export function skipToExerciseChip(options: {
  finished: boolean;
  exerciseName: string;
  available: boolean;
}) {
  const name = options.exerciseName.trim();
  if (options.finished || !options.available || !name) return null;
  return { label: 'Skip to here', accessibleName: `Skip to ${name}` };
}

export function exerciseProgressLabel(exercise: PendingExercise) {
  const done = exercise.entries.filter((entry) => entry.completed).length;
  const total = exercise.entries.length;
  if (exercise.skipped) return done ? `${done}/${total} · Skipped` : 'Skipped';
  return `${done}/${total}`;
}

export function exerciseHistoryLabel(exercise: PendingExercise, completedLabel: string) {
  if (exercise.skipped !== true) return completedLabel;
  return exercise.entries.some((entry) => entry.completed)
    ? `${completedLabel} · Skipped`
    : 'Skipped';
}

export function canFinishWorkout(options: {
  finished: boolean;
  completedSets: number;
  pendingExercise: boolean;
}) {
  return options.finished || options.completedSets > 0 || !options.pendingExercise;
}

/** JSON paths for a partial session update. Indexes are already validated action fields. */
export function skipExerciseJsonPaths(indexes: readonly number[], skipped: boolean) {
  const json = skipped ? 'true' : 'false';
  return indexes.map((index) => {
    if (!Number.isInteger(index) || index < 0 || index > 29)
      throw Error('Invalid exercise');
    return {
      path: `$.exercises[${index}].skipped`,
      json,
      objectPath: `$.exercises[${index}]`,
    } as const;
  });
}
