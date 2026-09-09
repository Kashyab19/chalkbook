export type WeightEntry = { date: string; weight: number };
export const DEMO_TODAY = '2026-09-07';
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
export function seedBody(): WeightEntry[] {
  const samples = Array.from({ length: 43 }, (_, i) => {
    const date = new Date(timestamp(DEMO_TODAY) - (89 - i * 2) * DAY)
      .toISOString()
      .slice(0, 10);
    const weight = Number(
      (78.5 - i * 0.041 + Math.sin(i * 1.6) * 0.22).toFixed(1),
    );
    return { date, weight };
  });
  return [
    ...samples.filter((e) => e.date < '2026-09-02'),
    { date: '2026-09-02', weight: 76.9 },
    { date: '2026-09-04', weight: 76.8 },
    { date: '2026-09-06', weight: 76.6 },
  ].sort((a, b) => b.date.localeCompare(a.date));
}
export function weightSeries(
  entries: WeightEntry[],
  days: number,
  unit: string,
) {
  const all = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const cutoff = timestamp(DEMO_TODAY) - (days - 1) * DAY;
  return all
    .filter((e) => timestamp(e.date) >= cutoff && e.date <= DEMO_TODAY)
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
