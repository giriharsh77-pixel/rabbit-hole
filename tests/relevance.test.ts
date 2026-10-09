import { describe, expect, it } from 'vitest';
import { buildContext, manualContext } from '../src/services/contextService';
import {
  diversify,
  explainRelevance,
  labelFor,
  LABEL_THRESHOLDS,
  rankArticles,
  recencyScore,
  RELEVANCE_WEIGHTS,
  scoreCandidate,
  sourceQualityScore,
} from '../src/services/rankingService';
import type { ArticleCandidate } from '../src/types/substack';
import { NOW } from './helpers';

const iso = (daysAgo: number) => new Date(NOW - daysAgo * 86_400_000).toISOString();

function article(over: Partial<ArticleCandidate> & { id: string; title: string }): ArticleCandidate {
  return {
    url: `https://pub.substack.com/p/${over.id}`,
    excerpt: '',
    publicationName: 'Some Publication',
    source: 'feed',
    provider: 'feeds',
    matchedQueries: [],
    ...over,
  };
}

const video = buildContext({
  platform: 'youtube',
  kind: 'video',
  url: 'https://www.youtube.com/watch?v=x',
  title: 'How AI Agents Will Change Software Development',
  creator: 'Fireship',
  keywords: ['ai agents', 'software development', 'ai coding', 'developer tools'],
  source: 't',
  confidence: 'high',
});

const onTopic = article({
  id: 'on',
  title: 'Why AI Agents Are Different This Time',
  excerpt: 'A deep dive into how autonomous coding agents are changing software development and developer tools.',
  publishedAt: iso(5),
  publicationTier: 3,
});
const offTopic = article({
  id: 'off',
  title: 'The Surprising Economics of Sourdough',
  excerpt: 'Flour prices, hydration and why your starter keeps dying.',
  publishedAt: iso(2),
  publicationTier: 3,
});

describe('relevance formula', () => {
  it('uses the specified weights, summing to 1', () => {
    expect(RELEVANCE_WEIGHTS).toEqual({ semantic: 0.45, keyword: 0.2, entity: 0.15, recency: 0.1, sourceQuality: 0.1 });
    expect(Object.values(RELEVANCE_WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });

  it('always lands in 0–100 with every term in 0–1', () => {
    for (const a of [onTopic, offTopic, article({ id: 'x', title: '' + 'a'.repeat(5) })]) {
      const r = scoreCandidate(video, a, { now: NOW });
      expect(r.relevanceScore).toBeGreaterThanOrEqual(0);
      expect(r.relevanceScore).toBeLessThanOrEqual(100);
      for (const v of Object.values(r.breakdown)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('scores an on-topic article far above an unrelated one', () => {
    const on = scoreCandidate(video, onTopic, { now: NOW });
    const off = scoreCandidate(video, offTopic, { now: NOW });
    expect(on.relevanceScore).toBeGreaterThanOrEqual(LABEL_THRESHOLDS.very);
    expect(['highly-relevant', 'very-relevant']).toContain(on.label);
    expect(off.relevanceScore).toBeLessThan(LABEL_THRESHOLDS.related);
    expect(off.label).toBe('somewhat-related');
  });

  it('lets a perfect match reach the top even when the content has no named entities', () => {
    const noEntities = manualContext('AI agents');
    expect(noEntities.entities).toEqual([]);
    const r = scoreCandidate(noEntities, article({ id: 'p', title: 'AI agents', excerpt: 'AI agents, autonomous agents and AI automation for developer tools.', publishedAt: iso(1), publicationTier: 3 }), { now: NOW });
    expect(r.relevanceScore).toBeGreaterThanOrEqual(85);
    expect(r.label).toBe('highly-relevant');
  });

  it('matches through related concepts, not just shared words', () => {
    // never says "AI agents" or "software", but is squarely about AI coding / developer tools
    const related = article({ id: 'rel', title: 'Cursor and the end of the IDE', excerpt: 'AI coding assistants and developer tools are reshaping how programmers work.', publishedAt: iso(3) });
    const r = scoreCandidate(video, related, { now: NOW });
    expect(r.relevanceScore).toBeGreaterThan(scoreCandidate(video, offTopic, { now: NOW }).relevanceScore + 15);
  });
});

describe('individual terms', () => {
  it('prefers recent articles and never fabricates a date', () => {
    expect(recencyScore(iso(1), NOW)).toBeGreaterThan(recencyScore(iso(200), NOW));
    expect(recencyScore(iso(3000), NOW)).toBeGreaterThanOrEqual(0.05);
    expect(recencyScore(undefined, NOW)).toBe(0.35); // neutral
    expect(recencyScore('not a date', NOW)).toBe(0.35);
  });

  it('rewards reputable and well-ranked sources but stays bounded', () => {
    const base = article({ id: 'q', title: 'x' });
    expect(sourceQualityScore({ ...base, publicationTier: 3 })).toBeGreaterThan(sourceQualityScore({ ...base, publicationTier: 1 }));
    expect(sourceQualityScore({ ...base, searchRank: 0 })).toBeGreaterThan(sourceQualityScore({ ...base, searchRank: 9 }));
    expect(sourceQualityScore({ ...base, publicationTier: 3, searchRank: 0, authorName: 'A', publishedAt: iso(1), engagement: { likes: 1e6, comments: 1e6 } })).toBeLessThanOrEqual(1);
  });

  it('does not let a publication’s topic tags inflate article relevance', () => {
    const plain = scoreCandidate(video, offTopic, { now: NOW });
    const tagged = scoreCandidate(video, { ...offTopic, tags: ['ai agents', 'software development', 'developer tools'] }, { now: NOW });
    expect(tagged.relevanceScore).toBe(plain.relevanceScore);
  });
});

describe('labels', () => {
  it('maps scores to the four labels', () => {
    expect(labelFor(90)).toBe('highly-relevant');
    expect(labelFor(LABEL_THRESHOLDS.highly)).toBe('highly-relevant');
    expect(labelFor(60)).toBe('very-relevant');
    expect(labelFor(40)).toBe('related');
    expect(labelFor(10)).toBe('somewhat-related');
  });

  it('never calls something "Highly relevant" on source quality + recency alone', () => {
    // high score but no content overlap
    expect(labelFor(80, { semantic: 0.1, keyword: 0, entity: 0, recency: 1, sourceQuality: 1 })).not.toBe('highly-relevant');
    expect(labelFor(80, { semantic: 0.9, keyword: 0.6, entity: 0, recency: 1, sourceQuality: 1 })).toBe('highly-relevant');
  });
});

describe('explanations', () => {
  it('explains *why*, naming what actually matched', () => {
    const r = scoreCandidate(video, onTopic, { now: NOW });
    expect(r.whyBy).toBe('heuristic');
    expect(r.why).toMatch(/AI agents/i);
    expect(r.why).toMatch(/video you're watching/);
    expect(r.matchedTopics.length).toBeGreaterThan(0);
  });

  it('adapts the wording to the source platform', () => {
    const show = buildContext({ platform: 'netflix', kind: 'episode', url: 'https://www.netflix.com/watch/1', title: 'Black Mirror', genres: ['Sci-Fi'], source: 't', confidence: 'high' });
    const a = article({ id: 'bm', title: 'Black Mirror and the surveillance state', excerpt: 'Dystopian fiction about technology and society.', publishedAt: iso(9) });
    expect(scoreCandidate(show, a, { now: NOW }).why).toMatch(/Black Mirror/);
    expect(scoreCandidate(manualContext('surveillance'), a, { now: NOW }).why).toMatch(/search for “surveillance”/);
  });

  it('is candid when the overlap is thin instead of inventing a connection', () => {
    expect(explainRelevance(video, { topics: [], entities: [], titleHit: false })).toMatch(/loose lead/);
  });

  it('prefers an AI explanation when the AI layer provided one', () => {
    const r = scoreCandidate(video, onTopic, { now: NOW, aiRelevance: new Map([[onTopic.id, { score: 0.95, why: 'Explains how coding agents change team workflows.' }]]) });
    expect(r.why).toBe('Explains how coding agents change team workflows.');
    expect(r.whyBy).toBe('ai');
  });

  it('lets the AI layer both raise and lower the semantic term', () => {
    const borderline = article({ id: 'b', title: 'Notes on tooling', excerpt: 'Some thoughts about developer tools.', publishedAt: iso(4) });
    const base = scoreCandidate(video, borderline, { now: NOW }).breakdown.semantic;
    const up = scoreCandidate(video, borderline, { now: NOW, aiRelevance: new Map([['b', { score: 1 }]]) }).breakdown.semantic;
    const down = scoreCandidate(video, borderline, { now: NOW, aiRelevance: new Map([['b', { score: 0 }]]) }).breakdown.semantic;
    expect(up).toBeGreaterThan(base);
    expect(down).toBeLessThan(base);
    expect(up).toBeLessThanOrEqual(1);
  });
});

describe('ranking & diversity', () => {
  it('orders by relevance and applies the minimum', () => {
    const ranked = rankArticles(video, [offTopic, onTopic], { now: NOW, minRelevance: 40 });
    expect(ranked.map((a) => a.id)).toEqual(['on']);
    expect(rankArticles(video, [offTopic, onTopic], { now: NOW }).map((a) => a.id)).toEqual(['on', 'off']);
  });

  it('stops one publication from filling the list', () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      article({ id: `same${i}`, title: `AI agents and software development part ${i}`, excerpt: 'developer tools and AI coding', publishedAt: iso(1 + i), publicationName: 'Prolific Newsletter' }),
    );
    const other = article({ id: 'other', title: 'AI agents in practice', excerpt: 'software development with AI coding', publishedAt: iso(30), publicationName: 'Another One' });
    const out = rankArticles(video, [...many, other], { now: NOW });
    expect(out.filter((a) => a.publicationName === 'Prolific Newsletter')).toHaveLength(2);
    expect(out.map((a) => a.id)).toContain('other');
  });

  it('diversify penalises repeats but keeps strong ones competitive', () => {
    const mk = (id: string, pub: string, score: number) => ({ ...scoreCandidate(video, article({ id, title: id, publicationName: pub }), { now: NOW }), relevanceScore: score });
    const out = diversify([mk('a1', 'A', 90), mk('a2', 'A', 88), mk('b1', 'B', 80)], { maxPerPublication: 5, penalty: 6 });
    expect(out.map((x) => x.id)).toEqual(['a1', 'a2', 'b1']);
    const out2 = diversify([mk('a1', 'A', 90), mk('a2', 'A', 80), mk('b1', 'B', 79)], { maxPerPublication: 5, penalty: 6 });
    expect(out2.map((x) => x.id)).toEqual(['a1', 'b1', 'a2']);
  });
});
