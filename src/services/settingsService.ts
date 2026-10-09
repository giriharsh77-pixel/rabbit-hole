/**
 * settingsService — preferences live in chrome.storage.local only (never sync,
 * never sent anywhere).  Every read goes through `validateSettings`, so a
 * corrupt or hand-edited value can never crash the UI or the background worker.
 */
import type { DeepPartial, Settings, ThemeMode } from '../types/settings';
import { clampInt } from '../utils/format';
import { sanitizePublicationSlug, sanitizeStringList, sanitizeSubredditList } from '../utils/sanitize';
import type { KeyValueStore } from './cacheService';

export const SETTINGS_KEY = 'rh.settings';

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: 1,
  appearance: { theme: 'dark' },
  reddit: {
    preferredSubreddits: [],
    showThumbnails: true,
    includeNsfw: false,
    useBrowserSession: false,
  },
  reading: {
    recommendationCount: 12,
    minRelevance: 30,
    preferredTopics: [],
    extraPublications: [],
    includeCustomDomains: false,
    includeMedium: true,
  },
  privacy: {
    detectionEnabled: true,
    youtubeDetection: true,
    netflixDetection: true,
    aiEnabled: false,
  },
};

const THEMES: readonly ThemeMode[] = ['dark', 'light', 'system'];

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Merge arbitrary stored data onto the defaults, clamping everything. */
export function validateSettings(raw: unknown): Settings {
  const r = obj(raw);
  const appearance = obj(r.appearance);
  const reddit = obj(r.reddit);
  const reading = obj(r.reading);
  const privacy = obj(r.privacy);
  const d = DEFAULT_SETTINGS;

  return {
    schemaVersion: 1,
    appearance: {
      theme: THEMES.includes(appearance.theme as ThemeMode) ? (appearance.theme as ThemeMode) : d.appearance.theme,
    },
    reddit: {
      preferredSubreddits: sanitizeSubredditList(reddit.preferredSubreddits),
      showThumbnails: bool(reddit.showThumbnails, d.reddit.showThumbnails),
      includeNsfw: bool(reddit.includeNsfw, d.reddit.includeNsfw),
      useBrowserSession: bool(reddit.useBrowserSession, d.reddit.useBrowserSession),
    },
    reading: {
      recommendationCount: clampInt(reading.recommendationCount, 5, 30, d.reading.recommendationCount),
      minRelevance: clampInt(reading.minRelevance, 0, 90, d.reading.minRelevance),
      preferredTopics: sanitizeStringList(reading.preferredTopics, 12, 48),
      extraPublications: (Array.isArray(reading.extraPublications) ? reading.extraPublications : [])
        .map(sanitizePublicationSlug)
        .filter((s): s is string => !!s)
        .slice(0, 20),
      includeCustomDomains: bool(reading.includeCustomDomains, d.reading.includeCustomDomains),
      includeMedium: bool(reading.includeMedium, d.reading.includeMedium),
    },
    privacy: {
      detectionEnabled: bool(privacy.detectionEnabled, d.privacy.detectionEnabled),
      youtubeDetection: bool(privacy.youtubeDetection, d.privacy.youtubeDetection),
      netflixDetection: bool(privacy.netflixDetection, d.privacy.netflixDetection),
      aiEnabled: bool(privacy.aiEnabled, d.privacy.aiEnabled),
    },
  };
}

/** Deep-merge `patch` into `base` (arrays replace; only known sections merge). */
export function mergeSettings(base: Settings, patch: DeepPartial<Settings>): Settings {
  const merged = {
    ...base,
    appearance: { ...base.appearance, ...patch.appearance },
    reddit: { ...base.reddit, ...patch.reddit },
    reading: { ...base.reading, ...patch.reading },
    privacy: { ...base.privacy, ...patch.privacy },
  };
  return validateSettings(merged);
}

export class SettingsService {
  private cached: Settings | undefined;

  constructor(private readonly store: KeyValueStore) {}

  async get(): Promise<Settings> {
    if (this.cached) return this.cached;
    try {
      const raw = (await this.store.getMany([SETTINGS_KEY]))[SETTINGS_KEY];
      this.cached = validateSettings(raw);
    } catch {
      this.cached = validateSettings(undefined);
    }
    return this.cached;
  }

  async update(patch: DeepPartial<Settings>): Promise<Settings> {
    const next = mergeSettings(await this.get(), patch);
    this.cached = next;
    await this.store.setMany({ [SETTINGS_KEY]: next });
    return next;
  }

  async reset(): Promise<Settings> {
    this.cached = validateSettings(undefined);
    await this.store.setMany({ [SETTINGS_KEY]: this.cached });
    return this.cached;
  }

  /** Call when storage changed behind our back (chrome.storage.onChanged). */
  invalidate(): void {
    this.cached = undefined;
  }
}
