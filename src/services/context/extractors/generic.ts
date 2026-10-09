/**
 * Generic page extractor.  Runs on Substack articles (statically) and on any
 * other site only when the user explicitly asks (activeTab + scripting).
 * Reads standard, publisher-provided metadata: JSON-LD, Open Graph, <meta>.
 */
import type { PlatformExtractor, RawPageMetadata } from '../../../types/context';
import { cleanText } from '../../../utils/sanitize';
import { detectPlatform } from '../platform';
import { firstText, jsonLd, ldType, meta, metaAll, splitList, str, strList, stripSiteSuffix } from './dom';

/** Custom-domain Substacks still load Substack's CDN and expose its app markers. */
export function looksLikeSubstack(doc: Document): boolean {
  if (doc.querySelector('link[href*="substackcdn.com"], script[src*="substackcdn.com"], img[src*="substackcdn.com"]')) {
    return true;
  }
  return /substack/i.test(meta(doc, 'generator') ?? '');
}

export function extractGeneric(doc: Document, url: URL): RawPageMetadata | null {
  const info = detectPlatform(url);
  const ld = jsonLd(doc).find((o) => ldType(o).some((t) => /Article|BlogPosting|NewsArticle|Report|WebPage/.test(t)));

  const title =
    str(ld?.headline, 300) ??
    meta(doc, 'og:title') ??
    firstText(doc, ['article h1', 'main h1', 'h1'], 300)?.text ??
    stripSiteSuffix(doc.title ?? '', /\s*[|\-–—]\s*[^|\-–—]{2,40}$/);
  if (!title) return null;

  const isSubstack = info.platform === 'substack' || looksLikeSubstack(doc);
  const isArticle =
    info.bridge === 'substack-article' || ldType(ld ?? {}).some((t) => /Article|BlogPosting/.test(t)) || meta(doc, 'og:type') === 'article';

  const keywords = [
    ...splitList(meta(doc, 'keywords'), /,/),
    ...metaAll(doc, 'article:tag'),
    ...strList(ld?.keywords, 10),
  ];
  const creator = str(ld?.author, 120) ?? meta(doc, 'author') ?? firstText(doc, ['a[rel="author"]', '[itemprop="author"]'], 120)?.text;
  const publication = meta(doc, 'og:site_name') ?? str(ld?.publisher, 120);
  const description = str(ld?.description, 800) ?? meta(doc, 'og:description') ?? meta(doc, 'description');

  const result: RawPageMetadata = {
    platform: isSubstack ? 'substack' : 'unknown',
    kind: isArticle ? 'article' : 'page',
    url: url.href,
    title: cleanText(title, 300),
    source: ld ? 'page metadata (JSON-LD)' : 'page metadata (Open Graph)',
    confidence: ld || meta(doc, 'og:title') ? 'high' : 'medium',
  };
  if (creator) result.creator = creator;
  if (description) result.description = description;
  if (keywords.length) result.keywords = [...new Set(keywords)].slice(0, 12);
  if (publication) result.publication = publication;
  const published = str(ld?.datePublished, 40) ?? meta(doc, 'article:published_time');
  if (published) result.publishedAt = published;
  return result;
}

export const genericExtractor: PlatformExtractor = {
  id: 'unknown',
  matches: () => true,
  extract: extractGeneric,
};
