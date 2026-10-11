import { describe, expect, it } from 'vitest';
import { CacheService, MemoryStore } from '../src/services/cacheService';
import { buildContext } from '../src/services/contextService';
import { regionKey, TitleService, titleContext } from '../src/services/titleService';
import { regionTagOf } from '../src/services/context/topics';
import { jsonResponse, mockFetch } from './helpers';

/** A tiny stand-in for Wikidata: search hits, entities (claims in billing order), types and social handles. */
type Cast = [qid: string, name: string | undefined, character?: string, x?: string, insta?: string];
interface Item {
  label: string;
  desc: string;
  types: string[];
  year: number;
  cast?: Cast[];
  genres?: [string, string][];
  creators?: [string, string][];
  ids?: Record<string, string>;
  wiki?: string;
}
const ITEMS: Record<string, Item> = {
  Q23829: { label: 'The Office', desc: 'British mockumentary sitcom', types: ['Q5398426'], year: 2001, cast: [['Q1', 'Ricky Gervais', 'David Brent', 'rickygervais']] },
  Q23831: {
    label: 'The Office',
    desc: 'American sitcom broadcast on NBC',
    types: ['Q5398426'],
    year: 2005,
    ids: { P3984: 'DunderMifflin', P345: 'tt0386676', P4983: '2316', P1258: 'tv/the_office' },
    genres: [['Q170238', 'sitcom'], ['Q1935609', 'mockumentary'], ['Q20', 'comedy television series']],
    creators: [['Q30', 'Greg Daniels']],
    wiki: 'https://en.wikipedia.org/wiki/The_Office_(American_TV_series)',
    cast: [
      ['Q2', 'Steve Carell', 'Michael Scott', 'SteveCarell'],
      ['Q5', 'John Krasinski', 'Jim Halpert', 'johnkrasinski', 'johnkrasinski'],
      ['Q3', 'Jenna Fischer', 'Pam Beesly', 'jennafischer', 'msjennafischer'],
      ['Q3', 'Jenna Fischer', 'Pam Beesly'], // listed twice — once is enough
      ['Q4', undefined], // no English name — dropped
    ],
  },
  Q60424165: { label: 'RRR', desc: '2022 Indian Telugu-language film', types: ['Q11424'], year: 2022, ids: { P345: 'tt8178634', P6127: 'rrr', P1258: 'm/rrr', P4947: '579974' }, genres: [['Q188473', 'action film']], creators: [['Q31', 'S. S. Rajamouli']] },
  Q999: { label: 'The Office', desc: 'song', types: ['Q7366'], year: 2010 },
};
const SEARCH: Record<string, string[]> = { 'the office': ['Q23829', 'Q23831', 'Q999'], rrr: ['Q60424165'] };
const LABELS: Record<string, string> = Object.fromEntries(
  Object.values(ITEMS).flatMap((it) => [
    ...(it.cast ?? []).flatMap(([q, n, c]) => [[q, n], [`char:${q}`, c]]),
    ...(it.genres ?? []),
    ...(it.creators ?? []),
  ]).filter(([k, v]) => k && v) as [string, string][],
);
const charId = (q: string) => `Q${9000 + Number(q.slice(1))}`;
const SOCIAL: Record<string, [string?, string?]> = Object.fromEntries(Object.values(ITEMS).flatMap((it) => (it.cast ?? []).filter((c) => c[3] || c[4]).map(([q, , , x, ig]) => [q, [x, ig]])));

const b = (value: string | number | undefined) => (value === undefined ? undefined : { value: String(value) });
const ent = (id: string) => ({ datavalue: { value: { id } } });
const str = (value: string) => ({ datavalue: { value } });

function wikidata(opts: { sparqlDown?: boolean } = {}) {
  return mockFetch((url) => {
    if (url.hostname === 'www.wikidata.org' && url.searchParams.get('action') === 'wbsearchentities') {
      const ids = SEARCH[(url.searchParams.get('search') ?? '').toLowerCase()] ?? [];
      return jsonResponse({ search: ids.map((id) => ({ id, label: ITEMS[id]!.label, description: ITEMS[id]!.desc })) });
    }
    if (url.hostname === 'www.wikidata.org' && url.searchParams.get('action') === 'wbgetentities') {
      const ids = (url.searchParams.get('ids') ?? '').split('|');
      const entities: Record<string, unknown> = {};
      for (const id of ids) {
        const it = ITEMS[id];
        if (!it) {
          const charOf = Object.keys(LABELS).find((k) => k.startsWith('char:') && charId(k.slice(5)) === id);
          const name = charOf ? LABELS[charOf] : LABELS[id];
          entities[id] = name ? { labels: { en: { value: name } } } : { labels: {} };
          continue;
        }
        entities[id] = {
          labels: { en: { value: it.label } },
          descriptions: { en: { value: it.desc } },
          sitelinks: it.wiki ? { enwiki: { url: it.wiki } } : {},
          claims: {
            P31: it.types.map((t) => ({ mainsnak: ent(t), rank: 'normal' })),
            P577: [{ mainsnak: { datavalue: { value: { time: `+${it.year}-03-24T00:00:00Z` } } }, rank: 'normal' }],
            P136: (it.genres ?? []).map(([g]) => ({ mainsnak: ent(g), rank: 'normal' })),
            [it.types[0] === 'Q11424' ? 'P57' : 'P170']: (it.creators ?? []).map(([c]) => ({ mainsnak: ent(c), rank: 'normal' })),
            P161: (it.cast ?? []).map(([q, , c]) => ({ mainsnak: ent(q), rank: 'normal', ...(c ? { qualifiers: { P453: [ent(charId(q))] } } : {}) })),
            ...Object.fromEntries(Object.entries(it.ids ?? {}).map(([p, v]) => [p, [{ mainsnak: str(v), rank: 'normal' }]])),
          },
        };
      }
      return jsonResponse({ entities });
    }
    if (url.hostname !== 'query.wikidata.org') return undefined;
    if (opts.sparqlDown) return new Response('busy', { status: 503 });
    const q = url.searchParams.get('query') ?? '';
    const ids = [...q.matchAll(/wd:(Q\d+)/g)].map((m) => m[1]!);
    if (q.includes('P2002')) {
      return jsonResponse({ results: { bindings: ids.filter((id) => SOCIAL[id]).map((id) => ({ p: b(`http://www.wikidata.org/entity/${id}`), x: b(SOCIAL[id]![0]), insta: b(SOCIAL[id]![1]) })) } });
    }
    return jsonResponse({
      results: {
        bindings: ids.map((id) => ({
          item: b(`http://www.wikidata.org/entity/${id}`),
          types: b(ITEMS[id]!.types.map((t) => `http://www.wikidata.org/entity/${t}`).join(' ')),
          year: b(ITEMS[id]!.year),
        })),
      },
    });
  });
}

const service = (fetchImpl: ReturnType<typeof wikidata> = wikidata()) => ({ fetchImpl, titles: new TitleService({ cache: new CacheService(new MemoryStore()), fetchImpl }) });

describe('title search (Wikidata)', () => {
  it('returns only movies and series, with year and kind', async () => {
    const { titles } = service();
    const found = await titles.search('The Office');
    expect(found.map((c) => [c.qid, c.kind, c.year])).toEqual([
      ['Q23829', 'series', 2001],
      ['Q23831', 'series', 2005],
    ]);
    expect(found[1]?.description).toBe('American sitcom broadcast on NBC');
  });

  it('identifies itself to Wikimedia and caches results', async () => {
    const { titles, fetchImpl } = service();
    await titles.search('RRR');
    await titles.search('rrr');
    expect(fetchImpl.calls.filter((c) => c.includes('wbsearchentities'))).toHaveLength(1);
    expect(await titles.search('x')).toEqual([]); // too short to search
  });

  it('reads the facts every tab needs', async () => {
    const { titles } = service();
    const office = await titles.info('Q23831');
    expect(office).toMatchObject({
      title: 'The Office',
      kind: 'series',
      year: 2005,
      subreddit: 'DunderMifflin',
      imdbId: 'tt0386676',
      rottenTomatoesId: 'tv/the_office',
      tmdb: { type: 'tv', id: '2316' },
      wikipediaUrl: 'https://en.wikipedia.org/wiki/The_Office_(American_TV_series)',
      creators: [{ qid: 'Q30', name: 'Greg Daniels' }],
    });
    expect(office.genres).toEqual(['sitcom', 'mockumentary', 'comedy']);
    // billing order, de-duplicated, unnamed items dropped
    expect(office.cast.map((m) => m.name)).toEqual(['Steve Carell', 'John Krasinski', 'Jenna Fischer']);
    expect(office.cast[2]).toEqual({ qid: 'Q3', name: 'Jenna Fischer', character: 'Pam Beesly', x: 'jennafischer', instagram: 'msjennafischer' });

    const rrr = await titles.info('Q60424165');
    expect(rrr).toMatchObject({ kind: 'movie', letterboxdId: 'rrr', rottenTomatoesId: 'm/rrr', tmdb: { type: 'movie', id: '579974' }, genres: ['action'], creators: [{ name: 'S. S. Rajamouli' }] });
    await expect(titles.info('not-an-id')).rejects.toMatchObject({ code: 'UNKNOWN' });
  });

  it('keeps working when the query service is down', async () => {
    const { titles } = service(wikidata({ sparqlDown: true }));
    // types come from the descriptions instead: "British mockumentary sitcom", "song" (dropped)
    expect((await titles.search('The Office')).map((c) => [c.qid, c.kind])).toEqual([
      ['Q23829', 'series'],
      ['Q23831', 'series'],
    ]);
    expect((await titles.search('RRR'))[0]).toMatchObject({ kind: 'movie', year: 2022 });
    // facts still load; only the social handles are missing
    const office = await titles.info('Q23831');
    expect(office.cast.map((m) => m.name)).toEqual(['Steve Carell', 'John Krasinski', 'Jenna Fischer']);
    expect(office.cast.some((m) => m.x || m.instagram)).toBe(false);
  });
});

describe('which title Netflix means', () => {
  const netflix = (title: string, people: string[] = []) =>
    buildContext({ platform: 'netflix', kind: 'episode', url: 'https://www.netflix.com/watch/1', title, people, source: 'test', confidence: 'high' });

  it('"The Office (U.S.)" is the American sitcom, not the British one', async () => {
    const { titles } = service();
    const ctx = netflix('The Office (U.S.)');
    expect(ctx).toMatchObject({ title: 'The Office', regionTag: 'U.S.' });
    expect((await titles.resolve(ctx))?.qid).toBe('Q23831');
  });

  it('without a catalogue tag, Netflix’s cast list breaks the tie', async () => {
    const { titles } = service();
    expect((await titles.resolve(netflix('The Office', ['Steve Carell', 'Jenna Fischer'])))?.qid).toBe('Q23831');
    expect((await titles.resolve(netflix('The Office', ['Ricky Gervais'])))?.qid).toBe('Q23829');
  });

  it('gives up rather than guess when nothing matches', async () => {
    const { titles } = service();
    expect(await titles.resolve(netflix('A Show Wikidata Has Never Heard Of'))).toBeNull();
  });

  it('a picked title becomes a context with its genres and cast', async () => {
    const { titles } = service();
    const ctx = titleContext(await titles.info('Q23831'));
    expect(ctx).toMatchObject({ platform: 'title', kind: 'show', title: 'The Office', titleId: 'Q23831', year: 2005 });
    expect(ctx.entities).toEqual(expect.arrayContaining(['Steve Carell']));
    expect((await titles.resolve(ctx))?.qid).toBe('Q23831'); // known id: no search needed
  });

  it('reads Netflix catalogue tags', () => {
    expect(regionTagOf('The Office (U.S.)')).toBe('U.S.');
    expect(regionTagOf('Money Heist (Spanish)')).toBe('Spanish');
    expect(regionTagOf('Dune (2021)')).toBeUndefined();
    expect(regionTagOf('Black Mirror')).toBeUndefined();
    expect([regionKey('U.S.'), regionKey('UK'), regionKey('Hindi'), regionKey('Klingon')]).toEqual(['us', 'uk', 'india', undefined]);
  });
});
