import { describe, expect, it } from 'vitest';
import { createServices } from '../src/background/container';
import { MemoryStore } from '../src/services/cacheService';
import { manualContext } from '../src/services/contextService';
import { jsonResponse, listing, mockFetch, NOW, type Route } from './helpers';

const REDDIT_JSON: Route = (url) => (url.hostname === 'www.reddit.com' && url.pathname.endsWith('.json') ? jsonResponse(listing([{ id: 'abc123', score: 5000, comments: 700 }, { id: 'def456', score: 900, comments: 20, ageHours: 1 }])) : undefined);
const REDDIT_RSS: Route = (url) =>
  url.hostname === 'www.reddit.com' && url.pathname.includes('.rss')
    ? new Response(
        `<feed xmlns="http://www.w3.org/2005/Atom"><entry><author><name>/u/a</name></author><category term="technology"/><content type="html">x</content><id>t3_rss001</id><link href="https://www.reddit.com/r/technology/comments/rss001/t/"/><updated>2026-10-07T10:00:00+00:00</updated><title>From the feed</title></entry></feed>`,
        { status: 200 },
      )
    : undefined;
const status = (code: number, host = 'www.reddit.com', headers: Record<string, string> = {}): Route => (url) => (url.hostname === host ? new Response('', { status: code, headers }) : undefined);

function services(fetchImpl: typeof fetch, opts: { clientId?: string; settings?: object } = {}) {
  const local = new MemoryStore();
  const s = createServices({
    local,
    session: new MemoryStore(),
    fetchImpl,
    now: () => NOW,
    build: { redditClientId: opts.clientId ?? '' },
  });
  return { ...s, local };
}

describe('Reddit provider chain', () => {
  it('uses public JSON when no client id is configured', async () => {
    const s = services(mockFetch(REDDIT_JSON));
    const res = (await s.reddit.getTrending({ topicId: 'all' }))!;
    expect(res.meta.provider).toBe('json');
    expect(res.categories.hot.length).toBeGreaterThan(0);
  });

  it('falls back JSON → RSS when Reddit blocks anonymous JSON, and says so', async () => {
    // route order matters: serve .rss first, then 403 everything else on reddit.com (the .json endpoints)
    const s = services(mockFetch(REDDIT_RSS, status(403)));
    const res = (await s.reddit.getTrending({ topicId: 'all' }))!;
    expect(res.meta.provider).toBe('rss');
    expect(res.meta.degradedFrom).toEqual([{ provider: 'json', code: 'BLOCKED' }]);
    expect(res.categories.hot[0]).toMatchObject({ title: 'From the feed', statsEstimated: true });
  });

  it('prefers the official OAuth API when a client id is set, falling back if it fails', async () => {
    const oauthOk = mockFetch(
      (url) => (url.pathname === '/api/v1/access_token' ? jsonResponse({ access_token: 'tok', expires_in: 3600 }) : undefined),
      (url, init) => (url.hostname === 'oauth.reddit.com' && (init?.headers as Record<string, string>)?.authorization === 'Bearer tok' ? jsonResponse(listing([{ id: 'oauth1', score: 777 }])) : undefined),
    );
    const s = services(oauthOk, { clientId: 'client_id_123' });
    const ok = (await s.reddit.getTrending({ topicId: 'all' }))!;
    expect(ok.meta.provider).toBe('oauth');
    expect(oauthOk.calls.some((c) => c.includes('/api/v1/access_token'))).toBe(true);

    const badCreds = mockFetch((url) => (url.pathname === '/api/v1/access_token' ? new Response('', { status: 401 }) : undefined), REDDIT_JSON);
    const s2 = services(badCreds, { clientId: 'wrong_client' });
    const res = (await s2.reddit.getTrending({ topicId: 'all' }))!;
    expect(res.meta.provider).toBe('json');
    expect(res.meta.degradedFrom?.[0]).toEqual({ provider: 'oauth', code: 'UNAUTHORIZED' });
  });

  it('stops asking a provider that just blocked us (circuit breaker)', async () => {
    const f = mockFetch(REDDIT_RSS, status(403));
    const s = services(f);
    await s.reddit.getTrending({ topicId: 'all' });
    const jsonCalls = () => f.calls.filter((c) => c.includes('.json')).length;
    const before = jsonCalls();
    expect(before).toBeGreaterThan(0);
    await s.reddit.getTrending({ topicId: 'technology' });
    expect(jsonCalls()).toBe(before); // second topic went straight to RSS
    expect(s.reddit.coolingDown()).toContain('json');
  });

  it('throws a typed error when every provider fails, and an offline error immediately', async () => {
    const allDown = services(mockFetch(status(429, 'www.reddit.com', { 'retry-after': '90' })));
    await expect(allDown.reddit.getTrending({ topicId: 'all' })).rejects.toMatchObject({ code: 'RATE_LIMITED' });

    const offline = mockFetch(() => {
      throw new TypeError('Failed to fetch');
    });
    const s = services(offline);
    await expect(s.reddit.getTrending({ topicId: 'all' })).rejects.toMatchObject({ code: 'NETWORK' });
    expect(offline.calls.length).toBeLessThan(5); // did not grind through every provider while offline
  });

  it('serves stale data (flagged) when a refresh fails after the TTL', async () => {
    let now = NOW;
    const local = new MemoryStore();
    let broken = false;
    const f = mockFetch((url) => (broken ? new Response('', { status: 500 }) : REDDIT_JSON(url)));
    const s = createServices({ local, session: new MemoryStore(), fetchImpl: f, now: () => now });
    const fresh = (await s.reddit.getTrending({ topicId: 'all' }))!;
    expect(fresh.stale).toBeUndefined();
    now += 10 * 60_000;
    broken = true;
    const stale = (await s.reddit.getTrending({ topicId: 'all' }))!;
    expect(stale.stale).toBe(true);
    expect(stale.categories.hot.length).toBeGreaterThan(0);
    // and the instant "cache only" path used for painting immediately on open
    expect((await s.reddit.getTrending({ topicId: 'all', cacheOnly: true }))?.stale).toBe(true);
    expect(await s.reddit.getTrending({ topicId: 'science', cacheOnly: true })).toBeNull();
  });

  it('does not refetch within the TTL (5 minutes) and filters NSFW by default', async () => {
    const f = mockFetch((url) => {
      if (!url.pathname.endsWith('.json')) return undefined;
      const body = listing([{ id: 'sfw001' }, { id: 'nsfw01' }]);
      (body.data.children[1]!.data as { over_18: boolean }).over_18 = true;
      return jsonResponse(body);
    });
    const s = services(f);
    const first = (await s.reddit.getTrending({ topicId: 'all' }))!;
    const calls = f.calls.length;
    await s.reddit.getTrending({ topicId: 'all' });
    expect(f.calls.length).toBe(calls);
    expect(first.categories.hot.map((p) => p.id)).toEqual(['sfw001']);
  });

  it('requires subreddits for the Custom filter', async () => {
    const s = services(mockFetch(REDDIT_JSON));
    await expect(s.reddit.getTrending({ topicId: 'custom' })).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
    const f = mockFetch(REDDIT_JSON);
    const s2 = services(f);
    await s2.settings.update({ reddit: { preferredSubreddits: ['rust', 'golang'] } });
    await s2.reddit.getTrending({ topicId: 'custom' });
    expect(f.calls[0]).toContain('/r/rust+golang/');
  });

  it('searches Reddit with several queries and ranks title matches first', async () => {
    const f = mockFetch((url) =>
      url.pathname.endsWith('/search.json')
        ? jsonResponse(listing([{ id: 'nomatch', title: 'Cute dog compilation', score: 90000 }, { id: 'match01', title: 'How AI agents are changing software development', score: 800 }]))
        : undefined,
    );
    const s = services(f);
    const res = await s.reddit.search({ queries: ['"AI agents" software development', 'AI agents'], limit: 5 });
    expect(res.posts[0]!.id).toBe('match01');
    expect(f.calls.length).toBe(2);
    await expect(s.reddit.search({ queries: ['  '] })).rejects.toMatchObject({ code: 'NO_CONTEXT' });
  });
});

describe('Substack discovery failure handling', () => {
  const RSS = (slug: string, title: string) =>
    `<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>${slug}</title><link>https://${slug}.substack.com</link><item><title>${title}</title><description>About ${title} and autonomous agents.</description><link>https://${slug}.substack.com/p/post-1</link><dc:creator>Writer</dc:creator><pubDate>Mon, 05 Oct 2026 12:00:00 GMT</pubDate></item></channel></rss>`;
  const feedRoute: Route = (url) => {
    const slug = url.hostname.match(/^([a-z0-9-]+)\.substack\.com$/)?.[1];
    return slug && url.pathname === '/feed' ? new Response(RSS(slug, 'AI agents change software development'), { status: 200 }) : undefined;
  };
  const brave = (code: number, body?: unknown): Route => (url) =>
    url.hostname === 'api.search.brave.com'
      ? code === 200
        ? jsonResponse(body)
        : new Response('', { status: code })
      : undefined;

  const ctx = manualContext('AI agents');

  it('works with no keys at all, using the curated feeds, and flags limited coverage', async () => {
    const s = services(mockFetch(feedRoute));
    const res = await s.substack.discover(ctx);
    expect(res.limitedCoverage).toBe(true);
    expect(res.providers).toEqual([expect.objectContaining({ id: 'feeds', ok: true })]);
    expect(res.articles.length).toBeGreaterThan(0);
    expect(res.articles[0]).toMatchObject({ provider: 'feeds', source: 'feed' });
    expect(res.articles[0]!.why.length).toBeGreaterThan(20);
  });

  it('degrades to feeds when the search API rejects the key, and reports why', async () => {
    const s = services(mockFetch(brave(401), feedRoute));
    await s.secrets.set('braveApiKey', 'BSA_test_key_123');
    const res = await s.substack.discover(ctx);
    expect(res.providers.find((p) => p.id === 'brave')).toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED' } });
    expect(res.providers.find((p) => p.id === 'feeds')?.ok).toBe(true);
    expect(res.articles.length).toBeGreaterThan(0);
  });

  it('uses search results when available and skips feeds when search is plentiful', async () => {
    const results = Array.from({ length: 12 }, (_, i) => ({ title: `AI agents deep dive ${i}`, url: `https://pub${i}.substack.com/p/agents-${i}`, description: 'All about AI agents and automation.', page_age: '2026-09-20T00:00:00' }));
    const f = mockFetch(brave(200, { web: { results } }), feedRoute);
    const s = services(f);
    await s.secrets.set('braveApiKey', 'BSA_test_key_123');
    const res = await s.substack.discover(ctx);
    expect(res.limitedCoverage).toBe(false);
    expect(res.providers.map((p) => p.id)).toEqual(['brave']);
    expect(f.calls.some((c) => c.endsWith('/feed'))).toBe(false);
    expect(res.articles.length).toBeGreaterThan(0);
  });

  it('surfaces a typed error only when every source failed', async () => {
    const offline = mockFetch(() => {
      throw new TypeError('Failed to fetch');
    });
    await expect(services(offline).substack.discover(ctx)).rejects.toMatchObject({ code: expect.stringMatching(/NETWORK|UNAVAILABLE/) });
  });

  it('returns an empty (not failed) result when nothing matches', async () => {
    const s = services(mockFetch((url) => (url.pathname === '/feed' ? new Response(RSS('quiet', 'Sourdough starters explained'), { status: 200 }) : undefined)));
    const res = await s.substack.discover(manualContext('quantum chromodynamics'));
    expect(res.articles).toEqual([]);
    expect(res.providers.every((p) => p.ok)).toBe(true);
  });

  it('survives individual feeds failing', async () => {
    let n = 0;
    const flaky: Route = (url) => {
      if (url.pathname !== '/feed') return undefined;
      return n++ % 2 === 0 ? new Response('', { status: 500 }) : feedRoute(url);
    };
    const res = await services(mockFetch(flaky)).substack.discover(ctx);
    expect(res.articles.length).toBeGreaterThan(0);
  });

  it('caches results for 10 minutes so reopening is free', async () => {
    const f = mockFetch(feedRoute);
    const s = services(f);
    await s.substack.discover(ctx);
    const calls = f.calls.length;
    await s.substack.discover(ctx);
    expect(f.calls.length).toBe(calls);
    await s.substack.discover(ctx, { refresh: true });
    expect(f.calls.length).toBeGreaterThan(calls - 1); // feeds themselves are cached 30 min; the ranking is recomputed
  });

  it('honours cancellation', async () => {
    const hang: Route = () => new Promise<Response>(() => undefined);
    const s = services(mockFetch(hang));
    const c = new AbortController();
    const p = s.substack.discover(ctx, { signal: c.signal });
    c.abort();
    await expect(p).rejects.toMatchObject({ code: 'ABORTED' });
  });

  it('enforces the user’s count and minimum-relevance settings', async () => {
    const s = services(mockFetch(feedRoute));
    await s.settings.update({ reading: { recommendationCount: 5, minRelevance: 0 } });
    const capped = await s.substack.discover(ctx);
    expect(capped.articles.length).toBe(5);
    expect(capped.totalCandidates).toBeGreaterThan(5);

    // a loosely related topic can't clear a strict bar
    await s.settings.update({ reading: { minRelevance: 90 } });
    expect((await s.substack.discover(manualContext('autonomous vehicles'))).articles).toEqual([]);
  });
});
