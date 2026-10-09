import { RpcClient, type RpcClientPort } from '../utils/rpc';
import type { RpcMethod, RpcParams, RpcResult } from '../types/messages';

/**
 * One shared connection to the background worker for this page.
 * In the UI-only preview (`npm run dev:ui`) the port is an in-page stand-in.
 */
let client: RpcClient | undefined;
let previewConnect: (() => RpcClientPort) | undefined;

export function setPreviewConnect(fn: () => RpcClientPort): void {
  previewConnect = fn;
  client = undefined;
}

function getClient(): RpcClient {
  client ??= new RpcClient(previewConnect);
  return client;
}

export function call<M extends RpcMethod>(method: M, params?: RpcParams<M>, signal?: AbortSignal): Promise<RpcResult<M>> {
  return getClient().call(method, params, signal);
}
