/** Offline exercise list for the in-session swap picker.
 * Bundled with the app so the gym list renders with no network request.
 * Ids use the same slug as the programmed exercises so a swap keeps history. */

export const muscleGroups = [
  'chest',
  'shoulders',
  'triceps',
  'back',
  'biceps',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'abductors',
  'adductors',
  'core',
] as const;

export type MuscleGroup = (typeof muscleGroups)[number];

export type CatalogExercise = {
  id: string;
  name: string;
  group: MuscleGroup;
};

const catalogNames: { name: string; group: MuscleGroup }[] = [
  { name: 'Bench Press', group: 'chest' },
  { name: 'Cable Fly', group: 'chest' },
  { name: 'Chest Press', group: 'chest' },
  { name: 'Decline Bench Press', group: 'chest' },
  { name: 'Dumbbell Fly', group: 'chest' },
  { name: 'Incline Barbell Press', group: 'chest' },
  { name: 'Incline Dumbbell Press', group: 'chest' },
  { name: 'Push-Up', group: 'chest' },
  { name: 'Arnold Press', group: 'shoulders' },
  { name: 'Cable Lateral Raise', group: 'shoulders' },
  { name: 'Face Pull', group: 'shoulders' },
  { name: 'Front Raise', group: 'shoulders' },
  { name: 'Lateral Raise', group: 'shoulders' },
  { name: 'Overhead Press', group: 'shoulders' },
  { name: 'Rear Delt Fly', group: 'shoulders' },
  { name: 'Dip', group: 'triceps' },
  { name: 'Overhead Tricep Extension', group: 'triceps' },
  { name: 'Skull Crusher', group: 'triceps' },
  { name: 'Tricep Extension', group: 'triceps' },
  { name: 'Tricep Pushdown (V bar)', group: 'triceps' },
  { name: 'Triceps Pushdown', group: 'triceps' },
  { name: 'Barbell Row', group: 'back' },
  { name: 'Chest-Supported Row', group: 'back' },
  { name: 'Dumbbell Row', group: 'back' },
  { name: 'Lat Pulldown', group: 'back' },
  { name: 'Pull-Up', group: 'back' },
  { name: 'Seated Cable Row', group: 'back' },
  { name: 'Straight-Arm Pulldown', group: 'back' },
  { name: 'Biceps Curl', group: 'biceps' },
  { name: 'Cable Curl', group: 'biceps' },
  { name: 'Concentration Curl', group: 'biceps' },
  { name: 'Hammer Curl', group: 'biceps' },
  { name: 'Incline Curl', group: 'biceps' },
  { name: 'Preacher Curl', group: 'biceps' },
  { name: 'Back Squat', group: 'quads' },
  { name: 'Bulgarian Split Squat', group: 'quads' },
  { name: 'Front Squat', group: 'quads' },
  { name: 'Goblet Squat', group: 'quads' },
  { name: 'Hack Squat', group: 'quads' },
  { name: 'Leg Extension', group: 'quads' },
  { name: 'Leg Press', group: 'quads' },
  { name: 'Walking Lunge', group: 'quads' },
  { name: 'Good Morning', group: 'hamstrings' },
  { name: 'Leg Curl', group: 'hamstrings' },
  { name: 'Lying Leg Curl', group: 'hamstrings' },
  { name: 'Nordic Curl', group: 'hamstrings' },
  { name: 'Romanian Deadlift', group: 'hamstrings' },
  { name: 'Seated Leg Curl', group: 'hamstrings' },
  { name: 'Cable Pull-Through', group: 'glutes' },
  { name: 'Glute Bridge', group: 'glutes' },
  { name: 'Glute Bridge (heavy · 8-8-8)', group: 'glutes' },
  { name: 'Glute Kickback', group: 'glutes' },
  { name: 'Hip Thrust', group: 'glutes' },
  { name: 'Calf Raise', group: 'calves' },
  { name: 'Seated Calf Raise', group: 'calves' },
  { name: 'Standing Calf Raise', group: 'calves' },
  { name: 'Abductors', group: 'abductors' },
  { name: 'Cable Hip Abduction', group: 'abductors' },
  { name: 'Side-Lying Hip Abduction', group: 'abductors' },
  { name: 'Adductors', group: 'adductors' },
  { name: 'Cable Hip Adduction', group: 'adductors' },
  { name: 'Ab Wheel', group: 'core' },
  { name: 'Cable Crunch', group: 'core' },
  { name: 'Hanging Leg Raise', group: 'core' },
  { name: 'Plank', group: 'core' },
];

export function exerciseId(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

export const exerciseCatalog: CatalogExercise[] = catalogNames.map((item) => ({
  id: exerciseId(item.name),
  name: item.name,
  group: item.group,
}));

export const muscleGroupLabel: Record<MuscleGroup, string> = {
  chest: 'Chest',
  shoulders: 'Shoulders',
  triceps: 'Triceps',
  back: 'Back',
  biceps: 'Biceps',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  calves: 'Calves',
  abductors: 'Abductors',
  adductors: 'Adductors',
  core: 'Core',
};

const groupHints: { pattern: RegExp; group: MuscleGroup }[] = [
  {
    pattern: /glute|hip thrust|kickback|pull-through|frog pump/,
    group: 'glutes',
  },
  {
    pattern: /leg curl|romanian|hamstring|good morning|nordic/,
    group: 'hamstrings',
  },
  { pattern: /abductor/, group: 'abductors' },
  { pattern: /adductor/, group: 'adductors' },
  { pattern: /calf/, group: 'calves' },
  {
    pattern: /squat|leg press|leg extension|lunge|step-up|step up|hack squat/,
    group: 'quads',
  },
  {
    pattern: /chest-supported|pulldown|pull-?up|chin-?up|\brow\b/,
    group: 'back',
  },
  { pattern: /chest|bench|\bfly\b|push-?up|pushup|\bpec\b/, group: 'chest' },
  {
    pattern: /tricep|pushdown|push down|skull crusher|skullcrusher/,
    group: 'triceps',
  },
  {
    pattern:
      /pull apart|face pull|rear delt|lateral|overhead|shoulder|arnold|front raise/,
    group: 'shoulders',
  },
  { pattern: /curl|bicep/, group: 'biceps' },
  { pattern: /plank|crunch|sit-?up|ab wheel|hanging leg/, group: 'core' },
];

export function muscleGroupFor(name: string): MuscleGroup | null {
  const key = name.trim().toLowerCase();
  const known = exerciseCatalog.find((item) => item.name.toLowerCase() === key);
  if (known) return known.group;
  return groupHints.find((hint) => hint.pattern.test(key))?.group ?? null;
}

export type SwapCandidate = {
  id: string;
  name: string;
  group: MuscleGroup;
  sameGroup: boolean;
};

export function swapCandidates(
  currentName: string,
  query: string,
  extras: { id: string; name: string }[] = [],
): SwapCandidate[] {
  const currentGroup = muscleGroupFor(currentName);
  const currentKey = currentName.trim().toLowerCase();
  const byName = new Map<string, SwapCandidate>();
  const add = (id: string, name: string, group: MuscleGroup) => {
    const key = name.trim().toLowerCase();
    if (!key || key === currentKey || byName.has(key)) return;
    byName.set(key, {
      id,
      name: name.trim(),
      group,
      sameGroup: currentGroup !== null && group === currentGroup,
    });
  };
  for (const item of exerciseCatalog) add(item.id, item.name, item.group);
  for (const extra of extras) {
    const group = muscleGroupFor(extra.name);
    if (group) add(extra.id, extra.name, group);
  }
  const needle = query.trim().toLowerCase();
  const matches = [...byName.values()].filter((item) =>
    needle
      ? item.name.toLowerCase().includes(needle)
      : !currentGroup || item.sameGroup,
  );
  matches.sort((a, b) => {
    if (a.sameGroup !== b.sameGroup) return a.sameGroup ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return matches;
}

/** The typed escape hatch. Null when the text is blank, the current exercise, or an exact list match. */
export function customSwapName(
  query: string,
  currentName: string,
  candidates: { name: string }[],
): string | null {
  const name = query.trim();
  if (!name || name.length > 100) return null;
  const key = name.toLowerCase();
  if (key === currentName.trim().toLowerCase()) return null;
  if (candidates.some((item) => item.name.toLowerCase() === key)) return null;
  return name;
}
