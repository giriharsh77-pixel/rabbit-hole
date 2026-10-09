/**
 * Keyless Medium discovery from Medium's public tag feeds
 * (https://medium.com/feed/tag/<tag>) — a reader-facing RSS interface Medium
 * documents for exactly this.  No scraping, no account, no key.
 *
 * A context becomes a few tag slugs ("The Office" → `the-office`); each tag
 * feed lists recent stories, which then go through the same validation gate
 * and relevance ranker as Substack posts.  Tag feeds are recent-only, so this
 * broadens *what* we cover, not *how far back*.
 */
import { XMLParser } from 'fast-xml-parser';
import type { ContentContext } from '../../types/context';
import type { ArticleCandidate } from '../../types/substack';
import { AppError, toAppError } from '../../utils/errors';
import { httpTextHead } from '../../utils/http';
import { cleanText } from '../../utils/sanitize';
import { contentStems, normalizeText, stripHtml, truncate } from '../../utils/text';
import { CacheService, TTL } from '../cacheService';
import { makeCandidate } from './candidates';

const parser = new XMLParser({
  ignoreAttributes: true,
  textNodeName: '#text',
  isArray: (name) => name === 'item' || name === 'category',
  processEntities: true,
  parseTagValue: false,
  trimValues: true,
});

const text = (v: unknown): string =>
  typeof v === 'string' ? v : v && typeof v === 'object' && '#text' in v ? String((v as { '#text': unknown })['#text']) : '';

/** "The Office" → "the-office"; "AI Agents!" → "ai-agents". Empty when nothing usable remains. */
export function tagSlug(phrase: string): string {
  const slug = normalizeText(phrase.replace(/['’]/g, ''))
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug.length >= 2 && slug.length <= 40 ? slug : '';
}

/** A few Medium tags for a context: the show/film itself, or the video's subject and topics. */
export function mediumTags(ctx: ContentContext, max = 4): string[] {
  const phrases: string[] = [];
  if (ctx.kind === 'movie' || ctx.kind === 'show' || ctx.kind === 'episode') {
    phrases.push(ctx.title);
    const genre = ctx.concepts.find((c) => c.origin === 'genre');
    if (genre) phrases.push(genre.text);
  } else {
    if (ctx.entities[0]) phrases.push(ctx.entities[0]);
    phrases.push(...ctx.topics.slice(0, 3));
    if (ctx.platform === 'manual') phrases.unshift(ctx.title);
  }
  return [...new Set(phrases.map(tagSlug).filter(Boolean))].slice(0, max);
}

/** Medium story URLs end in a hex id ("…/title-words-3f2a9b8c1d4e") or are /p/<id>. */
export function looksLikeMediumStory(url: string): boolean {
  try {
    const u = new URL(url);
    return /-[0-9a-f]{8,16}\/?$/.test(u.pathname) || /^\/p\/[0-9a-f]{8,16}\/?$/.test(u.pathname);
  } catch {
    return false;
  }
}

export function parseMediumFeed(xml: string, opts: { tag: string; now?: number }): ArticleCandidate[] {
  let doc: { rss?: { channel?: Record<string, unknown> } };
  try {
    doc = parser.parse(xml) as typeof doc;
  } catch {
    throw new AppError('INVALID_RESPONSE', 'Feed was not valid XML', { provider: 'medium', retryable: false });
  }
  const channel = doc.rss?.channel;
  if (!channel) throw new AppError('INVALID_RESPONSE', 'Not an RSS feed', { provider: 'medium', retryable: false });

  const out: ArticleCandidate[] = [];
  for (const raw of (channel.item as unknown[] | undefined) ?? []) {
    const it = raw as Record<string, unknown>;
    const link = (text(it.link) || text(it.guid)).split('?')[0] ?? '';
    if (!looksLikeMediumStory(link)) continue;
    let host = '';
    try {
      host = new URL(link).hostname.toLowerCase();
    } catch {
      continue;
    }
    const body = stripHtml(text(it['content:encoded']) || text(it.description));
    const tags = ((it.category as unknown[] | undefined) ?? []).map((c) => cleanText(text(c), 40)).filter(Boolean).slice(0, 8);
    const candidate = makeCandidate(
      {
        url: link,
        title: text(it.title),
        excerpt: truncate(body, 300),
        // Stories on medium.com (and *.medium.com publications) are "Medium"; custom domains name themselves.
        publicationName: host === 'medium.com' || host.endsWith('.medium.com') ? 'Medium' : undefined,
        authorName: text(it['dc:creator']),
        publishedAt: text(it.pubDate),
        source: 'feed',
        provider: 'medium',
        matchedQueries: [opts.tag],
        ...(tags.length ? { tags } : {}),
        publicationTier: 1,
      },
      // the link came from Medium's own feed, so its host (medium.com or a Medium custom domain) is trusted
      { allowedHosts: [host], ...(opts.now ? { now: opts.now } : {}) },
    );
    if (candidate) out.push(candidate);
  }
  return out;
}

export interface MediumProviderDeps {
  cache: CacheService;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

/** Stories read per tag feed (Medium serves ~10). */
const FEED_ITEMS = 10;

export class MediumProvider {
  readonly id = 'medium' as const;
  constructor(private readonly deps: MediumProviderDeps) {}

  private async loadTag(tag: string, signal?: AbortSignal): Promise<ArticleCandidate[]> {
    const { cache, fetchImpl, now } = this.deps;
    const result = await cache.getOrFetch<ArticleCandidate[]>(
      `medium:tag:${tag}`,
      TTL.substackFeed,
      async (s) => {
        try {
          const xml = await httpTextHead(
            `https://medium.com/feed/tag/${tag}`,
            {
              provider: 'medium',
              signal: s,
              timeoutMs: 9000,
              maxBytes: 3 * 1024 * 1024,
              headers: { accept: 'application/rss+xml, application/xml;q=0.9, */*;q=0.5' },
              ...(fetchImpl ? { fetchImpl } : {}),
            },
            { marker: '</item>', count: FEED_ITEMS, closing: '</channel></rss>' },
          );
          return parseMediumFeed(xml, { tag, ...(now ? { now: now() } : {}) });
        } catch (err) {
          // an unknown tag is simply "no stories", not a failure
          if (err instanceof AppError && err.status === 404) return [];
          throw err;
        }
      },
      { ...(signal ? { signal } : {}), allowStale: true },
    );
    return result.value;
  }

  async search(context: ContentContext, signal?: AbortSignal): Promise<ArticleCandidate[]> {
    const tags = mediumTags(context);
    if (tags.length === 0) return [];
    const settled = await Promise.allSettled(tags.map((t) => this.loadTag(t, signal)));
    const items = settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
    if (settled.every((r) => r.status === 'rejected')) {
      const failure = settled.find((r): r is PromiseRejectedResult => r.status === 'rejected');
      throw toAppError(failure?.reason, 'medium');
    }
    // the same cheap pre-filter as the Substack feeds: share at least one meaningful stem with the content
    const wanted = new Set(
      context.concepts
        .filter((c) => c.weight >= 0.3)
        .flatMap((c) => contentStems(c.text))
        .filter((s) => s.length > 2),
    );
    for (const s of contentStems(context.title)) if (s.length > 2) wanted.add(s);
    return items.filter((c) => contentStems(`${c.title} ${c.excerpt} ${(c.tags ?? []).join(' ')}`).some((s) => wanted.has(s)));
  }
}
