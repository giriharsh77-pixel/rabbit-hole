/**
 * Discuss's "Most relevant ⇄ Newest" switch.
 *
 * "Newest" never waits on Reddit to answer: it re-sorts the threads already
 * found (newest first) straight away, then folds in Reddit's own newest matches
 * when they arrive. If Reddit won't answer — rate-limited, blocked — the sorted
 * list stays, with a note, instead of an error.
 */
import type { SerializedError } from '../types/errors';
import type { RedditSearchResponse, ScoredRedditPost } from '../types/reddit';
import type { RedditSort } from '../types/settings';
import type { AsyncState } from './hooks';

export interface ThreadView<T extends RedditSearchResponse> {
  status: 'loading' | 'success' | 'error';
  posts: ScoredRedditPost[];
  /** The response whose metadata (provider, scopes) describes what's shown. */
  data: T | undefined;
  error: SerializedError | undefined;
  /** Newest: already showing threads, still asking Reddit for newer ones. */
  checkingNewer: boolean;
  /** Newest: Reddit didn't return newer threads; these are the ones already found. */
  newerFailed: boolean;
}

export function orderThreads<T extends RedditSearchResponse>(
  relevant: AsyncState<T>,
  newest: AsyncState<T> | null,
  order: RedditSort,
  limit = 15,
): ThreadView<T> {
  const pending = (s: AsyncState<T> | null) => !s || s.status === 'loading' || s.status === 'idle';
  if (order !== 'new') {
    return {
      status: pending(relevant) ? 'loading' : relevant.status === 'error' ? 'error' : 'success',
      posts: relevant.data?.posts ?? [],
      data: relevant.data,
      error: relevant.error,
      checkingNewer: false,
      newerFailed: false,
    };
  }
  const seen = new Set<string>();
  const posts = [...(newest?.data?.posts ?? []), ...(relevant.data?.posts ?? [])]
    .filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)))
    .sort((a, b) => b.createdUtc - a.createdUtc)
    .slice(0, limit);
  const anySuccess = relevant.status === 'success' || newest?.status === 'success';
  const bothFailed = relevant.status === 'error' && (!newest || newest.status === 'error');
  const stillLooking = pending(relevant) || pending(newest);
  const status: ThreadView<T>['status'] = posts.length > 0 ? 'success' : bothFailed ? 'error' : stillLooking ? 'loading' : anySuccess ? 'success' : 'error';
  return {
    status,
    posts,
    data: newest?.data ?? relevant.data,
    error: newest?.error ?? relevant.error,
    checkingNewer: posts.length > 0 && pending(newest),
    newerFailed: posts.length > 0 && newest?.status === 'error',
  };
}
