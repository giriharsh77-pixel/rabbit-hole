/**
 * substackService — finds thoughtful Substack writing related to a context.
 *
 *   ContentContext
 *     → (optional) AI enrichment
 *     → query generation
 *     → search providers  (backend proxy · Brave Search key)     ┐ run in parallel
 *     → feed provider     (curated public RSS feeds)             │ when search is absent/thin
 *     → Medium            (public tag feeds, keyless)            ┘ always, unless switched off
 *     → merge + validate → relevance scoring → (optional) AI judging
 *     → threshold + diversity → DiscoveryResponse
 *
 * Substack has no public search API, so *search* is delegated to a documented
 * search service and *feeds* to Substack's own public RSS.  Nothing is scraped.
 */
import type { ContentContext, SearchQuery } from '../types/context';
import type { Settings } from '../types/settings';
import type { ArticleCandidate, DiscoveryResponse, ProviderReport, SubstackProviderId } from '../types/substack';
import { AppError, isAbortError, serializeError, toAppError } from '../utils/errors';
import { hashString } from '../utils/text';
import { generateQueries } from './context/queries';
import type { AiService } from './aiService';
import type { BackendClient } from './backend/client';
import { CacheService, TTL } from './cacheService';
import { rankArticles } from './ranking/relevance';
import { braveSearchSubstack } from './search/brave';
import { mergeCandidates } from './substack/candidates';
import type { FeedProvider } from './substack/feedProvider';
import type { MediumProvider } from './substack/medium';

export interface SubstackServiceDeps {
  cache: CacheService;
  getSettings: () => Promise<Settings>;
  ai: Pick<AiService, 'enrich' | 'judge'>;
  feeds: Pick<FeedProvider, 'search'>;
  medium?: Pick<MediumProvider, 'search'>;
  getBackend: () => BackendClient | undefined;
  getBraveKey: () => Promise<string | undefined>;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

interface SearchProvider {
  id: Extract<SubstackProviderId, 'backend' | 'brave'>;
  run(queries: SearchQuery[], signal: AbortSignal): Promise<ArticleCandidate[]>;
}

/** Candidates below this count trigger the feed provider as a supplement. */
const THIN_RESULTS = 8;

export class SubstackService {
  private readonly now: () => number;
  constructor(private readonly deps: SubstackServiceDeps) {
    this.now = deps.now ?? Date.now;
  }

  async searchProviders(): Promise<SearchProvider[]> {
    const providers: SearchProvider[] = [];
    const backend = this.deps.getBackend();
    if (backend) {
      try {
        if ((await backend.features()).search) {
          providers.push({
            id: 'backend',
            run: (queries, signal) => backend.searchSubstack(queries.map((q) => q.text), 20, signal),
          });
        }
      } catch {
        /* backend unreachable: the other providers still work */
      }
    }
    const key = await this.deps.getBraveKey();
    if (key) {
      providers.push({
        id: 'brave',
        run: async (queries, signal) => {
          const settled = await Promise.allSettled(
            queries.slice(0, 4).map((q) =>
              braveSearchSubstack(q.text, {
                apiKey: key,
                count: 15,
                signal,
                ...(this.deps.fetchImpl ? { fetchImpl: this.deps.fetchImpl } : {}),
              }),
            ),
          );
          const ok = settled.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
          if (ok.length === 0) {
            const failure = settled.find((r): r is PromiseRejectedResult => r.status === 'rejected');
            throw toAppError(failure?.reason, 'brave');
          }
          return mergeCandidates(ok);
        },
      });
    }
    return providers;
  }

  async discover(
    input: ContentContext,
    opts: { refresh?: boolean; signal?: AbortSignal } = {},
  ): Promise<DiscoveryResponse> {
    const settings = await this.deps.getSettings();
    const cacheKey = `substack:discover:${hashString(
      JSON.stringify([
        input.platform,
        input.title,
        input.concepts.map((c) => c.text),
        settings.reading,
        settings.privacy.aiEnabled,
      ]),
    )}`;

    const result = await this.deps.cache.getOrFetch<DiscoveryResponse>(
      cacheKey,
      TTL.substackSearch,
      (signal) => this.compute(input, settings, signal),
      { ...(opts.refresh !== undefined ? { force: opts.refresh } : {}), ...(opts.signal ? { signal: opts.signal } : {}), allowStale: true },
    );
    return result.value;
  }

  private async compute(input: ContentContext, settings: Settings, signal: AbortSignal): Promise<DiscoveryResponse> {
    // 1 ─ optional AI enrichment, then queries
    const context = settings.privacy.aiEnabled ? await this.deps.ai.enrich(input, signal) : input;
    const queries = generateQueries(context, { max: 5 });

    // 2 ─ search providers in parallel — and Medium, which widens the net beyond Substack
    const reports: ProviderReport[] = [];
    const lists: ArticleCandidate[][] = [];
    const searchProviders = await this.searchProviders();
    const medium = settings.reading.includeMedium ? this.deps.medium : undefined;
    const mediumRun = medium
      ? medium.search(context, signal).then(
          (list) => {
            lists.push(list);
            reports.push({ id: 'medium', ok: true, count: list.length });
          },
          (err: unknown) => {
            if (isAbortError(err)) throw err;
            reports.push({ id: 'medium', ok: false, count: 0, error: serializeError(err, 'medium') });
          },
        )
      : Promise.resolve();

    await Promise.all([
      mediumRun,
      ...searchProviders.map(async (p) => {
        try {
          const list = await p.run(queries, signal);
          lists.push(list);
          reports.push({ id: p.id, ok: true, count: list.length });
        } catch (err) {
          if (isAbortError(err)) throw err;
          reports.push({ id: p.id, ok: false, count: 0, error: serializeError(err, p.id) });
        }
      }),
    ]);
    let candidates = mergeCandidates(lists);
    const substackCount = candidates.filter((c) => c.provider !== 'medium').length;

    // 3 ─ public feeds: the keyless path, and a supplement when search is thin
    if (searchProviders.length === 0 || substackCount < THIN_RESULTS) {
      try {
        const fromFeeds = await this.deps.feeds.search(context, signal);
        reports.push({ id: 'feeds', ok: true, count: fromFeeds.length });
        candidates = mergeCandidates([candidates, fromFeeds]);
      } catch (err) {
        if (isAbortError(err)) throw err;
        reports.push({ id: 'feeds', ok: false, count: 0, error: serializeError(err, 'feeds') });
      }
    }

    if (candidates.length === 0 && reports.length > 0 && reports.every((r) => !r.ok)) {
      const first = reports.find((r) => r.error)?.error;
      throw new AppError(first?.code ?? 'UNAVAILABLE', first?.message ?? 'Substack search is unavailable', {
        retryable: first?.retryable ?? true,
        ...(first?.provider ? { provider: first.provider } : {}),
      });
    }

    // 4 ─ rank (lexical), optionally let the LLM judge the front-runners, re-rank
    const rankOpts = {
      now: this.now(),
      preferredTopics: settings.reading.preferredTopics,
      minRelevance: settings.reading.minRelevance,
      limit: settings.reading.recommendationCount,
    };
    let articles = rankArticles(context, candidates, rankOpts);
    let aiUsed = false;
    if (settings.privacy.aiEnabled && candidates.length >= 3) {
      const shortlist = rankArticles(context, candidates, { ...rankOpts, minRelevance: 0, limit: 12 });
      const judgements = await this.deps.ai.judge(context, shortlist, signal);
      if (judgements) {
        aiUsed = true;
        articles = rankArticles(context, candidates, { ...rankOpts, aiRelevance: judgements });
      }
    }

    return {
      context,
      articles,
      totalCandidates: candidates.length,
      queries,
      providers: reports,
      fetchedAt: this.now(),
      aiUsed,
      limitedCoverage: searchProviders.length === 0,
    };
  }
}
