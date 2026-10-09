import type {
  ContentContext,
  CurrentContextResponse,
  RawPageMetadata,
} from './context';
import type { SerializedError } from './errors';
import type { RedditSearchResponse, TrendingResponse } from './reddit';
import type { DeepPartial, SecretName, Secrets, SecretsStatus, Settings } from './settings';
import type { DiscoveryResponse } from './substack';

/** What the UI may know about the extension's capabilities right now. */
export interface AppStatus {
  reddit: { providers: ('oauth' | 'json' | 'rss')[] };
  substack: {
    providers: ('backend' | 'brave' | 'feeds')[];
    /** Only the built-in publication list is available. */
    limitedCoverage: boolean;
    customDomainsAllowed: boolean;
  };
  ai: { available: boolean; via: 'backend' | 'user-key' | null; enabled: boolean };
  backendConfigured: boolean;
  version: string;
}

/** Typed popup/options ⇄ background RPC surface. */
export interface RpcMap {
  'context/current': { params: { tabId?: number; refresh?: boolean }; result: CurrentContextResponse };
  /** Explicit, user-initiated read of an arbitrary page (activeTab). */
  'context/usePage': { params: { tabId?: number }; result: CurrentContextResponse };
  /** Run the analysis pipeline on metadata (manual query, Reddit thread, …). */
  'context/analyze': { params: { raw: RawPageMetadata }; result: ContentContext };

  /** `cacheOnly` returns whatever is cached (even stale) or null, so the UI can paint instantly. */
  'reddit/trending': {
    params: { topicId: string; refresh?: boolean; cacheOnly?: boolean };
    result: TrendingResponse | null;
  };
  'reddit/search': {
    params: { queries: string[]; limit?: number; subreddits?: string[] };
    result: RedditSearchResponse;
  };

  'substack/discover': { params: { context: ContentContext; refresh?: boolean }; result: DiscoveryResponse };

  'settings/get': { params: undefined; result: Settings };
  'settings/update': { params: DeepPartial<Settings>; result: Settings };
  'settings/reset': { params: undefined; result: Settings };

  'secrets/status': { params: undefined; result: SecretsStatus };
  'secrets/set': { params: { name: SecretName; value: string }; result: SecretsStatus };
  'secrets/clear': { params: { name: SecretName }; result: SecretsStatus };

  'cache/clear': { params: undefined; result: { removed: number } };
  /** Wipes settings, secrets and every cache. */
  'data/clearAll': { params: undefined; result: Settings };

  'status/get': { params: undefined; result: AppStatus };
}

export type RpcMethod = keyof RpcMap;
export type RpcParams<M extends RpcMethod> = RpcMap[M]['params'];
export type RpcResult<M extends RpcMethod> = RpcMap[M]['result'];

export const RPC_PORT_NAME = 'rabbit-hole:rpc';

export interface RpcRequestMessage {
  kind: 'rpc';
  id: number;
  method: RpcMethod;
  params: unknown;
}

export interface RpcCancelMessage {
  kind: 'cancel';
  id: number;
}

export type RpcResponseMessage =
  | { kind: 'rpc-result'; id: number; ok: true; data: unknown }
  | { kind: 'rpc-result'; id: number; ok: false; error: SerializedError };

/** Background → content script. */
export interface ExtractRequest {
  type: 'rh/extract';
}

export type ExtractResponse =
  | { ok: true; data: RawPageMetadata | null }
  | { ok: false; error: string };

export type { Secrets };
