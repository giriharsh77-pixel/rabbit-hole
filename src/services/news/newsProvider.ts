/**
 * News coverage of a movie or show, from publishers' own RSS feeds (see
 * outlets.ts).  Per-title topic feeds are about the title by definition;
 * articles from general entertainment feeds are kept only when they clearly
 * name it — in quotes (‘The Office’), as a capitalised name, or next to one of
 * its cast.
 */
import { XMLParser } from 'fast-xml-parser';
import type { ContentContext } from '../../types/context';
import type { Settings } from '../../types/settings';
import type { ArticleCandidate } from '../../types/substack';
import { AppError, toAppError } from '../../utils/errors';
import { httpTextHead } from '../../utils/http';
import { normalizeText, stripHtml, truncate } from '../../utils/text';
import { CacheService, TTL } from '../cacheService';
import { searchName } from '../reddit/aboutTitle';
import { namesTitle } from './match';
import { makeCandidate } from '../substack/candidates';
import { OUTLETS, outletOrigins, topicSlug, type NewsOutlet } from './outlets';

export { namesTitle };

const parser = new XMLParser({
  ignoreAttributes: true,
  textNodeName: '#text',
  isArray: (name) => name === 'item',
  processEntities: true,
  parseTagValue: false,
  trimValues: true,
});

const text = (v: unknown): string => {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && '#text' in v) return String((v as { '#text': unknown })['#text']);
  return '';
};

export function parseNewsFeed(xml: string, outlet: NewsOutlet, opts: { now?: number; topic?: boolean } = {}): ArticleCandidate[] {
  let doc: { rss?: { channel?: Record<string, unknown> } };
  try {
    doc = parser.parse(xml) as typeof doc;
  } catch {
    throw new AppError('INVALID_RESPONSE', 'Feed was not valid XML', { provider: `news:${outlet.id}`, retryable: false });
  }
  const channel = doc.rss?.channel;
  if (!channel) throw new AppError('INVALID_RESPONSE', 'Not an RSS feed', { provider: `news:${outlet.id}`, retryable: false });
  const out: ArticleCandidate[] = [];
  for (const raw of (channel.item as unknown[] | undefined) ?? []) {
    const it = raw as Record<string, unknown>;
    const candidate = makeCandidate(
      {
        url: (text(it.link) || text(it.guid)).trim(),
        title: stripHtml(text(it.title)),
        excerpt: truncate(stripHtml(text(it.description)), 300),
        publicationName: outlet.name,
        authorName: text(it['dc:creator']) || text(it.author),
        publishedAt: text(it.pubDate) || text(it['dc:date']),
        source: 'feed',
        provider: 'news',
        publicationTier: outlet.tier,
        tags: opts.topic ? ['topic-feed'] : [],
      },
      // links must stay on the publisher's own site
      { allowedHosts: outlet.hosts, ...(opts.now !== undefined ? { now: opts.now } : {}) },
    );
    if (candidate) out.push(candidate);
  }
  return out;
}

export interface NewsProviderDeps {
  cache: CacheService;
  getSettings: () => Promise<Settings>;
  hasOrigin: (pattern: string) => Promise<boolean>;
  fetchImpl?: typeof fetch;
  now?: () => number;
  outlets?: readonly NewsOutlet[];
}

/** Section feeds carry a lot; the newest 40 cover the past few days at most outlets. */
const SECTION_ITEMS = 40;
const TOPIC_ITEMS = 15;

export class NewsProvider {
  readonly id = 'news' as const;
  constructor(private readonly deps: NewsProviderDeps) {}

  /** Outlets the user hasn't hidden and whose sites they've allowed. */
  async outlets(settings?: Settings): Promise<NewsOutlet[]> {
    const s = settings ?? (await this.deps.getSettings());
    if (!s.reading.includeNews) return [];
    const out: NewsOutlet[] = [];
    for (const o of this.deps.outlets ?? OUTLETS) {
      if (s.reading.sources[o.id] === 'hide') continue;
      const origins = outletOrigins([o]);
      const granted = await Promise.all(origins.map((p) => this.deps.hasOrigin(p)));
      if (granted.every(Boolean)) out.push(o);
    }
    return out;
  }

  private async load(url: string, outlet: NewsOutlet, topic: boolean, signal?: AbortSignal): Promise<ArticleCandidate[]> {
    const { cache, fetchImpl, now } = this.deps;
    const result = await cache.getOrFetch<ArticleCandidate[]>(
      `news:feed:${url}`,
      TTL.substackFeed,
      async (s) => {
        try {
          const xml = await httpTextHead(
            url,
            {
              provider: `news:${outlet.id}`,
              signal: s,
              timeoutMs: 9000,
              maxBytes: 4 * 1024 * 1024,
              headers: { accept: 'application/rss+xml, application/xml;q=0.9, */*;q=0.5' },
              ...(fetchImpl ? { fetchImpl } : {}),
            },
            { marker: '</item>', count: topic ? TOPIC_ITEMS : SECTION_ITEMS, closing: '</channel></rss>' },
          );
          return parseNewsFeed(xml, outlet, { topic, ...(now ? { now: now() } : {}) });
        } catch (err) {
          // a title the site has no topic page for is "no stories", not a failure
          if (topic && err instanceof AppError && (err.status === 404 || err.code === 'INVALID_RESPONSE')) return [];
          throw err;
        }
      },
      { ...(signal ? { signal } : {}), allowStale: true },
    );
    return result.value;
  }

  async search(context: ContentContext, signal?: AbortSignal): Promise<ArticleCandidate[]> {
    // News is about a named title (or what the user typed) — not about a Reddit headline.
    if (context.platform === 'reddit' || context.platform === 'substack') return [];
    const outlets = await this.outlets();
    if (outlets.length === 0) return [];

    const name = searchName(context.title);
    const slug = topicSlug(name);
    const kind = context.kind === 'movie' ? 'movie' : 'series';
    const jobs: { url: string; outlet: NewsOutlet; topic: boolean }[] = [];
    for (const o of outlets) {
      const template = context.platform !== 'manual' ? o.topic?.[kind] : undefined;
      if (template && slug) jobs.push({ url: template.replace('{slug}', slug), outlet: o, topic: true });
      for (const url of o.feeds) jobs.push({ url, outlet: o, topic: false });
    }

    const settled = await Promise.allSettled(jobs.map((j) => this.load(j.url, j.outlet, j.topic, signal)));
    if (settled.every((r) => r.status === 'rejected')) {
      throw toAppError((settled[0] as PromiseRejectedResult).reason, 'news');
    }
    const people = context.entities.filter((e) => normalizeText(e) !== normalizeText(name));
    const out = new Map<string, ArticleCandidate>();
    settled.forEach((r, i) => {
      if (r.status !== 'fulfilled') return;
      const topic = jobs[i]?.topic ?? false;
      for (const c of r.value) {
        // topic pages are about the title already; general feeds must name it
        if (!out.has(c.id) && (topic || namesTitle(name, people, c))) out.set(c.id, { ...c, matchedQueries: [name] });
      }
    });
    return [...out.values()];
  }
}
