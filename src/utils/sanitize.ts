/**
 * Everything that comes from the network or from a web page is untrusted.
 * Rabbit Hole renders external text only through React text nodes (never
 * innerHTML) and only follows URLs that pass these checks.
 */
import { hashString, normalizeWhitespace, truncate } from './text';

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
/** Bidirectional overrides can visually reorder text (spoofing). */
const BIDI_CONTROLS = /[‪-‮⁦-⁩‎‏]/g;

/** Coerces anything to a safe, single-line-ish, length-capped string. */
export function cleanText(input: unknown, max = 500): string {
  if (typeof input !== 'string') return '';
  const cleaned = normalizeWhitespace(input.replace(CONTROL_CHARS, '').replace(BIDI_CONTROLS, ''));
  return cleaned.length > max ? truncate(cleaned, max) : cleaned;
}

export interface SafeUrlOptions {
  /** Host suffixes / exact hosts that are allowed. Omit to allow any https host. */
  hosts?: readonly string[];
  /** Allow plain http (only used for local development backends). */
  allowHttp?: boolean;
}

function hostMatches(hostname: string, allowed: readonly string[]): boolean {
  return allowed.some((h) => hostname === h || hostname.endsWith(`.${h}`));
}

/** Returns a normalised URL string, or undefined if it is not safe to follow/show. */
export function safeUrl(input: unknown, opts: SafeUrlOptions = {}): string | undefined {
  if (typeof input !== 'string' || input.length === 0 || input.length > 2048) return undefined;
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:' && !(opts.allowHttp && url.protocol === 'http:')) return undefined;
  if (url.username || url.password) return undefined; // https://reddit.com@evil.example
  if (opts.hosts && !hostMatches(url.hostname, opts.hosts)) return undefined;
  return url.href;
}

export const REDDIT_HOSTS = ['reddit.com', 'redd.it'] as const;
export const SUBSTACK_HOSTS = ['substack.com'] as const;

export function safeRedditUrl(input: unknown): string | undefined {
  return safeUrl(input, { hosts: REDDIT_HOSTS });
}

/** Only image hosts Reddit itself uses; the extension CSP allows the same list. */
export function safeImageUrl(input: unknown): string | undefined {
  return safeUrl(input, { hosts: ['redd.it', 'redditmedia.com'] });
}

const TRACKING_PARAMS = /^(utm_[a-z]+|fbclid|gclid|mc_[a-z]+|ref|ref_src|source|r|s|triedRedirect|showWelcomeOnShare|publication_id|post_id|isFreemail|token|utm)$/i;

/** Canonical form used for dedupe and ids: no tracking params, no hash, no trailing slash. */
export function canonicalizeUrl(input: string): string {
  try {
    const url = new URL(input);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
    }
    url.hostname = url.hostname.toLowerCase();
    const path = url.pathname.replace(/\/+$/, '') || '/';
    url.pathname = path;
    return url.href.replace(/\?$/, '');
  } catch {
    return input;
  }
}

export function urlId(input: string): string {
  return hashString(canonicalizeUrl(input));
}

export function sanitizeSubreddit(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined;
  const name = input.trim().replace(/^\/?r\//i, '').replace(/\/+$/, '');
  return /^[A-Za-z0-9_]{2,21}$/.test(name) ? name : undefined;
}

export function sanitizeSubredditList(input: unknown, max = 40): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const item of input) {
    const name = sanitizeSubreddit(item);
    if (name && !out.some((n) => n.toLowerCase() === name.toLowerCase())) out.push(name);
    if (out.length >= max) break;
  }
  return out;
}

export function sanitizePublicationSlug(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined;
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\.substack\.com.*$/, '')
    .replace(/^@/, '');
  return /^[a-z0-9][a-z0-9-]{1,62}$/.test(slug) ? slug : undefined;
}

export function sanitizeStringList(input: unknown, maxItems = 20, maxLen = 60): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of input) {
    const text = cleanText(item, maxLen);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= maxItems) break;
  }
  return out;
}

export function maskSecret(value: string): string {
  const tail = value.slice(-4);
  return value.length <= 8 ? '••••' : `••••${tail}`;
}
