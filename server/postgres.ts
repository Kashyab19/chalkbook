import { Pool, type PoolClient } from 'pg';
import { connectionOptions } from './database-config';
import { defaultProgram, type Data } from '../lib/training';
import { applyAction, type Operation } from '../lib/operations';
let pool: Pool | undefined;
export function database() {
  if (!process.env.DATABASE_URL) throw Error('DATABASE_URL is not configured');
  return (pool ??= new Pool({
    ...connectionOptions(),
    max: 5,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    statement_timeout: 15000,
  }));
}
export async function transaction<T>(work: (client: PoolClient) => Promise<T>) {
  const client = await database().connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
export async function readNotebook(owner: string): Promise<Data> {
  return transaction(async (client) => {
    // Same owner lock for reads and writes gives a consistent notebook snapshot.
    await client.query(
      'SELECT id FROM identity.accounts WHERE id=$1 FOR UPDATE',
      [owner],
    );
    await client.query(
      'INSERT INTO fitness.training_programs(owner_id,data) VALUES($1,$2) ON CONFLICT DO NOTHING',
      [owner, JSON.stringify(defaultProgram)],
    );
    const program = await client.query(
      'SELECT data FROM fitness.training_programs WHERE owner_id=$1',
      [owner],
    );
    const sessions = await client.query(
      'SELECT data FROM fitness.workout_sessions WHERE owner_id=$1 ORDER BY date DESC',
      [owner],
    );
    const body = await client.query(
      'SELECT to_char(date,\'YYYY-MM-DD\') AS date,weight_kg AS "weightKg" FROM fitness.body_weight_entries WHERE owner_id=$1 ORDER BY date',
      [owner],
    );
    return {
      program: program.rows[0].data,
      sessions: sessions.rows.map((row) => row.data),
      body: body.rows,
    };
  });
}
export async function writeOperation(owner: string, operation: Operation) {
  await transaction(async (client) => {
    await client.query(
      'SELECT id FROM identity.accounts WHERE id=$1 FOR UPDATE',
      [owner],
    );
    const inserted = await client.query(
      'INSERT INTO fitness.sync_operations(owner_id,id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING id',
      [owner, operation.id],
    );
    if (!inserted.rowCount) return;
    const action = operation.action;
    switch (action.type) {
      case 'start':
      case 'restoreSession': {
        const session = action.session;
        const conflict =
          action.type === 'start'
            ? 'DO NOTHING'
            : 'DO UPDATE SET date=excluded.date,data=excluded.data,updated_at=now()';
        await client.query(
          `INSERT INTO fitness.workout_sessions(owner_id,id,date,data) VALUES($1,$2,$3,$4) ON CONFLICT(owner_id,id) ${conflict}`,
          [owner, session.id, session.date, JSON.stringify(session)],
        );
        break;
      }
      case 'addSet':
      case 'removeSet':
      case 'finish':
      case 'set': {
        const result = await client.query(
          'SELECT data FROM fitness.workout_sessions WHERE owner_id=$1 AND id=$2',
          [owner, action.id],
        );
        if (!result.rowCount) break; // A stale set edit cannot recreate a deleted session.
        const current = result.rows[0].data;
        const updated = applyAction(
          { program: [], body: [], sessions: [current] },
          action,
        ).sessions[0];
        await client.query(
          'UPDATE fitness.workout_sessions SET data=$1,updated_at=now() WHERE owner_id=$2 AND id=$3',
          [JSON.stringify(updated), owner, action.id],
        );
        break;
      }
      case 'program':
        await client.query(
          'INSERT INTO fitness.training_programs(owner_id,data) VALUES($1,$2) ON CONFLICT(owner_id) DO UPDATE SET data=excluded.data,updated_at=now()',
          [owner, JSON.stringify(action.program)],
        );
        break;
      case 'body':
        await client.query(
          'INSERT INTO fitness.body_weight_entries(owner_id,date,weight_kg) VALUES($1,$2,$3) ON CONFLICT(owner_id,date) DO UPDATE SET weight_kg=excluded.weight_kg,updated_at=now()',
          [owner, action.date, action.weightKg],
        );
        break;
      case 'deleteBody':
        await client.query(
          'DELETE FROM fitness.body_weight_entries WHERE owner_id=$1 AND date=$2',
          [owner, action.date],
        );
        break;
      case 'deleteSession':
        await client.query(
          'DELETE FROM fitness.workout_sessions WHERE owner_id=$1 AND id=$2',
          [owner, action.id],
        );
        break;
    }
  });
}
