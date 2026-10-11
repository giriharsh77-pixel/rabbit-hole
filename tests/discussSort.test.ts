import { describe, expect, it } from 'vitest';
import { createServices } from '../src/background/container';
import { MemoryStore } from '../src/services/cacheService';
import { settleLimited } from '../src/services/redditService';
import type { DiscussSubject } from '../src/services/reddit/aboutTitle';
import { orderThreads } from '../src/popup/threadOrder';
import type { AsyncState } from '../src/popup/hooks';
import type { RedditSearchResponse, ScoredRedditPost } from '../src/types/reddit';
import { AppError } from '../src/utils/errors';
import { jsonResponse, listing, mockFetch } from './helpers';

const t = (id: string, hoursAgo: number) => ({ id, createdUtc: 1_800_000_000 - hoursAgo * 3600, title: id }) as ScoredRedditPost;
const ok = (posts: ScoredRedditPost[]): AsyncState<RedditSearchResponse> => ({ status: 'success', data: { posts, meta: { provider: 'json', fetchedAt: 0 }, query: 'q' }, error: undefined });
const loading: AsyncState<RedditSearchResponse> = { status: 'loading', data: undefined, error: undefined };
const failed: AsyncState<RedditSearchResponse> = { status: 'error', data: undefined, error: { code: 'RATE_LIMITED', message: 'x', retryable: true } };

describe('Most relevant ⇄ Newest', () => {
  const relevant = ok([t('old', 400), t('mid', 30), t('recent', 2)]);

  it('Most relevant keeps Reddit’s relevance order', () => {
    expect(orderThreads(relevant, null, 'relevance').posts.map((p) => p.id)).toEqual(['old', 'mid', 'recent']);
  });

  it('Newest re-sorts what is already found at once, while it asks Reddit for newer threads', () => {
    const v = orderThreads(relevant, loading, 'new');
    expect(v.status).toBe('success');
    expect(v.posts.map((p) => p.id)).toEqual(['recent', 'mid', 'old']);
    expect(v.checkingNewer).toBe(true);
  });

  it('then folds in Reddit’s newest matches, without duplicates', () => {
    const v = orderThreads(relevant, ok([t('brandnew', 1), t('recent', 2)]), 'new');
    expect(v.posts.map((p) => p.id)).toEqual(['brandnew', 'recent', 'mid', 'old']);
    expect(v.checkingNewer).toBe(false);
  });

  it('if Reddit won’t answer for newer threads, the sorted list stays — with a note, not an error', () => {
    const v = orderThreads(relevant, failed, 'new');
    expect(v.status).toBe('success');
    expect(v.newerFailed).toBe(true);
    expect(v.posts).toHaveLength(3);
    expect(orderThreads(failed, failed, 'new').status).toBe('error');
    expect(orderThreads(loading, null, 'new').status).toBe('loading');
  });
});

describe('Reddit requests are paced', () => {
  it('runs two at a time and stops after a rate limit, keeping what it has', async () => {
    let running = 0;
    let peak = 0;
    const started: number[] = [];
    const job = (i: number, fail = false) => async () => {
      started.push(i);
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      if (fail) throw new AppError('RATE_LIMITED', 'slow down');
      return i;
    };
    const res = await settleLimited([job(0), job(1, true), job(2), job(3), job(4)], 2);
    expect(peak).toBe(2);
    expect(started).not.toContain(4); // nothing new starts after the 429
    expect(res.filter((r) => r.status === 'fulfilled').map((r) => (r as PromiseFulfilledResult<number>).value)).toContain(0);
  });

  const subject: DiscussSubject = { title: 'The Office', kind: 'series', ownSubreddit: 'DunderMifflin', episodeName: 'Basketball', names: ['Steve Carell'] };

  it('Discuss shows partial results when Reddit starts rate-limiting mid-way', async () => {
    const fetchImpl = mockFetch((url) => {
      if (!url.hostname.endsWith('reddit.com')) return undefined;
      if (url.pathname.startsWith('/r/DunderMifflin/')) return jsonResponse(listing([{ id: 'own001', title: 'The Office rewatch', subreddit: 'DunderMifflin' }]));
      return new Response('slow down', { status: 429 });
    });
    const services = createServices({ local: new MemoryStore(), session: new MemoryStore(), fetchImpl });
    const r = await services.reddit.discuss(subject);
    expect(r.posts.map((p) => p.id)).toEqual(['own001']);
    expect(fetchImpl.calls.length).toBeLessThanOrEqual(3);
  });

  it('says “rate-limiting” rather than “blocked” when the fallback is only being throttled', async () => {
    const fetchImpl = mockFetch((url) => {
      if (url.pathname.endsWith('.json')) return new Response('blocked', { status: 403 });
      if (url.pathname.endsWith('.rss')) return new Response('slow down', { status: 429 });
      return undefined;
    });
    const services = createServices({ local: new MemoryStore(), session: new MemoryStore(), fetchImpl });
    await expect(services.reddit.discuss(subject)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });
});
