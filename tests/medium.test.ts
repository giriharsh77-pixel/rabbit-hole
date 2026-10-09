import { describe, expect, it } from 'vitest';
import { createServices } from '../src/background/container';
import { MemoryStore } from '../src/services/cacheService';
import { buildContext } from '../src/services/contextService';
import { SETTINGS_KEY } from '../src/services/settingsService';
import { looksLikeMediumStory, mediumTags, parseMediumFeed, tagSlug } from '../src/services/substack/medium';
import { mockFetch, NOW, type Route } from './helpers';

const office = buildContext({
  platform: 'netflix',
  kind: 'episode',
  url: 'https://www.netflix.com/watch/1',
  title: 'The Office (U.S.)',
  episode: 'Season 1, Episode 5 — Basketball',
  genres: ['Sitcom'],
  source: 'test',
  confidence: 'high',
});

const item = (link: string, title: string, extra = '') =>
  `<item><title><![CDATA[${title}]]></title><link>${link}</link><dc:creator><![CDATA[Jordan Lee]]></dc:creator><category>the-office</category><category>sitcom</category><pubDate>Sat, 03 Oct 2026 10:00:00 GMT</pubDate><content:encoded><![CDATA[<p>Why <b>The Office</b> still works: Michael Scott, cringe comedy and the warmth underneath.</p>${extra}]]></content:encoded></item>`;
const feed = (...items: string[]) =>
  `<?xml version="1.0"?><rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>The Office on Medium</title><link>https://medium.com/tag/the-office</link>${items.join('')}</channel></rss>`;

describe('Medium tags', () => {
  it('turns names into Medium tag slugs', () => {
    expect(tagSlug('The Office')).toBe('the-office');
    expect(tagSlug("Grey's Anatomy")).toBe('greys-anatomy');
    expect(tagSlug('AI agents!')).toBe('ai-agents');
    expect(tagSlug('!')).toBe('');
  });

  it('uses the show itself for TV (never the episode name, which would pull in basketball posts)', () => {
    const tags = mediumTags(office);
    expect(tags[0]).toBe('the-office');
    expect(tags).not.toContain('basketball');
  });

  it('uses the subject and topics for a video', () => {
    const video = buildContext({ platform: 'youtube', kind: 'video', url: 'https://www.youtube.com/watch?v=abc', title: 'How AI Agents Will Change Software Development', keywords: ['ai agents', 'software development'], source: 't', confidence: 'high' });
    expect(mediumTags(video)).toEqual(expect.arrayContaining(['ai-agents']));
    expect(mediumTags(video).length).toBeLessThanOrEqual(4);
  });
});

describe('Medium feed parsing', () => {
  it('reads real stories, strips tracking, and rejects anything that is not an https story link', () => {
    const xml = feed(
      item('https://medium.com/@jlee/why-the-office-still-works-3f2a9b8c1d4e?source=rss----the_office-5', 'Why The Office Still Works'),
      item('https://writers.example.com/the-office-and-cringe-comedy-9a8b7c6d5e4f?source=rss', 'The Office and the art of cringe'),
      item('https://medium.com/tag/the-office', 'A tag page, not a story'),
      item('http://medium.com/@x/insecure-story-1234abcd5678', 'Plain http'),
      item('javascript:alert(1)//-1234abcd5678', 'Script link'),
    );
    const out = parseMediumFeed(xml, { tag: 'the-office', now: NOW });
    expect(out.map((c) => c.url)).toEqual([
      'https://medium.com/@jlee/why-the-office-still-works-3f2a9b8c1d4e',
      'https://writers.example.com/the-office-and-cringe-comedy-9a8b7c6d5e4f',
    ]);
    expect(out[0]).toMatchObject({ provider: 'medium', source: 'feed', publicationName: 'Medium', authorName: 'Jordan Lee', tags: ['the-office', 'sitcom'] });
    expect(out[0]!.excerpt).toMatch(/^Why The Office still works/);
    expect(out[0]!.publishedAt).toBe('2026-10-03T10:00:00.000Z');
    expect(out[1]!.publicationName).not.toBe('Substack'); // custom domains are named after themselves, never mislabelled
  });

  it('recognises Medium story URLs', () => {
    expect(looksLikeMediumStory('https://medium.com/@a/some-title-3f2a9b8c1d4e')).toBe(true);
    expect(looksLikeMediumStory('https://medium.com/p/3f2a9b8c1d4e')).toBe(true);
    expect(looksLikeMediumStory('https://medium.com/@a')).toBe(false);
  });
});

describe('Related Reading with Medium', () => {
  const services = (f: typeof fetch, reading: object = {}) => {
    const local = new MemoryStore();
    void local.setMany({ [SETTINGS_KEY]: { reading } });
    return createServices({ local, session: new MemoryStore(), fetchImpl: f, now: () => NOW, build: { redditClientId: '' } });
  };
  const medium: Route = (url) =>
    url.hostname === 'medium.com' && url.pathname.startsWith('/feed/tag/')
      ? url.pathname === '/feed/tag/the-office'
        ? new Response(feed(item('https://medium.com/@jlee/why-the-office-still-works-3f2a9b8c1d4e', 'Why The Office Still Works')), { status: 200 })
        : new Response('', { status: 404 }) // unknown tag: simply no stories
      : undefined;
  // Substack is reachable but has nothing on the show (valid, empty feeds)
  const noSubstack: Route = (url) =>
    url.hostname.endsWith('.substack.com') || url.pathname === '/feed' ? new Response('<rss version="2.0"><channel><title>x</title></channel></rss>', { status: 200 }) : undefined;

  it('finds reading for a show Substack has nothing on', async () => {
    const f = mockFetch(medium, noSubstack);
    const res = await services(f).substack.discover(office);
    expect(res.providers.find((p) => p.id === 'medium')).toMatchObject({ ok: true, count: 1 });
    expect(res.articles[0]).toMatchObject({ provider: 'medium', title: 'Why The Office Still Works' });
    expect(res.articles[0]!.why).toMatch(/Office/);
    expect(f.calls.some((c) => c === 'https://medium.com/feed/tag/the-office')).toBe(true);
  });

  it('sends nothing to Medium when the user switches it off', async () => {
    const f = mockFetch(medium, noSubstack);
    const res = await services(f, { includeMedium: false }).substack.discover(office);
    expect(f.calls.some((c) => c.includes('medium.com'))).toBe(false);
    expect(res.providers.some((p) => p.id === 'medium')).toBe(false);
  });

  it('reports Medium being unreachable without failing the whole search', async () => {
    const f = mockFetch((url) => (url.hostname === 'medium.com' ? new Response('', { status: 503 }) : undefined), noSubstack);
    const res = await services(f).substack.discover(office);
    expect(res.providers.find((p) => p.id === 'medium')).toMatchObject({ ok: false });
    expect(res.articles).toEqual([]);
  });
});
