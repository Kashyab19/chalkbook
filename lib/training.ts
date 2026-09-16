export type SetLog = {
  weightKg: number | null;
  reps: number | null;
  completed: boolean;
  /** A brief, optional observation recorded immediately after this set. */
  note?: string;
};
export type InteractionMetrics = {
  clicks: number;
  touches: number;
  keyboardEnters: number;
};
export type Exercise = {
  id: string;
  name: string;
  sets: number;
  min: number;
  max: number;
};
export type Day = {
  id: string;
  day: number;
  name: string;
  exercises: Exercise[];
};
export type LoggedExercise = Exercise & { entries: SetLog[] };
export type Session = {
  id: string;
  date: string;
  templateId: string;
  name: string;
  exercises: LoggedExercise[];
  startedAt: string;
  completedAt: string | null;
  interactions?: InteractionMetrics;
};
export type BodyEntry = { date: string; weightKg: number };
export type Data = { program: Day[]; sessions: Session[]; body: BodyEntry[] };
export const days = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
export const factor = 2.2046226218;
export const display = (kg: number, unit: string) =>
  Math.round(kg * (unit === 'lb' ? factor : 1) * 10) / 10;
export const toKg = (n: number, unit: string) =>
  n / (unit === 'lb' ? factor : 1);
export function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function dateLabel(s: string) {
  return new Date(s + 'T12:00:00').toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}
export function isoWeekNumber(s: string) {
  const date = new Date(s + 'T12:00:00');
  const day = date.getDay() || 7;
  date.setDate(date.getDate() + 4 - day);
  const yearStart = new Date(date.getFullYear(), 0, 1);
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
export function weekParity(s: string) {
  const week = isoWeekNumber(s);
  return { week, label: week % 2 ? 'Odd week' : 'Even week' } as const;
}
const e = (name: string, sets: number, min: number, max: number): Exercise => ({
  id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  name,
  sets,
  min,
  max,
});
export const defaultProgram: Day[] = [
  {
    id: 'legs',
    day: 1,
    name: 'Hamstrings & Glutes',
    exercises: [
      e('Back Squat', 3, 5, 8),
      e('Glute Bridge (heavy · 8-8-8)', 3, 8, 8),
      e('Leg Curl', 3, 10, 15),
      e('Abductors', 3, 12, 20),
      e('Calf Raise', 3, 12, 20),
    ],
  },
  {
    id: 'push',
    day: 2,
    name: 'Push',
    exercises: [
      e('Chest Press', 3, 6, 10),
      e('Incline Dumbbell Press', 3, 8, 12),
      e('Overhead Press', 3, 6, 10),
      e('Lateral Raise', 3, 12, 20),
      e('Face Pull', 3, 12, 20),
      e('Tricep Pushdown (V bar)', 3, 10, 15),
      e('Tricep Extension', 3, 10, 15),
    ],
  },
  {
    id: 'pull',
    day: 3,
    name: 'Pull',
    exercises: [
      e('Lat Pulldown', 3, 8, 12),
      e('Chest-Supported Row', 3, 6, 10),
      e('Rear Delt Fly', 3, 12, 20),
      e('Preacher Curl', 3, 8, 12),
      e('Hammer Curl', 3, 10, 15),
    ],
  },
  {
    id: 'upper',
    day: 5,
    name: 'Upper',
    exercises: [
      e('Incline Dumbbell Press', 3, 8, 12),
      e('Chest-Supported Row', 3, 8, 12),
      e('Lat Pulldown', 2, 10, 12),
      e('Lateral Raise', 3, 12, 20),
      e('Biceps Curl', 2, 10, 15),
      e('Triceps Pushdown', 2, 10, 15),
    ],
  },
  {
    id: 'lower',
    day: 4,
    name: 'Glutes & Quads',
    exercises: [
      e('Romanian Deadlift', 3, 6, 10),
      e('Leg Press', 2, 8, 12),
      e('Leg Extension', 3, 10, 15),
      e('Bulgarian Split Squat', 3, 8, 12),
      e('Adductors', 3, 12, 20),
      e('Calf Raise', 3, 12, 20),
    ],
  },
  { id: 'saturday', day: 6, name: 'Rest / optional activity', exercises: [] },
  { id: 'sunday', day: 0, name: 'Rest', exercises: [] },
];
export function previous(sessions: Session[], id: string, before: string) {
  for (const s of [...sessions].sort((a, b) => b.date.localeCompare(a.date))) {
    if (s.date >= before) continue;
    const ex = s.exercises.find(
      (e) => e.id === id && e.entries.some((x) => x.completed),
    );
    if (ex) return { date: s.date, exercise: ex };
  }
  return null;
}
export function newSession(
  date: string,
  day: Day,
  sessions: Session[],
): Session {
  return {
    id: `${date}_${day.id}`,
    date,
    templateId: day.id,
    name: day.name,
    startedAt: new Date().toISOString(),
    completedAt: null,
    interactions: { clicks: 0, touches: 0, keyboardEnters: 0 },
    exercises: day.exercises.map((ex) => {
      const prev = previous(sessions, ex.id, date)?.exercise.entries;
      return {
        ...ex,
        entries: Array.from({ length: ex.sets }, (_, i) => ({
          weightKg: prev?.[i]?.completed ? prev[i].weightKg : null,
          reps: prev?.[i]?.completed ? prev[i].reps : null,
          completed: false,
        })),
      };
    }),
  };
}
export function target(ex: Exercise, prev: SetLog[]) {
  const entries = prev.slice(0, ex.sets);
  const top =
    entries.length === ex.sets &&
    entries.every(
      (x) =>
        x.completed &&
        x.reps !== null &&
        x.reps >= ex.max &&
        x.weightKg !== null,
    ) &&
    entries.every(
      (x) => Math.abs((x.weightKg ?? 0) - (entries[0].weightKg ?? 0)) < 0.001,
    );
  if (top) return { increase: true, entries };
  let changed = false;
  return {
    increase: false,
    entries: entries.map((x) => {
      if (
        !changed &&
        x.completed &&
        x.reps !== null &&
        x.reps >= ex.min &&
        x.reps < ex.max
      ) {
        changed = true;
        return { ...x, reps: x.reps + 1 };
      }
      return x;
    }),
  };
}
export function movingAverage(entries: BodyEntry[], date: string, offset = 0) {
  const end = new Date(date + 'T12:00:00Z').getTime() - offset * 86400000;
  const rows = entries.filter((e) => {
    const t = new Date(e.date + 'T12:00:00Z').getTime();
    return t <= end && t > end - 7 * 86400000;
  });
  return rows.length
    ? rows.reduce((a, e) => a + e.weightKg, 0) / rows.length
    : null;
}
