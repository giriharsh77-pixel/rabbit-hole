import { useCallback, useEffect, useRef, useState } from 'react';
import type { SerializedError } from '../types/errors';
import { isAbortError, serializeError } from '../utils/errors';

export type AsyncStatus = 'idle' | 'loading' | 'success' | 'error';

export interface AsyncState<T> {
  status: AsyncStatus;
  data: T | undefined;
  error: SerializedError | undefined;
}

/**
 * Runs `load` whenever `key` changes.  The previous request is aborted (so a
 * slow stale search can never overwrite a newer one), results of aborted runs
 * are ignored, and unmounting cancels everything.
 */
export function useAsync<T>(
  load: ((signal: AbortSignal) => Promise<T>) | null,
  key: string,
  opts: { keepPrevious?: boolean } = {},
): AsyncState<T> & { reload: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ status: 'idle', data: undefined, error: undefined });
  const [nonce, setNonce] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;
  const hasLoader = load !== null;

  useEffect(() => {
    const fn = loadRef.current;
    if (!fn) {
      setState({ status: 'idle', data: undefined, error: undefined });
      return;
    }
    const controller = new AbortController();
    setState((prev) => ({
      status: 'loading',
      data: opts.keepPrevious ? prev.data : undefined,
      error: undefined,
    }));
    fn(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ status: 'success', data, error: undefined });
      },
      (err: unknown) => {
        if (controller.signal.aborted || isAbortError(err)) return;
        setState((prev) => ({ status: 'error', data: opts.keepPrevious ? prev.data : undefined, error: serializeError(err) }));
      },
    );
    return () => controller.abort();
    // `key` is the dependency: it encodes everything `load` closes over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce, hasLoader]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}

export function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

/** Re-renders every `intervalMs` so "3m ago" labels stay honest without any polling of the network. */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}
