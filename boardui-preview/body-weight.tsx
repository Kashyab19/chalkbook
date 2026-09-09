import { useState } from 'react';
import { cx } from '@/utils/cx';
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@/components/base/segmented-control/segmented-control';
import { RiAddLine, RiCheckLine } from '@remixicon/react';
import {
  DEMO_TODAY,
  DAY,
  dateLabel,
  timestamp,
  weightIn,
  weightSeries,
  type WeightEntry,
} from './weight-data';
// Adapted from the free BoardUI RevenueChartCard's Recharts composition and
// semantic chart tokens. Weight uses observations and calendar-day averages,
// not the source component's revenue totals or year-over-year comparisons.
const card =
  'min-w-0 rounded-3xl border border-border-button-default bg-background-primary-default p-5 sm:p-6';
export function BodyWeight({
  entries,
  onSave,
}: {
  entries: WeightEntry[];
  onSave: (entry: WeightEntry) => void;
}) {
  const [days, setDays] = useState(30),
    [unit, setUnit] = useState('kg'),
    [value, setValue] = useState('76.4'),
    [message, setMessage] = useState(''),
    [expanded, setExpanded] = useState(false);
  const data = weightSeries(entries, days, unit);
  const latest = [...entries].sort((a, b) => b.date.localeCompare(a.date))[0];
  const first = data[0],
    last = data.at(-1);
  const delta = first && last ? last.weight - first.weight : 0;
  const mean = data.length
    ? data.reduce((sum, d) => sum + d.weight, 0) / data.length
    : 0;
  const valid =
    value.trim() !== '' && Number.isFinite(Number(value)) && Number(value) > 0;
  const lower = data.length
    ? Math.floor(Math.min(...data.map((d) => d.weight)) - 0.5)
    : 0;
  const upper = data.length
    ? Math.ceil(Math.max(...data.map((d) => d.weight)) + 0.5)
    : 1;
  const changeUnit = (next: string) => {
    if (valid)
      setValue(
        weightIn(
          Number(value) / (unit === 'lb' ? 2.2046226218 : 1),
          next,
        ).toFixed(1),
      );
    setUnit(next);
    setMessage('');
  };
  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    onSave({
      date: DEMO_TODAY,
      weight: Number(value) / (unit === 'lb' ? 2.2046226218 : 1),
    });
    setMessage('Saved');
  };
  return (
    <div className="flex flex-col gap-6 pt-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-title-1-medium">Body weight</h1>
        </div>
        <SegmentedControl
          aria-label="Weight units"
          selectedKeys={[unit]}
          onSelectionChange={(keys) => changeUnit(String([...keys][0]))}
        >
          {['kg', 'lb'].map((u) => (
            <SegmentedControlItem key={u} id={u} className="min-h-9 min-w-12">
              {u}
            </SegmentedControlItem>
          ))}
        </SegmentedControl>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Stat
          label="Latest"
          value={latest ? weightIn(latest.weight, unit).toFixed(1) : '—'}
          unit={unit}
          detail={latest ? dateLabel(latest.date) : 'No entries yet'}
        />
        <Stat
          label="Change"
          value={
            data.length > 1 ? `${delta > 0 ? '+' : ''}${delta.toFixed(1)}` : '—'
          }
          unit={unit}
          detail={
            first && last
              ? `${dateLabel(first.date)} – ${dateLabel(last.date)}`
              : 'Add two entries to compare'
          }
        />
      </div>
      <section className={card} aria-labelledby="weight-chart-title">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 id="weight-chart-title" className="text-headline-medium">
              Trend
            </h2>
            <p className="mt-1 text-body-regular text-text-primary">
              {dateLabel(timestamp(DEMO_TODAY) - (days - 1) * DAY)} –{' '}
              {dateLabel(DEMO_TODAY)}, 2026 · {unit}
            </p>
          </div>
          <SegmentedControl
            aria-label="Chart date range"
            selectedKeys={[String(days)]}
            onSelectionChange={(keys) => setDays(Number([...keys][0]))}
          >
            {[7, 30, 90].map((d) => (
              <SegmentedControlItem key={d} id={String(d)} className="min-h-9">
                {d} days
              </SegmentedControlItem>
            ))}
          </SegmentedControl>
        </div>
        <div className="mt-5 flex flex-wrap gap-5 text-caption-1-medium text-text-primary">
          <span className="flex items-center gap-2">
            <span
              aria-hidden
              className="size-2 rounded-full bg-chart-2-active"
            />
            Weigh-in
          </span>
          <span className="flex items-center gap-2">
            <span
              aria-hidden
              className="w-5 border-t-2 border-dashed border-text-primary"
            />
            7-day average
          </span>
        </div>
        <div
          className="weight-chart mt-5 h-72 w-full text-caption-1-regular sm:h-80"
          role="img"
          aria-label={`Body weight chart in ${unit}. ${data.length} weigh-ins over ${days} days. ${data.length > 1 ? `Change: ${delta.toFixed(1)} ${unit}.` : ''} Exact values are listed below.`}
        >
          {data.length ? (
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <ComposedChart
                data={data}
                margin={{ top: 10, right: 12, left: -12, bottom: 4 }}
                accessibilityLayer
              >
                <CartesianGrid
                  vertical={false}
                  stroke="var(--color-separator-border)"
                  strokeDasharray="3 5"
                />
                <XAxis
                  type="number"
                  scale="time"
                  dataKey="time"
                  domain={[
                    timestamp(DEMO_TODAY) - (days - 1) * DAY,
                    timestamp(DEMO_TODAY),
                  ]}
                  tickFormatter={dateLabel}
                  tickCount={4}
                  minTickGap={28}
                  axisLine={false}
                  tickLine={false}
                  tickMargin={12}
                  tick={{ fill: 'var(--color-text-primary)' }}
                />
                <YAxis
                  domain={[lower, upper]}
                  tickCount={4}
                  tickFormatter={(v) => Number(v).toFixed(1)}
                  width={55}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'var(--color-text-primary)' }}
                />
                <Tooltip
                  labelFormatter={(label) => dateLabel(Number(label))}
                  formatter={(v, name) => [
                    `${Number(v).toFixed(1)} ${unit}`,
                    name,
                  ]}
                  contentStyle={{
                    borderRadius: 12,
                    background: 'var(--color-background-primary-default)',
                    border: '1px solid var(--color-border-button-default)',
                    color: 'var(--color-text-primary)',
                  }}
                  cursor={{
                    stroke: 'var(--color-chart-cursor)',
                    strokeDasharray: '4 4',
                  }}
                />
                <Line
                  type="linear"
                  name="Weigh-in"
                  dataKey="weight"
                  stroke="var(--color-chart-2-active)"
                  strokeWidth={2.5}
                  dot={{
                    r: 3,
                    fill: 'var(--color-chart-2-active)',
                    strokeWidth: 0,
                  }}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                />
                <Line
                  type="linear"
                  name="7-day average"
                  dataKey="average"
                  stroke="var(--color-text-primary)"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-body-regular text-text-primary">
              No weigh-ins in this range. Choose a longer range or add an entry.
            </p>
          )}
        </div>
        <details className="mt-3 text-caption-1-regular text-text-secondary">
          <summary className="cursor-pointer">Chart details</summary>
          <p className="mt-2">
            Average of recorded weights over 7 calendar days. Missing days are
            excluded. The vertical scale adjusts to the displayed weights.
          </p>
        </details>
      </section>
      <div className="grid items-start gap-6 lg:grid-cols-3">
        <section className={card}>
          <h2 className="text-headline-medium">Add weight</h2>
          <p className="mb-5 mt-1 text-body-regular text-text-primary">
            {dateLabel(DEMO_TODAY)}, 2026
          </p>
          <form onSubmit={save}>
            <Input
              label={`Body weight (${unit})`}
              inputMode="decimal"
              value={value}
              onChange={(v) => {
                setValue(v);
                setMessage('');
              }}
              isInvalid={value !== '' && !valid}
              hint={
                value !== '' && !valid
                  ? 'Enter a number greater than zero.'
                  : undefined
              }
            />
            <Button
              type="submit"
              className="mt-4 min-h-11 w-full"
              leadingIcon={message ? RiCheckLine : RiAddLine}
              disabled={!valid}
            >
              {entries.some((e) => e.date === DEMO_TODAY) ? 'Update' : 'Save'}
            </Button>
            <p
              role="status"
              className="mt-3 text-caption-1-regular text-text-primary"
            >
              {message || ''}
            </p>
          </form>
        </section>
        <section className={cx(card, 'lg:col-span-2')}>
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-headline-medium">Entries</h2>
            <span className="text-caption-1-regular text-text-primary">
              {data.length} entries
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 border-b border-separator-border pb-3 text-caption-1-medium text-text-primary">
            <span>Date</span>
            <span className="text-right">Weight ({unit})</span>
            <span className="text-right">7-day avg.</span>
          </div>
          {[...data]
            .reverse()
            .slice(0, expanded ? undefined : 6)
            .map((d) => (
              <div
                key={d.date}
                className="grid grid-cols-3 gap-2 border-b border-separator-border py-3 text-body-regular"
              >
                <span>{dateLabel(d.date)}</span>
                <span className="text-right tabular-nums">
                  {d.weight.toFixed(1)}
                </span>
                <span className="text-right tabular-nums text-text-primary">
                  {d.average.toFixed(1)}
                </span>
              </div>
            ))}
          {data.length > 6 && (
            <Button
              variant="secondary"
              className="mt-4 min-h-11"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? 'Show less' : `Show all ${data.length} entries`}
            </Button>
          )}
        </section>
      </div>
    </div>
  );
}
function Stat({
  label,
  value,
  unit,
  detail,
}: {
  label: string;
  value: string;
  unit?: string;
  detail: string;
}) {
  return (
    <section className={card}>
      <p className="text-body-regular text-text-primary">{label}</p>
      <p className="my-2 text-title-1-medium tabular-nums">
        {value}{' '}
        <span className="text-body-regular text-text-primary">{unit}</span>
      </p>
      <p className="text-caption-1-regular text-text-primary">{detail}</p>
    </section>
  );
}
export function WeightSparkline({ entries }: { entries: WeightEntry[] }) {
  return (
    <div className="my-4 h-20 w-full" aria-hidden>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <ComposedChart
          data={weightSeries(entries, 30, 'kg')}
          margin={{ top: 5, right: 3, left: 3, bottom: 5 }}
        >
          <YAxis hide domain={['dataMin - 0.2', 'dataMax + 0.2']} />
          <Line
            type="linear"
            dataKey="weight"
            stroke="var(--color-chart-2-active)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
