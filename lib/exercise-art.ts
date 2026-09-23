const exerciseArt = [
  { file: 'glute-bridge.png', terms: ['glute bridge'] },
  { file: 'leg-curl.png', terms: ['leg curl'] },
  { file: 'face-pull.png', terms: ['face pull'] },
  { file: 'rear-delt-fly.png', terms: ['rear delt fly'] },
  { file: 'calf-raise.png', terms: ['calf raise'] },
  { file: 'abductor.png', terms: ['abductor'] },
  { file: 'adductor.png', terms: ['adductor'] },
  { file: 'preacher-curl.png', terms: ['preacher curl'] },
  { file: 'hammer-curl.png', terms: ['hammer curl'] },
  { file: 'tricep-extension.png', terms: ['tricep extension'] },
  { file: 'romanian-deadlift.png', terms: ['romanian deadlift'] },
  { file: 'chest-supported-row.png', terms: ['chest-supported row'] },
  { file: 'leg-extension.png', terms: ['leg extension'] },
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
