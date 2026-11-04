import { strict as assert } from 'node:assert';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const connectionString = process.env.CHALK_BENCH_DATABASE;
const DB_MS = 150;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const require = createRequire(import.meta.url);
const { Pool } = require('pg');

async function loadLibrary() {
  const dir = await mkdtemp(join(tmpdir(), 'chalk-sql-'));
  await mkdir(join(dir, 'lib'));
  await writeFile(join(dir, 'package.json'), '{"type":"module"}');
  for (const file of ['lib/training.ts', 'lib/operations.ts', 'lib/notebook-round-trips.ts']) {
    const source = (await readFile(file, 'utf8')).replaceAll(
      /from '(\.[^']+)'/g,
      (full, spec) => (spec.endsWith('.js') ? full : `from '${spec}.js'`),
    );
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
  const [rounds, training] = await Promise.all([
    import(pathToFileURL(join(dir, 'lib/notebook-round-trips.js')).href),
    import(pathToFileURL(join(dir, 'lib/training.js')).href),
  ]);
  return { ...rounds, defaultProgram: training.defaultProgram };
}

async function connect() {
  if (!connectionString) return null;
  const pool = new Pool({ connectionString, max: 4, connectionTimeoutMillis: 1000 });
  try {
    await pool.query('SELECT 1');
    return pool;
  } catch {
    await pool.end().catch(() => {});
    return null;
  }
}

const pool = await connect();

void test(
  'combined notebook SQL matches sequential statements on Postgres',
  { skip: pool ? false : 'CHALK_BENCH_DATABASE is not reachable' },
  async () => {
    const { readNotebookWith, writeOperationWith, defaultProgram } = await loadLibrary();
    const owner = crypto.randomUUID();
    const client = await pool.connect();
    const delayed = async (text, values) => {
      await sleep(DB_MS);
      return client.query(text, values);
    };
    const session = {
      id: 'session-1',
      date: '2026-09-07',
      templateId: 'legs',
      name: 'Legs',
      startedAt: '2026-09-07T00:00:00.000Z',
      completedAt: null,
      exercises: [
        {
          id: 'back-squat',
          name: 'Back Squat',
          sets: 1,
          min: 5,
          max: 8,
          entries: [{ weightKg: 20, reps: 8, completed: false }],
        },
      ],
    };
    try {
      await client.query('BEGIN');
      await client.query(
        'INSERT INTO identity.accounts(id, username, password_hash) VALUES ($1, $2, $3)',
        [owner, `hp${owner.replaceAll('-', '').slice(0, 12)}`, 'not-a-real-password'],
      );
      await client.query(
        'INSERT INTO fitness.workout_sessions(owner_id, id, date, data) VALUES ($1, $2, $3, $4::jsonb)',
        [owner, session.id, session.date, JSON.stringify(session)],
      );
      await client.query(
        'INSERT INTO fitness.body_weight_entries(owner_id, date, weight_kg) VALUES ($1, $2, $3)',
        [owner, '2026-09-07', 55.5],
      );
      const legacyRead = async () => {
        await delayed('SELECT id FROM identity.accounts WHERE id=$1 FOR UPDATE', [owner]);
        await delayed(
          'INSERT INTO fitness.training_programs(owner_id,data) VALUES($1,$2::jsonb) ON CONFLICT DO NOTHING',
          [owner, JSON.stringify(defaultProgram)],
        );
        const programs = await delayed(
          'SELECT data FROM fitness.training_programs WHERE owner_id=$1',
          [owner],
        );
        const sessions = await delayed(
          'SELECT data FROM fitness.workout_sessions WHERE owner_id=$1 ORDER BY date DESC',
          [owner],
        );
        const body = await delayed(
          `SELECT to_char(date,'YYYY-MM-DD') AS date, weight_kg AS "weightKg" FROM fitness.body_weight_entries WHERE owner_id=$1 ORDER BY date`,
          [owner],
        );
        return {
          program: programs.rows[0].data,
          sessions: sessions.rows.map((row) => row.data),
          body: body.rows,
        };
      };
      const readBefore = performance.now();
      const legacyData = await legacyRead();
      const legacyReadMs = performance.now() - readBefore;
      const readAfter = performance.now();
      const modernData = await readNotebookWith(
        (text, values) => delayed(text, values ? [...values] : undefined),
        owner,
      );
      const modernReadMs = performance.now() - readAfter;
      assert.deepEqual(modernData.program, legacyData.program);
      assert.deepEqual(modernData.sessions, legacyData.sessions);
      assert.deepEqual(
        modernData.body.map((entry) => ({ date: entry.date, weightKg: Number(entry.weightKg) })),
        legacyData.body.map((entry) => ({ date: entry.date, weightKg: Number(entry.weightKg) })),
      );

      const legacyWrite = async (operation) => {
        await delayed('SELECT id FROM identity.accounts WHERE id=$1 FOR UPDATE', [owner]);
        const inserted = await delayed(
          'INSERT INTO fitness.sync_operations(owner_id,id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING id',
          [owner, operation.id],
        );
        if (!inserted.rowCount) return;
        await delayed(
          'INSERT INTO fitness.body_weight_entries(owner_id,date,weight_kg) VALUES($1,$2,$3) ON CONFLICT(owner_id,date) DO UPDATE SET weight_kg=excluded.weight_kg, updated_at=now()',
          [owner, operation.action.date, operation.action.weightKg],
        );
      };
      const legacyBody = {
        id: crypto.randomUUID(),
        action: { type: 'body', date: '2026-09-08', weightKg: 56 },
      };
      const legacyWriteStarted = performance.now();
      await legacyWrite(legacyBody);
      const legacyWriteMs = performance.now() - legacyWriteStarted;
      const modernBody = {
        id: crypto.randomUUID(),
        action: { type: 'body', date: '2026-09-09', weightKg: 57 },
      };
      const modernWriteStarted = performance.now();
      await writeOperationWith(
        (text, values) => delayed(text, values ? [...values] : undefined),
        owner,
        modernBody,
      );
      const modernWriteMs = performance.now() - modernWriteStarted;
      await writeOperationWith(
        async (text, values) => {
          await sleep(DB_MS);
          return client.query(text, values ? [...values] : undefined);
        },
        owner,
        { ...modernBody, action: { ...modernBody.action, weightKg: 99 } },
      );
      const weights = await client.query(
        `SELECT to_char(date,'YYYY-MM-DD') AS date, weight_kg FROM fitness.body_weight_entries WHERE owner_id=$1 ORDER BY date`,
        [owner],
      );
      const byDate = Object.fromEntries(
        weights.rows.map((row) => [row.date, Number(row.weight_kg)]),
      );
      assert.equal(byDate['2026-09-08'], 56);
      assert.equal(byDate['2026-09-09'], 57);

      const legacyFinishStarted = performance.now();
      await delayed('SELECT id FROM identity.accounts WHERE id=$1 FOR UPDATE', [owner]);
      const legacyReceipt = await delayed(
        'INSERT INTO fitness.sync_operations(owner_id,id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING id',
        [owner, crypto.randomUUID()],
      );
      if (legacyReceipt.rowCount) {
        const current = await delayed(
          'SELECT data FROM fitness.workout_sessions WHERE owner_id=$1 AND id=$2',
          [owner, session.id],
        );
        await delayed(
          'UPDATE fitness.workout_sessions SET data=$1::jsonb, updated_at=now() WHERE owner_id=$2 AND id=$3',
          [JSON.stringify(current.rows[0].data), owner, session.id],
        );
      }
      const legacyFinishMs = performance.now() - legacyFinishStarted;
      const finish = {
        id: crypto.randomUUID(),
        action: { type: 'finish', id: session.id, completedAt: '2026-09-07T01:00:00.000Z' },
      };
      const finishStarted = performance.now();
      await writeOperationWith(
        (text, values) => delayed(text, values ? [...values] : undefined),
        owner,
        finish,
      );
      const finishMs = performance.now() - finishStarted;
      const stored = await client.query(
        'SELECT data FROM fitness.workout_sessions WHERE owner_id=$1 AND id=$2',
        [owner, session.id],
      );
      assert.equal(stored.rows[0].data.completedAt, '2026-09-07T01:00:00.000Z');
      assert.ok(modernReadMs < legacyReadMs * 0.45);
      assert.ok(modernWriteMs < legacyWriteMs * 0.5);
      console.log(
        `| Postgres readNotebook + ${DB_MS} ms RTT | ${legacyReadMs.toFixed(1)} ms | ${modernReadMs.toFixed(1)} ms |`,
      );
      console.log(
        `| Postgres body write + ${DB_MS} ms RTT | ${legacyWriteMs.toFixed(1)} ms | ${modernWriteMs.toFixed(1)} ms |`,
      );
      console.log(
        `| Postgres finish write + ${DB_MS} ms RTT | ${legacyFinishMs.toFixed(1)} ms | ${finishMs.toFixed(1)} ms |`,
      );
      assert.ok(finishMs < legacyFinishMs * 0.7);
    } finally {
      await client.query('ROLLBACK');
      client.release();
      await pool.end();
    }
  },
);
