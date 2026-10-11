/**
 * TMDB (themoviedb.org) — similar titles, user reviews and where to watch.
 *
 * One request per title (`append_to_response`), plus one "where to watch"
 * request for each of the top suggestions so they can be marked
 * "On Netflix India".  Watch-provider data comes from JustWatch via TMDB, and
 * both must be credited wherever it is shown.
 *
 * Auth: a v4 "API Read Access Token" (starts with `eyJ`) goes in the
 * Authorization header; a v3 API key goes in the query string.
 */
import type { SimilarTitle, TitleReview, WatchAvailability } from '../../../src/types/title';
import { httpJson } from '../../../src/utils/http';
import { cleanText } from '../../../src/utils/sanitize';
import { truncate } from '../../../src/utils/text';

const API = 'https://api.themoviedb.org/3';
/** Netflix, Netflix basic with Ads, Netflix Kids. */
const NETFLIX_IDS = new Set([8, 1796, 175]);

export type TmdbType = 'movie' | 'tv';

export interface TmdbOptions {
  key: string;
  fetch?: typeof fetch;
  signal?: AbortSignal;
}

function request(path: string, params: Record<string, string>, o: TmdbOptions): Promise<unknown> {
  const bearer = o.key.startsWith('eyJ');
  const qs = new URLSearchParams({ ...params, ...(bearer ? {} : { api_key: o.key }) });
  return httpJson(`${API}${path}?${qs}`, {
    provider: 'tmdb',
    timeoutMs: 10_000,
    signal: o.signal,
    headers: bearer ? { authorization: `Bearer ${o.key}` } : {},
    ...(o.fetch ? { fetchImpl: o.fetch } : {}),
  });
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const year = (d: unknown) => {
  const y = typeof d === 'string' ? Number(d.slice(0, 4)) : NaN;
  return y > 1870 && y < 2200 ? y : undefined;
};
const idOf = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? String(v) : undefined);

/** Find a title by its IMDb id (when Wikidata has no TMDB id). */
export async function tmdbFind(imdbId: string, o: TmdbOptions): Promise<{ type: TmdbType; id: string } | undefined> {
  const r = obj(await request(`/find/${imdbId}`, { external_source: 'imdb_id' }, o));
  const tv = idOf(obj(arr(r.tv_results)[0]).id);
  if (tv) return { type: 'tv', id: tv };
  const movie = idOf(obj(arr(r.movie_results)[0]).id);
  return movie ? { type: 'movie', id: movie } : undefined;
}

export function parseAvailability(providers: unknown, region: 'IN' = 'IN'): WatchAvailability {
  const r = obj(obj(obj(providers).results)[region]);
  const subscription = [...arr(r.flatrate), ...arr(r.ads), ...arr(r.free)].map(obj);
  const onNetflix = subscription.some((p) => NETFLIX_IDS.has(Number(p.provider_id)) || /^netflix\b/i.test(String(p.provider_name ?? '')));
  const elsewhere = [
    ...new Set(
      subscription
        .filter((p) => !NETFLIX_IDS.has(Number(p.provider_id)) && !/^netflix\b/i.test(String(p.provider_name ?? '')))
        .map((p) => cleanText(p.provider_name, 40))
        .filter(Boolean),
    ),
  ].slice(0, 5);
  const link = typeof r.link === 'string' && /^https:\/\/www\.themoviedb\.org\//.test(r.link) ? r.link : undefined;
  return { region, onNetflix, elsewhere, ...(link ? { link } : {}) };
}

function parseReviews(v: unknown): TitleReview[] {
  const out: TitleReview[] = [];
  for (const raw of arr(obj(v).results).slice(0, 8)) {
    const r = obj(raw);
    const id = typeof r.id === 'string' && /^[a-f0-9]{8,32}$/.test(r.id) ? r.id : undefined;
    const author = cleanText(r.author, 60) || cleanText(obj(r.author_details).username, 60);
    // reviews are markdown / light HTML — keep plain text only
    const text = cleanText(String(r.content ?? '').replace(/<[^>]*>/g, ' ').replace(/[*_#>`]+/g, ''), 4000).replace(/\s+/g, ' ');
    if (!id || !author || text.length < 40) continue;
    const rating = Number(obj(r.author_details).rating);
    const date = typeof r.created_at === 'string' && !Number.isNaN(Date.parse(r.created_at)) ? new Date(r.created_at).toISOString() : undefined;
    out.push({
      author,
      excerpt: truncate(text, 420),
      url: `https://www.themoviedb.org/review/${id}`,
      ...(rating >= 0 && rating <= 10 && r.author_details && obj(r.author_details).rating != null ? { rating } : {}),
      ...(date ? { date } : {}),
    });
  }
  return out;
}

function parseSuggestions(v: unknown, type: TmdbType): SimilarTitle[] {
  const out: SimilarTitle[] = [];
  for (const raw of arr(obj(v).results)) {
    const r = obj(raw);
    const id = idOf(r.id);
    const kind: TmdbType = r.media_type === 'movie' || r.media_type === 'tv' ? r.media_type : type;
    const title = cleanText(kind === 'tv' ? (r.name ?? r.title) : (r.title ?? r.name), 160);
    if (!id || !title || r.adult === true) continue;
    const y = year(kind === 'tv' ? r.first_air_date : r.release_date);
    const overview = truncate(cleanText(r.overview, 600), 220);
    out.push({ tmdb: { type: kind, id }, title, ...(y ? { year: y } : {}), ...(overview ? { overview } : {}) });
  }
  return out;
}

export interface TmdbTitle {
  type: TmdbType;
  id: string;
  score?: { score: number; votes: number };
  reviews: TitleReview[];
  similar: SimilarTitle[];
  availability: WatchAvailability;
  imdbId?: string;
  url: string;
}

/** Everything for one title, in one request — then Netflix India checks for the top suggestions. */
export async function tmdbTitle(type: TmdbType, id: string, o: TmdbOptions & { checkSimilar?: number }): Promise<TmdbTitle> {
  const d = obj(await request(`/${type}/${id}`, { append_to_response: 'reviews,recommendations,similar,watch/providers,external_ids', language: 'en-US' }, o));
  const seen = new Set<string>();
  // TMDB's "recommendations" (what viewers watch next) first, then "similar" (shared genres / keywords)
  const similar = [...parseSuggestions(d.recommendations, type), ...parseSuggestions(d.similar, type)].filter((s) => {
    const k = `${s.tmdb.type}:${s.tmdb.id}`;
    if (seen.has(k) || s.tmdb.id === id) return false;
    seen.add(k);
    return true;
  });
  const top = similar.slice(0, o.checkSimilar ?? 10);
  const checks = await Promise.allSettled(top.map((s) => request(`/${s.tmdb.type}/${s.tmdb.id}/watch/providers`, {}, o)));
  checks.forEach((c, i) => {
    if (c.status === 'fulfilled' && top[i]) top[i].onNetflixIndia = parseAvailability(c.value).onNetflix;
  });

  const score = Number(d.vote_average);
  const votes = Number(d.vote_count);
  const imdb = obj(d.external_ids).imdb_id;
  return {
    type,
    id,
    ...(score > 0 && votes > 0 ? { score: { score: Math.round(score * 10) / 10, votes } } : {}),
    reviews: parseReviews(d.reviews),
    similar: similar.slice(0, 20),
    availability: parseAvailability(d['watch/providers']),
    ...(typeof imdb === 'string' && /^tt\d{5,10}$/.test(imdb) ? { imdbId: imdb } : {}),
    url: `https://www.themoviedb.org/${type}/${id}`,
  };
}
