import { describe, expect, it, vi } from 'vitest';
import { CacheService, InflightRegistry, MemoryStore, TTL, type KeyValueStore } from '../src/services/cacheService';
import { AppError } from '../src/utils/errors';

function setup(opts: { maxEntries?: number; store?: KeyValueStore } = {}) {
  let now = 1_000_000;
  const store = opts.store ?? new MemoryStore();
  const cache = new CacheService(store, { now: () => now, ...(opts.maxEntries ? { maxEntries: opts.maxEntries } : {}) });
  return { cache, store, advance: (ms: number) => (now += ms), clock: () => now };
}

const deferred = <T>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('TTLs', () => {
  it('uses the product’s cache lifetimes', () => {
    expect(TTL.redditTrending).toBe(5 * 60_000);
    expect(TTL.substackSearch).toBe(10 * 60_000);
  });

  it('serves fresh entries and expires them on time', async () => {
    const { cache, advance } = setup();
    await cache.set('k', { n: 1 }, TTL.redditTrending);
    expect(await cache.get('k')).toEqual({ n: 1 });
    advance(TTL.redditTrending - 1);
    expect(await cache.get('k')).toEqual({ n: 1 });
    advance(2);
    expect(await cache.get('k')).toBeUndefined();
  });

  it('still lets callers see an expired entry (for stale-if-error) until the grace window ends', async () => {
    const { cache, advance } = setup();
    await cache.set('k', 'v', 1000);
    advance(5000);
    expect(await cache.peek('k')).toMatchObject({ value: 'v', fresh: false });
    advance(TTL.staleGrace);
    expect(await cache.peek('k')).toBeUndefined();
  });

  it('survives a worker restart: a new instance on the same store sees prior entries', async () => {
    const { cache, store, clock } = setup();
    await cache.set('k', 'persisted', 60_000);
    const reborn = new CacheService(store, { now: clock });
    expect(await reborn.get('k')).toBe('persisted');
  });
});

describe('getOrFetch', () => {
  it('fetches once, then serves from cache', async () => {
    const { cache } = setup();
    const fetcher = vi.fn(async () => 'data');
    const a = await cache.getOrFetch('k', 60_000, fetcher);
    const b = await cache.getOrFetch('k', 60_000, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(a).toMatchObject({ value: 'data', fromCache: false, stale: false });
    expect(b).toMatchObject({ value: 'data', fromCache: true, stale: false });
  });

  it('refetches when forced', async () => {
    const { cache } = setup();
    let n = 0;
    const fetcher = async () => ++n;
    await cache.getOrFetch('k', 60_000, fetcher);
    const forced = await cache.getOrFetch('k', 60_000, fetcher, { force: true });
    expect(forced.value).toBe(2);
  });

  it('returns stale data (flagged) with the reason when a refresh fails', async () => {
    const { cache, advance } = setup();
    await cache.set('k', 'old', 1000);
    advance(2000);
    const result = await cache.getOrFetch('k', 1000, async () => {
      throw new AppError('RATE_LIMITED', 'slow down');
    });
    expect(result).toMatchObject({ value: 'old', stale: true, fromCache: true });
    expect(result.error?.code).toBe('RATE_LIMITED');
  });

  it('surfaces the error when there is nothing cached to fall back on', async () => {
    const { cache } = setup();
    await expect(cache.getOrFetch('k', 1000, async () => Promise.reject(new AppError('UNAVAILABLE', 'down')))).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });

  it('does not cache failures', async () => {
    const { cache } = setup();
    await cache.getOrFetch('k', 1000, async () => Promise.reject(new Error('x'))).catch(() => undefined);
    expect(await cache.get('k')).toBeUndefined();
  });
});

describe('duplicate request suppression', () => {
  it('shares one in-flight request between concurrent callers', async () => {
    const { cache } = setup();
    const d = deferred<string>();
    const fetcher = vi.fn(() => d.promise);
    const [p1, p2, p3] = [cache.getOrFetch('k', 1000, fetcher), cache.getOrFetch('k', 1000, fetcher), cache.getOrFetch('k', 1000, fetcher)];
    d.resolve('once');
    expect((await Promise.all([p1, p2, p3])).map((r) => r.value)).toEqual(['once', 'once', 'once']);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('only aborts the shared request when every waiter has left', async () => {
    const registry = new InflightRegistry();
    let sharedSignal!: AbortSignal;
    const d = deferred<string>();
    const factory = (signal: AbortSignal) => {
      sharedSignal = signal;
      return d.promise;
    };
    const a = new AbortController();
    const b = new AbortController();
    const pa = registry.run('k', factory, a.signal);
    const pb = registry.run('k', factory, b.signal);

    a.abort();
    await expect(pa).rejects.toMatchObject({ code: 'ABORTED' });
    expect(sharedSignal.aborted).toBe(false); // b is still waiting

    b.abort();
    await expect(pb).rejects.toMatchObject({ code: 'ABORTED' });
    expect(sharedSignal.aborted).toBe(true);
    d.resolve('late');
  });

  it('lets a surviving waiter receive the result after another cancels', async () => {
    const registry = new InflightRegistry();
    const d = deferred<string>();
    const a = new AbortController();
    const pa = registry.run('k', () => d.promise, a.signal);
    const pb = registry.run('k', () => d.promise);
    a.abort();
    d.resolve('ok');
    await expect(pa).rejects.toMatchObject({ code: 'ABORTED' });
    await expect(pb).resolves.toBe('ok');
  });

  it('starts a fresh request after the previous one settled', async () => {
    const registry = new InflightRegistry();
    const factory = vi.fn(async () => 1);
    await registry.run('k', factory);
    await registry.run('k', factory);
    expect(factory).toHaveBeenCalledTimes(2);
    expect(registry.size).toBe(0);
  });

  it('rejects immediately for an already-aborted caller', async () => {
    const registry = new InflightRegistry();
    const c = new AbortController();
    c.abort();
    await expect(registry.run('k', async () => 1, c.signal)).rejects.toMatchObject({ code: 'ABORTED' });
  });
});

describe('bounds and housekeeping', () => {
  it('evicts the oldest entries beyond the size limit', async () => {
    const { cache, advance } = setup({ maxEntries: 3 });
    for (const k of ['a', 'b', 'c', 'd']) {
      await cache.set(k, k, 60_000);
      advance(10);
    }
    expect(await cache.get('a')).toBeUndefined();
    expect(await cache.get('d')).toBe('d');
  });

  it('clears by prefix and reports how many entries went', async () => {
    const { cache } = setup();
    await cache.set('reddit:1', 1, 60_000);
    await cache.set('reddit:2', 2, 60_000);
    await cache.set('substack:1', 3, 60_000);
    expect(await cache.clear('reddit:')).toBe(2);
    expect(await cache.get('substack:1')).toBe(3);
    expect(await cache.clear()).toBe(1);
  });

  it('keeps working from memory when storage writes fail (quota exceeded)', async () => {
    const failing: KeyValueStore = {
      getMany: async () => ({}),
      setMany: async () => {
        throw new Error('QUOTA_BYTES quota exceeded');
      },
      removeMany: async () => undefined,
      clearAll: async () => undefined,
    };
    const { cache } = setup({ store: failing });
    await expect(cache.set('k', 'v', 60_000)).resolves.toBeUndefined();
    expect(await cache.get('k')).toBe('v');
  });
});
