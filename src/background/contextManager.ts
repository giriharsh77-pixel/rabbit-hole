/**
 * ContextManager — "what is the user looking at?" for the active tab.
 *
 * Privacy contract (also shown in the UI):
 *  • Netflix is read only when the extension is opened, and only while
 *    detection is enabled.  No other site is ever read.
 *  • The extracted context is cached per tab *in RAM only* and dropped as soon
 *    as the tab navigates or closes.
 */
import { buildContext, describeUsedInfo } from '../services/contextService';
import { detectPlatform, isAutoDetectable } from '../services/context/platform';
import type { Services } from './container';
import type { TabAdapter, TabInfo } from './tabs';
import type { ContentContext, CurrentContextResponse, RawPageMetadata } from '../types/context';
import type { Settings } from '../types/settings';
import { toAppError } from '../utils/errors';
import { TTL } from '../services/cacheService';

interface CachedPage {
  url: string;
  raw: RawPageMetadata;
  context: ContentContext;
}

const ctxKey = (tabId: number) => `ctx:${tabId}`;

export class ContextManager {
  constructor(
    private readonly deps: {
      services: Pick<Services, 'settings' | 'cache'>;
      tabs: TabAdapter;
      now?: () => number;
    },
  ) {}

  /** Drop the cached context for a tab (navigation, close). */
  async invalidate(tabId: number): Promise<void> {
    await this.deps.services.cache.delete(ctxKey(tabId));
  }

  private respond(partial: Partial<CurrentContextResponse> & Pick<CurrentContextResponse, 'state'>): CurrentContextResponse {
    return { platform: 'unknown', used: [], ...partial };
  }

  private toReady(page: CachedPage): CurrentContextResponse {
    return this.respond({
      state: 'ready',
      platform: page.context.platform,
      context: page.context,
      used: describeUsedInfo(page.raw, page.context),
      hostname: safeHost(page.url),
    });
  }

  private detectionAllowed(settings: Settings, platform: ReturnType<typeof detectPlatform>['platform']): boolean {
    if (!settings.privacy.detectionEnabled) return false;
    return platform === 'netflix' && settings.privacy.netflixDetection;
  }

  async current(params: { tabId?: number | undefined; refresh?: boolean | undefined }): Promise<CurrentContextResponse> {
    const { services, tabs } = this.deps;
    const settings = await services.settings.get();
    const tab = await tabs.resolve(params.tabId);
    if (!tab) return this.respond({ state: 'no-tab', reason: 'Open the dashboard from a page to see what you\'re watching.' });

    const info = detectPlatform(tab.url);
    const hostname = info.hostname || undefined;

    // Anything but Netflix is never read: the popup offers the title search instead.
    if (!isAutoDetectable(info.platform)) {
      return this.respond({ state: 'idle', platform: info.platform, ...(hostname ? { hostname } : {}) });
    }
    if (!this.detectionAllowed(settings, info.platform)) {
      return this.respond({
        state: 'disabled',
        platform: info.platform,
        ...(hostname ? { hostname } : {}),
        reason: 'Page detection is turned off in Settings → Privacy.',
      });
    }
    // Watch pages and title pages carry something worth describing.
    if (!info.isWatchPage && info.kind === 'page') {
      return this.respond({ state: 'idle', platform: info.platform, ...(hostname ? { hostname } : {}) });
    }

    const key = ctxKey(tab.id);
    if (!params.refresh) {
      const cached = await services.cache.get<CachedPage>(key);
      if (cached && cached.url === tab.url) return this.toReady(cached);
    }

    let raw: RawPageMetadata | null = null;
    try {
      raw = await this.deps.tabs.extract(tab, info.platform);
    } catch (err) {
      const e = toAppError(err, 'tabs');
      return this.respond({
        state: 'undetected',
        platform: info.platform,
        ...(hostname ? { hostname } : {}),
        reason: e.code === 'PERMISSION' ? 'Reload the tab once, then reopen Rabbit Hole.' : 'We couldn\'t read this page.',
      });
    }
    if (!raw) {
      return this.respond({
        state: 'undetected',
        platform: info.platform,
        ...(hostname ? { hostname } : {}),
        reason: "We couldn't automatically identify what you're watching.",
      });
    }
    return this.store(tab, raw);
  }


  private async store(tab: TabInfo, raw: RawPageMetadata): Promise<CurrentContextResponse> {
    const context = buildContext(raw, this.deps.now?.());
    const page: CachedPage = { url: tab.url ?? raw.url, raw, context };
    await this.deps.services.cache.set(ctxKey(tab.id), page, TTL.pageContext);
    return this.toReady(page);
  }
}

function safeHost(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}
