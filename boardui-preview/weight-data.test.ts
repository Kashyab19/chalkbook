import assert from 'node:assert/strict';
import { weightSeries, seedBody, weightIn } from './weight-data.ts';
const entries = [
  { date: '2026-08-31', weight: 100 },
  { date: '2026-09-01', weight: 80 },
  { date: '2026-09-06', weight: 76 },
  { date: '2026-09-07', weight: 78 },
];
const week = weightSeries(entries, 7, 'kg');
assert.deepEqual(
  week.map((d) => d.date),
  ['2026-09-01', '2026-09-06', '2026-09-07'],
);
assert.equal(week.at(-1)!.average, 78); // Sep 1–7; excludes Aug 31.
assert.equal(week[0].average, 90); // Prior-window observations survive the range filter.
assert.equal(weightSeries(entries, 7, 'lb').at(-1)!.weight, weightIn(78, 'lb'));
assert.deepEqual(weightSeries([], 30, 'kg'), []);
assert.equal(new Set(seedBody().map((d) => d.date)).size, seedBody().length);
assert.ok(
  weightSeries(seedBody(), 90, 'kg').length >
    weightSeries(seedBody(), 30, 'kg').length,
);
console.log(
  'Weight chart checks passed: date boundaries, rolling averages, units, empty data, sample ranges.',
);
