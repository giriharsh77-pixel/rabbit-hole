/**
 * rankingService — facade over the two ranking engines:
 *   • ranking/reddit.ts     momentum score, growth
 *   • ranking/relevance.ts  article relevance, labels, diversity
 */
export {
  crossSubredditCounts,
  GROWTH_LABELS,
  mergePosts,
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
