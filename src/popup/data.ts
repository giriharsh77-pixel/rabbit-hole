/** Data hooks: thin, cancellable wrappers over the background RPC. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_SETTINGS } from '../services/settingsService';
import type { ContentContext, CurrentContextResponse, RawPageMetadata } from '../types/context';
import type { SerializedError } from '../types/errors';
import type { RedditSearchResponse, TrendingResponse } from '../types/reddit';
import type { DeepPartial, Settings } from '../types/settings';
import type { DiscoveryResponse } from '../types/substack';
import { isAbortError, serializeError } from '../utils/errors';
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
  const [override, setOverride] = useState<CurrentContextResponse | undefined>();
  const [usePageError, setUsePageError] = useState<SerializedError | undefined>();
  const [usingPage, setUsingPage] = useState(false);
  const state = useAsync((signal) => call('context/current', { ...(tabId !== undefined ? { tabId } : {}) }, signal), `ctx:${tabId ?? 'active'}`);

  const usePage = useCallback(async () => {
    setUsingPage(true);
    setUsePageError(undefined);
    try {
      setOverride(await call('context/usePage', { ...(tabId !== undefined ? { tabId } : {}) }));
    } catch (err) {
      if (!isAbortError(err)) setUsePageError(serializeError(err));
    } finally {
      setUsingPage(false);
    }
  }, [tabId]);

  return {
    status: state.status,
    response: override ?? state.data,
    error: state.error,
    reload: state.reload,
    usePage,
    usingPage,
    usePageError,
  };
}

// ─── trending reddit ─────────────────────────────────────────────────────────

export interface TrendingState {
  data: TrendingResponse | undefined;
  /** First load with nothing to show yet. */
  loading: boolean;
  /** Showing cached data while a refresh is in flight. */
  refreshing: boolean;
  error: SerializedError | undefined;
  refresh: () => void;
}

/** Stale-while-revalidate: paint from cache instantly, then refresh in the background. */
export function useTrending(topicId: string, enabled: boolean): TrendingState {
  const [data, setData] = useState<TrendingResponse | undefined>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<SerializedError | undefined>();
  const [nonce, setNonce] = useState(0);
  const topicRef = useRef(topicId);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const forced = nonce > 0 && topicRef.current === topicId;
    topicRef.current = topicId;
    setError(undefined);

    (async () => {
      let shown: TrendingResponse | undefined;
      try {
        const cached = await call('reddit/trending', { topicId, cacheOnly: true }, controller.signal);
        if (controller.signal.aborted) return;
        if (cached) {
          shown = cached;
          setData(cached);
          setLoading(false);
          if (!cached.stale && !forced) return; // fresh enough
          setRefreshing(true);
        } else {
          setData(undefined);
          setLoading(true);
        }
        const fresh = await call('reddit/trending', { topicId, ...(forced ? { refresh: true } : {}) }, controller.signal);
        if (controller.signal.aborted) return;
        if (fresh) setData(fresh);
        setError(undefined);
      } catch (err) {
        if (controller.signal.aborted || isAbortError(err)) return;
        setError(serializeError(err));
        if (!shown) setData(undefined);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    })();
    return () => controller.abort();
  }, [topicId, enabled, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  return { data, loading, refreshing, error, refresh };
}

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

// ─── context analysis + discovery ───────────────────────────────────────────

export function useAnalyzed(raw: RawPageMetadata | null) {
  const key = raw ? `${raw.platform}:${raw.title}:${raw.subreddit ?? ''}` : 'off';
  return useAsync<ContentContext>(raw ? (signal) => call('context/analyze', { raw }, signal) : null, key);
}

export function useDiscovery(context: ContentContext | null) {
  const key = context ? `${context.platform}:${context.title}:${context.concepts.map((c) => c.text).join(',')}` : 'off';
  return useAsync<DiscoveryResponse>(context ? (signal) => call('substack/discover', { context }, signal) : null, key);
}
