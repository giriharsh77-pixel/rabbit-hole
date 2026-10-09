/**
 * Article relevance scoring.
 *
 *   relevanceScore = 100 × (
 *       semanticSimilarity × 0.45
 *     + keywordMatch       × 0.20
 *     + entityMatch        × 0.15
 *     + recency            × 0.10
 *     + sourceQuality      × 0.10 )
 *
 * Every term is normalised to 0–1.  When the source content has no named
 * entities, the entity weight is redistributed proportionally to the other
 * terms so a perfect match can still reach 100.
 *
 * "Semantic similarity" is computed on-device as a concept-weighted cosine
 * similarity over stemmed terms, where the concept list already includes the
 * ontology/AI-expanded related topics — so an article about "developer tools"
 * can match a video about "AI agents" without sharing a word.  When the
 * optional AI layer is enabled its judgement replaces most of this term.
 *
 * The numeric score is used internally (ordering, thresholds); the UI only
 * shows the label, never a percentage that could be mistaken for "accuracy".
 */
import type { Concept, ContentContext } from '../../types/context';
import type { ArticleCandidate, RankedArticle, RelevanceBreakdown, RelevanceLabel } from '../../types/substack';
import { clamp } from '../../utils/format';
import { contentStems, listToSentence, phraseKey, truncate } from '../../utils/text';

export const RELEVANCE_WEIGHTS = {
  semantic: 0.45,
  keyword: 0.2,
  entity: 0.15,
  recency: 0.1,
  sourceQuality: 0.1,
} as const;

/** Score → label boundaries. */
export const LABEL_THRESHOLDS = { highly: 70, very: 52, related: 36 } as const;

/** Cosine → 0–1 saturation constant (see `semanticFromCosine`). */
const SEMANTIC_K = 6;

/**
 * Score → label.  The top labels also require real content overlap, so a fresh post
 * from a respected newsletter can never read "Highly relevant" on source quality
 * and recency alone.
 */
export function labelFor(score: number, breakdown?: RelevanceBreakdown): RelevanceLabel {
  const content = breakdown ? Math.max(breakdown.semantic, breakdown.keyword) : 1;
  const strong = breakdown ? breakdown.semantic >= 0.55 && (breakdown.keyword >= 0.3 || breakdown.entity >= 0.7) : true;
  if (score >= LABEL_THRESHOLDS.highly && strong) return 'highly-relevant';
  if (score >= LABEL_THRESHOLDS.very && content >= 0.35) return 'very-relevant';
  if (score >= LABEL_THRESHOLDS.related) return 'related';
  return 'somewhat-related';
}

export const LABEL_TEXT: Record<RelevanceLabel, string> = {
  'highly-relevant': 'Highly relevant',
  'very-relevant': 'Very relevant',
  related: 'Related',
  'somewhat-related': 'Somewhat related',
};

// ─── individual terms ───────────────────────────────────────────────────────

/** Newer is better; unknown dates get a neutral value (we never guess a date). */
export function recencyScore(publishedAt: string | undefined, now: number): number {
  if (!publishedAt) return 0.35;
  const t = Date.parse(publishedAt);
  if (Number.isNaN(t)) return 0.35;
  const ageDays = Math.max(0, (now - t) / 86_400_000);
  return clamp(Math.exp(-ageDays / 150), 0.05, 1);
}

export function sourceQualityScore(c: ArticleCandidate): number {
  const tier = c.publicationTier;
  let q = tier === 3 ? 0.88 : tier === 2 ? 0.68 : tier === 1 ? 0.52 : 0.45;
  if (c.searchRank !== undefined) q += 0.3 * (1 / (1 + c.searchRank * 0.45)); // the search engine's own ranking is a quality signal
  if (c.authorName && c.publishedAt) q += 0.04;
  if (c.engagement && ((c.engagement.likes ?? 0) > 0 || (c.engagement.comments ?? 0) > 0)) {
    q += 0.08 * Math.min(1, Math.log10(1 + (c.engagement.likes ?? 0) + 3 * (c.engagement.comments ?? 0)) / 3);
  }
  return clamp(q, 0, 1);
}

/**
 * Stems so common that matching them says little ("AI" in an AI newsletter).  They still
 * count, just far less than distinctive terms — a cheap stand-in for inverse document frequency.
 */
const COMMON_STEMS: ReadonlySet<string> = new Set(
  ['ai', 'new', 'data', 'tech', 'technolog', 'world', 'compan', 'market', 'industri', 'report', 'week', 'last', 'news', 'issu', 'daili', 'updat', 'compani', 'busi', 'system', 'work', 'peopl', 'time', 'year', 'model'],
);
const COMMON_WEIGHT = 0.35;
const stemWeight = (s: string): number => (COMMON_STEMS.has(s) ? COMMON_WEIGHT : 1);

interface DocTerms {
  title: Set<string>;
  all: Set<string>;
  text: string;
  vector: Map<string, number>;
}

function buildDoc(c: ArticleCandidate): DocTerms {
  const titleStems = contentStems(c.title);
  const excerptStems = contentStems(c.excerpt);
  // NB: publication tags (seeds.json) are deliberately NOT used here — they only choose which
  // feeds to read.  Letting them score articles would hand every post from an "AI" newsletter
  // a free match on "AI".
  const pubStems = contentStems(c.publicationName);

  const counts = new Map<string, number>();
  const bump = (stems: string[], w: number) => {
    for (const s of stems) counts.set(s, (counts.get(s) ?? 0) + w);
  };
  bump(titleStems, 3);
  bump(excerptStems, 1);
  bump(pubStems, 0.4);

  const vector = new Map<string, number>();
  for (const [s, n] of counts) vector.set(s, 1 + Math.log(n));
  return {
    title: new Set(titleStems),
    all: new Set([...titleStems, ...excerptStems]),
    text: ` ${[...titleStems, ...excerptStems].join(' ')} `,
    vector,
  };
}

interface QueryVector {
  vector: Map<string, number>;
  norm: number;
}

function buildQueryVector(concepts: readonly Concept[], entities: readonly string[], preferred: readonly string[]): QueryVector {
  const vector = new Map<string, number>();
  const add = (text: string, weight: number) => {
    const stems = contentStems(text);
    if (stems.length === 0) return;
    const per = weight / Math.sqrt(stems.length);
    for (const s of stems) vector.set(s, Math.max(vector.get(s) ?? 0, per * stemWeight(s)));
  };
  for (const c of concepts) add(c.text, c.weight);
  for (const e of entities) add(e, 0.9);
  for (const p of preferred) add(p, 0.25);
  let sumSq = 0;
  for (const v of vector.values()) sumSq += v * v;
  return { vector, norm: Math.sqrt(sumSq) };
}

function cosine(q: QueryVector, d: DocTerms): number {
  if (q.norm === 0) return 0;
  let dot = 0;
  let dNorm = 0;
  for (const v of d.vector.values()) dNorm += v * v;
  if (dNorm === 0) return 0;
  for (const [s, w] of q.vector) {
    const dv = d.vector.get(s);
    if (dv) dot += w * dv;
  }
  return dot / (q.norm * Math.sqrt(dNorm));
}

export function semanticFromCosine(cos: number): number {
  return 1 - Math.exp(-SEMANTIC_K * clamp(cos, 0, 1));
}

/** Does the document contain every (or most) stems of the phrase? 1 / 0.5 / 0 */
function phraseMatch(phrase: string, doc: DocTerms): { score: number; inTitle: boolean } {
  const stems = contentStems(phrase);
  if (stems.length === 0) return { score: 0, inTitle: false };
  const total = stems.reduce((a, s) => a + stemWeight(s), 0);
  const hit = stems.reduce((a, s) => a + (doc.all.has(s) ? stemWeight(s) : 0), 0);
  const ratio = hit / total;
  // all stems → full credit; most of the distinctive ones → partial; otherwise nothing
  const score = ratio >= 0.999 ? 1 : stems.length >= 2 && ratio >= 0.5 ? ratio * 0.85 : 0;
  const titleHit = stems.every((s) => doc.title.has(s));
  return { score, inTitle: titleHit };
}

// ─── scoring ────────────────────────────────────────────────────────────────

export interface ScoreOptions {
  now?: number;
  preferredTopics?: readonly string[];
  /** AI judgement per article id, 0–1.  Replaces most of the lexical semantic term. */
  aiRelevance?: ReadonlyMap<string, { score: number; why?: string }>;
}

interface MatchInfo {
  topics: string[];
  titleHit: boolean;
  entities: string[];
}

export function scoreCandidate(ctx: ContentContext, candidate: ArticleCandidate, opts: ScoreOptions = {}): RankedArticle {
  const now = opts.now ?? Date.now();
  const doc = buildDoc(candidate);
  const q = buildQueryVector(ctx.concepts, ctx.entities.slice(0, 4), opts.preferredTopics ?? []);

  // keyword match over the strongest concepts
  const top = [...ctx.concepts].sort((a, b) => b.weight - a.weight).slice(0, 10);
  let kwNum = 0;
  let kwDen = 0;
  const matchedTopics: { text: string; weight: number; title: boolean }[] = [];
  for (const c of top) {
    const m = phraseMatch(c.text, doc);
    const derived = /^future of /i.test(c.text); // synthesised angle, not something to quote back
    kwDen += c.weight;
    if (m.score > 0) {
      kwNum += c.weight * m.score * (m.inTitle ? 1.25 : 1);
      if (!derived) matchedTopics.push({ text: c.text, weight: c.weight * m.score, title: m.inTitle });
    }
  }
  const keyword = kwDen > 0 ? clamp((kwNum / kwDen) * 1.7, 0, 1) : 0;

  // entity match
  const entities = ctx.entities.slice(0, 4);
  const matchedEntities: string[] = [];
  let entity = 0;
  if (entities.length) {
    const per = entities.map((e) => {
      const stems = contentStems(e);
      if (stems.length === 0) return 0;
      const inTitle = stems.every((s) => doc.title.has(s));
      const inText = stems.every((s) => doc.all.has(s));
      if (inTitle || inText) matchedEntities.push(e);
      return inTitle ? 1 : inText ? 0.7 : 0;
    }) as number[];
    const best = Math.max(...per);
    const mean = per.reduce((a, b) => a + b, 0) / Math.min(entities.length, 3);
    entity = clamp(0.6 * best + 0.4 * Math.min(1, mean), 0, 1);
  }

  const cos = cosine(q, doc);
  const lexicalSemantic = semanticFromCosine(cos);
  const ai = opts.aiRelevance?.get(candidate.id);
  const semantic = ai ? clamp(0.75 * ai.score + 0.25 * lexicalSemantic, 0, 1) : lexicalSemantic;

  const breakdown: RelevanceBreakdown = {
    semantic,
    keyword,
    entity,
    recency: recencyScore(candidate.publishedAt, now),
    sourceQuality: sourceQualityScore(candidate),
  };

  // redistribute the entity weight when there is nothing to match against
  const w: Record<keyof typeof RELEVANCE_WEIGHTS, number> = { ...RELEVANCE_WEIGHTS };
  if (entities.length === 0) {
    const spare = w.entity;
    const rest = w.semantic + w.keyword + w.recency + w.sourceQuality;
    w.semantic += spare * (w.semantic / rest);
    w.keyword += spare * (w.keyword / rest);
    w.recency += spare * (w.recency / rest);
    w.sourceQuality += spare * (w.sourceQuality / rest);
    w.entity = 0;
  }

  const raw =
    breakdown.semantic * w.semantic +
    breakdown.keyword * w.keyword +
    breakdown.entity * w.entity +
    breakdown.recency * w.recency +
    breakdown.sourceQuality * w.sourceQuality;
  const relevanceScore = Math.round(clamp(raw, 0, 1) * 100);

  matchedTopics.sort((a, b) => b.weight - a.weight);
  const info: MatchInfo = {
    topics: dedupePhrases(matchedTopics.map((m) => m.text)).slice(0, 3),
    titleHit: matchedTopics.some((m) => m.title) || matchedEntities.some((e) => contentStems(e).every((s) => doc.title.has(s))),
    entities: matchedEntities,
  };

  const aiWhy = ai?.why?.trim();
  return {
    ...candidate,
    relevanceScore,
    label: labelFor(relevanceScore, breakdown),
    breakdown,
    matchedTopics: dedupePhrases([...info.entities, ...info.topics]).slice(0, 4),
    why: aiWhy ? truncate(aiWhy, 260) : explainRelevance(ctx, info),
    whyBy: aiWhy ? 'ai' : 'heuristic',
  };
}

function dedupePhrases(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = phraseKey(item);
    if (!key || seen.has(key)) continue;
    // skip a phrase that is wholly contained in one we already kept ("AI" ⊂ "AI agents")
    if ([...seen].some((k) => ` ${k} `.includes(` ${key} `))) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

// ─── "Why this is relevant" ─────────────────────────────────────────────────

function shortTitle(title: string, max = 60): string {
  return truncate(title.replace(/["“”]/g, '').trim(), max);
}

/** Heuristic explanation grounded in what actually matched — never generic filler. */
export function explainRelevance(ctx: ContentContext, match: MatchInfo): string {
  const named = dedupePhrases([...match.entities, ...match.topics]).slice(0, 3);
  const about = listToSentence(named);
  const verb = match.titleHit ? 'discusses' : 'touches on';
  const tie = match.titleHit ? 'directly relates to' : 'connects to';

  if (named.length === 0) {
    return ctx.platform === 'manual'
      ? `Came up for your search “${shortTitle(ctx.title, 50)}”, but few of its topics appear in this piece — treat it as a loose lead.`
      : `Surfaced by search for the topics in “${shortTitle(ctx.title)}”; the overlap is thin, so treat it as a loose lead.`;
  }

  switch (ctx.platform) {
    case 'youtube':
      return `This article ${verb} ${about}, which ${tie} the ${ctx.kind === 'short' ? 'Short' : 'video'} you're watching — “${shortTitle(ctx.title)}”.`;
    case 'netflix':
      return match.entities.some((e) => phraseKey(e) === phraseKey(ctx.title))
        ? `This piece is about ${ctx.title}${match.topics.length ? `, including ${listToSentence(match.topics.slice(0, 2))}` : ''}.`
        : `This piece ${verb} ${about} — themes that ${match.titleHit ? 'run through' : 'echo in'} ${ctx.title}.`;
    case 'reddit':
      return `Goes deeper on ${about}, the subject of this Reddit discussion${ctx.subreddit ? ` in r/${ctx.subreddit}` : ''}.`;
    case 'substack':
      return `Covers ${about}, ${match.titleHit ? 'closely' : 'loosely'} related to the article you're reading.`;
    case 'manual':
      return `Matches your search for “${shortTitle(ctx.title, 50)}” — it ${verb} ${about}.`;
    default:
      return `This article ${verb} ${about}, which ${tie} the page you're on.`;
  }
}

// ─── ranking + diversity ────────────────────────────────────────────────────

export interface RankOptions extends ScoreOptions {
  minRelevance?: number;
  limit?: number;
  maxPerPublication?: number;
}

/**
 * Greedy re-rank for author/publication diversity: each extra article from a
 * publication already shown is penalised, so one prolific newsletter can't
 * fill the whole list.
 */
export function diversify(
  items: readonly RankedArticle[],
  opts: { maxPerPublication?: number; penalty?: number; limit?: number } = {},
): RankedArticle[] {
  const maxPer = opts.maxPerPublication ?? 2;
  const penalty = opts.penalty ?? 6;
  const limit = opts.limit ?? items.length;
  const pool = [...items];
  const counts = new Map<string, number>();
  const out: RankedArticle[] = [];

  while (pool.length && out.length < limit) {
    let bestIdx = -1;
    let bestScore = -Infinity;
    pool.forEach((a, i) => {
      const n = counts.get(a.publicationName.toLowerCase()) ?? 0;
      if (n >= maxPer) return;
      const adjusted = a.relevanceScore - penalty * n;
      if (adjusted > bestScore) {
        bestScore = adjusted;
        bestIdx = i;
      }
    });
    if (bestIdx < 0) break;
    const [picked] = pool.splice(bestIdx, 1);
    if (!picked) break;
    counts.set(picked.publicationName.toLowerCase(), (counts.get(picked.publicationName.toLowerCase()) ?? 0) + 1);
    out.push(picked);
  }
  return out;
}

export function rankArticles(
  ctx: ContentContext,
  candidates: readonly ArticleCandidate[],
  opts: RankOptions = {},
): RankedArticle[] {
  const scored = candidates.map((c) => scoreCandidate(ctx, c, opts));
  const min = opts.minRelevance ?? 0;
  const eligible = scored
    .filter((a) => a.relevanceScore >= min)
    .sort((a, b) => b.relevanceScore - a.relevanceScore || (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
  return diversify(eligible, {
    maxPerPublication: opts.maxPerPublication ?? 2,
    ...(opts.limit !== undefined ? { limit: opts.limit } : {}),
  });
}
