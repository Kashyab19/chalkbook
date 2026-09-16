'use client';
import { useState } from 'react';
import { Chart, Picker } from './controls';
import { type Data } from '@/lib/training';

export function FrictionInsights({ data }: { data: Data }) {
  const [metric, setMetric] = useState('all');
  const rows = Array.from(
    data.sessions
      .filter((session) => session.interactions)
      .reduce((weeks, session) => {
        const date = new Date(`${session.date}T12:00:00`);
        date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
        const week = date.toISOString().slice(0, 10);
        const completed = session.exercises.reduce(
          (total, exercise) =>
            total + exercise.entries.filter((entry) => entry.completed).length,
          0,
        );
        const values = session.interactions!;
        const current = weeks.get(week) ?? {
          clicks: 0,
          touches: 0,
          keyboardEnters: 0,
          completed: 0,
        };
        current.clicks += values.clicks;
        current.touches += values.touches;
        current.keyboardEnters += values.keyboardEnters;
        current.completed += completed;
        weeks.set(week, current);
        return weeks;
      }, new Map<string, { clicks: number; touches: number; keyboardEnters: number; completed: number }>())
      .entries(),
  )
    .map(([date, totals]) => {
      const value =
        metric === 'clicks'
          ? totals.clicks
          : metric === 'touches'
            ? totals.touches
            : metric === 'enters'
              ? totals.keyboardEnters
              : totals.clicks + totals.touches + totals.keyboardEnters;
      return {
        date,
        value:
          totals.completed === 0
            ? 0
            : Math.round((value / totals.completed) * 10) / 10,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  return (
    <details className="friction-insights">
      <summary>Developer Insights</summary>
      {rows.length ? (
        <>
          <p className="muted small">
            Private weekly counts per completed set. Lower usually means a
            smoother logging flow.
          </p>
          <Picker
            label="Friction metric"
            value={metric}
            onChange={setMetric}
            items={[
              { value: 'all', label: 'All interactions' },
              { value: 'clicks', label: 'Clicks' },
              { value: 'touches', label: 'Touches' },
              { value: 'enters', label: 'Enter presses' },
            ]}
          />
          <Chart
            rows={rows}
            unit={`${metric === 'all' ? 'interactions' : metric === 'enters' ? 'Enter presses' : metric} / set`}
            label={`Weekly ${metric} interaction trend`}
          />
        </>
      ) : (
        <p className="muted small">
          Tracking starts with your next completed set. Your first weekly trend
          will appear here automatically.
        </p>
      )}
    </details>
  );
}
