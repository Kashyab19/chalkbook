const exerciseArt = [
  {
    file: 'bench-press.webp',
    terms: ['bench press', 'chest press', 'incline dumbbell press'],
  },
  { file: 'squat.webp', terms: ['squat'] },
  { file: 'deadlift.webp', terms: ['deadlift'] },
  { file: 'overhead-press.webp', terms: ['overhead press', 'shoulder press'] },
  {
    file: 'pull-up.webp',
    terms: ['pull-up', 'pull up', 'pulldown', 'pull down'],
  },
  { file: 'barbell-row.webp', terms: ['row'] },
  { file: 'leg-press.webp', terms: ['leg press', 'leg extension', 'leg curl'] },
  { file: 'bicep-curl.webp', terms: ['bicep', 'biceps', 'curl'] },
  {
    file: 'tricep-pushdown.webp',
    terms: ['tricep', 'triceps', 'pushdown', 'push down'],
  },
  { file: 'lunge.webp', terms: ['lunge', 'split squat'] },
  {
    file: 'lateral-raise.webp',
    terms: ['lateral raise', 'calf raise', 'raise', 'delt fly', 'face pull'],
  },
  {
    file: 'plank.webp',
    terms: ['plank', 'core', 'abductor', 'adductor', 'glute bridge'],
  },
] as const;

export function exerciseArtPath(name: string) {
  const normalized = name.toLowerCase();
  const match = exerciseArt.find(({ terms }) =>
    terms.some((term) => normalized.includes(term)),
  );
  return match ? `/exercise-icons/${match.file}` : null;
}
