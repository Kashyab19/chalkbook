'use client';
import { useState } from 'react';
import { useDeviceDraft } from '@/hooks/use-device-draft';
import { dateKey } from '@/lib/training';
import { validDate } from '@/lib/operations';
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '@/components/boardui/base/buttons/button';
import { Input } from '@/components/boardui/base/input/input';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@/components/boardui/base/segmented-control/segmented-control';
import { RiAddLine, RiCheckLine } from '@remixicon/react';
import {
  DAY,
  dateLabel,
  timestamp,
  weightIn,
  weightSeries,
  type WeightEntry,
} from '@/lib/weight-chart';
// Adapted from the free BoardUI RevenueChartCard's Recharts composition and
// semantic chart tokens. Weight uses observations and calendar-day averages,
// not the source component's revenue totals or year-over-year comparisons.
const card =
  'min-w-0 rounded-3xl border border-border-button-default bg-background-primary-default p-5 sm:p-6';
export function BodyWeight({
  entries,
  onSave,
  onRemove,
  unit,
}: {
  entries: WeightEntry[];
  onSave: (entry: WeightEntry) => Promise<boolean>;
  onRemove: (date: string) => void;
  unit: string;
}) {
  const today = dateKey();
  const [entryDate, setEntryDate] = useState(today);
  const [draft, setDraft] = useDeviceDraft<{
    date: string;
    value: string;
    unit: string;
  } | null>('boardui-body', null);
  const value =
    draft?.date === entryDate
      ? draft.unit === unit
        ? draft.value
        : draft.value === ''
          ? ''
          : weightIn(
              Number(draft.value) / (draft.unit === 'lb' ? 2.2046226218 : 1),
              unit,
            ).toFixed(1)
      : entries.find((e) => e.date === entryDate)
        ? weightIn(
            entries.find((e) => e.date === entryDate)!.weight,
            unit,
          ).toFixed(1)
        : '';
  const setValue = (value: string) =>
    setDraft({ date: entryDate, value, unit });
  const [saving, setSaving] = useState(false);
  const [days, setDays] = useState(30),
    [message, setMessage] = useState(''),
    [expanded, setExpanded] = useState(false);
  const data = weightSeries(entries, days, unit);
  const latest = [...entries].sort((a, b) => b.date.localeCompare(a.date))[0];
  const first = data[0],
    last = data.at(-1);
  const delta = first && last ? last.weight - first.weight : 0;
  const valid =
    validDate(entryDate) &&
    entryDate <= today &&
    value.trim() !== '' &&
    Number.isFinite(Number(value)) &&
    Number(value) > 0;
  const lower = data.length
    ? Math.floor(Math.min(...data.map((d) => d.weight)) - 0.5)
    : 0;
  const upper = data.length
    ? Math.ceil(Math.max(...data.map((d) => d.weight)) + 0.5)
    : 1;
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid || saving) return;
    const kg = Number(value) / (unit === 'lb' ? 2.2046226218 : 1);
    if (kg < 1 || kg > 500) {
      setMessage('Enter a weight between 1 and 500 kg.');
      return;
    }
    setSaving(true);
    try {
      const ok = await onSave({ date: entryDate, weight: kg });
      setMessage(ok ? 'Saved on device' : 'Not saved. Retry.');
      if (ok) setDraft(null);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="flex flex-col gap-6 pt-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-title-1-medium">Body weight</h1>
        </div>
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
              {dateLabel(timestamp(today) - (days - 1) * DAY)} –{' '}
              {dateLabel(today)} · {unit}
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
                    timestamp(today) - (days - 1) * DAY,
                    timestamp(today),
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
      <div className="grid items-start gap-6">
        <section id="weight-form" className={card}>
          <h2 className="text-headline-medium">Add weight</h2>
          <p className="mb-5 mt-1 text-body-regular text-text-primary">
            {dateLabel(entryDate)}
          </p>
          <form onSubmit={(e) => void save(e)}>
            <Input
              label="Date"
              type="date"
              value={entryDate}
              onChange={setEntryDate}
            />
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
              disabled={!valid || saving}
            >
              {entries.some((e) => e.date === entryDate) ? 'Update' : 'Save'}
            </Button>
            <p
              role="status"
              className="mt-3 text-caption-1-regular text-text-primary"
            >
              {message || ''}
            </p>
          </form>
        </section>
        <section className={card}>
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-headline-medium">Entries</h2>
            <span className="text-caption-1-regular text-text-primary">
              {data.length} entries
            </span>
          </div>
          <div className="weight-entry-row grid gap-2 border-b border-separator-border pb-3 text-caption-1-medium text-text-primary">
            <span>Date</span>
            <span className="text-right">Weight ({unit})</span>
            <span className="text-right">Avg.</span>
            <span className="sr-only">Actions</span>
          </div>
          {[...data]
            .reverse()
            .slice(0, expanded ? undefined : 6)
            .map((d) => (
              <div
                key={d.date}
                className="weight-entry-row grid gap-2 border-b border-separator-border py-3 text-body-regular"
              >
                <Button
                  variant="secondary"
                  aria-label={`Edit weight ${d.date}`}
                  onClick={() => {
                    setEntryDate(d.date);
                    setDraft(null);
                    document
                      .getElementById('weight-form')
                      ?.scrollIntoView({ block: 'center' });
                  }}
                >
                  {dateLabel(d.date)}
                </Button>
                <span className="text-right tabular-nums">
                  {d.weight.toFixed(1)}
                </span>
                <span className="text-right tabular-nums text-text-primary">
                  {d.average.toFixed(1)}
                </span>
                <Button
                  variant="secondary"
                  aria-label={`Delete weight ${d.date}`}
                  onClick={() => onRemove(d.date)}
                >
                  Delete
                </Button>
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
