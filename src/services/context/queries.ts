/**
 * Stage 6 of the pipeline: *Search query generation*.
 *
 * Instead of searching with the raw video title we derive several focused
 * queries — entity-anchored, topic-anchored and concept-anchored — so a search
 * index can surface articles that never mention the video's exact wording.
 */
import type { ContentContext, SearchQuery } from '../../types/context';
import { normalizeText, truncate } from '../../utils/text';

const MAX_QUERY_CHARS = 110;

const quote = (s: string): string => (/\s/.test(s) ? `"${s}"` : s);

/** A phrase is worth searching on its own if it is multi-word, a named entity, or a long distinctive word. */
const isStrong = (t: string, entities: readonly string[]): boolean =>
  /\s/.test(t.trim()) || t.trim().length >= 7 || entities.some((e) => normalizeText(e) === normalizeText(t));

function shortTitle(title: string, maxWords = 8): string {
  const words = title.replace(/["“”]/g, '').split(/\s+/).filter(Boolean);
  return words.slice(0, maxWords).join(' ');
}

function queryKey(text: string): string {
  return normalizeText(text).split(' ').sort().join(' ');
}

export interface QueryOptions {
  /** Maximum number of queries (default 5). */
  max?: number;
}

export function generateQueries(ctx: ContentContext, opts: QueryOptions = {}): SearchQuery[] {
  const max = opts.max ?? 5;
  const out: SearchQuery[] = [];
  const push = (text: string, weight: number, kind: SearchQuery['kind']) => {
    const t = truncate(text.replace(/\s+/g, ' ').trim(), MAX_QUERY_CHARS, '');
    if (t.length < 2) return;
    out.push({ text: t, weight, kind });
  };

  // Queries proposed by the optional AI layer are the strongest signal we have.
  (ctx.aiQueries ?? []).slice(0, 3).forEach((q, i) => push(q, 1.1 - i * 0.03, 'concept'));

  const topics = ctx.topics;
  const entities = ctx.entities;
  const related = ctx.concepts.filter((c) => c.origin === 'ontology' || c.origin === 'genre').map((c) => c.text);
  const primaryTopic = topics[0];
  const secondTopic = topics.find((t) => normalizeText(t) !== normalizeText(primaryTopic ?? '') && isStrong(t, entities));

  if (ctx.platform === 'manual') {
    const raw = ctx.title.trim();
    push(raw, 1, 'manual');
    if (/\s/.test(raw) && raw.split(/\s+/).length <= 4) push(`"${raw}"`, 0.9, 'manual');
    if (related[0]) push(`${quote(raw.split(/\s+/).length <= 4 ? raw : (primaryTopic ?? raw))} ${related[0]}`, 0.7, 'concept');
    if (related[1] && related[0]) push(`${related[0]} ${related[1]}`, 0.5, 'concept');
  } else if (ctx.kind === 'movie' || ctx.kind === 'show' || ctx.kind === 'episode') {
    // A film/series: the title is a proper noun; essays *about* it are the target.
    const show = entities[0] ?? ctx.title;
    push(quote(show), 1, 'entity');
    if (related[0]) push(`${quote(show)} ${related[0]}`, 0.85, 'combo');
    if (related[0] && related[1]) push(`${related[0]} ${related[1]}`, 0.7, 'concept');
    if (ctx.entities[1]) push(`${quote(show)} ${ctx.entities[1]}`, 0.6, 'combo');
    if (related[2]) push(`${quote(show)} ${related[2]}`, 0.55, 'combo');
  } else if (ctx.platform === 'reddit') {
    push(shortTitle(ctx.title, 10), 1, 'title');
    if (primaryTopic) push(quote(primaryTopic), 0.85, 'concept');
    if (primaryTopic && secondTopic) push(`${quote(primaryTopic)} ${secondTopic}`, 0.8, 'combo');
    if (entities[0]) push(quote(entities[0]), 0.7, 'entity');
    if (primaryTopic && related[0]) push(`${primaryTopic} ${related[0]}`, 0.6, 'concept');
  } else {
    // YouTube, articles, generic pages
    const anchor = entities.find((e) => normalizeText(e) !== normalizeText(primaryTopic ?? '')) ?? entities[0];
    if (primaryTopic && secondTopic) push(`${quote(primaryTopic)} ${secondTopic}`, 1, 'combo');
    const sameAsTopic = !!anchor && normalizeText(anchor) === normalizeText(primaryTopic ?? '');
    if (anchor && primaryTopic && !sameAsTopic) push(`${quote(anchor)} ${primaryTopic}`, 0.95, 'entity');
    else if (anchor) push(quote(anchor), 0.95, 'entity');
    if (primaryTopic && isStrong(primaryTopic, entities)) push(quote(primaryTopic), 0.85, 'concept');
    if (secondTopic) push(quote(secondTopic), 0.75, 'concept');
    if (primaryTopic && related[0]) push(`${quote(primaryTopic)} ${related[0]}`, 0.65, 'concept');
    if (primaryTopic && related[1]) push(`${quote(primaryTopic)} ${related[1]}`, 0.6, 'concept');
    if (related[1] && related[2]) push(`${related[1]} ${related[2]}`, 0.5, 'concept');
    push(shortTitle(ctx.title), 0.55, 'title');
  }

  // de-duplicate on the *set* of words so "AI agents" and "agents AI" collapse
  const seen = new Set<string>();
  const unique: SearchQuery[] = [];
  for (const q of out.sort((a, b) => b.weight - a.weight)) {
    const k = queryKey(q.text);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    unique.push(q);
  }
  return unique.slice(0, max);
}
