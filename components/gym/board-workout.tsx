'use client';
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { Button } from '@/components/boardui/base/buttons/button';
import { Input } from '@/components/boardui/base/input/input';
import {
  RiAddLine,
  RiArrowRightLine,
  RiChat1Line,
  RiCheckLine,
  RiMore2Line,
  RiPencilLine,
  RiPauseLine,
  RiTimeLine,
} from '@remixicon/react';
import {
  type Session,
  type SetLog,
  type InteractionMetrics,
  display,
  toKg,
  previous,
  target,
} from '@/lib/training';
import { type Action, validSet } from '@/lib/operations';
import { cx } from '@/lib/boardui-cx';
import { useDeviceDraft } from '@/hooks/use-device-draft';
import { ExerciseArt } from './exercise-art';
export function BoardWorkout({
  session,
  sessions,
  unit,
  restSeconds,
  save,
  saving,
}: {
  session: Session;
  sessions: Session[];
  unit: string;
  restSeconds: number;
  save: (action: Action | Action[]) => Promise<boolean>;
  saving: boolean;
}) {
  const [undo, setUndo] = useState<{
      exercise: number;
      set: number;
      value: SetLog;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [noteTarget, setNoteTarget] = useState<{
      exercise: number;
      set: number;
    } | null>(null),
    [noteOpen, setNoteOpen] = useState(false),
    [swapOpen, setSwapOpen] = useState(false),
    [swapName, setSwapName] = useState('');
  const [until, setUntil] = useDeviceDraft<number>(`rest-${session.id}`, 0);
  const lock = useRef(false);
  const interactions = useRef<InteractionMetrics>(
    session.interactions ?? { clicks: 0, touches: 0, keyboardEnters: 0 },
  );
  const interactionAction = (): Action => ({
    type: 'interactions',
    id: session.id,
    value: { ...interactions.current },
  });
  const recordInteraction = (
    event: PointerEvent<HTMLDivElement> | KeyboardEvent<HTMLDivElement>,
  ) => {
    const target = event.target as Element;
    if (!target.closest('button,input,textarea,select,[role="checkbox"]'))
      return;
    if (event.type === 'keydown') {
      if ((event as KeyboardEvent<HTMLDivElement>).key === 'Enter')
        interactions.current.keyboardEnters++;
      return;
    }
    if ((event as PointerEvent<HTMLDivElement>).pointerType === 'touch')
      interactions.current.touches++;
    else interactions.current.clicks++;
  };
  const run = async (action: Action | Action[], after?: () => void) => {
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
  const currentExercise = nextJ < 0 ? null : session.exercises[nextJ];
  const currentPrevious = currentExercise
    ? previous(sessions, currentExercise.id, session.date)
    : null;
  const previousSet = currentExercise && nextI > 0
    ? currentExercise.entries[nextI - 1]
    : null;
  const nextExercise = session.exercises.find(
    (exercise, index) =>
      index > nextJ && exercise.entries.some((entry) => !entry.completed),
  );
  const mark = (j: number, i: number) => {
    const value = session.exercises[j].entries[i];
    void run(
      [
        {
          type: 'set',
          id: session.id,
          exercise: j,
          set: i,
          value: { ...value, completed: !value.completed },
        },
        interactionAction(),
      ],
      () => {
        if (!value.completed) {
          setUndo({ exercise: j, set: i, value });
          setNoteTarget({ exercise: j, set: i });
          setNoteOpen(false);
          setUntil(Date.now() + restSeconds * 1000);
        } else {
          setUndo(null);
          setUntil(0);
        }
      },
    );
  };
  const finish = () =>
    void run(
      [
        {
          type: 'finish',
          id: session.id,
          completedAt: finished ? null : new Date().toISOString(),
        },
        interactionAction(),
      ],
      () => {
        setUntil(0);
        setUndo(null);
      },
    );
  const swapExercise = () => {
    const name = swapName.trim();
    if (!currentExercise || !name || name === currentExercise.name) {
      setSwapOpen(false);
      return;
    }
    const updated: Session = {
      ...session,
      exercises: session.exercises.map((exercise, index) =>
        index === nextJ
          ? { ...exercise, id: `custom-${crypto.randomUUID()}`, name }
          : exercise,
      ),
    };
    void run({ type: 'restoreSession', session: updated }, () => {
      setSwapOpen(false);
      setSwapName('');
    });
  };
  return (
    <div
      className="focus-workout"
      onPointerUpCapture={recordInteraction}
      onKeyDownCapture={recordInteraction}
    >
      <header className="focus-session-header">
        <div>
          <p className="focus-session-name">{session.name}</p>
          <p className="focus-session-date">
            {new Intl.DateTimeFormat('en', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            }).format(new Date(`${session.date}T12:00:00`))}
          </p>
        </div>
        <div className="focus-progress" aria-label={`${done} of ${total} sets done`}>
          <span>{done} / {total}</span>
          <div><i style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></div>
        </div>
        <Button
          iconOnly
          variant="secondary"
          leadingIcon={RiMore2Line}
          className="focus-menu"
          aria-label={finished ? 'Resume workout' : 'Finish workout'}
          disabled={busy || saving || (!finished && !done)}
          onClick={finish}
        />
      </header>

      {currentExercise && next ? (
        <main className="focus-current" aria-live="polite">
          <ExerciseArt name={currentExercise.name} className="focus-hero-art" />
          <div className="focus-exercise-title">
            <h2>{currentExercise.name}</h2>
            <button
              type="button"
              className="focus-swap-trigger"
              aria-label={`Swap ${currentExercise.name}`}
              disabled={busy || saving || finished}
              onClick={() => {
                setSwapName(currentExercise.name);
                setSwapOpen(true);
              }}
            >
              <RiPencilLine aria-hidden />
              <span>Swap</span>
            </button>
          </div>
          <p className="focus-set-count">Set {nextI + 1} of {currentExercise.entries.length}</p>
          {swapOpen ? (
            <form className="focus-swap-form" onSubmit={(event) => { event.preventDefault(); swapExercise(); }}>
              <Input
                autoFocus
                aria-label="Replacement exercise name"
                value={swapName}
                maxLength={100}
                onChange={(value) => setSwapName(value)}
              />
              <button type="button" onClick={() => setSwapOpen(false)}>Cancel</button>
              <button type="submit" disabled={!swapName.trim() || busy || saving}>Use</button>
            </form>
          ) : previousSet?.completed && previousSet.weightKg != null && previousSet.reps != null ? (
            <button
              type="button"
              className="focus-previous focus-previous-set"
              disabled={busy || saving || finished}
              onClick={() => void run({
                type: 'set', id: session.id, exercise: nextJ, set: nextI,
                value: { ...next, weightKg: previousSet.weightKg, reps: previousSet.reps, completed: false },
              })}
            >
              Previous <strong>{display(previousSet.weightKg, unit)} {unit} × {previousSet.reps}</strong>
              <span>Use</span>
            </button>
          ) : currentPrevious ? (
            <p className="focus-previous">
              Last time <strong>
                {currentPrevious.exercise.entries[nextI]?.weightKg == null
                  ? '—'
                  : `${display(currentPrevious.exercise.entries[nextI].weightKg!, unit)} ${unit}`}
                {' × '}
                {currentPrevious.exercise.entries[nextI]?.reps ?? '—'}
              </strong>
            </p>
          ) : (
            <p className="focus-previous">First time · set your baseline</p>
          )}

          <div className="focus-fields">
            <FocusField
              label="Weight"
              unit={unit}
              value={next.weightKg === null ? null : display(next.weightKg, unit)}
              step={unit === 'lb' ? 5 : 2.5}
              max={display(2000, unit)}
              disabled={finished || busy || saving}
              onSave={(value) => save({
                type: 'set', id: session.id, exercise: nextJ, set: nextI,
                value: { ...next, weightKg: value === null ? null : toKg(value, unit), completed: false },
              })}
            />
            <FocusField
              label="Reps"
              unit="reps"
              value={next.reps}
              step={1}
              max={500}
              integer
              disabled={finished || busy || saving}
              onSave={(value) => save({
                type: 'set', id: session.id, exercise: nextJ, set: nextI,
                value: { ...next, reps: value, completed: false },
              })}
            />
          </div>

          <button
            className="focus-log-button"
            disabled={busy || saving || !validSet({ ...next, completed: true })}
            onClick={() => mark(nextJ, nextI)}
          >
            <span>Log set</span><RiArrowRightLine aria-hidden />
          </button>
          {!validSet({ ...next, completed: true }) ? (
            <p className="focus-help">Enter weight and reps to log this set.</p>
          ) : null}
        </main>
      ) : (
        <div className="focus-complete">
          <RiCheckLine aria-hidden />
          <h2>Workout complete</h2>
          <p>{done} sets logged. Strong work.</p>
          <Button onClick={finish}>{finished ? 'Resume workout' : 'Finish workout'}</Button>
        </div>
      )}

      {until ? <RestTimer until={until} setUntil={setUntil} /> : null}

      {nextExercise ? (
        <section className="focus-up-next" aria-label="Up next">
          <p>Up next</p>
          <div>
            <ExerciseArt name={nextExercise.name} className="focus-next-art" />
            <strong>{nextExercise.name}</strong>
            <RiArrowRightLine aria-hidden />
          </div>
        </section>
      ) : null}

      {undo || noteTarget ? (
        <div className="focus-quick-actions">
          {undo ? (
            <Button variant="ghost" disabled={busy || saving} onClick={() =>
              void run({ type: 'set', id: session.id, ...undo }, () => {
                setUndo(null); setUntil(0);
              })
            }>Undo last set</Button>
          ) : null}
          {noteTarget ? (
            <Button variant="ghost" leadingIcon={RiChat1Line} disabled={busy || saving}
              aria-expanded={noteOpen} onClick={() => setNoteOpen((open) => !open)}>
              Add note
            </Button>
          ) : null}
        </div>
      ) : null}
      {noteTarget && noteOpen ? (
        <SetNote
          key={`${session.id}-${noteTarget.exercise}-${noteTarget.set}`}
          exercise={session.exercises[noteTarget.exercise].name}
          set={noteTarget.set + 1}
          note={session.exercises[noteTarget.exercise].entries[noteTarget.set].note ?? ''}
          disabled={busy || saving}
          onSave={async (note) => {
            const saved = await save({
              type: 'set', id: session.id, exercise: noteTarget.exercise, set: noteTarget.set,
              value: { ...session.exercises[noteTarget.exercise].entries[noteTarget.set], note: note || undefined },
            });
            if (saved) setNoteOpen(false);
            return saved;
          }}
        />
      ) : null}

      <details className="focus-full-workout">
        <summary>Full workout <span>{done}/{total} sets</span></summary>
        <div className="focus-exercise-list">
          {session.exercises.map((exercise, j) => (
            <article key={exercise.id}>
              <div className="focus-exercise-heading">
                <ExerciseArt name={exercise.name} className="focus-list-art" />
                <div><strong>{exercise.name}</strong><span>{exercise.min}–{exercise.max} reps</span></div>
                <b>{exercise.entries.filter((entry) => entry.completed).length}/{exercise.entries.length}</b>
              </div>
              {exercise.entries.map((entry, i) => (
                <div className={cx('focus-set-row', entry.completed && 'is-complete')} key={i}>
                  <span>{i + 1}</span>
                  <SetField draftKey={`${session.id}-${j}-${i}-weight-${unit}`} label={`${exercise.name} set ${i + 1} weight`}
                    value={entry.weightKg === null ? null : display(entry.weightKg, unit)} max={display(2000, unit)} disabled={finished}
                    onSave={(value) => save({ type: 'set', id: session.id, exercise: j, set: i, value: { ...entry, weightKg: value === null ? null : toKg(value, unit), completed: false } })} />
                  <SetField draftKey={`${session.id}-${j}-${i}-reps`} label={`${exercise.name} set ${i + 1} reps`}
                    value={entry.reps} max={500} integer disabled={finished}
                    onSave={(value) => save({ type: 'set', id: session.id, exercise: j, set: i, value: { ...entry, reps: value, completed: false } })} />
                  <Button iconOnly leadingIcon={RiCheckLine} aria-label={`Complete ${exercise.name} set ${i + 1}`}
                    aria-pressed={entry.completed} variant={entry.completed ? 'primary' : 'secondary'}
                    disabled={finished || busy || saving || (!entry.completed && !validSet({ ...entry, completed: true }))}
                    onClick={() => mark(j, i)} />
                </div>
              ))}
              {!finished ? <Button variant="ghost" leadingIcon={RiAddLine} disabled={busy || saving || exercise.entries.length >= 30}
                onClick={() => void run({ type: 'addSet', id: session.id, exercise: j, set: exercise.entries.length,
                  value: { weightKg: exercise.entries.at(-1)?.weightKg ?? null, reps: exercise.entries.at(-1)?.reps ?? null, completed: false } })}>Add set</Button> : null}
              {previous(sessions, exercise.id, session.date) && target(exercise, previous(sessions, exercise.id, session.date)!.exercise.entries).increase ? (
                <p className="focus-progression">Previous sets reached the rep target. Increase weight when ready.</p>
              ) : null}
            </article>
          ))}
        </div>
      </details>
    </div>
  );
}

function FocusField({ label, unit, value, step, max, integer = false, disabled, onSave }: {
  label: string; unit: string; value: number | null; step: number; max: number;
  integer?: boolean; disabled: boolean; onSave: (value: number | null) => Promise<boolean>;
}) {
  const update = (delta: number) => {
    const next = Math.min(max, Math.max(0, (value ?? 0) + delta));
    void onSave(integer ? Math.round(next) : Number(next.toFixed(2)));
  };
  return (
    <div className="focus-field">
      <span>{label}</span>
      <div>
        <button aria-label={`Decrease ${label.toLowerCase()}`} disabled={disabled} onClick={() => update(-step)}>−</button>
        <label>
          <span className="sr-only">{label}</span>
          <input inputMode={integer ? 'numeric' : 'decimal'} value={value ?? ''} placeholder="—" disabled={disabled}
            onChange={(event) => {
              const text = event.target.value;
              if (text === '') { void onSave(null); return; }
              const number = Number(text);
              if (Number.isFinite(number) && number >= 0 && number <= max && (!integer || Number.isInteger(number))) void onSave(number);
            }} />
          <small>{unit}</small>
        </label>
        <button aria-label={`Increase ${label.toLowerCase()}`} disabled={disabled} onClick={() => update(step)}>+</button>
      </div>
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
    <div className="set-note">
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
    <div className="focus-rest" role="timer" aria-live="polite">
      <RiTimeLine aria-hidden />
      <div>
        <span>Rest</span>
        <strong className="tabular-nums">
          {seconds
            ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
            : 'Done'}
        </strong>
      </div>
      <button aria-label="Add 30 seconds" onClick={() => setUntil(Math.max(Date.now(), until) + 30000)}>+30s</button>
      <button aria-label="Skip rest" onClick={() => setUntil(0)}><RiPauseLine aria-hidden /></button>
    </div>
  );
}
