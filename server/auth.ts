import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { database } from './postgres';
const derive = promisify(scrypt);
export type User = { id: string; username: string };
const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');
export async function authenticate(
  cookie: string | undefined,
): Promise<User | null> {
  const token = cookie?.match(
    /(?:^|;\s*)gym_session=([a-f0-9]{64})(?:;|$)/,
  )?.[1];
  if (!token) return null;
  const result = await database().query(
    'SELECT u.id,u.username FROM identity.sessions s JOIN identity.accounts u ON u.id=s.owner_id WHERE s.token_hash=$1 AND s.expires_at>now() AND NOT u.disabled',
    [digest(token)],
  );
  return result.rows[0] ?? null;
}
export async function login(
  username: string,
  password: string,
): Promise<{ user: User; token: string } | null> {
  const normalized = username.trim().toLowerCase();
  if (!/^[a-z0-9._-]{1,50}$/.test(normalized) || password.length > 1024)
    return null;
  const attempts = await database().query(
    `INSERT INTO identity.login_attempts(username,attempts,reset_at) VALUES($1,1,now()+interval '1 minute') ON CONFLICT(username) DO UPDATE SET attempts=CASE WHEN identity.login_attempts.reset_at<now() THEN 1 ELSE identity.login_attempts.attempts+1 END,reset_at=CASE WHEN identity.login_attempts.reset_at<now() THEN now()+interval '1 minute' ELSE identity.login_attempts.reset_at END RETURNING attempts`,
    [normalized],
  );
  if (attempts.rows[0].attempts > 5) throw Error('RATE_LIMIT');
  const result = await database().query(
    'SELECT id,username,password_hash FROM identity.accounts WHERE username=$1 AND NOT disabled',
    [normalized],
  );
  const row = result.rows[0];
  // Derive even for an unknown username so account existence is not disclosed.
  const [salt, hash] = (
    row?.password_hash ?? `${'0'.repeat(32)}:${'0'.repeat(128)}`
  ).split(':');
  const candidate = (await derive(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hash, 'hex');
  if (
    !row ||
    candidate.length !== expected.length ||
    !timingSafeEqual(candidate, expected)
  )
    return null;
  const token = randomBytes(32).toString('hex');
  await database().query(
    "INSERT INTO identity.sessions(token_hash,owner_id,expires_at) VALUES($1,$2,now()+interval '30 days')",
    [digest(token), row.id],
  );
  await database().query(
    'DELETE FROM identity.sessions WHERE expires_at<now()',
  );
  await database().query(
    'DELETE FROM identity.login_attempts WHERE reset_at<now()',
  );
  return { user: { id: row.id, username: row.username }, token };
}
export async function logout(cookie: string | undefined) {
  const token = cookie?.match(
    /(?:^|;\s*)gym_session=([a-f0-9]{64})(?:;|$)/,
  )?.[1];
  if (token)
    await database().query(
      'DELETE FROM identity.sessions WHERE token_hash=$1',
      [digest(token)],
    );
}
