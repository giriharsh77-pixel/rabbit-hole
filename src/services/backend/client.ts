/**
 * Client for the optional Rabbit Hole backend (see /server).
 *
 * The backend exists so that API credentials (Brave Search, Anthropic) never
 * ship inside the extension: the extension sends *queries only*, the backend
 * holds the keys.  Every response is re-validated here — the backend is not
 * trusted any more than a third-party API is.
 *
 *   GET  /health               → { ok, features: { search, ai } }
 *   POST /v1/search/substack   → { candidates }
 *   POST /v1/ai/analyze        → { analysis }
 *   POST /v1/ai/refine         → { judgements }
 */
import type { ArticleCandidate } from '../../types/substack';
import { AppError } from '../../utils/errors';
import { httpJson } from '../../utils/http';
import type { AiAnalyzeInput, AiArticleJudgement, AiProvider, AiRefineInput, AiTopicAnalysis } from '../ai/types';
import { validateAnalysis, validateJudgements } from '../ai/validate';
import { looksLikeArticleUrl, makeCandidate } from '../substack/candidates';

export interface BackendFeatures {
  search: boolean;
  ai: boolean;
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
        return { search: f?.search === true, ai: f?.ai === true };
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

  async analyze(input: AiAnalyzeInput, signal?: AbortSignal): Promise<AiTopicAnalysis> {
    const json = (await this.call('/v1/ai/analyze', input, signal)) as { analysis?: unknown } | null;
    return validateAnalysis(json?.analysis);
  }

  async refine(input: AiRefineInput, signal?: AbortSignal): Promise<AiArticleJudgement[]> {
    const json = await this.call('/v1/ai/refine', input, signal, 40_000);
    return validateJudgements(json ? { judgements: (json as { judgements?: unknown }).judgements } : null, new Set(input.candidates.map((c) => c.id)));
  }
}
