/**
 * Client for the optional Rabbit Hole backend (see /server).
 *
 * The backend exists so that API credentials (Brave Search, Anthropic) never
 * ship inside the extension: the extension sends *queries only*, the backend
 * holds the keys.  Every response is re-validated here — the backend is not
 * trusted any more than a third-party API is.
 *
 *   GET  /health               → { ok, features: { search, ai, titles, ratings, press } }
 *   POST /v1/search/substack   → { candidates }
 *   POST /v1/ai/analyze        → { analysis }
 *   POST /v1/ai/refine         → { judgements }
 *   POST /v1/title/insights    → { insights }   ratings · reviews · similar · Netflix India
 *   POST /v1/press/search      → { articles }   NYT · Guardian
 */
import type { ArticleCandidate } from '../../types/substack';
import type { SimilarTitle, TitleInsights, TitleRatings, TitleReview, WatchAvailability } from '../../types/title';
import { cleanText } from '../../utils/sanitize';
import { truncate } from '../../utils/text';
import { AppError } from '../../utils/errors';
import { httpJson } from '../../utils/http';
import type { AiAnalyzeInput, AiArticleJudgement, AiProvider, AiRefineInput, AiTopicAnalysis } from '../ai/types';
import { validateAnalysis, validateJudgements } from '../ai/validate';
import { looksLikeArticleUrl, makeCandidate } from '../substack/candidates';

export interface BackendFeatures {
  search: boolean;
  ai: boolean;
  /** TMDB: reviews, similar titles, Netflix India availability. */
  titles: boolean;
  /** OMDb: IMDb / Rotten Tomatoes / Metacritic ratings. */
  ratings: boolean;
  /** NYT / Guardian archive search. */
  press: boolean;
}

export class BackendClient implements AiProvider {
  readonly via = 'backend' as const;
  private featuresPromise: Promise<BackendFeatures> | undefined;

  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl?: typeof fetch,
  ) {}

  private call(path: string, body: unknown, signal?: AbortSignal, timeoutMs = 25_000): Promise<unknown> {
    return httpJson(`${this.baseUrl}${path}`, {
      provider: 'backend',
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
      signal,
      timeoutMs,
      ...(this.fetchImpl ? { fetchImpl: this.fetchImpl } : {}),
    });
  }

  features(signal?: AbortSignal): Promise<BackendFeatures> {
    this.featuresPromise ??= httpJson(`${this.baseUrl}/health`, {
      provider: 'backend',
      signal,
      timeoutMs: 6000,
      ...(this.fetchImpl ? { fetchImpl: this.fetchImpl } : {}),
    })
      .then((json) => {
        const f = (json as { features?: Partial<BackendFeatures> } | null)?.features;
        return { search: f?.search === true, ai: f?.ai === true, titles: f?.titles === true, ratings: f?.ratings === true, press: f?.press === true };
      })
      .catch((err) => {
        this.featuresPromise = undefined; // retry next time
        throw err;
      });
    return this.featuresPromise;
  }

  async searchSubstack(queries: string[], limit: number, signal?: AbortSignal): Promise<ArticleCandidate[]> {
    const json = (await this.call('/v1/search/substack', { queries, limit }, signal)) as { candidates?: unknown } | null;
    if (!Array.isArray(json?.candidates)) {
      throw new AppError('INVALID_RESPONSE', 'Backend returned an unexpected shape', { provider: 'backend', retryable: false });
    }
    const out: ArticleCandidate[] = [];
    for (const raw of json.candidates) {
      const o = raw as Record<string, unknown> | null;
      if (!o || typeof o.url !== 'string' || !looksLikeArticleUrl(o.url)) continue;
      const candidate = makeCandidate({
        url: o.url,
        title: o.title,
        excerpt: o.excerpt,
        publicationName: o.publicationName,
        authorName: o.authorName,
        publishedAt: o.publishedAt,
        source: 'search',
        provider: 'backend',
        ...(typeof o.searchRank === 'number' ? { searchRank: o.searchRank } : {}),
        matchedQueries: Array.isArray(o.matchedQueries) ? o.matchedQueries.filter((q): q is string => typeof q === 'string').slice(0, 5) : [],
      });
      if (candidate) out.push(candidate);
    }
    return out;
  }

  async titleInsights(ref: { tmdb?: { type: 'movie' | 'tv'; id: string }; imdbId?: string }, signal?: AbortSignal): Promise<TitleInsights> {
    const json = (await this.call('/v1/title/insights', ref, signal)) as { insights?: unknown } | null;
    return validateInsights(json?.insights);
  }

  async searchPress(title: string, people: string[], signal?: AbortSignal): Promise<ArticleCandidate[]> {
    const json = (await this.call('/v1/press/search', { title, people }, signal)) as { articles?: unknown } | null;
    if (!Array.isArray(json?.articles)) throw new AppError('INVALID_RESPONSE', 'Backend returned an unexpected shape', { provider: 'backend', retryable: false });
    const out: ArticleCandidate[] = [];
    for (const raw of json.articles.slice(0, 40)) {
      const o = raw as Record<string, unknown> | null;
      const pub = o?.publicationName === 'The New York Times' || o?.publicationName === 'The Guardian' ? o.publicationName : undefined;
      if (!o || !pub) continue;
      const candidate = makeCandidate(
        {
          url: o.url,
          title: o.title,
          excerpt: o.excerpt,
          publicationName: pub,
          authorName: o.authorName,
          publishedAt: o.publishedAt,
          source: 'search',
          provider: 'news',
          publicationTier: 3,
          matchedQueries: [title],
        },
        { allowedHosts: [pub === 'The Guardian' ? 'www.theguardian.com' : 'www.nytimes.com'] },
      );
      if (candidate) out.push(candidate);
    }
    return out;
  }

  async analyze(input: AiAnalyzeInput, signal?: AbortSignal): Promise<AiTopicAnalysis> {
    const json = (await this.call('/v1/ai/analyze', input, signal)) as { analysis?: unknown } | null;
    return validateAnalysis(json?.analysis);
  }

  async refine(input: AiRefineInput, signal?: AbortSignal): Promise<AiArticleJudgement[]> {
    const json = await this.call('/v1/ai/refine', input, signal, 40_000);
    return validateJudgements(json ? { judgements: (json as { judgements?: unknown }).judgements } : null, new Set(input.candidates.map((c) => c.id)));
  }
}

// ─── validation of title insights (the backend is not trusted either) ──────

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const pattern = (v: unknown, re: RegExp) => (typeof v === 'string' && re.test(v) ? v : undefined);

function validRatings(v: unknown): TitleRatings | undefined {
  const r = rec(v);
  const out: TitleRatings = {};
  const imdb = pattern(r.imdb, /^\d{1,2}(\.\d)?\/10$/);
  if (imdb) out.imdb = imdb;
  const votes = pattern(r.imdbVotes, /^[\d,]{1,12}$/);
  if (votes) out.imdbVotes = votes;
  const rt = pattern(r.rottenTomatoes, /^\d{1,3}%$/);
  if (rt) out.rottenTomatoes = rt;
  const mc = pattern(r.metacritic, /^\d{1,3}\/100$/);
  if (mc) out.metacritic = mc;
  const t = rec(r.tmdb);
  if (typeof t.score === 'number' && t.score > 0 && t.score <= 10 && typeof t.votes === 'number' && t.votes > 0) out.tmdb = { score: Math.round(t.score * 10) / 10, votes: Math.round(t.votes) };
  return Object.keys(out).length ? out : undefined;
}

function validReviews(v: unknown): TitleReview[] {
  if (!Array.isArray(v)) return [];
  const out: TitleReview[] = [];
  for (const raw of v.slice(0, 8)) {
    const r = rec(raw);
    const url = pattern(r.url, /^https:\/\/www\.themoviedb\.org\/review\/[a-f0-9]{8,32}$/);
    const author = cleanText(r.author, 60);
    const excerpt = truncate(cleanText(r.excerpt, 600), 420);
    if (!url || !author || excerpt.length < 20) continue;
    const date = typeof r.date === 'string' && !Number.isNaN(Date.parse(r.date)) ? r.date : undefined;
    out.push({ author, excerpt, url, ...(typeof r.rating === 'number' && r.rating >= 0 && r.rating <= 10 ? { rating: r.rating } : {}), ...(date ? { date } : {}) });
  }
  return out;
}

function validAvailability(v: unknown): WatchAvailability | undefined {
  const r = rec(v);
  if (r.region !== 'IN' || typeof r.onNetflix !== 'boolean') return undefined;
  const elsewhere = (Array.isArray(r.elsewhere) ? r.elsewhere : []).map((x) => cleanText(x, 40)).filter(Boolean).slice(0, 5);
  const link = pattern(r.link, /^https:\/\/www\.themoviedb\.org\/[^\s]+$/);
  return { region: 'IN', onNetflix: r.onNetflix, elsewhere, ...(link ? { link } : {}) };
}

function validSimilar(v: unknown): SimilarTitle[] {
  if (!Array.isArray(v)) return [];
  const out: SimilarTitle[] = [];
  for (const raw of v.slice(0, 20)) {
    const r = rec(raw);
    const t = rec(r.tmdb);
    const type = t.type === 'movie' || t.type === 'tv' ? t.type : undefined;
    const id = pattern(t.id, /^\d{1,9}$/);
    const title = cleanText(r.title, 160);
    if (!type || !id || !title) continue;
    const year = typeof r.year === 'number' && r.year > 1870 && r.year < 2200 ? r.year : undefined;
    const overview = truncate(cleanText(r.overview, 400), 220);
    out.push({
      tmdb: { type, id },
      title,
      ...(year ? { year } : {}),
      ...(overview ? { overview } : {}),
      ...(typeof r.onNetflixIndia === 'boolean' ? { onNetflixIndia: r.onNetflixIndia } : {}),
    });
  }
  return out;
}

export function validateInsights(v: unknown): TitleInsights {
  const r = rec(v);
  if (!v || typeof v !== 'object') throw new AppError('INVALID_RESPONSE', 'Backend returned an unexpected shape', { provider: 'backend', retryable: false });
  const ratings = validRatings(r.ratings);
  const availability = validAvailability(r.availability);
  const attribution = (Array.isArray(r.attribution) ? r.attribution : []).filter((a): a is 'TMDB' | 'JustWatch' | 'OMDb' => a === 'TMDB' || a === 'JustWatch' || a === 'OMDb');
  const tmdbUrl = pattern(r.tmdbUrl, /^https:\/\/www\.themoviedb\.org\/(movie|tv)\/\d{1,9}$/);
  return {
    reviews: validReviews(r.reviews),
    similar: validSimilar(r.similar),
    attribution: [...new Set(attribution)],
    ...(ratings ? { ratings } : {}),
    ...(availability ? { availability } : {}),
    ...(tmdbUrl ? { tmdbUrl } : {}),
  };
}
