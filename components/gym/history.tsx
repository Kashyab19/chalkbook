'use client';
import { useState } from 'react';
import { CalendarDays, ArrowRight, Trophy } from 'lucide-react';
import { Picker, Chart, performance } from './controls';
import { dateLabel, display, type Data, type Session } from '@/lib/training';
export function History({
  data,
  unit,
  open,
  remove,
}: {
  data: Data;
  unit: string;
  open: (s: Session) => void;
  remove: (id: string) => void;
}) {
  const [workout, setWorkout] = useState('all'),
    [exercise, setExercise] = useState('all'),
    [date, setDate] = useState(''),
    [metric, setMetric] = useState('weight'),
    [atWeight, setAtWeight] = useState('');
  const exerciseOptions = Array.from(
    new Map(
      [
        ...data.program.flatMap((d) => d.exercises),
        ...data.sessions.flatMap((s) => s.exercises),
      ].map((e) => [e.id, { value: e.id, label: e.name }]),
    ).values(),
  );
  const filtered = data.sessions.filter(
    (s) =>
      (workout === 'all' || s.templateId === workout) &&
      (!date || s.date === date) &&
      (exercise === 'all' || s.exercises.some((e) => e.id === exercise)),
  );
  const now = Date.now();
  const recent = (days: number) =>
    data.sessions.filter(
      (s) => now - Date.parse(`${s.date}T12:00:00`) < days * 86400000,
    );
  const best = (name: string) =>
    data.sessions
      .flatMap((s) =>
        s.exercises
          .filter((e) => e.name.toLowerCase().includes(name))
          .flatMap((e) =>
            e.entries
              .filter(
                (v) => v.completed && v.weightKg !== null && v.reps !== null,
              )
              .map((v) => ({
                weight: display(v.weightKg!, unit),
                reps: v.reps!,
              })),
          ),
      )
      .sort((a, b) => b.weight - a.weight || b.reps - a.reps)[0];
  const progression = filtered
    .filter((s) =>
      s.exercises.some(
        (e) => e.id === exercise && e.entries.some((v) => v.completed),
      ),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  const rows = progression.flatMap((s) => {
    const entries = s.exercises
      .find((e) => e.id === exercise)!
      .entries.filter(
        (v) =>
          v.completed &&
          v.weightKg !== null &&
          v.reps !== null &&
          (metric !== 'reps' ||
            atWeight === '' ||
            Math.abs(display(v.weightKg!, unit) - Number(atWeight)) < 0.05),
      );
    if (!entries.length) return [];
    return [
      {
        date: s.date,
        value:
          Math.round(
            Math.max(
              ...entries.map((v) =>
                metric === 'reps'
                  ? v.reps!
                  : display(v.weightKg!, unit) *
                    (metric === '1rm' ? 1 + v.reps! / 30 : 1),
              ),
            ) * 10,
          ) / 10,
      },
    ];
  });
  const frictionRows = Array.from(
    data.sessions
      .filter((s) => s.interactions)
      .reduce((weeks, s) => {
        const date = new Date(`${s.date}T12:00:00`);
        const offset = (date.getDay() + 6) % 7;
        date.setDate(date.getDate() - offset);
        const week = date.toISOString().slice(0, 10);
        const completed = s.exercises.reduce(
          (total, exercise) =>
            total + exercise.entries.filter((entry) => entry.completed).length,
          0,
        );
        const metrics = s.interactions!;
        const current = weeks.get(week) ?? { interactions: 0, completed: 0 };
        current.interactions +=
          metrics.clicks + metrics.touches + metrics.keyboardEnters;
        current.completed += completed;
        weeks.set(week, current);
        return weeks;
      }, new Map<string, { interactions: number; completed: number }>())
      .entries(),
  )
    .map(([date, totals]) => ({
      date,
      value:
        totals.completed === 0
          ? 0
          : Math.round((totals.interactions / totals.completed) * 10) / 10,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return (
    <section>
      <p className="eyebrow">YOUR TRAINING RECORD</p>
      <h1>History</h1>
      <div className="history-summary-grid">
        {[
          ['Bench Press', 'bench'],
          ['Back Squat', 'squat'],
          ['Deadlift', 'deadlift'],
        ].map(([label, key]) => {
          const value = best(key);
          return (
            <article className="paper history-stat" key={key}>
              <Trophy size={18} />
              <span>{label}</span>
              <strong>
                {value ? `${value.weight} ${unit} × ${value.reps}` : '—'}
              </strong>
              <small>Best logged set</small>
            </article>
          );
        })}
      </div>
      <div className="history-periods paper">
        <strong>Recent training</strong>
        <span>Last 7 days: {recent(7).length} workouts</span>
        <span>Last 30 days: {recent(30).length} workouts</span>
      </div>
      {frictionRows.length > 0 && (
        <div className="paper">
          <h2>Friction trend</h2>
          <p className="muted small">
            Interactions per completed set, by week. Lower usually means a
            smoother logging flow.
          </p>
          <Chart
            rows={frictionRows}
            unit="interactions / set"
            label="Weekly workout interaction friction"
          />
        </div>
      )}
      <details className="history-filters">
        <summary>Filter history</summary>
        <div className="filters">
          <Picker
            label="Workout filter"
            value={workout}
            onChange={setWorkout}
            items={[
              { value: 'all', label: 'All workouts' },
              ...data.program
                .filter((d) => d.exercises.length)
                .map((d) => ({ value: d.id, label: d.name })),
            ]}
          />
          <Picker
            label="Exercise filter"
            value={exercise}
            onChange={setExercise}
            items={[
              { value: 'all', label: 'All exercises' },
              ...exerciseOptions,
            ]}
          />
          <input
            type="date"
            aria-label="History date filter"
            value={date}
            onInput={(e) => setDate(e.currentTarget.value)}
          />
          {(date || exercise !== 'all' || workout !== 'all') && (
            <button
              className="text-button"
              onClick={() => {
                setDate('');
                setExercise('all');
                setWorkout('all');
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      </details>
      {exercise !== 'all' && (
        <div className="paper">
          <h2>{exerciseOptions.find((e) => e.value === exercise)?.label}</h2>
          <div className="filters">
            <Picker
              label="Chart metric"
              value={metric}
              onChange={setMetric}
              items={[
                { value: 'weight', label: 'Top set weight' },
                { value: 'reps', label: 'Best reps at weight' },
                { value: '1rm', label: 'Estimated 1RM' },
              ]}
            />
            {metric === 'reps' && (
              <label>
                At weight ({unit})
                <input
                  type="number"
                  inputMode="decimal"
                  value={atWeight}
                  placeholder="All weights"
                  onChange={(e) => setAtWeight(e.target.value)}
                />
              </label>
            )}
          </div>
          <Chart
            rows={rows}
            unit={metric === 'reps' ? 'reps' : unit}
            label="Exercise progression"
          />
          {metric === '1rm' && (
            <p className="muted small">
              Estimate: weight × (1 + reps ÷ 30). Actual logged sets are shown
              below.
            </p>
          )}
        </div>
      )}
      {!filtered.length ? (
        <div className="empty-state">
          <CalendarDays size={30} />
          <h2>No workouts here yet.</h2>
          <p>Completed sets will build your training record.</p>
        </div>
      ) : (
        [...filtered]
          .sort((a, b) => b.date.localeCompare(a.date))
          .map((s) => (
            <article className="paper history-entry" key={s.id}>
              <div className="row-between">
                <div>
                  <p className="eyebrow">
                    {dateLabel(s.date)} · {s.date.slice(0, 4)}
                  </p>
                  <h2>{s.name}</h2>
                </div>
                <button className="text-button" onClick={() => open(s)}>
                  Edit session <ArrowRight size={16} />
                </button>
              </div>
              {s.exercises
                .filter((e) => exercise === 'all' || e.id === exercise)
                .map((e) => (
                  <button
                    key={e.id}
                    className="history-exercise"
                    onClick={() => setExercise(e.id)}
                  >
                    <span>{e.name}</span>
                    <strong>{performance(e.entries, unit)}</strong>
                  </button>
                ))}
              <div className="row-between">
                <span className="muted small">
                  {s.completedAt ? 'Complete' : 'In progress'}
                </span>
                <button
                  className="text-button danger"
                  onClick={() => remove(s.id)}
                >
                  Delete session
                </button>
              </div>
            </article>
          ))
      )}
    </section>
  );
}
