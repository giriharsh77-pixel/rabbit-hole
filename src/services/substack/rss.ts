/**
 * RSS 2.0 parsing for Substack publication feeds (https://<pub>.substack.com/feed).
 * Feeds are a public, reader-facing interface — the legitimate way to read a
 * publication's recent posts without scraping.
 */
import { XMLParser } from 'fast-xml-parser';
import type { ArticleCandidate } from '../../types/substack';
import { AppError } from '../../utils/errors';
import { cleanText } from '../../utils/sanitize';
import { stripHtml, truncate } from '../../utils/text';
import { looksLikeArticleUrl, makeCandidate } from './candidates';

const parser = new XMLParser({
  ignoreAttributes: true,
  textNodeName: '#text',
  isArray: (name) => name === 'item',
  processEntities: true,
  parseTagValue: false,
  trimValues: true,
});

function text(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && '#text' in v) return String((v as { '#text': unknown })['#text']);
  return '';
}

export interface ParsedFeed {
  publicationName: string;
  publicationUrl?: string;
  items: ArticleCandidate[];
}

export interface FeedMeta {
  feedUrl: string;
  /** Publication name known in advance (seed list), preferred over the feed's own title. */
  name?: string;
  tags?: string[];
  tier?: 1 | 2 | 3;
  now?: number;
}

export function parseRssFeed(xml: string, meta: FeedMeta): ParsedFeed {
  let doc: { rss?: { channel?: Record<string, unknown> } };
  try {
    doc = parser.parse(xml) as typeof doc;
  } catch {
    throw new AppError('INVALID_RESPONSE', 'Feed was not valid XML', { provider: 'substack:feed', retryable: false });
  }
  const channel = doc.rss?.channel;
  if (!channel) throw new AppError('INVALID_RESPONSE', 'Not an RSS feed', { provider: 'substack:feed', retryable: false });

  const feedHost = new URL(meta.feedUrl).hostname.toLowerCase();
  const publicationName = meta.name ?? (cleanText(text(channel.title), 80) || feedHost);
  const publicationUrl = text(channel.link) || undefined;

  const items: ArticleCandidate[] = [];
  for (const raw of (channel.item as unknown[] | undefined) ?? []) {
    const it = raw as Record<string, unknown>;
    const link = text(it.link) || text(it.guid);
    if (!looksLikeArticleUrl(link)) continue;

    const description = stripHtml(text(it.description));
    const body = description.length >= 40 ? '' : stripHtml(text(it['content:encoded'])).slice(0, 600);
    const candidate = makeCandidate(
      {
        url: link,
        title: stripHtml(text(it.title)),
        excerpt: truncate(description || body, 300),
        publicationName,
        publicationUrl,
        authorName: text(it['dc:creator']),
        publishedAt: text(it.pubDate),
        source: 'feed',
        provider: 'feeds',
        ...(meta.tags ? { tags: meta.tags } : {}),
        ...(meta.tier ? { publicationTier: meta.tier } : {}),
      },
      { allowedHosts: [feedHost], ...(meta.now !== undefined ? { now: meta.now } : {}) },
    );
    if (candidate) items.push(candidate);
  }
  return { publicationName, ...(publicationUrl ? { publicationUrl } : {}), items };
}
