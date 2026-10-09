import { combineSignals } from './abort';
import { AppError, fromHttpStatus, isAbortError, parseRetryAfter, toAppError } from './errors';

export interface HttpOptions {
  /** Used in error reports, e.g. "reddit:json". */
  provider: string;
  signal?: AbortSignal | undefined;
  timeoutMs?: number;
  headers?: Record<string, string>;
  method?: 'GET' | 'POST';
  body?: BodyInit | null;
  credentials?: RequestCredentials;
  /** Reject bodies larger than this (bytes, best effort). Default 3 MB. */
  maxBytes?: number;
  /** Test seam; defaults to the global fetch at call time. */
  fetchImpl?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_MAX_BYTES = 3 * 1024 * 1024;

/**
 * fetch() with a timeout, cancellation, response-size guard and uniform
 * AppError mapping.  Resolves only for 2xx responses.
 */
export async function http(url: string, opts: HttpOptions): Promise<Response> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const signal = combineSignals(opts.signal, timeout.signal);
  const doFetch = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);

  let res: Response;
  try {
    res = await doFetch(url, {
      method: opts.method ?? 'GET',
      headers: opts.headers ?? {},
      body: opts.body ?? null,
      credentials: opts.credentials ?? 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      ...(signal ? { signal } : {}),
    });
  } catch (err) {
    clearTimeout(timer);
    if (opts.signal?.aborted) throw toAppError(err, opts.provider);
    if (timeout.signal.aborted && isAbortError(err)) {
      throw new AppError('TIMEOUT', 'Request timed out', { provider: opts.provider, retryable: true });
    }
    throw toAppError(err, opts.provider);
  }
  clearTimeout(timer);

  if (!res.ok) {
    const retryAfterMs = parseRetryAfter(res.headers.get('retry-after'));
    // Reddit signals its own limit window via x-ratelimit-reset (seconds).
    const resetSeconds = Number(res.headers.get('x-ratelimit-reset'));
    const remaining = res.headers.get('x-ratelimit-remaining');
    const resetMs =
      remaining !== null && Number(remaining) <= 0 && Number.isFinite(resetSeconds) ? resetSeconds * 1000 : undefined;
    const wait = retryAfterMs ?? resetMs;
    throw fromHttpStatus(res.status, { provider: opts.provider, ...(wait !== undefined ? { retryAfterMs: wait } : {}) });
  }

  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > (opts.maxBytes ?? DEFAULT_MAX_BYTES)) {
    throw new AppError('INVALID_RESPONSE', 'Response too large', { provider: opts.provider, retryable: false });
  }
  return res;
}

export async function httpText(url: string, opts: HttpOptions): Promise<string> {
  const res = await http(url, opts);
  try {
    const text = await res.text();
    if (text.length > (opts.maxBytes ?? DEFAULT_MAX_BYTES)) {
      throw new AppError('INVALID_RESPONSE', 'Response too large', { provider: opts.provider, retryable: false });
    }
    return text;
  } catch (err) {
    throw toAppError(err, opts.provider);
  }
}

/** Returns `unknown` on purpose — callers must validate before trusting the shape. */
export async function httpJson(url: string, opts: HttpOptions): Promise<unknown> {
  const text = await httpText(url, {
    ...opts,
    headers: { accept: 'application/json', ...opts.headers },
  });
  try {
    return JSON.parse(text) as unknown;
  } catch {
    // Reddit serves an HTML "blocked" page with a 200 in some network-policy cases.
    throw new AppError('INVALID_RESPONSE', 'Response was not valid JSON', {
      provider: opts.provider,
      retryable: false,
    });
  }
}

/**
 * Reads a text body but stops as soon as `count` occurrences of `marker` have
 * arrived (e.g. the first 12 `</item>`s of an RSS feed), cancelling the rest of
 * the download.  Feeds can be megabytes; the newest few posts are all we need.
 */
export async function httpTextHead(
  url: string,
  opts: HttpOptions,
  until: { marker: string; count: number; closing: string },
): Promise<string> {
  const res = await http(url, opts);
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const reader = res.body?.getReader();
  try {
    if (!reader) {
      const all = await res.text();
      return all;
    }
    const decoder = new TextDecoder();
    let text = '';
    let seen = 0;
    let from = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return text;
      text += decoder.decode(value, { stream: true });
      for (let i = text.indexOf(until.marker, from); i !== -1; i = text.indexOf(until.marker, from)) {
        seen++;
        from = i + until.marker.length;
        if (seen >= until.count) {
          await reader.cancel().catch(() => undefined);
          return text.slice(0, from) + until.closing;
        }
      }
      from = Math.max(from, text.length - until.marker.length + 1);
      if (text.length > maxBytes) {
        await reader.cancel().catch(() => undefined);
        const cut = text.lastIndexOf(until.marker);
        if (cut === -1) throw new AppError('INVALID_RESPONSE', 'Response too large', { provider: opts.provider, retryable: false });
        return text.slice(0, cut + until.marker.length) + until.closing;
      }
    }
  } catch (err) {
    throw toAppError(err, opts.provider);
  }
}
