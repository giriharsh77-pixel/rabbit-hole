import type { ContentContext, SearchQuery } from './context';
import type { SerializedError } from './errors';

export type RelevanceLabel = 'highly-relevant' | 'very-relevant' | 'related' | 'somewhat-related';

/** `medium` = Medium's public tag feeds (keyless), searched alongside Substack. */
export type SubstackProviderId = 'backend' | 'brave' | 'feeds' | 'medium';

/** An article found by a provider, before ranking.  Never contains invented data. */
export interface ArticleCandidate {
  /** Stable id derived from the canonical URL. */
  id: string;
  url: string;
  title: string;
  /** Plain-text excerpt (stripped of HTML, truncated). May be empty. */
  excerpt: string;
  publicationName: string;
  publicationUrl?: string;
  authorName?: string;
  /** ISO-8601 — only present when the source actually told us. */
  publishedAt?: string;
  source: 'search' | 'feed';
  provider: SubstackProviderId;
  /** 0-based position in the provider's own ranking, if it has one. */
  searchRank?: number;
  matchedQueries: string[];
  engagement?: { likes?: number; comments?: number };
  /** Topic tags of the publication (feed provider only). */
  tags?: string[];
  /** Editorial prior for the publication, 1–3 (feed provider only). */
  publicationTier?: 1 | 2 | 3;
}

/** Each term is normalised to 0–1 before the weights are applied. */
export interface RelevanceBreakdown {
  semantic: number;
  keyword: number;
  entity: number;
  recency: number;
  sourceQuality: number;
}

export interface RankedArticle extends ArticleCandidate {
  /** 0–100.  Used for ordering and thresholds, not presented as "accuracy". */
  relevanceScore: number;
  label: RelevanceLabel;
  breakdown: RelevanceBreakdown;
  /** Concepts/entities from the source content that this article actually matches. */
  matchedTopics: string[];
  /** "Why this is relevant" — one or two sentences. */
  why: string;
  whyBy: 'heuristic' | 'ai';
}

export interface ProviderReport {
  id: SubstackProviderId;
  ok: boolean;
  count: number;
  error?: SerializedError;
}

export interface DiscoveryResponse {
  /** The context actually used (it may have been enriched by the AI layer). */
  context: ContentContext;
  articles: RankedArticle[];
  /** Candidates retrieved before filtering by the minimum relevance. */
  totalCandidates: number;
  queries: SearchQuery[];
  providers: ProviderReport[];
  fetchedAt: number;
  aiUsed: boolean;
  /**
   * True when only the built-in publication list was searched (no search
   * provider configured) — the UI then explains that coverage is limited.
   */
  limitedCoverage: boolean;
}
