import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { SqlQuery, SqlRow } from './notebook-round-trips';

const deriveKey = promisify(scrypt);
const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');

const attemptSql = `INSERT INTO identity.login_attempts(username,attempts,reset_at) VALUES($1,1,now()+interval '1 minute') ON CONFLICT(username) DO UPDATE SET attempts=CASE WHEN identity.login_attempts.reset_at<now() THEN 1 ELSE identity.login_attempts.attempts+1 END,reset_at=CASE WHEN identity.login_attempts.reset_at<now() THEN now()+interval '1 minute' ELSE identity.login_attempts.reset_at END RETURNING attempts`;
const accountSql =
  'SELECT id,username,password_hash FROM identity.accounts WHERE username=$1 AND NOT disabled';

function accountOf(row: SqlRow | undefined) {
  if (
    !row ||
    typeof row.id !== 'string' ||
    typeof row.username !== 'string' ||
    typeof row.password_hash !== 'string'
  )
    return null;
  return {
    id: row.id,
    username: row.username,
    password_hash: row.password_hash,
  };
}

export async function loginWith(
  query: SqlQuery,
  username: string,
  password: string,
  options?: {
    derive?: (password: string, salt: string) => Promise<Buffer>;
    token?: () => string;
  },
): Promise<{ user: { id: string; username: string }; token: string } | null> {
  const normalized = username.trim().toLowerCase();
  if (!/^[a-z0-9._-]{1,50}$/.test(normalized) || password.length > 1024)
    return null;
  // The account lookup does not depend on the attempt counter. Start it now so
  // a slow connection pays for one round trip, not two, before scrypt runs.
  const accountPromise = query(accountSql, [normalized]);
  let attempts: SqlResultRows;
  try {
    attempts = await query(attemptSql, [normalized]);
  } catch (error) {
    void accountPromise.catch(() => {});
    throw error;
  }
  const attemptCount = Number(attempts.rows[0]?.attempts);
  if (!Number.isFinite(attemptCount)) {
    void accountPromise.catch(() => {});
    throw Error('Invalid notebook');
  }
  if (attemptCount > 5) {
    void accountPromise.catch(() => {});
    throw Error('RATE_LIMIT');
  }
  const row = accountOf((await accountPromise).rows[0]);
  // Derive even for an unknown username so account existence is not disclosed.
  const [salt, hash] = (
    row?.password_hash ?? `${'0'.repeat(32)}:${'0'.repeat(128)}`
  ).split(':');
  const derive = options?.derive ?? deriveKey;
  const candidate = (await derive(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hash, 'hex');
  if (
    !row ||
    candidate.length !== expected.length ||
    !timingSafeEqual(candidate, expected)
  )
    return null;
  const token = options?.token?.() ?? randomBytes(32).toString('hex');
  await query(
    "INSERT INTO identity.sessions(token_hash,owner_id,expires_at) VALUES($1,$2,now()+interval '30 days')",
    [digest(token), row.id],
  );
  // Expired-row cleanup does not affect the session just inserted.
  await Promise.all([
    query('DELETE FROM identity.sessions WHERE expires_at<now()'),
    query('DELETE FROM identity.login_attempts WHERE reset_at<now()'),
  ]);
  return { user: { id: row.id, username: row.username }, token };
}

type SqlResultRows = { rows: SqlRow[] };
