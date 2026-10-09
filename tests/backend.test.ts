import { describe, expect, it, vi } from 'vitest';
import type { AiProvider, AiRefineInput } from '../src/services/ai/types';
import { BackendClient } from '../src/services/backend/client';
import { configFromEnv, createHandler, type ServerConfig } from '../server/src/handler';
import { jsonResponse, mockFetch } from './helpers';

const EXT = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';
const braveOk = mockFetch((url) =>
  url.hostname === 'api.search.brave.com'
    ? jsonResponse({ web: { results: [{ title: 'AI agents - Import AI', url: 'https://importai.substack.com/p/agents', description: 'About agents.', page_age: '2026-09-30T00:00:00' }, { title: 'nope', url: 'https://medium.com/p/x' }] } })
    : undefined,
);

const fakeAi: AiProvider = {
  via: 'backend',
  analyze: vi.fn(async () => ({ topics: ['AI agents'], entities: ['OpenAI'], concepts: ['automation'], queries: ['ai agents essays'] })),
  refine: vi.fn(async (input: AiRefineInput) => input.candidates.map((c) => ({ id: c.id, relevance: 0.8, why: 'Because.' }))),
};

function server(over: Partial<ServerConfig> = {}) {
  return createHandler({ braveApiKey: 'brave-key', anthropicApiKey: 'ant-key', allowedOrigins: [EXT], rateLimitPerMinute: 30, fetch: braveOk, ai: fakeAi, ...over });
}

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://api.test${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: EXT, ...headers }, body: JSON.stringify(body) });

describe('backend: access control', () => {
  it('reports health and which features are configured — without revealing keys', async () => {
    const res = await server()(new Request('http://api.test/health', { headers: { origin: EXT } }));
    const body = (await res.json()) as { features: Record<string, boolean> };
    expect(body.features).toEqual({ search: true, ai: true });
    expect(JSON.stringify(body)).not.toMatch(/brave-key|ant-key/);
    const bare = await createHandler({ allowedOrigins: [], rateLimitPerMinute: 5 })(new Request('http://api.test/health'));
    expect(((await bare.json()) as { features: object }).features).toEqual({ search: false, ai: false });
  });

  it('answers CORS preflight only for allowed origins', async () => {
    const ok = await server()(new Request('http://api.test/v1/search/substack', { method: 'OPTIONS', headers: { origin: EXT } }));
    expect(ok.status).toBe(204);
    expect(ok.headers.get('access-control-allow-origin')).toBe(EXT);
    const bad = await server()(new Request('http://api.test/v1/search/substack', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }));
    expect(bad.status).toBe(403);
    expect(bad.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('defaults to any chrome-extension origin but never a website', async () => {
    const open = createHandler({ allowedOrigins: [], rateLimitPerMinute: 5, braveApiKey: 'k', fetch: braveOk });
    expect((await open(post('/v1/search/substack', { queries: ['ai agents'] }, { origin: 'chrome-extension://zzz' }))).status).toBe(200);
    expect((await open(post('/v1/search/substack', { queries: ['ai agents'] }, { origin: 'https://evil.example' }))).status).toBe(403);
  });

  it('rate-limits per client', async () => {
    const h = server({ rateLimitPerMinute: 2 });
    const call = () => h(post('/v1/search/substack', { queries: ['x y'] }, { 'x-forwarded-for': '9.9.9.9' }));
    expect((await call()).status).toBe(200);
    expect((await call()).status).toBe(200);
    const limited = await call();
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    // a different client is unaffected
    expect((await h(post('/v1/search/substack', { queries: ['x y'] }, { 'x-forwarded-for': '1.1.1.1' }))).status).toBe(200);
  });

  it('rejects oversized, non-JSON and malformed bodies', async () => {
    const h = server();
    expect((await h(post('/v1/search/substack', { queries: ['x'.repeat(100_000)] }))).status).toBe(413);
    expect((await h(new Request('http://api.test/v1/search/substack', { method: 'POST', headers: { origin: EXT, 'content-type': 'text/plain' }, body: 'hi' }))).status).toBe(415);
    expect((await h(new Request('http://api.test/v1/search/substack', { method: 'POST', headers: { origin: EXT, 'content-type': 'application/json' }, body: '{nope' }))).status).toBe(400);
    expect((await h(post('/v1/search/substack', { queries: [] }))).status).toBe(400);
    expect((await h(post('/v1/nope', {}))).status).toBe(404);
    expect((await h(new Request('http://api.test/v1/search/substack', { headers: { origin: EXT } }))).status).toBe(404); // GET
  });
});

describe('backend: Substack search', () => {
  it('proxies search, keeping only validated Substack articles', async () => {
    const res = await server()(post('/v1/search/substack', { queries: ['"AI agents" software'], limit: 10 }));
    expect(res.status).toBe(200);
    const { candidates } = (await res.json()) as { candidates: Record<string, unknown>[] };
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ title: 'AI agents', publicationName: 'Import AI', url: 'https://importai.substack.com/p/agents', searchRank: 0 });
    expect(braveOk.calls.at(-1)).toContain('site%3Asubstack.com');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('is unconfigured (501) without a key, and never leaks upstream failures', async () => {
    expect((await createHandler({ allowedOrigins: [], rateLimitPerMinute: 5 })(post('/v1/search/substack', { queries: ['x y'] }))).status).toBe(501);

    const secretLeak = mockFetch(() => new Response('{"error":"bad key: brave-key-SECRET"}', { status: 401 }));
    const res = await server({ fetch: secretLeak })(post('/v1/search/substack', { queries: ['x y'] }));
    expect(res.status).toBe(502);
    expect(await res.text()).not.toMatch(/SECRET|brave-key/);

    const limited = mockFetch(() => new Response('', { status: 429, headers: { 'retry-after': '12' } }));
    const r2 = await server({ fetch: limited })(post('/v1/search/substack', { queries: ['x y'] }));
    expect(r2.status).toBe(429);
    expect(r2.headers.get('retry-after')).toBe('12');
  });
});

describe('backend: AI endpoints', () => {
  it('analyses a title and validates inputs', async () => {
    const res = await server()(post('/v1/ai/analyze', { platform: 'youtube', title: 'How AI Agents Will Change Software', description: 'x'.repeat(5000) }));
    expect(((await res.json()) as { analysis: { topics: string[] } }).analysis.topics).toContain('AI agents');
    const input = vi.mocked(fakeAi.analyze).mock.calls.at(-1)![0];
    expect(input.description!.length).toBeLessThanOrEqual(600); // truncated before it can reach the model
    expect((await server()(post('/v1/ai/analyze', {}))).status).toBe(400);
  });

  it('refines candidates', async () => {
    const res = await server()(post('/v1/ai/refine', { source: { title: 't', platform: 'youtube', topics: ['x'] }, candidates: [{ id: 'a1', title: 'Hello', excerpt: 'World', publication: 'P' }, { nope: true }] }));
    expect(((await res.json()) as { judgements: unknown[] }).judgements).toHaveLength(1);
    expect((await server()(post('/v1/ai/refine', { candidates: [] }))).status).toBe(400);
  });

  it('is 501 without an Anthropic key', async () => {
    const h = createHandler({ allowedOrigins: [], rateLimitPerMinute: 5 });
    expect((await h(post('/v1/ai/analyze', { title: 'x' }))).status).toBe(501);
  });
});

describe('extension ⇄ backend contract', () => {
  /** Routes the extension's real BackendClient straight into the real server handler. */
  const handler = server();
  const bridge = (async (input: RequestInfo | URL, init?: RequestInit) => handler(new Request(String(input), { ...init, headers: { origin: EXT, ...(init?.headers as Record<string, string>) } }))) as typeof fetch;
  const client = new BackendClient('http://api.test', bridge);

  it('discovers features, searches and parses results', async () => {
    expect(await client.features()).toEqual({ search: true, ai: true });
    const found = await client.searchSubstack(['AI agents'], 10);
    expect(found[0]).toMatchObject({ provider: 'backend', source: 'search', title: 'AI agents', publicationName: 'Import AI' });
  });

  it('round-trips AI calls through validation on both sides', async () => {
    expect((await client.analyze({ platform: 'youtube', kind: 'video', title: 'Agents' })).queries).toContain('ai agents essays');
    const judged = await client.refine({ source: { title: 't', platform: 'youtube', topics: [] }, candidates: [{ id: 'a1', title: 'Hello', excerpt: '', publication: 'P' }] });
    expect(judged).toEqual([{ id: 'a1', relevance: 0.8, why: 'Because.' }]);
  });

  it('rejects a backend that returns the wrong shape', async () => {
    const evil = new BackendClient('http://api.test', (async () => jsonResponse({ candidates: 'nope' })) as typeof fetch);
    await expect(evil.searchSubstack(['x'], 5)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    const sneaky = new BackendClient('http://api.test', (async () => jsonResponse({ candidates: [{ url: 'https://evil.example/p/x', title: 'Phish' }, { url: 'javascript:alert(1)', title: 'x' }] })) as typeof fetch);
    expect(await sneaky.searchSubstack(['x'], 5)).toEqual([]); // off-Substack and unsafe links are dropped client-side too
  });
});

describe('config', () => {
  it('reads environment variables safely', () => {
    expect(configFromEnv({ BRAVE_API_KEY: 'k', ALLOWED_ORIGINS: ' chrome-extension://a , chrome-extension://b ,', RATE_LIMIT_PER_MINUTE: 'abc' })).toMatchObject({
      braveApiKey: 'k',
      anthropicApiKey: undefined,
      allowedOrigins: ['chrome-extension://a', 'chrome-extension://b'],
      rateLimitPerMinute: 30,
    });
  });
});
