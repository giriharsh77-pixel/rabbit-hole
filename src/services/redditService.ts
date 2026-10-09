/**
 * redditService — finds Reddit threads about a subject (what the user is
 * watching, a search, an article).
 *
 *   providers (OAuth → public JSON → Atom feed)  — graceful degradation
 *   → merge + filter → relevance + momentum ranking
 *
 * Failure handling: a provider that is blocked or rate-limited is skipped for
 * a cool-down period (circuit breaker) so we never hammer Reddit; if every
 * provider fails the last good data is served as stale, otherwise a typed
 * AppError reaches the UI.
 */
import type { RedditFetchMeta, RedditPost, RedditProviderId, RedditSearchResponse } from '../types/reddit';
import type { Settings } from '../types/settings';
import { AppError, toAppError } from '../utils/errors';
import { clamp } from '../utils/format';
import { hashString, normalizeText, phraseKey, uniqueBy } from '../utils/text';
import { CacheService, TTL } from './cacheService';
import { mergePosts, scorePosts } from './ranking/reddit';
import { JsonProvider, OAuthProvider, RssProvider, type RedditProvider, type SearchRequest } from './reddit/providers';

export interface RedditServiceDeps {
  cache: CacheService;
  getSettings: () => Promise<Settings>;
  /** Public Reddit installed-app client id, if configured. */
  getClientId: () => Promise<string | undefined>;
  now?: () => number;
  fetchImpl?: typeof fetch;
}

interface CachedSearch {
  posts: RedditPost[];
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

  // ─── search ───────────────────────────────────────────────────────────────

  async search(opts: {
    queries: string[];
    limit?: number;
    subreddits?: string[];
    /** How far back to look (default: past month). */
    time?: SearchRequest['time'];
    /** Only threads that clearly match a query — never pad with Reddit's loose matches. */
    strict?: boolean;
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
    const time = opts.time ?? 'month';
    const key = `reddit:search:${hashString(queries.join('|'))}:${hashString(subs.join(','))}:${time}:${settings.reddit.includeNsfw ? 1 : 0}`;

    const result = await this.deps.cache.getOrFetch<CachedSearch>(
      key,
      TTL.redditSearch,
      async (signal) => {
        const providers = await this.providers(settings);
        const { value, provider, degradedFrom } = await this.runChain(providers, async (p) => {
          const lists = await Promise.all(
            queries.map((query) => p.search({ query, subreddits: subs, limit: 12, sort: 'relevance', time }, signal)),
          );
          return lists;
        });
        let posts = mergePosts(value).filter((p) => !p.stickied);
        if (!settings.reddit.includeNsfw) posts = posts.filter((p) => !p.over18);
        return {
          posts,
          meta: {
            provider: provider.id,
            fetchedAt: this.now(),
            ...(degradedFrom.length ? { degradedFrom } : {}),
          },
        };
      },
      { ...(opts.signal ? { signal: opts.signal } : {}), allowStale: true },
    );

    // Relevance first (does the thread talk about one of the queries?), momentum second.
    const scored = scorePosts(result.value.posts, { now: this.now(), preferredSubreddits: settings.reddit.preferredSubreddits });
    const ranked = scored
      .map((p) => {
        const match = searchMatch(queries, p);
        // momentum for fresh threads, plain popularity for older ones (all-time searches)
        const pull = 1 + Math.log10(1 + p.trendingScore) + 0.25 * Math.log10(1 + (p.score ?? 0));
        return { p, match, sort: (0.4 + match) * pull };
      })
      .sort((a, b) => b.sort - a.sort);
    // Drop off-topic threads Reddit's search padded the results with — unless that would leave almost
    // nothing for a free-form search. Strict callers ("threads about this video") never get padding.
    const onTopic = ranked.filter((x) => x.match >= 0.34);
    const posts = (opts.strict || onTopic.length >= 3 ? onTopic : ranked).slice(0, limit).map((x) => x.p);

    return { posts, meta: result.value.meta, query: queries[0] ?? '' };
  }
}

/**
 * 0–1: how well a thread matches its *best* query. Quoted names ("Black Mirror")
 * must appear as a phrase, other words by stem; the title counts fully, the
 * preview half; a subreddit named after the subject (r/blackmirror) counts as
 * a full match.
 */
export function searchMatch(queries: string[], post: Pick<RedditPost, 'title' | 'subreddit' | 'preview'>): number {
  const fields = [post.title, post.preview.slice(0, 300)].map((text) => ({
    norm: ` ${normalizeText(text)} `,
    stems: new Set(phraseKey(text).split(' ')),
  }));
  const sub = post.subreddit.toLowerCase().replace(/[^a-z0-9]/g, '');
  let best = 0;
  for (const q of queries) {
    const phrases = [...q.matchAll(/["“]([^"”]+)["”]/g)].map((m) => normalizeText(m[1] ?? '')).filter(Boolean);
    const words = phraseKey(q.replace(/["“][^"”]*["”]/g, ' ')).split(' ').filter(Boolean);
    const parts = phrases.length + words.length;
    if (parts === 0) continue;
    const [inTitle, inPreview] = fields.map(
      (f) => (phrases.filter((ph) => f.norm.includes(` ${ph} `)).length + words.filter((w) => f.stems.has(w)).length) / parts,
    );
    // only a quoted name can claim a subreddit ("Technology is…" must not match r/technology)
    const subject = (phrases[0] ?? '').replace(/\s+/g, '');
    const subMatch = sub.length >= 4 && (subject === sub || subject.replace(/^the/, '') === sub) ? 1 : 0;
    best = Math.max(best, inTitle ?? 0, (inPreview ?? 0) * 0.5, subMatch);
  }
  return best;
}
