/** Validation of model output — never trust a model (or a proxy) to match the schema. */
import { AppError } from '../../utils/errors';
import { cleanText } from '../../utils/sanitize';
import type { AiArticleJudgement, AiTopicAnalysis } from './types';

function strings(v: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of v) {
    const t = cleanText(item, maxLen);
    const k = t.toLowerCase();
    if (!t || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
    if (out.length >= maxItems) break;
  }
  return out;
}

export function parseJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    /* fall through */
  }
  throw new AppError('INVALID_RESPONSE', 'AI response was not valid JSON', { provider: 'ai', retryable: false });
}

export function validateAnalysis(raw: unknown): AiTopicAnalysis {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const analysis: AiTopicAnalysis = {
    topics: strings(o.topics, 6, 60),
    entities: strings(o.entities, 8, 60),
    concepts: strings(o.concepts, 8, 60),
    queries: strings(o.queries, 5, 110).filter((q) => !/\bsite:|https?:\/\//i.test(q)),
  };
  if (analysis.topics.length + analysis.concepts.length + analysis.queries.length === 0) {
    throw new AppError('INVALID_RESPONSE', 'AI response had no usable content', { provider: 'ai', retryable: false });
  }
  return analysis;
}

export function validateJudgements(raw: unknown, validIds: ReadonlySet<string>): AiArticleJudgement[] {
  const list = (raw as { judgements?: unknown } | null)?.judgements;
  if (!Array.isArray(list)) throw new AppError('INVALID_RESPONSE', 'AI response had no judgements', { provider: 'ai', retryable: false });
  const out: AiArticleJudgement[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const o = item as { id?: unknown; relevance?: unknown; why?: unknown } | null;
    const id = typeof o?.id === 'string' ? o.id : '';
    const rel = typeof o?.relevance === 'number' && Number.isFinite(o.relevance) ? Math.min(1, Math.max(0, o.relevance)) : undefined;
    if (!validIds.has(id) || seen.has(id) || rel === undefined) continue;
    seen.add(id);
    out.push({ id, relevance: rel, why: cleanText(o?.why, 260) });
  }
  return out;
}
