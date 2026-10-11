import { describe, expect, it } from 'vitest';
import { createServices } from '../src/background/container';
import { MemoryStore } from '../src/services/cacheService';
import { buildContext } from '../src/services/contextService';
import { namesTitle, parseNewsFeed } from '../src/services/news/newsProvider';
import { OUTLETS, outletOrigins, topicSlug } from '../src/services/news/outlets';
import { looksEnglish } from '../src/services/ranking/language';
import { applySourcePreferences } from '../src/services/substackService';
import type { ArticleCandidate } from '../src/types/substack';
import { mockFetch } from './helpers';

const outlet = (id: string) => OUTLETS.find((o) => o.id === id)!;
const rss = (items: { title: string; link: string; description?: string; date?: string }[]) =>
  `<?xml version="1.0"?><rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>x</title>${items
    .map((i) => `<item><title><![CDATA[${i.title}]]></title><link>${i.link}</link><description><![CDATA[${i.description ?? ''}]]></description><pubDate>${i.date ?? 'Fri, 09 Oct 2026 10:00:00 GMT'}</pubDate><dc:creator>Staff</dc:creator></item>`)
    .join('')}</channel></rss>`;
const xml = (body: string) => new Response(body, { status: 200, headers: { 'content-type': 'application/rss+xml' } });

describe('news feeds', () => {
  it('parse into articles that stay on the publisher’s own site', () => {
    const items = parseNewsFeed(
      rss([
        { title: '‘The Office’ cast reunites', link: 'https://variety.com/2026/tv/news/the-office-reunion-1236/' },
        { title: 'Sponsored', link: 'https://ads.example.com/x' },
      ]),
      outlet('variety'),
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ publicationName: 'Variety', provider: 'news', authorName: 'Staff', publicationTier: 3 });
  });

  it('keep an article only when it names the title, not the word', () => {
    const a = (title: string, excerpt = '') => ({ title, excerpt });
    expect(namesTitle('The Office', [], a('Steve Carell recalls ‘The Office’ pilot'))).toBe(true);
    expect(namesTitle('The Office', [], a('Why The Office still tops streaming charts'))).toBe(true);
    expect(namesTitle('The Office', [], a('Return to the office: what it means for workers'))).toBe(false);
    expect(namesTitle('Wednesday', [], a('Box office: what opens on Wednesday'))).toBe(false);
    expect(namesTitle('Wednesday', ['Jenna Ortega'], a('Jenna Ortega teases Wednesday season 3'))).toBe(true);
    expect(namesTitle('RRR', [], a('RRR director S. S. Rajamouli announces next film'))).toBe(true);
    expect(namesTitle('Glass Onion: A Knives Out Mystery', [], a('“Glass Onion” sequel news'))).toBe(true);
  });

  it('read per-title topic pages and recent coverage, only from sites the user allowed', async () => {
    const fetchImpl = mockFetch((url) => {
      if (url.href === 'https://variety.com/t/the-office/feed/') return xml(rss([{ title: 'Greg Daniels looks back', link: 'https://variety.com/2026/tv/greg-daniels-1/' }]));
      if (url.href === 'https://variety.com/feed/') return xml(rss([{ title: 'Back to the office? Studios split', link: 'https://variety.com/2026/biz/rto-2/' }]));
      if (url.hostname === 'indianexpress.com')
        return xml(rss([{ title: 'The Office star Rainn Wilson on India', link: 'https://indianexpress.com/article/entertainment/the-office-3/' }]));
      return undefined;
    });
    const allowed = new Set(['https://variety.com/*', 'https://indianexpress.com/*']);
    const services = createServices({ local: new MemoryStore(), session: new MemoryStore(), fetchImpl, hasOrigin: async (p) => allowed.has(p) });
    const ctx = buildContext({ platform: 'title', kind: 'show', url: '', title: 'The Office', source: 't', confidence: 'high' });

    expect(await services.news.search(ctx)).toEqual([]); // news is opt-in
    await services.settings.update({ reading: { includeNews: true } });
    const found = await services.news.search(ctx);
    expect(found.map((c) => c.title).sort()).toEqual(['Greg Daniels looks back', 'The Office star Rainn Wilson on India']);
    expect(fetchImpl.calls.every((u) => u.startsWith('https://variety.com/') || u.startsWith('https://indianexpress.com/'))).toBe(true);

    // a hidden outlet is never fetched
    await services.settings.update({ reading: { sources: { variety: 'hide' } } });
    await services.cache.clear();
    fetchImpl.calls.length = 0;
    await services.news.search(ctx);
    expect(fetchImpl.calls.some((u) => u.includes('variety.com'))).toBe(false);
  });

  it('topic slugs match how the sites name their pages', () => {
    expect(topicSlug('The Office')).toBe('the-office');
    expect(topicSlug('Grey’s Anatomy')).toBe('greys-anatomy');
    expect(topicSlug('Pokémon: Horizons')).toBe('pokemon-horizons');
    expect(outletOrigins().every((o) => /^https:\/\/[a-z0-9.-]+\/\*$/.test(o))).toBe(true);
  });
});

describe('your sources', () => {
  const art = (over: Partial<ArticleCandidate>): ArticleCandidate => ({
    id: Math.random().toString(36).slice(2),
    url: 'https://x.substack.com/p/a',
    title: 'An essay about the show and why it works',
    excerpt: 'It is about the characters and the writing.',
    publicationName: 'Some Newsletter',
    source: 'feed',
    provider: 'feeds',
    matchedQueries: [],
    ...over,
  });
  const nyt = art({ provider: 'news', publicationName: 'The New York Times' });
  const pink = art({ provider: 'news', publicationName: 'Pinkvilla' });
  const med = art({ provider: 'medium', publicationName: 'Medium' });
  const sub = art({});
  const all = [nyt, pink, med, sub];
  const prefs = (sources: Record<string, 'prefer' | 'hide'>, onlyPreferred = false) => ({ sources, onlyPreferred, englishOnly: false });

  it('hide removes a source, prefer lifts it, "only preferred" keeps just those', () => {
    expect(applySourcePreferences(all, prefs({ pinkvilla: 'hide', medium: 'hide' })).map((c) => c.publicationName)).toEqual(['The New York Times', 'Some Newsletter']);
    const lifted = applySourcePreferences(all, prefs({ nyt: 'prefer' }));
    expect(lifted.find((c) => c.publicationName === 'The New York Times')?.publicationTier).toBe(3);
    expect(applySourcePreferences(all, prefs({ nyt: 'prefer', substack: 'prefer' }, true)).map((c) => c.publicationName)).toEqual(['The New York Times', 'Some Newsletter']);
    // nothing preferred yet: "only preferred" doesn't empty the list
    expect(applySourcePreferences(all, prefs({}, true))).toHaveLength(4);
  });

  it('English only drops other languages', () => {
    expect(looksEnglish('Why The Office still works, twenty years on')).toBe(true);
    expect(looksEnglish('Por que The Office ainda é a melhor série de comédia para os fãs')).toBe(false);
    expect(looksEnglish('हीरामंडी की कहानी और उसके किरदार')).toBe(false);
    // the real one that slipped through: Portuguese with Medium's English footer
    expect(looksEnglish('O Rancho do Maia é meio Black Mirror?. Eu estava vendo nas redes sociais alguns vídeos tenebrosos do Rancho do Maia e na hora me lembrei do Black Mirror (minha séria favorita). Continue reading on Medium »')).toBe(false);
    expect(looksEnglish('Black Mirror’s “Common People” is the bleakest episode yet — and that is the point. Continue reading on Medium »')).toBe(true);
    expect(looksEnglish('Café Society: Woody Allen’s film about Hollywood in the thirties, revisited')).toBe(true);
    const pt = art({ title: 'O que The Office nos ensina sobre o trabalho', excerpt: 'Uma análise da série e dos personagens para quem gosta de comédia' });
    expect(applySourcePreferences([sub, pt], { sources: {}, onlyPreferred: false, englishOnly: true })).toEqual([sub]);
  });
});
