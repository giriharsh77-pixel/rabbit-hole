/**
 * Keyless Substack discovery from public RSS feeds.
 *
 * With no search API configured we can't search *all* of Substack, so we do the
 * next most honest thing: pick the publications from a curated, health-checked
 * directory (seeds.json) whose topics overlap the content, read their public
 * RSS feeds, and let the relevance ranker choose the best posts.  Coverage is
 * limited by design and the UI says so.
 */
import type { ContentContext } from '../../types/context';
import type { ArticleCandidate } from '../../types/substack';
import type { Settings } from '../../types/settings';
import { AppError, toAppError } from '../../utils/errors';
import { httpTextHead } from '../../utils/http';
import { sanitizePublicationSlug } from '../../utils/sanitize';
import { contentStems, phraseKey } from '../../utils/text';
import { CacheService, TTL } from '../cacheService';
import { parseRssFeed } from './rss';
import { isCustomDomain, originPattern, SEEDS, type SeedPublication } from './seeds';

export { isCustomDomain, originPattern, SEEDS, type SeedPublication };

export interface SelectedPublication extends SeedPublication {
  score: number;
}

/** Tag/concept overlap, weighted by concept strength, with a small editorial-tier tiebreak. */
export function selectPublications(
  context: Pick<ContentContext, 'concepts' | 'entities'>,
  opts: { max: number; includeCustomDomains: boolean; seeds?: readonly SeedPublication[] },
): SelectedPublication[] {
  const concepts = [...context.concepts].sort((a, b) => b.weight - a.weight).slice(0, 14);
  const conceptKeys = concepts.map((c) => ({ key: phraseKey(c.text), weight: c.weight }));
  const scored: SelectedPublication[] = [];
  for (const seed of opts.seeds ?? SEEDS) {
    if (!opts.includeCustomDomains && isCustomDomain(seed.feedUrl)) continue;
    const tagKeys = seed.tags.map(phraseKey);
    let score = 0;
    for (const { key, weight } of conceptKeys) {
      if (!key) continue;
      const hit = tagKeys.some((t) => t === key || ` ${key} `.includes(` ${t} `) || ` ${t} `.includes(` ${key} `));
      if (hit) score += weight;
    }
    if (score > 0) scored.push({ ...seed, score: score + 0.12 * seed.tier });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, opts.max);
}

export interface FeedProviderDeps {
  cache: CacheService;
  getSettings: () => Promise<Settings>;
  /** Whether the optional host permission for an origin pattern has been granted. */
  hasOrigin: (pattern: string) => Promise<boolean>;
  fetchImpl?: typeof fetch;
  now?: () => number;
  maxFeeds?: number;
}

/** Newest posts read per feed. */
const FEED_ITEMS = 12;

export class FeedProvider {
  readonly id = 'feeds' as const;
  constructor(private readonly deps: FeedProviderDeps) {}

  private async loadFeed(pub: SeedPublication, signal?: AbortSignal): Promise<ArticleCandidate[]> {
    const { cache, now, fetchImpl } = this.deps;
    const result = await cache.getOrFetch<ArticleCandidate[]>(
      `substack:feed:${pub.id}`,
      TTL.substackFeed,
      async (s) => {
        // Only the newest posts matter, and feeds embed full article bodies (often MBs):
        // read until we have FEED_ITEMS items, then drop the connection.
        const xml = await httpTextHead(
          pub.feedUrl,
          {
            provider: 'substack:feed',
            signal: s,
            timeoutMs: 9000,
            maxBytes: 4 * 1024 * 1024,
            headers: { accept: 'application/rss+xml, application/xml;q=0.9, */*;q=0.5' },
            ...(fetchImpl ? { fetchImpl } : {}),
          },
          { marker: '</item>', count: FEED_ITEMS, closing: '</channel></rss>' },
        );
        return parseRssFeed(xml, {
          feedUrl: pub.feedUrl,
          name: pub.name,
          tags: pub.tags,
          tier: pub.tier,
          ...(now ? { now: now() } : {}),
        }).items;
      },
      { ...(signal ? { signal } : {}), allowStale: true },
    );
    return result.value;
  }

  /** Publications that would be searched, minus those whose optional permission is missing. */
  async plan(context: ContentContext): Promise<SeedPublication[]> {
    const settings = await this.deps.getSettings();
    const picked = selectPublications(context, {
      max: this.deps.maxFeeds ?? 8,
      includeCustomDomains: settings.reading.includeCustomDomains,
    });
    const allowed: SeedPublication[] = [];
    for (const pub of picked) {
      if (isCustomDomain(pub.feedUrl) && !(await this.deps.hasOrigin(originPattern(pub.feedUrl)))) continue;
      allowed.push(pub);
    }
    // user-added publications (native substack.com feeds) are always searched
    for (const raw of settings.reading.extraPublications.slice(0, 4)) {
      const slug = sanitizePublicationSlug(raw);
      if (slug && !allowed.some((p) => p.id === slug)) {
        allowed.unshift({
          id: slug,
          name: slug,
          feedUrl: `https://${slug}.substack.com/feed`,
          homeUrl: `https://${slug}.substack.com`,
          tier: 2,
          tags: [],
        });
      }
    }
    return allowed;
  }

  async search(context: ContentContext, signal?: AbortSignal): Promise<ArticleCandidate[]> {
    const plan = await this.plan(context);
    if (plan.length === 0) return [];

    const settled = await Promise.allSettled(plan.map((pub) => this.loadFeed(pub, signal)));
    const items = settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));

    if (items.length === 0) {
      const failure = settled.find((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (failure) throw toAppError(failure.reason, 'substack:feed');
      return [];
    }
    if (settled.every((r) => r.status === 'rejected')) {
      throw new AppError('UNAVAILABLE', 'No publication feed could be read', { provider: 'substack:feed' });
    }

    // cheap pre-filter: the post must share at least one meaningful stem with the content
    const wanted = new Set(
      context.concepts
        .filter((c) => c.weight >= 0.3)
        .flatMap((c) => contentStems(c.text))
        .filter((s) => s.length > 2),
    );
    return items.filter((c) => contentStems(`${c.title} ${c.excerpt}`).some((s) => wanted.has(s)));
  }
}
