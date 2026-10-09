/**
 * Rabbit Hole — MV3 background service worker.
 *
 * Responsibilities:
 *  • coordinate API requests (all network access lives here, not in the UI)
 *  • cache results (see services/cacheService.ts) and de-duplicate in-flight calls
 *  • keep API keys out of reach of pages and content scripts
 *  • follow the active tab (badge, per-tab context cache invalidation)
 *  • message the platform content scripts when the user opens the UI
 *
 * MV3 workers are ephemeral: no module-level state is relied on for correctness.
 * Event listeners are registered synchronously at top level, as Chrome requires.
 */
import { ChromeAreaStore } from '../services/cacheService';
import { RPC_PORT_NAME } from '../types/messages';
import type { Settings } from '../types/settings';
import { attachRpcPort, type RpcServerPort } from '../utils/rpc';
import { createServices } from './container';
import { createHandlers } from './handlers';
import { badgeFor, chromeTabs } from './tabs';

const services = createServices({
  local: new ChromeAreaStore(chrome.storage.local),
  session: new ChromeAreaStore(chrome.storage.session),
  hasOrigin: (pattern) => chrome.permissions.contains({ origins: [pattern] }).catch(() => false),
});

const { handlers, contextManager } = createHandlers({
  services,
  tabs: chromeTabs,
  onSettingsChanged: (settings) => {
    void refreshAllBadges(settings);
  },
  onDataCleared: () => {
    void chrome.action.setBadgeText({ text: '' });
  },
});

// ─── lockdown ────────────────────────────────────────────────────────────────

function lockDownStorage(): void {
  // Keep chrome.storage.local (settings + API keys) unreachable from content scripts.
  void chrome.storage.local.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(() => undefined);
  void chrome.storage.session.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(() => undefined);
}

// ─── RPC for popup / options / dashboard ────────────────────────────────────

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== RPC_PORT_NAME) return;
  const ok = attachRpcPort(port as unknown as RpcServerPort, {
    handlers: handlers as unknown as Record<string, (p: unknown, c: { signal: AbortSignal }) => Promise<unknown>>,
    allowedOrigin: chrome.runtime.getURL(''),
  });
  if (!ok) port.disconnect();
});

// ─── tab awareness ───────────────────────────────────────────────────────────

async function applyBadge(tabId: number, url: string | undefined, settings?: Settings): Promise<void> {
  const s = settings ?? (await services.settings.get());
  const show =
    s.privacy.detectionEnabled &&
    badgeFor(url, { youtube: s.privacy.youtubeDetection, netflix: s.privacy.netflixDetection });
  try {
    await chrome.action.setBadgeText({ tabId, text: show ? '●' : '' });
    if (show) await chrome.action.setBadgeBackgroundColor({ tabId, color: '#ff4f1a' });
  } catch {
    /* tab closed */
  }
}

/** Settings changed: re-evaluate the badge on every open tab (the badge is per tab). */
async function refreshAllBadges(settings: Settings): Promise<void> {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.flatMap((tab) => (tab.id === undefined ? [] : [applyBadge(tab.id, tab.url, settings)])));
}

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs
    .get(tabId)
    .then((tab) => applyBadge(tabId, tab.url))
    .catch(() => undefined);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // A URL change (including YouTube/Netflix in-app navigation) invalidates what we knew about the tab.
  if (changeInfo.url) {
    void contextManager.invalidate(tabId);
    void applyBadge(tabId, changeInfo.url);
  } else if (changeInfo.status === 'complete') {
    void applyBadge(tabId, tab.url);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void contextManager.invalidate(tabId);
});

// ─── lifecycle ───────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  lockDownStorage();
});

chrome.runtime.onStartup.addListener(() => {
  lockDownStorage();
});

// Settings/secrets edited from another extension page: drop in-memory copies.
chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === 'local') {
    services.settings.invalidate();
    services.secrets.invalidate();
  }
});
