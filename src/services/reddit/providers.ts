/**
 * Reddit data providers — three interchangeable ways to get threads, tried in
 * order of fidelity by redditService:
 *
 *   1. OAuthProvider  Reddit's official, documented API (installed-app grant:
 *                     needs only a public client id, no secret).
 *   2. JsonProvider   The public `.json` listing endpoints.  Full data, but
 *                     Reddit may rate-limit or block anonymous traffic.
 *   3. RssProvider    Reddit's official Atom feeds.  Always-on fallback, but they
 *                     carry no scores or comment counts.
 *
 * Nothing here scrapes HTML.  All responses are validated in ./parse.ts.
 */
import type { FeedKind, RedditPost, RedditProviderId } from '../../types/reddit';
import { AppError } from '../../utils/errors';
import { httpJson, httpText } from '../../utils/http';
import { parseAtom, parseListing } from './parse';

export interface ListingRequest {
  /** Empty = all of Reddit. */
  subreddits: string[];
  feed: Extract<FeedKind, 'hot' | 'rising' | 'top'>;
  limit: number;
}

export interface SearchRequest {
  query: string;
  subreddits: string[];
  limit: number;
  sort: 'relevance' | 'top' | 'comments' | 'new';
  time: 'day' | 'week' | 'month' | 'year' | 'all';
}

export interface RedditProvider {
  readonly id: RedditProviderId;
  /** Whether the provider returns upvote/comment counts. */
  readonly hasStats: boolean;
  fetchListing(req: ListingRequest, signal?: AbortSignal): Promise<RedditPost[]>;
  search(req: SearchRequest, signal?: AbortSignal): Promise<RedditPost[]>;
}

export interface ProviderOptions {
  fetchImpl?: typeof fetch;
  /** Send reddit.com cookies (only when the user opted in). */
  useBrowserSession?: boolean;
}

const multi = (subs: string[]) => (subs.length ? `r/${subs.join('+')}` : 'r/all');

// ─── public JSON ────────────────────────────────────────────────────────────

export class JsonProvider implements RedditProvider {
  readonly id = 'json' as const;
  readonly hasStats = true;
  constructor(private readonly opts: ProviderOptions = {}) {}

  private get(url: string, signal?: AbortSignal): Promise<unknown> {
    return httpJson(url, {
      provider: 'reddit:json',
      signal,
      credentials: this.opts.useBrowserSession ? 'include' : 'omit',
      ...(this.opts.fetchImpl ? { fetchImpl: this.opts.fetchImpl } : {}),
    });
  }

  async fetchListing(req: ListingRequest, signal?: AbortSignal): Promise<RedditPost[]> {
    const t = req.feed === 'top' ? '&t=day' : '';
    const url = `https://www.reddit.com/${multi(req.subreddits)}/${req.feed}.json?limit=${req.limit}&raw_json=1${t}`;
    return parseListing(await this.get(url, signal), req.feed);
  }

  async search(req: SearchRequest, signal?: AbortSignal): Promise<RedditPost[]> {
    const scope = req.subreddits.length ? `r/${req.subreddits.join('+')}/search.json?restrict_sr=1&` : 'search.json?';
    const url =
      `https://www.reddit.com/${scope}q=${encodeURIComponent(req.query)}` +
      `&sort=${req.sort}&t=${req.time}&limit=${req.limit}&raw_json=1&type=link`;
    return parseListing(await this.get(url, signal), 'search');
  }
}

// ─── official OAuth API (installed app) ─────────────────────────────────────

interface TokenResponse {
  access_token: string;
  expires_in: number;
}

function isTokenResponse(v: unknown): v is TokenResponse {
  return (
    !!v &&
    typeof v === 'object' &&
    typeof (v as TokenResponse).access_token === 'string' &&
    typeof (v as TokenResponse).expires_in === 'number'
  );
}

export class OAuthProvider implements RedditProvider {
  readonly id = 'oauth' as const;
  readonly hasStats = true;
  private token: { value: string; expiresAt: number } | undefined;
  private readonly deviceId: string;

  constructor(
    private readonly clientId: string,
    private readonly opts: ProviderOptions & { now?: () => number } = {},
  ) {
    // Reddit wants an opaque 20–30 char id per install; random per worker lifetime is fine.
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    this.deviceId = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  private now(): number {
    return (this.opts.now ?? Date.now)();
  }

  private async accessToken(signal?: AbortSignal): Promise<string> {
    if (this.token && this.token.expiresAt - 60_000 > this.now()) return this.token.value;
    const body = new URLSearchParams({
      grant_type: 'https://oauth.reddit.com/grants/installed_client',
      device_id: this.deviceId,
    });
    const json = await httpJson('https://www.reddit.com/api/v1/access_token', {
      provider: 'reddit:oauth',
      method: 'POST',
      body,
      signal,
      headers: {
        authorization: `Basic ${btoa(`${this.clientId}:`)}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      ...(this.opts.fetchImpl ? { fetchImpl: this.opts.fetchImpl } : {}),
    });
    if (!isTokenResponse(json)) {
      throw new AppError('UNAUTHORIZED', 'Reddit did not issue a token for this client id', { provider: 'reddit:oauth' });
    }
    this.token = { value: json.access_token, expiresAt: this.now() + json.expires_in * 1000 };
    return json.access_token;
  }

  private async get(path: string, signal?: AbortSignal, retried = false): Promise<unknown> {
    const token = await this.accessToken(signal);
    try {
      return await httpJson(`https://oauth.reddit.com/${path}`, {
        provider: 'reddit:oauth',
        signal,
        headers: { authorization: `Bearer ${token}` },
        ...(this.opts.fetchImpl ? { fetchImpl: this.opts.fetchImpl } : {}),
      });
    } catch (err) {
      if (!retried && err instanceof AppError && err.code === 'UNAUTHORIZED') {
        this.token = undefined; // expired or revoked: mint a fresh one once
        return this.get(path, signal, true);
      }
      throw err;
    }
  }

  async fetchListing(req: ListingRequest, signal?: AbortSignal): Promise<RedditPost[]> {
    const t = req.feed === 'top' ? '&t=day' : '';
    const path = `${multi(req.subreddits)}/${req.feed}?limit=${req.limit}&raw_json=1${t}`;
    return parseListing(await this.get(path, signal), req.feed);
  }

  async search(req: SearchRequest, signal?: AbortSignal): Promise<RedditPost[]> {
    const scope = req.subreddits.length ? `r/${req.subreddits.join('+')}/search?restrict_sr=1&` : 'search?';
    const path = `${scope}q=${encodeURIComponent(req.query)}&sort=${req.sort}&t=${req.time}&limit=${req.limit}&raw_json=1&type=link`;
    return parseListing(await this.get(path, signal), 'search');
  }
}

// ─── official Atom/RSS feeds ────────────────────────────────────────────────

export class RssProvider implements RedditProvider {
  readonly id = 'rss' as const;
  readonly hasStats = false;
  constructor(private readonly opts: ProviderOptions = {}) {}

  private async get(url: string, signal?: AbortSignal): Promise<string> {
    return httpText(url, {
      provider: 'reddit:rss',
      signal,
      credentials: this.opts.useBrowserSession ? 'include' : 'omit',
      headers: { accept: 'application/atom+xml, application/xml;q=0.9' },
      ...(this.opts.fetchImpl ? { fetchImpl: this.opts.fetchImpl } : {}),
    });
  }

  async fetchListing(req: ListingRequest, signal?: AbortSignal): Promise<RedditPost[]> {
    const t = req.feed === 'top' ? '&t=day' : '';
    const url = `https://www.reddit.com/${multi(req.subreddits)}/${req.feed}/.rss?limit=${req.limit}${t}`;
    return parseAtom(await this.get(url, signal), req.feed);
  }

  async search(req: SearchRequest, signal?: AbortSignal): Promise<RedditPost[]> {
    const scope = req.subreddits.length ? `r/${req.subreddits.join('+')}/search.rss?restrict_sr=on&` : 'search.rss?';
    const url = `https://www.reddit.com/${scope}q=${encodeURIComponent(req.query)}&sort=${req.sort}&t=${req.time}&limit=${req.limit}`;
    return parseAtom(await this.get(url, signal), 'search');
  }
}
