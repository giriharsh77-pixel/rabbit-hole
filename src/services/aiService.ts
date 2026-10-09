/**
 * aiService — the optional LLM layer, off unless the user turns it on.
 *
 *   enrich()  topic + entity + concept extraction and query generation
 *   judge()   semantic relevance scoring + "why this is relevant" explanations
 *
 * Provider order: the deployed backend (server-held key) → the user's own key.
 * Every failure degrades silently to the on-device heuristics; AI is an
 * enhancement, never a dependency.
 */
import type { ContentContext } from '../types/context';
import type { ArticleCandidate } from '../types/substack';
import type { Settings } from '../types/settings';
import { isAbortError } from '../utils/errors';
import { BUILD_ENV } from '../utils/env';
import { hashString } from '../utils/text';
import { AnthropicAiProvider } from './ai/anthropicProvider';
import type { AiAnalyzeInput, AiProvider } from './ai/types';
import type { BackendClient } from './backend/client';
import { CacheService, TTL } from './cacheService';
import { mergeAiAnalysis } from './contextService';

export interface AiStatus {
  available: boolean;
  via: 'backend' | 'user-key' | null;
  enabled: boolean;
}

export interface AiServiceDeps {
  getSettings: () => Promise<Settings>;
  getBackend: () => BackendClient | undefined;
  getUserKey: () => Promise<string | undefined>;
  cache: CacheService;
  model?: string;
  fetchImpl?: typeof fetch;
}

export class AiService {
  private byok: { key: string; provider: AnthropicAiProvider } | undefined;

  constructor(private readonly deps: AiServiceDeps) {}

  private async resolve(signal?: AbortSignal): Promise<AiProvider | undefined> {
    const backend = this.deps.getBackend();
    if (backend) {
      try {
        if ((await backend.features(signal)).ai) return backend;
      } catch {
        /* fall through to a user key */
      }
    }
    const key = await this.deps.getUserKey();
    if (!key) return undefined;
    if (this.byok?.key !== key) {
      this.byok = {
        key,
        provider: new AnthropicAiProvider({
          apiKey: key,
          via: 'user-key',
          model: this.deps.model ?? (BUILD_ENV.aiModel || undefined),
          ...(this.deps.fetchImpl ? { fetch: this.deps.fetchImpl } : {}),
        }),
      };
    }
    return this.byok.provider;
  }

  async status(): Promise<AiStatus> {
    const settings = await this.deps.getSettings();
    const provider = await this.resolve().catch(() => undefined);
    return { available: !!provider, via: provider?.via ?? null, enabled: settings.privacy.aiEnabled };
  }

  /** The provider to use right now, or undefined when AI is off / unavailable. */
  async active(signal?: AbortSignal): Promise<AiProvider | undefined> {
    const settings = await this.deps.getSettings();
    if (!settings.privacy.aiEnabled) return undefined;
    return this.resolve(signal);
  }

  /** Merge an LLM's reading of the content into the heuristic context. */
  async enrich(ctx: ContentContext, signal?: AbortSignal): Promise<ContentContext> {
    const provider = await this.active(signal);
    if (!provider) return ctx;

    const input: AiAnalyzeInput = {
      platform: ctx.platform,
      kind: ctx.kind,
      title: ctx.title,
      ...(ctx.creator ? { creator: ctx.creator } : {}),
      ...(ctx.description ? { description: ctx.description } : {}),
      ...(ctx.episode ? { episode: ctx.episode } : {}),
      ...(ctx.genres?.length ? { genres: ctx.genres } : {}),
      keywords: ctx.topics.slice(0, 6),
    };
    try {
      const result = await this.deps.cache.getOrFetch(
        `ai:analyze:${hashString(JSON.stringify(input))}`,
        TTL.aiAnalysis,
        (s) => provider.analyze(input, s),
        { ...(signal ? { signal } : {}), allowStale: false },
      );
      return mergeAiAnalysis(ctx, result.value);
    } catch (err) {
      if (isAbortError(err)) throw err;
      return ctx;
    }
  }

  /** Per-article semantic scores + grounded explanations; undefined if unavailable. */
  async judge(
    ctx: ContentContext,
    candidates: readonly ArticleCandidate[],
    signal?: AbortSignal,
  ): Promise<Map<string, { score: number; why?: string }> | undefined> {
    const provider = await this.active(signal);
    if (!provider || candidates.length === 0) return undefined;
    const input = {
      source: { title: ctx.title, platform: ctx.platform, topics: ctx.topics },
      candidates: candidates.slice(0, 12).map((c) => ({
        id: c.id,
        title: c.title,
        excerpt: c.excerpt,
        publication: c.publicationName,
      })),
    };
    try {
      const result = await this.deps.cache.getOrFetch(
        `ai:judge:${hashString(JSON.stringify(input))}`,
        TTL.substackSearch,
        (s) => provider.refine(input, s),
        { ...(signal ? { signal } : {}), allowStale: false },
      );
      if (result.value.length === 0) return undefined;
      return new Map(result.value.map((j) => [j.id, { score: j.relevance, ...(j.why ? { why: j.why } : {}) }]));
    } catch (err) {
      if (isAbortError(err)) throw err;
      return undefined;
    }
  }
}
