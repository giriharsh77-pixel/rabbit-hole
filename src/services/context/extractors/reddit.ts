/**
 * Reddit thread extractor (new "shreddit" markup and old.reddit.com), used to
 * power "Find deeper reading →" when the user is on a thread.
 */
import type { PlatformExtractor, RawPageMetadata } from '../../../types/context';
import { cleanText, sanitizeSubreddit } from '../../../utils/sanitize';
import { detectPlatform } from '../platform';
import { attr, firstText, meta, stripSiteSuffix } from './dom';

export function extractReddit(doc: Document, url: URL): RawPageMetadata | null {
  const info = detectPlatform(url);
  if (info.platform !== 'reddit' || info.bridge !== 'reddit-thread') return null;

  const pathMatch = url.pathname.match(/^\/r\/([A-Za-z0-9_]+)\/comments\/([a-z0-9]+)/i);
  const subreddit = sanitizeSubreddit(pathMatch?.[1]);

  // new Reddit: <shreddit-post post-title="…" subreddit-prefixed-name="r/…" author="…">
  const post = doc.querySelector('shreddit-post');
  const fromAttr = attr(post, 'post-title');
  // old Reddit
  const fromOld = firstText(doc, ['#siteTable .thing.link a.title', 'a.title'], 300)?.text;

  let title = fromAttr ?? fromOld;
  let source = fromAttr ? 'thread title' : fromOld ? 'thread title (old Reddit)' : 'page metadata';
  let confidence: RawPageMetadata['confidence'] = title ? 'high' : 'low';
  if (!title) {
    const ogTitle = meta(doc, 'og:title') ?? doc.title;
    title = stripSiteSuffix(ogTitle ?? '', /\s*:\s*r\/\w+\s*$/i, /\s*[-–—|]\s*Reddit\s*$/i);
    confidence = title ? 'medium' : 'low';
    source = 'page metadata';
  }
  if (!title) return null;

  const body =
    firstText(
      doc,
      [
        'shreddit-post [slot="text-body"]',
        'shreddit-post div[id$="-post-rtjson-content"]',
        '#siteTable .expando .usertext-body',
      ],
      900,
    )?.text ?? meta(doc, 'og:description');

  const author = attr(post, 'author') ?? firstText(doc, ['#siteTable .thing.link a.author'], 60)?.text;
  const flair = firstText(doc, ['shreddit-post faceplate-tracker[source="post_flair"]'], 60)?.text;

  const result: RawPageMetadata = {
    platform: 'reddit',
    kind: 'thread',
    url: url.href,
    title: cleanText(title, 300),
    source,
    confidence,
  };
  if (subreddit) result.subreddit = subreddit;
  if (author) result.creator = author.replace(/^u\//, '');
  if (body) result.description = body;
  if (flair) result.keywords = [flair];
  if (pathMatch?.[2]) result.videoId = pathMatch[2];
  return result;
}

export const redditExtractor: PlatformExtractor = {
  id: 'reddit',
  matches: (url) => detectPlatform(url).platform === 'reddit',
  extract: extractReddit,
};
