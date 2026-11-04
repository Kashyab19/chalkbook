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
  'lib/notebook-round-trips.ts',
  'lib/login-round-trips.ts',
  'lib/startup-snapshot.ts',
  'lib/ordered-background.ts',
  'lib/sync-flush.ts',
  'tests/operations.test.ts',
  'tests/offline.test.ts',
  'tests/workout-sets.test.ts',
  'tests/hot-path-latency.test.ts',
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
    join(dir, 'tests/hot-path-latency.test.js'),
    'tests/shell-assets.test.mjs',
    'tests/shell-cache.test.mjs',
    'tests/notebook-sql.test.mjs',
  ],
  { stdio: 'inherit' },
);
process.exit(result.status ?? 1);
