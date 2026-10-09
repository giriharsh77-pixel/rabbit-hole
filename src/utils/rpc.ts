/**
 * Typed RPC between extension pages (popup / options / dashboard) and the
 * background service worker, over a long-lived chrome.runtime port.
 *
 * Why a port instead of sendMessage?
 *  • the worker learns when the page closes and aborts its in-flight work
 *  • a pending port keeps the MV3 worker alive while a slow search runs
 *  • individual calls can be cancelled (stale search → newer search)
 */
import type {
  RpcCancelMessage,
  RpcMethod,
  RpcParams,
  RpcRequestMessage,
  RpcResponseMessage,
  RpcResult,
} from '../types/messages';
import { RPC_PORT_NAME } from '../types/messages';
import { abortError } from './abort';
import { AppError, deserializeError, serializeError } from './errors';

// ─── client (popup side) ─────────────────────────────────────────────────────

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
  cleanup: () => void;
}

export interface RpcClientPort {
  postMessage(message: unknown): void;
  onMessage: { addListener(cb: (message: unknown) => void): void };
  onDisconnect: { addListener(cb: () => void): void };
  disconnect(): void;
}

export class RpcClient {
  private port: RpcClientPort | undefined;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();

  constructor(private readonly connect: () => RpcClientPort = defaultConnect) {}

  private ensurePort(): RpcClientPort {
    if (this.port) return this.port;
    const port = this.connect();
    port.onMessage.addListener((raw) => this.onMessage(raw as RpcResponseMessage));
    port.onDisconnect.addListener(() => {
      this.port = undefined;
      // The worker went away mid-call (it was restarted or crashed): fail loudly, callers may retry.
      for (const [id, p] of this.pending) {
        p.cleanup();
        p.reject(new AppError('UNAVAILABLE', 'The background service restarted — try again', { retryable: true }));
        this.pending.delete(id);
      }
    });
    this.port = port;
    return port;
  }

  private onMessage(msg: RpcResponseMessage): void {
    if (msg?.kind !== 'rpc-result') return;
    const entry = this.pending.get(msg.id);
    if (!entry) return; // cancelled or already settled
    this.pending.delete(msg.id);
    entry.cleanup();
    if (msg.ok) entry.resolve(msg.data);
    else entry.reject(deserializeError(msg.error));
  }

  call<M extends RpcMethod>(method: M, params?: RpcParams<M>, signal?: AbortSignal): Promise<RpcResult<M>> {
    if (signal?.aborted) return Promise.reject(abortError());
    const id = this.nextId++;
    return new Promise<RpcResult<M>>((resolve, reject) => {
      const onAbort = () => {
        if (!this.pending.delete(id)) return;
        try {
          this.port?.postMessage({ kind: 'cancel', id } satisfies RpcCancelMessage);
        } catch {
          /* port already gone */
        }
        reject(abortError());
      };
      const cleanup = () => signal?.removeEventListener('abort', onAbort);
      signal?.addEventListener('abort', onAbort, { once: true });
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, cleanup });
      try {
        this.ensurePort().postMessage({ kind: 'rpc', id, method, params } satisfies RpcRequestMessage);
      } catch (err) {
        this.pending.delete(id);
        cleanup();
        reject(new AppError('UNAVAILABLE', 'Could not reach the background service', { retryable: true, cause: err }));
      }
    });
  }

  close(): void {
    this.port?.disconnect();
    this.port = undefined;
  }
}

function defaultConnect(): RpcClientPort {
  return chrome.runtime.connect({ name: RPC_PORT_NAME }) as unknown as RpcClientPort;
}

// ─── server (background side) ────────────────────────────────────────────────

export interface RpcServerPort {
  name: string;
  sender?: { id?: string | undefined; url?: string | undefined } | undefined;
  postMessage(message: unknown): void;
  onMessage: { addListener(cb: (message: unknown) => void): void };
  onDisconnect: { addListener(cb: () => void): void };
}

type AnyHandler = (params: unknown, ctx: { signal: AbortSignal }) => Promise<unknown>;

export interface RpcServerOptions {
  handlers: Record<string, AnyHandler>;
  /** Only accept connections whose sender URL begins with this (our own extension pages). */
  allowedOrigin: string;
}

/** Attach to a freshly-connected port.  Returns false when the connection is refused. */
export function attachRpcPort(port: RpcServerPort, opts: RpcServerOptions): boolean {
  if (port.name !== RPC_PORT_NAME) return false;
  // Content scripts run inside web pages and report that page's URL — refuse them.
  if (!port.sender?.url?.startsWith(opts.allowedOrigin)) return false;

  const inflight = new Map<number, AbortController>();
  const reply = (msg: RpcResponseMessage) => {
    try {
      port.postMessage(msg);
    } catch {
      /* the page closed while we were working */
    }
  };

  port.onMessage.addListener(async (raw) => {
    const msg = raw as RpcRequestMessage | RpcCancelMessage;
    if (msg?.kind === 'cancel') {
      inflight.get(msg.id)?.abort();
      return;
    }
    if (msg?.kind !== 'rpc' || typeof msg.id !== 'number') return;

    const handler = Object.hasOwn(opts.handlers, msg.method) ? opts.handlers[msg.method] : undefined;
    if (!handler) {
      reply({ kind: 'rpc-result', id: msg.id, ok: false, error: new AppError('UNKNOWN', 'Unknown method', { retryable: false }).toJSON() });
      return;
    }
    const controller = new AbortController();
    inflight.set(msg.id, controller);
    try {
      const data = await handler(msg.params, { signal: controller.signal });
      if (!controller.signal.aborted) reply({ kind: 'rpc-result', id: msg.id, ok: true, data });
    } catch (err) {
      if (!controller.signal.aborted) reply({ kind: 'rpc-result', id: msg.id, ok: false, error: serializeError(err) });
    } finally {
      inflight.delete(msg.id);
    }
  });

  // Page closed: stop doing work nobody will read.
  port.onDisconnect.addListener(() => {
    for (const c of inflight.values()) c.abort();
    inflight.clear();
  });
  return true;
}
