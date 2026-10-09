export type FeedKind = 'hot' | 'rising' | 'top' | 'new' | 'search';

/** The four sections shown in the Trending Reddit tab. */
export type RedditCategoryId = 'hot' | 'rising' | 'discussed' | 'across';

/** A normalised Reddit thread, whichever provider it came from. */
export interface RedditPost {
  /** Base-36 id without the `t3_` prefix. */
  id: string;
  title: string;
  /** Subreddit name without `r/`. */
  subreddit: string;
  author?: string;
  /** Absolute https://www.reddit.com/… URL of the discussion. */
  permalink: string;
  /** Link target for link posts (absolute https URL), if any. */
  url?: string;
  domain?: string;
  /** Plain-text preview (already stripped + truncated). */
  preview: string;
  isSelf: boolean;
  /** Allow-listed https image URL, if any. */
  thumbnail?: string;
  /** Upvote score; undefined when the provider can't supply it (RSS). */
  score?: number;
  numComments?: number;
  upvoteRatio?: number;
  numCrossposts: number;
  /** Seconds since epoch. */
  createdUtc: number;
  over18: boolean;
  stickied: boolean;
  flair?: string;
  /** Which listings this post was seen in during the fetch (hot/rising/…). */
  feeds: FeedKind[];
  /** Best (lowest) position in any listing; used by RSS-only ranking. */
  rank: number;
}

export type GrowthLevel = 'surging' | 'rising' | 'steady' | 'cooling' | 'unknown';

export interface ScoredRedditPost extends RedditPost {
  trendingScore: number;
  /** Mean upvotes / hour since posting. */
  scoreVelocity: number;
  /** Mean comments / hour since posting. */
  commentVelocity: number;
  /** How many other posts in the set share this link/headline in other subs. */
  crossSubredditCount: number;
  growth: GrowthLevel;
  growthLabel: string;
  /** Measured change since the previous snapshot, when we have one. */
  delta?: { score: number; comments: number; minutes: number };
  /** True if stats came from a provider that doesn't expose them. */
  statsEstimated: boolean;
}

export interface RedditCategories {
  hot: ScoredRedditPost[];
  rising: ScoredRedditPost[];
  discussed: ScoredRedditPost[];
  across: ScoredRedditPost[];
}

export interface TopicFilter {
  id: string;
  label: string;
  emoji: string;
  /** Empty = all of Reddit (r/all). */
  subreddits: string[];
}

export type RedditProviderId = 'oauth' | 'json' | 'rss';

export interface RedditFetchMeta {
  provider: RedditProviderId;
  fetchedAt: number;
  /** Providers that were tried first and failed, with why. */
  degradedFrom?: { provider: RedditProviderId; code: string }[];
}

export interface TrendingResponse {
  categories: RedditCategories;
  meta: RedditFetchMeta;
  topicId: string;
  /** True when served from cache that has passed its TTL (refresh in flight). */
  stale?: boolean;
}

export interface RedditSearchResponse {
  posts: ScoredRedditPost[];
  meta: RedditFetchMeta;
  query: string;
}
