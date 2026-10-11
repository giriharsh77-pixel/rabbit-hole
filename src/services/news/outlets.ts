/**
 * News and entertainment outlets read through their own public RSS feeds —
 * the reader-facing interface publishers offer for exactly this.  Nothing is
 * scraped, and every feed below was checked live on 2026-10-10.
 *
 *   • `feeds`  — recent entertainment / TV / film coverage; only articles that
 *                name the title are kept.
 *   • `topic`  — a per-title feed ("/t/the-office/feed/"), which also covers
 *                older titles.  Unknown titles simply 404, which means "nothing".
 *
 * The list lives in outlets.json so manifest.config.mjs can read it too: each
 * origin is an *optional* host permission, granted when the user turns news on.
 */
import outletFile from './outlets.json';

export type OutletRegion = 'India' | 'US' | 'UK';

export interface NewsOutlet {
  id: string;
  name: string;
  region: OutletRegion;
  /** Hosts its article links live on (the feed's links are checked against these). */
  hosts: string[];
  feeds: string[];
  topic?: { series?: string; movie?: string };
  /** Editorial weight 1–3, used as a small ranking prior. */
  tier: 1 | 2 | 3;
}

export const OUTLETS: readonly NewsOutlet[] = outletFile.outlets as NewsOutlet[];

/** `https://variety.com/*` — what chrome.permissions asks for. */
export function outletOrigins(outlets: readonly NewsOutlet[] = OUTLETS): string[] {
  const origins = new Set<string>();
  for (const o of outlets) {
    for (const url of [...o.feeds, ...Object.values(o.topic ?? {})]) origins.add(`${new URL(url.replace('{slug}', 'x')).origin}/*`);
  }
  return [...origins].sort();
}

/** "The Office" → "the-office", "Glass Onion" → "glass-onion" (how these sites name their topic pages). */
export function topicSlug(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
