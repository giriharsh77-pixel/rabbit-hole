import type {
  ContentContext,
  CurrentContextResponse,
  RawPageMetadata,
} from './context';
import type { SerializedError } from './errors';
import type { DiscussResponse, RedditSearchResponse } from './reddit';
import type { DeepPartial, SecretName, Secrets, SecretsStatus, Settings } from './settings';
import type { DiscoveryResponse } from './substack';
import type { RelatedTitles, TitleCandidate, TitleInfo, TitleInsights } from './title';

/** What the UI may know about the extension's capabilities right now. */
export interface AppStatus {
  reddit: { providers: ('oauth' | 'json' | 'rss')[] };
  substack: {
    providers: ('backend' | 'brave' | 'feeds' | 'medium' | 'news')[];
    /** Only the built-in publication list is available. */
    limitedCoverage: boolean;
    customDomainsAllowed: boolean;
  };
  ai: { available: boolean; via: 'backend' | 'user-key' | null; enabled: boolean };
  backendConfigured: boolean;
  /** What the backend can do (all false without one). */
  backend: { titles: boolean; ratings: boolean; press: boolean };
  version: string;
}

/** Typed popup/options ⇄ background RPC surface. */
export interface RpcMap {
  'context/current': { params: { tabId?: number; refresh?: boolean }; result: CurrentContextResponse };
  /** Run the analysis pipeline on metadata (manual query, Reddit thread, …). */
  'context/analyze': { params: { raw: RawPageMetadata }; result: ContentContext };

  /** Movies and series matching what the user typed (Wikidata). */
  'title/search': { params: { query: string }; result: TitleCandidate[] };
  /** A title picked in the search: its facts plus a ready-to-search context. */
  'title/context': { params: { qid: string }; result: { info: TitleInfo; context: ContentContext } };
  /** Which exact title a Netflix context refers to (null when unsure). */
  'title/resolve': { params: { context: ContentContext }; result: TitleInfo | null };
  /** Ratings, reviews, similar titles, Netflix India — null when the backend can't provide them. */
  'title/insights': { params: { qid: string }; result: TitleInsights | null };
  /** Watch next: titles sharing the leading cast or the director / creator. */
  'title/related': { params: { qid: string }; result: RelatedTitles };

  'reddit/search': {
    params: { queries: string[]; limit?: number; subreddits?: string[]; time?: 'day' | 'week' | 'month' | 'year' | 'all'; strict?: boolean };
    result: RedditSearchResponse;
  };

  /** Threads about one movie / show (its subreddit, TV / film communities, all of Reddit). */
  'reddit/discuss': {
    params: { title: string; kind: 'movie' | 'series'; ownSubreddit?: string; episodeName?: string; season?: number; names?: string[]; limit?: number };
    result: DiscussResponse;
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
