/**
 * Extractor registry.  Add a platform = add an extractor here (and a URL rule
 * in ../platform.ts).  Order matters: the first match wins, `generic` is last.
 */
import type { PlatformExtractor, RawPageMetadata } from '../../../types/context';
import { genericExtractor } from './generic';
import { netflixExtractor } from './netflix';
import { redditExtractor } from './reddit';
import { youtubeExtractor } from './youtube';

export const EXTRACTORS: readonly PlatformExtractor[] = [
  youtubeExtractor,
  netflixExtractor,
  redditExtractor,
  genericExtractor,
];

export async function extractFromDocument(doc: Document, url: URL): Promise<RawPageMetadata | null> {
  for (const extractor of EXTRACTORS) {
    if (!extractor.matches(url)) continue;
    try {
      return await extractor.extract(doc, url);
    } catch {
      // A site redesign must never throw inside the host page.
      return null;
    }
  }
  return null;
}

export { extractGeneric } from './generic';
export { extractNetflix } from './netflix';
export { extractReddit } from './reddit';
export { extractYouTube } from './youtube';
