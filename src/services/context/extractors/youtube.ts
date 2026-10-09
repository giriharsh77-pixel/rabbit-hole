/**
 * YouTube metadata extractor — reads only what the page already shows the user
 * (title, channel, description, meta keywords).  No network calls, no player
 * interaction, no page-world script injection.
 *
 * YouTube is a single-page app: <meta> tags can lag behind the visible video
 * after in-app navigation, so visible DOM text is preferred and <meta> values
 * are only trusted when the canonical link matches the current video id.
 */
import type { PlatformExtractor, RawPageMetadata } from '../../../types/context';
import { cleanText } from '../../../utils/sanitize';
import { detectPlatform } from '../platform';
import { attr, firstText, meta, splitList, stripSiteSuffix, textOf } from './dom';

const TITLE_WATCH = [
  'ytd-watch-metadata h1 yt-formatted-string',
  'ytd-watch-metadata h1',
  'h1.ytd-watch-metadata',
  '#title h1 yt-formatted-string',
  '#above-the-fold #title h1',
  'h1.title',
] as const;

const TITLE_SHORTS = [
  'ytd-reel-video-renderer[is-active] yt-shorts-video-title-view-model h2',
  'yt-shorts-video-title-view-model h2',
  '.ytShortsVideoTitleViewModelShortsVideoTitle',
  'ytd-reel-video-renderer[is-active] .title',
  'ytd-reel-video-renderer[is-active] h2',
] as const;

const CHANNEL_WATCH = [
  'ytd-watch-metadata ytd-channel-name a',
  '#owner ytd-channel-name a',
  '#upload-info ytd-channel-name a',
  'ytd-video-owner-renderer ytd-channel-name a',
  '#channel-name a',
] as const;

const CHANNEL_SHORTS = [
  'ytd-reel-video-renderer[is-active] ytd-channel-name a',
  'ytd-reel-video-renderer[is-active] .ytReelChannelBarViewModelChannelName a',
  'yt-reel-channel-bar-view-model a',
] as const;

const DESCRIPTION = [
  'ytd-watch-metadata #description-inline-expander #snippet-text',
  'ytd-watch-metadata #description-inline-expander',
  '#description-inner',
  'ytd-text-inline-expander #snippet',
  '#description yt-attributed-string',
  '#description',
] as const;

function videoIdFromUrl(url: URL): string | undefined {
  if (url.hostname === 'youtu.be') return url.pathname.slice(1).split('/')[0] || undefined;
  const shorts = url.pathname.match(/^\/(?:shorts|live)\/([\w-]{5,})/);
  if (shorts) return shorts[1];
  return url.searchParams.get('v') ?? undefined;
}

export function extractYouTube(doc: Document, url: URL): RawPageMetadata | null {
  const info = detectPlatform(url);
  if (info.platform !== 'youtube' || !info.isWatchPage) return null;

  const isShort = info.kind === 'short';
  const videoId = videoIdFromUrl(url);

  // Are the <meta> tags describing *this* video? (they may be stale after SPA navigation)
  const canonical = attr(doc.querySelector('link[rel="canonical"]'), 'href') ?? '';
  const metaIsCurrent = !!videoId && canonical.includes(videoId);

  let title: string | undefined;
  let confidence: RawPageMetadata['confidence'] = 'low';
  let source = 'page metadata';

  const domTitle = firstText(doc, isShort ? TITLE_SHORTS : TITLE_WATCH, 300);
  if (domTitle) {
    title = domTitle.text;
    confidence = 'high';
    source = isShort ? 'visible Short title' : 'visible video title';
  } else {
    const docTitle = stripSiteSuffix(doc.title ?? '', /\s*[-–—|]\s*YouTube\s*$/i, /^\(\d+\)\s*/);
    if (docTitle && !/^youtube$/i.test(docTitle)) {
      title = docTitle;
      confidence = 'medium';
      source = 'browser tab title';
    } else if (metaIsCurrent) {
      title = meta(doc, 'og:title') ?? meta(doc, 'title');
      source = 'Open Graph metadata';
    }
  }
  if (!title) return null;

  const channel = firstText(doc, isShort ? CHANNEL_SHORTS : CHANNEL_WATCH, 120)?.text ??
    (metaIsCurrent ? attr(doc.querySelector('span[itemprop="author"] link[itemprop="name"]'), 'content') : undefined);

  const descriptionDom = firstText(doc, DESCRIPTION, 800)?.text;
  const description = descriptionDom ?? (metaIsCurrent ? (meta(doc, 'description') ?? meta(doc, 'og:description')) : undefined);

  const keywords = metaIsCurrent ? splitList(meta(doc, 'keywords'), /,/) : [];
  const category = metaIsCurrent ? meta(doc, 'genre') : undefined;

  const hashtags = new Set<string>();
  for (const a of doc.querySelectorAll('ytd-watch-metadata a[href^="/hashtag/"], #description a[href^="/hashtag/"]')) {
    const t = textOf(a, 40)?.replace(/^#/, '');
    if (t) hashtags.add(t);
  }
  for (const m of (description ?? '').matchAll(/#([\p{L}\p{N}_]{2,30})/gu)) if (m[1]) hashtags.add(m[1]);

  const result: RawPageMetadata = {
    platform: 'youtube',
    kind: isShort ? 'short' : 'video',
    url: url.href,
    title: cleanText(title, 300),
    source,
    confidence,
  };
  if (channel) result.creator = channel.replace(/^@/, '');
  if (description) result.description = description;
  if (keywords.length) result.keywords = keywords.slice(0, 15);
  if (hashtags.size) result.hashtags = [...hashtags].slice(0, 8);
  if (category) result.category = category;
  if (videoId) result.videoId = videoId;
  const published = metaIsCurrent ? meta(doc, 'datePublished') : undefined;
  if (published) result.publishedAt = published;
  return result;
}

export const youtubeExtractor: PlatformExtractor = {
  id: 'youtube',
  matches: (url) => detectPlatform(url).platform === 'youtube',
  extract: extractYouTube,
};
