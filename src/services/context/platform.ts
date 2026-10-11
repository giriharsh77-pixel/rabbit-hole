/**
 * Stage 1 of the pipeline: *Platform detector*.
 * Pure URL logic — no DOM, no permissions needed.
 */
import type { ContentKind, Platform } from '../../types/context';

export interface PlatformInfo {
  platform: Platform;
  /** Best guess from the URL alone; the extractor refines it. */
  kind: ContentKind;
  /** The user is (probably) playing something we can describe. */
  isWatchPage: boolean;
  hostname: string;
}

const UNKNOWN = (hostname: string): PlatformInfo => ({ platform: 'unknown', kind: 'page', isWatchPage: false, hostname });

export function parseUrl(input: string | URL | undefined | null): URL | undefined {
  if (!input) return undefined;
  if (input instanceof URL) return input;
  try {
    return new URL(input);
  } catch {
    return undefined;
  }
}

function isHost(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

/** Rabbit Hole only reads Netflix; every other page is "unknown" and never read. */
export function detectPlatform(input: string | URL | undefined | null): PlatformInfo {
  const url = parseUrl(input);
  if (!url || (url.protocol !== 'https:' && url.protocol !== 'http:')) return UNKNOWN('');
  const host = url.hostname.toLowerCase();
  const path = url.pathname;

  if (isHost(host, 'netflix.com')) {
    const base = { platform: 'netflix' as const, hostname: host };
    if (/^\/watch\/\d+/.test(path)) return { ...base, kind: 'show', isWatchPage: true };
    if (/^\/title\/\d+/.test(path)) return { ...base, kind: 'show', isWatchPage: false };
    return { ...base, kind: 'page', isWatchPage: false };
  }
  return UNKNOWN(host);
}

/** Platforms whose pages we are allowed to read (when detection is on). */
export function isAutoDetectable(platform: Platform): boolean {
  return platform === 'netflix';
}

export function platformLabel(platform: Platform): string {
  switch (platform) {
    case 'netflix':
      return 'Netflix';
    case 'title':
      return 'Title search';
    case 'reddit':
      return 'Reddit';
    case 'substack':
      return 'Substack';
    case 'manual':
      return 'Search';
    default:
      return 'Web';
  }
}
