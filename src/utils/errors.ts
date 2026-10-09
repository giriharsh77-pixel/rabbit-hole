import type { AppErrorCode, SerializedError } from '../types/errors';

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
  readonly provider?: string;
  readonly status?: number;

  constructor(
    code: AppErrorCode,
    message: string,
    opts: { retryable?: boolean; retryAfterMs?: number; provider?: string; status?: number; cause?: unknown } = {},
  ) {
    super(message, opts.cause === undefined ? undefined : { cause: opts.cause });
    this.name = 'AppError';
    this.code = code;
    this.retryable = opts.retryable ?? isRetryableByDefault(code);
    if (opts.retryAfterMs !== undefined) this.retryAfterMs = opts.retryAfterMs;
    if (opts.provider !== undefined) this.provider = opts.provider;
    if (opts.status !== undefined) this.status = opts.status;
  }

  toJSON(): SerializedError {
    const out: SerializedError = { code: this.code, message: this.message, retryable: this.retryable };
    if (this.retryAfterMs !== undefined) out.retryAfterMs = this.retryAfterMs;
    if (this.provider !== undefined) out.provider = this.provider;
    if (this.status !== undefined) out.status = this.status;
    return out;
  }
}

function isRetryableByDefault(code: AppErrorCode): boolean {
  return code === 'NETWORK' || code === 'TIMEOUT' || code === 'RATE_LIMITED' || code === 'UNAVAILABLE';
}

export function isAbortError(err: unknown): boolean {
  if (err instanceof AppError) return err.code === 'ABORTED';
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name: unknown }).name === 'AbortError'
  );
}

/** Parses a `Retry-After` header (seconds or HTTP date) into milliseconds. */
export function parseRetryAfter(value: string | null | undefined, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.round(seconds * 1000));
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

export function fromHttpStatus(
  status: number,
  opts: { provider?: string; retryAfterMs?: number; message?: string } = {},
): AppError {
  const base = { provider: opts.provider, status, retryAfterMs: opts.retryAfterMs } as const;
  const clean = <T extends object>(o: T) =>
    Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

  if (status === 429) {
    return new AppError('RATE_LIMITED', opts.message ?? 'Rate limited', clean({ ...base, retryable: true }));
  }
  if (status === 401) {
    return new AppError('UNAUTHORIZED', opts.message ?? 'Unauthorized', clean({ ...base, retryable: false }));
  }
  if (status === 403) {
    return new AppError('BLOCKED', opts.message ?? 'Request blocked', clean({ ...base, retryable: false }));
  }
  if (status >= 500 || status === 404 || status === 408) {
    return new AppError('UNAVAILABLE', opts.message ?? `Service unavailable (${status})`, clean({ ...base, retryable: status !== 404 }));
  }
  return new AppError('UNKNOWN', opts.message ?? `Unexpected response (${status})`, clean({ ...base, retryable: false }));
}

/** Normalises anything thrown into an AppError. */
export function toAppError(err: unknown, provider?: string): AppError {
  if (err instanceof AppError) return err;
  if (isAbortError(err)) return new AppError('ABORTED', 'Request cancelled', { retryable: false, ...(provider ? { provider } : {}) });
  const message = err instanceof Error ? err.message : String(err);
  // fetch() rejects with TypeError("Failed to fetch") / "NetworkError…" when offline or blocked.
  if (err instanceof TypeError || /failed to fetch|networkerror|network request failed|load failed/i.test(message)) {
    return new AppError('NETWORK', 'Network request failed', { retryable: true, cause: err, ...(provider ? { provider } : {}) });
  }
  return new AppError('UNKNOWN', message || 'Unknown error', { retryable: false, cause: err, ...(provider ? { provider } : {}) });
}

export function serializeError(err: unknown, provider?: string): SerializedError {
  return toAppError(err, provider).toJSON();
}

export function deserializeError(s: SerializedError): AppError {
  return new AppError(s.code, s.message, {
    retryable: s.retryable,
    ...(s.retryAfterMs !== undefined ? { retryAfterMs: s.retryAfterMs } : {}),
    ...(s.provider !== undefined ? { provider: s.provider } : {}),
    ...(s.status !== undefined ? { status: s.status } : {}),
  });
}

export type ErrorSubject = 'reddit' | 'substack' | 'youtube' | 'netflix' | 'context' | 'generic';

/** User-facing copy for an error.  Never exposes raw exception text. */
export function describeError(
  err: Pick<SerializedError, 'code'> | undefined,
  subject: ErrorSubject = 'generic',
): { title: string; hint: string } {
  const name: Record<ErrorSubject, string> = {
    reddit: 'Reddit',
    substack: 'Substack search',
    youtube: 'YouTube',
    netflix: 'Netflix',
    context: 'This page',
    generic: 'This service',
  };
  const who = name[subject];
  switch (err?.code) {
    case 'NETWORK':
      return { title: "You appear to be offline", hint: 'Check your connection and try again.' };
    case 'TIMEOUT':
      return { title: `${who} took too long to respond`, hint: 'Try again in a moment.' };
    case 'RATE_LIMITED':
      return {
        title: `${who} is rate-limiting requests`,
        hint: 'Rabbit Hole caches aggressively — wait a minute and retry.',
      };
    case 'BLOCKED':
    case 'UNAUTHORIZED':
      return {
        title: `${who} blocked the request`,
        hint:
          subject === 'reddit'
            ? 'Reddit restricts anonymous access. Add a Reddit client ID in Settings, or allow requests with your browser session.'
            : 'Check your credentials in Settings.',
      };
    case 'UNAVAILABLE':
      return { title: `${who} is unavailable right now`, hint: 'It may be having a hiccup. Try again shortly.' };
    case 'PERMISSION':
      return { title: 'Permission needed', hint: 'Grant the requested permission in Settings to enable this.' };
    case 'NOT_CONFIGURED':
      return { title: `${who} isn't set up yet`, hint: 'Open Settings to finish setup.' };
    case 'INVALID_RESPONSE':
      return { title: `${who} returned something unexpected`, hint: 'We discarded it rather than show bad data.' };
    case 'NO_CONTEXT':
      return { title: `We couldn't read this page`, hint: 'Try searching manually instead.' };
    case 'ABORTED':
      return { title: 'Cancelled', hint: '' };
    default:
      return { title: 'Something went wrong', hint: 'Try again — nothing was lost.' };
  }
}
