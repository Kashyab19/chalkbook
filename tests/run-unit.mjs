import ts from 'typescript';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const dir = await mkdtemp(join(tmpdir(), 'gym-tests-'));
await mkdir(join(dir, 'lib'));
await mkdir(join(dir, 'tests'));
await writeFile(join(dir, 'package.json'), '{"type":"module"}');
const rewrite = (source) =>
  source.replaceAll(/from '(\.[^']+)'/g, (full, spec) =>
    spec.endsWith('.js') ? full : `from '${spec}.js'`,
  );
for (const file of [
  'lib/training.ts',
  'lib/operations.ts',
  'lib/sync-error.ts',
  'lib/sync-schedule.ts',
  'lib/exercise-art.ts',
  'lib/workout-sets.ts',
  'lib/skip-exercise.ts',
  'lib/exercise-catalog.ts',
  'lib/notebook-round-trips.ts',
  'lib/login-round-trips.ts',
  'lib/startup-snapshot.ts',
  'lib/ordered-background.ts',
  'lib/sync-flush.ts',
  'lib/rest-cue.ts',
  'lib/rest-alarm.ts',
  'lib/rest-push.ts',
  'tests/operations.test.ts',
  'tests/offline.test.ts',
  'tests/workout-sets.test.ts',
  'tests/skip-exercise.test.ts',
  'tests/exercise-catalog.test.ts',
  'tests/hot-path-latency.test.ts',
  'tests/rest-cue.test.ts',
  'tests/rest-alarm.test.ts',
]) {
  const source = rewrite(await readFile(file, 'utf8'));
  await writeFile(
    join(dir, file.replace(/\.ts$/, '.js')),
    ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    }).outputText,
  );
}
const result = spawnSync(
  process.execPath,
  [
    '--test',
    join(dir, 'tests/operations.test.js'),
    join(dir, 'tests/offline.test.js'),
    join(dir, 'tests/workout-sets.test.js'),
    join(dir, 'tests/skip-exercise.test.js'),
    join(dir, 'tests/exercise-catalog.test.js'),
    join(dir, 'tests/hot-path-latency.test.js'),
    join(dir, 'tests/rest-cue.test.js'),
    join(dir, 'tests/rest-alarm.test.js'),
    'tests/shell-assets.test.mjs',
    'tests/shell-cache.test.mjs',
    'tests/rest-push-sw.test.mjs',
    'tests/notebook-sql.test.mjs',
  ],
  { stdio: 'inherit' },
);
process.exit(result.status ?? 1);
