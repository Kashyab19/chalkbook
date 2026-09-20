'use client';
import { useState } from 'react';
import { CalendarDays, ArrowRight } from 'lucide-react';
import { Picker, Chart, performance } from './controls';
import { dateLabel, display, type Data, type Session } from '@/lib/training';
import { ExerciseArt } from './exercise-art';
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
    [range, setRange] = useState('90'),
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
  const now = Date.now();
  const meaningfulSessions = data.sessions.filter((s) =>
    s.exercises.some((e) => e.entries.some((entry) => entry.completed)),
  );
  const filtered = meaningfulSessions.filter(
    (s) =>
      (workout === 'all' || s.templateId === workout) &&
      (!date || s.date === date) &&
      (range === 'all' || now - Date.parse(`${s.date}T12:00:00`) <= Number(range) * 86400000) &&
      (exercise === 'all' || s.exercises.some((e) => e.id === exercise)),
  );
  const recent = (days: number) =>
    meaningfulSessions.filter(
      (s) => now - Date.parse(`${s.date}T12:00:00`) < days * 86400000,
    );
  const activity = Array.from({ length: 8 }, (_, index) => {
    const end = now - (7 - index) * 7 * 86400000;
    const start = end - 7 * 86400000;
    return meaningfulSessions.filter((s) => {
      const time = Date.parse(`${s.date}T12:00:00`);
      return time > start && time <= end;
    }).length;
  });
  const activityMax = Math.max(1, ...activity);
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
  return (
    <section className="app-section history-page">
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
              <ExerciseArt name={label} className="history-stat-art" />
              <span>{label}</span>
              <strong>
                {value ? `${value.weight} ${unit} × ${value.reps}` : '—'}
              </strong>
            </article>
          );
        })}
      </div>
      <div className="history-periods paper">
        <div className="history-activity-heading">
          <div><strong>Training rhythm</strong><span>Your completed workouts over the last 8 weeks</span></div>
          <b>{recent(7).length}<small> this week</small></b>
        </div>
        <div className="history-activity-chart" role="img" aria-label={`Weekly workouts for the last eight weeks: ${activity.join(', ')}`}>
          {activity.map((count, index) => (
            <div key={index}><span style={{ height: `${Math.max(8, (count / activityMax) * 100)}%` }} /><small>{index === 7 ? 'Now' : `${7 - index}w`}</small></div>
          ))}
        </div>
        <p>{recent(30).length} workouts in the last 30 days</p>
      </div>
      <div className="history-range" aria-label="History range">
        {[['30', '30 days'], ['90', '90 days'], ['all', 'All time']].map(([value, label]) => (
          <button key={value} aria-pressed={range === value} onClick={() => setRange(value)}>{label}</button>
        ))}
      </div>
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
