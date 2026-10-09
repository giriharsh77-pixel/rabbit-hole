/**
 * The curated, health-checked publication directory (seeds.json).
 * Kept in its own tiny module so UI bundles can read it without pulling in
 * the RSS parser.  Re-verify with `npm run seeds:verify`.
 */
import seedFile from './seeds.json';

export interface SeedPublication {
  id: string;
  name: string;
  feedUrl: string;
  homeUrl: string;
  /** Editorial prior, 1–3 — a small source-quality signal, never shown as a rating. */
  tier: 1 | 2 | 3;
  tags: string[];
}

export const SEEDS: readonly SeedPublication[] = seedFile.publications as SeedPublication[];

/** Feed served from a custom domain (needs an optional host permission). */
export function isCustomDomain(feedUrl: string): boolean {
  return !new URL(feedUrl).hostname.endsWith('.substack.com');
}

/** Chrome match pattern for a feed's origin. */
export function originPattern(feedUrl: string): string {
  const u = new URL(feedUrl);
  return `${u.protocol}//${u.hostname}/*`;
}

/** Distinct origin patterns of all custom-domain seeds (what the permission prompt covers). */
export function customDomainOrigins(): string[] {
  return [...new Set(SEEDS.filter((s) => isCustomDomain(s.feedUrl)).map((s) => originPattern(s.feedUrl)))].sort();
}
