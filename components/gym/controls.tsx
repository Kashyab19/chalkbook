import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { dateLabel, display, type SetLog } from '@/lib/training';
export function Picker({
  label,
  value,
  onChange,
  items,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  items: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={(v) => v !== null && onChange(v)}>
      <SelectTrigger aria-label={label} className="picker">
        <SelectValue>
          {items.find((i) => i.value === value)?.label || label}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {items.map((i) => (
          <SelectItem className="pick-item" key={i.value} value={i.value}>
            {i.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
export function Stepper({
  label,
  value,
  step,
  max,
  onChange,
  unit,
}: {
  label: string;
  value: number | null;
  step: number;
  max: number;
  onChange: (v: number | null) => void;
  unit?: string;
}) {
  return (
    <div
      className="stepper"
      data-caption={label.endsWith('reps') ? 'reps' : unit || 'weight'}
    >
      <button
        aria-label={`Decrease ${label}`}
        onClick={() =>
          onChange(Math.max(0, Math.round(((value ?? 0) - step) * 10) / 10))
        }
      >
        −{step}
      </button>
      <input
        aria-label={label}
        type="number"
        inputMode={step === 1 ? 'numeric' : 'decimal'}
        min="0"
        max={max}
        step="any"
        placeholder="?"
        value={value ?? ''}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          const n = e.target.value === '' ? null : Number(e.target.value);
          if (n === null || (Number.isFinite(n) && n >= 0 && n <= max))
            onChange(n);
        }}
      />
      <button
        aria-label={`Increase ${label}`}
        onClick={() =>
          onChange(Math.min(max, Math.round(((value ?? 0) + step) * 10) / 10))
        }
      >
        +{step}
      </button>
    </div>
  );
}
export function performance(entries: SetLog[], unit: string) {
  const valid = entries.filter(
    (x) => x.completed && x.weightKg !== null && x.reps !== null,
  );
  if (!valid.length) return 'No completed sets yet';
  if (valid.every((x) => Math.abs(x.weightKg! - valid[0].weightKg!) < 0.001))
    return `${display(valid[0].weightKg!, unit)} ${unit} × ${valid.map((x) => x.reps).join(' / ')}`;
  return valid
    .map((x) => `${display(x.weightKg!, unit)} ${unit} × ${x.reps}`)
    .join(' · ');
}
export function Chart({
  rows,
  goal,
  unit,
  label,
}: {
  rows: { date: string; value: number; average?: number | null }[];
  goal?: number;
  unit: string;
  label: string;
}) {
  if (!rows.length)
    return (
      <div className="chart-empty">
        Your chart will appear after your first entry.
      </div>
    );
  const values = rows.flatMap((r) => [
    r.value,
    ...(r.average == null ? [] : [r.average]),
  ]);
  if (goal !== undefined) values.push(goal);
  const lo = Math.min(...values) - 1,
    hi = Math.max(...values) + 1;
  const start = Date.parse(rows[0].date),
    end = Date.parse(rows[rows.length - 1].date);
  const x = (date: string) =>
    48 +
    (end === start ? 220 : ((Date.parse(date) - start) / (end - start)) * 440);
  const y = (v: number) => 170 - ((v - lo) / (hi - lo)) * 140;
  const line = (key: 'value' | 'average') =>
    rows
      .filter((r) => r[key] != null)
      .map((r) => `${x(r.date)},${y(r[key]!)}`)
      .join(' ');
  return (
    <div className="chart">
      {/* Inline SVG needs an image role for assistive technology. */}
      {/* eslint-disable-next-line jsx-a11y/prefer-tag-over-role */}
      <svg viewBox="0 0 540 205" role="img" aria-label={label}>
        <title>{label}</title>
        {[lo, (lo + hi) / 2, hi].map((v) => (
          <g key={v}>
            <line x1="48" x2="510" y1={y(v)} y2={y(v)} stroke="#e2e6e8" />
            <text x="38" y={y(v) + 4} textAnchor="end">
              {Math.round(v * 10) / 10}
            </text>
          </g>
        ))}
        {goal !== undefined && (
          <g>
            <line
              x1="48"
              x2="510"
              y1={y(goal)}
              y2={y(goal)}
              stroke="#8b989e"
              strokeDasharray="5 5"
            />
            <text x="507" y={y(goal) - 7} textAnchor="end">
              Goal {goal} {unit}
            </text>
          </g>
        )}
        <polyline
          points={line('value')}
          fill="none"
          stroke={goal === undefined ? '#176249' : '#a8b6bd'}
          strokeWidth={goal === undefined ? 3 : 1.5}
        />
        {rows.map((r) => (
          <circle
            key={r.date}
            cx={x(r.date)}
            cy={y(r.value)}
            r="3"
            fill={goal === undefined ? '#176249' : '#a8b6bd'}
          >
            <title>
              {dateLabel(r.date)}: {r.value} {unit}
            </title>
          </circle>
        ))}
        <polyline
          points={line('average')}
          fill="none"
          stroke="#176249"
          strokeWidth="3.5"
        />
        {rows
          .filter((r) => r.average !== undefined && r.average !== null)
          .map((r) => (
            <circle
              key={r.date}
              cx={x(r.date)}
              cy={y(r.average!)}
              r="3.5"
              fill="#176249"
            />
          ))}
        <text x="48" y="196">
          {dateLabel(rows[0].date)}
        </text>
        <text x="510" y="196" textAnchor="end">
          {dateLabel(rows[rows.length - 1].date)}
        </text>
      </svg>
      {goal !== undefined && (
        <div className="legend">
          <span>
            <i />
            7-day average
          </span>
          <span>
            <i className="daily" />
            Daily weight
          </span>
          <span>– – Goal</span>
        </div>
      )}
    </div>
  );
}
