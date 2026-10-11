/**
 * UI-only preview harness (`npm run dev:ui`).  NOT part of the extension build.
 *
 * Runs the real background services *inside the page* behind an in-memory RPC
 * port, with a mocked `fetch` that serves fixtures:
 *   • Reddit  — real titles/links from a captured public Atom feed, with
 *               SYNTHETIC scores/comment counts (clearly preview data)
 *   • Substack — real RSS captured from public feeds on 2026-10-07
 *   • Wikidata — the real, keyless service (title search, cast, links)
 *   • ?backend=demo — the real backend handler, in-page, over SAMPLE TMDB / OMDb /
 *     NYT / Guardian responses (labelled as samples; numbers are made up)
 * and a fake "current tab" chosen with  ?demo=netflix|office|movie|idle|undetected
 */
import { createServices } from '../background/container';
import { createHandlers } from '../background/handlers';
import type { TabAdapter } from '../background/tabs';
import { MemoryStore, type KeyValueStore } from '../services/cacheService';
import { parseAtom } from '../services/reddit/parse';
import { RPC_PORT_NAME } from '../types/messages';
import type { RawPageMetadata } from '../types/context';
import type { RedditPost } from '../types/reddit';
import { attachRpcPort, type RpcClientPort, type RpcServerPort } from '../utils/rpc';
import { docsRedditPosts } from './docsSample';
import { createHandler } from '../../server/src/handler';
import redditHotAtom from './fixtures/reddit-hot.atom.xml?raw';

const feedFixtures = import.meta.glob('./fixtures/feeds/*.xml', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/** localStorage-backed store so Settings survive reloads while previewing. */
class LocalStorageStore implements KeyValueStore {
  constructor(private readonly prefix: string) {}
  async getMany(keys: string[]): Promise<Record<string, unknown>> {
    const out: Record<string, unknown> = {};
    for (const k of keys) {
      const raw = localStorage.getItem(this.prefix + k);
      if (raw !== null) out[k] = JSON.parse(raw);
    }
    return out;
  }
  async setMany(items: Record<string, unknown>): Promise<void> {
    for (const [k, v] of Object.entries(items)) localStorage.setItem(this.prefix + k, JSON.stringify(v));
  }
  async removeMany(keys: string[]): Promise<void> {
    for (const k of keys) localStorage.removeItem(this.prefix + k);
  }
  async clearAll(): Promise<void> {
    for (const k of Object.keys(localStorage)) if (k.startsWith(this.prefix)) localStorage.removeItem(k);
  }
}

// ─── mocked network ──────────────────────────────────────────────────────────

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

function redditJson(posts: RedditPost[], feed: string): unknown {
  return {
    kind: 'Listing',
    data: {
      children: posts.map((p, i) => {
        const r = hash(p.id);
        const base = 52000 * 0.84 ** i * (0.65 + r * 0.7);
        const score = Math.round(feed === 'rising' ? base * 0.18 : base);
        return {
          kind: 't3',
          data: {
            id: p.id,
            title: p.title,
            subreddit: p.subreddit,
            author: p.author ?? 'someone',
            permalink: new URL(p.permalink).pathname,
            url: p.url ?? p.permalink,
            domain: p.domain ?? `self.${p.subreddit}`,
            selftext: p.isSelf ? p.preview : '',
            is_self: p.isSelf,
            thumbnail: p.thumbnail ?? 'self',
            score,
            num_comments: Math.round(score * (0.03 + r * 0.09)),
            upvote_ratio: 0.8 + r * 0.19,
            num_crossposts: r > 0.8 ? 2 : 0,
            created_utc: p.createdUtc,
            over_18: false,
            stickied: false,
            link_flair_text: null,
          },
        };
      }),
    },
  };
}

const capturedPosts = parseAtom(redditHotAtom, 'hot');
/** `?data=docs` swaps in neutral, invented sample threads for documentation screenshots. */
const redditPosts = new URLSearchParams(location.search).get('data') === 'docs' ? docsRedditPosts() : capturedPosts;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** `?slow=2500` delays every mocked response, to capture loading states. */
const slowMs = Number(new URLSearchParams(location.search).get('slow') ?? 0) || 0;

function previewFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = routeFetch(input, init);
  return slowMs ? res.then((r) => new Promise<Response>((resolve) => setTimeout(() => resolve(r), slowMs))) : res;
}

// ─── ?backend=demo: the real handler over sample upstream data ──────────────

const DEMO_BACKEND = 'https://backend.preview';
const sampleUpstream = (async (input: RequestInfo | URL) => {
  const url = new URL(String(input));
  const id = url.pathname.match(/\/(movie|tv)\/(\d+)/);
  if (url.hostname === 'api.themoviedb.org' && url.pathname.endsWith('/watch/providers')) {
    const on = Number(id?.[2] ?? 0) % 2 === 0;
    return json({ results: { IN: on ? { flatrate: [{ provider_id: 8, provider_name: 'Netflix' }] } : {} } });
  }
  if (url.hostname === 'api.themoviedb.org' && url.pathname.startsWith('/3/find/')) return json({ tv_results: [], movie_results: [] });
  if (url.hostname === 'api.themoviedb.org' && id) {
    const tv = id[1] === 'tv';
    const pick = (tmdb: number, title: string, y: string) => ({ id: tmdb, [tv ? 'name' : 'title']: title, [tv ? 'first_air_date' : 'release_date']: `${y}-01-01`, overview: 'Sample overview (preview data).' });
    return json({
      vote_average: 8.1,
      vote_count: 1234,
      reviews: {
        results: [
          { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', author: 'Sample reviewer', author_details: { rating: 8 }, content: 'Preview sample review — in the real extension this is a TMDB user review, trimmed to a few lines, with a link to read it in full.', created_at: '2026-01-15T10:00:00Z' },
          { id: 'bbbbbbbbbbbbbbbbbbbbbbbb', author: 'Another sample', content: 'A second preview sample review. Reviews come from TMDB through the backend; nothing here is written by Rabbit Hole.', created_at: '2025-06-02T10:00:00Z' },
        ],
      },
      recommendations: { results: tv ? [pick(8592, 'Parks and Recreation', '2009'), pick(48891, 'Brooklyn Nine-Nine', '2013'), pick(18347, 'Community', '2009')] : [pick(546554, 'Knives Out', '2019'), pick(1124, 'The Prestige', '2006')] },
      similar: { results: tv ? [pick(4589, 'Arrested Development', '2003'), pick(62649, 'Superstore', '2015')] : [pick(10528, 'Sherlock Holmes', '2009')] },
      'watch/providers': { results: { IN: { link: `https://www.themoviedb.org/${id[1]}/${id[2]}/watch?locale=IN`, flatrate: [{ provider_id: 8, provider_name: 'Netflix' }] } } },
    });
  }
  if (url.hostname === 'www.omdbapi.com') return json({ Response: 'True', imdbRating: '8.0', imdbVotes: '100,000', Ratings: [{ Source: 'Rotten Tomatoes', Value: '80%' }, { Source: 'Metacritic', Value: '70/100' }] });
  return new Response('not mocked', { status: 404 });
}) as typeof fetch;
const demoBackend = createHandler({ tmdbApiKey: 'preview', omdbApiKey: 'preview', allowedOrigins: [], rateLimitPerMinute: 1000, fetch: sampleUpstream });

function routeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  const params = new URLSearchParams(location.search);

  if (url.origin === DEMO_BACKEND) return demoBackend(new Request(url, init));

  // Wikidata is public, keyless and CORS-enabled: the preview uses the real thing.
  if (url.hostname === 'www.wikidata.org' || url.hostname === 'query.wikidata.org') return fetch(url, init);

  if (url.hostname === 'www.reddit.com' && params.get('fail') === 'reddit') {
    return Promise.resolve(new Response('blocked', { status: 403 }));
  }
  if (url.hostname === 'www.reddit.com' && url.pathname.endsWith('.json')) {
    if (url.pathname.includes('/search')) {
      const q = (url.searchParams.get('q') ?? '').toLowerCase().replace(/["']/g, '');
      const words = q.split(/\s+/).filter((w) => w.length > 2);
      const hits = redditPosts.filter((p) => words.some((w) => p.title.toLowerCase().includes(w)));
      return Promise.resolve(json(redditJson((hits.length ? hits : redditPosts.slice(3, 6)).slice(0, 10), 'search')));
    }
    const feed = url.pathname.split('/').pop()?.replace('.json', '') ?? 'hot';
    const list = feed === 'rising' ? [...redditPosts].reverse().slice(0, 25) : feed === 'top' ? redditPosts.slice(0, 20) : redditPosts;
    return Promise.resolve(json(redditJson(list, feed)));
  }
  if (url.hostname === 'www.reddit.com' && url.pathname.includes('.rss')) {
    return Promise.resolve(new Response(redditHotAtom, { status: 200, headers: { 'content-type': 'application/atom+xml' } }));
  }

  const feed = url.hostname.match(/^([a-z0-9-]+)\.substack\.com$/)?.[1];
  if (feed && url.pathname === '/feed') {
    const xml = feedFixtures[`./fixtures/feeds/${feed}.xml`];
    return Promise.resolve(xml ? new Response(xml, { status: 200, headers: { 'content-type': 'application/xml' } }) : new Response('not found', { status: 404 }));
  }
  // Medium tag feeds: a fictional sample story per tag (preview only — clearly labelled sample content)
  const tag = url.hostname === 'medium.com' ? url.pathname.match(/^\/feed\/tag\/([a-z0-9-]+)$/)?.[1] : undefined;
  if (tag) {
    const words = tag.replace(/-/g, ' ');
    const title = `Sample Medium story: what everyone misses about ${words}`;
    const id = (hash(tag) * 0xffffffffffff).toString(16).padStart(12, '0').slice(0, 12);
    const xml = `<?xml version="1.0"?><rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>${words} on Medium</title><item><title>${title}</title><link>https://medium.com/@sample-writer/sample-${tag}-${id}?source=rss</link><dc:creator>Sample Writer</dc:creator><category>${tag}</category><pubDate>${new Date(Date.now() - 3 * 86_400_000).toUTCString()}</pubDate><content:encoded><![CDATA[<p>Preview sample text. A close look at ${words}: what makes it work, what people overlook, and why it keeps coming up.</p>]]></content:encoded></item></channel></rss>`;
    return Promise.resolve(new Response(xml, { status: 200, headers: { 'content-type': 'application/rss+xml' } }));
  }
  return Promise.resolve(new Response('not mocked in preview', { status: 404 }));
}

// ─── fake current tab ────────────────────────────────────────────────────────

const DEMOS: Record<string, { url: string; raw: RawPageMetadata | null }> = {
  netflix: {
    url: 'https://www.netflix.com/watch/80000000',
    raw: {
      platform: 'netflix',
      kind: 'episode',
      url: 'https://www.netflix.com/watch/80000000',
      title: 'Black Mirror',
      episode: 'Season 7, Episode 2 — Common People',
      season: 7,
      episodeNumber: 2,
      genres: ['Sci-Fi', 'Dystopian', 'Anthology'],
      people: ['Charlie Brooker'],
      description: 'This anthology series explores a twisted, high-tech multiverse where humanity’s greatest innovations and darkest instincts collide.',
      source: 'player title label + Netflix title page',
      confidence: 'high',
    },
  },
  office: {
    url: 'https://www.netflix.com/watch/80000002',
    raw: {
      platform: 'netflix',
      kind: 'episode',
      url: 'https://www.netflix.com/watch/80000002',
      title: 'The Office (U.S.)',
      episode: 'Season 1, Episode 5 — Basketball',
      season: 1,
      episodeNumber: 5,
      genres: ['Sitcom', 'Comedy'],
      people: ['Steve Carell', 'Rainn Wilson', 'John Krasinski', 'Jenna Fischer'],
      description: 'A mockumentary on a group of typical office workers, where the workday consists of ego clashes and inappropriate behavior.',
      source: 'player title label + Netflix title page',
      confidence: 'high',
    },
  },
  movie: {
    url: 'https://www.netflix.com/watch/80000003',
    raw: {
      platform: 'netflix',
      kind: 'movie',
      url: 'https://www.netflix.com/watch/80000003',
      title: 'Glass Onion: A Knives Out Mystery',
      genres: ['Mystery', 'Comedy'],
      people: ['Daniel Craig', 'Edward Norton', 'Janelle Monáe'],
      description: 'Famed detective Benoit Blanc heads to Greece to peel back the layers of a mystery surrounding a tech billionaire and his eclectic crew of friends.',
      source: 'player title label + Netflix title page',
      confidence: 'high',
    },
  },
  idle: { url: 'https://example.com/article', raw: null },
  undetected: { url: 'https://www.netflix.com/watch/80000001', raw: null },
};

function demoTabs(demo: string): TabAdapter {
  const d = DEMOS[demo] ?? DEMOS.idle!;
  return {
    resolve: async () => ({ id: 1, url: d.url, title: 'Preview' }),
    extract: async () => d.raw,
  };
}

// ─── in-memory port pair ─────────────────────────────────────────────────────

export async function createPreviewConnect(): Promise<() => RpcClientPort> {
  const demo = new URLSearchParams(location.search).get('demo') ?? 'idle';
  const local = new LocalStorageStore('rh-preview:');
  const services = createServices({
    local,
    session: new MemoryStore(),
    fetchImpl: previewFetch as typeof fetch,
    hasOrigin: async () => false,
    ...(new URLSearchParams(location.search).get('backend') === 'demo' ? { backendUrl: DEMO_BACKEND } : {}),
  });
  const { handlers } = createHandlers({ services, tabs: demoTabs(demo) });
  const allowedOrigin = location.origin + '/';

  return () => {
    const toClient: ((m: unknown) => void)[] = [];
    const toServer: ((m: unknown) => void)[] = [];
    const serverDisc: (() => void)[] = [];
    const serverPort: RpcServerPort = {
      name: RPC_PORT_NAME,
      sender: { url: allowedOrigin },
      postMessage: (m) => queueMicrotask(() => toClient.forEach((cb) => cb(m))),
      onMessage: { addListener: (cb) => void toServer.push(cb) },
      onDisconnect: { addListener: (cb) => void serverDisc.push(cb) },
    };
    attachRpcPort(serverPort, {
      handlers: handlers as unknown as Record<string, (p: unknown, c: { signal: AbortSignal }) => Promise<unknown>>,
      allowedOrigin,
    });
    return {
      postMessage: (m) => queueMicrotask(() => toServer.forEach((cb) => cb(m))),
      onMessage: { addListener: (cb) => void toClient.push(cb) },
      onDisconnect: { addListener: () => undefined },
      disconnect: () => serverDisc.forEach((cb) => cb()),
    };
  };
}
