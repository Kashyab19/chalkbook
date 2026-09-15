'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/boardui/base/buttons/button';
import { Input } from '@/components/boardui/base/input/input';
import { RiAddLine, RiChat1Line, RiCheckLine } from '@remixicon/react';
import {
  type Session,
  type SetLog,
  display,
  toKg,
  previous,
  target,
} from '@/lib/training';
import { type Action, validSet } from '@/lib/operations';
import { cx } from '@/lib/boardui-cx';
import { useDeviceDraft } from '@/hooks/use-device-draft';
const card =
  'rounded-3xl border border-border-button-default bg-background-primary-default p-4 sm:p-6';
export function BoardWorkout({
  session,
  sessions,
  unit,
  save,
  saving,
}: {
  session: Session;
  sessions: Session[];
  unit: string;
  save: (action: Action) => Promise<boolean>;
  saving: boolean;
}) {
  const [expanded, setExpanded] = useState<number[]>([]),
    [undo, setUndo] = useState<{
      exercise: number;
      set: number;
      value: SetLog;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [noteOpen, setNoteOpen] = useState<string | null>(null);
  const [until, setUntil] = useDeviceDraft<number>(`rest-${session.id}`, 0);
  const lock = useRef(false);
  const run = async (action: Action, after?: () => void) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      if (await save(action)) after?.();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const done = session.exercises.reduce(
      (n, e) => n + e.entries.filter((s) => s.completed).length,
      0,
    ),
    total = session.exercises.reduce((n, e) => n + e.entries.length, 0);
  const nextJ = session.exercises.findIndex((e) =>
      e.entries.some((s) => !s.completed),
    ),
    nextI =
      nextJ < 0
        ? -1
        : session.exercises[nextJ].entries.findIndex((s) => !s.completed),
    next = nextJ < 0 ? null : session.exercises[nextJ].entries[nextI];
  const finished = !!session.completedAt;
  const mark = (j: number, i: number) => {
    const value = session.exercises[j].entries[i];
    void run(
      {
        type: 'set',
        id: session.id,
        exercise: j,
        set: i,
        value: { ...value, completed: !value.completed },
      },
      () => {
        if (!value.completed) {
          setUndo({ exercise: j, set: i, value });
          setUntil(Date.now() + 90000);
          if (
            session.exercises[j].entries.every((s, k) => k === i || s.completed)
          )
            setExpanded((old) => old.filter((x) => x !== j));
        } else {
          setUndo(null);
          setUntil(0);
        }
      },
    );
  };
  const finish = () =>
    void run(
      {
        type: 'finish',
        id: session.id,
        completedAt: finished ? null : new Date().toISOString(),
      },
      () => {
        setUntil(0);
        setUndo(null);
      },
    );
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="workout-summary flex flex-wrap items-center justify-between gap-3">
        <p className="text-body-regular">
          {done}/{total} sets done{finished ? ' · finished' : ''}
        </p>
        <Button
          variant="secondary"
          disabled={busy || saving || (!finished && !done)}
          onClick={finish}
        >
          {finished ? 'Resume' : 'Finish'}
        </Button>
      </div>
      {session.exercises
        .map((ex, j) => ({ ex, j }))
        .sort(
          (a, b) =>
            Number(a.ex.entries.every((s) => s.completed)) -
            Number(b.ex.entries.every((s) => s.completed)),
        )
        .map(({ ex, j }) => {
          const complete = ex.entries.every((s) => s.completed),
            open = !complete || expanded.includes(j);
          const prev = previous(sessions, ex.id, session.date);
          const suggestion = prev ? target(ex, prev.exercise.entries) : null;
          return (
            <article
              key={ex.id}
              className={cx(
                card,
                'workout-card',
                complete && 'workout-card-complete',
                nextJ === j && !finished && 'ring-2 ring-accent-400',
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-headline-medium">{ex.name}</h2>
                  <p className="text-caption-1-regular text-text-secondary">
                    {ex.entries.filter((s) => s.completed).length}/
                    {ex.entries.length} done · {ex.min}–{ex.max} reps
                  </p>
                </div>
                {complete && (
                  <Button
                    variant="secondary"
                    aria-expanded={open}
                    aria-label={`${open ? 'Collapse' : 'Expand'} ${ex.name}`}
                    onClick={() =>
                      setExpanded((old) =>
                        old.includes(j)
                          ? old.filter((x) => x !== j)
                          : [...old, j],
                      )
                    }
                  >
                    {open ? 'Hide' : 'Show'}
                  </Button>
                )}
              </div>
              {open && (
                <div className="mt-4">
                  <div className="workout-grid text-caption-1-medium text-text-secondary">
                    <span>Set</span>
                    <span>{unit}</span>
                    <span>Reps</span>
                    <span>Done</span>
                  </div>
                  {ex.entries.map((s, i) => {
                    const noteKey = `${j}-${i}`;
                    return (
                      <div
                        id={`set-${j}-${i}`}
                        key={i}
                        className={cx(
                          'my-2 rounded-xl',
                          s.completed && 'bg-background-secondary-default',
                          j === nextJ &&
                            i === nextI &&
                            !finished &&
                            'current-set',
                        )}
                      >
                        <div className="workout-grid">
                      <span className="text-body-medium text-center">
                        {i + 1}
                        {i >= ex.sets && (
                          <span className="block text-caption-1-regular">
                            extra
                          </span>
                        )}
                      </span>
                      <SetField
                        key={`${session.id}-${j}-${i}-weight-${unit}`}
                        draftKey={`${session.id}-${j}-${i}-weight-${unit}`}
                        label={`${ex.name} set ${i + 1} weight`}
                        value={
                          s.weightKg === null ? null : display(s.weightKg, unit)
                        }
                        max={display(2000, unit)}
                        disabled={finished}
                        onSave={(n) =>
                          save({
                            type: 'set',
                            id: session.id,
                            exercise: j,
                            set: i,
                            value: {
                              ...s,
                              weightKg: n === null ? null : toKg(n, unit),
                              completed: false,
                            },
                          })
                        }
                      />
                      <SetField
                        key={`${session.id}-${j}-${i}-reps`}
                        draftKey={`${session.id}-${j}-${i}-reps`}
                        label={`${ex.name} set ${i + 1} reps`}
                        value={s.reps}
                        max={500}
                        integer
                        disabled={finished}
                        onSave={(n) =>
                          save({
                            type: 'set',
                            id: session.id,
                            exercise: j,
                            set: i,
                            value: { ...s, reps: n, completed: false },
                          })
                        }
                      />
                      <Button
                        iconOnly
                        leadingIcon={RiCheckLine}
                        className="min-h-11 min-w-11"
                        aria-label={`Complete ${ex.name} set ${i + 1}`}
                        aria-pressed={s.completed}
                        variant={s.completed ? 'primary' : 'secondary'}
                        disabled={
                          finished ||
                          busy ||
                          saving ||
                          (!s.completed && !validSet({ ...s, completed: true }))
                        }
                        onClick={() => mark(j, i)}
                      />
                        </div>
                        <div className="ml-10 flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="small"
                            leadingIcon={RiChat1Line}
                            aria-label={`${s.note ? 'Edit' : 'Add'} note for ${ex.name} set ${i + 1}`}
                            aria-expanded={noteOpen === noteKey}
                            onClick={() =>
                              setNoteOpen((open) =>
                                open === noteKey ? null : noteKey,
                              )
                            }
                          >
                            {s.note ? 'Edit note' : 'Add note'}
                          </Button>
                          {s.note && noteOpen !== noteKey && (
                            <span className="truncate text-caption-1-regular text-text-secondary">
                              {s.note}
                            </span>
                          )}
                        </div>
                        {noteOpen === noteKey && (
                          <SetNote
                            key={`${session.id}-${noteKey}-${s.note ?? ''}`}
                            exercise={ex.name}
                            set={i + 1}
                            note={s.note ?? ''}
                            disabled={busy || saving}
                            onSave={async (note) => {
                              const saved = await save({
                                type: 'set',
                                id: session.id,
                                exercise: j,
                                set: i,
                                value: { ...s, note: note || undefined },
                              });
                              if (saved) setNoteOpen(null);
                              return saved;
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {!finished && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    leadingIcon={RiAddLine}
                    aria-label={`Add set to ${ex.name}`}
                    disabled={busy || saving || ex.entries.length >= 30}
                    onClick={() =>
                      void run(
                        {
                          type: 'addSet',
                          id: session.id,
                          exercise: j,
                          set: ex.entries.length,
                          value: {
                            weightKg: ex.entries.at(-1)?.weightKg ?? null,
                            reps: ex.entries.at(-1)?.reps ?? null,
                            completed: false,
                          },
                        },
                        () =>
                          setExpanded((old) =>
                            old.includes(j) ? old : [...old, j],
                          ),
                      )
                    }
                  >
                    Add set
                  </Button>
                  {ex.entries.length > ex.sets &&
                    !ex.entries.at(-1)!.completed && (
                      <Button
                        variant="secondary"
                        disabled={busy || saving}
                        aria-label={`Remove extra set from ${ex.name}`}
                        onClick={() =>
                          void run({
                            type: 'removeSet',
                            id: session.id,
                            exercise: j,
                            set: ex.entries.length - 1,
                          })
                        }
                      >
                        Remove extra
                      </Button>
                    )}
                </div>
              )}
              {suggestion?.increase && (
                <details className="mt-3 text-caption-1-regular text-text-secondary">
                  <summary>Progression</summary>
                  <p>
                    Previous sets reached {ex.max} reps. Increase weight only
                    when ready.
                  </p>
                </details>
              )}
            </article>
          );
        })}
      {!finished && (
        <div className="workout-dock sticky z-20 rounded-2xl border border-border-button-default bg-background-primary-default p-3 shadow-lg">
          <RestTimer until={until} setUntil={setUntil} />
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-body-medium">
                {next
                  ? `${session.exercises[nextJ].name} · set ${nextI + 1}`
                  : 'All sets done'}
              </p>
              <p className="text-caption-1-regular">
                {next
                  ? `${next.weightKg === null ? '?' : display(next.weightKg, unit)} ${unit} × ${next.reps ?? '?'} reps`
                  : ''}
              </p>
            </div>
            <Button
              leadingIcon={RiCheckLine}
              disabled={
                busy ||
                saving ||
                (!!next && !validSet({ ...next, completed: true }))
              }
              onClick={() => (next ? mark(nextJ, nextI) : finish())}
            >
              {next ? 'Log set' : 'Finish'}
            </Button>
            {undo && (
              <Button
                variant="secondary"
                disabled={busy || saving}
                onClick={() =>
                  void run({ type: 'set', id: session.id, ...undo }, () => {
                    setUndo(null);
                    setUntil(0);
                  })
                }
              >
                Undo
              </Button>
            )}
          </div>
          {next && !validSet({ ...next, completed: true }) && (
            <p className="mt-2 text-caption-1-regular text-text-secondary">
              Enter weight and reps.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
function SetNote({
  exercise,
  set,
  note,
  disabled,
  onSave,
}: {
  exercise: string;
  set: number;
  note: string;
  disabled: boolean;
  onSave: (note: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(note);
  const [saving, setSaving] = useState(false);
  const saveNote = async () => {
    if (saving || draft === note) return;
    setSaving(true);
    try {
      await onSave(draft.trim());
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="set-note ml-10 mt-1">
      <label className="sr-only" htmlFor={`set-note-${exercise}-${set}`}>
        How {exercise} set {set} felt
      </label>
      <textarea
        id={`set-note-${exercise}-${set}`}
        value={draft}
        maxLength={1000}
        rows={2}
        disabled={disabled || saving}
        placeholder="How did that set feel?"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void saveNote()}
      />
      <Button
        variant="secondary"
        disabled={disabled || saving || draft === note}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => void saveNote()}
      >
        Save note
      </Button>
    </div>
  );
}
function SetField({
  draftKey,
  label,
  value,
  max,
  integer = false,
  disabled,
  onSave,
}: {
  draftKey: string;
  label: string;
  value: number | null;
  max: number;
  integer?: boolean;
  disabled: boolean;
  onSave: (n: number | null) => Promise<boolean>;
}) {
  const [draft, setDraft] = useDeviceDraft<string | null>(
    `set-field-${draftKey}`,
    null,
  );
  const version = useRef(0);
  const text = draft ?? (value === null ? '' : String(value));
  const valid =
    text === '' ||
    (Number.isFinite(Number(text)) &&
      Number(text) >= 0 &&
      Number(text) <= max &&
      (!integer || Number.isInteger(Number(text))));
  return (
    <Input
      aria-label={label}
      inputMode={integer ? 'numeric' : 'decimal'}
      value={text}
      isDisabled={disabled}
      isInvalid={!valid}
      fieldClassName="min-h-11"
      onChange={(v) => {
        setDraft(v);
        const revision = ++version.current;
        const n = v === '' ? null : Number(v);
        if (
          n !== null &&
          (!Number.isFinite(n) ||
            n < 0 ||
            n > max ||
            (integer && !Number.isInteger(n)))
        )
          return;
        void onSave(n).then((ok) => {
          if (ok && version.current === revision && !v.endsWith('.'))
            setDraft(null);
        });
      }}
    />
  );
}
function RestTimer({
  until,
  setUntil,
}: {
  until: number;
  setUntil: (n: number) => void;
}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setNow(Date.now());
    if (!until) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [until]);
  const seconds = Math.max(0, Math.ceil((until - now) / 1000));
  if (!until) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-separator-border pb-2">
      <span className="text-body-medium tabular-nums">
        {seconds
          ? `Rest ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
          : 'Rest done'}
      </span>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          onClick={() => setUntil(Math.max(Date.now(), until) + 30000)}
        >
          +30s
        </Button>
        <Button variant="secondary" onClick={() => setUntil(0)}>
          Skip
        </Button>
      </div>
    </div>
  );
}
