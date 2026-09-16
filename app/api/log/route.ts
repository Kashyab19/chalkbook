import { getDb } from '@/db';
import { defaultProgram, type Data } from '@/lib/training';
import { validateAction, type Operation } from '@/lib/operations';
import { authorize } from '@/lib/server-auth';

const response = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
async function read(): Promise<Data> {
  const db = getDb();
  await db
    .prepare('INSERT OR IGNORE INTO program(id,data) VALUES(?,?)')
    .bind('default', JSON.stringify(defaultProgram))
    .run();
  // One batch gives a consistent snapshot across tables.
  const [program, sessions, body] = await db.batch<Record<string, unknown>>([
    db.prepare('SELECT data FROM program WHERE id=?').bind('default'),
    db.prepare('SELECT data FROM sessions ORDER BY date DESC'),
    db.prepare(
      'SELECT date, weight_kg AS weightKg FROM body_weights ORDER BY date',
    ),
  ]);
  return {
    program: JSON.parse(String(program.results[0].data)),
    sessions: sessions.results.map((r) => JSON.parse(String(r.data))),
    body: body.results.map((r) => ({
      date: String(r.date),
      weightKg: Number(r.weightKg),
    })),
  };
}
export async function GET(request: Request) {
  if (!(await authorize(request)))
    return response({ error: 'Sign in required' }, 401);
  try {
    return response(await read());
  } catch {
    return response(
      { error: 'Could not load your notebook. Please retry.' },
      503,
    );
  }
}
export async function POST(request: Request) {
  if (!(await authorize(request)))
    return response({ error: 'Sign in required' }, 401);
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin)
    return response({ error: 'Invalid origin' }, 403);
  try {
    const raw = await request.text();
    if (raw.length > 2_000_000)
      return response({ error: 'Change too large' }, 413);
    const op = JSON.parse(raw) as Operation;
    // Legacy clients must reload; silently accepting unqueued writes would bypass
    // idempotency and make the new offline conflict policy unreliable.
    if (!op || typeof op.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(op.id))
      return response(
        { error: 'Update Gym Notebook before logging more changes.' },
        409,
      );
    validateAction(op.action);
    const a = op.action;
    const db = getDb();
    const unseen = 'NOT EXISTS (SELECT 1 FROM sync_operations WHERE id=?)';
    const statements: D1PreparedStatement[] = [];
    switch (a.type) {
      case 'start':
      case 'restoreSession': {
        const s = a.session;
        const conflict =
          a.type === 'start'
            ? 'DO NOTHING'
            : 'DO UPDATE SET date=excluded.date,data=excluded.data';
        statements.push(
          db
            .prepare(
              `INSERT INTO sessions(id,date,data) SELECT ?,?,? WHERE ${unseen} ON CONFLICT(id) ${conflict}`,
            )
            .bind(s.id, s.date, JSON.stringify(s), op.id),
        );
        break;
      }
      case 'set': {
        const path = `$.exercises[${a.exercise}].entries[${a.set}]`;
        // JSON patch runs atomically in SQLite. Concurrent edits to different sets
        // cannot overwrite each other. A deleted session is never resurrected here.
        statements.push(
          db
            .prepare(
              `UPDATE sessions SET data=json_set(data,?,json(?)) WHERE id=? AND json_type(data,?)='object' AND ${unseen}`,
            )
            .bind(path, JSON.stringify(a.value), a.id, path, op.id),
        );
        statements.push(
          db
            .prepare(
              `UPDATE sessions SET data=json_set(data,'$.completedAt',CASE WHEN NOT EXISTS (SELECT 1 FROM json_tree(sessions.data,'$.exercises') WHERE key='completed' AND value=0) THEN COALESCE(json_extract(data,'$.completedAt'),?) ELSE NULL END) WHERE id=? AND ${unseen}`,
            )
            .bind(new Date().toISOString(), a.id, op.id),
        );
        break;
      }
      case 'addSet': {
        const path = `$.exercises[${a.exercise}].entries`;
        statements.push(db.prepare(`UPDATE sessions SET data=json_set(data,?,json_insert(json_extract(data,?),'$[#]',json(?)),'$.completedAt',NULL) WHERE id=? AND json_array_length(data,?)=? AND ${unseen}`).bind(path,path,JSON.stringify(a.value),a.id,path,a.set,op.id));
        break;
      }
      case 'removeSet': {
        const path = `$.exercises[${a.exercise}].entries`;
        const entry = `${path}[${a.set}]`;
        const planned = `$.exercises[${a.exercise}].sets`;
        statements.push(db.prepare(`UPDATE sessions SET data=json_set(json_remove(data,?),'$.completedAt',NULL) WHERE id=? AND json_array_length(data,?)=? AND json_array_length(data,?)>json_extract(data,?) AND json_extract(data,?)=0 AND ${unseen}`).bind(entry,a.id,path,a.set+1,path,planned,`${entry}.completed`,op.id));
        break;
      }
      case 'finish':
        statements.push(db.prepare(`UPDATE sessions SET data=json_set(data,'$.completedAt',?) WHERE id=? AND ${unseen}`).bind(a.completedAt,a.id,op.id));
        break;
      case 'interactions':
        statements.push(
          db
            .prepare(
              `UPDATE sessions SET data=json_set(data,'$.interactions',json(?)) WHERE id=? AND ${unseen}`,
            )
            .bind(JSON.stringify(a.value), a.id, op.id),
        );
        break;
      case 'program':
        statements.push(
          db
            .prepare(
              `INSERT INTO program(id,data) SELECT 'default',? WHERE ${unseen} ON CONFLICT(id) DO UPDATE SET data=excluded.data`,
            )
            .bind(JSON.stringify(a.program), op.id),
        );
        break;
      case 'body':
        statements.push(
          db
            .prepare(
              `INSERT INTO body_weights(date,weight_kg,created_at) SELECT ?,?,? WHERE ${unseen} ON CONFLICT(date) DO UPDATE SET weight_kg=excluded.weight_kg`,
            )
            .bind(a.date, a.weightKg, new Date().toISOString(), op.id),
        );
        break;
      case 'deleteBody':
        statements.push(
          db
            .prepare(`DELETE FROM body_weights WHERE date=? AND ${unseen}`)
            .bind(a.date, op.id),
        );
        break;
      case 'deleteSession':
        statements.push(
          db
            .prepare(`DELETE FROM sessions WHERE id=? AND ${unseen}`)
            .bind(a.id, op.id),
        );
        break;
    }
    statements.push(
      db
        .prepare(
          'INSERT OR IGNORE INTO sync_operations(id,created_at) VALUES(?,?)',
        )
        .bind(op.id, new Date().toISOString()),
    );
    // D1 batches are transactions: change + durable receipt either both commit or
    // neither does. Retrying after a lost response cannot duplicate/reapply a change.
    await db.batch(statements);
    return response({ ok: true });
  } catch (e) {
    return response(
      {
        error: e instanceof Error ? e.message : 'Could not save. Please retry.',
      },
      400,
    );
  }
}
