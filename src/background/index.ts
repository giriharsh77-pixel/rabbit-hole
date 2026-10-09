/**
 * Rabbit Hole — MV3 background service worker.
 *
 * Responsibilities:
 *  • coordinate API requests (all network access lives here, not in the UI)
 *  • cache results (see services/cacheService.ts) and de-duplicate in-flight calls
 *  • keep API keys out of reach of pages and content scripts
 *  • follow the active tab (badge, per-tab context cache invalidation)
 *  • refresh trending Reddit data on an alarm — only while the extension is in use
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

const REFRESH_ALARM = 'rh-refresh-trending';
const LAST_USE_KEY = 'rh:lastUse';
/** Background refresh only runs if the extension was used within this window. */
const ACTIVE_WINDOW_MS = 2 * 60 * 60_000;

const services = createServices({
  local: new ChromeAreaStore(chrome.storage.local),
  session: new ChromeAreaStore(chrome.storage.session),
  hasOrigin: (pattern) => chrome.permissions.contains({ origins: [pattern] }).catch(() => false),
});

const { handlers, contextManager } = createHandlers({
  services,
  tabs: chromeTabs,
  onSettingsChanged: (settings) => {
    void scheduleRefresh(settings);
    void refreshAllBadges(settings);
  },
  onUse: () => {
    void chrome.storage.session.set({ [LAST_USE_KEY]: Date.now() }).catch(() => undefined);
  },
  onDataCleared: () => {
    void chrome.alarms.clear(REFRESH_ALARM);
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

// ─── background refresh of trending data ────────────────────────────────────

async function scheduleRefresh(settings: Settings): Promise<void> {
  const minutes = settings.reddit.refreshIntervalMinutes;
  await chrome.alarms.clear(REFRESH_ALARM);
  if (minutes > 0) await chrome.alarms.create(REFRESH_ALARM, { periodInMinutes: Math.max(2, minutes), delayInMinutes: Math.max(2, minutes) });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== REFRESH_ALARM) return;
  try {
    // Skip if nobody has used Rabbit Hole recently: no point spending requests.
    const lastUse = ((await chrome.storage.session.get(LAST_USE_KEY))[LAST_USE_KEY] as number | undefined) ?? 0;
    if (Date.now() - lastUse > ACTIVE_WINDOW_MS) return;
    const settings = await services.settings.get();
    await services.reddit.getTrending({ topicId: settings.reddit.defaultTopic, refresh: true });
  } catch {
    /* a failed background refresh is silent; the popup shows cached data */
  }
});

// ─── lifecycle ───────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  lockDownStorage();
  void services.settings.get().then((s) => scheduleRefresh(s));
});

chrome.runtime.onStartup.addListener(() => {
  lockDownStorage();
  void services.settings.get().then((s) => scheduleRefresh(s));
});

// Settings/secrets edited from another extension page: drop in-memory copies.
chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === 'local') {
    services.settings.invalidate();
    services.secrets.invalidate();
  }
});
