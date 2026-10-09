import { describe, expect, it } from 'vitest';
import { parseAtom, parseListing } from '../src/services/reddit/parse';
import { mapBraveResults } from '../src/services/search/brave';
import { looksLikeArticleUrl, makeCandidate, mergeCandidates, normalizeIsoDate, publicationFromUrl, splitPublicationSuffix } from '../src/services/substack/candidates';
import { parseRssFeed } from '../src/services/substack/rss';
import { listing, NOW } from './helpers';

describe('Reddit JSON listing', () => {
  it('validates and normalises threads', () => {
    const json = listing([{ id: 'abc123', title: '  Big   news  ', score: 1200, comments: 340, subreddit: 'technology' }]);
    const [p] = parseListing(json, 'hot');
    expect(p).toMatchObject({
      id: 'abc123',
      title: 'Big news',
      subreddit: 'technology',
      permalink: 'https://www.reddit.com/r/technology/comments/abc123/x/',
      score: 1200,
      numComments: 340,
      feeds: ['hot'],
      rank: 0,
    });
  });

  it('skips malformed entries instead of crashing or trusting them', () => {
    const good = listing([{ id: 'good1' }]).data.children[0]!;
    const json = {
      data: {
        children: [
          null,
          { kind: 't1', data: {} }, // a comment, not a link
          { kind: 't3', data: { id: 'bad id!', title: 'x', subreddit: 'a', permalink: '/r/a/comments/1/x/', created_utc: 1 } },
          { kind: 't3', data: { id: 'nopermalink', title: 'x', subreddit: 'technology', created_utc: 1 } },
          { kind: 't3', data: { ...good.data, permalink: 'javascript:alert(1)' } },
          { kind: 't3', data: { ...good.data, permalink: 'https://evil.example/r/a/comments/1/x/' } },
          good,
        ],
      },
    };
    expect(parseListing(json, 'hot').map((p) => p.id)).toEqual(['good1']);
  });

  it('only keeps safe image hosts and https link targets', () => {
    const base = listing([{ id: 'img001' }]).data.children[0]!.data;
    const mk = (extra: Record<string, unknown>) => parseListing({ data: { children: [{ kind: 't3', data: { ...base, ...extra } }] } }, 'hot')[0]!;
    expect(mk({ thumbnail: 'https://b.thumbs.redditmedia.com/x.jpg' }).thumbnail).toBeDefined();
    expect(mk({ thumbnail: 'https://tracker.evil.example/p.gif' }).thumbnail).toBeUndefined();
    expect(mk({ thumbnail: 'default' }).thumbnail).toBeUndefined();
    expect(mk({ url: 'http://insecure.example/x' }).url).toBeUndefined();
    expect(mk({ url: 'https://user:pw@example.com/' }).url).toBeUndefined();
  });

  it('strips markup from self-post previews', () => {
    const base = listing([{ id: 'self01' }]).data.children[0]!.data;
    const p = parseListing({ data: { children: [{ kind: 't3', data: { ...base, is_self: true, selftext: '<img src=x onerror=alert(1)> Hello <b>world</b>&amp; more' } }] } }, 'hot')[0]!;
    expect(p.preview).toBe('Hello world& more');
  });

  it('throws INVALID_RESPONSE when the shape is wrong', () => {
    expect(() => parseListing({ nope: true }, 'hot')).toThrowError(expect.objectContaining({ code: 'INVALID_RESPONSE' }));
    expect(() => parseListing(null, 'hot')).toThrow();
  });
});

describe('Reddit Atom feed', () => {
  const entry = (id: string, extra = '') => `
    <entry>
      <author><name>/u/someone</name><uri>https://www.reddit.com/user/someone</uri></author>
      <category term="technology" label="r/technology"/>
      <content type="html">&lt;table&gt;&lt;tr&gt;&lt;td&gt; &amp;#32; submitted by &amp;#32; &lt;a href=&quot;https://www.reddit.com/user/someone&quot;&gt; /u/someone &lt;/a&gt; &lt;br/&gt; &lt;span&gt;&lt;a href=&quot;https://www.eff.org/deeplinks/story&quot;&gt;[link]&lt;/a&gt;&lt;/span&gt; &lt;span&gt;&lt;a href=&quot;https://www.reddit.com/r/technology/comments/${id}/story/&quot;&gt;[comments]&lt;/a&gt;&lt;/span&gt; &lt;/td&gt;&lt;/tr&gt;&lt;/table&gt;</content>
      <id>t3_${id}</id>
      <media:thumbnail url="https://external-preview.redd.it/abc.png?width=640" />
      <link href="https://www.reddit.com/r/technology/comments/${id}/story/" />
      <updated>2026-10-07T10:00:00+00:00</updated>
      <published>2026-10-07T09:30:00+00:00</published>
      <title>Story &amp; more ${id}</title>${extra}
    </entry>`;
  const feed = (...entries: string[]) => `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/"><title>/r/Technology</title>${entries.join('')}</feed>`;

  it('parses Reddit’s official feed, honestly leaving counts undefined', () => {
    const [p, q] = parseAtom(feed(entry('1abcde'), entry('2fghij')), 'hot');
    expect(p).toMatchObject({
      id: '1abcde',
      title: 'Story & more 1abcde',
      subreddit: 'technology',
      author: 'someone',
      url: 'https://www.eff.org/deeplinks/story',
      domain: 'eff.org',
      isSelf: false,
      rank: 0,
      thumbnail: 'https://external-preview.redd.it/abc.png?width=640',
    });
    expect(p!.score).toBeUndefined();
    expect(p!.numComments).toBeUndefined();
    expect(q!.rank).toBe(1);
    expect(p!.createdUtc).toBe(Math.floor(Date.parse('2026-10-07T09:30:00+00:00') / 1000));
  });

  it('rejects non-feeds and drops broken entries', () => {
    expect(() => parseAtom('<html>blocked</html>', 'hot')).toThrowError(expect.objectContaining({ code: 'INVALID_RESPONSE' }));
    expect(parseAtom(feed(entry('1abcde').replace('<id>t3_1abcde</id>', '<id>garbage</id>')), 'hot')).toEqual([]);
  });
});

describe('Substack RSS', () => {
  const rss = (items: string) => `<?xml version="1.0"?><rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title><![CDATA[Import AI]]></title><link>https://importai.substack.com</link>${items}</channel></rss>`;
  const item = (slug: string, extra = '') => `
    <item>
      <title><![CDATA[Import AI 472: agents &amp; more]]></title>
      <description><![CDATA[<p>Jack Clark on <b>agents</b>. Plus more&hellip;</p>]]></description>
      <link>https://importai.substack.com/p/${slug}</link>
      <guid isPermaLink="false">123</guid>
      <dc:creator><![CDATA[Jack Clark]]></dc:creator>
      <pubDate>Mon, 05 Oct 2026 12:32:30 GMT</pubDate>
      <content:encoded><![CDATA[<p>${'long body '.repeat(200)}</p>]]></content:encoded>${extra}
    </item>`;
  const meta = { feedUrl: 'https://importai.substack.com/feed', now: NOW };

  it('maps items to validated candidates with real metadata only', () => {
    const { items, publicationName } = parseRssFeed(rss(item('import-ai-472')), { ...meta, name: 'Import AI', tags: ['ai'], tier: 3 });
    expect(publicationName).toBe('Import AI');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      title: 'Import AI 472: agents & more',
      url: 'https://importai.substack.com/p/import-ai-472',
      authorName: 'Jack Clark',
      publishedAt: '2026-10-05T12:32:30.000Z',
      excerpt: 'Jack Clark on agents. Plus more…',
      publicationName: 'Import AI',
      source: 'feed',
      publicationTier: 3,
    });
  });

  it('drops posts that link off-site, to non-articles, or to unsafe schemes', () => {
    const items = [
      item('ok'),
      item('x').replace('https://importai.substack.com/p/x', 'https://evil.example/p/x'),
      item('y').replace('https://importai.substack.com/p/y', 'https://importai.substack.com/archive'),
      item('z').replace('https://importai.substack.com/p/z', 'javascript:alert(1)'),
    ].join('');
    expect(parseRssFeed(rss(items), meta).items.map((i) => i.url)).toEqual(['https://importai.substack.com/p/ok']);
  });

  it('accepts a custom-domain feed for its own domain only', () => {
    const custom = rss(item('a').replace('importai.substack.com', 'www.example-newsletter.com') + item('b'));
    const out = parseRssFeed(custom, { feedUrl: 'https://www.example-newsletter.com/feed', now: NOW });
    expect(out.items.map((i) => new URL(i.url).hostname)).toEqual(['www.example-newsletter.com', 'importai.substack.com']);
    // a post on a *different* non-substack host would be rejected
    expect(makeCandidate({ url: 'https://other.example/p/z', title: 'A title', source: 'feed', provider: 'feeds' }, { allowedHosts: ['www.example-newsletter.com'] })).toBeUndefined();
  });

  it('throws on non-RSS bodies', () => {
    expect(() => parseRssFeed('<html></html>', meta)).toThrowError(expect.objectContaining({ code: 'INVALID_RESPONSE' }));
  });
});

describe('candidate validation', () => {
  const base = { source: 'search', provider: 'brave' } as const;

  it('never invents dates: future, ancient and malformed dates are dropped', () => {
    expect(normalizeIsoDate('2026-10-01T00:00:00Z', NOW)).toBe('2026-10-01T00:00:00.000Z');
    expect(normalizeIsoDate('2031-01-01', NOW)).toBeUndefined();
    expect(normalizeIsoDate('1999-01-01', NOW)).toBeUndefined();
    expect(normalizeIsoDate('3 weeks ago', NOW)).toBeUndefined();
    expect(normalizeIsoDate(undefined, NOW)).toBeUndefined();
  });

  it('derives an honest publication name from the host, or from a matching title suffix', () => {
    expect(publicationFromUrl('https://the-pragmatic-engineer.substack.com/p/x')).toBe('The Pragmatic Engineer');
    expect(publicationFromUrl('https://open.substack.com/pub/importai/p/x')).toBe('Importai');
    expect(splitPublicationSuffix('Why agents matter - Import AI', 'https://importai.substack.com/p/x')).toEqual({ title: 'Why agents matter', publication: 'Import AI' });
    // a dash that is part of the headline is left alone
    expect(splitPublicationSuffix('Pros - and cons of agents', 'https://importai.substack.com/p/x')).toEqual({ title: 'Pros - and cons of agents' });
  });

  it('only accepts real article URLs on Substack', () => {
    expect(looksLikeArticleUrl('https://x.substack.com/p/some-post')).toBe(true);
    expect(looksLikeArticleUrl('https://substack.com/@writer/p-12345')).toBe(true);
    expect(looksLikeArticleUrl('https://x.substack.com/archive')).toBe(false);
    expect(makeCandidate({ ...base, url: 'https://substack.com.evil.example/p/x', title: 'Hello world' })).toBeUndefined();
    expect(makeCandidate({ ...base, url: 'http://x.substack.com/p/x', title: 'Hello world' })).toBeUndefined();
    expect(makeCandidate({ ...base, url: 'https://x.substack.com/p/x', title: '  ' })).toBeUndefined();
  });

  it('canonicalises URLs so the same article merges across queries', () => {
    const a = makeCandidate({ ...base, url: 'https://x.substack.com/p/post?utm_source=a&r=1', title: 'Post title', matchedQueries: ['q1'], searchRank: 4 })!;
    const b = makeCandidate({ ...base, url: 'https://x.substack.com/p/post/?utm_campaign=z#comments', title: 'Post title', matchedQueries: ['q2'], searchRank: 1 })!;
    expect(a.id).toBe(b.id);
    const [merged] = mergeCandidates([[a], [b]]);
    expect(merged).toMatchObject({ matchedQueries: ['q1', 'q2'], searchRank: 1 });
  });
});

describe('Brave Search mapping', () => {
  it('keeps only Substack articles and reports ranks', () => {
    const json = {
      web: {
        results: [
          { title: 'Agents are different - Import AI', url: 'https://importai.substack.com/p/agents', description: '<strong>Agents</strong> change things.', page_age: '2026-09-30T00:00:00' },
          { title: 'Import AI', url: 'https://importai.substack.com/', description: 'home page' },
          { title: 'Not substack', url: 'https://medium.com/p/agents', description: 'x' },
          { title: 'Note', url: 'https://substack.com/@x/note/c-1', description: 'a note' },
        ],
      },
    };
    const out = mapBraveResults(json, 'ai agents');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      title: 'Agents are different',
      publicationName: 'Import AI',
      excerpt: 'Agents change things.',
      searchRank: 0,
      matchedQueries: ['ai agents'],
      provider: 'brave',
    });
    expect(out[0]!.authorName).toBeUndefined(); // we do not guess authors
  });

  it('treats "no results" as empty and a broken shape as an error', () => {
    expect(mapBraveResults({}, 'q')).toEqual([]);
    expect(mapBraveResults({ web: { results: [] } }, 'q')).toEqual([]);
    expect(() => mapBraveResults({ web: { results: 'nope' } }, 'q')).toThrowError(expect.objectContaining({ code: 'INVALID_RESPONSE' }));
  });
});
