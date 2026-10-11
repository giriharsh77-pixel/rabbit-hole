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
import type { NewsProvider } from './news/newsProvider';
import { looksEnglish } from './ranking/language';
import { OUTLETS } from './news/outlets';

export interface SubstackServiceDeps {
  cache: CacheService;
  getSettings: () => Promise<Settings>;
  ai: Pick<AiService, 'enrich' | 'judge'>;
  feeds: Pick<FeedProvider, 'search'>;
  medium?: Pick<MediumProvider, 'search'>;
  news?: Pick<NewsProvider, 'search'>;
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

  /** NYT / Guardian archive search through the backend — for a named movie or show, unless both are hidden. */
  private async archive(context: ContentContext, prefs: Settings['reading']['sources']): Promise<Pick<MediumProvider, 'search'> | undefined> {
    if (context.platform !== 'netflix' && context.platform !== 'title') return undefined;
    if (prefs.nyt === 'hide' && prefs.guardian === 'hide') return undefined;
    const backend = this.deps.getBackend();
    const press = backend ? await backend.features().then((f) => f.press).catch(() => false) : false;
    if (!backend || !press) return undefined;
    const people = context.entities.filter((e) => e !== context.title).slice(0, 4);
    return { search: (ctx, signal) => backend.searchPress(ctx.title, people, signal) };
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

    // 2 ─ search providers in parallel — plus Medium and news outlets, which widen the net beyond Substack
    const reports: ProviderReport[] = [];
    const lists: ArticleCandidate[][] = [];
    const searchProviders = await this.searchProviders();
    const prefs = settings.reading.sources;
    const extra = (id: 'medium' | 'news' | 'archive', p: Pick<MediumProvider, 'search'> | undefined) =>
      p
        ? p.search(context, signal).then(
            (list) => {
              lists.push(list);
              reports.push({ id, ok: true, count: list.length });
            },
            (err: unknown) => {
              if (isAbortError(err)) throw err;
              reports.push({ id, ok: false, count: 0, error: serializeError(err, id) });
            },
          )
        : Promise.resolve();

    await Promise.all([
      extra('medium', settings.reading.includeMedium && prefs.medium !== 'hide' ? this.deps.medium : undefined),
      extra('news', settings.reading.includeNews ? this.deps.news : undefined),
      extra('archive', await this.archive(context, prefs)),
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
    if (prefs.substack !== 'hide' && (searchProviders.length === 0 || substackCount < THIN_RESULTS)) {
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

    // 3b ─ the reader's preferences: hidden sources, "only my sources", English only
    candidates = applySourcePreferences(candidates, settings.reading);

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

/** Which preference key an article falls under: its news outlet, "medium" or "substack". */
export function sourceKey(c: Pick<ArticleCandidate, 'provider' | 'publicationName'>, outletIdByName: ReadonlyMap<string, string>): string {
  if (c.provider === 'medium') return 'medium';
  if (c.provider === 'news') return outletIdByName.get(c.publicationName) ?? 'news';
  return 'substack';
}

export function applySourcePreferences(
  candidates: ArticleCandidate[],
  reading: Pick<Settings['reading'], 'sources' | 'onlyPreferred' | 'englishOnly'>,
  outletIdByName: ReadonlyMap<string, string> = OUTLET_IDS,
): ArticleCandidate[] {
  const pref = (c: ArticleCandidate) => reading.sources[sourceKey(c, outletIdByName)];
  let out = candidates.filter((c) => pref(c) !== 'hide');
  if (reading.englishOnly) out = out.filter((c) => looksEnglish(`${c.title}. ${c.excerpt}`));
  const preferred = out.filter((c) => pref(c) === 'prefer');
  if (reading.onlyPreferred && preferred.length > 0) out = preferred;
  // a preferred source counts as a top-tier publication when ranking
  return out.map((c) => (pref(c) === 'prefer' ? { ...c, publicationTier: 3 as const } : c));
}

const OUTLET_IDS: ReadonlyMap<string, string> = new Map(OUTLETS.map((o) => [o.name, o.id]));
