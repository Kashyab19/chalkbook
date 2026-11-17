import { display, type Day, type Session } from './training';

export type BestSet = { weight: number; reps: number };

export type PeriodStats = {
  best: BestSet | null;
  volume: number;
  setCount: number;
  sessionCount: number;
};

export type PeriodWindow = { start: number; end: number };

export type ExercisePeriodComparison = {
  id: string;
  name: string;
  current: PeriodStats;
  prior: PeriodStats | null;
};

const DAY_MS = 86400000;

/** Unique program exercises in program order (first occurrence wins). */
export function programExercises(program: Day[]) {
  const seen = new Map<string, { id: string; name: string }>();
  for (const day of program) {
    for (const exercise of day.exercises) {
      if (!seen.has(exercise.id))
        seen.set(exercise.id, { id: exercise.id, name: exercise.name });
    }
  }
  return [...seen.values()];
}

/** Inclusive end at `now`. `days === null` means all time (start at 0). */
export function currentWindow(now: number, days: number | null): PeriodWindow {
  if (days === null) return { start: 0, end: now };
  return { start: now - days * DAY_MS, end: now };
}

/** The equal-length window immediately before the current rolling window. */
export function priorWindow(now: number, days: number): PeriodWindow {
  return { start: now - 2 * days * DAY_MS, end: now - days * DAY_MS };
}

export function sessionTime(date: string) {
  return Date.parse(`${date}T12:00:00`);
}

export function inWindow(date: string, window: PeriodWindow) {
  const time = sessionTime(date);
  return time > window.start && time <= window.end;
}

function completedSets(
  sessions: Session[],
  exerciseId: string,
  window: PeriodWindow,
) {
  const rows: { weightKg: number; reps: number; sessionId: string }[] = [];
  for (const session of sessions) {
    if (!inWindow(session.date, window)) continue;
    for (const exercise of session.exercises) {
      if (exercise.id !== exerciseId) continue;
      for (const entry of exercise.entries) {
        if (
          !entry.completed ||
          entry.failed ||
          entry.weightKg === null ||
          entry.reps === null
        )
          continue;
        rows.push({
          weightKg: entry.weightKg,
          reps: entry.reps,
          sessionId: session.id,
        });
      }
    }
  }
  return rows;
}

export function periodStats(
  sessions: Session[],
  exerciseId: string,
  window: PeriodWindow,
  unit: string,
): PeriodStats {
  const rows = completedSets(sessions, exerciseId, window);
  if (!rows.length) {
    return { best: null, volume: 0, setCount: 0, sessionCount: 0 };
  }
  let best: BestSet | null = null;
  let volume = 0;
  const sessionIds = new Set<string>();
  for (const row of rows) {
    const weight = display(row.weightKg, unit);
    volume += weight * row.reps;
    sessionIds.add(row.sessionId);
    if (
      !best ||
      weight > best.weight ||
      (weight === best.weight && row.reps > best.reps)
    ) {
      best = { weight, reps: row.reps };
    }
  }
  return {
    best,
    volume: Math.round(volume * 10) / 10,
    setCount: rows.length,
    sessionCount: sessionIds.size,
  };
}

export function compareProgramPeriods(
  program: Day[],
  sessions: Session[],
  unit: string,
  now: number,
  rangeDays: number | null,
): ExercisePeriodComparison[] {
  const current = currentWindow(now, rangeDays);
  const prior =
    rangeDays === null ? null : priorWindow(now, rangeDays);
  return programExercises(program).map((exercise) => ({
    id: exercise.id,
    name: exercise.name,
    current: periodStats(sessions, exercise.id, current, unit),
    prior: prior
      ? periodStats(sessions, exercise.id, prior, unit)
      : null,
  }));
}

export function formatBestSet(best: BestSet | null, unit: string) {
  return best ? `${best.weight} ${unit} × ${best.reps}` : '—';
}

export function formatVolume(volume: number, unit: string) {
  if (volume <= 0) return '—';
  const rounded =
    volume >= 100 ? Math.round(volume) : Math.round(volume * 10) / 10;
  return `${rounded} ${unit}`;
}

/** Signed weight delta for the best set; null when either side is missing. */
export function bestWeightDelta(
  current: BestSet | null,
  prior: BestSet | null,
) {
  if (!current || !prior) return null;
  return Math.round((current.weight - prior.weight) * 10) / 10;
}

export function volumeDelta(current: number, prior: number | null) {
  if (prior === null || (current <= 0 && prior <= 0)) return null;
  return Math.round((current - prior) * 10) / 10;
}

export function formatSigned(value: number | null, unit?: string) {
  if (value === null) return '—';
  const sign = value > 0 ? '+' : '';
  const amount =
    Math.abs(value) >= 100
      ? Math.round(value)
      : Math.round(value * 10) / 10;
  return unit ? `${sign}${amount} ${unit}` : `${sign}${amount}`;
}
