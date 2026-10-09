/**
 * Stages 4–5 of the pipeline: *Topic extraction* and *Keyword/entity extraction*.
 *
 * Fully on-device and deterministic (so it is testable and private):
 *   1. clean the title of clickbait / channel / format noise
 *   2. RAKE-style phrase extraction — stopwords and filler verbs act as
 *      delimiters, so "How AI Agents Will Change Software Development"
 *      → "AI agents" | "software development"
 *   3. proper-noun / brand detection (Title Case aware)
 *   4. ontology expansion (AI agents → AI coding, developer tools, …)
 *   5. weights, de-duplication, ranking
 *
 * The optional AI layer (services/aiService.ts) can replace/augment the result;
 * this module is always the fallback and the baseline.
 */
import type { Concept, ConceptOrigin, ContentKind, Platform } from '../../types/context';
import { decodeEntities, displayPhrase, normalizeWhitespace, phraseKey, STOPWORDS, GENERIC_WORDS, truncate } from '../../utils/text';
import { genreConcepts, GENERIC_ACRONYMS, matchOntology, VAGUE_SINGLE_WORDS } from './ontology';

export interface TopicInput {
  platform: Platform;
  kind: ContentKind;
  title: string;
  creator?: string | undefined;
  description?: string | undefined;
  episode?: string | undefined;
  keywords?: string[] | undefined;
  hashtags?: string[] | undefined;
  genres?: string[] | undefined;
  category?: string | undefined;
  people?: string[] | undefined;
}

export interface TopicExtraction {
  concepts: Concept[];
  /** Core topics, most important first (no ontology-only expansions). */
  topics: string[];
  entities: string[];
  /** All concept texts, ranked. */
  keywords: string[];
  cleanedTitle: string;
}

const MAX_CONCEPTS = 16;
const MAX_ENTITIES = 8;

// ─── title / description cleaning ───────────────────────────────────────────

const FORMAT_NOISE =
  /\b(official|video|audio|lyrics?|trailer|teaser|clip|hd|4k|8k|full (?:episode|movie|video|course|documentary)|live|premiere|ep\.?\s*\d+|episode\s*\d+|part\s*\d+|shorts?|reaction|remastered|out now|subscribe)\b/i;

export function cleanTitle(rawTitle: string, creator?: string): string {
  let t = decodeEntities(rawTitle)
    .replace(/[\p{Extended_Pictographic}️‍]/gu, ' ')
    .replace(/#[\p{L}\p{N}_]+/gu, ' ');

  // Leading post tags — Reddit's "[D]", "[R]", "(OC)", "[Discussion]" — are labels, not words.
  t = t.replace(/^\s*[[(](?:[a-z]{1,3}|discussion|serious|question|research|project|news|help|meta|spoilers?|megathread|ama|eli5|nsfw)[\])]\s*[:\-–—]?\s*/i, '');

  const unwrap = (m: string) => (FORMAT_NOISE.test(m) ? ' ' : ` ${m.slice(1, -1)} `);
  t = t.replace(/\[[^\]]*\]/g, unwrap).replace(/\([^)]*\)/g, unwrap);

  const creatorKey = creator ? phraseKey(creator) : '';
  const parts = t
    .split(/\s[|•·]\s|\s[-–—]\s(?=[^-–—]*$)/)
    .map((p) => normalizeWhitespace(p))
    .filter(Boolean);
  const [head, ...rest] = parts;
  const kept = [head ?? ''];
  for (const part of rest) {
    const words = part.split(/\s+/).length;
    const isChannel = creatorKey && phraseKey(part) === creatorKey;
    const isPlatform = /^(youtube|netflix|reddit|substack|official site)$/i.test(part);
    if (!isChannel && !isPlatform && !FORMAT_NOISE.test(part) && words >= 3) kept.push(part);
  }
  t = kept.join(': ');
  return normalizeWhitespace(t.replace(/^["“']+|["”']+$/g, '')).trim();
}

/** Strips URLs, timestamps, social-link boilerplate and emoji; caps length. */
export function cleanDescription(raw: string | undefined, max = 700): string {
  if (!raw) return '';
  const lines = decodeEntities(raw)
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, ' ')
    .replace(/[\p{Extended_Pictographic}️‍]/gu, ' ')
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .filter(
      (l) =>
        !/^(follow|subscribe|join|support|sponsor|business|contact|business inquiries|merch|patreon|discord|twitter|instagram|facebook|tiktok|my (?:links|socials)|links?:|chapters?:|timestamps?:|music:|credits?:|#)/i.test(l),
    );
  return truncate(normalizeWhitespace(lines.join('. ')), max);
}

// ─── phrase extraction (RAKE-style) ─────────────────────────────────────────

interface Candidate {
  display: string;
  key: string;
  score: number;
  origin: ConceptOrigin;
  originScore: number;
  hits: number;
}

const SEGMENT_SPLIT = /(?:[!?;:,()[\]|"“”…]|\.(?=\s|$)|\s[-–—]+\s|\n)+/;

function wordsOf(segment: string): string[] {
  return segment
    .split(/\s+/)
    .map((w) =>
      w
        .replace(/^[^\p{L}\p{N}#+]+|[^\p{L}\p{N}+]+$/gu, '')
        .replace(/[’']s$/i, ''),
    )
    .filter(Boolean);
}

function isDelimiter(word: string): boolean {
  const lower = word.toLowerCase();
  return STOPWORDS.has(lower) || GENERIC_WORDS.has(lower) || /^\d+$/.test(lower) || lower.length === 1;
}

function phraseScore(wordCount: number): number {
  return [0, 1.0, 1.8, 2.4, 2.8][Math.min(wordCount, 4)] ?? 2.8;
}

function addCandidate(
  map: Map<string, Candidate>,
  words: string[],
  weight: number,
  origin: ConceptOrigin,
  minWords = 1,
): void {
  if (words.length < minWords || words.length === 0) return;
  const text = words.join(' ');
  const key = phraseKey(text);
  if (!key) return;
  if (words.length === 1) {
    const lower = (words[0] ?? '').toLowerCase();
    if (lower.length < 3 && !/^[A-Z]{2}$/.test(words[0] ?? '')) return; // allow "AI", "UK"
    if (VAGUE_SINGLE_WORDS.has(lower)) return;
  }
  const add = phraseScore(words.length) * weight;
  const existing = map.get(key);
  if (existing) {
    existing.score += add;
    existing.hits++;
    if (add > existing.originScore) {
      existing.origin = origin;
      existing.originScore = add;
    }
  } else {
    map.set(key, { display: displayPhrase(text), key, score: add, origin, originScore: add, hits: 1 });
  }
}

function extractPhrases(map: Map<string, Candidate>, text: string, weight: number, origin: ConceptOrigin): void {
  for (const segment of text.split(SEGMENT_SPLIT)) {
    let run: string[] = [];
    const flush = () => {
      if (run.length > 4) {
        for (let n = 2; n <= 3; n++) {
          for (let i = 0; i + n <= run.length; i++) addCandidate(map, run.slice(i, i + n), weight * 0.7, origin);
        }
      } else {
        addCandidate(map, run, weight, origin);
      }
      run = [];
    };
    for (const word of wordsOf(segment)) {
      if (isDelimiter(word)) flush();
      else run.push(word);
    }
    flush();
  }
}

/** Page-declared keyword lists are often SEO spam: filter, cap, decay by position. */
function usableKeyword(kw: string, creator: string | undefined): boolean {
  const k = normalizeWhitespace(kw);
  if (k.length < 2 || k.length > 40) return false;
  if (k.split(/\s+/).length > 5) return false;
  if (/youtube|subscribe|video|channel|shorts|official|trailer|viral|trending|fyp/i.test(k)) return false;
  if (creator && phraseKey(creator) === phraseKey(k)) return false;
  return !wordsOf(k).every(isDelimiter);
}

// ─── entities ───────────────────────────────────────────────────────────────

const CONNECTORS = new Set(['of', 'the', 'and', 'de', 'la', 'le', 'von', 'van', 'der', 'di', 'du', 'for', '&']);
const MONTHS_DAYS = new Set(
  'january february march april may june july august september october november december monday tuesday wednesday thursday friday saturday sunday'.split(' '),
);
const BOILERPLATE_ENTITIES = new Set(
  'youtube instagram twitter facebook tiktok patreon discord reddit linkedin spotify amazon subscribe follow check watch click link links thanks thank hello hi welcome today tomorrow yesterday please also here this that these those'.split(' '),
);
/** Named things (brands, people, franchises) — deliberately *not* topic phrases like "machine learning". */
const ENTITY_KEYS = new Set([
  'openai', 'chatgpt', 'claude', 'anthropic', 'gemini', 'deepseek', 'nvidia', 'tsmc', 'tesla', 'apple', 'google', 'microsoft',
  'tiktok', 'spacex', 'nasa', 'netflix', 'bitcoin', 'ethereum', 'nato', 'marvel', 'waymo', 'cursor', 'copilot', 'amazon', 'meta',
  'black mirror', 'star wars', 'game of thrones', 'breaking bad', 'stranger things', 'elon musk', 'sam altman', 'wall street',
  'federal reserve', 'european union', 'white house', 'silicon valley',
]);

function isCapitalized(word: string): boolean {
  return /^[A-Z][\p{L}\p{N}'’.&-]*$/u.test(word) || /^[A-Z]{2,}[\p{N}-]*$/u.test(word);
}

function isMixedCase(word: string): boolean {
  return /[a-z][A-Z]/.test(word) || /^[A-Z]{2,}[a-z]/.test(word); // OpenAI, DeepSeek, iPhone, GPT-5 → handled by ENTITY_KEYS/acronym
}

function isTitleCase(title: string): boolean {
  const content = wordsOf(title).filter((w) => !STOPWORDS.has(w.toLowerCase()) && /^\p{L}/u.test(w));
  if (content.length < 3) return false;
  const upper = content.filter((w) => /^[A-Z]/.test(w)).length;
  return upper / content.length >= 0.6;
}

/** Is `lower` (a phrase) a named thing we know about, e.g. "black mirror", "nvidia"? */
function isKnownEntity(lower: string): boolean {
  return ENTITY_KEYS.has(lower);
}

/**
 * Finds proper nouns / brands.
 *
 * Title Case headlines ("How AI Agents Will Change Software Development")
 * capitalise everything, so there only brands, mixed-case names (OpenAI),
 * non-generic acronyms and entries from the ontology count.  In sentence-case
 * text, any capitalised run is a candidate — except a lone word that merely
 * starts a sentence in a long description.
 */
export function extractEntities(title: string, description: string | undefined): string[] {
  const found = new Map<string, { text: string; score: number }>();
  const add = (text: string, score: number) => {
    const clean = normalizeWhitespace(text);
    const key = phraseKey(clean);
    if (!key || clean.length < 2) return;
    if (BOILERPLATE_ENTITIES.has(clean.toLowerCase())) return;
    const existing = found.get(key);
    if (existing) existing.score += score;
    else found.set(key, { text: clean, score });
  };

  const scan = (text: string, weight: number, mode: { titleCase: boolean; isTitle: boolean; requireRepeat: boolean }) => {
    const counts = new Map<string, { text: string; n: number }>();
    const bump = (candidate: string) => {
      const k = candidate.toLowerCase();
      const prev = counts.get(k);
      if (prev) prev.n++;
      else counts.set(k, { text: candidate, n: 1 });
    };

    const consider = (rawRun: string[], startIndex: number) => {
      const run = [...rawRun];
      // trailing connectors ("Lord of the") and leading filler ("Why", "The") are not part of the name
      while (run.length && CONNECTORS.has((run[run.length - 1] ?? '').toLowerCase())) run.pop();
      while (run.length > 1 && isDelimiter(run[0] ?? '')) run.shift();
      if (run.length === 0) return;

      const single = run.length === 1 ? (run[0] ?? '') : '';
      const lower = run.join(' ').toLowerCase();
      if (MONTHS_DAYS.has(lower)) return;
      const isBrand =
        isKnownEntity(lower) || (single !== '' && (isMixedCase(single) || ENTITY_KEYS.has(single.toLowerCase())));
      const isAcronym = single !== '' && /^[A-Z]{2,6}$/.test(single) && !GENERIC_ACRONYMS.has(single);

      if (mode.titleCase) {
        if (isBrand || isAcronym) return bump(run.join(' '));
        // look for a known multi-word name *inside* the Title Case run: "Black Mirror Season" → "Black Mirror"
        for (let n = Math.min(run.length, 4); n >= 2; n--) {
          for (let i = 0; i + n <= run.length; i++) {
            const sub = run.slice(i, i + n);
            if (isKnownEntity(sub.join(' ').toLowerCase())) return bump(sub.join(' '));
          }
        }
        for (const w of run) if (ENTITY_KEYS.has(w.toLowerCase()) || isMixedCase(w)) bump(w);
        return;
      }

      if (single && isDelimiter(single) && !isBrand) return;
      if (single && startIndex === 0 && !isBrand && !isAcronym) return; // a capital letter at the start of a sentence proves nothing
      if (single && single.length < 3 && !isAcronym) return;
      bump(run.join(' '));
    };

    for (const segment of text.split(SEGMENT_SPLIT)) {
      let run: string[] = [];
      let runStart = 0;
      const flush = () => {
        if (run.length) consider(run, runStart);
        run = [];
      };
      wordsOf(segment).forEach((word, i) => {
        if (isCapitalized(word) || isMixedCase(word)) {
          if (run.length === 0) runStart = i;
          run.push(word);
        } else if (CONNECTORS.has(word.toLowerCase()) && run.length > 0) {
          run.push(word);
        } else {
          flush();
        }
      });
      flush();
    }

    for (const { text: t, n } of counts.values()) {
      if (mode.requireRepeat && n < 2 && !ENTITY_KEYS.has(t.toLowerCase())) continue;
      add(t, weight * (1 + 0.3 * (n - 1)));
    }
  };

  scan(title, 3, { titleCase: isTitleCase(title), isTitle: true, requireRepeat: false });
  if (description) scan(description.slice(0, 600), 1, { titleCase: false, isTitle: false, requireRepeat: true });

  return [...found.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_ENTITIES)
    .map((e) => e.text);
}

// ─── main entry point ───────────────────────────────────────────────────────

const FUTURE_MARKERS = /\b(will|future|next decade|in 20[3-9]\d|replac(?:e|es|ing)|end of|rise of|revolution|disrupt\w*|transform\w*)\b/i;

export function extractTopics(input: TopicInput): TopicExtraction {
  const cleanedTitle = cleanTitle(input.title, input.creator) || normalizeWhitespace(input.title);
  const description = cleanDescription(input.description);
  const candidates = new Map<string, Candidate>();
  const isScreenContent = input.kind === 'movie' || input.kind === 'show' || input.kind === 'episode';

  // 1. phrases from every source, weighted by how trustworthy/central it is
  extractPhrases(candidates, cleanedTitle, 3, input.platform === 'manual' ? 'manual' : 'title');
  if (input.episode) extractPhrases(candidates, cleanDescription(input.episode, 160), 1.2, 'title');
  if (description) extractPhrases(candidates, description, 1, 'description');

  const creator = input.creator;
  (input.keywords ?? [])
    .filter((k) => usableKeyword(k, creator))
    .slice(0, 10)
    .forEach((kw, i) => {
      addCandidate(candidates, wordsOf(kw), 1.9 * Math.max(0.4, 1 - i * 0.07), 'keywords', 1);
    });
  (input.hashtags ?? [])
    .filter((h) => usableKeyword(h, creator))
    .slice(0, 6)
    .forEach((h) => addCandidate(candidates, wordsOf(h.replace(/^#/, '')), 1.5, 'keywords', 1));

  // A phrase seen only once, only in the description, is noise ("anthology series explores").
  // Keep the best few anyway when the title/keywords gave us almost nothing to go on.
  const descriptionOnly = [...candidates.values()].filter((c) => c.origin === 'description');
  const strong = [...candidates.values()].filter((c) => c.origin !== 'description').length;
  const keepAnyway = strong < 2 ? new Set(descriptionOnly.sort((a, b) => b.score - a.score).slice(0, 3).map((c) => c.key)) : new Set<string>();
  for (const c of descriptionOnly) {
    if (c.hits < 2 && !keepAnyway.has(c.key)) candidates.delete(c.key);
  }

  const maxScore = Math.max(1, ...[...candidates.values()].map((c) => c.score));
  const concepts = new Map<string, Concept>();
  const put = (text: string, weight: number, origin: ConceptOrigin) => {
    const key = phraseKey(text);
    if (!key) return;
    const existing = concepts.get(key);
    if (!existing || weight > existing.weight) {
      concepts.set(key, { text: existing?.text ?? text, weight: Math.min(1, Math.round(weight * 100) / 100), origin });
    }
  };

  for (const c of candidates.values()) {
    put(c.display, Math.max(0.15, c.score / maxScore) * 0.92, c.origin);
  }

  // 2. entities
  const entities = extractEntities(cleanedTitle, description);
  if (isScreenContent || input.platform === 'netflix') {
    const show = normalizeWhitespace(cleanedTitle);
    if (show && !entities.some((e) => phraseKey(e) === phraseKey(show))) entities.unshift(show);
  }
  for (const person of (input.people ?? []).slice(0, 3)) {
    if (!entities.some((e) => phraseKey(e) === phraseKey(person))) entities.push(person);
  }
  const entityList = entities.slice(0, MAX_ENTITIES);
  const titleKey = ` ${phraseKey(cleanedTitle)} `;
  entityList.forEach((e, i) => {
    const inTitle = titleKey.includes(` ${phraseKey(e)} `);
    put(e, inTitle ? Math.max(0.5, 0.9 - i * 0.05) : Math.max(0.35, 0.6 - i * 0.05), 'entity');
  });

  // 3. genres → themes writers discuss
  for (const genre of input.genres ?? []) {
    put(genre, 0.38, 'genre');
    for (const g of genreConcepts(genre).slice(0, 3)) put(g, 0.42, 'genre');
  }
  if (input.category) for (const g of genreConcepts(input.category).slice(0, 2)) put(g, 0.3, 'genre');

  // Screen content is *about* television/film as a medium, which is how critics file it.
  // (Origin "ontology": used to pick publications and queries, but not shown as a topic.)
  if (isScreenContent || input.platform === 'netflix') {
    put(input.kind === 'movie' ? 'film' : 'television', 0.4, 'ontology');
    put('streaming', 0.34, 'ontology');
  }

  // 4. ontology expansion (strong signals first: title/keywords, then description)
  const strongText = [cleanedTitle, input.episode, ...(input.keywords ?? []).slice(0, 10), ...(input.hashtags ?? []), ...(input.genres ?? [])]
    .filter(Boolean)
    .join(' . ');
  const strongHits = matchOntology(strongText);
  const strongKeys = new Set(strongHits.map((h) => h.key));
  for (const hit of strongHits.slice(0, 4)) {
    hit.related.forEach((r, i) => put(r, Math.max(0.3, 0.52 - i * 0.04), 'ontology'));
  }
  if (description) {
    const weak = matchOntology(description).filter((h) => !strongKeys.has(h.key)).slice(0, 2);
    for (const hit of weak) hit.related.slice(0, 3).forEach((r, i) => put(r, 0.3 - i * 0.03, 'ontology'));
  }

  // 5. "future of …" angle for speculative headlines
  const ranked = (): Concept[] => [...concepts.values()].sort((a, b) => b.weight - a.weight);
  if (FUTURE_MARKERS.test(cleanedTitle)) {
    const lead = ranked().find((c) => c.origin === 'title' || c.origin === 'manual');
    if (lead && !/^future of/i.test(lead.text)) put(`future of ${lead.text}`, 0.5, 'title');
  }

  // 6. manual searches: the user's own words are the strongest signal
  if (input.platform === 'manual' && cleanedTitle.split(/\s+/).length <= 6) put(cleanedTitle, 1, 'manual');

  // 7. tidy: drop a bare acronym when a longer phrase contains it
  let final = ranked();
  final = final.filter((c) => {
    const key = phraseKey(c.text);
    if (key.length > 3 || key.includes(' ')) return true;
    return !final.some((o) => o !== c && o.weight >= c.weight && phraseKey(o.text).split(' ').includes(key) && phraseKey(o.text) !== key);
  });
  final = final.slice(0, MAX_CONCEPTS);

  const topics = final
    .filter((c) => c.origin !== 'ontology')
    .slice(0, 6)
    .map((c) => c.text);

  return {
    concepts: final,
    topics,
    entities: entityList,
    keywords: final.map((c) => c.text),
    cleanedTitle,
  };
}
