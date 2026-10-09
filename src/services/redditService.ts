/**
 * redditService — discovery of what Reddit is talking about *right now*.
 *
 *   providers (OAuth → public JSON → Atom feed)  — graceful degradation
 *   → merge + filter → snapshot deltas → rank → four categories
 *
 * Failure handling: a provider that is blocked or rate-limited is skipped for
 * a cool-down period (circuit breaker) so we never hammer Reddit; if every
 * provider fails the last good data is served as stale, otherwise a typed
 * AppError reaches the UI.
 */
import type {
  RedditFetchMeta,
  RedditPost,
  RedditProviderId,
  RedditSearchResponse,
  TrendingResponse,
} from '../types/reddit';
import type { Settings } from '../types/settings';
import { AppError, toAppError } from '../utils/errors';
import { clamp } from '../utils/format';
import { hashString, phraseKey, uniqueBy } from '../utils/text';
import { CacheService, TTL } from './cacheService';
import { mergePosts, rankReddit, scorePosts, type PostDelta } from './ranking/reddit';
import { JsonProvider, OAuthProvider, RssProvider, type ListingRequest, type RedditProvider } from './reddit/providers';
import type { SnapshotStore } from './reddit/snapshots';
import { subredditsFor } from './reddit/topics';

export interface RedditServiceDeps {
  cache: CacheService;
  snapshots: SnapshotStore;
  getSettings: () => Promise<Settings>;
  /** Public Reddit installed-app client id, if configured. */
  getClientId: () => Promise<string | undefined>;
  now?: () => number;
  fetchImpl?: typeof fetch;
}

interface CachedTrending {
  posts: RedditPost[];
  deltas: Record<string, PostDelta>;
  meta: RedditFetchMeta;
}

interface BreakerEntry {
  until: number;
  error: AppError;
}

const COOLDOWN_MS = {
  rateLimited: 2 * 60_000,
  blocked: 15 * 60_000,
  broken: 60_000,
};

export class RedditService {
  private readonly breaker = new Map<RedditProviderId, BreakerEntry>();
  private oauth: { clientId: string; provider: OAuthProvider } | undefined;
  private readonly now: () => number;

  constructor(private readonly deps: RedditServiceDeps) {
    this.now = deps.now ?? Date.now;
  }

  // ─── provider chain ───────────────────────────────────────────────────────

  async providers(settings?: Settings): Promise<RedditProvider[]> {
    const s = settings ?? (await this.deps.getSettings());
    const opts = {
      useBrowserSession: s.reddit.useBrowserSession,
      ...(this.deps.fetchImpl ? { fetchImpl: this.deps.fetchImpl } : {}),
    };
    const chain: RedditProvider[] = [];
    const clientId = await this.deps.getClientId();
    if (clientId) {
      if (this.oauth?.clientId !== clientId) {
        this.oauth = { clientId, provider: new OAuthProvider(clientId, { ...opts, now: this.now }) };
      }
      chain.push(this.oauth.provider);
    }
    chain.push(new JsonProvider(opts), new RssProvider(opts));
    return chain;
  }

  private trip(id: RedditProviderId, error: AppError): void {
    const ms =
      error.code === 'RATE_LIMITED'
        ? Math.max(COOLDOWN_MS.rateLimited, error.retryAfterMs ?? 0)
        : error.code === 'BLOCKED' || error.code === 'UNAUTHORIZED'
          ? COOLDOWN_MS.blocked
          : COOLDOWN_MS.broken;
    this.breaker.set(id, { until: this.now() + Math.min(ms, 30 * 60_000), error });
  }

  /** Providers currently cooling down, for diagnostics/UI. */
  coolingDown(): RedditProviderId[] {
    const now = this.now();
    return [...this.breaker.entries()].filter(([, v]) => v.until > now).map(([k]) => k);
  }

  resetBreakers(): void {
    this.breaker.clear();
  }

  private async runChain<T>(
    providers: RedditProvider[],
    op: (p: RedditProvider) => Promise<T>,
  ): Promise<{ value: T; provider: RedditProvider; degradedFrom: NonNullable<RedditFetchMeta['degradedFrom']> }> {
    const degradedFrom: NonNullable<RedditFetchMeta['degradedFrom']> = [];
    let firstError: AppError | undefined;
    const now = this.now();

    for (const provider of providers) {
      const open = this.breaker.get(provider.id);
      if (open && open.until > now) {
        degradedFrom.push({ provider: provider.id, code: open.error.code });
        firstError ??= open.error;
        continue;
      }
      try {
        const value = await op(provider);
        this.breaker.delete(provider.id);
        return { value, provider, degradedFrom };
      } catch (err) {
        const appErr = toAppError(err, `reddit:${provider.id}`);
        if (appErr.code === 'ABORTED') throw appErr;
        // Offline: every provider would fail the same way, so don't burn through them.
        if (appErr.code === 'NETWORK') throw appErr;
        if (appErr.code !== 'TIMEOUT') this.trip(provider.id, appErr);
        degradedFrom.push({ provider: provider.id, code: appErr.code });
        firstError ??= appErr;
      }
    }
    throw firstError ?? new AppError('UNAVAILABLE', 'No Reddit provider is available', { provider: 'reddit' });
  }

  // ─── trending ─────────────────────────────────────────────────────────────

  private trendingKey(settings: Settings, topicId: string, subs: string[]): string {
    return `reddit:trending:${topicId}:${hashString(subs.join(','))}:${settings.reddit.postCount}:${settings.reddit.includeNsfw ? 1 : 0}`;
  }

  private respond(
    cached: CachedTrending,
    topicId: string,
    settings: Settings,
    stale: boolean,
  ): TrendingResponse {
    const categories = rankReddit(
      cached.posts,
      { now: this.now(), deltas: cached.deltas, preferredSubreddits: settings.reddit.preferredSubreddits },
      settings.reddit.postCount,
    );
    return { categories, meta: cached.meta, topicId, ...(stale ? { stale: true } : {}) };
  }

  /**
   * @param cacheOnly return whatever is cached (even stale) or null — lets the
   *                  popup paint instantly, then refresh.
   */
  async getTrending(opts: {
    topicId: string;
    refresh?: boolean;
    cacheOnly?: boolean;
    signal?: AbortSignal;
  }): Promise<TrendingResponse | null> {
    const settings = await this.deps.getSettings();
    const subs = subredditsFor(opts.topicId, settings.reddit.preferredSubreddits);
    if (opts.topicId === 'custom' && subs.length === 0) {
      throw new AppError('NOT_CONFIGURED', 'Add subreddits in Settings to use the Custom filter', { retryable: false });
    }
    const key = this.trendingKey(settings, opts.topicId, subs);

    if (opts.cacheOnly) {
      const hit = await this.deps.cache.peek<CachedTrending>(key);
      return hit ? this.respond(hit.value, opts.topicId, settings, !hit.fresh) : null;
    }

    const result = await this.deps.cache.getOrFetch<CachedTrending>(
      key,
      TTL.redditTrending,
      (signal) => this.fetchTrending(subs, opts.topicId, settings, signal),
      { ...(opts.refresh !== undefined ? { force: opts.refresh } : {}), ...(opts.signal ? { signal: opts.signal } : {}), allowStale: true },
    );
    return this.respond(result.value, opts.topicId, settings, result.stale);
  }

  private async fetchTrending(
    subs: string[],
    topicId: string,
    settings: Settings,
    signal: AbortSignal,
  ): Promise<CachedTrending> {
    const providers = await this.providers(settings);
    const sample = clamp(settings.reddit.postCount * 2, 25, 100);

    const { value, provider, degradedFrom } = await this.runChain(providers, async (p) => {
      const feeds: ListingRequest['feed'][] = p.hasStats ? ['hot', 'rising', 'top'] : ['hot', 'rising'];
      const settled = await Promise.allSettled(
        feeds.map((feed) => p.fetchListing({ subreddits: subs, feed, limit: sample }, signal)),
      );
      const hot = settled[0];
      if (!hot || hot.status === 'rejected') throw hot?.reason ?? new AppError('UNAVAILABLE', 'No data');
      // Secondary feeds are a bonus: a failure there must not discard the primary listing.
      return settled.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
    });

    let posts = mergePosts(value).filter((p) => !p.stickied);
    if (!settings.reddit.includeNsfw) posts = posts.filter((p) => !p.over18);
    const maxAgeHours = 72;
    const now = this.now();
    posts = posts.filter((p) => (now / 1000 - p.createdUtc) / 3600 <= maxAgeHours);
    if (posts.length === 0) throw new AppError('UNAVAILABLE', 'Reddit returned no threads', { provider: `reddit:${provider.id}` });

    const deltas = provider.hasStats ? await this.deps.snapshots.rollForward(`${topicId}:${subs.length}`, posts) : {};
    const meta: RedditFetchMeta = {
      provider: provider.id,
      fetchedAt: now,
      ...(degradedFrom.length ? { degradedFrom } : {}),
    };
    return { posts, deltas, meta };
  }

  // ─── search ───────────────────────────────────────────────────────────────

  async search(opts: {
    queries: string[];
    limit?: number;
    subreddits?: string[];
    signal?: AbortSignal;
  }): Promise<RedditSearchResponse> {
    const settings = await this.deps.getSettings();
    const queries = uniqueBy(
      opts.queries.map((q) => q.trim()).filter((q) => q.length >= 2),
      (q) => phraseKey(q),
    ).slice(0, 3);
    if (queries.length === 0) throw new AppError('NO_CONTEXT', 'Nothing to search for', { retryable: false });

    const subs = opts.subreddits ?? [];
    const limit = clamp(opts.limit ?? 8, 1, 25);
    const key = `reddit:search:${hashString(queries.join('|'))}:${hashString(subs.join(','))}:${settings.reddit.includeNsfw ? 1 : 0}`;

    const result = await this.deps.cache.getOrFetch<CachedTrending>(
      key,
      TTL.redditSearch,
      async (signal) => {
        const providers = await this.providers(settings);
        const { value, provider, degradedFrom } = await this.runChain(providers, async (p) => {
          const lists = await Promise.all(
            queries.map((query) => p.search({ query, subreddits: subs, limit: 12, sort: 'relevance', time: 'month' }, signal)),
          );
          return lists;
        });
        let posts = mergePosts(value).filter((p) => !p.stickied);
        if (!settings.reddit.includeNsfw) posts = posts.filter((p) => !p.over18);
        return {
          posts,
          deltas: {},
          meta: {
            provider: provider.id,
            fetchedAt: this.now(),
            ...(degradedFrom.length ? { degradedFrom } : {}),
          },
        };
      },
      { ...(opts.signal ? { signal: opts.signal } : {}), allowStale: true },
    );

    // Relevance first (does the title talk about the query?), momentum second.
    const wanted = new Set(phraseKey(queries.join(' ')).split(' ').filter(Boolean));
    const scored = scorePosts(result.value.posts, { now: this.now(), preferredSubreddits: settings.reddit.preferredSubreddits });
    const ranked = scored
      .map((p) => {
        const stems = new Set(phraseKey(p.title).split(' '));
        const hits = [...wanted].filter((w) => stems.has(w)).length;
        const match = wanted.size ? hits / wanted.size : 0;
        return { p, sort: (0.4 + match) * (1 + Math.log10(1 + p.trendingScore)) };
      })
      .sort((a, b) => b.sort - a.sort)
      .slice(0, limit)
      .map((x) => x.p);

    return { posts: ranked, meta: result.value.meta, query: queries[0] ?? '' };
  }
}
