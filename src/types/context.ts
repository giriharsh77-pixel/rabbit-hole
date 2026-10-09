/**
 * Context-extraction types.
 *
 *   Current webpage → Platform detector → Metadata extractor → Topic extraction
 *   → Keyword/entity extraction → Search query generation → Substack discovery
 *   → Relevance ranking → Results
 *
 * Adding a platform = one `PlatformExtractor` (see services/context/extractors)
 * plus a URL rule in services/context/platform.ts.
 */

export type Platform = 'youtube' | 'netflix' | 'reddit' | 'substack' | 'manual' | 'unknown';

export type ContentKind =
  | 'video'
  | 'short'
  | 'movie'
  | 'episode'
  | 'show'
  | 'thread'
  | 'article'
  | 'page'
  | 'query';

/** What a content script reads straight off the page — no analysis yet. */
export interface RawPageMetadata {
  platform: Platform;
  kind: ContentKind;
  url: string;
  title: string;
  creator?: string;
  description?: string;
  /** Netflix: "S7:E2 · Episode name" style label. */
  episode?: string;
  season?: number;
  episodeNumber?: number;
  genres?: string[];
  /** Cast / creators listed by the page (Netflix JSON-LD). */
  people?: string[];
  /** Keywords the page itself declares (e.g. YouTube's `meta[name=keywords]`). */
  keywords?: string[];
  hashtags?: string[];
  /** Platform category, e.g. YouTube "Science & Technology". */
  category?: string;
  /** Reddit */
  subreddit?: string;
  /** Substack / article pages */
  publication?: string;
  videoId?: string;
  publishedAt?: string;
  /** Which strategy produced the data (shown in "What Rabbit Hole used"). */
  source: string;
  confidence: 'high' | 'medium' | 'low';
}

export type ConceptOrigin =
  | 'title'
  | 'keywords'
  | 'description'
  | 'genre'
  | 'entity'
  | 'ontology'
  | 'ai'
  | 'manual';

export interface Concept {
  text: string;
  /** 0–1, how central the concept is to the content. */
  weight: number;
  origin: ConceptOrigin;
}

/**
 * The normalised, analysed representation of "what the user is looking at".
 * The first six fields match the product spec; the rest are additive.
 */
export interface ContentContext {
  platform: Platform;
  title: string;
  creator?: string;
  description?: string;
  episode?: string;
  /** Ranked topic/keyword phrases (including related concepts). */
  keywords: string[];
  /** Named entities: people, products, companies, titles. */
  entities: string[];

  kind: ContentKind;
  url?: string;
  /** Core topics (what the content is literally about), most important first. */
  topics: string[];
  /** Weighted concept list used for query generation and relevance scoring. */
  concepts: Concept[];
  genres?: string[];
  subreddit?: string;
  publication?: string;
  analyzedBy: 'heuristic' | 'ai';
  /** Search queries proposed by the optional AI layer (preferred over generated ones). */
  aiQueries?: string[];
  capturedAt: number;
}

export interface SearchQuery {
  text: string;
  /** 0–1 relative importance. */
  weight: number;
  kind: 'title' | 'entity' | 'concept' | 'combo' | 'manual';
}

/** One row in the "What Rabbit Hole used" disclosure. */
export interface UsedInfoField {
  label: string;
  value: string;
}

export type CurrentContextState =
  /** A context was extracted and analysed. */
  | 'ready'
  /** On YouTube/Netflix but the page gave us nothing usable → manual search. */
  | 'undetected'
  /** The user switched detection off (master or per-platform). */
  | 'disabled'
  /** Any other site: nothing is read unless the user asks. */
  | 'idle'
  /** No inspectable tab (e.g. dashboard opened in its own tab). */
  | 'no-tab';

export interface CurrentContextResponse {
  state: CurrentContextState;
  platform: Platform;
  hostname?: string;
  context?: ContentContext;
  /** Human-readable reason for non-ready states. */
  reason?: string;
  /** True when the user may explicitly ask us to read this (non-platform) page. */
  canUsePage: boolean;
  /** Exactly what was read from the page / sent for searching. */
  used: UsedInfoField[];
}

/** Contract implemented by every platform extractor (DOM → raw metadata). */
export interface PlatformExtractor {
  id: Platform;
  matches(url: URL): boolean;
  extract(doc: Document, url: URL): RawPageMetadata | null | Promise<RawPageMetadata | null>;
}
