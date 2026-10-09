/**
 * The single gate every article passes through before it can reach the UI.
 * Providers (search API, RSS feed, our own backend) are all untrusted: a
 * candidate with an unsafe URL, an empty title or an impossible date is dropped
 * or repaired here.  Nothing is ever invented — a missing author/date stays
 * missing.
 */
import type { ArticleCandidate, SubstackProviderId } from '../../types/substack';
import { canonicalizeUrl, cleanText, safeUrl, urlId } from '../../utils/sanitize';
import { truncate } from '../../utils/text';

export interface RawCandidate {
  url: unknown;
  title: unknown;
  excerpt?: unknown;
  publicationName?: unknown;
  publicationUrl?: unknown;
  authorName?: unknown;
  publishedAt?: unknown;
  source: ArticleCandidate['source'];
  provider: SubstackProviderId;
  searchRank?: number;
  matchedQueries?: string[];
  tags?: string[];
  publicationTier?: 1 | 2 | 3;
  engagement?: { likes?: number; comments?: number };
}

export interface CandidateRules {
  /** Extra hostnames (besides *.substack.com) whose links are acceptable, e.g. the feed's own domain. */
  allowedHosts?: readonly string[];
  now?: number;
}

const SUBSTACK_LAUNCH = Date.UTC(2017, 0, 1);

export function normalizeIsoDate(input: unknown, now = Date.now()): string | undefined {
  if (typeof input !== 'string' || !input.trim()) return undefined;
  const t = Date.parse(input);
  if (Number.isNaN(t) || t < SUBSTACK_LAUNCH || t > now + 86_400_000) return undefined;
  return new Date(t).toISOString();
}

/** `https://some-newsletter.substack.com/p/x` → "Some Newsletter" (an honest fallback, not a claim). */
export function publicationFromUrl(url: string): string | undefined {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return undefined;
  }
  const host = u.hostname.toLowerCase();
  let slug: string | undefined;
  if (host.endsWith('.substack.com') && host !== 'open.substack.com' && host !== 'www.substack.com') {
    slug = host.slice(0, -'.substack.com'.length);
  } else if (host === 'open.substack.com') {
    slug = u.pathname.match(/^\/pub\/([^/]+)/)?.[1];
  } else if (host === 'substack.com') {
    slug = u.pathname.match(/^\/@([^/]+)/)?.[1];
  } else {
    slug = host.replace(/^www\./, '');
  }
  if (!slug) return undefined;
  return slug
    .split(/[-_.]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/** Search-result titles often read "Post title - Publication"; split when the suffix matches the host. */
export function splitPublicationSuffix(title: string, url: string): { title: string; publication?: string } {
  const slug = (() => {
    try {
      const h = new URL(url).hostname;
      return h.endsWith('.substack.com') ? h.slice(0, -'.substack.com'.length) : h.replace(/^www\./, '');
    } catch {
      return '';
    }
  })();
  const m = title.match(/^(.*\S)\s+(?:[-–—|•·]|\|)\s+([^-–—|•·]{2,60})$/);
  if (m?.[1] && m[2] && slug) {
    const suffix = norm(m[2]);
    const s = norm(slug);
    if (suffix && s && (suffix === s || suffix.includes(s) || s.includes(suffix))) {
      return { title: m[1].trim(), publication: m[2].trim() };
    }
  }
  return { title };
}

export function makeCandidate(input: RawCandidate, rules: CandidateRules = {}): ArticleCandidate | undefined {
  const now = rules.now ?? Date.now();
  const href = safeUrl(input.url);
  if (!href) return undefined;
  const host = new URL(href).hostname.toLowerCase();
  const allowed = host === 'substack.com' || host.endsWith('.substack.com') || (rules.allowedHosts ?? []).some((h) => host === h);
  if (!allowed) return undefined;

  const url = canonicalizeUrl(href);
  const rawTitle = cleanText(input.title, 220);
  if (rawTitle.length < 3) return undefined;
  const split = splitPublicationSuffix(rawTitle, url);

  const publicationName =
    cleanText(input.publicationName, 80) || split.publication || publicationFromUrl(url) || 'Substack';

  const candidate: ArticleCandidate = {
    id: urlId(url),
    url,
    title: split.title,
    excerpt: truncate(cleanText(input.excerpt, 600), 300),
    publicationName,
    source: input.source,
    provider: input.provider,
    matchedQueries: input.matchedQueries ?? [],
  };

  const pubUrl = safeUrl(input.publicationUrl, { hosts: [host.split('.').slice(-2).join('.'), host] });
  if (pubUrl) candidate.publicationUrl = pubUrl;
  const author = cleanText(input.authorName, 80);
  if (author) candidate.authorName = author;
  const date = normalizeIsoDate(input.publishedAt, now);
  if (date) candidate.publishedAt = date;
  if (input.searchRank !== undefined) candidate.searchRank = input.searchRank;
  if (input.tags?.length) candidate.tags = input.tags;
  if (input.publicationTier) candidate.publicationTier = input.publicationTier;
  if (input.engagement) candidate.engagement = input.engagement;
  return candidate;
}

/** Only real articles — not publication homepages, tag pages, notes or profiles. */
export function looksLikeArticleUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return /\/p\/[^/]+/.test(u.pathname) || /^\/@[^/]+\/p-\d+/.test(u.pathname);
  } catch {
    return false;
  }
}

/** Merge candidates for the same article found by different queries/providers. */
export function mergeCandidates(lists: readonly ArticleCandidate[][]): ArticleCandidate[] {
  const byId = new Map<string, ArticleCandidate>();
  for (const list of lists) {
    for (const c of list) {
      const existing = byId.get(c.id);
      if (!existing) {
        byId.set(c.id, { ...c, matchedQueries: [...c.matchedQueries] });
        continue;
      }
      for (const q of c.matchedQueries) if (!existing.matchedQueries.includes(q)) existing.matchedQueries.push(q);
      if (c.searchRank !== undefined && (existing.searchRank === undefined || c.searchRank < existing.searchRank)) {
        existing.searchRank = c.searchRank;
      }
      // prefer richer metadata, never overwrite with less
      if (c.excerpt.length > existing.excerpt.length) existing.excerpt = c.excerpt;
      existing.authorName ??= c.authorName;
      existing.publishedAt ??= c.publishedAt;
      existing.tags ??= c.tags;
      existing.publicationTier ??= c.publicationTier;
      existing.engagement ??= c.engagement;
    }
  }
  return [...byId.values()];
}
