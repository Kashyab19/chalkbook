'use client';
import { useState } from 'react';
import { useDeviceDraft } from '@/hooks/use-device-draft';
import { Trash2 } from 'lucide-react';
import { Chart } from './controls';
import {
  dateKey,
  dateLabel,
  display,
  toKg,
  movingAverage,
  type BodyEntry,
} from '@/lib/training';
export function Body({
  data,
  unit,
  save,
  remove,
}: {
  data: BodyEntry[];
  unit: string;
  save: (date: string, n: number) => Promise<boolean>;
  remove: (date: string) => void;
}) {
  const [projectionStart] = useState(() => Date.now());
  const [date, setDate] = useState(dateKey());
  const [draft, setDraft] = useDeviceDraft<{
    date: string;
    unit: string;
    value: string;
  } | null>('body-entry', null);
  const [message, setMessage] = useState(''),
    [saving, setSaving] = useState(false);
  const entry = data.find((entry) => entry.date === date);
  const value =
    draft?.date === date
      ? draft.unit === unit
        ? draft.value
        : draft.value === ''
          ? ''
          : String(display(toKg(Number(draft.value), draft.unit), unit))
      : entry
        ? String(display(entry.weightKg, unit))
        : '';
  const setValue = (value: string) => setDraft({ date, unit, value });
  const entries = data
    .filter((e) => e.date <= dateKey())
    .sort((a, b) => a.date.localeCompare(b.date));
  const current = entries.at(-1),
    avg = movingAverage(entries, dateKey()),
    prior = movingAverage(entries, dateKey(), 7),
    rate = avg !== null && prior !== null ? avg - prior : null;
  const currentKg = current?.weightKg ?? 53.5;
  const remaining = Math.max(0, 60 - currentKg);
  const projected =
    rate !== null && rate > 0
      ? new Date(
          projectionStart +
            (Math.max(0, 60 - (avg ?? currentKg)) / rate) * 7 * 86400000,
        )
      : null;
  const rows = entries.map((e) => ({
    date: e.date,
    value: display(e.weightKg, unit),
    average: display(movingAverage(entries, e.date)!, unit),
  }));
  const submit = async () => {
    const n = Number(value);
    if (
      !value ||
      !Number.isFinite(n) ||
      toKg(n, unit) < 1 ||
      toKg(n, unit) > 500
    ) {
      setMessage('Enter a valid weight.');
      return;
    }
    setSaving(true);
    const ok = await save(date, toKg(n, unit));
    setMessage(
      ok ? 'Weight saved on device.' : 'Weight not saved. Please retry.',
    );
    if (ok) setDraft(null);
    setSaving(false);
  };
  return (
    <section>
      <p className="eyebrow">A STEADIER VIEW OF PROGRESS</p>
      <h1>Body weight</h1>
      <div className="paper weight-entry">
        <div>
          <h2>{date === dateKey() ? "Today's weight" : dateLabel(date)}</h2>
          <p className="muted small">
            One entry a day. Trends matter more than fluctuations.
          </p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="weight-input">
            <input
              aria-label="Body weight"
              type="number"
              inputMode="decimal"
              step="any"
              min="1"
              required
              placeholder={String(display(currentKg, unit))}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <span>{unit}</span>
          </div>
          <button className="primary" disabled={saving}>
            {saving
              ? 'Saving…'
              : data.some((e) => e.date === date)
                ? 'Update weight'
                : 'Log weight'}
          </button>
          <label className="date-label">
            Entry date
            <input
              type="date"
              aria-label="Body weight date"
              value={date}
              max={dateKey()}
              onInput={(e) =>
                e.currentTarget.value && setDate(e.currentTarget.value)
              }
            />
          </label>
        </form>
        <output className="small">{message}</output>
      </div>
      <div className="stats">
        <div>
          <span>Current weight</span>
          <strong>
            {display(currentKg, unit)} <small>{unit}</small>
          </strong>
          <p>
            {current
              ? `Logged ${dateLabel(current.date)}`
              : 'Approximate starting weight'}
          </p>
        </div>
        <div>
          <span>7-day average</span>
          <strong>
            {avg === null ? '-' : display(avg, unit)} <small>{unit}</small>
          </strong>
          <p>Available entries in the last 7 days</p>
        </div>
        <div>
          <span>Weekly change</span>
          <strong>
            {rate === null
              ? '-'
              : `${rate > 0 ? '+' : ''}${display(rate, unit)}`}{' '}
            <small>{unit}/wk</small>
          </strong>
          <p>Latest 7-day average vs. prior 7 days</p>
        </div>
      </div>
      <div className="paper">
        <div className="row-between">
          <h2>Weight trend</h2>
          <span className="muted small">{unit}</span>
        </div>
        <Chart
          rows={rows}
          goal={display(60, unit)}
          unit={unit}
          label="Daily body weight, 7-day moving average and 60 kg goal"
        />
        <div className="pace">
          <strong>
            {rate === null
              ? 'Building your baseline'
              : rate < 0.25
                ? 'Below target pace'
                : rate <= 0.4
                  ? 'On target'
                  : 'Above target pace'}
          </strong>
          <span>
            {rate === null
              ? 'Log in two consecutive weeks to compare averages.'
              : `Preferred pace: ${unit === 'kg' ? '0.25–0.4 kg' : '0.55–0.88 lb'} per week.`}
          </span>
        </div>
      </div>
      <div className="goal-panel">
        <div>
          <span className="eyebrow">YOUR GOAL</span>
          <h2>
            {display(60, unit)} {unit}
          </h2>
          <p>By December 31, 2026</p>
        </div>
        <div>
          <span className="muted">Remaining</span>
          <strong>
            {display(remaining, unit)} {unit}
          </strong>
        </div>
        <div>
          <span className="muted">Projected goal date</span>
          <strong>
            {remaining === 0
              ? 'Goal reached'
              : projected
                ? projected.toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })
                : 'Not enough upward trend yet'}
          </strong>
        </div>
      </div>
      <p className="muted small">
        Projection uses your recent average rate and will change as you log more
        entries.
      </p>
      {data.length > 0 && (
        <div className="weight-list">
          <h2>Entries</h2>
          {[...data].reverse().map((e) => (
            <div className="weight-item" key={e.date}>
              <button
                onClick={() => {
                  setDate(e.date);
                  setValue(String(display(e.weightKg, unit)));
                  window.scrollTo({ top: 0, behavior: 'auto' });
                }}
              >
                <span>{dateLabel(e.date)}</span>
                <strong>
                  {display(e.weightKg, unit)} {unit}
                </strong>
                <span className="muted">Edit</span>
              </button>
              <button
                className="icon-button danger"
                aria-label={`Delete weight ${e.date}`}
                onClick={() => remove(e.date)}
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
