export type AppErrorCode =
  /** Offline, DNS failure, connection reset … */
  | 'NETWORK'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  /** The remote service is down (5xx) or returned an unusable page. */
  | 'UNAVAILABLE'
  /** 401/403 — blocked by policy or missing/invalid credentials. */
  | 'BLOCKED'
  | 'UNAUTHORIZED'
  /** Response arrived but didn't have the shape we validate for. */
  | 'INVALID_RESPONSE'
  /** A required optional host permission was not granted. */
  | 'PERMISSION'
  /** Feature needs configuration (e.g. no search provider available). */
  | 'NOT_CONFIGURED'
  | 'NO_CONTEXT'
  | 'ABORTED'
  | 'UNKNOWN';

/** Plain-object form that survives chrome.runtime messaging. */
export interface SerializedError {
  code: AppErrorCode;
  message: string;
  retryable: boolean;
  retryAfterMs?: number;
  provider?: string;
  status?: number;
}
