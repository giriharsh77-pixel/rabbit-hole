import { AppError } from './errors';

export function abortError(message = 'Aborted'): AppError {
  return new AppError('ABORTED', message, { retryable: false });
}

export function throwIfAborted(signal?: AbortSignal | null): void {
  if (signal?.aborted) throw abortError();
}

/** Aborts when any of the given signals aborts. */
export function combineSignals(...signals: (AbortSignal | undefined | null)[]): AbortSignal | undefined {
  const real = signals.filter((s): s is AbortSignal => !!s);
  if (real.length === 0) return undefined;
  if (real.length === 1) return real[0];
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(real);
  const controller = new AbortController();
  for (const s of real) {
    if (s.aborted) {
      controller.abort(s.reason);
      break;
    }
    s.addEventListener('abort', () => controller.abort(s.reason), { once: true });
  }
  return controller.signal;
}

/** Resolves after `ms`, or rejects early when `signal` aborts. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** Rejects with an abort error as soon as `signal` aborts, without cancelling `promise`. */
export function raceAbort<T>(promise: Promise<T>, signal?: AbortSignal | null): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (v) => {
        signal.removeEventListener('abort', onAbort);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener('abort', onAbort);
        reject(e);
      },
    );
  });
}
