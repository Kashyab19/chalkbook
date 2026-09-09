import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { Badge } from '@/components/base/badges/badge';
import {
  RiAddLine,
  RiCheckLine,
  RiArrowGoBackLine,
  RiArrowDownSLine,
  RiArrowUpSLine,
} from '@remixicon/react';
import { defaultProgram } from './training';
import { cx } from '@/utils/cx';
export type WorkoutSet = { weight: string; reps: string; done: boolean };
export const validSet = (s: WorkoutSet) =>
  s.weight.trim() !== '' &&
  Number.isFinite(Number(s.weight)) &&
  Number(s.weight) >= 0 &&
  s.reps.trim() !== '' &&
  Number.isInteger(Number(s.reps)) &&
  Number(s.reps) > 0;
export const addExtraSet = (row: WorkoutSet[]) => [
  ...row,
  {
    weight: row.at(-1)?.weight ?? '',
    reps: row.at(-1)?.reps ?? '',
    done: false,
  },
];
const card =
  'rounded-3xl border border-border-button-default bg-background-primary-default p-4 sm:p-6';
export function Workout({
  sets,
  setSets,
  finished,
  setFinished,
  restUntil,
  setRestUntil,
}: {
  sets: WorkoutSet[][];
  setSets: Dispatch<SetStateAction<WorkoutSet[][]>>;
  finished: boolean;
  setFinished: (v: boolean) => void;
  restUntil: number;
  setRestUntil: (v: number) => void;
}) {
  const [expanded, setExpanded] = useState<number[]>([]),
    [undo, setUndo] = useState<{ j: number; i: number } | null>(null),
    [notice, setNotice] = useState('');
  const total = sets.flat().length,
    done = sets.flat().filter((s) => s.done).length;
  const nextJ = sets.findIndex((row) => row.some((s) => !s.done)),
    nextI = nextJ < 0 ? -1 : sets[nextJ].findIndex((s) => !s.done);
  const next = nextJ < 0 ? null : sets[nextJ][nextI];
  const edit = (
    j: number,
    i: number,
    field: 'weight' | 'reps',
    value: string,
  ) =>
    setSets((old) =>
      old.map((row, a) =>
        a === j
          ? row.map((s, b) => {
              if (b !== i) return s;
              const changed = { ...s, [field]: value };
              return { ...changed, done: s.done && validSet(changed) };
            })
          : row,
      ),
    );
  const mark = (j: number, i: number) => {
    const s = sets[j][i];
    if (!s.done && !validSet(s)) return;
    setSets((old) =>
      old.map((row, a) =>
        a === j
          ? row.map((v, b) => (b === i ? { ...v, done: !v.done } : v))
          : row,
      ),
    );
    if (!s.done) {
      if (sets[j].every((entry, index) => index === i || entry.done))
        setExpanded((old) => old.filter((x) => x !== j));
      setUndo({ j, i });
      setRestUntil(Date.now() + 90000);
      setNotice(`${defaultProgram[0].exercises[j].name}, set ${i + 1} logged.`);
    } else {
      setRestUntil(0);
      setUndo(null);
      setNotice('Set marked incomplete.');
    }
  };
  const undoLast = () => {
    if (!undo) return;
    setSets((old) =>
      old.map((row, j) =>
        j === undo.j
          ? row.map((s, i) => (i === undo.i ? { ...s, done: false } : s))
          : row,
      ),
    );
    setRestUntil(0);
    setUndo(null);
    setNotice('Last set completion undone.');
  };
  const add = (j: number) => {
    setSets((old) => old.map((row, i) => (i === j ? addExtraSet(row) : row)));
    setExpanded((old) => (old.includes(j) ? old : [...old, j]));
    setNotice(
      `Added set ${sets[j].length + 1} to ${defaultProgram[0].exercises[j].name}.`,
    );
  };
  return (
    <section className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 py-2">
        <div>
          <h1 className="text-title-2-medium">
            Legs{finished ? ' · finished' : ''}
          </h1>
          <p className="text-body-regular">
            {done}/{total} sets done
          </p>
        </div>
        <Button
          variant="secondary"
          className="min-h-11"
          disabled={!finished && !done}
          onClick={() => {
            setFinished(!finished);
            setRestUntil(0);
            setUndo(null);
          }}
        >
          {finished ? 'Resume' : 'Finish'}
        </Button>
      </div>
      {defaultProgram[0].exercises.map((ex, j) => {
        const complete = sets[j].every((s) => s.done),
          open = !complete || expanded.includes(j);
        return (
          <article
            key={ex.id}
            className={cx(
              card,
              j === nextJ && !finished && 'ring-2 ring-accent-400',
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-headline-medium">{ex.name}</h2>
                <p className="mt-1 text-caption-1-regular text-text-primary">
                  {sets[j].filter((s) => s.done).length}/{sets[j].length} logged
                  · {ex.min}–{ex.max} reps
                </p>
              </div>
              <div className="flex items-center gap-2">
                {j === nextJ && !finished && (
                  <Badge color="primary">Up next</Badge>
                )}
                {complete && (
                  <Button
                    variant="secondary"
                    leadingIcon={open ? RiArrowUpSLine : RiArrowDownSLine}
                    className="min-h-11"
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
                    {open ? 'Collapse' : 'Completed'}
                  </Button>
                )}
              </div>
            </div>
            {open && (
              <div className="mt-5">
                <div className="workout-grid mb-2 text-caption-1-medium text-text-primary">
                  <span>Set</span>
                  <span>kg</span>
                  <span>Reps</span>
                  <span className="text-center">Done</span>
                </div>
                <div className="flex flex-col gap-3">
                  {sets[j].map((s, i) => (
                    <div
                      key={i}
                      id={`set-${j}-${i}`}
                      className={cx(
                        'workout-grid scroll-mt-4 rounded-xl',
                        s.done && 'bg-background-secondary-default',
                        j === nextJ &&
                          i === nextI &&
                          !finished &&
                          'bg-accent-50',
                      )}
                    >
                      <span className="text-body-medium text-center">
                        {i + 1}
                        {i >= ex.sets && (
                          <span className="block text-caption-1-regular">
                            extra
                          </span>
                        )}
                      </span>
                      <Input
                        aria-label={`${ex.name} set ${i + 1} weight`}
                        value={s.weight}
                        inputMode="decimal"
                        onChange={(v) => edit(j, i, 'weight', v)}
                        isDisabled={finished}
                        fieldClassName="min-h-11"
                      />
                      <Input
                        aria-label={`${ex.name} set ${i + 1} reps`}
                        value={s.reps}
                        inputMode="numeric"
                        onChange={(v) => edit(j, i, 'reps', v)}
                        isDisabled={finished}
                        fieldClassName="min-h-11"
                      />
                      <Button
                        iconOnly
                        className="min-h-11 min-w-11"
                        leadingIcon={RiCheckLine}
                        variant={s.done ? 'primary' : 'secondary'}
                        aria-label={`${s.done ? 'Unmark' : 'Complete'} ${ex.name} set ${i + 1}`}
                        aria-pressed={s.done}
                        disabled={finished || (!s.done && !validSet(s))}
                        onClick={() => mark(j, i)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
            {!finished && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  className="min-h-11"
                  leadingIcon={RiAddLine}
                  aria-label={`Add set to ${ex.name}`}
                  onClick={() => add(j)}
                >
                  Add set
                </Button>
                {sets[j].length > ex.sets && !sets[j].at(-1)!.done && (
                  <Button
                    variant="secondary"
                    className="min-h-11"
                    aria-label={`Remove extra set from ${ex.name}`}
                    onClick={() => {
                      setSets((old) =>
                        old.map((row, i) => (i === j ? row.slice(0, -1) : row)),
                      );
                      setNotice('Unused extra set removed.');
                    }}
                  >
                    Remove last extra
                  </Button>
                )}
              </div>
            )}
          </article>
        );
      })}
      <p role="status" className="sr-only">
        {notice}
      </p>
      {!finished && (
        <div className="workout-dock sticky bottom-0 z-20 rounded-2xl border border-border-button-default bg-background-primary-default p-4 shadow-lg">
          <RestTimer until={restUntil} onChange={setRestUntil} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-body-medium">
                {next
                  ? `${defaultProgram[0].exercises[nextJ].name} · set ${nextI + 1}`
                  : 'All sets done'}
              </p>
              <p className="text-caption-1-regular text-text-primary">
                {next
                  ? `${next.weight || '—'} kg × ${next.reps || '—'} reps`
                  : ''}
              </p>
            </div>
            <Button
              className="min-h-12 flex-1 sm:flex-none"
              leadingIcon={RiCheckLine}
              disabled={!!next && !validSet(next)}
              onClick={() => {
                if (next) mark(nextJ, nextI);
                else {
                  setFinished(true);
                  setRestUntil(0);
                  setUndo(null);
                }
              }}
            >
              {next ? 'Log set' : 'Finish'}
            </Button>
            {undo && (
              <Button
                variant="secondary"
                className="min-h-11"
                leadingIcon={RiArrowGoBackLine}
                onClick={undoLast}
              >
                Undo
              </Button>
            )}
          </div>
          {next && !validSet(next) && (
            <p className="mt-2 text-caption-1-regular text-text-error-primary">
              Enter a weight of zero or more and a positive whole number of
              reps.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
function RestTimer({
  until,
  onChange,
}: {
  until: number;
  onChange: (n: number) => void;
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
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-separator-border pb-3">
      <p className="text-body-medium tabular-nums">
        {seconds
          ? `Rest · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
          : 'Rest done'}
      </p>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          className="min-h-11"
          onClick={() => onChange(Math.max(Date.now(), until) + 30000)}
        >
          +30 sec
        </Button>
        <Button
          variant="secondary"
          className="min-h-11"
          onClick={() => onChange(0)}
        >
          {seconds ? 'Skip rest' : 'Dismiss'}
        </Button>
      </div>
    </div>
  );
}
