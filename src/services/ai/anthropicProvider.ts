/**
 * Claude-backed AI provider (official Anthropic SDK).
 *
 * Used in two places: the backend (server-held key) and the extension's
 * background worker (user-supplied key).  The page, history and account never
 * reach it — only the truncated metadata described in ./types.ts.
 */
import Anthropic from '@anthropic-ai/sdk';
import { AppError, toAppError } from '../../utils/errors';
import { ANALYZE_SCHEMA, ANALYZE_SYSTEM, analyzePrompt, REFINE_SCHEMA, REFINE_SYSTEM, refinePrompt } from './prompts';
import type { AiAnalyzeInput, AiArticleJudgement, AiProvider, AiRefineInput, AiTopicAnalysis } from './types';
import { parseJsonObject, validateAnalysis, validateJudgements } from './validate';

/** Default model.  Override with VITE_AI_MODEL (extension) or ANTHROPIC_MODEL (backend). */
export const DEFAULT_AI_MODEL = 'claude-opus-5-5';

export interface AnthropicProviderOptions {
  apiKey: string;
  model?: string;
  via: AiProvider['via'];
  /** Test seam / custom gateway. */
  baseURL?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

function mapSdkError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof Anthropic.APIUserAbortError) return new AppError('ABORTED', 'Request cancelled', { provider: 'ai' });
  if (err instanceof Anthropic.APIConnectionTimeoutError) return new AppError('TIMEOUT', 'AI request timed out', { provider: 'ai' });
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new AppError('UNAUTHORIZED', 'The Anthropic API key was rejected', { provider: 'ai', status: err.status, retryable: false });
  }
  if (err instanceof Anthropic.RateLimitError) return new AppError('RATE_LIMITED', 'AI rate limit reached', { provider: 'ai', status: 429 });
  if (err instanceof Anthropic.APIConnectionError) return new AppError('NETWORK', 'Could not reach the AI service', { provider: 'ai' });
  if (err instanceof Anthropic.APIError) {
    return new AppError(err.status && err.status >= 500 ? 'UNAVAILABLE' : 'UNKNOWN', `AI request failed (${err.status ?? '?'})`, {
      provider: 'ai',
      ...(err.status !== undefined ? { status: err.status } : {}),
    });
  }
  return toAppError(err, 'ai');
}

export class AnthropicAiProvider implements AiProvider {
  readonly via: AiProvider['via'];
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(opts: AnthropicProviderOptions) {
    this.via = opts.via;
    this.model = opts.model || DEFAULT_AI_MODEL;
    this.client = new Anthropic({
      apiKey: opts.apiKey,
      // The extension's service worker is a browser-like context; the key is the
      // user's own and stays in chrome.storage.local (see secretsService).
      dangerouslyAllowBrowser: true,
      maxRetries: 1,
      timeout: opts.timeoutMs ?? 25_000,
      ...(opts.baseURL ? { baseURL: opts.baseURL } : {}),
      ...(opts.fetch ? { fetch: opts.fetch } : {}),
    });
  }

  private async json(
    system: string,
    user: string,
    schema: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    try {
      const response = await this.client.beta.messages.create(
        {
          model: this.model,
          max_tokens: 4000,
          // A declined request is re-run server-side on the recommended fallback model.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          // Thinking can't be disabled on Opus 5.5; low effort keeps this fast and cheap.
          output_config: { effort: 'low', format: { type: 'json_schema', schema } },
          system,
          messages: [{ role: 'user', content: user }],
        },
        signal ? { signal } : undefined,
      );

      if (response.stop_reason === 'refusal') {
        throw new AppError('UNAVAILABLE', 'The AI declined this request', { provider: 'ai', retryable: false });
      }
      if (response.stop_reason === 'max_tokens') {
        throw new AppError('INVALID_RESPONSE', 'AI response was cut off', { provider: 'ai', retryable: true });
      }
      const text = response.content.find((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')?.text;
      if (!text) throw new AppError('INVALID_RESPONSE', 'AI returned no text', { provider: 'ai', retryable: true });
      return parseJsonObject(text);
    } catch (err) {
      throw mapSdkError(err);
    }
  }

  async analyze(input: AiAnalyzeInput, signal?: AbortSignal): Promise<AiTopicAnalysis> {
    return validateAnalysis(await this.json(ANALYZE_SYSTEM, analyzePrompt(input), ANALYZE_SCHEMA, signal));
  }

  async refine(input: AiRefineInput, signal?: AbortSignal): Promise<AiArticleJudgement[]> {
    const ids = new Set(input.candidates.map((c) => c.id));
    return validateJudgements(await this.json(REFINE_SYSTEM, refinePrompt(input), REFINE_SCHEMA, signal), ids);
  }
}
