/**
 * Turns untrusted Reddit responses (JSON listings or Atom feeds) into
 * validated RedditPost objects.  Anything malformed is skipped, never trusted.
 */
import { XMLParser } from 'fast-xml-parser';
import type { FeedKind, RedditPost } from '../../types/reddit';
import { AppError } from '../../utils/errors';
import { cleanText, safeImageUrl, safeRedditUrl, safeUrl, sanitizeSubreddit } from '../../utils/sanitize';
import { decodeEntities, stripHtml, truncate } from '../../utils/text';

const PREVIEW_CHARS = 220;

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function absoluteRedditUrl(permalink: unknown): string | undefined {
  if (typeof permalink !== 'string') return undefined;
  const href = permalink.startsWith('/') ? `https://www.reddit.com${permalink}` : permalink;
  return safeRedditUrl(href);
}

/** `data.children[].data` from /r/x/hot.json, /search.json … */
export function parseListing(json: unknown, feed: FeedKind): RedditPost[] {
  const children = (json as { data?: { children?: unknown } } | null)?.data?.children;
  if (!Array.isArray(children)) {
    throw new AppError('INVALID_RESPONSE', 'Unexpected Reddit response shape', { provider: 'reddit' });
  }
  const posts: RedditPost[] = [];
  children.forEach((child, index) => {
    const d = (child as { kind?: unknown; data?: Record<string, unknown> } | null)?.data;
    if (!d || (child as { kind?: unknown }).kind !== 't3') return;

    const id = typeof d.id === 'string' && /^[a-z0-9]{3,10}$/i.test(d.id) ? d.id : undefined;
    const title = cleanText(d.title, 300);
    const subreddit = sanitizeSubreddit(d.subreddit);
    const permalink = absoluteRedditUrl(d.permalink);
    const createdUtc = num(d.created_utc);
    if (!id || !title || !subreddit || !permalink || createdUtc === undefined) return;

    const isSelf = d.is_self === true;
    const selftext = typeof d.selftext === 'string' ? d.selftext : '';
    const url = isSelf ? undefined : safeUrl(d.url);
    const domain = typeof d.domain === 'string' ? cleanText(d.domain, 80) : undefined;
    const thumb = typeof d.thumbnail === 'string' ? safeImageUrl(d.thumbnail) : undefined;

    const preview = isSelf
      ? truncate(cleanText(stripHtml(selftext), 600), PREVIEW_CHARS)
      : domain && !domain.startsWith('self.')
        ? `Link · ${domain}`
        : '';

    const post: RedditPost = {
      id,
      title,
      subreddit,
      permalink,
      preview,
      isSelf,
      numCrossposts: Math.max(0, num(d.num_crossposts) ?? 0),
      createdUtc,
      over18: d.over_18 === true,
      stickied: d.stickied === true,
      feeds: [feed],
      rank: index,
    };
    const author = cleanText(d.author, 40);
    if (author && author !== '[deleted]') post.author = author;
    if (url) post.url = url;
    if (domain) post.domain = domain;
    if (thumb) post.thumbnail = thumb;
    const score = num(d.score);
    if (score !== undefined) post.score = Math.max(0, score);
    const comments = num(d.num_comments);
    if (comments !== undefined) post.numComments = Math.max(0, comments);
    const ratio = num(d.upvote_ratio);
    if (ratio !== undefined) post.upvoteRatio = Math.min(1, Math.max(0, ratio));
    const flair = cleanText(d.link_flair_text, 40);
    if (flair) post.flair = flair;
    posts.push(post);
  });
  return posts;
}

// ─── Atom (official RSS) ────────────────────────────────────────────────────

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  isArray: (name) => name === 'entry',
  processEntities: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
});

function textValue(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && '#text' in v) return String((v as { '#text': unknown })['#text']);
  return '';
}

function attrOf(node: unknown, name: string): string | undefined {
  const v = (node as Record<string, unknown> | null | undefined)?.[`@_${name}`];
  return typeof v === 'string' ? v : undefined;
}

/**
 * Reddit's Atom feeds carry no score or comment count, only title, link,
 * author, time, a thumbnail and an HTML summary — so those fields stay undefined
 * (the UI then says stats are unavailable instead of inventing numbers).
 */
export function parseAtom(body: string, feed: FeedKind): RedditPost[] {
  let doc: { feed?: { entry?: unknown[] } };
  try {
    doc = xml.parse(body) as typeof doc;
  } catch {
    throw new AppError('INVALID_RESPONSE', 'Reddit feed was not valid XML', { provider: 'reddit:rss' });
  }
  if (!doc.feed) throw new AppError('INVALID_RESPONSE', 'Unexpected Reddit feed shape', { provider: 'reddit:rss' });

  const posts: RedditPost[] = [];
  (doc.feed.entry ?? []).forEach((entry, index) => {
    const e = entry as Record<string, unknown>;
    const fullname = textValue(e.id);
    const id = fullname.match(/^t3_([a-z0-9]{3,10})$/i)?.[1];
    const title = cleanText(decodeEntities(textValue(e.title)), 300);
    const permalink = safeRedditUrl(attrOf(e.link, 'href'));
    const subreddit = sanitizeSubreddit(attrOf(e.category, 'term'));
    const when = Date.parse(textValue(e.published) || textValue(e.updated));
    if (!id || !title || !permalink || !subreddit || Number.isNaN(when)) return;

    const html = textValue(e.content);
    const external = html.match(/<a href="([^"]+)">\s*\[link\]\s*<\/a>/i)?.[1];
    const target = external ? safeUrl(decodeEntities(external)) : undefined;
    const isSelf = !target || target === permalink || /reddit\.com\/r\/[^/]+\/comments\//.test(target);

    let preview = stripHtml(html)
      .replace(/submitted by\s+\/u\/\S+/gi, '')
      .replace(/\[(link|comments)\]/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!isSelf && target) {
      try {
        preview = `Link · ${new URL(target).hostname.replace(/^www\./, '')}`;
      } catch {
        preview = '';
      }
    }

    const post: RedditPost = {
      id,
      title,
      subreddit,
      permalink,
      preview: truncate(cleanText(preview, 400), PREVIEW_CHARS),
      isSelf,
      numCrossposts: 0,
      createdUtc: Math.floor(when / 1000),
      over18: false,
      stickied: false,
      feeds: [feed],
      rank: index,
    };
    const authorName = textValue((e.author as { name?: unknown } | undefined)?.name).replace(/^\/u\//, '');
    if (authorName) post.author = cleanText(authorName, 40);
    if (!isSelf && target) {
      post.url = target;
      try {
        post.domain = new URL(target).hostname.replace(/^www\./, '');
      } catch {
        /* ignore */
      }
    }
    const thumb = safeImageUrl(attrOf(e['media:thumbnail'], 'url'));
    if (thumb) post.thumbnail = thumb;
    posts.push(post);
  });
  return posts;
}
