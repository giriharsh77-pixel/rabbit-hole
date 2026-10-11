/** Data hooks: thin, cancellable wrappers over the background RPC. */
import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_SETTINGS } from '../services/settingsService';
import type { ContentContext, RawPageMetadata } from '../types/context';
import type { DiscussResponse, RedditSearchResponse } from '../types/reddit';
import type { RpcParams } from '../types/messages';
import type { DeepPartial, Settings } from '../types/settings';
import type { DiscoveryResponse } from '../types/substack';
import type { RelatedTitles, TitleCandidate, TitleInfo, TitleInsights } from '../types/title';
import { useAsync } from './hooks';
import { call } from './rpc';

// ─── settings ────────────────────────────────────────────────────────────────

export function useSettingsState(): {
  settings: Settings;
  loaded: boolean;
  update: (patch: DeepPartial<Settings>) => void;
} {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    call('settings/get')
      .then((s) => {
        if (alive) {
          setSettings(s);
          setLoaded(true);
        }
      })
      .catch(() => alive && setLoaded(true));
    // keep in sync when Settings are changed from the options page
    const onChange = (_c: unknown, area: string) => {
      if (area === 'local') void call('settings/get').then((s) => alive && setSettings(s)).catch(() => undefined);
    };
    if (typeof chrome !== 'undefined') chrome.storage?.onChanged?.addListener(onChange);
    return () => {
      alive = false;
      if (typeof chrome !== 'undefined') chrome.storage?.onChanged?.removeListener(onChange);
    };
  }, []);

  const update = useCallback((patch: DeepPartial<Settings>) => {
    void call('settings/update', patch).then(setSettings).catch(() => undefined);
  }, []);

  return { settings, loaded, update };
}

// ─── current page context ───────────────────────────────────────────────────

export function useCurrentContext(tabId: number | undefined) {
  const state = useAsync((signal) => call('context/current', { ...(tabId !== undefined ? { tabId } : {}) }, signal), `ctx:${tabId ?? 'active'}`);
  return { status: state.status, response: state.data, error: state.error, reload: state.reload };
}

// ─── titles (Wikidata) ──────────────────────────────────────────────────────

/** Typeahead results; keeps the previous list while the next one loads so the dropdown doesn't flicker. */
export function useTitleSearch(query: string) {
  const q = query.trim();
  return useAsync<TitleCandidate[]>(q.length >= 2 ? (signal) => call('title/search', { query: q }, signal) : null, `title-search:${q.toLowerCase()}`, {
    keepPrevious: true,
  });
}

/** A picked title: its facts and a context to search from. */
export function useTitleContext(qid: string | null) {
  return useAsync<{ info: TitleInfo; context: ContentContext }>(qid ? (signal) => call('title/context', { qid }, signal) : null, `title-ctx:${qid ?? ''}`);
}

/** Which exact title the Netflix tab shows (null when Wikidata has no confident match). */
export function useTitleResolve(context: ContentContext | null) {
  const key = context ? `title-resolve:${context.title}:${context.regionTag ?? ''}:${context.kind}:${context.year ?? ''}` : 'off';
  return useAsync<TitleInfo | null>(context ? (signal) => call('title/resolve', { context }, signal) : null, key);
}

/** Ratings, reviews, similar titles, Netflix India (null: no backend with those keys). */
export function useTitleInsights(qid: string | null) {
  return useAsync<TitleInsights | null>(qid ? (signal) => call('title/insights', { qid }, signal) : null, `title-insights:${qid ?? ''}`);
}

export function useRelatedTitles(qid: string | null) {
  return useAsync<RelatedTitles>(qid ? (signal) => call('title/related', { qid }, signal) : null, `title-related:${qid ?? ''}`);
}

// ─── reddit ──────────────────────────────────────────────────────────────────

export function useRedditSearch(
  queries: string[] | null,
  limit: number,
  opts: { time?: 'day' | 'week' | 'month' | 'year' | 'all'; strict?: boolean } = {},
) {
  const { time, strict } = opts;
  const key = queries ? `${limit}:${time ?? ''}:${strict ? 's' : ''}:${queries.join('|')}` : 'off';
  return useAsync<RedditSearchResponse>(
    queries && queries.length
      ? (signal) => call('reddit/search', { queries, limit, ...(time ? { time } : {}), ...(strict ? { strict } : {}) }, signal)
      : null,
    key,
  );
}

export function useRedditDiscuss(params: RpcParams<'reddit/discuss'> | null) {
  const key = params ? `discuss:${JSON.stringify(params)}` : 'off';
  return useAsync<DiscussResponse>(params ? (signal) => call('reddit/discuss', params, signal) : null, key);
}

// ─── context analysis + discovery ───────────────────────────────────────────

export function useAnalyzed(raw: RawPageMetadata | null) {
  const key = raw ? `${raw.platform}:${raw.title}:${raw.subreddit ?? ''}` : 'off';
  return useAsync<ContentContext>(raw ? (signal) => call('context/analyze', { raw }, signal) : null, key);
}

export function useDiscovery(context: ContentContext | null) {
  const key = context ? `${context.platform}:${context.title}:${context.concepts.map((c) => c.text).join(',')}` : 'off';
  return useAsync<DiscoveryResponse>(context ? (signal) => call('substack/discover', { context }, signal) : null, key);
}
