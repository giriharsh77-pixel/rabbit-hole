/**
 * contextService — the reusable context-extraction pipeline.
 *
 *   Current webpage
 *        ↓  detectPlatform()          services/context/platform.ts
 *        ↓  PlatformExtractor         services/context/extractors/*   (runs in the page)
 *        ↓  buildContext()            topic + keyword + entity extraction
 *        ↓  generateQueries()         services/context/queries.ts
 *        ↓  substackService / redditService
 *
 * To support a new platform: write an extractor (DOM → RawPageMetadata),
 * add a URL rule to platform.ts, add a content script.  Nothing downstream changes.
 */
import type { Concept, ConceptOrigin, ContentContext, ContentKind, Platform, RawPageMetadata, UsedInfoField } from '../types/context';
import { AppError } from '../utils/errors';
import type { AiTopicAnalysis } from './ai/types';
import { cleanText } from '../utils/sanitize';
import { phraseKey, truncate, uniqueBy } from '../utils/text';
import { extractTopics } from './context/topics';

export { detectPlatform, isAutoDetectable, parseUrl, platformLabel } from './context/platform';
export { generateQueries } from './context/queries';
export { extractTopics } from './context/topics';

/** Analyse raw page metadata into a ContentContext (heuristic, on-device). */
export function buildContext(raw: RawPageMetadata, now: number = Date.now()): ContentContext {
  const analysis = extractTopics({
    platform: raw.platform,
    kind: raw.kind,
    title: raw.title,
    creator: raw.creator,
    description: raw.description,
    episode: raw.episode,
    keywords: raw.keywords,
    hashtags: raw.hashtags,
    genres: raw.genres,
    category: raw.category,
    people: raw.people,
  });

  const ctx: ContentContext = {
    platform: raw.platform,
    title: analysis.cleanedTitle || cleanText(raw.title, 200),
    keywords: analysis.keywords,
    entities: analysis.entities,
    kind: raw.kind,
    topics: analysis.topics,
    concepts: analysis.concepts,
    analyzedBy: 'heuristic',
    capturedAt: now,
  };
  if (raw.creator) ctx.creator = cleanText(raw.creator, 120);
  if (raw.description) ctx.description = truncate(cleanText(raw.description, 800), 400);
  if (raw.episode) ctx.episode = cleanText(raw.episode, 160);
  if (raw.url) ctx.url = raw.url;
  if (raw.genres?.length) ctx.genres = raw.genres.slice(0, 6);
  if (raw.subreddit) ctx.subreddit = raw.subreddit;
  if (raw.publication) ctx.publication = cleanText(raw.publication, 120);
  return ctx;
}

/** A context from free text the user typed ("Nvidia", "Indian startups"). */
export function manualContext(query: string, now: number = Date.now()): ContentContext {
  const title = cleanText(query, 120);
  return buildContext(
    { platform: 'manual', kind: 'query', url: '', title, source: 'manual search', confidence: 'high' },
    now,
  );
}

/**
 * Fold an LLM's analysis into a heuristic context.  AI concepts are trusted a
 * bit more than ontology expansions but never override the page's own title.
 */
export function mergeAiAnalysis(ctx: ContentContext, ai: AiTopicAnalysis): ContentContext {
  const concepts = [...ctx.concepts];
  const have = new Set(concepts.map((c) => phraseKey(c.text)));
  const add = (text: string, weight: number) => {
    const key = phraseKey(text);
    if (!key || have.has(key)) return;
    have.add(key);
    concepts.push({ text, weight, origin: 'ai' });
  };
  ai.topics.forEach((t, i) => add(t, Math.max(0.55, 0.9 - i * 0.05)));
  ai.concepts.forEach((c, i) => add(c, Math.max(0.35, 0.6 - i * 0.04)));
  ai.entities.forEach((e) => add(e, 0.75));

  concepts.sort((a, b) => b.weight - a.weight);
  const entities = uniqueBy([...ai.entities, ...ctx.entities], phraseKey).slice(0, 8);
  const topics = uniqueBy([...ai.topics, ...ctx.topics], phraseKey).slice(0, 6);
  return {
    ...ctx,
    concepts: concepts.slice(0, 18),
    keywords: concepts.slice(0, 18).map((c) => c.text),
    entities,
    topics,
    analyzedBy: 'ai',
    ...(ai.queries.length ? { aiQueries: ai.queries } : {}),
  };
}

/** The transparent "What Rabbit Hole used" list shown in the UI. */
export function describeUsedInfo(raw: RawPageMetadata | undefined, ctx: ContentContext | undefined): UsedInfoField[] {
  const fields: UsedInfoField[] = [];
  if (raw) {
    fields.push({ label: 'Read from this page', value: raw.source });
    if (raw.title) fields.push({ label: 'Title', value: truncate(raw.title, 120) });
    if (raw.creator) fields.push({ label: raw.platform === 'netflix' ? 'Creator' : 'Channel / author', value: raw.creator });
    if (raw.episode) fields.push({ label: 'Episode', value: raw.episode });
    if (raw.genres?.length) fields.push({ label: 'Genres', value: raw.genres.slice(0, 4).join(', ') });
    if (raw.description) fields.push({ label: 'Description', value: `${truncate(raw.description, 90)} (kept on this device)` });
  }
  if (ctx) {
    fields.push({
      label: 'Sent to search',
      value: 'Only short topic queries, e.g. “' + (ctx.topics[0] ?? ctx.title) + '” — never the page, your history or your account.',
    });
  }
  return fields;
}

const PLATFORMS: readonly Platform[] = ['youtube', 'netflix', 'reddit', 'substack', 'manual', 'unknown'];
const KINDS: readonly ContentKind[] = ['video', 'short', 'movie', 'episode', 'show', 'thread', 'article', 'page', 'query'];
const ORIGINS: readonly ConceptOrigin[] = ['title', 'keywords', 'description', 'genre', 'entity', 'ontology', 'ai', 'manual'];

function strs(v: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => cleanText(x, maxLen)).filter(Boolean).slice(0, maxItems);
}

/**
 * Contexts cross a message boundary (popup → background), so they are rebuilt
 * field by field rather than trusted: wrong types are dropped, lengths capped.
 */
export function sanitizeContext(raw: unknown): ContentContext {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const title = cleanText(o.title, 200);
  if (!title) throw new AppError('INVALID_RESPONSE', 'Missing title', { retryable: false });

  const concepts: Concept[] = [];
  if (Array.isArray(o.concepts)) {
    for (const c of o.concepts.slice(0, 24)) {
      const item = c as { text?: unknown; weight?: unknown; origin?: unknown } | null;
      const text = cleanText(item?.text, 80);
      const weight = typeof item?.weight === 'number' && Number.isFinite(item.weight) ? Math.min(1, Math.max(0, item.weight)) : 0.3;
      const origin = ORIGINS.includes(item?.origin as ConceptOrigin) ? (item?.origin as ConceptOrigin) : 'title';
      if (text) concepts.push({ text, weight, origin });
    }
  }

  const ctx: ContentContext = {
    platform: PLATFORMS.includes(o.platform as Platform) ? (o.platform as Platform) : 'unknown',
    kind: KINDS.includes(o.kind as ContentKind) ? (o.kind as ContentKind) : 'page',
    title,
    keywords: strs(o.keywords, 24, 80),
    entities: strs(o.entities, 8, 80),
    topics: strs(o.topics, 8, 80),
    concepts,
    analyzedBy: o.analyzedBy === 'ai' ? 'ai' : 'heuristic',
    capturedAt: typeof o.capturedAt === 'number' ? o.capturedAt : Date.now(),
  };
  const creator = cleanText(o.creator, 120);
  if (creator) ctx.creator = creator;
  const description = cleanText(o.description, 500);
  if (description) ctx.description = description;
  const episode = cleanText(o.episode, 160);
  if (episode) ctx.episode = episode;
  const genres = strs(o.genres, 6, 40);
  if (genres.length) ctx.genres = genres;
  const aiQueries = strs(o.aiQueries, 5, 110);
  if (aiQueries.length) ctx.aiQueries = aiQueries;
  const subreddit = cleanText(o.subreddit, 30);
  if (subreddit) ctx.subreddit = subreddit;
  const publication = cleanText(o.publication, 100);
  if (publication) ctx.publication = publication;
  return ctx;
}
