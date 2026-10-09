/**
 * Text utilities that work in every extension context — including the MV3
 * service worker, which has no DOM (so no DOMParser / innerHTML).
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  bull: '•',
  middot: '·',
  copy: '©',
  reg: '®',
  trade: '™',
  eacute: 'é',
  egrave: 'è',
  agrave: 'à',
  uuml: 'ü',
  ouml: 'ö',
  auml: 'ä',
  ntilde: 'ñ',
  ccedil: 'ç',
};

export function decodeEntities(input: string): string {
  return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (match, body: string) => {
    if (body[0] === '#') {
      const code = body[1]?.toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return ' ';
      try {
        return String.fromCodePoint(code);
      } catch {
        return ' ';
      }
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

/**
 * HTML → plain text.  The result is only ever rendered as text (React escapes
 * it), so this is a readability helper, not a sanitiser for innerHTML.
 */
export function stripHtml(html: string): string {
  const withoutBlocks = html
    .replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  const withBreaks = withoutBlocks
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|li|h[1-6]|blockquote|tr|figure|figcaption)\s*>/gi, '\n');
  // Inline formatting tags vanish without a trace ("<b>agents</b>." → "agents."); anything else
  // (images, custom elements, unknown tags) separates words.
  const text = withBreaks
    .replace(/<\/?(?:b|i|em|strong|a|span|code|u|s|mark|small|sup|sub|abbr|cite|font|q)\b[^>]*>/gi, '')
    .replace(/<\/?[a-z][^>]*>/gi, ' ');
  return normalizeWhitespace(decodeEntities(text));
}

export function normalizeWhitespace(input: string): string {
  return input.replace(/[ \t\r\f\v  -​  　]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Truncates at a word boundary and appends an ellipsis when shortened. */
export function truncate(input: string, max: number, ellipsis = '…'): string {
  if (input.length <= max) return input;
  const cut = input.slice(0, Math.max(0, max - ellipsis.length));
  const lastSpace = cut.lastIndexOf(' ');
  const base = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${base.replace(/[\s,;:.\-–—]+$/, '')}${ellipsis}`;
}

export function firstSentences(input: string, maxChars: number): string {
  const text = normalizeWhitespace(input).replace(/\n+/g, ' ');
  if (text.length <= maxChars) return text;
  const slice = text.slice(0, maxChars);
  const end = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('? '), slice.lastIndexOf('! '));
  return end > maxChars * 0.5 ? slice.slice(0, end + 1) : truncate(text, maxChars);
}

/** Small English stopword list (function words only). */
export const STOPWORDS: ReadonlySet<string> = new Set(
  (
    'a about above after again against all also am an and any are aren as at be because been before being below between both but by ' +
    "can cannot could couldn did didn do does doesn doing don down during each few for from further had hadn has hasn have haven having " +
    "he her here hers herself him himself his how i if in into is isn it its itself just let me more most my myself no nor not of off on " +
    'once only or other ought our ours ourselves out over own same shall she should shouldn so some such than that the their theirs them ' +
    'themselves then there these they this those through to too under until up upon us very was wasn we were weren what when where which ' +
    "while who whom whose why will with won would wouldn you your yours yourself yourselves ve ll re s t d m o y via vs versus per " +
    'ever never always still yet already really actually literally basically even much many every another around among within without ' +
    'across along behind beyond toward towards onto however therefore thus hence else maybe perhaps quite rather almost often sometimes'
  ).split(/\s+/),
);

/**
 * Words that carry no topic signal in titles/descriptions ("clickbait" verbs
 * and filler).  Used in addition to STOPWORDS to cut phrases apart:
 * "How AI Agents Will Change Software Development" → "AI Agents" | "Software Development".
 */
export const GENERIC_WORDS: ReadonlySet<string> = new Set(
  (
    'change changes changed changing changer make makes made making get gets got getting take takes took taking give gives gave ' +
    'use uses used using show shows showed showing know knows known need needs needed want wants find finds found look looks looking ' +
    'come comes came coming go goes went going see sees saw seen think thinks thought say says said tell tells told ' +
    'new newest latest best worst top better good great bad big small little first last next full complete ultimate official ' +
    'everything nothing something anything everyone anyone someone people thing things stuff way ways time times day days year years ' +
    'video videos watch watching episode episodes part parts trailer clip clips live stream streaming review reviews react reaction ' +
    'explained explains explain explaining guide tutorial tutorials course lesson lessons learn learning beginners beginner intro introduction ' +
    'minutes minute hours hour seconds second today tonight now soon finally truly really suddenly secretly actually ' +
    'wrong right true false real fake like likes liked love loves happen happens happened happening ' +
    'turn turns turned ends end begin begins began start starts started stop stops stopped ' +
    'one two three four five six seven eight nine ten million billion thousand hundred ' +
    'vs versus feat ft ft. subscribe channel official hd 4k 8k shorts short'
  ).split(/\s+/),
);

/** Matches words incl. inner apostrophes / dots / hyphens / plus (node.js, gpt-5, c++, don't). */
const WORD_RE = /[\p{L}\p{N}]+(?:[’'.+\-][\p{L}\p{N}]+)*\+*/gu;

export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.toLowerCase().matchAll(WORD_RE)) {
    let w = raw[0];
    w = w.replace(/[’']s$/, '').replace(/[’']/g, '');
    if (w) out.push(w);
  }
  return out;
}

/**
 * A deliberately light stemmer: good enough to conflate agent/agents,
 * develop/development/developer/developing, automate/automation/automated.
 * Not linguistically perfect — it only has to be *consistent*.
 */
export function stem(word: string): string {
  let w = word.toLowerCase();
  if (w.length <= 3 || /[\d.+]/.test(w)) return w;

  // inflectional
  if (w.endsWith('ies') && w.length > 4) w = `${w.slice(0, -3)}y`;
  else if (w.endsWith('sses')) w = w.slice(0, -2);
  else if (w.endsWith('ing') && w.length > 5) w = undouble(w.slice(0, -3));
  else if (w.endsWith('ed') && w.length > 4) w = undouble(w.slice(0, -2));
  else if (w.endsWith('es') && w.length > 4 && /(ch|sh|x|z|s)es$/.test(w)) w = w.slice(0, -2);
  else if (w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') && !w.endsWith('is') && w.length > 3) w = w.slice(0, -1);

  // derivational
  if (w.endsWith('ation') && w.length > 7) w = `${w.slice(0, -5)}at`;
  else if (w.endsWith('ment') && w.length > 6) w = w.slice(0, -4);
  else if (w.endsWith('ity') && w.length > 6) w = w.slice(0, -3);
  else if (w.endsWith('ness') && w.length > 6) w = w.slice(0, -4);
  else if (w.endsWith('ly') && w.length > 5) w = w.slice(0, -2);
  else if ((w.endsWith('er') || w.endsWith('or')) && w.length > 5) w = undouble(w.slice(0, -2));
  else if (w.endsWith('ion') && w.length > 6) w = w.slice(0, -3);

  if (w.endsWith('e') && w.length > 3) w = w.slice(0, -1);
  return w;
}

function undouble(w: string): string {
  return /([^aeiou\s])\1$/.test(w) && !/(ll|ss|zz)$/.test(w) ? w.slice(0, -1) : w;
}

/** Stemmed, stopword-free tokens. */
export function contentStems(text: string): string[] {
  return tokenize(text)
    .filter((t) => !STOPWORDS.has(t) && (t.length > 1 || /\d/.test(t)))
    .map(stem);
}

/** Canonical comparison key for a phrase: "AI Agents" → "ai agent". */
export function phraseKey(phrase: string): string {
  return contentStems(phrase).join(' ');
}

/** Lowercase, punctuation-free, single-spaced. */
export function normalizeText(input: string): string {
  return tokenize(input).join(' ');
}

/** 32-bit FNV-1a, base-36.  Stable ids / cache keys — not cryptographic. */
export function hashString(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Uppercases known acronyms and keeps mixed-case brand names intact. */
const ACRONYMS = new Set([
  'ai', 'llm', 'llms', 'gpu', 'gpus', 'cpu', 'api', 'apis', 'aws', 'ceo', 'cto', 'ui', 'ux', 'ml', 'nlp', 'agi', 'ipo', 'etf', 'gdp', 'uk', 'us', 'usa', 'eu', 'un', 'nasa', 'nba', 'nfl', 'mlb', 'nhl', 'f1', 'vr', 'ar', 'saas', 'sdk', 'ide', 'ios', 'os', 'tv', 'dna', 'rna', 'crispr', 'esg', 'fed', 'ev', 'evs', 'rl', 'gpt', 'cs', 'it', 'qa', 'seo', 'b2b', 'devops', 'sql', 'html', 'css', 'cia', 'fbi', 'nato',
]);
const SPECIAL_CASE: Record<string, string> = {
  openai: 'OpenAI',
  chatgpt: 'ChatGPT',
  github: 'GitHub',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  youtube: 'YouTube',
  netflix: 'Netflix',
  nvidia: 'Nvidia',
  devops: 'DevOps',
  iphone: 'iPhone',
  macos: 'macOS',
  ios: 'iOS',
  spacex: 'SpaceX',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
  deepmind: 'DeepMind',
  anthropic: 'Anthropic',
};

export function displayPhrase(phrase: string): string {
  return phrase
    .trim()
    .split(/\s+/)
    .map((w) => {
      const lower = w.toLowerCase();
      if (SPECIAL_CASE[lower]) return SPECIAL_CASE[lower];
      if (ACRONYMS.has(lower)) return lower.toUpperCase();
      // keep whatever mixed casing the source used
      if (/[A-Z]/.test(w.slice(1)) || /^[A-Z]{2,}$/.test(w)) return w;
      return lower;
    })
    .join(' ');
}

export function uniqueBy<T>(items: readonly T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const k = key(item);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

export function listToSentence(items: readonly string[], conjunction = 'and'): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} ${conjunction} ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, ${conjunction} ${items[items.length - 1]}`;
}
