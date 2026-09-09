import { env } from 'cloudflare:workers';

// Sites keeps its existing owner-only dispatcher policy. Independent deployment
// MUST set GYM_AUTH_MODE=standalone and secrets; it fails closed if misconfigured.
function config() {
  return env as unknown as Record<string, string | undefined>;
}
const bytes = (s: string) => new TextEncoder().encode(s);
async function signature(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    bytes(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return Array.from(
    new Uint8Array(await crypto.subtle.sign('HMAC', key, bytes(value))),
  )
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
}
function equal(a: string, b: string) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++)
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
export async function authorize(request: Request) {
  const c = config();
  const url = new URL(request.url);
  if (c.GYM_AUTH_MODE === 'standalone') {
    if (!c.GYM_SESSION_SECRET || c.GYM_SESSION_SECRET.length < 32) return false;
    const token = request.headers
      .get('cookie')
      ?.match(/(?:^|;\s*)gym_session=([^;]+)/)?.[1];
    if (!token) return false;
    const [expires, mac] = token.split('.');
    return (
      /^\d+$/.test(expires) &&
      Number(expires) > Date.now() &&
      equal(mac ?? '', await signature(expires, c.GYM_SESSION_SECRET))
    );
  }
  // These headers are trustworthy only behind the Sites dispatcher. Independent
  // Workers cannot opt into this path through a spoofed request header.
  if (url.hostname.endsWith('.chatgpt.site'))
    return !!request.headers.get('oai-authenticated-user-id');
  if (c.GYM_AUTH_MODE === 'sites' && c.GYM_SITES_HOST === url.hostname)
    return !!request.headers.get('oai-authenticated-user-id');
  return (
    (url.hostname === 'localhost' || url.hostname === '127.0.0.1') &&
    c.GYM_AUTH_MODE !== 'standalone'
  );
}
export async function signIn(password: string) {
  const c = config();
  if (
    c.GYM_AUTH_MODE !== 'standalone' ||
    !c.GYM_PASSWORD ||
    c.GYM_PASSWORD.length < 20 ||
    !c.GYM_SESSION_SECRET ||
    c.GYM_SESSION_SECRET.length < 32
  )
    return null;
  if (
    !equal(
      await signature(password, c.GYM_SESSION_SECRET),
      await signature(c.GYM_PASSWORD, c.GYM_SESSION_SECRET),
    )
  )
    return null;
  const expires = String(Date.now() + 30 * 86400000);
  return `${expires}.${await signature(expires, c.GYM_SESSION_SECRET)}`;
}
