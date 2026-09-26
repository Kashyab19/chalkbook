import {
  type Data,
  type Day,
  type InteractionMetrics,
  type Session,
  type SetLog,
} from './training';

export type Action =
  | { type: 'start'; session: Session }
  | { type: 'set'; id: string; exercise: number; set: number; value: SetLog }
  | { type: 'addSet'; id: string; exercise: number; set: number; value: SetLog }
  | { type: 'removeSet'; id: string; exercise: number; set: number }
  | { type: 'finish'; id: string; completedAt: string | null }
  | { type: 'interactions'; id: string; value: InteractionMetrics }
  | { type: 'program'; program: Day[] }
  | { type: 'body'; date: string; weightKg: number }
  | { type: 'deleteBody'; date: string }
  | { type: 'deleteSession'; id: string }
  | { type: 'restoreSession'; session: Session };
export type Operation = { id: string; action: Action };

export function applyAction(data: Data, action: Action): Data {
  switch (action.type) {
    case 'start':
      return data.sessions.some((s) => s.id === action.session.id)
        ? data
        : { ...data, sessions: [...data.sessions, action.session] };
    case 'restoreSession':
      return {
        ...data,
        sessions: [
          ...data.sessions.filter((s) => s.id !== action.session.id),
          action.session,
        ],
      };
    case 'set':
      return {
        ...data,
        sessions: data.sessions.map((s) => {
          if (s.id !== action.id) return s;
          const exercises = s.exercises.map((e, i) =>
            i !== action.exercise
              ? e
              : {
                  ...e,
                  entries: e.entries.map((v, j) =>
                    j === action.set ? action.value : v,
                  ),
                },
          );
          return {
            ...s,
            exercises,
            completedAt: exercises.every((e) =>
              e.entries.every((v) => v.completed),
            )
              ? (s.completedAt ?? s.startedAt)
              : null,
          };
        }),
      };
    case 'finish':
      return {
        ...data,
        sessions: data.sessions.map((s) =>
          s.id === action.id ? { ...s, completedAt: action.completedAt } : s,
        ),
      };
    case 'interactions':
      return {
        ...data,
        sessions: data.sessions.map((s) =>
          s.id === action.id ? { ...s, interactions: action.value } : s,
        ),
      };
    case 'addSet':
    case 'removeSet':
      return {
        ...data,
        sessions: data.sessions.map((s) => {
          if (s.id !== action.id) return s;
          let changed = false;
          const exercises = s.exercises.map((e, i) => {
            if (i !== action.exercise) return e;
            if (
              action.type === 'addSet' &&
              e.entries.length === action.set &&
              e.entries.length < 30
            ) {
              changed = true;
              return { ...e, entries: [...e.entries, action.value] };
            }
            if (
              action.type === 'removeSet' &&
              action.set === e.entries.length - 1 &&
              e.entries.length > e.sets &&
              !e.entries[action.set].completed
            ) {
              changed = true;
              return { ...e, entries: e.entries.slice(0, -1) };
            }
            return e;
          });
          return changed ? { ...s, exercises, completedAt: null } : s;
        }),
      };
    case 'program':
      return { ...data, program: action.program };
    case 'body':
      return {
        ...data,
        body: [
          ...data.body.filter((b) => b.date !== action.date),
          { date: action.date, weightKg: action.weightKg },
        ].sort((a, b) => a.date.localeCompare(b.date)),
      };
    case 'deleteBody':
      return { ...data, body: data.body.filter((b) => b.date !== action.date) };
    case 'deleteSession':
      return {
        ...data,
        sessions: data.sessions.filter((s) => s.id !== action.id),
      };
  }
}

const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, max = 100): v is string =>
  typeof v === 'string' && !!v.trim() && v.length <= max;
const num = (
  v: unknown,
  min: number,
  max: number,
  integer = false,
): v is number =>
  typeof v === 'number' &&
  Number.isFinite(v) &&
  v >= min &&
  v <= max &&
  (!integer || Number.isInteger(v));
export const validDate = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  !Number.isNaN(Date.parse(v)) &&
  new Date(v).toISOString().slice(0, 10) === v;
const validExercise = (e: unknown) =>
  object(e) &&
  text(e.id) &&
  text(e.name) &&
  num(e.sets, 1, 10, true) &&
  num(e.min, 1, 100, true) &&
  num(e.max, e.min, 100, true);
const validInteractions = (v: unknown): v is InteractionMetrics =>
  object(v) &&
  num(v.clicks, 0, 10000, true) &&
  num(v.touches, 0, 10000, true) &&
  num(v.keyboardEnters, 0, 10000, true);
export function validSet(v: unknown): v is SetLog {
  return (
    object(v) &&
    (v.weightKg === null || num(v.weightKg, 0, 2000)) &&
    (v.reps === null || num(v.reps, 0, 500, true)) &&
    typeof v.completed === 'boolean' &&
    (v.completedAt === undefined ||
      (text(v.completedAt) && !Number.isNaN(Date.parse(v.completedAt)))) &&
    (v.note === undefined ||
      (typeof v.note === 'string' && v.note.length <= 1000)) &&
    (!v.completed || (num(v.weightKg, 0, 2000) && num(v.reps, 1, 500, true)))
  );
}
export function validProgram(p: unknown): p is Day[] {
  return (
    Array.isArray(p) &&
    p.length === 7 &&
    p.every(
      (d) =>
        object(d) &&
        text(d.id) &&
        text(d.name) &&
        num(d.day, 0, 6, true) &&
        Array.isArray(d.exercises) &&
        d.exercises.length <= 30 &&
        d.exercises.every(validExercise) &&
        new Set(d.exercises.map((e) => e.id)).size === d.exercises.length,
    ) &&
    new Set(p.map((d) => d.id)).size === 7 &&
    new Set(p.map((d) => d.day)).size === 7
  );
}
export function validSession(s: unknown): s is Session {
  return (
    object(s) &&
    text(s.id, 200) &&
    validDate(s.date) &&
    text(s.templateId) &&
    text(s.name) &&
    text(s.startedAt) &&
    !Number.isNaN(Date.parse(s.startedAt)) &&
    (s.completedAt === null ||
      (text(s.completedAt) && !Number.isNaN(Date.parse(s.completedAt)))) &&
    (s.interactions === undefined || validInteractions(s.interactions)) &&
    Array.isArray(s.exercises) &&
    s.exercises.length <= 30 &&
    s.exercises.every(
      (e) =>
        validExercise(e) &&
        object(e) &&
        Array.isArray(e.entries) &&
        e.entries.length >= (e.sets as number) &&
        e.entries.length <= 30 &&
        e.entries.every(validSet),
    ) &&
    new Set(s.exercises.map((e) => e.id)).size === s.exercises.length
  );
}
export function validateAction(v: unknown): asserts v is Action {
  if (!object(v)) throw Error('Invalid change');
  const valid = (() => {
    switch (v.type) {
      case 'start':
      case 'restoreSession':
        return validSession(v.session);
      case 'set':
        return (
          text(v.id, 200) &&
          num(v.exercise, 0, 29, true) &&
          num(v.set, 0, 29, true) &&
          validSet(v.value)
        );
      case 'addSet':
        return (
          text(v.id, 200) &&
          num(v.exercise, 0, 29, true) &&
          num(v.set, 1, 29, true) &&
          validSet(v.value) &&
          !v.value.completed
        );
      case 'removeSet':
        return (
          text(v.id, 200) &&
          num(v.exercise, 0, 29, true) &&
          num(v.set, 1, 29, true)
        );
      case 'finish':
        return (
          text(v.id, 200) &&
          (v.completedAt === null ||
            (text(v.completedAt) && !Number.isNaN(Date.parse(v.completedAt))))
        );
      case 'interactions':
        return text(v.id, 200) && validInteractions(v.value);
      case 'program':
        return validProgram(v.program);
      case 'body':
        return validDate(v.date) && num(v.weightKg, 1, 500);
      case 'deleteBody':
        return validDate(v.date);
      case 'deleteSession':
        return text(v.id, 200);
      default:
        return false;
    }
  })();
  if (!valid)
    throw Error(
      'Invalid notebook change. Check the date, weight, reps, or program.',
    );
}
export function validateData(v: unknown): asserts v is Data {
  if (
    !object(v) ||
    !validProgram(v.program) ||
    !Array.isArray(v.sessions) ||
    !v.sessions.every(validSession) ||
    new Set(v.sessions.map((s) => s.id)).size !== v.sessions.length ||
    !Array.isArray(v.body) ||
    !v.body.every(
      (b) => object(b) && validDate(b.date) && num(b.weightKg, 1, 500),
    ) ||
    new Set(v.body.map((b) => b.date)).size !== v.body.length
  )
    throw Error(
      'This file is not a valid Gym Notebook backup. Nothing was restored.',
    );
}
export function parseBackup(value: unknown): Data {
  if (!object(value) || value.format !== 'gym-notebook' || value.version !== 1)
    throw Error('Unsupported backup format. Nothing was restored.');
  validateData(value.data);
  return value.data;
}
