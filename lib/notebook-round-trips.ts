import { applyAction, type Action, type Operation } from './operations';
import { defaultProgram, type Data, type Session } from './training';

export type SqlRow = Record<string, unknown>;
export type SqlResult = { rows: SqlRow[]; rowCount: number | null };
export type SqlQuery = (
  text: string,
  values?: readonly unknown[],
) => Promise<SqlResult>;

const parsed = <T>(value: unknown): T =>
  typeof value === 'string' ? (JSON.parse(value) as T) : (value as T);

// The account row lock is held for the whole statement, then the three reads
// run inside that statement. A separate SELECT would not see a program inserted
// earlier in the same statement, so the insert returns the new document itself.
const readSql = `
WITH locked AS (
  SELECT id FROM identity.accounts WHERE id = $1::uuid FOR UPDATE
),
ensured AS (
  INSERT INTO fitness.training_programs(owner_id, data)
  SELECT $1::uuid, $2::jsonb
  WHERE EXISTS (SELECT 1 FROM locked) OR NOT EXISTS (SELECT 1 FROM locked)
  ON CONFLICT DO NOTHING
  RETURNING data
)
SELECT
  COALESCE(
    (SELECT data FROM ensured),
    (SELECT data FROM fitness.training_programs WHERE owner_id = $1::uuid)
  ) AS program,
  COALESCE(
    (SELECT json_agg(data ORDER BY date DESC)
     FROM fitness.workout_sessions WHERE owner_id = $1::uuid),
    '[]'::json
  ) AS sessions,
  COALESCE(
    (SELECT json_agg(
       json_build_object('date', to_char(date, 'YYYY-MM-DD'), 'weightKg', weight_kg)
       ORDER BY date)
     FROM fitness.body_weight_entries WHERE owner_id = $1::uuid),
    '[]'::json
  ) AS body`;

const receipt = `
WITH locked AS (
  SELECT id FROM identity.accounts WHERE id = $1::uuid FOR UPDATE
),
inserted AS (
  INSERT INTO fitness.sync_operations(owner_id, id)
  SELECT $1::uuid, $2::uuid
  WHERE EXISTS (SELECT 1 FROM locked) OR NOT EXISTS (SELECT 1 FROM locked)
  ON CONFLICT DO NOTHING
  RETURNING id
)`;

const sessionReadSql = `${receipt}
SELECT data FROM fitness.workout_sessions
WHERE owner_id = $1::uuid AND id = $3 AND EXISTS (SELECT 1 FROM inserted)`;

function mutation(action: Action): { text: string; params: unknown[] } {
  switch (action.type) {
    case 'start':
    case 'restoreSession': {
      const conflict =
        action.type === 'start'
          ? 'DO NOTHING'
          : 'DO UPDATE SET date = excluded.date, data = excluded.data, updated_at = now()';
      return {
        text: `${receipt}
INSERT INTO fitness.workout_sessions(owner_id, id, date, data)
SELECT $1::uuid, $3, $4::date, $5::jsonb
WHERE EXISTS (SELECT 1 FROM inserted)
ON CONFLICT(owner_id, id) ${conflict}`,
        params: [
          action.session.id,
          action.session.date,
          JSON.stringify(action.session),
        ],
      };
    }
    case 'program':
      return {
        text: `${receipt}
INSERT INTO fitness.training_programs(owner_id, data)
SELECT $1::uuid, $3::jsonb
WHERE EXISTS (SELECT 1 FROM inserted)
ON CONFLICT(owner_id) DO UPDATE SET data = excluded.data, updated_at = now()`,
        params: [JSON.stringify(action.program)],
      };
    case 'body':
      return {
        text: `${receipt}
INSERT INTO fitness.body_weight_entries(owner_id, date, weight_kg)
SELECT $1::uuid, $3::date, $4::float8
WHERE EXISTS (SELECT 1 FROM inserted)
ON CONFLICT(owner_id, date) DO UPDATE SET weight_kg = excluded.weight_kg, updated_at = now()`,
        params: [action.date, action.weightKg],
      };
    case 'deleteBody':
      return {
        text: `${receipt}
DELETE FROM fitness.body_weight_entries
WHERE owner_id = $1::uuid AND date = $3::date AND EXISTS (SELECT 1 FROM inserted)`,
        params: [action.date],
      };
    case 'deleteSession':
      return {
        text: `${receipt}
DELETE FROM fitness.workout_sessions
WHERE owner_id = $1::uuid AND id = $3 AND EXISTS (SELECT 1 FROM inserted)`,
        params: [action.id],
      };
    default:
      throw Error('Invalid notebook');
  }
}

export async function readNotebookWith(
  query: SqlQuery,
  owner: string,
): Promise<Data> {
  const result = await query(readSql, [owner, JSON.stringify(defaultProgram)]);
  const row = result.rows[0];
  if (!row || row.program == null) throw Error('Invalid notebook');
  return {
    program: parsed(row.program),
    sessions: parsed(row.sessions ?? []),
    body: parsed(row.body ?? []),
  };
}

export async function writeOperationWith(
  query: SqlQuery,
  owner: string,
  operation: Operation,
) {
  const action = operation.action;
  if (
    action.type === 'set' ||
    action.type === 'addSet' ||
    action.type === 'removeSet' ||
    action.type === 'finish' ||
    action.type === 'interactions' ||
    action.type === 'skipExercises'
  ) {
    // The receipt and the session read share one round trip. Applying the edit
    // still happens in TypeScript, so the update is a second round trip.
    const current = await query(sessionReadSql, [owner, operation.id, action.id]);
    const row = current.rows[0];
    if (!row || row.data == null) return;
    const updated = applyAction(
      { program: [], body: [], sessions: [parsed<Session>(row.data)] },
      action,
    ).sessions[0];
    await query(
      'UPDATE fitness.workout_sessions SET data = $1::jsonb, updated_at = now() WHERE owner_id = $2::uuid AND id = $3',
      [JSON.stringify(updated), owner, action.id],
    );
    return;
  }
  const statement = mutation(action);
  await query(statement.text, [owner, operation.id, ...statement.params]);
}
