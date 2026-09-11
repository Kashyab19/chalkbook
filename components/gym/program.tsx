'use client';
import { useState } from 'react';
import { useDeviceDraft } from '@/hooks/use-device-draft';
import { ArrowUp, ArrowDown, Plus } from 'lucide-react';
import { Picker } from './controls';
import { days, type Day, type Exercise } from '@/lib/training';
export function Program({
  program,
  onChange,
}: {
  program: Day[];
  onChange: (p: Day[]) => void;
}) {
  const [selected, setSelected] = useDeviceDraft('program:selected', 'legs'),
    [edit, setEdit] = useDeviceDraft<string | null>('program:edit', null),
    [draft, setDraft] = useDeviceDraft<Exercise | null>('program:draft', null),
    [destination, setDestination] = useDeviceDraft('program:destination', ''),
    [error, setError] = useState('');
  const day = program.find((d) => d.id === selected) ?? program[0];
  function reorder(i: number, offset: number) {
    const list = [...day.exercises];
    [list[i], list[i + offset]] = [list[i + offset], list[i]];
    onChange(
      program.map((d) => (d.id === day.id ? { ...d, exercises: list } : d)),
    );
  }
  function commit() {
    if (
      !draft ||
      !draft.name.trim() ||
      draft.sets < 1 ||
      draft.sets > 10 ||
      draft.min < 1 ||
      draft.max < draft.min ||
      draft.max > 100 ||
      ![draft.sets, draft.min, draft.max].every(Number.isInteger)
    ) {
      setError('Use a name, 1–10 sets, and a valid rep range.');
      return;
    }
    if (
      destination !== day.id &&
      program
        .find((d) => d.id === destination)
        ?.exercises.some((e) => e.id === draft.id)
    ) {
      setError('This exercise is already on that day.');
      return;
    }
    onChange(
      program.map((d) => {
        let list = d.exercises;
        if (d.id === day.id) {
          list = edit === 'new' ? list : list.filter((e) => e.id !== edit);
          if (destination === d.id) {
            const position =
              edit === 'new'
                ? list.length
                : day.exercises.findIndex((e) => e.id === edit);
            list = [...list];
            list.splice(position, 0, { ...draft, name: draft.name.trim() });
          }
        }
        if (d.id === destination && destination !== day.id)
          list = [...list, { ...draft, name: draft.name.trim() }];
        return { ...d, exercises: list };
      }),
    );
    setEdit(null);
    setDraft(null);
    setError('');
  }
  return (
    <section className="training-plan">
      <div className="program-intro">
        <div>
          <p className="eyebrow">YOUR WEEK</p>
          <h1>Training plan</h1>
        </div>
        <p className="muted small">Tap a day to edit its exercises.</p>
      </div>
      <div className="program-days">
        {program.map((d) => (
          <button
            aria-pressed={selected === d.id}
            key={d.id}
            onClick={() => {
              setSelected(d.id);
              setEdit(null);
              setDraft(null);
            }}
          >
            <span>{days[d.day].slice(0, 3)}</span>
            <strong>{d.exercises.length ? d.name : 'Rest'}</strong>
          </button>
        ))}
      </div>
      <div className="row-between program-heading">
        <div>
          <p className="program-kicker">DAY PLAN</p>
          <h2>
            {days[day.day]} · {day.name}
          </h2>
          <p className="muted small">
            {day.exercises.length} exercises · Changes apply to new sessions.
          </p>
        </div>
      </div>
      <div className="paper program-list">
        {!!day.exercises.length && (
          <div className="program-list-header">
            <span>Exercises</span>
            <span>{day.exercises.length} total</span>
          </div>
        )}
        {day.exercises.map((e, i) => (
          <div className="program-exercise" key={e.id}>
            <span className="exercise-number">
              {String(i + 1).padStart(2, '0')}
            </span>
            <button
              className="exercise-edit"
              onClick={() => {
                setEdit(e.id);
                setDraft({ ...e });
                setDestination(day.id);
                setError('');
              }}
            >
              <strong>{e.name}</strong>
              <span>
                {e.sets} sets · {e.min}–{e.max} reps
              </span>
            </button>
            <div className="reorder">
              <button
                aria-label={`Move ${e.name} up`}
                disabled={i === 0}
                onClick={() => reorder(i, -1)}
              >
                <ArrowUp size={18} />
              </button>
              <button
                aria-label={`Move ${e.name} down`}
                disabled={i === day.exercises.length - 1}
                onClick={() => reorder(i, 1)}
              >
                <ArrowDown size={18} />
              </button>
            </div>
          </div>
        ))}
        {!day.exercises.length && (
          <p className="muted">
            Rest day. Add an exercise to make it a training day.
          </p>
        )}
        <button
          className="text-button add-exercise"
          onClick={() => {
            setEdit('new');
            setDraft({
              id: crypto.randomUUID(),
              name: '',
              sets: 3,
              min: 8,
              max: 12,
            });
            setDestination(day.id);
            setError('');
          }}
        >
          <Plus size={18} /> Add exercise
        </button>
      </div>
      {draft && (
        <form
          className="paper editor"
          onSubmit={(e) => {
            e.preventDefault();
            commit();
          }}
        >
          <h2>{edit === 'new' ? 'Add exercise' : 'Edit exercise'}</h2>
          <label>
            Exercise name
            <input
              required
              maxLength={100}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <div className="editor-numbers">
            {(
              [
                { key: 'sets', label: 'Sets', max: 10 },
                { key: 'min', label: 'Minimum reps', max: 100 },
                { key: 'max', label: 'Maximum reps', max: 100 },
              ] as const
            ).map((f) => (
              <label key={f.key}>
                {f.label}
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max={f.max}
                  required
                  value={draft[f.key] || ''}
                  onChange={(e) =>
                    setDraft({ ...draft, [f.key]: Number(e.target.value) })
                  }
                />
              </label>
            ))}
          </div>
          <div>
            <span>Training day</span>
            <Picker
              label="Move to day"
              value={destination}
              onChange={setDestination}
              items={program.map((d) => ({
                value: d.id,
                label: `${days[d.day]} · ${d.name}`,
              }))}
            />
          </div>
          {error && (
            <p role="alert" className="danger">
              {error}
            </p>
          )}
          <div className="editor-actions">
            <button className="primary" type="submit">
              Apply changes
            </button>
            <button
              className="text-button"
              type="button"
              onClick={() => {
                setEdit(null);
                setDraft(null);
              }}
            >
              Cancel
            </button>
            {edit !== 'new' && (
              <button
                className="text-button danger"
                type="button"
                onClick={() => {
                  onChange(
                    program.map((d) =>
                      d.id === day.id
                        ? {
                            ...d,
                            exercises: d.exercises.filter((e) => e.id !== edit),
                          }
                        : d,
                    ),
                  );
                  setEdit(null);
                  setDraft(null);
                }}
              >
                Remove exercise
              </button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
