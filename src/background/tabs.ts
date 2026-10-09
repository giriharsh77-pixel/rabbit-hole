/**
 * Tab + content-script plumbing.  Everything is *pull*-based: pages are read
 * only when the user opens the extension (or asks), never on a timer, and
 * content scripts do nothing but wait for a message.
 */
import type { ExtractRequest, ExtractResponse } from '../types/messages';
import type { Platform, RawPageMetadata } from '../types/context';
import { AppError } from '../utils/errors';
import { detectPlatform } from '../services/context/platform';

export interface TabInfo {
  id: number;
  url?: string | undefined;
  title?: string | undefined;
}

/** Abstraction over the chrome.tabs/scripting calls the context handlers need. */
export interface TabAdapter {
  resolve(tabId?: number): Promise<TabInfo | undefined>;
  extract(tab: TabInfo, platform: Platform): Promise<RawPageMetadata | null>;
  extractGeneric(tab: TabInfo): Promise<RawPageMetadata | null>;
}

const SCRIPT_FOR: Partial<Record<Platform, string>> = {
  youtube: 'content/youtube.js',
  netflix: 'content/netflix.js',
  reddit: 'content/reddit.js',
  substack: 'content/generic.js',
};

async function ask(tabId: number): Promise<RawPageMetadata | null> {
  const res = (await chrome.tabs.sendMessage(tabId, { type: 'rh/extract' } satisfies ExtractRequest)) as ExtractResponse | undefined;
  if (!res) return null;
  return res.ok ? res.data : null;
}

/** Ask the page's content script; inject it first if the tab predates the extension. */
async function askWithInjection(tabId: number, file: string): Promise<RawPageMetadata | null> {
  try {
    return await ask(tabId);
  } catch {
    // "Receiving end does not exist": tab was open before install/update.
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: [file] });
      return await ask(tabId);
    } catch (err) {
      throw new AppError('PERMISSION', 'Rabbit Hole cannot read this tab', { provider: 'tabs', retryable: false, cause: err });
    }
  }
}

export const chromeTabs: TabAdapter = {
  async resolve(tabId) {
    try {
      if (tabId !== undefined) {
        const t = await chrome.tabs.get(tabId);
        return t.id === undefined ? undefined : { id: t.id, url: t.url, title: t.title };
      }
      const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (!t || t.id === undefined) return undefined;
      // The dashboard page itself is not a "current page".
      if (t.url?.startsWith(chrome.runtime.getURL(''))) return undefined;
      return { id: t.id, url: t.url, title: t.title };
    } catch {
      return undefined;
    }
  },

  async extract(tab, platform) {
    const file = SCRIPT_FOR[platform];
    if (!file) return null;
    return askWithInjection(tab.id, file);
  },

  /** User-initiated read of an arbitrary page (relies on `activeTab`). */
  async extractGeneric(tab) {
    return askWithInjection(tab.id, 'content/generic.js');
  },
};

/** Should we show the "●" badge for this URL? (pure; used by the tab listeners) */
export function badgeFor(url: string | undefined, enabled: { youtube: boolean; netflix: boolean }): boolean {
  if (!url) return false;
  const info = detectPlatform(url);
  if (!info.isWatchPage) return false;
  return (info.platform === 'youtube' && enabled.youtube) || (info.platform === 'netflix' && enabled.netflix);
}
