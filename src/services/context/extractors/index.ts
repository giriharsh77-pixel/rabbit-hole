/**
 * Extractor registry.  Rabbit Hole reads one kind of page: Netflix (movies and
 * series).  Everything else is reached through the title search.
 */
import type { PlatformExtractor, RawPageMetadata } from '../../../types/context';
import { netflixExtractor } from './netflix';

export const EXTRACTORS: readonly PlatformExtractor[] = [netflixExtractor];

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

export { extractNetflix } from './netflix';
