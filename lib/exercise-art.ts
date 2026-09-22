const exerciseArt = [
  {
    file: 'bench-press.png',
    terms: ['bench press', 'chest press', 'incline dumbbell press'],
  },
  { file: 'squat.png', terms: ['squat'] },
  { file: 'deadlift.png', terms: ['deadlift'] },
  { file: 'overhead-press.png', terms: ['overhead press', 'shoulder press'] },
  {
    file: 'pull-up.png',
    terms: ['pull-up', 'pull up', 'pulldown', 'pull down'],
  },
  { file: 'barbell-row.png', terms: ['row'] },
  { file: 'leg-press.png', terms: ['leg press', 'leg extension'] },
  { file: 'bicep-curl.png', terms: ['bicep', 'biceps', 'curl'] },
  {
    file: 'tricep-pushdown.png',
    terms: ['tricep', 'triceps', 'pushdown', 'push down'],
  },
  { file: 'lunge.png', terms: ['lunge', 'split squat'] },
  {
    file: 'lateral-raise.png',
    terms: ['lateral raise', 'calf raise', 'raise', 'delt fly', 'face pull'],
  },
  {
    file: 'plank.png',
    terms: ['plank', 'core', 'abductor', 'adductor'],
  },
] as const;

export function exerciseArtPath(name: string) {
  const normalized = name.toLowerCase();
  const match = exerciseArt.find(({ terms }) =>
    terms.some((term) => normalized.includes(term)),
  );
  return match ? `/exercise-icons-v2/${match.file}` : null;
}
