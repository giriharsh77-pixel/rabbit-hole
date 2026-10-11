import { describe, expect, it } from 'vitest';
import { createHandler, type ServerConfig } from '../server/src/handler';
import { parseAvailability } from '../server/src/upstream/tmdb';
import { createServices } from '../src/background/container';
import { BackendClient, validateInsights } from '../src/services/backend/client';
import { MemoryStore } from '../src/services/cacheService';
import { buildContext } from '../src/services/contextService';
import { jsonResponse, mockFetch } from './helpers';

const EXT = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';

/** TMDB, OMDb, NYT and the Guardian, shaped like their documented responses. */
function upstream() {
  return mockFetch((url, init) => {
    if (url.hostname === 'api.themoviedb.org') {
      const auth = (init?.headers as Record<string, string> | undefined)?.authorization;
      if (url.searchParams.get('api_key') !== 'tmdb-v3' && auth !== 'Bearer eyJtmdb-v4') return jsonResponse({ status_message: 'Invalid API key' }, { status: 401 });
      if (url.pathname === '/3/find/tt0386676') return jsonResponse({ movie_results: [], tv_results: [{ id: 2316, name: 'The Office' }] });
      if (url.pathname === '/3/tv/2316')
        return jsonResponse({
          id: 2316,
          name: 'The Office',
          vote_average: 8.56,
          vote_count: 4321,
          external_ids: { imdb_id: 'tt0386676' },
          reviews: {
            results: [
              { id: '5e1f6c3a9a3c49001a1b2c3d', author: 'Dwight Fan', author_details: { rating: 9 }, content: '**Best** sitcom ever made. <em>Michael Scott</em> is a tragic, hilarious, brilliant creation and the cast is perfect.', created_at: '2024-02-01T10:00:00Z' },
              { id: 'not-a-hex-id', author: 'x', content: 'Too short' },
            ],
          },
          recommendations: { results: [{ id: 8592, name: 'Parks and Recreation', first_air_date: '2009-04-09', overview: 'Leslie Knope…', media_type: 'tv' }, { id: 1400, name: 'Seinfeld', first_air_date: '1989-07-05' }] },
          similar: { results: [{ id: 8592, name: 'Parks and Recreation' }, { id: 61662, name: 'Schitt’s Creek', first_air_date: '2015-01-13' }] },
          'watch/providers': { results: { IN: { link: 'https://www.themoviedb.org/tv/2316-the-office/watch?locale=IN', flatrate: [{ provider_id: 119, provider_name: 'Amazon Prime Video' }] }, US: { flatrate: [{ provider_id: 386, provider_name: 'Peacock' }] } } },
        });
      if (url.pathname === '/3/tv/8592/watch/providers') return jsonResponse({ results: { IN: { flatrate: [{ provider_id: 8, provider_name: 'Netflix' }] } } });
      if (url.pathname.endsWith('/watch/providers')) return jsonResponse({ results: {} });
    }
    if (url.hostname === 'www.omdbapi.com')
      return jsonResponse({ Response: 'True', imdbRating: '9.0', imdbVotes: '812,345', Metascore: 'N/A', Ratings: [{ Source: 'Internet Movie Database', Value: '9.0/10' }, { Source: 'Rotten Tomatoes', Value: '81%' }] });
    if (url.hostname === 'api.nytimes.com')
      return jsonResponse({
        response: {
          docs: [
            { web_url: 'https://www.nytimes.com/2005/03/24/arts/television/the-office.html', headline: { main: '‘The Office’ Comes to America' }, abstract: 'NBC adapts the British comedy.', pub_date: '2005-03-24T05:00:00+0000', byline: { original: 'By Alessandra Stanley' }, section_name: 'Arts' },
            { web_url: 'https://www.nytimes.com/2021/01/01/business/return-to-office.html', headline: { main: 'The Return to the Office' }, abstract: 'Workers…', section_name: 'Business' },
          ],
        },
      });
    if (url.hostname === 'content.guardianapis.com')
      return jsonResponse({
        response: {
          results: [
            { webUrl: 'https://www.theguardian.com/tv-and-radio/2025/mar/24/the-office-us-at-20', webTitle: 'The Office at 20: how the US remake won', sectionId: 'tv-and-radio', webPublicationDate: '2025-03-24T08:00:00Z', fields: { trailText: 'Steve Carell made it his own', byline: 'Stuart Heritage' } },
            { webUrl: 'https://evil.example/x', webTitle: 'The Office', sectionId: 'tv-and-radio' },
          ],
        },
      });
    return undefined;
  });
}

function server(over: Partial<ServerConfig> = {}) {
  const fetch = upstream();
  return { fetch, handle: createHandler({ tmdbApiKey: 'tmdb-v3', omdbApiKey: 'omdb-key', nytApiKey: 'nyt-key', guardianApiKey: 'gdn-key', allowedOrigins: [EXT], rateLimitPerMinute: 50, fetch, ...over }) };
}
const post = (path: string, body: unknown) => new Request(`http://api.test${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: EXT }, body: JSON.stringify(body) });

describe('backend: title insights (TMDB · OMDb)', () => {
  it('combines ratings, reviews, similar titles and Netflix India availability', async () => {
    const { handle } = server();
    const res = await handle(post('/v1/title/insights', { tmdb: { type: 'tv', id: '2316' }, imdbId: 'tt0386676' }));
    expect(res.status).toBe(200);
    const { insights } = (await res.json()) as { insights: ReturnType<typeof validateInsights> };
    expect(insights.ratings).toEqual({ imdb: '9.0/10', imdbVotes: '812,345', rottenTomatoes: '81%', tmdb: { score: 8.6, votes: 4321 } });
    expect(insights.reviews).toHaveLength(1);
    expect(insights.reviews[0]).toMatchObject({ author: 'Dwight Fan', rating: 9, url: 'https://www.themoviedb.org/review/5e1f6c3a9a3c49001a1b2c3d' });
    expect(insights.reviews[0]?.excerpt).not.toMatch(/[<*]/); // markdown / HTML stripped
    expect(insights.availability).toEqual({ region: 'IN', onNetflix: false, elsewhere: ['Amazon Prime Video'], link: 'https://www.themoviedb.org/tv/2316-the-office/watch?locale=IN' });
    // recommendations first, de-duplicated, each checked for Netflix India
    expect(insights.similar.map((s) => [s.title, s.onNetflixIndia])).toEqual([
      ['Parks and Recreation', true],
      ['Seinfeld', false],
      ['Schitt’s Creek', false],
    ]);
    expect(insights.attribution).toEqual(['TMDB', 'JustWatch', 'OMDb']);
    expect(JSON.stringify(insights)).not.toMatch(/tmdb-v3|omdb-key/);
  });

  it('finds the TMDB title from an IMDb id, and accepts a v4 token in the Authorization header', async () => {
    const { handle, fetch } = server({ tmdbApiKey: 'eyJtmdb-v4' });
    const res = await handle(post('/v1/title/insights', { imdbId: 'tt0386676' }));
    expect(res.status).toBe(200);
    expect(fetch.calls.some((u) => u.includes('/3/find/tt0386676'))).toBe(true);
    expect(fetch.calls.filter((u) => u.includes('themoviedb')).every((u) => !u.includes('api_key'))).toBe(true);
  });

  it('caches per title and validates input', async () => {
    const { handle, fetch } = server();
    await handle(post('/v1/title/insights', { tmdb: { type: 'tv', id: '2316' } }));
    const n = fetch.calls.length;
    await handle(post('/v1/title/insights', { tmdb: { type: 'tv', id: '2316' } }));
    expect(fetch.calls.length).toBe(n);
    expect((await handle(post('/v1/title/insights', { tmdb: { type: 'tv', id: '../etc' } }))).status).toBe(400);
    expect((await handle(post('/v1/title/insights', { imdbId: 'nope' }))).status).toBe(400);
  });

  it('is 501 without keys, and a bad key surfaces as an upstream auth error — never echoed', async () => {
    expect((await createHandler({ allowedOrigins: [EXT], rateLimitPerMinute: 5 })(post('/v1/title/insights', { imdbId: 'tt0386676' }))).status).toBe(501);
    const { handle } = server({ tmdbApiKey: 'wrong-key', omdbApiKey: undefined });
    const res = await handle(post('/v1/title/insights', { tmdb: { type: 'tv', id: '2316' } }));
    expect(res.status).toBe(502);
    expect(await res.text()).not.toMatch(/wrong-key|Invalid API key/);
  });

  it('reads Netflix India from TMDB watch providers', () => {
    expect(parseAvailability({ results: { IN: { flatrate: [{ provider_id: 8, provider_name: 'Netflix' }] } } }).onNetflix).toBe(true);
    expect(parseAvailability({ results: { IN: { ads: [{ provider_id: 1796, provider_name: 'Netflix basic with Ads' }] } } }).onNetflix).toBe(true);
    expect(parseAvailability({ results: { US: { flatrate: [{ provider_id: 8, provider_name: 'Netflix' }] } } }).onNetflix).toBe(false); // US doesn't count
    expect(parseAvailability({ results: { IN: { rent: [{ provider_id: 8, provider_name: 'Netflix' }] } } }).onNetflix).toBe(false); // subscription only
  });
});

describe('backend: press archives (NYT · Guardian)', () => {
  it('returns arts / TV articles that name the title, from both papers', async () => {
    const { handle } = server();
    const res = await handle(post('/v1/press/search', { title: 'The Office', people: ['Steve Carell'] }));
    const { articles } = (await res.json()) as { articles: { title: string; publicationName: string; url: string; authorName?: string }[] };
    expect(articles.map((a) => [a.publicationName, a.title])).toEqual([
      ['The New York Times', '‘The Office’ Comes to America'],
      ['The Guardian', 'The Office at 20: how the US remake won'],
    ]);
    expect(articles[0]?.authorName).toBe('Alessandra Stanley');
  });

  it('works with just one of the two keys, and is 501 with neither', async () => {
    const { handle } = server({ nytApiKey: undefined });
    const { articles } = (await (await handle(post('/v1/press/search', { title: 'The Office' }))).json()) as { articles: unknown[] };
    expect(articles).toHaveLength(1);
    expect((await createHandler({ allowedOrigins: [EXT], rateLimitPerMinute: 5 })(post('/v1/press/search', { title: 'The Office' }))).status).toBe(501);
  });
});

describe('extension ⇄ backend: insights and press', () => {
  const { handle } = server();
  const bridge = (async (input: RequestInfo | URL, init?: RequestInit) =>
    handle(new Request(String(input), { ...init, headers: { origin: EXT, ...(init?.headers as Record<string, string>) } }))) as typeof fetch;

  it('re-validates what the backend says', () => {
    const v = validateInsights({
      ratings: { imdb: '9.0/10', rottenTomatoes: '<b>81%</b>', tmdb: { score: 99, votes: 3 } },
      reviews: [{ author: 'A', excerpt: 'A long enough review text to keep around.', url: 'https://evil.example/review/abc' }],
      similar: [{ tmdb: { type: 'tv', id: '1' }, title: 'Ok' }, { tmdb: { type: 'book', id: '2' }, title: 'Nope' }],
      availability: { region: 'US', onNetflix: true },
      attribution: ['TMDB', 'Evil'],
      tmdbUrl: 'javascript:alert(1)',
    });
    expect(v).toEqual({ ratings: { imdb: '9.0/10' }, reviews: [], similar: [{ tmdb: { type: 'tv', id: '1' }, title: 'Ok' }], attribution: ['TMDB'] });
  });

  it('About and Watch next get insights for a Wikidata title — with TMDB suggestions mapped back to Wikidata', async () => {
    const wiki = mockFetch((url) => {
      if (url.hostname === 'www.wikidata.org')
        return jsonResponse({
          entities: {
            Q23831: {
              labels: { en: { value: 'The Office' } },
              claims: {
                P31: [{ mainsnak: { datavalue: { value: { id: 'Q5398426' } } } }],
                P345: [{ mainsnak: { datavalue: { value: 'tt0386676' } } }],
                P4983: [{ mainsnak: { datavalue: { value: '2316' } } }],
              },
            },
          },
        });
      if (url.hostname === 'query.wikidata.org') {
        const q = url.searchParams.get('query') ?? '';
        return jsonResponse({ results: { bindings: q.includes('P4983') && q.includes('"8592"') ? [{ item: { value: 'http://www.wikidata.org/entity/Q190386' }, t: { value: '8592' } }] : [] } });
      }
      if (url.hostname === 'api.test') return bridge(url.href, {});
      return undefined;
    });
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => (String(input).startsWith('http://api.test') ? bridge(input, init) : wiki(input, init))) as typeof fetch;
    const services = createServices({ local: new MemoryStore(), session: new MemoryStore(), fetchImpl, backendUrl: 'http://api.test' });
    const insights = await services.titles.insights('Q23831');
    expect(insights?.ratings?.imdb).toBe('9.0/10');
    expect(insights?.similar.find((s) => s.title === 'Parks and Recreation')).toMatchObject({ qid: 'Q190386', onNetflixIndia: true });

    // and without a backend: null, never guesses
    const bare = createServices({ local: new MemoryStore(), session: new MemoryStore(), fetchImpl: wiki });
    expect(await bare.titles.insights('Q23831')).toBeNull();
  });

  it('Read adds NYT / Guardian articles for a title — unless both are hidden', async () => {
    const client = new BackendClient('http://api.test', bridge);
    const found = await client.searchPress('The Office', ['Steve Carell']);
    expect(found.map((c) => [c.provider, c.publicationName])).toEqual([
      ['news', 'The New York Times'],
      ['news', 'The Guardian'],
    ]);

    const feedsOff = mockFetch((url) => (url.hostname.endsWith('substack.com') || url.hostname === 'medium.com' ? new Response('<rss version="2.0"><channel><title>x</title></channel></rss>', { status: 200 }) : undefined));
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => (String(input).startsWith('http://api.test') ? bridge(input, init) : feedsOff(input, init))) as typeof fetch;
    const services = createServices({ local: new MemoryStore(), session: new MemoryStore(), fetchImpl, backendUrl: 'http://api.test' });
    const ctx = buildContext({ platform: 'title', kind: 'show', url: '', title: 'The Office', people: ['Steve Carell'], source: 't', confidence: 'high' });
    const d = await services.substack.discover(ctx);
    expect(d.providers.find((p) => p.id === 'archive')).toMatchObject({ ok: true, count: 2 });
    await services.settings.update({ reading: { sources: { nyt: 'hide', guardian: 'hide' } } });
    const hidden = await services.substack.discover(ctx);
    expect(hidden.providers.some((p) => p.id === 'archive')).toBe(false);
  });
});
