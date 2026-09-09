import { env } from 'cloudflare:workers';
import { signIn } from '@/lib/server-auth';
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return new Response('Invalid origin', { status: 403 });
  const limiter = (env as unknown as {LOGIN_LIMITER?: {limit: (input:{key:string})=>Promise<{success:boolean}>}}).LOGIN_LIMITER;
  if(limiter && !(await limiter.limit({key:request.headers.get('cf-connecting-ip') || 'unknown'})).success) return Response.json({error:'Try again in a minute.'},{status:429,headers:{'Cache-Control':'no-store','Retry-After':'60'}});
  const raw = await request.text();
  if (raw.length > 2048)
    return new Response('Invalid request', { status: 400 });
  let password: unknown;
  try {
    password = JSON.parse(raw).password;
  } catch {
    return new Response('Invalid request', { status: 400 });
  }
  const token = typeof password === 'string' ? await signIn(password) : null;
  if (!token)
    return Response.json(
      { error: 'Sign-in failed' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  return Response.json(
    { ok: true },
    {
      headers: {
        'Cache-Control': 'no-store',
        'Set-Cookie': `gym_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`,
      },
    },
  );
}
