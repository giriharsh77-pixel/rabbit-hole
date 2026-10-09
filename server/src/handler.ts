/**
 * Rabbit Hole backend — a deliberately small API proxy.
 *
 * Why it exists: Brave Search and Anthropic need secret keys, and anything
 * shipped inside a Chrome extension can be read by its users.  The extension
 * sends *queries only*; this service holds the keys, calls the upstream APIs
 * and returns validated, minimal JSON.
 *
 *   GET  /health               → { ok, version, features: { search, ai } }
 *   POST /v1/search/substack   { queries: string[], limit? }        → { candidates }
 *   POST /v1/ai/analyze        { title, platform, … }               → { analysis }
 *   POST /v1/ai/refine         { source, candidates }               → { judgements }
 *
 * The handler is a plain `(Request) => Promise<Response>` built only on Web
 * standards, so the same code runs on Cloudflare Workers, Node ≥ 20, Deno, Bun,
 * Vercel/Netlify edge functions, etc.  See server/README.md.
 */
import { AnthropicAiProvider } from '../../src/services/ai/anthropicProvider';
import type { AiProvider } from '../../src/services/ai/types';
import { braveSearchSubstack } from '../../src/services/search/brave';
import { mergeCandidates } from '../../src/services/substack/candidates';
import type { ArticleCandidate } from '../../src/types/substack';
import { AppError, toAppError } from '../../src/utils/errors';
import { clampInt } from '../../src/utils/format';
import { cleanText } from '../../src/utils/sanitize';

export const SERVER_VERSION = '1.0.0';

export interface ServerConfig {
  braveApiKey?: string | undefined;
  anthropicApiKey?: string | undefined;
  /** Defaults to claude-opus-5-5; use e.g. claude-haiku-4-5 to cut cost/latency. */
  anthropicModel?: string | undefined;
  /**
   * Browser origins allowed to call the API, e.g. `chrome-extension://abcdefghijklmnop…`.
   * Empty = any `chrome-extension://` origin (fine for development).
   */
  allowedOrigins: string[];
  rateLimitPerMinute: number;
  /** Test seams. */
  fetch?: typeof fetch;
  now?: () => number;
  ai?: AiProvider;
}

const MAX_BODY_BYTES = 40_000;

// ─── rate limiting (best-effort, per instance) ──────────────────────────────

class RateLimiter {
  private readonly hits = new Map<string, number[]>();
  constructor(
    private readonly perMinute: number,
    private readonly now: () => number,
  ) {}

  /** @returns seconds to wait, or 0 when the request is allowed */
  check(key: string): number {
    const t = this.now();
    const recent = (this.hits.get(key) ?? []).filter((x) => t - x < 60_000);
    if (recent.length >= this.perMinute) {
      this.hits.set(key, recent);
      return Math.ceil((60_000 - (t - (recent[0] ?? t))) / 1000);
    }
    recent.push(t);
    this.hits.set(key, recent);
    if (this.hits.size > 5000) for (const [k, v] of this.hits) if (!v.some((x) => t - x < 60_000)) this.hits.delete(k);
    return 0;
  }
}

// ─── helpers ────────────────────────────────────────────────────────────────

function clientKey(req: Request): string {
  return (
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  );
}

function originAllowed(origin: string | null, allowed: string[]): boolean {
  if (!origin) return true; // not a browser (curl, server-to-server)
  if (allowed.length === 0) return origin.startsWith('chrome-extension://');
  return allowed.includes(origin);
}

function corsHeaders(origin: string | null, allowed: string[]): Record<string, string> {
  const h: Record<string, string> = { vary: 'Origin' };
  if (origin && originAllowed(origin, allowed)) {
    h['access-control-allow-origin'] = origin;
    h['access-control-allow-methods'] = 'GET, POST, OPTIONS';
    h['access-control-allow-headers'] = 'content-type';
    h['access-control-max-age'] = '600';
  }
  return h;
}

function json(body: unknown, status: number, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra },
  });
}

function fail(code: string, message: string, status: number, extra: Record<string, string> = {}): Response {
  return json({ error: { code, message } }, status, extra);
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  if (!(req.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) {
    throw new AppError('INVALID_RESPONSE', 'Expected application/json', { status: 415, retryable: false });
  }
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new AppError('INVALID_RESPONSE', 'Request too large', { status: 413, retryable: false });
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) throw new AppError('INVALID_RESPONSE', 'Request too large', { status: 413, retryable: false });
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    /* fall through */
  }
  throw new AppError('INVALID_RESPONSE', 'Body must be a JSON object', { status: 400, retryable: false });
}

function strList(v: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => cleanText(x, maxLen)).filter((x) => x.length >= 2).slice(0, maxItems);
}

/** Map an upstream failure to something safe to show: never echo upstream bodies, keys or stack traces. */
function upstreamFailure(err: unknown): Response {
  const e = toAppError(err);
  switch (e.code) {
    case 'RATE_LIMITED':
      return fail('UPSTREAM_RATE_LIMITED', 'The search provider is rate-limiting; try again shortly.', 429, {
        'retry-after': String(Math.max(1, Math.ceil((e.retryAfterMs ?? 30_000) / 1000))),
      });
    case 'UNAUTHORIZED':
    case 'BLOCKED':
      return fail('UPSTREAM_AUTH', 'The server’s upstream credentials were rejected.', 502);
    case 'TIMEOUT':
      return fail('UPSTREAM_TIMEOUT', 'The upstream service timed out.', 504);
    case 'ABORTED':
      return fail('CANCELLED', 'Request cancelled.', 499);
    default:
      return fail('UPSTREAM_ERROR', 'The upstream service is unavailable.', 502);
  }
}

// ─── the handler ────────────────────────────────────────────────────────────

export function createHandler(config: ServerConfig): (req: Request) => Promise<Response> {
  const now = config.now ?? Date.now;
  const limiter = new RateLimiter(config.rateLimitPerMinute, now);
  let ai: AiProvider | undefined = config.ai;
  const getAi = (): AiProvider | undefined => {
    if (!ai && config.anthropicApiKey) {
      ai = new AnthropicAiProvider({
        apiKey: config.anthropicApiKey,
        via: 'backend',
        ...(config.anthropicModel ? { model: config.anthropicModel } : {}),
        ...(config.fetch ? { fetch: config.fetch } : {}),
      });
    }
    return ai;
  };

  return async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const origin = req.headers.get('origin');
    const cors = corsHeaders(origin, config.allowedOrigins);
    const respond = (res: Response): Response => {
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
      return res;
    };

    if (!originAllowed(origin, config.allowedOrigins)) return fail('FORBIDDEN_ORIGIN', 'Origin not allowed.', 403);
    if (req.method === 'OPTIONS') return respond(new Response(null, { status: 204 }));

    if (req.method === 'GET' && url.pathname === '/health') {
      return respond(json({ ok: true, version: SERVER_VERSION, features: { search: !!config.braveApiKey, ai: !!config.anthropicApiKey } }, 200));
    }
    if (req.method !== 'POST') return respond(fail('NOT_FOUND', 'Not found.', 404));

    const wait = limiter.check(clientKey(req));
    if (wait > 0) return respond(fail('RATE_LIMITED', 'Too many requests.', 429, { 'retry-after': String(wait) }));

    try {
      const body = await readBody(req);

      // ── Substack search ────────────────────────────────────────────────
      if (url.pathname === '/v1/search/substack') {
        if (!config.braveApiKey) return respond(fail('NOT_CONFIGURED', 'Search is not configured on this server.', 501));
        const queries = strList(body.queries, 4, 120);
        if (queries.length === 0) return respond(fail('BAD_REQUEST', '`queries` must be a non-empty array of strings.', 400));
        const limit = clampInt(body.limit, 5, 30, 20);

        const settled = await Promise.allSettled(
          queries.map((q) =>
            braveSearchSubstack(q, { apiKey: config.braveApiKey!, count: limit, ...(config.fetch ? { fetchImpl: config.fetch } : {}) }),
          ),
        );
        const lists = settled.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
        if (lists.length === 0) return respond(upstreamFailure((settled.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined)?.reason));

        const candidates: ArticleCandidate[] = mergeCandidates(lists).slice(0, limit * 2);
        return respond(
          json(
            {
              candidates: candidates.map((c) => ({
                url: c.url,
                title: c.title,
                excerpt: c.excerpt,
                publicationName: c.publicationName,
                ...(c.publishedAt ? { publishedAt: c.publishedAt } : {}),
                ...(c.searchRank !== undefined ? { searchRank: c.searchRank } : {}),
                matchedQueries: c.matchedQueries,
              })),
            },
            200,
          ),
        );
      }

      // ── AI ─────────────────────────────────────────────────────────────
      if (url.pathname === '/v1/ai/analyze') {
        const provider = getAi();
        if (!provider) return respond(fail('NOT_CONFIGURED', 'AI is not configured on this server.', 501));
        const title = cleanText(body.title, 200);
        if (!title) return respond(fail('BAD_REQUEST', '`title` is required.', 400));
        const analysis = await provider.analyze({
          platform: cleanText(body.platform, 20) || 'unknown',
          kind: cleanText(body.kind, 20) || 'page',
          title,
          ...(cleanText(body.creator, 100) ? { creator: cleanText(body.creator, 100) } : {}),
          ...(cleanText(body.description, 600) ? { description: cleanText(body.description, 600) } : {}),
          ...(cleanText(body.episode, 120) ? { episode: cleanText(body.episode, 120) } : {}),
          genres: strList(body.genres, 6, 40),
          keywords: strList(body.keywords, 10, 60),
        });
        return respond(json({ analysis }, 200));
      }

      if (url.pathname === '/v1/ai/refine') {
        const provider = getAi();
        if (!provider) return respond(fail('NOT_CONFIGURED', 'AI is not configured on this server.', 501));
        const source = (body.source ?? {}) as Record<string, unknown>;
        const rawCandidates = Array.isArray(body.candidates) ? body.candidates.slice(0, 15) : [];
        const candidates = rawCandidates.flatMap((c) => {
          const o = c as Record<string, unknown>;
          const id = cleanText(o?.id, 24);
          const title = cleanText(o?.title, 200);
          return id && title ? [{ id, title, excerpt: cleanText(o.excerpt, 320), publication: cleanText(o.publication, 80) }] : [];
        });
        if (candidates.length === 0) return respond(fail('BAD_REQUEST', '`candidates` must be a non-empty array.', 400));
        const judgements = await provider.refine({
          source: { title: cleanText(source.title, 200), platform: cleanText(source.platform, 20), topics: strList(source.topics, 8, 60) },
          candidates,
        });
        return respond(json({ judgements }, 200));
      }

      return respond(fail('NOT_FOUND', 'Not found.', 404));
    } catch (err) {
      if (err instanceof AppError && err.status && err.status >= 400 && err.status < 500 && err.provider === undefined) {
        return respond(fail('BAD_REQUEST', err.message, err.status));
      }
      return respond(upstreamFailure(err));
    }
  };
}

/** Builds the config from environment variables (shared by the Worker and Node entry points). */
export function configFromEnv(env: Record<string, string | undefined>): ServerConfig {
  return {
    braveApiKey: env.BRAVE_API_KEY || undefined,
    anthropicApiKey: env.ANTHROPIC_API_KEY || undefined,
    anthropicModel: env.ANTHROPIC_MODEL || undefined,
    allowedOrigins: (env.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    rateLimitPerMinute: clampInt(env.RATE_LIMIT_PER_MINUTE, 1, 1000, 30),
  };
}
