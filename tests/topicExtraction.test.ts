import { describe, expect, it } from 'vitest';
import { buildContext, manualContext } from '../src/services/contextService';
import { cleanTitle, extractEntities } from '../src/services/context/topics';
import { generateQueries, generateRedditQueries } from '../src/services/context/queries';
import type { RawPageMetadata } from '../src/types/context';

const yt = (title: string, extra: Partial<RawPageMetadata> = {}) =>
  buildContext({ platform: 'youtube', kind: 'video', url: 'https://www.youtube.com/watch?v=abc', title, source: 'test', confidence: 'high', ...extra });

const lower = (xs: string[]) => xs.map((x) => x.toLowerCase());

describe('topic extraction', () => {
  it('turns "How AI Agents Will Change Software Development" into topics, not a sentence', () => {
    const ctx = yt('How AI Agents Will Change Software Development', {
      creator: 'Fireship',
      description: 'AI agents are about to change how we write code. We look at autonomous coding agents.',
      keywords: ['ai agents', 'software development', 'fireship', 'youtube'],
    });
    expect(lower(ctx.topics)).toEqual(expect.arrayContaining(['ai agents', 'software development']));
    // related concepts a human would expect (the spec's example)
    const all = lower(ctx.keywords);
    for (const expected of ['ai coding', 'developer tools', 'ai automation']) expect(all).toContain(expected);
    // the channel and platform are not topics
    expect(all).not.toContain('fireship');
    expect(all).not.toContain('youtube');
    // "AI Agents" in a Title Case headline is a topic, not a named entity
    expect(lower(ctx.entities)).not.toContain('ai agents');
  });

  it('adds a "future of …" angle for speculative headlines', () => {
    const ctx = yt('How AI Agents Will Change Software Development');
    expect(lower(ctx.keywords).some((k) => k.startsWith('future of'))).toBe(true);
  });

  it('finds brands even in Title Case and expands them', () => {
    const ctx = yt("Why OpenAI's New Model Changes Everything");
    expect(ctx.entities).toContain('OpenAI');
    expect(lower(ctx.keywords)).toEqual(expect.arrayContaining(['frontier ai', 'ai models', 'ai industry', 'model competition']));
  });

  it('strips clickbait, hashtags, brackets and channel suffixes from titles', () => {
    expect(cleanTitle('🔥 Dune: Part Two (Official Trailer) | Warner Bros. #dune #shorts', 'Warner Bros.')).toBe('Dune: Part Two');
    expect(cleanTitle('Understanding Transformers [4K] - 3Blue1Brown', '3Blue1Brown')).toBe('Understanding Transformers');
    expect(cleanTitle('The Future of Energy | Full Documentary')).toContain('The Future of Energy');
  });

  it('drops leading post tags such as Reddit’s [D] / (OC) / [Discussion]', () => {
    expect(cleanTitle('[D] How are teams evaluating AI agents beyond pass/fail?')).toBe('How are teams evaluating AI agents beyond pass/fail?');
    expect(cleanTitle('(OC) I mapped every cafe in the city')).toBe('I mapped every cafe in the city');
    expect(cleanTitle('[Discussion]: Is remote work over?')).toBe('Is remote work over?');
    // …but a bracketed word that is part of the headline survives
    expect(cleanTitle('Why [Dune] still matters')).toContain('Dune');
  });

  it('keeps useful YouTube metadata keywords but discards SEO spam', () => {
    const ctx = yt('Rust vs Go for backend services', {
      keywords: ['rust', 'golang', 'backend', 'subscribe', 'viral video', 'trending now'],
    });
    const kw = lower(ctx.keywords);
    expect(kw).toEqual(expect.arrayContaining(['rust', 'golang']));
    expect(kw).not.toContain('subscribe');
    expect(kw).not.toContain('viral video');
  });

  it('ignores one-off description phrases and social-link boilerplate', () => {
    const ctx = yt('Black hole physics explained simply', {
      description: 'Follow me on Twitter\nSubscribe for more\nWe discuss event horizons and Hawking radiation briefly.',
    });
    expect(lower(ctx.keywords)).not.toContain('follow me');
    expect(lower(ctx.keywords).join(' ')).not.toContain('subscribe');
  });

  it('handles a Short with hashtags', () => {
    const ctx = buildContext({ platform: 'youtube', kind: 'short', url: 'https://www.youtube.com/shorts/abcde', title: 'This is how a black hole actually forms #space #physics #shorts', source: 't', confidence: 'medium' });
    expect(ctx.title).toBe('This is how a black hole actually forms');
    expect(lower(ctx.topics)).toContain('black hole');
    expect(lower(ctx.keywords)).toContain('astrophysics');
  });
});

describe('Netflix titles', () => {
  const black = buildContext({
    platform: 'netflix',
    kind: 'episode',
    url: 'https://www.netflix.com/watch/1',
    title: 'Black Mirror',
    episode: 'Season 7, Episode 2 — Common People',
    genres: ['Sci-Fi', 'Dystopian'],
    people: ['Charlie Brooker'],
    description: 'This anthology series explores a twisted, high-tech multiverse where humanity’s greatest innovations and darkest instincts collide.',
    source: 'test',
    confidence: 'high',
  });

  it('treats the show as an entity and derives the themes the spec expects', () => {
    expect(black.entities[0]).toBe('Black Mirror');
    expect(black.entities).toContain('Charlie Brooker');
    const k = lower(black.keywords);
    for (const expected of ['dystopian fiction', 'technology and society', 'surveillance', 'artificial intelligence', 'digital culture']) {
      expect(k).toContain(expected);
    }
  });

  it('does not turn a synopsis into noisy phrases', () => {
    expect(lower(black.keywords)).not.toContain('anthology series explores');
  });

  it('generates entity-anchored queries instead of searching the synopsis', () => {
    const q = generateQueries(black).map((x) => x.text);
    expect(q[0]).toBe('"Black Mirror"');
    expect(q.some((x) => x.includes('"Black Mirror"') && x.includes('dystopian fiction'))).toBe(true);
    expect(q.length).toBeGreaterThanOrEqual(3);
  });
});

describe('manual searches', () => {
  it('keeps the user’s words as the strongest concept', () => {
    const ctx = manualContext('Indian startups');
    expect(ctx.platform).toBe('manual');
    expect(ctx.concepts[0]).toMatchObject({ text: 'indian startups', weight: 1 });
    expect(lower(ctx.keywords)).toContain('venture capital');
  });

  it('recognises single named entities', () => {
    expect(manualContext('Nvidia').entities).toEqual(['Nvidia']);
    expect(lower(manualContext('Nvidia').keywords)).toEqual(expect.arrayContaining(['gpus', 'semiconductors']));
  });
});

describe('entity extraction', () => {
  it('uses sentence-case capitalisation when the headline is not Title Case', () => {
    expect(extractEntities('Why Nvidia is spending billions on OpenAI', undefined)).toEqual(expect.arrayContaining(['Nvidia', 'OpenAI']));
  });
  it('ignores a capitalised first word that is just the start of a sentence', () => {
    expect(extractEntities('Honestly this changed my mind', undefined)).toEqual([]);
  });
});

describe('query generation', () => {
  it('produces several distinct, bounded queries rather than the raw title', () => {
    const ctx = yt('How AI Agents Will Change Software Development', { keywords: ['ai agents', 'software development'] });
    const qs = generateQueries(ctx);
    expect(qs.length).toBeGreaterThanOrEqual(3);
    expect(qs.length).toBeLessThanOrEqual(5);
    expect(qs[0]!.text).toContain('AI agents');
    expect(new Set(qs.map((q) => q.text.toLowerCase())).size).toBe(qs.length);
    expect(qs.every((q) => q.text.length <= 110)).toBe(true);
    // ordered by importance
    expect(qs.map((q) => q.weight)).toEqual([...qs.map((q) => q.weight)].sort((a, b) => b - a));
  });

  it('uses the headline for Reddit threads (the headline *is* the topic)', () => {
    const ctx = buildContext({ platform: 'reddit', kind: 'thread', url: 'https://www.reddit.com/r/technology/comments/abc/x/', title: 'Congress Has Another Site-Blocking Bill, And This One Targets VPNs', subreddit: 'technology', source: 't', confidence: 'high' });
    expect(generateQueries(ctx)[0]!.text).toContain('Site-Blocking Bill');
  });

  it('puts AI-proposed queries first when the AI layer supplied them', () => {
    const ctx = { ...yt('Some video about agents'), aiQueries: ['agentic software engineering essays', 'autonomous coding tools critique'] };
    expect(generateQueries(ctx)[0]!.text).toBe('agentic software engineering essays');
  });

  it('never emits a query for a lone vague word', () => {
    const ctx = buildContext({ platform: 'youtube', kind: 'short', url: 'https://www.youtube.com/shorts/abcde', title: 'This is how a black hole actually forms', source: 't', confidence: 'medium' });
    expect(generateQueries(ctx).map((q) => q.text)).not.toContain('forms');
  });
});

describe('Reddit queries for what is playing', () => {
  const nf = (extra: Partial<RawPageMetadata>) =>
    buildContext({ platform: 'netflix', kind: 'episode', url: 'https://www.netflix.com/watch/1', title: 'Black Mirror', source: 'test', confidence: 'high', ...extra });

  it('searches a series by name and episode — the way Reddit titles its discussion threads', () => {
    const q = generateRedditQueries(nf({ episode: 'Season 7, Episode 2 — Common People', genres: ['Sci-Fi'], people: ['Charlie Brooker'] }));
    expect(q).toEqual(['"Black Mirror" "Common People"', '"Black Mirror"', '"Black Mirror" season 7']);
  });

  it('understands the compact S7:E2 label too', () => {
    expect(generateRedditQueries(nf({ episode: 'S7:E2 · Common People' }))[0]).toBe('"Black Mirror" "Common People"');
  });

  it('searches a film by its name', () => {
    const q = generateRedditQueries(nf({ kind: 'movie', title: 'Dune: Part Two', genres: ['Sci-Fi'] }));
    expect(q[0]).toMatch(/^"Dune/);
    expect(q.some((x) => /movie$/.test(x))).toBe(true);
  });

  it('leads with a video’s headline and sends only words — never the URL or video id', () => {
    const q = generateRedditQueries(yt('How AI Agents Will Change Software Development', { keywords: ['ai agents', 'software development'], videoId: 'dQw4w9WgXcQ' }));
    expect(q[0]).toBe('How AI Agents Will Change Software Development');
    expect(q.length).toBeGreaterThan(1);
    expect(q.length).toBeLessThanOrEqual(3);
    expect(q.join(' ')).not.toMatch(/youtube|watch|dQw4w9WgXcQ|https?:/i);
  });
});
