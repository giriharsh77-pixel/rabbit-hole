/**
 * Brave Search API client — a documented, key-authenticated search service.
 * Used to find Substack posts with a `site:substack.com` query.
 *
 *   https://api.search.brave.com/res/v1/web/search
 *
 * This module is platform-agnostic (plain fetch) so the same code runs in the
 * extension (bring-your-own-key) and in the backend proxy (server-held key).
 * Substack itself offers no public search API; this is the sanctioned way to
 * search it without scraping.
 */
import type { ArticleCandidate } from '../../types/substack';
import { AppError } from '../../utils/errors';
import { httpJson } from '../../utils/http';
import { stripHtml } from '../../utils/text';
import { looksLikeArticleUrl, makeCandidate } from '../substack/candidates';

export interface BraveSearchOptions {
  apiKey: string;
  count?: number;
  signal?: AbortSignal | undefined;
  fetchImpl?: typeof fetch | undefined;
}

export const BRAVE_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';

export function mapBraveResults(json: unknown, query: string): ArticleCandidate[] {
  const results = (json as { web?: { results?: unknown } } | null)?.web?.results;
  if (results === undefined) return []; // no web results for this query is a valid answer
  if (!Array.isArray(results)) {
    throw new AppError('INVALID_RESPONSE', 'Unexpected search response shape', { provider: 'brave', retryable: false });
  }
  const out: ArticleCandidate[] = [];
  results.forEach((r, index) => {
    const o = r as Record<string, unknown> | null;
    if (!o || typeof o.url !== 'string' || !looksLikeArticleUrl(o.url)) return;
    const extra = Array.isArray(o.extra_snippets) && typeof o.extra_snippets[0] === 'string' ? o.extra_snippets[0] : '';
    const description = typeof o.description === 'string' ? stripHtml(o.description) : '';
    const candidate = makeCandidate({
      url: o.url,
      title: typeof o.title === 'string' ? stripHtml(o.title) : '',
      excerpt: description.length >= 60 || !extra ? description : `${description} ${stripHtml(extra)}`,
      publishedAt: o.page_age,
      source: 'search',
      provider: 'brave',
      searchRank: index,
      matchedQueries: [query],
    });
    if (candidate) out.push(candidate);
  });
  return out;
}

export async function braveSearchSubstack(query: string, opts: BraveSearchOptions): Promise<ArticleCandidate[]> {
  const params = new URLSearchParams({
    q: `site:substack.com ${query}`,
    count: String(opts.count ?? 20),
    safesearch: 'moderate',
    text_decorations: 'false',
    result_filter: 'web',
    spellcheck: 'false',
  });
  const json = await httpJson(`${BRAVE_ENDPOINT}?${params}`, {
    provider: 'brave',
    signal: opts.signal,
    headers: { 'x-subscription-token': opts.apiKey },
    timeoutMs: 10_000,
    ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
  });
  return mapBraveResults(json, query);
}
