import { Pool, type PoolClient } from 'pg';
import { connectionOptions } from './database-config';
import type { Data } from '../lib/training';
import type { Operation } from '../lib/operations';
import {
  readNotebookWith,
  writeOperationWith,
  type SqlQuery,
  type SqlRow,
} from '../lib/notebook-round-trips';
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
function bind(client: PoolClient): SqlQuery {
  return async (text, values) => {
    const result = await client.query(
      text,
      values === undefined ? undefined : [...values],
    );
    return { rows: result.rows as SqlRow[], rowCount: result.rowCount };
  };
}
export async function readNotebook(owner: string): Promise<Data> {
  // One statement keeps the owner lock and returns program, sessions, and body.
  return transaction((client) => readNotebookWith(bind(client), owner));
}
export async function writeOperation(owner: string, operation: Operation) {
  await transaction((client) =>
    writeOperationWith(bind(client), owner, operation),
  );
}
