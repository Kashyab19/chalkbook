import ts from 'typescript';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const dir = await mkdtemp(join(tmpdir(), 'gym-tests-'));
await mkdir(join(dir, 'lib'));
await mkdir(join(dir, 'tests'));
await writeFile(join(dir, 'package.json'), '{"type":"module"}');
for (const file of [
  'lib/training.ts',
  'lib/operations.ts',
  'lib/sync-error.ts',
  'tests/operations.test.ts',
]) {
  const source = (await readFile(file, 'utf8'))
    .replaceAll("'./training'", "'./training.js'")
    .replaceAll('../lib/training', '../lib/training.js')
    .replaceAll('../lib/operations', '../lib/operations.js')
    .replaceAll('../lib/sync-error', '../lib/sync-error.js');
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
  ['--test', join(dir, 'tests/operations.test.js')],
  { stdio: 'inherit' },
);
process.exit(result.status ?? 1);
