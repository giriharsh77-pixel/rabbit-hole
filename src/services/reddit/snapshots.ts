/**
 * Snapshots: the score/comment count of each post at the previous refresh, so
 * "growing rapidly" can be *measured* (Δ upvotes per hour) rather than guessed
 * from averages.  Stored only in chrome.storage.session (RAM, cleared when the
 * browser closes) and contains nothing about the user — just public post ids
 * and counts.
 */
import type { RedditPost } from '../../types/reddit';
import type { KeyValueStore } from '../cacheService';
import type { PostDelta } from '../ranking/reddit';

interface Snapshot {
  t: number;
  /** id → [score, comments] */
  posts: Record<string, [number, number]>;
}

const MIN_INTERVAL_MS = 2 * 60_000;
const MAX_AGE_MS = 90 * 60_000;
const MAX_POSTS = 200;

export function computeDeltas(prev: Snapshot | undefined, posts: readonly RedditPost[], now: number): Record<string, PostDelta> {
  if (!prev) return {};
  const elapsed = now - prev.t;
  if (elapsed < MIN_INTERVAL_MS || elapsed > MAX_AGE_MS) return {};
  const out: Record<string, PostDelta> = {};
  for (const p of posts) {
    const before = prev.posts[p.id];
    if (!before || p.score === undefined) continue;
    out[p.id] = {
      score: p.score - before[0],
      comments: (p.numComments ?? 0) - before[1],
      minutes: Math.round((elapsed / 60_000) * 10) / 10,
    };
  }
  return out;
}

export class SnapshotStore {
  constructor(
    private readonly store: KeyValueStore,
    private readonly now: () => number = Date.now,
  ) {}

  private key(topicKey: string): string {
    return `rh:snap:${topicKey}`;
  }

  /** Reads the previous snapshot, computes deltas against it, then stores the new one. */
  async rollForward(topicKey: string, posts: readonly RedditPost[]): Promise<Record<string, PostDelta>> {
    const key = this.key(topicKey);
    const now = this.now();
    let prev: Snapshot | undefined;
    try {
      prev = (await this.store.getMany([key]))[key] as Snapshot | undefined;
    } catch {
      prev = undefined;
    }
    const deltas = computeDeltas(prev, posts, now);

    // Only advance the baseline when the previous one is old enough to compare against;
    // otherwise rapid reloads would keep resetting the measurement window.
    if (!prev || now - prev.t >= MIN_INTERVAL_MS) {
      const top = [...posts].filter((p) => p.score !== undefined).sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, MAX_POSTS);
      const snapshot: Snapshot = { t: now, posts: {} };
      for (const p of top) snapshot.posts[p.id] = [p.score ?? 0, p.numComments ?? 0];
      try {
        await this.store.setMany({ [key]: snapshot });
      } catch {
        /* best effort */
      }
    }
    return deltas;
  }
}
