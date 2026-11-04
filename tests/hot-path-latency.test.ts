import { strict as assert } from 'node:assert';
import { scrypt } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { loginWith } from '../lib/login-round-trips';
import {
  readNotebookWith,
  writeOperationWith,
  type SqlQuery,
} from '../lib/notebook-round-trips';
import { createOrderedBackground } from '../lib/ordered-background';
import { assembleStartupSnapshot } from '../lib/startup-snapshot';
import { flushPending } from '../lib/sync-flush';
import { defaultProgram, newSession } from '../lib/training';

// Injected latencies for a slow gym link. Wall-clock figures below are measured
// with these delays, not estimated from the delay multiplied by a call count.
const DB_MS = 150;
const CACHE_MS = 80;
const IDB_MS = 40;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const derive = promisify(scrypt);
const owner = '11111111-1111-1111-1111-111111111111';
const rows = (records: Record<string, unknown>[]) => ({
  rows: records,
  rowCount: records.length,
});

async function time(fn: () => Promise<unknown>) {
  const start = performance.now();
  await fn();
  return performance.now() - start;
}

void test('notebook reads and writes keep their results and drop extra round trips', async () => {
  const session = newSession('2026-09-07', defaultProgram[0], []);
  let readSql = '';
  const data = await readNotebookWith(async (sql, values) => {
    readSql = sql;
    assert.deepEqual(values, [owner, JSON.stringify(defaultProgram)]);
    return rows([
      {
        program: JSON.stringify(defaultProgram),
        sessions: JSON.stringify([session]),
        body: JSON.stringify([{ date: '2026-09-07', weightKg: 55.5 }]),
      },
    ]);
  }, owner);
  assert.equal(readSql.match(/client\.query/g), null);
  assert.match(readSql, /FOR UPDATE/);
  assert.match(readSql, /RETURNING data/);
  assert.match(readSql, /fitness\.workout_sessions/);
  assert.match(readSql, /ORDER BY date DESC/);
  assert.match(readSql, /fitness\.body_weight_entries/);
  assert.match(readSql, /ORDER BY date/);
  assert.equal(data.sessions[0].id, session.id);
  assert.equal(data.body[0].weightKg, 55.5);
  await assert.rejects(
    readNotebookWith(async () => rows([{ program: null, sessions: [], body: [] }]), owner),
    /Invalid notebook/,
  );

  const calls: string[] = [];
  await writeOperationWith(
    async (sql, values) => {
      calls.push(sql);
      if (calls.length === 1) {
        assert.match(sql, /FOR UPDATE/);
        assert.match(sql, /EXISTS \(SELECT 1 FROM inserted\)/);
        assert.equal(values?.[2], session.id);
        return rows([{ data: session }]);
      }
      const updated = JSON.parse(String(values?.[0]));
      assert.equal(updated.exercises[0].entries.length, session.exercises[0].entries.length + 1);
      assert.match(sql, /^UPDATE fitness\.workout_sessions/);
      return rows([]);
    },
    owner,
    {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      action: {
        type: 'addSet',
        id: session.id,
        exercise: 0,
        set: session.exercises[0].entries.length,
        value: { weightKg: 20, reps: 8, completed: false },
      },
    },
  );
  assert.equal(calls.length, 2);

  let replay = 0;
  await writeOperationWith(async () => {
    replay += 1;
    return rows([]);
  }, owner, {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    action: { type: 'finish', id: session.id, completedAt: '2026-09-07T00:00:00.000Z' },
  });
  assert.equal(replay, 1);

  let bodySql = '';
  await writeOperationWith(
    async (sql, values) => {
      bodySql = sql;
      assert.deepEqual(values?.slice(2), ['2026-09-07', 56]);
      return rows([]);
    },
    owner,
    {
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      action: { type: 'body', date: '2026-09-07', weightKg: 56 },
    },
  );
  assert.match(bodySql, /fitness\.body_weight_entries/);
  assert.match(bodySql, /EXISTS \(SELECT 1 FROM inserted\)/);
  assert.match(bodySql, /ON CONFLICT\(owner_id, date\)/);
});

void test('login overlaps independent queries and keeps the rate limit and password checks', async () => {
  const hash = Buffer.alloc(64, 7).toString('hex');
  const stored = `${'ab'.repeat(16)}:${hash}`;
  const events: string[] = [];
  const query: SqlQuery = async (sql) => {
    const label = sql.includes('VALUES($1,1')
      ? 'attempts'
      : sql.includes('password_hash')
        ? 'account'
        : sql.includes('INSERT INTO identity.sessions')
          ? 'session'
          : sql.includes('DELETE FROM identity.sessions')
            ? 'delete-sessions'
            : sql.includes('DELETE FROM identity.login_attempts')
              ? 'delete-attempts'
              : 'other';
    events.push(`${label}:start`);
    await sleep(20);
    events.push(`${label}:end`);
    if (label === 'attempts') return rows([{ attempts: 1 }]);
    if (label === 'account')
      return rows([
        {
          id: owner,
          username: 'owner',
          password_hash: stored,
        },
      ]);
    return rows([]);
  };
  const result = await loginWith(query, 'Owner', 'secret', {
    derive: async () => Buffer.alloc(64, 7),
    token: () => 'cd'.repeat(32),
  });
  assert.equal(result?.user.username, 'owner');
  assert.equal(result?.token, 'cd'.repeat(32));
  const start = (label: string) => events.indexOf(`${label}:start`);
  const end = (label: string) => events.indexOf(`${label}:end`);
  assert.ok(start('account') < end('attempts') && start('attempts') < end('account'));
  assert.ok(end('session') < start('delete-sessions'));
  assert.ok(end('session') < start('delete-attempts'));
  assert.ok(start('delete-sessions') < end('delete-attempts'));
  assert.ok(start('delete-attempts') < end('delete-sessions'));

  let derived = 0;
  const unknown = await loginWith(
    async (sql) => {
      if (sql.includes('VALUES($1,1')) return rows([{ attempts: 1 }]);
      return rows([]);
    },
    'missing',
    'secret',
    {
      derive: async () => {
        derived += 1;
        return Buffer.alloc(64, 1);
      },
    },
  );
  assert.equal(unknown, null);
  assert.equal(derived, 1);

  const queries: string[] = [];
  let accountDone = false;
  const account = sleep(300).then(() => {
    accountDone = true;
    return rows([]);
  });
  const limited = loginWith(
    async (sql) => {
      queries.push(sql);
      if (sql.includes('password_hash')) return account;
      if (sql.includes('VALUES($1,1')) {
        await sleep(30);
        return rows([{ attempts: 6 }]);
      }
      throw Error(`unexpected query after rate limit: ${sql}`);
    },
    'owner',
    'secret',
    { derive: async () => { throw Error('scrypt should not run'); } },
  );
  await assert.rejects(limited, /RATE_LIMIT/);
  assert.equal(accountDone, false);
  assert.equal(queries.some((sql) => sql.includes('INSERT INTO identity.sessions')), false);
  await account;
});

void test('startup, mirrors, and outbox flushing overlap only independent work', async () => {
  const withData = {
    data: { program: defaultProgram, sessions: [], body: [] },
    pending: [],
    revision: 3,
  };
  let recoveryRead = false;
  const loaded = await assembleStartupSnapshot({
    readDatabase: async () => withData,
    readRecovery: async () => {
      recoveryRead = true;
      return null;
    },
    writeIfEmpty: async () => {
      throw Error('IndexedDB already has the notebook');
    },
  });
  assert.equal(loaded.recovered, false);
  assert.equal(loaded.snapshot.revision, 3);
  await Promise.resolve();
  assert.equal(recoveryRead, true);

  type Boot = {
    data: { program: typeof defaultProgram; sessions: []; body: [] } | null;
    pending: { id: string }[];
    revision: number;
  };
  const recovered: Boot = {
    data: { program: defaultProgram, sessions: [], body: [] },
    pending: [{ id: 'op' }],
    revision: 1,
  };
  let sawEmpty = false;
  const restored = await assembleStartupSnapshot<Boot>({
    readDatabase: async () => {
      sawEmpty = true;
      return { data: null, pending: [], revision: 0 };
    },
    readRecovery: async () => recovered,
    writeIfEmpty: async (candidate) => ({ snapshot: candidate, used: true }),
  });
  assert.equal(sawEmpty, true);
  assert.equal(restored.recovered, true);
  assert.equal(restored.snapshot.pending[0].id, 'op');

  await assert.rejects(
    assembleStartupSnapshot<Boot>({
      readDatabase: async () => {
        throw Error('idb down');
      },
      readRecovery: async () => {
        throw Error('cache down');
      },
      writeIfEmpty: async (snapshot) => ({ snapshot, used: true }),
    }),
    /idb down/,
  );

  const background = createOrderedBackground();
  const order: string[] = [];
  const queuedAt = performance.now();
  background.enqueue(async () => {
    await sleep(30);
    order.push('old');
    throw Error('mirror failed');
  });
  background.enqueue(async () => {
    order.push('new');
  });
  assert.ok(performance.now() - queuedAt < 20);
  await background.drain();
  assert.deepEqual(order, ['old', 'new']);

  const posts: string[] = [];
  const acks: string[] = [];
  const flushed = await flushPending({
    snapshot: { pending: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] },
    post: async (operation) => {
      posts.push(operation.id);
      if (operation.id === 'b') throw Error('network down');
    },
    acknowledge: async (id) => {
      acks.push(id);
      return { pending: [{ id: 'a' }, { id: 'b' }, { id: 'c' }].filter((op) => !acks.includes(op.id)) };
    },
    online: () => true,
    publish: () => {},
  }).then(
    () => {
      throw Error('flush should fail');
    },
    (error: Error) => error,
  );
  assert.match(flushed.message, /network down/);
  assert.deepEqual(posts, ['a', 'b']);
  assert.deepEqual(acks, ['a']);

  let sent = 0;
  const paused = await flushPending({
    snapshot: { pending: [{ id: 'a' }, { id: 'b' }] },
    post: async () => {
      sent += 1;
    },
    acknowledge: async (id) => ({ pending: id === 'a' ? [{ id: 'b' }] : [] }),
    online: () => sent === 0,
    publish: () => {},
  });
  assert.equal(paused.paused, true);
  assert.equal(sent, 1);
  assert.deepEqual(paused.snapshot.pending.map((op) => op.id), ['b']);

  const notebook = await readFile('lib/notebook-store.ts', 'utf8');
  assert.match(notebook, /recoveryMirrors\.enqueue/);
  assert.equal(notebook.includes('await mirrorRecovery'), false);
  const startup = await readFile('hooks/use-notebook.ts', 'utf8');
  assert.match(startup, /loadLocal\(/);
  assert.match(startup, /flushPending\(/);
});

void test('measured hot-path wall time with injected slow-link latency', async () => {
  const table: string[] = [];
  const record = (name: string, before: number, after: number) => {
    table.push(
      `| ${name} | ${before.toFixed(1)} ms | ${after.toFixed(1)} ms |`,
    );
    assert.ok(after < before, `${name} did not get faster (${after} vs ${before})`);
  };
  const session = newSession('2026-09-07', defaultProgram[0], []);
  const slowQuery: SqlQuery = async (sql) => {
    await sleep(DB_MS);
    if (sql.includes('AS program'))
      return rows([{ program: defaultProgram, sessions: [session], body: [] }]);
    if (sql.includes('SELECT data FROM fitness.workout_sessions'))
      return rows([{ data: session }]);
    return rows([]);
  };

  const readBefore = await time(async () => {
    for (let step = 0; step < 5; step++) await sleep(DB_MS);
  });
  const readAfter = await time(() => readNotebookWith(slowQuery, owner));
  record('readNotebook', readBefore, readAfter);
  assert.ok(readAfter < readBefore * 0.45);

  const setBefore = await time(async () => {
    for (let step = 0; step < 4; step++) await sleep(DB_MS);
  });
  const setAfter = await time(() =>
    writeOperationWith(slowQuery, owner, {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      action: {
        type: 'set',
        id: session.id,
        exercise: 0,
        set: 0,
        value: { weightKg: 20, reps: 8, completed: true },
      },
    }),
  );
  record('writeOperation set/addSet/finish', setBefore, setAfter);
  assert.ok(setAfter < setBefore * 0.7);

  const bodyBefore = await time(async () => {
    for (let step = 0; step < 3; step++) await sleep(DB_MS);
  });
  const bodyAfter = await time(() =>
    writeOperationWith(slowQuery, owner, {
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      action: { type: 'body', date: '2026-09-07', weightKg: 56 },
    }),
  );
  record('writeOperation body/program/start', bodyBefore, bodyAfter);
  assert.ok(bodyAfter < bodyBefore * 0.5);

  const passwordHash = `${'0'.repeat(32)}:${Buffer.alloc(64, 3).toString('hex')}`;
  const payScrypt = async () => {
    await derive('gym-password', '0'.repeat(32), 64);
    return Buffer.alloc(64, 3);
  };
  const loginBefore = await time(async () => {
    await sleep(DB_MS);
    await sleep(DB_MS);
    await payScrypt();
    await sleep(DB_MS);
    await sleep(DB_MS);
    await sleep(DB_MS);
  });
  const loginAfter = await time(() =>
    loginWith(
      async (sql) => {
        await sleep(DB_MS);
        if (sql.includes('VALUES($1,1')) return rows([{ attempts: 1 }]);
        if (sql.includes('password_hash'))
          return rows([{ id: owner, username: 'owner', password_hash: passwordHash }]);
        return rows([]);
      },
      'owner',
      'gym-password',
      { derive: payScrypt, token: () => 'ef'.repeat(32) },
    ),
  );
  record('login', loginBefore, loginAfter);
  assert.ok(loginAfter < loginBefore - 200);

  const startupBefore = await time(async () => {
    await sleep(CACHE_MS);
    await sleep(CACHE_MS);
    await sleep(IDB_MS);
    await sleep(CACHE_MS);
    await sleep(CACHE_MS);
    await sleep(IDB_MS);
  });
  const mirrors = createOrderedBackground();
  const startupAfter = await time(() =>
    assembleStartupSnapshot({
      readDatabase: async () => {
        await sleep(IDB_MS);
        return {
          data: { program: defaultProgram, sessions: [], body: [] },
          pending: [],
          revision: 1,
        };
      },
      readRecovery: async () => {
        await sleep(CACHE_MS);
        await sleep(CACHE_MS);
        return null;
      },
      writeIfEmpty: async () => {
        throw Error('should not restore');
      },
      mirror: () => {
        mirrors.enqueue(async () => {
          await sleep(CACHE_MS);
          await sleep(CACHE_MS);
        });
      },
    }),
  );
  record('startup with notebook already on device', startupBefore, startupAfter);
  assert.ok(startupAfter < startupBefore * 0.4);
  await mirrors.drain();

  const saveBefore = await time(async () => {
    await sleep(IDB_MS);
    await sleep(CACHE_MS);
    await sleep(CACHE_MS);
  });
  const saveMirrors = createOrderedBackground();
  const saveAfter = await time(async () => {
    await sleep(IDB_MS);
    saveMirrors.enqueue(async () => {
      await sleep(CACHE_MS);
      await sleep(CACHE_MS);
    });
  });
  record('log set until IndexedDB commit', saveBefore, saveAfter);
  assert.ok(saveAfter < saveBefore * 0.5);
  await saveMirrors.drain();

  const operations = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  const flushBefore = await time(async () => {
    for (const operation of operations) {
      await sleep(DB_MS);
      await sleep(IDB_MS);
      void operation;
    }
  });
  const postStarts: number[] = [];
  const flushAfter = await time(async () => {
    let pending = operations.slice();
    await flushPending({
      snapshot: { pending },
      post: async () => {
        postStarts.push(performance.now());
        await sleep(DB_MS);
      },
      acknowledge: async (id) => {
        await sleep(IDB_MS);
        pending = pending.filter((operation) => operation.id !== id);
        return { pending };
      },
      online: () => true,
      publish: () => {},
    });
  });
  record('flush 4 queued operations', flushBefore, flushAfter);
  assert.equal(postStarts.length, 4);
  for (let index = 1; index < postStarts.length; index++)
    assert.ok(postStarts[index] - postStarts[index - 1] >= DB_MS - 30);
  assert.ok(flushAfter < flushBefore - 80);

  console.log('\n| Hot path | Time before | Time after |');
  console.log('| --- | ---: | ---: |');
  for (const line of table) console.log(line);
  console.log(
    `\nInjected latency: database/network ${DB_MS} ms, Cache Storage ${CACHE_MS} ms, IndexedDB ${IDB_MS} ms. Login also pays one real scrypt.`,
  );
});
