/**
 * rankingService — facade over the two ranking engines:
 *   • ranking/reddit.ts     trending score, growth, categories
 *   • ranking/relevance.ts  article relevance, labels, diversity
 */
export {
  categorize,
  crossSubredditCounts,
  GROWTH_LABELS,
  mergePosts,
  rankReddit,
  scorePosts,
  WEIGHTS as REDDIT_WEIGHTS,
  type PostDelta,
  type RankContext,
} from './ranking/reddit';

export {
  diversify,
  explainRelevance,
  LABEL_TEXT,
  LABEL_THRESHOLDS,
  labelFor,
  rankArticles,
  recencyScore,
  RELEVANCE_WEIGHTS,
  scoreCandidate,
  semanticFromCosine,
  sourceQualityScore,
  type RankOptions,
  type ScoreOptions,
} from './ranking/relevance';
