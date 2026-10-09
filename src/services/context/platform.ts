/**
 * Stage 1 of the pipeline: *Platform detector*.
 * Pure URL logic — no DOM, no permissions needed.
 */
import type { ContentKind, Platform } from '../../types/context';

export type Bridge = 'reddit-thread' | 'substack-article' | null;

export interface PlatformInfo {
  platform: Platform;
  /** Best guess from the URL alone; extractors refine it. */
  kind: ContentKind;
  /** The user is (probably) playing/viewing something we can describe. */
  isWatchPage: boolean;
  /** Reddit thread / Substack article → offers a "bridge" to the other product surface. */
  bridge: Bridge;
  hostname: string;
}

const UNKNOWN = (hostname: string): PlatformInfo => ({
  platform: 'unknown',
  kind: 'page',
  isWatchPage: false,
  bridge: null,
  hostname,
});

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

export function detectPlatform(input: string | URL | undefined | null): PlatformInfo {
  const url = parseUrl(input);
  if (!url || (url.protocol !== 'https:' && url.protocol !== 'http:')) return UNKNOWN('');
  const host = url.hostname.toLowerCase();
  const path = url.pathname;

  if (isHost(host, 'youtube.com') || host === 'youtu.be') {
    const base = { platform: 'youtube' as const, bridge: null, hostname: host };
    if (host === 'youtu.be' && path.length > 1) return { ...base, kind: 'video', isWatchPage: true };
    if (/^\/shorts\/[\w-]{5,}/.test(path)) return { ...base, kind: 'short', isWatchPage: true };
    if (path === '/watch' && url.searchParams.get('v')) return { ...base, kind: 'video', isWatchPage: true };
    if (/^\/live\/[\w-]{5,}/.test(path)) return { ...base, kind: 'video', isWatchPage: true };
    return { ...base, kind: 'page', isWatchPage: false };
  }

  if (isHost(host, 'netflix.com')) {
    const base = { platform: 'netflix' as const, bridge: null, hostname: host };
    if (/^\/watch\/\d+/.test(path)) return { ...base, kind: 'show', isWatchPage: true };
    if (/^\/title\/\d+/.test(path)) return { ...base, kind: 'show', isWatchPage: false };
    return { ...base, kind: 'page', isWatchPage: false };
  }

  if (isHost(host, 'reddit.com') || host === 'redd.it') {
    const thread = /^\/r\/[A-Za-z0-9_]+\/comments\/[a-z0-9]+/i.test(path);
    return {
      platform: 'reddit',
      kind: thread ? 'thread' : 'page',
      isWatchPage: false,
      bridge: thread ? 'reddit-thread' : null,
      hostname: host,
    };
  }

  if (isHost(host, 'substack.com')) {
    const article = /^\/p\/[^/]+/.test(path) || /^\/@[^/]+\/p-\d+/.test(path) || /^\/pub\/[^/]+\/p\/[^/]+/.test(path);
    return {
      platform: 'substack',
      kind: article ? 'article' : 'page',
      isWatchPage: false,
      bridge: article ? 'substack-article' : null,
      hostname: host,
    };
  }

  return UNKNOWN(host);
}

/** Platforms whose pages we are allowed to read automatically (when detection is on). */
export function isAutoDetectable(platform: Platform): boolean {
  return platform === 'youtube' || platform === 'netflix' || platform === 'reddit' || platform === 'substack';
}

export function platformLabel(platform: Platform): string {
  switch (platform) {
    case 'youtube':
      return 'YouTube';
    case 'netflix':
      return 'Netflix';
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
