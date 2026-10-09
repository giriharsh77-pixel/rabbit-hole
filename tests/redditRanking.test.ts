import { describe, expect, it } from 'vitest';
import { categorize, crossSubredditCounts, mergePosts, rankReddit, scorePosts } from '../src/services/rankingService';
import { NOW, post } from './helpers';

const ctx = { now: NOW };

describe('trending score', () => {
  it('prefers a fresh, fast-growing thread over an older thread with a bigger total', () => {
    const fresh = post({ id: 'fresh', ageHours: 2, score: 3000, numComments: 400 });
    const old = post({ id: 'old', ageHours: 22, score: 40000, numComments: 3000 });
    const [f, o] = scorePosts([fresh, old], ctx);
    expect(f!.trendingScore).toBeGreaterThan(o!.trendingScore);
  });

  it('rewards comment velocity at equal upvotes', () => {
    const quiet = post({ id: 'quiet', score: 2000, numComments: 20 });
    const chatty = post({ id: 'chatty', score: 2000, numComments: 900 });
    const [q, c] = scorePosts([quiet, chatty], ctx);
    expect(c!.trendingScore).toBeGreaterThan(q!.trendingScore);
  });

  it('boosts threads present in several listings and in preferred subreddits', () => {
    const base = post({ id: 'a', subreddit: 'science' });
    const multi = post({ id: 'b', subreddit: 'science', feeds: ['hot', 'rising', 'top'] });
    const [a, b] = scorePosts([base, multi], ctx);
    expect(b!.trendingScore).toBeGreaterThan(a!.trendingScore);

    const [plain] = scorePosts([base], ctx);
    const [boosted] = scorePosts([base], { ...ctx, preferredSubreddits: ['Science'] });
    expect(boosted!.trendingScore).toBeGreaterThan(plain!.trendingScore);
  });

  it('boosts measurably growing threads using snapshot deltas', () => {
    const p = post({ id: 'g', score: 2000, ageHours: 4 });
    const [without] = scorePosts([p], ctx);
    const [withDelta] = scorePosts([p], { ...ctx, deltas: { g: { score: 900, comments: 80, minutes: 10 } } });
    expect(withDelta!.trendingScore).toBeGreaterThan(without!.trendingScore);
    expect(withDelta!.delta).toEqual({ score: 900, comments: 80, minutes: 10 });
  });

  it('classifies growth from measured acceleration when a snapshot exists', () => {
    const p = post({ id: 'g', score: 1200, ageHours: 6 }); // ≈ 171 upvotes/hour on average
    const fast = scorePosts([p], { ...ctx, deltas: { g: { score: 400, comments: 10, minutes: 10 } } })[0]!; // 2400/hour now
    const flat = scorePosts([p], { ...ctx, deltas: { g: { score: 2, comments: 0, minutes: 10 } } })[0]!;
    expect(fast.growth).toBe('surging');
    expect(fast.growthLabel).toBe('Growing rapidly');
    expect(flat.growth).toBe('cooling');
  });

  it('classifies growth relative to the set when there is no snapshot', () => {
    const hot = post({ id: 'h', score: 30000, ageHours: 1.5 });
    const meh = [1, 2, 3, 4].map((i) => post({ id: `m${i}`, score: 300, ageHours: 8 }));
    const scored = scorePosts([hot, ...meh], ctx);
    expect(scored[0]!.growth).toBe('surging');
    expect(scored[1]!.growth).not.toBe('surging');
  });
});

describe('cross-subreddit popularity', () => {
  it('counts the same link posted in other communities', () => {
    const link = 'https://example.com/big-story?utm_source=x';
    const posts = [
      post({ id: 'a', subreddit: 'technology', url: link, isSelf: false }),
      post({ id: 'b', subreddit: 'worldnews', url: 'https://example.com/big-story', isSelf: false }),
      post({ id: 'c', subreddit: 'news', url: 'https://example.com/big-story#frag', isSelf: false }),
      post({ id: 'd', subreddit: 'science', url: 'https://example.com/other', isSelf: false }),
    ];
    const counts = crossSubredditCounts(posts);
    expect(counts.get('a')).toBe(2);
    expect(counts.get('b')).toBe(2);
    expect(counts.get('d')).toBe(0);
  });

  it('does not count duplicates inside one subreddit', () => {
    const posts = [
      post({ id: 'a', url: 'https://example.com/x', isSelf: false }),
      post({ id: 'b', url: 'https://example.com/x', isSelf: false }),
    ];
    expect(crossSubredditCounts(posts).get('a')).toBe(0);
  });
});

describe('categories', () => {
  const posts = [
    post({ id: 'rocket', ageHours: 1, score: 8000, numComments: 300, subreddit: 'a', feeds: ['hot', 'rising'] }),
    post({ id: 'talker', ageHours: 9, score: 4000, numComments: 6000, subreddit: 'b' }),
    post({ id: 'ancient', ageHours: 40, score: 90000, numComments: 2000, subreddit: 'c' }),
    post({ id: 'tiny', ageHours: 1, score: 3, numComments: 0, subreddit: 'd' }),
    post({ id: 'quiet', ageHours: 5, score: 900, numComments: 4, subreddit: 'e' }),
  ];

  it('builds the four sections', () => {
    const c = rankReddit(posts, ctx, 10);
    expect(c.hot[0]!.id).toBe('rocket');
    expect(c.rising.map((p) => p.id)).toContain('rocket');
    expect(c.rising.map((p) => p.id)).not.toContain('ancient'); // too old to be "rising"
    expect(c.rising.map((p) => p.id)).not.toContain('tiny'); // below the noise floor
    expect(c.discussed[0]!.id).toBe('talker');
    expect(c.discussed.map((p) => p.id)).not.toContain('quiet'); // < 25 comments
  });

  it('puts cross-posted stories first in "Across Reddit" and keeps one thread per community', () => {
    const shared = 'https://example.com/story';
    const set = [
      post({ id: 'x1', subreddit: 'a', url: shared, isSelf: false, score: 100 }),
      post({ id: 'x2', subreddit: 'b', url: shared, isSelf: false, score: 100 }),
      post({ id: 'y1', subreddit: 'c', score: 9000 }),
      post({ id: 'y2', subreddit: 'c', score: 8000 }),
    ];
    const { across } = rankReddit(set, ctx, 10);
    expect(across.slice(0, 2).map((p) => p.id).sort()).toEqual(['x1', 'x2']);
    expect(across.filter((p) => p.subreddit === 'c')).toHaveLength(1);
  });

  it('respects the requested limit', () => {
    const many = Array.from({ length: 40 }, (_, i) => post({ id: `p${i}`, subreddit: `sub${i}`, score: 100 + i }));
    expect(rankReddit(many, ctx, 12).hot).toHaveLength(12);
  });
});

describe('feed-only mode (no counts)', () => {
  const feedPosts = [0, 1, 2, 3].map((i) =>
    post({ id: `f${i}`, rank: i, ageHours: 2 + i }) as ReturnType<typeof post>,
  ).map((p) => {
    const { score: _s, numComments: _c, ...rest } = p;
    return rest;
  });

  it('ranks by Reddit order and says so instead of inventing numbers', () => {
    const scored = scorePosts(feedPosts, ctx);
    expect(scored.every((p) => p.statsEstimated)).toBe(true);
    expect(scored[0]!.growth).toBe('unknown');
    expect(scored[0]!.growthLabel).toBe('Trending on Reddit');
    const cats = categorize(scored, ctx, 10);
    expect(cats.hot[0]!.id).toBe('f0');
    expect(cats.discussed).toEqual([]); // comment counts genuinely unavailable
  });
});

describe('mergePosts', () => {
  it('unions listings, tracks where a thread appeared and keeps the best rank', () => {
    const merged = mergePosts([
      [post({ id: 'a', feeds: ['hot'], rank: 7, score: 100 })],
      [post({ id: 'a', feeds: ['rising'], rank: 2, score: 140 }), post({ id: 'b', feeds: ['rising'], rank: 0 })],
    ]);
    expect(merged).toHaveLength(2);
    const a = merged.find((p) => p.id === 'a')!;
    expect(a.feeds.sort()).toEqual(['hot', 'rising']);
    expect(a.rank).toBe(2);
    expect(a.score).toBe(140);
  });
});
