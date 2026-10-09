/**
 * Composition root: builds every service once, wired to chrome.storage (or to
 * in-memory stores in tests / the UI preview).  Nothing else in the codebase
 * constructs services, so swapping an implementation is a one-line change here.
 */
import { AiService } from '../services/aiService';
import { BackendClient } from '../services/backend/client';
import { CacheService, createSessionStore, type KeyValueStore } from '../services/cacheService';
import { RedditService } from '../services/redditService';
import { SecretsService } from '../services/secretsService';
import { SettingsService } from '../services/settingsService';
import { FeedProvider } from '../services/substack/feedProvider';
import { MediumProvider } from '../services/substack/medium';
import { SubstackService } from '../services/substackService';
import { BUILD_ENV } from '../utils/env';

export interface ContainerOptions {
  /** Durable preferences + secrets (chrome.storage.local). */
  local: KeyValueStore;
  /** Volatile caches (chrome.storage.session — RAM only). */
  session?: KeyValueStore;
  fetchImpl?: typeof fetch;
  now?: () => number;
  /** Optional host-permission check (chrome.permissions.contains). */
  hasOrigin?: (pattern: string) => Promise<boolean>;
  backendUrl?: string;
  build?: ConstructorParameters<typeof SecretsService>[1];
}

export interface Services {
  localStore: KeyValueStore;
  settings: SettingsService;
  secrets: SecretsService;
  cache: CacheService;
  sessionStore: KeyValueStore;
  reddit: RedditService;
  substack: SubstackService;
  ai: AiService;
  feeds: FeedProvider;
  backend: BackendClient | undefined;
}

export function createServices(opts: ContainerOptions): Services {
  const sessionStore = opts.session ?? createSessionStore();
  const settings = new SettingsService(opts.local);
  const secrets = new SecretsService(opts.local, opts.build);
  const cache = new CacheService(sessionStore, opts.now ? { now: opts.now } : {});
  const backendUrl = opts.backendUrl ?? BUILD_ENV.backendUrl;
  const backend = backendUrl ? new BackendClient(backendUrl, opts.fetchImpl) : undefined;

  const reddit = new RedditService({
    cache,
    getSettings: () => settings.get(),
    getClientId: () => secrets.get('redditClientId'),
    ...(opts.now ? { now: opts.now } : {}),
    ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
  });

  const ai = new AiService({
    getSettings: () => settings.get(),
    getBackend: () => backend,
    getUserKey: () => secrets.get('anthropicApiKey'),
    cache,
    ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
  });

  const feeds = new FeedProvider({
    cache,
    getSettings: () => settings.get(),
    hasOrigin: opts.hasOrigin ?? (async () => false),
    ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
    ...(opts.now ? { now: opts.now } : {}),
  });

  const medium = new MediumProvider({
    cache,
    ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
    ...(opts.now ? { now: opts.now } : {}),
  });

  const substack = new SubstackService({
    cache,
    getSettings: () => settings.get(),
    ai,
    feeds,
    medium,
    getBackend: () => backend,
    getBraveKey: () => secrets.get('braveApiKey'),
    ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
    ...(opts.now ? { now: opts.now } : {}),
  });

  return { localStore: opts.local, settings, secrets, cache, sessionStore, reddit, substack, ai, feeds, backend };
}
