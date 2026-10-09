/**
 * Shared bootstrap for every content script.
 *
 * A content script does exactly one thing: wait.  It does not observe the DOM,
 * poll, inject UI, touch playback, or send anything on its own.  When the
 * background asks ("rh/extract") it reads the page once and replies.
 */
import type { RawPageMetadata } from '../types/context';
import type { ExtractResponse } from '../types/messages';

declare global {
  interface Window {
    /** Guards against double registration when a script is injected on demand as well. */
    __rabbitHoleContent?: boolean;
  }
}

export type PageExtractor = (doc: Document, url: URL) => RawPageMetadata | null | Promise<RawPageMetadata | null>;

export function registerExtractor(extract: PageExtractor): void {
  if (window.__rabbitHoleContent) return;
  window.__rabbitHoleContent = true;

  chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    // Only our own extension may ask, and only for this one thing.
    if (sender.id !== chrome.runtime.id) return false;
    if ((message as { type?: unknown } | null)?.type !== 'rh/extract') return false;

    Promise.resolve()
      .then(() => extract(document, new URL(location.href)))
      .then(
        (data) => sendResponse({ ok: true, data } satisfies ExtractResponse),
        (err: unknown) => sendResponse({ ok: false, error: err instanceof Error ? err.message : 'extract failed' } satisfies ExtractResponse),
      );
    return true; // keep the channel open for the async response
  });
}
