import { dateKey } from './training';
export type WeightEntry = { date: string; weight: number };

export const DAY = 86400000;
export const timestamp = (date: string) => Date.parse(`${date}T12:00:00Z`);
export const dateLabel = (date: string | number) =>
  new Date(
    typeof date === 'number' ? date : timestamp(date),
  ).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
export const weightIn = (kg: number, unit: string) =>
  kg * (unit === 'lb' ? 2.2046226218 : 1);
export function weightSeries(
  entries: WeightEntry[],
  days: number,
  unit: string,
) {
  const all = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const cutoff = timestamp(dateKey()) - (days - 1) * DAY;
  return all
    .filter((e) => timestamp(e.date) >= cutoff && e.date <= dateKey())
    .map((e) => {
      const time = timestamp(e.date);
      const window = all.filter(
        (x) => timestamp(x.date) > time - 7 * DAY && timestamp(x.date) <= time,
      );
      return {
        time,
        date: e.date,
        weight: weightIn(e.weight, unit),
        average: weightIn(
          window.reduce((n, x) => n + x.weight, 0) / window.length,
          unit,
        ),
      };
    });
}
