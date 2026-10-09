import { describe, expect, it } from 'vitest';
import { RPC_PORT_NAME } from '../src/types/messages';
import { AppError } from '../src/utils/errors';
import { attachRpcPort, RpcClient, type RpcClientPort, type RpcServerPort } from '../src/utils/rpc';

const ORIGIN = 'chrome-extension://abc/';

function pair(handlers: Record<string, (p: unknown, c: { signal: AbortSignal }) => Promise<unknown>>, senderUrl = `${ORIGIN}popup.html`) {
  const toClient: ((m: unknown) => void)[] = [];
  const toServer: ((m: unknown) => void)[] = [];
  const serverDisc: (() => void)[] = [];
  const clientDisc: (() => void)[] = [];
  const server: RpcServerPort = {
    name: RPC_PORT_NAME,
    sender: { url: senderUrl },
    postMessage: (m) => queueMicrotask(() => toClient.forEach((f) => f(m))),
    onMessage: { addListener: (f) => void toServer.push(f) },
    onDisconnect: { addListener: (f) => void serverDisc.push(f) },
  };
  const accepted = attachRpcPort(server, { handlers, allowedOrigin: ORIGIN });
  const client: RpcClientPort = {
    postMessage: (m) => queueMicrotask(() => toServer.forEach((f) => f(m))),
    onMessage: { addListener: (f) => void toClient.push(f) },
    onDisconnect: { addListener: (f) => void clientDisc.push(f) },
    disconnect: () => serverDisc.forEach((f) => f()),
  };
  return { accepted, client, crash: () => clientDisc.forEach((f) => f()) };
}

describe('RPC over a port', () => {
  it('round-trips results', async () => {
    const { client } = pair({ 'settings/get': async (p) => ({ echoed: p }) });
    const rpc = new RpcClient(() => client);
    await expect(rpc.call('settings/get' as never, { a: 1 } as never)).resolves.toEqual({ echoed: { a: 1 } });
  });

  it('serialises errors across the boundary with their codes', async () => {
    const { client } = pair({ 'reddit/search': async () => Promise.reject(new AppError('RATE_LIMITED', 'slow', { retryAfterMs: 5000 })) });
    const rpc = new RpcClient(() => client);
    await expect(rpc.call('reddit/search', { queries: ['x'] })).rejects.toMatchObject({ code: 'RATE_LIMITED', retryable: true, retryAfterMs: 5000 });
  });

  it('turns unexpected exceptions into a safe error, not a leak', async () => {
    const { client } = pair({ 'settings/get': async () => Promise.reject(new Error('secret internal path /Users/x')) });
    const err = await new RpcClient(() => client).call('settings/get').catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'UNKNOWN' });
  });

  it('cancels in-flight work on the server when the caller aborts', async () => {
    let serverSignal!: AbortSignal;
    const { client } = pair({
      'substack/discover': (_p, c) => {
        serverSignal = c.signal;
        return new Promise(() => undefined);
      },
    });
    const rpc = new RpcClient(() => client);
    const controller = new AbortController();
    const call = rpc.call('substack/discover', {} as never, controller.signal);
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    controller.abort();
    await expect(call).rejects.toMatchObject({ code: 'ABORTED' });
    await new Promise((r) => setTimeout(r, 0));
    expect(serverSignal.aborted).toBe(true);
  });

  it('aborts all work when the page closes', async () => {
    let sig!: AbortSignal;
    const { client } = pair({ 'reddit/trending': (_p, c) => ((sig = c.signal), new Promise(() => undefined)) });
    const rpc = new RpcClient(() => client);
    void rpc.call('reddit/trending', { topicId: 'all' }).catch(() => undefined);
    await new Promise((r) => setTimeout(r, 0));
    client.disconnect();
    expect(sig.aborted).toBe(true);
  });

  it('rejects pending calls if the worker disappears', async () => {
    const { client, crash } = pair({ 'reddit/trending': () => new Promise(() => undefined) });
    const rpc = new RpcClient(() => client);
    const pending = rpc.call('reddit/trending', { topicId: 'all' });
    await new Promise((r) => setTimeout(r, 0));
    crash();
    await expect(pending).rejects.toMatchObject({ code: 'UNAVAILABLE', retryable: true });
  });

  it('refuses unknown methods (including prototype tricks)', async () => {
    const { client } = pair({ ok: async () => 1 });
    const rpc = new RpcClient(() => client);
    await expect(rpc.call('toString' as never)).rejects.toMatchObject({ code: 'UNKNOWN' });
    await expect(rpc.call('__proto__' as never)).rejects.toMatchObject({ code: 'UNKNOWN' });
  });

  it('refuses connections that are not from our own extension pages (e.g. a content script on a website)', () => {
    expect(pair({}, 'https://evil.example/page').accepted).toBe(false);
    expect(pair({}, null as unknown as string).accepted).toBe(false);
    expect(pair({}, `${ORIGIN}options.html`).accepted).toBe(true);
  });
});
