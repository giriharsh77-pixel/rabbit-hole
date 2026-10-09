/**
 * Node entry point (local development, Docker, any VPS):
 *
 *     npm run server:dev          # reads ./.env then ./server/.env
 *
 * Environment: BRAVE_API_KEY, ANTHROPIC_API_KEY, ANTHROPIC_MODEL, ALLOWED_ORIGINS,
 * RATE_LIMIT_PER_MINUTE, PORT (default 8787), HOST (default 127.0.0.1).
 */
import { existsSync } from 'node:fs';
import { createServer, type IncomingMessage } from 'node:http';
import { configFromEnv, createHandler } from './handler';

for (const file of ['.env', 'server/.env']) {
  if (existsSync(file)) process.loadEnvFile(file);
}

const config = configFromEnv(process.env);
const handler = createHandler(config);
const MAX_BODY = 64_000;

async function readBody(req: IncomingMessage): Promise<Buffer | undefined> {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return undefined;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new Error('payload too large');
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

const server = createServer(async (req, res) => {
  try {
    const body = await readBody(req);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
    if (!headers.has('x-forwarded-for') && req.socket.remoteAddress) headers.set('x-forwarded-for', req.socket.remoteAddress);
    const request = new Request(`http://${req.headers.host ?? 'localhost'}${req.url ?? '/'}`, {
      method: req.method ?? 'GET',
      headers,
      ...(body ? { body: new Uint8Array(body) } : {}),
    });
    const response = await handler(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    res.writeHead(413, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'BAD_REQUEST', message: 'Request rejected.' } }));
  }
});

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? '127.0.0.1';
server.listen(port, host, () => {
  console.log(`Rabbit Hole backend listening on http://${host}:${port}`);
  console.log(`  search: ${config.braveApiKey ? 'enabled' : 'disabled (set BRAVE_API_KEY)'}`);
  console.log(`  ai:     ${config.anthropicApiKey ? 'enabled' : 'disabled (set ANTHROPIC_API_KEY)'}`);
  console.log(`  origins: ${config.allowedOrigins.length ? config.allowedOrigins.join(', ') : 'any chrome-extension://'}`);
});
