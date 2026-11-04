import { createHash } from 'node:crypto';
import { loginWith } from '../lib/login-round-trips';
import type { SqlRow } from '../lib/notebook-round-trips';
import { database } from './postgres';
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
  return loginWith(
    async (text, values) => {
      const result = await database().query(
        text,
        values === undefined ? undefined : [...values],
      );
      return { rows: result.rows as SqlRow[], rowCount: result.rowCount };
    },
    username,
    password,
  );
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
