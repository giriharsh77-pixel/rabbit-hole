import type { RedditPost } from '../src/types/reddit';

/** Fixed "now" (seconds → ms) so age-dependent maths is deterministic. */
export const NOW = Date.UTC(2026, 9, 7, 12, 0, 0);
export const NOW_S = NOW / 1000;

export function post(over: Partial<RedditPost> & { ageHours?: number } = {}): RedditPost {
  const { ageHours = 3, ...rest } = over;
  const id = rest.id ?? Math.random().toString(36).slice(2, 8);
  return {
    id,
    title: `Story ${id.repeat(3)} explores something interesting happening today`,
    subreddit: 'technology',
    permalink: `https://www.reddit.com/r/technology/comments/${id}/x/`,
    preview: '',
    isSelf: true,
    numCrossposts: 0,
    createdUtc: NOW_S - ageHours * 3600,
    over18: false,
    stickied: false,
    feeds: ['hot'],
    rank: 0,
    score: 1000,
    numComments: 100,
    ...rest,
  };
}

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    ...init,
  });
}

export type Route = (url: URL, init?: RequestInit) => Response | Promise<Response> | undefined;

/** A fetch double driven by route functions; unmatched requests fail loudly. */
export function mockFetch(...routes: Route[]): typeof fetch & { calls: string[] } {
  const calls: string[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    calls.push(url.href);
    for (const route of routes) {
      const res = await route(url, init);
      if (res) return res;
    }
    throw new Error(`unmocked request: ${url.href}`);
  }) as typeof fetch & { calls: string[] };
  fn.calls = calls;
  return fn;
}

export function listing(posts: { id: string; title?: string; subreddit?: string; score?: number; comments?: number; ageHours?: number; url?: string }[]) {
  return {
    data: {
      children: posts.map((p) => ({
        kind: 't3',
        data: {
          id: p.id,
          title: p.title ?? `Post ${p.id.repeat(3)} has a perfectly reasonable title`,
          subreddit: p.subreddit ?? 'technology',
          author: 'someone',
          permalink: `/r/${p.subreddit ?? 'technology'}/comments/${p.id}/x/`,
          url: p.url ?? `https://example.com/${p.id}`,
          domain: 'example.com',
          selftext: '',
          is_self: false,
          thumbnail: 'default',
          score: p.score ?? 500,
          num_comments: p.comments ?? 50,
          upvote_ratio: 0.9,
          num_crossposts: 0,
          created_utc: NOW / 1000 - (p.ageHours ?? 2) * 3600,
          over_18: false,
          stickied: false,
        },
      })),
    },
  };
}
