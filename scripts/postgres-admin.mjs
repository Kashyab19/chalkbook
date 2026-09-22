// Run explicitly against the intended database. Never print DATABASE_URL.
import { Pool } from 'pg';
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID, randomBytes, scryptSync, createHash } from 'node:crypto';
import ts from 'typescript';
import { checkServerIdentity } from 'node:tls';
if (!process.env.DATABASE_URL)
  throw Error('Set DATABASE_URL for the intended Postgres database.');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  ssl: process.env.DATABASE_SSL_CA
    ? {
        ca: process.env.DATABASE_SSL_CA,
        rejectUnauthorized: true,
        ...(process.env.DATABASE_TLS_SERVER_NAME
          ? {
              checkServerIdentity: (_host, cert) =>
                checkServerIdentity(process.env.DATABASE_TLS_SERVER_NAME, cert),
            }
          : {}),
      }
    : undefined,
});
const [command, username, inputPath] = process.argv.slice(2);
try {
  if (command === 'migrate') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(884901)');
      await client.query('CREATE SCHEMA IF NOT EXISTS infrastructure');
      await client.query(
        'CREATE TABLE IF NOT EXISTS infrastructure.schema_migrations (version text CONSTRAINT pk_schema_migrations PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())',
      );
      const sql = await readFile('db/postgres/001_notebook.sql', 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const applied = await client.query(
        'SELECT checksum FROM infrastructure.schema_migrations WHERE version=$1',
        ['001_notebook'],
      );
      if (applied.rowCount) {
        if (applied.rows[0].checksum !== checksum)
          throw Error(
            'Applied migration checksum mismatch. Add a new migration instead of editing history.',
          );
      } else {
        await client.query(sql);
        await client.query(
          'INSERT INTO infrastructure.schema_migrations(version,checksum) VALUES($1,$2)',
          ['001_notebook', checksum],
        );
      }
      await client.query('COMMIT');
      console.log(
        'Chalkbook schema ready. Existing non-Chalkbook tables were not changed.',
      );
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } else if (command === 'create-user') {
    if (!username || !/^[a-z0-9._-]{1,50}$/.test(username))
      throw Error('Provide a lowercase private account name.');
    if (!inputPath)
      throw Error('Provide a private output file for the initial password.');
    const password = randomBytes(24).toString('base64url'),
      salt = randomBytes(16).toString('hex');
    const hash = scryptSync(password, salt, 64).toString('hex');
    const id = randomUUID();
    // Refuse overwrite of both an existing account and an existing password file.
    await writeFile(
      inputPath,
      `Account: ${username}\nPassword: ${password}\n`,
      { mode: 0o600, flag: 'wx' },
    );
    await pool.query(
      'INSERT INTO identity.accounts(id,username,password_hash) VALUES($1,$2,$3)',
      [id, username, `${salt}:${hash}`],
    );
    console.log(
      `Private account ${username} created. Initial password is in the requested private file.`,
    );
  } else if (command === 'import') {
    if (!username || !inputPath)
      throw Error('Provide the existing account name and a backup path.');
    const rows = await pool.query(
      'SELECT id FROM identity.accounts WHERE username=$1',
      [username],
    );
    if (rows.rowCount !== 1) throw Error('Account not found');
    const raw = JSON.parse(await readFile(inputPath, 'utf8'));
    const data = raw.format === 'gym-notebook' ? raw.data : raw;
    // Reuse the exact same data validation as local restore and synchronization.
    const validation = ts.transpileModule(
      await readFile('lib/operations.ts', 'utf8'),
      {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
        },
      },
    ).outputText;
    const { validateData } = await import(
      `data:text/javascript;base64,${Buffer.from(validation).toString('base64')}`
    );
    validateData(data);
    const owner = rows.rows[0].id,
      client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'SELECT id FROM identity.accounts WHERE id=$1 FOR UPDATE',
        [owner],
      );
      const existing = await client.query(
        'SELECT count(*)::int AS count FROM fitness.workout_sessions WHERE owner_id=$1',
        [owner],
      );
      const body = await client.query(
        'SELECT count(*)::int AS count FROM fitness.body_weight_entries WHERE owner_id=$1',
        [owner],
      );
      if (existing.rows[0].count || body.rows[0].count)
        throw Error(
          'Migration target already has records. Use reviewed in-app backup restore instead.',
        );
      await client.query(
        'INSERT INTO fitness.training_programs(owner_id,data) VALUES($1,$2) ON CONFLICT(owner_id) DO UPDATE SET data=excluded.data',
        [owner, JSON.stringify(data.program)],
      );
      for (const session of data.sessions)
        await client.query(
          'INSERT INTO fitness.workout_sessions(owner_id,id,date,data) VALUES($1,$2,$3,$4)',
          [owner, session.id, session.date, JSON.stringify(session)],
        );
      for (const entry of data.body)
        await client.query(
          'INSERT INTO fitness.body_weight_entries(owner_id,date,weight_kg) VALUES($1,$2,$3)',
          [owner, entry.date, entry.weightKg],
        );
      await client.query('COMMIT');
      console.log(
        JSON.stringify({
          programDays: data.program.length,
          sessions: data.sessions.length,
          bodyEntries: data.body.length,
        }),
      );
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } else
    throw Error(
      'Use migrate, create-user <name> <private-output-file>, or import <name> <backup-file>.',
    );
} finally {
  await pool.end();
}
