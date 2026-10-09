/**
 * The optional AI layer.  It is deliberately narrow: it receives short,
 * already-truncated metadata (never page HTML, history or account data) and
 * returns small structured JSON that is validated before use.
 */
export interface AiAnalyzeInput {
  platform: string;
  kind: string;
  title: string;
  creator?: string;
  description?: string;
  episode?: string;
  genres?: string[];
  keywords?: string[];
}

export interface AiTopicAnalysis {
  /** What the content is literally about, most central first. */
  topics: string[];
  /** Named people, products, companies, titles. */
  entities: string[];
  /** Broader related ideas a thoughtful writer might connect it to. */
  concepts: string[];
  /** Ready-to-run search queries (3–5). */
  queries: string[];
}

export interface AiRefineInput {
  source: { title: string; platform: string; topics: string[] };
  candidates: { id: string; title: string; excerpt: string; publication: string }[];
}

export interface AiArticleJudgement {
  id: string;
  /** 0–1 */
  relevance: number;
  /** One sentence, grounded only in the title/excerpt that was provided. */
  why: string;
}

export interface AiProvider {
  readonly via: 'backend' | 'user-key';
  analyze(input: AiAnalyzeInput, signal?: AbortSignal): Promise<AiTopicAnalysis>;
  refine(input: AiRefineInput, signal?: AbortSignal): Promise<AiArticleJudgement[]>;
}
