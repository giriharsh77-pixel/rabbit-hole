/**
 * cacheService — aggressive, privacy-preserving caching.
 *
 *  • Two tiers: an in-memory Map (fast, dies with the service worker) in front
 *    of `chrome.storage.session` (survives worker restarts but is kept in RAM
 *    and wiped when the browser closes — nothing is written to disk).
 *  • TTL per entry. Expired entries can still be served as a fallback when the
 *    network fails ("stale-if-error").
 *  • In-flight de-duplication: identical concurrent requests share one fetch.
 *    Cancellation is reference counted — the underlying request is only
 *    aborted when *every* waiter has gone away.
 *
 * TTLs used by the extension (see TTL below):
 *    Reddit search 5 min · Substack search 10 min · page context until the tab changes
 */
import { abortError, raceAbort } from '../utils/abort';
import { serializeError, toAppError } from '../utils/errors';
import type { SerializedError } from '../types/errors';

export const TTL = {
  redditSearch: 5 * 60_000,
  substackSearch: 10 * 60_000,
  substackFeed: 30 * 60_000,
  aiAnalysis: 60 * 60_000,
  /** Safety net only: page context is dropped as soon as its tab navigates or closes. */
  pageContext: 6 * 60 * 60_000,
  /** How long an expired entry may still be served when a refresh fails. */
  staleGrace: 6 * 60 * 60_000,
} as const;

// ─── storage backends ────────────────────────────────────────────────────────

export interface KeyValueStore {
  getMany(keys: string[]): Promise<Record<string, unknown>>;
  setMany(items: Record<string, unknown>): Promise<void>;
  removeMany(keys: string[]): Promise<void>;
  /** Wipes everything in this store. */
  clearAll(): Promise<void>;
}

export class MemoryStore implements KeyValueStore {
  readonly data = new Map<string, unknown>();
  async getMany(keys: string[]): Promise<Record<string, unknown>> {
    const out: Record<string, unknown> = {};
    for (const k of keys) if (this.data.has(k)) out[k] = structuredClone(this.data.get(k));
    return out;
  }
  async setMany(items: Record<string, unknown>): Promise<void> {
    for (const [k, v] of Object.entries(items)) this.data.set(k, structuredClone(v));
  }
  async removeMany(keys: string[]): Promise<void> {
    for (const k of keys) this.data.delete(k);
  }
  async clearAll(): Promise<void> {
    this.data.clear();
  }
}

/** Adapter over a chrome.storage area (`session` for caches, `local` for settings). */
export class ChromeAreaStore implements KeyValueStore {
  constructor(private readonly area: chrome.storage.StorageArea) {}
  async getMany(keys: string[]): Promise<Record<string, unknown>> {
    return (await this.area.get(keys)) as Record<string, unknown>;
  }
  async setMany(items: Record<string, unknown>): Promise<void> {
    await this.area.set(items);
  }
  async removeMany(keys: string[]): Promise<void> {
    await this.area.remove(keys);
  }
  async clearAll(): Promise<void> {
    await this.area.clear();
  }
}

/** Picks the best available cache backend for the current context. */
export function createSessionStore(): KeyValueStore {
  const area = typeof chrome !== 'undefined' ? chrome.storage?.session : undefined;
  return area ? new ChromeAreaStore(area) : new MemoryStore();
}

// ─── in-flight registry ──────────────────────────────────────────────────────

interface Inflight {
  promise: Promise<unknown>;
  controller: AbortController;
  waiters: number;
}

export class InflightRegistry {
  private readonly map = new Map<string, Inflight>();

  get size(): number {
    return this.map.size;
  }

  /**
   * Runs `factory` once per key at a time.  Late callers join the pending
   * promise.  A caller's `signal` only detaches that caller; the shared work is
   * aborted when the last waiter leaves.
   */
  run<T>(key: string, factory: (signal: AbortSignal) => Promise<T>, callerSignal?: AbortSignal): Promise<T> {
    if (callerSignal?.aborted) return Promise.reject(abortError());

    let entry = this.map.get(key);
    if (!entry) {
      const controller = new AbortController();
      const promise = factory(controller.signal).finally(() => {
        if (this.map.get(key) === created) this.map.delete(key);
      });
      // Avoid "unhandled rejection" noise when every waiter has detached.
      promise.catch(() => undefined);
      const created: Inflight = { promise, controller, waiters: 0 };
      this.map.set(key, created);
      entry = created;
    }

    const shared = entry;
    shared.waiters++;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      shared.waiters--;
      if (shared.waiters <= 0 && this.map.get(key) === shared) {
        this.map.delete(key);
        shared.controller.abort();
      }
    };

    const waiting = raceAbort(shared.promise as Promise<T>, callerSignal);
    return waiting.then(
      (v) => {
        released = true;
        shared.waiters--;
        return v;
      },
      (e) => {
        release();
        throw e;
      },
    );
  }
}

// ─── cache ───────────────────────────────────────────────────────────────────

interface Entry<T> {
  v: T;
  /** Absolute expiry (ms). */
  exp: number;
  /** Stored-at (ms). */
  at: number;
}

type Index = Record<string, { at: number; exp: number }>;

export interface CacheHit<T> {
  value: T;
  fresh: boolean;
  ageMs: number;
  storedAt: number;
}

export interface CacheServiceOptions {
  prefix?: string;
  now?: () => number;
  maxEntries?: number;
  staleGraceMs?: number;
}

export interface FetchResult<T> {
  value: T;
  fromCache: boolean;
  /** Served past its TTL, because a refresh failed. */
  stale: boolean;
  fetchedAt: number;
  /** Set when `stale` is true: why the refresh failed. */
  error?: SerializedError;
}

export class CacheService {
  private readonly mem = new Map<string, Entry<unknown>>();
  private readonly inflight = new InflightRegistry();
  private index: Index | undefined;
  private readonly prefix: string;
  private readonly now: () => number;
  private readonly maxEntries: number;
  private readonly staleGraceMs: number;
  private indexKey: string;

  constructor(
    private readonly store: KeyValueStore,
    opts: CacheServiceOptions = {},
  ) {
    this.prefix = opts.prefix ?? 'rh:c:';
    this.now = opts.now ?? Date.now;
    this.maxEntries = opts.maxEntries ?? 160;
    this.staleGraceMs = opts.staleGraceMs ?? TTL.staleGrace;
    this.indexKey = `${this.prefix}__index`;
  }

  private k(key: string): string {
    return `${this.prefix}${key}`;
  }

  private async loadIndex(): Promise<Index> {
    if (this.index) return this.index;
    try {
      const raw = (await this.store.getMany([this.indexKey]))[this.indexKey];
      this.index = raw && typeof raw === 'object' ? (raw as Index) : {};
    } catch {
      this.index = {};
    }
    return this.index;
  }

  private async saveIndex(): Promise<void> {
    if (!this.index) return;
    try {
      await this.store.setMany({ [this.indexKey]: this.index });
    } catch {
      /* best effort */
    }
  }

  /** Returns the entry even if expired (within the stale grace window). */
  async peek<T>(key: string): Promise<CacheHit<T> | undefined> {
    const now = this.now();
    const fullKey = this.k(key);
    let entry = this.mem.get(fullKey) as Entry<T> | undefined;
    if (!entry) {
      try {
        entry = (await this.store.getMany([fullKey]))[fullKey] as Entry<T> | undefined;
      } catch {
        entry = undefined;
      }
      if (entry && typeof entry.exp === 'number' && typeof entry.at === 'number') this.mem.set(fullKey, entry);
      else entry = undefined;
    }
    if (!entry) return undefined;
    if (now - entry.exp > this.staleGraceMs) {
      await this.delete(key);
      return undefined;
    }
    return { value: entry.v, fresh: entry.exp > now, ageMs: Math.max(0, now - entry.at), storedAt: entry.at };
  }

  /** Fresh value only. */
  async get<T>(key: string): Promise<T | undefined> {
    const hit = await this.peek<T>(key);
    return hit?.fresh ? hit.value : undefined;
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    const now = this.now();
    const entry: Entry<T> = { v: value, exp: now + ttlMs, at: now };
    const fullKey = this.k(key);
    this.mem.set(fullKey, entry);

    const index = await this.loadIndex();
    index[key] = { at: now, exp: entry.exp };

    const overflow = Object.keys(index).length - this.maxEntries;
    if (overflow > 0) {
      const oldest = Object.entries(index)
        .sort((a, b) => a[1].at - b[1].at)
        .slice(0, overflow)
        .map(([k]) => k);
      for (const k of oldest) {
        delete index[k];
        this.mem.delete(this.k(k));
      }
      await this.store.removeMany(oldest.map((k) => this.k(k))).catch(() => undefined);
    }

    try {
      await this.store.setMany({ [fullKey]: entry, [this.indexKey]: index });
    } catch {
      // Quota exceeded or storage unavailable: caching is best-effort. Drop the
      // persistent copy and keep working from memory.
      await this.store.removeMany([fullKey]).catch(() => undefined);
    }
  }

  async delete(key: string): Promise<void> {
    this.mem.delete(this.k(key));
    const index = await this.loadIndex();
    delete index[key];
    await this.store.removeMany([this.k(key)]).catch(() => undefined);
    await this.saveIndex();
  }

  /** Removes every entry whose key starts with `keyPrefix` ('' = everything). Returns the count. */
  async clear(keyPrefix = ''): Promise<number> {
    const index = await this.loadIndex();
    const victims = Object.keys(index).filter((k) => k.startsWith(keyPrefix));
    for (const k of victims) {
      delete index[k];
      this.mem.delete(this.k(k));
    }
    // Also drop memory-only stragglers
    for (const fk of [...this.mem.keys()]) {
      if (fk.startsWith(this.k(keyPrefix))) this.mem.delete(fk);
    }
    if (victims.length) await this.store.removeMany(victims.map((k) => this.k(k))).catch(() => undefined);
    await this.saveIndex();
    return victims.length;
  }

  /**
   * Cache-through fetch.
   *  - fresh hit → returned immediately
   *  - miss / expired → `fetcher` runs (de-duplicated across concurrent callers)
   *  - fetch fails but an expired entry exists → the stale value is returned
   *    with `stale: true` and the error, instead of surfacing a failure
   */
  async getOrFetch<T>(
    key: string,
    ttlMs: number,
    fetcher: (signal: AbortSignal) => Promise<T>,
    opts: { force?: boolean; signal?: AbortSignal; allowStale?: boolean } = {},
  ): Promise<FetchResult<T>> {
    const hit = await this.peek<T>(key);
    if (hit?.fresh && !opts.force) {
      return { value: hit.value, fromCache: true, stale: false, fetchedAt: hit.storedAt };
    }

    try {
      const value = await this.inflight.run(
        key,
        async (signal) => {
          const fresh = await fetcher(signal);
          await this.set(key, fresh, ttlMs);
          return fresh;
        },
        opts.signal,
      );
      return { value, fromCache: false, stale: false, fetchedAt: this.now() };
    } catch (err) {
      const appErr = toAppError(err);
      if (appErr.code !== 'ABORTED' && hit && (opts.allowStale ?? true)) {
        return { value: hit.value, fromCache: true, stale: true, fetchedAt: hit.storedAt, error: serializeError(appErr) };
      }
      throw appErr;
    }
  }
}
