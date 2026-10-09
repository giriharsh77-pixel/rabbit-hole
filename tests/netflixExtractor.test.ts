// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractNetflix, readPlayerLabel, readTitlePage } from '../src/services/context/extractors/netflix';

function page(body: string, head = ''): Document {
  const doc = document.implementation.createHTMLDocument('Netflix');
  doc.documentElement.innerHTML = `<head><title>Netflix</title>${head}</head><body>${body}</body>`;
  return doc;
}

const WATCH = new URL('https://www.netflix.com/watch/81234567');
const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html');

const episodeLabel = `<div data-uia="video-title"><h4>Black Mirror</h4><span>S7:E2</span><span>Common People</span></div>`;
const movieLabel = `<div data-uia="video-title"><h4>Dune: Part Two</h4></div>`;

const jsonLd = (obj: unknown) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;

afterEach(() => {
  Reflect.deleteProperty(navigator, 'mediaSession');
});

describe('Netflix player label', () => {
  it('parses a TV episode: show, season, episode number and name', () => {
    expect(readPlayerLabel(page(episodeLabel))).toEqual({ title: 'Black Mirror', season: 7, episodeNumber: 2, episodeName: 'Common People' });
  });

  it('parses a movie (title only)', () => {
    expect(readPlayerLabel(page(movieLabel))).toEqual({ title: 'Dune: Part Two' });
  });

  it('copes with the single-string form and spelled-out seasons', () => {
    expect(readPlayerLabel(page(`<div data-uia="video-title">Severance S2 E4 Who Is Alive?</div>`))).toMatchObject({ title: 'Severance', season: 2, episodeNumber: 4, episodeName: 'Who Is Alive?' });
    expect(readPlayerLabel(page(`<div data-uia="video-title"><h4>The Crown</h4><span>Season 5, Episode 10</span></div>`))).toMatchObject({ season: 5, episodeNumber: 10 });
  });

  it('returns undefined when the player controls (and so the label) are hidden', () => {
    expect(readPlayerLabel(page('<div class="watch-video"></div>'))).toBeUndefined();
  });
});

describe('Netflix extraction', () => {
  it('builds an episode context from the label alone, without any network call', async () => {
    const fetchImpl = vi.fn();
    const raw = await extractNetflix(page(episodeLabel), WATCH, { enrich: false, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(raw).toMatchObject({
      platform: 'netflix',
      kind: 'episode',
      title: 'Black Mirror',
      episode: 'Season 7, Episode 2 — Common People',
      season: 7,
      episodeNumber: 2,
      videoId: '81234567',
      confidence: 'high',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('identifies a movie', async () => {
    const raw = await extractNetflix(page(`${movieLabel}${jsonLd({ '@type': 'Movie', name: 'Dune: Part Two', description: 'Paul Atreides unites with the Fremen.', genre: ['Sci-Fi', 'Adventure'], actor: [{ name: 'Timothée Chalamet' }] })}`), WATCH, { enrich: false });
    expect(raw).toMatchObject({ kind: 'movie', title: 'Dune: Part Two', genres: ['Sci-Fi', 'Adventure'], people: ['Timothée Chalamet'] });
    expect(raw?.episode).toBeUndefined();
  });

  it('reads JSON-LD / Open Graph on a title page', async () => {
    const doc = page('', `<meta property="og:title" content="Stranger Things | Netflix Official Site"><meta property="og:description" content="When a boy vanishes…">${jsonLd({ '@type': 'TVSeries', name: 'Stranger Things', genre: 'Horror', creator: [{ name: 'The Duffer Brothers' }] })}`);
    const raw = await extractNetflix(doc, new URL('https://www.netflix.com/title/80057281'), { enrich: false });
    expect(raw).toMatchObject({ title: 'Stranger Things', genres: ['Horror'], people: ['The Duffer Brothers'], confidence: 'medium' });
    expect(readTitlePage(doc).description).toBeTruthy();
  });

  it('falls back to the Media Session when the player label is hidden', async () => {
    Object.defineProperty(navigator, 'mediaSession', { configurable: true, value: { metadata: { title: 'Ozark' } } });
    const raw = await extractNetflix(page(''), WATCH, { enrich: false });
    expect(raw).toMatchObject({ title: 'Ozark', confidence: 'medium', source: 'media session' });
  });

  it('enriches a bare title with synopsis and genres from the public title page', async () => {
    const titlePage = `<html><head><meta property="og:title" content="Black Mirror | Netflix Official Site">${jsonLd({ '@type': 'TVSeries', name: 'Black Mirror', description: 'Twisted tales of tech.', genre: ['Sci-Fi', 'Thriller'] })}</head></html>`;
    const fetchImpl = vi.fn(async () => new Response(titlePage, { status: 200 }));
    const raw = await extractNetflix(page(episodeLabel), WATCH, { fetchImpl: fetchImpl as unknown as typeof fetch, parse });
    expect(fetchImpl).toHaveBeenCalledWith('https://www.netflix.com/title/81234567', expect.objectContaining({ credentials: 'same-origin' }));
    expect(raw).toMatchObject({ title: 'Black Mirror', description: 'Twisted tales of tech.', genres: ['Sci-Fi', 'Thriller'] });
    expect(raw?.source).toContain('Netflix title page');
  });

  it('ignores a fetched page that describes a different title', async () => {
    const other = `<html><head>${jsonLd({ '@type': 'Movie', name: 'Something Else', description: 'Unrelated', genre: ['Comedy'] })}</head></html>`;
    const raw = await extractNetflix(page(episodeLabel), WATCH, { fetchImpl: (async () => new Response(other)) as unknown as typeof fetch, parse });
    expect(raw?.description).toBeUndefined();
    expect(raw?.genres).toBeUndefined();
  });

  it('degrades gracefully: network failure keeps the label, nothing known returns null', async () => {
    const failing = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    const withLabel = await extractNetflix(page(episodeLabel), WATCH, { fetchImpl: failing, parse });
    expect(withLabel?.title).toBe('Black Mirror');
    const nothing = await extractNetflix(page(''), WATCH, { fetchImpl: failing, parse });
    expect(nothing).toBeNull();
  });

  it('rejects non-Netflix URLs and pages that are neither watch nor title pages', async () => {
    expect(await extractNetflix(page(episodeLabel), new URL('https://example.com/watch/1'))).toBeNull();
    expect(await extractNetflix(page(''), new URL('https://www.netflix.com/browse'), { enrich: false })).toBeNull();
  });
});
