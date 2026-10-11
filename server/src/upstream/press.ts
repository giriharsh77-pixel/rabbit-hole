/**
 * Press archives with search APIs — the coverage RSS can't reach (older titles):
 *   • The New York Times Article Search API
 *   • The Guardian Open Platform (content API)
 * Only articles in arts / film / TV sections that really name the title are kept.
 */
import { namesTitle } from '../../../src/services/news/match';
import { searchName } from '../../../src/services/reddit/aboutTitle';
import { httpJson } from '../../../src/utils/http';
import { cleanText } from '../../../src/utils/sanitize';
import { truncate } from '../../../src/utils/text';

export interface PressArticle {
  url: string;
  title: string;
  excerpt: string;
  publicationName: 'The New York Times' | 'The Guardian';
  authorName?: string;
  publishedAt?: string;
}

interface Opts {
  key: string;
  fetch?: typeof fetch;
  signal?: AbortSignal;
}

const isoDate = (v: unknown) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : undefined);
const NYT_SECTIONS = /^(arts|movies|television|magazine|opinion|style|weekend|theater|books|t magazine|the upshot)$/i;
const GUARDIAN_SECTIONS = new Set(['tv-and-radio', 'film', 'culture', 'media', 'stage', 'books', 'commentisfree', 'lifeandstyle']);

export async function nytSearch(title: string, people: string[], o: Opts): Promise<PressArticle[]> {
  const name = searchName(title);
  const qs = new URLSearchParams({ q: `"${name}"`, sort: 'relevance', 'api-key': o.key });
  const r = (await httpJson(`https://api.nytimes.com/svc/search/v2/articlesearch.json?${qs}`, {
    provider: 'nyt',
    timeoutMs: 10_000,
    signal: o.signal,
    ...(o.fetch ? { fetchImpl: o.fetch } : {}),
  })) as { response?: { docs?: unknown } } | null;
  const docs = Array.isArray(r?.response?.docs) ? r.response.docs : [];
  const out: PressArticle[] = [];
  for (const raw of docs.slice(0, 20)) {
    const d = raw as Record<string, unknown>;
    const url = typeof d.web_url === 'string' && /^https:\/\/www\.nytimes\.com\//.test(d.web_url) ? d.web_url : undefined;
    const headline = cleanText((d.headline as { main?: unknown } | undefined)?.main, 220);
    const excerpt = truncate(cleanText(d.abstract || d.snippet, 600), 300);
    if (!url || !headline || !NYT_SECTIONS.test(String(d.section_name ?? ''))) continue;
    if (!namesTitle(name, people, { title: headline, excerpt })) continue;
    const by = cleanText((d.byline as { original?: unknown } | undefined)?.original, 80).replace(/^by\s+/i, '');
    const date = isoDate(d.pub_date);
    out.push({ url, title: headline, excerpt, publicationName: 'The New York Times', ...(by ? { authorName: by } : {}), ...(date ? { publishedAt: date } : {}) });
  }
  return out;
}

export async function guardianSearch(title: string, people: string[], o: Opts): Promise<PressArticle[]> {
  const name = searchName(title);
  const qs = new URLSearchParams({
    q: `"${name}"`,
    'order-by': 'relevance',
    'page-size': '20',
    'show-fields': 'trailText,byline',
    'api-key': o.key,
  });
  const r = (await httpJson(`https://content.guardianapis.com/search?${qs}`, {
    provider: 'guardian',
    timeoutMs: 10_000,
    signal: o.signal,
    ...(o.fetch ? { fetchImpl: o.fetch } : {}),
  })) as { response?: { results?: unknown } } | null;
  const results = Array.isArray(r?.response?.results) ? r.response.results : [];
  const out: PressArticle[] = [];
  for (const raw of results) {
    const d = raw as Record<string, unknown>;
    const url = typeof d.webUrl === 'string' && /^https:\/\/www\.theguardian\.com\//.test(d.webUrl) ? d.webUrl : undefined;
    const headline = cleanText(d.webTitle, 220);
    const fields = (d.fields ?? {}) as Record<string, unknown>;
    const excerpt = truncate(cleanText(String(fields.trailText ?? '').replace(/<[^>]*>/g, ' '), 600), 300);
    if (!url || !headline || !GUARDIAN_SECTIONS.has(String(d.sectionId ?? ''))) continue;
    if (!namesTitle(name, people, { title: headline, excerpt })) continue;
    const by = cleanText(fields.byline, 80);
    const date = isoDate(d.webPublicationDate);
    out.push({ url, title: headline, excerpt, publicationName: 'The Guardian', ...(by ? { authorName: by } : {}), ...(date ? { publishedAt: date } : {}) });
  }
  return out;
}
