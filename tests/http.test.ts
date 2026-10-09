import { describe, expect, it, vi } from 'vitest';
import { AppError, describeError, fromHttpStatus, parseRetryAfter, toAppError } from '../src/utils/errors';
import { http, httpJson, httpTextHead } from '../src/utils/http';

const ok = (body: BodyInit, init: ResponseInit = {}) => new Response(body, { status: 200, ...init });
const call = (fetchImpl: typeof fetch, extra = {}) => httpJson('https://api.example.com/x', { provider: 'test', fetchImpl, ...extra });

describe('HTTP error mapping', () => {
  it.each([
    [429, 'RATE_LIMITED', true],
    [401, 'UNAUTHORIZED', false],
    [403, 'BLOCKED', false],
    [404, 'UNAVAILABLE', false],
    [500, 'UNAVAILABLE', true],
    [503, 'UNAVAILABLE', true],
    [418, 'UNKNOWN', false],
  ])('maps %i → %s (retryable=%s)', async (status, code, retryable) => {
    const err = await call((async () => new Response('', { status })) as typeof fetch).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ code, retryable, status });
  });

  it('keeps the server’s Retry-After', async () => {
    const err = await call((async () => new Response('', { status: 429, headers: { 'retry-after': '42' } })) as typeof fetch).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'RATE_LIMITED', retryAfterMs: 42_000 });
  });

  it('understands Reddit’s x-ratelimit headers when the quota is exhausted', async () => {
    const err = await call((async () => new Response('', { status: 429, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '30' } })) as typeof fetch).catch((e: unknown) => e);
    expect(err).toMatchObject({ retryAfterMs: 30_000 });
  });

  it('reports a dropped connection as NETWORK', async () => {
    const err = await call((async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'NETWORK', retryable: true, provider: 'test' });
  });

  it('times out slow servers', async () => {
    vi.useFakeTimers();
    const slow = ((_url: unknown, init?: RequestInit) =>
      new Promise((_res, rej) => {
        init?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
      })) as typeof fetch;
    const pending = call(slow, { timeoutMs: 500 }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(600);
    expect(await pending).toMatchObject({ code: 'TIMEOUT' });
    vi.useRealTimers();
  });

  it('distinguishes the caller cancelling from a timeout', async () => {
    const controller = new AbortController();
    const slow = ((_url: unknown, init?: RequestInit) =>
      new Promise((_res, rej) => {
        init?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
      })) as typeof fetch;
    const pending = call(slow, { signal: controller.signal }).catch((e: unknown) => e);
    controller.abort();
    expect(await pending).toMatchObject({ code: 'ABORTED' });
  });

  it('rejects HTML served where JSON was expected (e.g. a "blocked" page with HTTP 200)', async () => {
    const err = await call((async () => ok('<html>whoa there, pardner!</html>')) as typeof fetch).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('rejects oversized responses', async () => {
    const err = await call((async () => ok('{"a":1}', { headers: { 'content-length': '99999999' } })) as typeof fetch).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('never sends cookies or a referrer unless asked', async () => {
    const spy = vi.fn(async () => ok('{}'));
    await call(spy as unknown as typeof fetch);
    expect(spy).toHaveBeenCalledWith('https://api.example.com/x', expect.objectContaining({ credentials: 'omit', referrerPolicy: 'no-referrer' }));
    await http('https://api.example.com/x', { provider: 't', fetchImpl: spy as unknown as typeof fetch, credentials: 'include' });
    expect(spy).toHaveBeenLastCalledWith('https://api.example.com/x', expect.objectContaining({ credentials: 'include' }));
  });
});

describe('error helpers', () => {
  it('parses Retry-After in seconds and as a date', () => {
    expect(parseRetryAfter('120')).toBe(120_000);
    expect(parseRetryAfter(new Date(10_000).toUTCString(), 4_000)).toBe(6_000);
    expect(parseRetryAfter('nonsense')).toBeUndefined();
    expect(parseRetryAfter(null)).toBeUndefined();
  });

  it('normalises anything thrown', () => {
    expect(toAppError(new TypeError('Failed to fetch')).code).toBe('NETWORK');
    expect(toAppError(new DOMException('x', 'AbortError')).code).toBe('ABORTED');
    expect(toAppError('boom').code).toBe('UNKNOWN');
    const e = fromHttpStatus(429, { provider: 'p' });
    expect(toAppError(e)).toBe(e);
  });

  it('gives user-facing copy without leaking internals', () => {
    for (const code of ['NETWORK', 'RATE_LIMITED', 'BLOCKED', 'UNAVAILABLE', 'PERMISSION', 'NOT_CONFIGURED', 'INVALID_RESPONSE', 'NO_CONTEXT', 'UNKNOWN'] as const) {
      const { title, hint } = describeError({ code }, 'reddit');
      expect(title.length).toBeGreaterThan(5);
      expect(`${title} ${hint}`).not.toMatch(/TypeError|undefined|stack|fetch/i);
    }
    expect(describeError({ code: 'BLOCKED' }, 'reddit').hint).toMatch(/client ID/);
  });
});

describe('partial feed download', () => {
  it('stops reading after N items and closes the XML', async () => {
    const item = (i: number) => `<item><title>${i}</title>${'x'.repeat(2000)}</item>`;
    const xml = `<rss><channel><title>t</title>${Array.from({ length: 50 }, (_, i) => item(i)).join('')}</channel></rss>`;
    let pulled = 0;
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        const start = pulled * 4096;
        if (start >= xml.length) return controller.close();
        controller.enqueue(encoder.encode(xml.slice(start, start + 4096)));
        pulled++;
      },
    });
    const text = await httpTextHead('https://x.test/feed', { provider: 't', fetchImpl: (async () => new Response(stream)) as typeof fetch }, { marker: '</item>', count: 3, closing: '</channel></rss>' });
    expect((text.match(/<\/item>/g) ?? []).length).toBe(3);
    expect(text.endsWith('</channel></rss>')).toBe(true);
    expect(pulled * 4096).toBeLessThan(xml.length / 2); // did not download the whole feed
  });
});
