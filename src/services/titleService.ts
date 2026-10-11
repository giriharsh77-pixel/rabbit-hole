/**
 * titleService — turns "The Office (U.S.)" into one exact Wikidata item, and
 * reads what every tab needs from it: the show's subreddit, its cast in billing
 * order (with X / Instagram handles), IMDb / Letterboxd / Rotten Tomatoes ids,
 * genres, creators.
 *
 * Wikidata is free, keyless and CC0.  Two documented interfaces are used:
 *   • the MediaWiki API (wbsearchentities, wbgetentities) for search and facts,
 *   • the Wikidata Query Service (SPARQL) for item types and social handles.
 * Only the title being looked up is sent.  If the query service is down, search
 * falls back to Wikidata's own descriptions and the cast simply has no handles.
 */
import type { ContentContext } from '../types/context';
import type { CastMember, Person, RelatedTitle, RelatedTitles, TitleCandidate, TitleInfo, TitleInsights, TitleKind } from '../types/title';
import type { BackendClient } from './backend/client';
import { AppError } from '../utils/errors';
import { httpJson } from '../utils/http';
import { cleanText } from '../utils/sanitize';
import { normalizeText } from '../utils/text';
import { EXTENSION_VERSION } from '../utils/env';
import { CacheService, TTL } from './cacheService';
import { buildContext } from './contextService';

const API = 'https://www.wikidata.org/w/api.php';
const SPARQL = 'https://query.wikidata.org/sparql';

/** Wikidata "instance of" classes we treat as a movie / a series. */
const MOVIE_TYPES = new Set(['Q11424', 'Q202866', 'Q506240', 'Q93204', 'Q24869', 'Q29168811', 'Q24862', 'Q20650540']);
const SERIES_TYPES = new Set(['Q5398426', 'Q581714', 'Q1259759', 'Q526877', 'Q63952888', 'Q15416', 'Q117467246', 'Q1366112']);

/** Used only when the query service is unavailable: "2022 film directed by …", "American sitcom …". */
const SERIES_DESC = /\b(television|tv|web|streaming|anime|animated|drama|comedy|reality|documentary)?\s*(series|sitcom|miniseries|soap opera|telenovela|show|programme|program)\b/i;
const MOVIE_DESC = /\b(film|movie)\b/i;
const NOT_A_TITLE = /\b(episode|season|character|soundtrack|album|song|single|novel|book|video game|franchise|company|band|actor|actress|film director|film series)\b/i;

/** Netflix catalogue tags → words Wikidata uses in descriptions. */
const REGION_WORDS: Record<string, RegExp> = {
  us: /\b(american|u\.?s\.?|united states)\b/i,
  uk: /\b(british|english|u\.?k\.?|united kingdom)\b/i,
  india: /\b(indian|india|hindi|tamil|telugu|malayalam|kannada|bengali|marathi)\b/i,
  spain: /\b(spanish|spain)\b/i,
  korea: /\b(korean|south korea)\b/i,
  japan: /\b(japanese|japan)\b/i,
  france: /\b(french|france)\b/i,
  germany: /\b(german|germany)\b/i,
  australia: /\b(australian|australia)\b/i,
  canada: /\b(canadian|canada)\b/i,
};

export function regionKey(tag: string | undefined): string | undefined {
  if (!tag) return undefined;
  const t = tag.toLowerCase().replace(/\./g, '');
  if (/^(us|usa)$/.test(t)) return 'us';
  if (/^(uk|gb)$/.test(t)) return 'uk';
  const map: Record<string, string> = {
    hindi: 'india', indian: 'india', india: 'india', tamil: 'india', telugu: 'india',
    spanish: 'spain', korean: 'korea', japanese: 'japan', french: 'france', german: 'germany',
    australia: 'australia', aus: 'australia', canada: 'canada',
  };
  return map[t];
}

const isQid = (s: string) => /^Q\d{1,12}$/.test(s);
const qidOf = (uri: string | undefined) => uri?.match(/(Q\d+)$/)?.[1];

/** "drama television series" → "drama", "comedy film" → "comedy". */
export function genreLabel(label: string): string {
  return cleanText(label, 60)
    .replace(/\s+(television series|television program(me)?|tv series|web series|series|film|movie)$/i, '')
    .trim();
}

// ─── Wikidata response shapes (validated as they are read) ──────────────────

interface SparqlRow {
  [k: string]: { value: string } | undefined;
}

interface Snak {
  datavalue?: { value?: unknown };
}
interface Statement {
  mainsnak?: Snak;
  rank?: string;
  qualifiers?: Record<string, Snak[] | undefined>;
}
interface Entity {
  missing?: string;
  labels?: Record<string, { value?: string } | undefined>;
  descriptions?: Record<string, { value?: string } | undefined>;
  claims?: Record<string, Statement[] | undefined>;
  sitelinks?: Record<string, { url?: string } | undefined>;
}

const live = (st: Statement[] | undefined) => (st ?? []).filter((s) => s.rank !== 'deprecated');
const idOf = (snak: Snak | undefined) => {
  const v = snak?.datavalue?.value as { id?: unknown } | undefined;
  return typeof v?.id === 'string' && isQid(v.id) ? v.id : undefined;
};
const strOf = (snak: Snak | undefined) => (typeof snak?.datavalue?.value === 'string' ? snak.datavalue.value.trim() : '');
const yearOf = (snak: Snak | undefined) => {
  const t = (snak?.datavalue?.value as { time?: unknown } | undefined)?.time;
  const y = typeof t === 'string' ? Number(/^[+]?(\d{4})-/.exec(t)?.[1]) : NaN;
  return Number.isFinite(y) ? y : undefined;
};
/** First live value of a string property, if it fits `pattern`. */
const firstStr = (e: Entity, prop: string, pattern: RegExp) => live(e.claims?.[prop]).map((s) => strOf(s.mainsnak)).find((v) => pattern.test(v));

export interface TitleServiceDeps {
  cache: CacheService;
  fetchImpl?: typeof fetch;
  /** The optional backend (TMDB / OMDb behind it). */
  getBackend?: () => BackendClient | undefined;
}

export class TitleService {
  constructor(private readonly deps: TitleServiceDeps) {}

  private get(url: string, signal: AbortSignal | undefined, accept?: string): Promise<unknown> {
    return httpJson(url, {
      provider: 'wikidata',
      signal,
      timeoutMs: 12_000,
      // Wikimedia asks API clients to identify themselves; browsers can't set User-Agent.
      headers: { 'Api-User-Agent': `RabbitHole/${EXTENSION_VERSION} (https://github.com/giriharsh77-pixel/rabbit-hole)`, ...(accept ? { accept } : {}) },
      ...(this.deps.fetchImpl ? { fetchImpl: this.deps.fetchImpl } : {}),
    });
  }

  private async sparql(query: string, signal?: AbortSignal): Promise<SparqlRow[]> {
    const body = (await this.get(`${SPARQL}?format=json&query=${encodeURIComponent(query)}`, signal, 'application/sparql-results+json')) as {
      results?: { bindings?: SparqlRow[] };
    };
    return Array.isArray(body?.results?.bindings) ? body.results.bindings : [];
  }

  private async entities(ids: string[], props: string, signal?: AbortSignal): Promise<Record<string, Entity>> {
    if (ids.length === 0) return {};
    const url = `${API}?action=wbgetentities&format=json&origin=*&languages=en&sitefilter=enwiki&props=${encodeURIComponent(props)}&ids=${ids.join('|')}`;
    const body = (await this.get(url, signal)) as { entities?: Record<string, Entity> };
    return body?.entities && typeof body.entities === 'object' ? body.entities : {};
  }

  /** Movies and series matching what the user typed, in Wikidata's relevance order. */
  async search(query: string, opts: { signal?: AbortSignal } = {}): Promise<TitleCandidate[]> {
    const q = cleanText(query, 80).trim();
    if (q.length < 2) return [];
    const result = await this.deps.cache.getOrFetch<TitleCandidate[]>(
      `title:search:${normalizeText(q)}`,
      TTL.titleSearch,
      async (signal) => {
        const url = `${API}?action=wbsearchentities&format=json&origin=*&type=item&language=en&uselang=en&limit=12&search=${encodeURIComponent(q)}`;
        const found = (await this.get(url, signal)) as { search?: { id?: unknown; label?: unknown; description?: unknown }[] };
        const hits = (Array.isArray(found?.search) ? found.search : [])
          .map((h) => ({ id: typeof h.id === 'string' ? h.id : '', title: cleanText(h.label, 160), description: cleanText(h.description, 160) }))
          .filter((h) => isQid(h.id) && h.title);
        if (hits.length === 0) return [];

        // which of these are movies or series, and when they came out
        let facts: Map<string | undefined, { kind?: TitleKind; year?: number }>;
        try {
          const rows = await this.sparql(
            `SELECT ?item (GROUP_CONCAT(DISTINCT STR(?type); separator=" ") AS ?types) (MIN(YEAR(?d)) AS ?year) WHERE {
               VALUES ?item { ${hits.map((h) => `wd:${h.id}`).join(' ')} }
               ?item wdt:P31 ?type .
               OPTIONAL { { ?item wdt:P577 ?d } UNION { ?item wdt:P580 ?d } }
             } GROUP BY ?item`,
            signal,
          );
          facts = new Map(
            rows.map((r) => {
              const types = (r.types?.value ?? '').split(' ').map(qidOf);
              const kind: TitleKind | undefined = types.some((t) => t && SERIES_TYPES.has(t)) ? 'series' : types.some((t) => t && MOVIE_TYPES.has(t)) ? 'movie' : undefined;
              const year = Number(r.year?.value) || undefined;
              return [qidOf(r.item?.value), { ...(kind ? { kind } : {}), ...(year ? { year } : {}) }];
            }),
          );
        } catch (err) {
          if (signal.aborted) throw err;
          // query service down: classify by description ("2022 film directed by …")
          facts = new Map(
            hits.map((h) => {
              const d = h.description;
              const kind: TitleKind | undefined = !d || NOT_A_TITLE.test(d) ? undefined : MOVIE_DESC.test(d) ? 'movie' : SERIES_DESC.test(d) ? 'series' : undefined;
              const year = Number(/\b(19\d{2}|20\d{2})\b/.exec(d)?.[1]) || undefined;
              return [h.id, { ...(kind ? { kind } : {}), ...(year ? { year } : {}) }];
            }),
          );
        }

        const out: TitleCandidate[] = [];
        for (const h of hits) {
          const f = facts.get(h.id);
          if (!f?.kind) continue;
          out.push({ qid: h.id, title: h.title, kind: f.kind, ...(h.description ? { description: h.description } : {}), ...(f.year ? { year: f.year } : {}) });
        }
        return out;
      },
      { ...(opts.signal ? { signal: opts.signal } : {}), allowStale: true },
    );
    return result.value;
  }

  /** Everything the tabs need about one title. */
  async info(qid: string, opts: { signal?: AbortSignal } = {}): Promise<TitleInfo> {
    if (!isQid(qid)) throw new AppError('UNKNOWN', 'Invalid title id', { retryable: false });
    const result = await this.deps.cache.getOrFetch<TitleInfo>(
      `title:info:${qid}`,
      TTL.titleInfo,
      async (signal) => {
        const e = (await this.entities([qid], 'labels|descriptions|claims|sitelinks/urls', signal))[qid];
        if (!e || e.missing !== undefined || !e.claims) throw new AppError('INVALID_RESPONSE', 'Title not found', { provider: 'wikidata', retryable: false });

        const types = live(e.claims.P31).map((s) => idOf(s.mainsnak));
        const kind: TitleKind = types.some((t) => t && SERIES_TYPES.has(t)) ? 'series' : 'movie';

        // cast in billing order (an explicit "series ordinal" wins when editors gave one)
        const castStatements = live(e.claims.P161)
          .map((s, i) => ({ id: idOf(s.mainsnak), char: idOf(s.qualifiers?.P453?.[0]), ord: Number(strOf(s.qualifiers?.P1545?.[0])) || 1000 + i }))
          .filter((c): c is { id: string; char: string | undefined; ord: number } => !!c.id)
          .sort((a, b) => a.ord - b.ord);
        const castIds = [...new Set(castStatements.map((c) => c.id))].slice(0, 16);
        const creatorIds = [...new Set(live(kind === 'series' ? (e.claims.P170?.length ? e.claims.P170 : e.claims.P57) : e.claims.P57).map((s) => idOf(s.mainsnak)).filter((x): x is string => !!x))].slice(0, 4);
        const genreIds = live(e.claims.P136).map((s) => idOf(s.mainsnak)).filter((x): x is string => !!x).slice(0, 8);
        const charIds = castStatements.filter((c) => castIds.includes(c.id)).map((c) => c.char).filter((x): x is string => !!x);
        const labelIds = [...new Set([...castIds, ...creatorIds, ...genreIds, ...charIds])].slice(0, 50);

        const [labelled, socials] = await Promise.all([
          this.entities(labelIds, 'labels', signal),
          this.socials(castIds, signal),
        ]);
        const label = (id: string | undefined) => (id ? cleanText(labelled[id]?.labels?.en?.value, 80) : '');

        const cast: CastMember[] = [];
        for (const id of castIds) {
          const name = label(id);
          if (!name) continue; // no English name: nothing we can show or search for
          const character = label(castStatements.find((c) => c.id === id && c.char)?.char);
          const s = socials.get(id);
          cast.push({ qid: id, name, ...(character ? { character } : {}), ...(s?.x ? { x: s.x } : {}), ...(s?.instagram ? { instagram: s.instagram } : {}) });
        }
        const creators: Person[] = creatorIds.map((id) => ({ qid: id, name: label(id) })).filter((p) => p.name);

        const years = [...live(e.claims.P577), ...live(e.claims.P580)].map((s) => yearOf(s.mainsnak)).filter((y): y is number => !!y);
        const info: TitleInfo = {
          qid,
          title: cleanText(e.labels?.en?.value, 160) || qid,
          kind,
          genres: [...new Set(genreIds.map((id) => genreLabel(label(id))).filter((g) => g.length > 1))].slice(0, 5),
          cast,
          creators,
          source: 'wikidata',
        };
        if (years.length) info.year = Math.min(...years);
        const desc = cleanText(e.descriptions?.en?.value, 160);
        if (desc) info.description = desc;
        const wiki = e.sitelinks?.enwiki?.url;
        if (typeof wiki === 'string' && /^https:\/\/en\.wikipedia\.org\/wiki\/[^\s]+$/.test(wiki)) info.wikipediaUrl = wiki;

        const subreddit = firstStr(e, 'P3984', /^[A-Za-z0-9_]{3,21}$/);
        if (subreddit) info.subreddit = subreddit;
        const imdb = firstStr(e, 'P345', /^tt\d{5,10}$/);
        if (imdb) info.imdbId = imdb;
        const letterboxd = firstStr(e, 'P6127', /^[a-z0-9-]{1,120}$/);
        if (letterboxd) info.letterboxdId = letterboxd;
        const rotten = firstStr(e, 'P1258', /^(m|tv)\/[a-z0-9_-]{1,120}$/);
        if (rotten) info.rottenTomatoesId = rotten;
        const tmdb = firstStr(e, kind === 'series' ? 'P4983' : 'P4947', /^\d{1,9}$/);
        if (tmdb) info.tmdb = { type: kind === 'series' ? 'tv' : 'movie', id: tmdb };
        return info;
      },
      { ...(opts.signal ? { signal: opts.signal } : {}), allowStale: true },
    );
    return result.value;
  }

  /** X / Instagram usernames for the cast. Optional: a failure just means no links. */
  private async socials(ids: string[], signal: AbortSignal): Promise<Map<string, { x?: string; instagram?: string }>> {
    const out = new Map<string, { x?: string; instagram?: string }>();
    if (ids.length === 0) return out;
    try {
      const rows = await this.sparql(
        `SELECT ?p ?x ?insta WHERE {
           VALUES ?p { ${ids.map((id) => `wd:${id}`).join(' ')} }
           OPTIONAL { ?p p:P2002 ?xs . ?xs ps:P2002 ?x . FILTER NOT EXISTS { ?xs pq:P582 [] } }
           OPTIONAL { ?p wdt:P2003 ?insta }
         }`,
        signal,
      );
      for (const r of rows) {
        const id = qidOf(r.p?.value);
        if (!id) continue;
        const m = out.get(id) ?? {};
        const x = r.x?.value?.trim();
        if (x && /^[A-Za-z0-9_]{1,15}$/.test(x)) m.x ??= x;
        const ig = r.insta?.value?.trim();
        if (ig && /^[A-Za-z0-9._]{1,30}$/.test(ig)) m.instagram ??= ig;
        out.set(id, m);
      }
    } catch (err) {
      if (signal.aborted) throw err;
    }
    return out;
  }

  /**
   * Watch next, keyless: other movies and series with the same leading cast,
   * and by the same director / creator.  Every suggestion carries the real
   * connection ("With Steve Carell and Ed Helms") — nothing is inferred.
   */
  async related(qid: string, opts: { signal?: AbortSignal } = {}): Promise<RelatedTitles> {
    const info = await this.info(qid, opts);
    const result = await this.deps.cache.getOrFetch<RelatedTitles>(
      `title:related:${qid}`,
      TTL.titleInfo,
      async (signal) => {
        const types = [...MOVIE_TYPES, ...SERIES_TYPES].map((t) => `wd:${t}`).join(' ');
        const query = (people: string[], via: string) => `
          SELECT ?work ?label ?desc ?pLabel (SAMPLE(?links) AS ?sl) (MIN(YEAR(?d)) AS ?year) (GROUP_CONCAT(DISTINCT STR(?type); separator=" ") AS ?types) WHERE {
            VALUES ?p { ${people.map((id) => `wd:${id}`).join(' ')} }
            VALUES ?type { ${types} }
            ?work ${via} ?p ; wdt:P31 ?type .
            FILTER(?work != wd:${qid})
            ?work rdfs:label ?label . FILTER(LANG(?label) = "en")
            ?p rdfs:label ?pLabel . FILTER(LANG(?pLabel) = "en")
            OPTIONAL { ?work schema:description ?desc . FILTER(LANG(?desc) = "en") }
            OPTIONAL { ?work wikibase:sitelinks ?links }
            OPTIONAL { { ?work wdt:P577 ?d } UNION { ?work wdt:P580 ?d } }
          } GROUP BY ?work ?label ?desc ?pLabel LIMIT 600`;
        const leads = info.cast.slice(0, 6).map((m) => m.qid);
        const creators = info.creators.map((c) => c.qid);
        const [castRows, creatorRows] = await Promise.all([
          leads.length ? this.sparql(query(leads, 'wdt:P161'), signal) : Promise.resolve([]),
          creators.length ? this.sparql(query(creators, 'wdt:P57|wdt:P170'), signal) : Promise.resolve([]),
        ]);
        return {
          qid,
          withCast: groupRelated(castRows, 'cast').slice(0, 24),
          byCreators: groupRelated(creatorRows, 'creator').slice(0, 12),
          source: 'wikidata',
        };
      },
      { ...(opts.signal ? { signal: opts.signal } : {}), allowStale: true },
    );
    return result.value;
  }

  /**
   * Ratings, reviews, similar titles and Netflix India availability — from the
   * backend, when it has TMDB / OMDb keys.  `null` means "not available here",
   * which the UI explains; it is never filled with guesses.
   */
  async insights(qid: string, opts: { signal?: AbortSignal } = {}): Promise<TitleInsights | null> {
    const backend = this.deps.getBackend?.();
    if (!backend) return null;
    const features = await backend.features(opts.signal).catch(() => undefined);
    if (!features || !(features.titles || features.ratings)) return null;
    const info = await this.info(qid, opts);
    if (!info.tmdb && !info.imdbId) return null;
    const result = await this.deps.cache.getOrFetch<TitleInsights>(
      `title:insights:${qid}`,
      TTL.titleInsights,
      async (signal) => {
        const insights = await backend.titleInsights({ ...(info.tmdb ? { tmdb: info.tmdb } : {}), ...(info.imdbId ? { imdbId: info.imdbId } : {}) }, signal);
        // so "Explore" can open a suggestion: which Wikidata item is each TMDB title?
        const qids = await this.qidsForTmdb(insights.similar.map((s) => s.tmdb), signal).catch(() => new Map<string, string>());
        return { ...insights, similar: insights.similar.map((s) => ({ ...s, ...(qids.get(`${s.tmdb.type}:${s.tmdb.id}`) ? { qid: qids.get(`${s.tmdb.type}:${s.tmdb.id}`)! } : {}) })) };
      },
      { ...(opts.signal ? { signal: opts.signal } : {}), allowStale: true },
    );
    return result.value;
  }

  /** TMDB ids → Wikidata items, in one query. */
  async qidsForTmdb(refs: { type: 'movie' | 'tv'; id: string }[], signal?: AbortSignal): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const movies = refs.filter((r) => r.type === 'movie' && /^\d{1,9}$/.test(r.id)).map((r) => `"${r.id}"`);
    const shows = refs.filter((r) => r.type === 'tv' && /^\d{1,9}$/.test(r.id)).map((r) => `"${r.id}"`);
    if (movies.length + shows.length === 0) return out;
    const parts = [
      movies.length ? `{ VALUES ?m { ${movies.join(' ')} } ?item wdt:P4947 ?m }` : '',
      shows.length ? `{ VALUES ?t { ${shows.join(' ')} } ?item wdt:P4983 ?t }` : '',
    ].filter(Boolean);
    const rows = await this.sparql(`SELECT ?item ?m ?t WHERE { ${parts.join(' UNION ')} }`, signal);
    for (const r of rows) {
      const qid = qidOf(r.item?.value);
      if (!qid) continue;
      if (r.m?.value) out.set(`movie:${r.m.value}`, qid);
      if (r.t?.value) out.set(`tv:${r.t.value}`, qid);
    }
    return out;
  }

  /**
   * The exact title a Netflix page (or a picked search result) refers to.
   * "The Office (U.S.)" → the American sitcom, not the British one: the
   * catalogue tag, the year and Netflix's cast list break ties.
   */
  async resolve(ctx: ContentContext, opts: { signal?: AbortSignal } = {}): Promise<TitleInfo | null> {
    if (ctx.titleId && isQid(ctx.titleId)) return this.info(ctx.titleId, opts);
    const kind: TitleKind | undefined = ctx.kind === 'movie' ? 'movie' : ctx.kind === 'episode' || ctx.kind === 'show' ? 'series' : undefined;
    const candidates = await this.search(ctx.title, opts);
    if (candidates.length === 0) return null;

    const want = normalizeText(ctx.title);
    const region = regionKey(ctx.regionTag);
    const scored = candidates.slice(0, 6).map((c, i) => {
      let score = (6 - i) * 0.25; // Wikidata's own ranking: popularity + label match
      if (normalizeText(c.title) === want) score += 3;
      if (kind && c.kind === kind) score += 3;
      if (region && c.description && REGION_WORDS[region]?.test(c.description)) score += 2;
      if (ctx.year && c.year && Math.abs(ctx.year - c.year) <= 1) score += 2;
      return { c, score };
    });
    scored.sort((a, b) => b.score - a.score);

    // Still a tie (a remake, two films of the same name)? Netflix's cast list decides.
    const people = new Set(ctx.entities.map((e) => normalizeText(e)));
    const close = scored.filter((s) => s.score >= (scored[0]?.score ?? 0) - 1.5).slice(0, 3);
    if (people.size > 0 && close.length > 1) {
      await Promise.all(
        close.map(async (s) => {
          const cast = await this.info(s.c.qid, opts).then((t) => t.cast.map((m) => normalizeText(m.name))).catch(() => [] as string[]);
          s.score += 2 * Math.min(2, cast.filter((n) => people.has(n)).length);
        }),
      );
      scored.sort((a, b) => b.score - a.score);
    }
    const best = scored[0];
    if (!best || best.score < 4) return null; // nothing convincingly the same title
    return this.info(best.c.qid, opts);
  }
}

/** One row per work: who links it to the title, how well known it is. Most shared cast first, then fame. */
function groupRelated(rows: SparqlRow[], via: 'cast' | 'creator'): RelatedTitle[] {
  const byWork = new Map<string, RelatedTitle>();
  for (const r of rows) {
    const qid = qidOf(r.work?.value);
    const title = cleanText(r.label?.value, 160);
    const person = cleanText(r.pLabel?.value, 80);
    if (!qid || !title || !person) continue;
    const types = (r.types?.value ?? '').split(' ').map(qidOf);
    const kind: TitleKind = types.some((t) => t && SERIES_TYPES.has(t)) ? 'series' : 'movie';
    const w = byWork.get(qid) ?? { qid, title, kind, sharedCast: [], popularity: 0 };
    if (via === 'cast' && !w.sharedCast.includes(person)) w.sharedCast.push(person);
    if (via === 'creator') w.sharedCreator ??= person;
    w.popularity = Math.max(w.popularity, Number(r.sl?.value) || 0);
    const year = Number(r.year?.value);
    if (year && (!w.year || year < w.year)) w.year = year;
    const desc = cleanText(r.desc?.value, 160);
    if (desc && !w.description) w.description = desc;
    byWork.set(qid, w);
  }
  return [...byWork.values()]
    .filter((w) => !w.description || !NOT_A_TITLE.test(w.description) || MOVIE_DESC.test(w.description))
    .sort((a, b) => b.sharedCast.length - a.sharedCast.length || b.popularity - a.popularity);
}

/** A picked title as a context every tab can search from: its genres and leading cast included. */
export function titleContext(info: TitleInfo, now: number = Date.now()): ContentContext {
  return buildContext(
    {
      platform: 'title',
      kind: info.kind === 'movie' ? 'movie' : 'show',
      url: '',
      title: info.title,
      titleId: info.qid,
      ...(info.year ? { year: info.year } : {}),
      ...(info.description ? { description: info.description } : {}),
      ...(info.genres.length ? { genres: info.genres } : {}),
      ...(info.cast.length ? { people: info.cast.slice(0, 4).map((m) => m.name) } : {}),
      source: 'title search (Wikidata)',
      confidence: 'high',
    },
    now,
  );
}
