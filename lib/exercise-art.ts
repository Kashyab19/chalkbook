const exerciseArt = [
  { file: 'glute-bridge.webp', terms: ['glute bridge'] },
  { file: 'leg-curl.webp', terms: ['leg curl'] },
  { file: 'face-pull.webp', terms: ['face pull'] },
  { file: 'rear-delt-fly.webp', terms: ['rear delt fly'] },
  { file: 'calf-raise.webp', terms: ['calf raise'] },
  { file: 'abductor.webp', terms: ['abductor'] },
  { file: 'adductor.webp', terms: ['adductor'] },
  { file: 'preacher-curl.webp', terms: ['preacher curl'] },
  { file: 'hammer-curl.webp', terms: ['hammer curl'] },
  { file: 'tricep-extension.webp', terms: ['tricep extension'] },
  { file: 'romanian-deadlift.webp', terms: ['romanian deadlift'] },
  { file: 'chest-supported-row.webp', terms: ['chest-supported row'] },
  { file: 'leg-extension.webp', terms: ['leg extension'] },
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
  { file: 'leg-press.webp', terms: ['leg press', 'leg extension'] },
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
