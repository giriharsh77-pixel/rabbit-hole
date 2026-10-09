/**
 * The extension's RPC surface: one typed handler per RpcMap method.
 * Every parameter arrives from an extension page but is still validated —
 * handlers never assume well-formed input.
 */
import { buildContext, manualContext, sanitizeContext } from '../services/contextService';
import type { Platform, RawPageMetadata } from '../types/context';
import type { AppStatus, RpcMethod, RpcParams, RpcResult } from '../types/messages';
import type { Settings } from '../types/settings';
import { AppError } from '../utils/errors';
import { cleanText, sanitizeSubredditList } from '../utils/sanitize';
import { BUILD_ENV, EXTENSION_VERSION } from '../utils/env';
import type { Services } from './container';
import { ContextManager } from './contextManager';
import type { TabAdapter } from './tabs';

export interface HandlerContext {
  signal: AbortSignal;
}

export type Handler<M extends RpcMethod> = (params: RpcParams<M>, ctx: HandlerContext) => Promise<RpcResult<M>>;
export type Handlers = { [M in RpcMethod]: Handler<M> };

export interface HandlerDeps {
  services: Services;
  tabs: TabAdapter;
  now?: () => number;
  /** Fired after settings change (reschedule alarms, refresh badges, …). */
  onSettingsChanged?: (settings: Settings) => void;
  /** Fired when the user actively uses the UI (gates background refresh). */
  onUse?: () => void;
  /** Clears anything held outside `services` (e.g. alarms). */
  onDataCleared?: () => void;
}

const PLATFORMS: readonly Platform[] = ['youtube', 'netflix', 'reddit', 'substack', 'manual', 'unknown'];

function sanitizeRaw(input: unknown): RawPageMetadata {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const title = cleanText(o.title, 300);
  if (!title) throw new AppError('NO_CONTEXT', 'Nothing to search for', { retryable: false });
  const platform = PLATFORMS.includes(o.platform as Platform) ? (o.platform as Platform) : 'manual';
  const raw: RawPageMetadata = {
    platform,
    kind: platform === 'reddit' ? 'thread' : platform === 'manual' ? 'query' : 'page',
    url: typeof o.url === 'string' ? o.url.slice(0, 500) : '',
    title,
    source: cleanText(o.source, 80) || 'user action',
    confidence: 'high',
  };
  const description = cleanText(o.description, 800);
  if (description) raw.description = description;
  const subreddit = cleanText(o.subreddit, 30);
  if (subreddit) raw.subreddit = subreddit;
  const creator = cleanText(o.creator, 80);
  if (creator) raw.creator = creator;
  return raw;
}

export function createHandlers(deps: HandlerDeps): { handlers: Handlers; contextManager: ContextManager } {
  const { services } = deps;
  const contextManager = new ContextManager({ services, tabs: deps.tabs, ...(deps.now ? { now: deps.now } : {}) });

  const handlers: Handlers = {
    // ── context ────────────────────────────────────────────────────────────
    'context/current': async (p) => {
      deps.onUse?.();
      return contextManager.current({ tabId: p?.tabId, refresh: p?.refresh });
    },
    'context/usePage': async (p) => contextManager.usePage({ tabId: p?.tabId }),
    'context/analyze': async (p) => {
      const raw = sanitizeRaw(p?.raw);
      return raw.platform === 'manual' ? manualContext(raw.title) : buildContext(raw);
    },

    // ── reddit ─────────────────────────────────────────────────────────────
    'reddit/trending': async (p, { signal }) => {
      if (!p || typeof p.topicId !== 'string' || !/^[a-z0-9-]{1,40}$/i.test(p.topicId)) {
        throw new AppError('UNKNOWN', 'Invalid topic', { retryable: false });
      }
      deps.onUse?.();
      return services.reddit.getTrending({
        topicId: p.topicId,
        signal,
        ...(p.refresh !== undefined ? { refresh: p.refresh } : {}),
        ...(p.cacheOnly !== undefined ? { cacheOnly: p.cacheOnly } : {}),
      });
    },
    'reddit/search': async (p, { signal }) => {
      const queries = Array.isArray(p?.queries) ? p.queries.map((q) => cleanText(q, 120)).filter(Boolean) : [];
      return services.reddit.search({
        queries,
        signal,
        ...(p?.limit !== undefined ? { limit: p.limit } : {}),
        ...(p?.subreddits ? { subreddits: sanitizeSubredditList(p.subreddits, 10) } : {}),
      });
    },

    // ── substack ───────────────────────────────────────────────────────────
    'substack/discover': async (p, { signal }) => {
      const context = sanitizeContext(p?.context);
      return services.substack.discover(context, { signal, ...(p?.refresh !== undefined ? { refresh: p.refresh } : {}) });
    },

    // ── settings & secrets ─────────────────────────────────────────────────
    'settings/get': () => services.settings.get(),
    'settings/update': async (p) => {
      const next = await services.settings.update(p ?? {});
      deps.onSettingsChanged?.(next);
      return next;
    },
    'settings/reset': async () => {
      const next = await services.settings.reset();
      deps.onSettingsChanged?.(next);
      return next;
    },
    'secrets/status': () => services.secrets.status(),
    'secrets/set': async (p) => {
      if (!p || typeof p.value !== 'string') throw new AppError('UNKNOWN', 'Invalid key', { retryable: false });
      try {
        return await services.secrets.set(p.name, p.value);
      } catch (err) {
        throw new AppError('UNKNOWN', err instanceof Error ? err.message : 'Invalid key', { retryable: false });
      }
    },
    'secrets/clear': (p) => services.secrets.clear(p.name),

    // ── data ───────────────────────────────────────────────────────────────
    'cache/clear': async () => {
      const removed = await services.cache.clear();
      await services.sessionStore.clearAll(); // includes growth snapshots
      services.reddit.resetBreakers();
      return { removed };
    },
    'data/clearAll': async () => {
      await services.cache.clear();
      await services.sessionStore.clearAll();
      await services.localStore.clearAll();
      services.settings.invalidate();
      services.secrets.invalidate();
      services.reddit.resetBreakers();
      const settings = await services.settings.reset();
      deps.onSettingsChanged?.(settings);
      deps.onDataCleared?.();
      return settings;
    },

    // ── status ─────────────────────────────────────────────────────────────
    'status/get': async (): Promise<AppStatus> => {
      const [settings, secrets, ai] = await Promise.all([services.settings.get(), services.secrets.status(), services.ai.status()]);
      let backendSearch = false;
      if (services.backend) {
        backendSearch = await services.backend.features().then((f) => f.search).catch(() => false);
      }
      const substackProviders: AppStatus['substack']['providers'] = [];
      if (backendSearch) substackProviders.push('backend');
      if (secrets.braveApiKey.configured) substackProviders.push('brave');
      substackProviders.push('feeds');
      return {
        reddit: { providers: [...(secrets.redditClientId.configured ? (['oauth'] as const) : []), 'json', 'rss'] },
        substack: {
          providers: substackProviders,
          limitedCoverage: !backendSearch && !secrets.braveApiKey.configured,
          customDomainsAllowed: settings.reading.includeCustomDomains,
        },
        ai,
        backendConfigured: !!BUILD_ENV.backendUrl,
        version: EXTENSION_VERSION,
      };
    },
  };

  return { handlers, contextManager };
}
