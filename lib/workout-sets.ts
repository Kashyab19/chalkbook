/** Whether the in-progress exercise can take one more set, and how to name that action. */
export function currentExerciseAddSet(options: {
  finished: boolean;
  entryCount: number;
  exerciseName: string;
}): { label: string; accessibleName: string } | null {
  if (options.finished || options.entryCount >= 30) return null;
  const name = options.exerciseName.trim();
  if (!name) return null;
  return {
    label: 'Add set',
    accessibleName: `Add set to ${name}`,
  };
}
