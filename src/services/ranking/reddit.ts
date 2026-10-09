/**
 * Reddit trending engine.  Pure functions — no I/O — so the formula is easy to
 * test and tune.
 *
 *   trendingScore = recency × engagementVelocity × commentVelocity
 *                   × popularityMultiplier × growthBoost
 *
 * (each factor is shaped so that no single zero can flatten the score)
 *
 *   recency              0.25 + 0.5^(ageHours / 10)          fresh posts dominate, old ones fade
 *   engagementVelocity   1 + log10(1 + score / (age + 1))     upvotes per hour, log-damped
 *   commentVelocity      1 + log10(1 + comments / (age + 1))  discussion per hour
 *   popularityMultiplier 1 + total engagement + cross-subreddit + multi-feed presence + preferred sub
 *   growthBoost          1 + measured growth since the last snapshot (when we have one)
 *
 * Tune the constants in WEIGHTS; the shape of the formula stays the same.
 */
import type {
  GrowthLevel,
  RedditCategories,
  RedditPost,
  ScoredRedditPost,
} from '../../types/reddit';
import { canonicalizeUrl } from '../../utils/sanitize';
import { phraseKey } from '../../utils/text';

export const WEIGHTS = {
  /** Hours for the recency term to halve. */
  recencyHalfLifeHours: 10,
  recencyFloor: 0.25,
  engagementLogScale: 1,
  commentLogScale: 1,
  /** popularity multiplier components */
  totalEngagement: 0.12,
  crossSubreddit: 0.12,
  maxCrossSubreddit: 5,
  extraFeed: 0.08,
  preferredSubreddit: 0.15,
  /** growth boost scale (log of measured upvotes/hour) */
  growth: 0.33,
  /** growth classification thresholds, relative to the median velocity */
  surgingRatio: 3,
  risingRatio: 1.6,
  steadyRatio: 0.6,
} as const;

export interface PostDelta {
  score: number;
  comments: number;
  minutes: number;
}

export interface RankContext {
  /** ms since epoch */
  now: number;
  /** Measured change since the previous refresh, keyed by post id. */
  deltas?: Record<string, PostDelta> | undefined;
  preferredSubreddits?: readonly string[] | undefined;
}

export const GROWTH_LABELS: Record<GrowthLevel, string> = {
  surging: 'Growing rapidly',
  rising: 'Gaining traction',
  steady: 'Steady activity',
  cooling: 'Cooling off',
  unknown: 'Trending on Reddit',
};

const log10 = Math.log10;

export function ageHours(post: Pick<RedditPost, 'createdUtc'>, now: number): number {
  return Math.max(0.05, (now / 1000 - post.createdUtc) / 3600);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/** Key for "the same story posted in several subreddits". */
function storyKeys(post: RedditPost): string[] {
  const keys: string[] = [];
  if (post.url && !post.isSelf) keys.push(`u:${canonicalizeUrl(post.url)}`);
  const title = phraseKey(post.title);
  if (title.split(' ').length >= 4) keys.push(`t:${title}`);
  return keys;
}

/** Counts, for each post, how many *other subreddits* in the set carry the same story. */
export function crossSubredditCounts(posts: readonly RedditPost[]): Map<string, number> {
  const byKey = new Map<string, Set<string>>();
  for (const p of posts) {
    for (const k of storyKeys(p)) {
      const subs = byKey.get(k) ?? new Set<string>();
      subs.add(p.subreddit.toLowerCase());
      byKey.set(k, subs);
    }
  }
  const out = new Map<string, number>();
  for (const p of posts) {
    let best = 0;
    for (const k of storyKeys(p)) best = Math.max(best, (byKey.get(k)?.size ?? 1) - 1);
    out.set(p.id, best);
  }
  return out;
}

export function scorePosts(posts: readonly RedditPost[], ctx: RankContext): ScoredRedditPost[] {
  const cross = crossSubredditCounts(posts);
  const preferred = new Set((ctx.preferredSubreddits ?? []).map((s) => s.toLowerCase()));

  // velocity baseline for relative growth classification
  const velocities = posts
    .filter((p) => p.score !== undefined)
    .map((p) => (p.score ?? 0) / (ageHours(p, ctx.now) + 1));
  const baseline = Math.max(median(velocities), 0.5);

  return posts.map((post): ScoredRedditPost => {
    const age = ageHours(post, ctx.now);
    const hasStats = post.score !== undefined;
    const score = post.score ?? 0;
    const comments = post.numComments ?? 0;
    const scoreVelocity = score / (age + 1);
    const commentVelocity = comments / (age + 1);
    const crossCount = (cross.get(post.id) ?? 0) + (post.numCrossposts > 0 ? 1 : 0);

    const recency = WEIGHTS.recencyFloor + 0.5 ** (age / WEIGHTS.recencyHalfLifeHours);
    const delta = ctx.deltas?.[post.id];

    let trendingScore: number;
    let growth: GrowthLevel;

    if (hasStats) {
      const engagementVelocity = 1 + WEIGHTS.engagementLogScale * log10(1 + scoreVelocity);
      const commentFactor = 1 + WEIGHTS.commentLogScale * log10(1 + commentVelocity);
      const popularity =
        1 +
        WEIGHTS.totalEngagement * log10(1 + score) +
        WEIGHTS.crossSubreddit * Math.min(crossCount, WEIGHTS.maxCrossSubreddit) +
        WEIGHTS.extraFeed * Math.max(0, post.feeds.length - 1) +
        (preferred.has(post.subreddit.toLowerCase()) ? WEIGHTS.preferredSubreddit : 0);
      const measuredRate = delta && delta.minutes > 0 ? Math.max(0, delta.score) / (delta.minutes / 60) : 0;
      const growthBoost = 1 + WEIGHTS.growth * log10(1 + measuredRate / 10);
      trendingScore = recency * engagementVelocity * commentFactor * popularity * growthBoost;

      if (delta && delta.minutes >= 2) {
        const accel = measuredRate / Math.max(scoreVelocity, 1);
        growth = accel >= 2 ? 'surging' : accel >= 1.2 ? 'rising' : accel >= 0.5 ? 'steady' : 'cooling';
      } else {
        const ratio = scoreVelocity / baseline;
        growth =
          ratio >= WEIGHTS.surgingRatio && age < 12
            ? 'surging'
            : ratio >= WEIGHTS.risingRatio
              ? 'rising'
              : ratio >= WEIGHTS.steadyRatio
                ? 'steady'
                : 'cooling';
      }
    } else {
      // Feed-only providers (RSS) expose order but no counts: rank by Reddit's own
      // position, nudged by recency and appearing in several listings.
      const positional = 1 + 2 / (1 + post.rank * 0.35);
      trendingScore = recency * positional * (1 + WEIGHTS.extraFeed * Math.max(0, post.feeds.length - 1));
      growth = 'unknown';
    }

    const scored: ScoredRedditPost = {
      ...post,
      trendingScore,
      scoreVelocity,
      commentVelocity,
      crossSubredditCount: crossCount,
      growth,
      growthLabel: GROWTH_LABELS[growth],
      statsEstimated: !hasStats,
    };
    if (delta) scored.delta = delta;
    return scored;
  });
}

function takeDistinct<T extends ScoredRedditPost>(sorted: T[], limit: number, perSubreddit = Infinity): T[] {
  const out: T[] = [];
  const counts = new Map<string, number>();
  for (const p of sorted) {
    const key = p.subreddit.toLowerCase();
    const n = counts.get(key) ?? 0;
    if (n >= perSubreddit) continue;
    counts.set(key, n + 1);
    out.push(p);
    if (out.length >= limit) break;
  }
  return out;
}

/** Splits scored posts into the four sections of the Trending tab. */
export function categorize(scored: readonly ScoredRedditPost[], ctx: RankContext, limit: number): RedditCategories {
  const hasStats = scored.some((p) => !p.statsEstimated);

  const hot = takeDistinct(
    [...scored].sort((a, b) => b.trendingScore - a.trendingScore),
    limit,
    hasStats ? 4 : 3,
  );

  // 📈 Rising Fast — young posts with the steepest upvote curve
  const young = scored.filter((p) => ageHours(p, ctx.now) <= 12);
  const risingPool = hasStats ? young.filter((p) => (p.score ?? 0) >= 15) : young.filter((p) => p.feeds.includes('rising'));
  const rising = takeDistinct(
    [...risingPool].sort((a, b) => {
      const boost = (p: ScoredRedditPost) => (p.feeds.includes('rising') ? 1.5 : 1) * (p.growth === 'surging' ? 1.3 : 1);
      return hasStats
        ? b.scoreVelocity * boost(b) - a.scoreVelocity * boost(a)
        : a.rank - b.rank;
    }),
    limit,
    3,
  );

  // 💬 Most Discussed — comment volume, softly weighted toward recent activity
  const discussed = hasStats
    ? takeDistinct(
        scored
          .filter((p) => (p.numComments ?? 0) >= 25)
          .sort((a, b) => discussionScore(b, ctx.now) - discussionScore(a, ctx.now)),
        limit,
        3,
      )
    : [];

  // 🌎 Across Reddit — stories that broke out of one community, then a diverse fill
  const crossPosted = scored
    .filter((p) => p.crossSubredditCount > 0)
    .sort((a, b) => b.crossSubredditCount - a.crossSubredditCount || b.trendingScore - a.trendingScore);
  const across = takeDistinct(
    [...crossPosted, ...[...scored].sort((a, b) => b.trendingScore - a.trendingScore)].filter(
      (p, i, arr) => arr.findIndex((q) => q.id === p.id) === i,
    ),
    limit,
    1,
  );

  return { hot, rising, discussed, across };
}

function discussionScore(p: ScoredRedditPost, now: number): number {
  const age = ageHours(p, now);
  const freshness = 0.4 + 0.6 * 0.5 ** (age / 18);
  return (p.numComments ?? 0) * freshness * (1 + 0.5 * log10(1 + p.commentVelocity));
}

/** Convenience: score + categorize in one call. */
export function rankReddit(posts: readonly RedditPost[], ctx: RankContext, limit: number): RedditCategories {
  return categorize(scorePosts(posts, ctx), ctx, limit);
}

/** Merge listings fetched from several feeds: union by id, remember where each was seen. */
export function mergePosts(lists: readonly RedditPost[][]): RedditPost[] {
  const byId = new Map<string, RedditPost>();
  for (const list of lists) {
    for (const post of list) {
      const existing = byId.get(post.id);
      if (!existing) {
        byId.set(post.id, { ...post, feeds: [...post.feeds] });
        continue;
      }
      for (const f of post.feeds) if (!existing.feeds.includes(f)) existing.feeds.push(f);
      existing.rank = Math.min(existing.rank, post.rank);
      // prefer the freshest counts
      if (post.score !== undefined && (existing.score ?? -1) < post.score) existing.score = post.score;
      if (post.numComments !== undefined && (existing.numComments ?? -1) < post.numComments) {
        existing.numComments = post.numComments;
      }
    }
  }
  return [...byId.values()];
}
