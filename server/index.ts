import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { authenticate, login, logout } from './auth';
import { database, readNotebook, writeOperation } from './postgres';
import { validateAction, type Operation } from '../lib/operations';
const root = fileURLToPath(new URL('../client', import.meta.url));
function json(res: ServerResponse, value: unknown, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(value));
}
async function body(req: IncomingMessage) {
  let length = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 2_000_000) throw Error('PAYLOAD_TOO_LARGE');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}
function sameOrigin(req: IncomingMessage) {
  const origin = req.headers.origin;
  if (!origin) return false;
  const expected = process.env.APP_ORIGIN;
  if (expected) return origin === expected;
  return (
    process.env.NODE_ENV !== 'production' &&
    origin === `http://${req.headers.host}`
  );
}
const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
  );
  if (process.env.NODE_ENV === 'production')
    res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  try {
    const url = new URL(req.url ?? '/', 'http://local');
    if (url.pathname === '/api/health') {
      await database().query('SELECT 1 FROM identity.accounts LIMIT 1');
      json(res, { ok: true });
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      if (req.method !== 'GET' && !sameOrigin(req)) {
        json(res, { error: 'Invalid origin' }, 403);
        return;
      }
      if (url.pathname === '/api/auth' && req.method === 'POST') {
        const input = (await body(req)) as {
          username?: unknown;
          password?: unknown;
        };
        const result =
          typeof input.username === 'string' &&
          typeof input.password === 'string'
            ? await login(input.username, input.password)
            : null;
        if (!result) {
          json(res, { error: 'Sign-in failed' }, 401);
          return;
        }
        const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
        res.setHeader(
          'Set-Cookie',
          `gym_session=${result.token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000${secure}`,
        );
        json(res, { user: result.user });
        return;
      }
      if (url.pathname === '/api/auth' && req.method === 'DELETE') {
        await logout(req.headers.cookie);
        res.setHeader(
          'Set-Cookie',
          'gym_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Secure',
        );
        json(res, { ok: true });
        return;
      }
      const user = await authenticate(req.headers.cookie);
      if (!user) {
        json(res, { error: 'Sign in required' }, 401);
        return;
      }
      const expectedOwner = req.headers['x-notebook-owner'];
      if (expectedOwner && expectedOwner !== user.id) {
        json(
          res,
          {
            error:
              'This device queue belongs to another account. Sign in to that account to sync.',
          },
          409,
        );
        return;
      }
      if (url.pathname === '/api/account' && req.method === 'GET') {
        json(res, { user });
        return;
      }
      if (url.pathname === '/api/log' && req.method === 'GET') {
        json(res, { user, data: await readNotebook(user.id) });
        return;
      }
      if (url.pathname === '/api/log' && req.method === 'POST') {
        if (expectedOwner !== user.id) {
          json(res, { error: 'Notebook owner is required' }, 409);
          return;
        }
        const operation = (await body(req)) as Operation;
        if (
          !operation ||
          typeof operation.id !== 'string' ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            operation.id,
          )
        ) {
          json(res, { error: 'Invalid operation' }, 400);
          return;
        }
        validateAction(operation.action);
        await writeOperation(user.id, operation);
        json(res, { ok: true });
        return;
      }
      json(res, { error: 'Not found' }, 404);
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405);
      res.end();
      return;
    }
    let path = resolve(root, '.' + decodeURIComponent(url.pathname));
    if (path !== root && !path.startsWith(root + sep)) {
      res.writeHead(404);
      res.end();
      return;
    }
    if (
      url.pathname === '/' ||
      url.pathname === '/gym' ||
      url.pathname === '/gym/'
    )
      path = resolve(root, 'index.html');
    let info;
    try {
      info = await stat(path);
    } catch {
      res.writeHead(404);
      res.end();
      return;
    }
    if (!info.isFile()) {
      res.writeHead(404);
      res.end();
      return;
    }
    const types: Record<string, string> = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json',
      '.webmanifest': 'application/manifest+json',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.woff2': 'font/woff2',
    };
    res.setHeader(
      'Content-Type',
      types[extname(path)] ?? 'application/octet-stream',
    );
    res.setHeader(
      'Cache-Control',
      url.pathname.startsWith('/assets/')
        ? 'public, max-age=31536000, immutable'
        : 'no-cache',
    );
    if (url.pathname === '/sw.js') res.setHeader('Service-Worker-Allowed', '/');
    res.setHeader('Content-Length', info.size);
    res.writeHead(200);
    if (req.method === 'HEAD') res.end();
    else
      createReadStream(path)
        .on('error', () => res.destroy())
        .pipe(res);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'RATE_LIMIT') {
      res.setHeader('Retry-After', '60');
      json(res, { error: 'Please wait a minute before trying again.' }, 429);
    } else if (message === 'PAYLOAD_TOO_LARGE')
      json(res, { error: 'Change too large' }, 413);
    else if (
      error instanceof SyntaxError ||
      message.startsWith('Invalid notebook')
    )
      json(res, { error: 'Invalid request' }, 400);
    else {
      console.error(
        'Request failed',
        error instanceof Error ? error.name : 'UnknownError',
      );
      json(
        res,
        {
          error:
            'The notebook service is temporarily unavailable. Your device changes are safe.',
        },
        503,
      );
    }
  }
});
server.listen(Number(process.env.PORT) || 4173, '0.0.0.0', () =>
  console.log(`Gym Notebook listening on ${Number(process.env.PORT) || 4173}`),
);
const stop = () =>
  server.close(() => {
    void database()
      .end()
      .finally(() => process.exit(0));
  });
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
