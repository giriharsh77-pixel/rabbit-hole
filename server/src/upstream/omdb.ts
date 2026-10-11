/** OMDb — IMDb, Rotten Tomatoes and Metacritic ratings for an IMDb id. */
import type { TitleRatings } from '../../../src/types/title';
import { httpJson } from '../../../src/utils/http';

export async function omdbRatings(imdbId: string, o: { key: string; fetch?: typeof fetch; signal?: AbortSignal }): Promise<TitleRatings | undefined> {
  const qs = new URLSearchParams({ i: imdbId, apikey: o.key });
  const r = (await httpJson(`https://www.omdbapi.com/?${qs}`, {
    provider: 'omdb',
    timeoutMs: 8000,
    signal: o.signal,
    ...(o.fetch ? { fetchImpl: o.fetch } : {}),
  })) as Record<string, unknown> | null;
  if (!r || r.Response !== 'True') return undefined;
  const out: TitleRatings = {};
  const ok = (v: unknown, re: RegExp) => (typeof v === 'string' && re.test(v) ? v : undefined);
  const imdb = ok(r.imdbRating, /^\d{1,2}(\.\d)?$/);
  if (imdb) out.imdb = `${imdb}/10`;
  const votes = ok(r.imdbVotes, /^[\d,]{1,12}$/);
  if (votes) out.imdbVotes = votes;
  for (const raw of Array.isArray(r.Ratings) ? r.Ratings : []) {
    const x = raw as { Source?: unknown; Value?: unknown };
    if (x.Source === 'Rotten Tomatoes') {
      const v = ok(x.Value, /^\d{1,3}%$/);
      if (v) out.rottenTomatoes = v;
    } else if (x.Source === 'Metacritic') {
      const v = ok(x.Value, /^\d{1,3}\/100$/);
      if (v) out.metacritic = v;
    }
  }
  if (!out.metacritic) {
    const m = ok(r.Metascore, /^\d{1,3}$/);
    if (m) out.metacritic = `${m}/100`;
  }
  return Object.keys(out).length ? out : undefined;
}
