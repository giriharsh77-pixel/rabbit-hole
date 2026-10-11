import { describe, expect, it, vi } from 'vitest';
import { createServices } from '../src/background/container';
import { ContextManager } from '../src/background/contextManager';
import type { TabAdapter, TabInfo } from '../src/background/tabs';
import { badgeFor } from '../src/background/tabs';
import { MemoryStore } from '../src/services/cacheService';
import type { RawPageMetadata } from '../src/types/context';
import { AppError } from '../src/utils/errors';
import { mockFetch } from './helpers';

const episode: RawPageMetadata = {
  platform: 'netflix',
  kind: 'episode',
  url: 'https://www.netflix.com/watch/80100172',
  title: 'The Office (U.S.)',
  episode: 'Season 1, Episode 5 — Basketball',
  season: 1,
  episodeNumber: 5,
  source: 'player title label',
  confidence: 'high',
};

function setup(tab: TabInfo | undefined, extract: RawPageMetadata | null | Error = episode) {
  const services = createServices({ local: new MemoryStore(), session: new MemoryStore(), fetchImpl: mockFetch() });
  const extractFn = vi.fn(async () => {
    if (extract instanceof Error) throw extract;
    return extract;
  });
  const tabs: TabAdapter = { resolve: async () => tab, extract: extractFn };
  return { services, tabs, extractFn, mgr: new ContextManager({ services, tabs }) };
}

const WATCH_TAB = { id: 7, url: episode.url };

describe('current page context (Netflix only)', () => {
  it('reads a Netflix episode and explains what it used', async () => {
    const { mgr } = setup(WATCH_TAB);
    const r = await mgr.current({});
    expect(r.state).toBe('ready');
    expect(r.context).toMatchObject({ platform: 'netflix', kind: 'episode', title: 'The Office' });
    expect(r.used.map((u) => u.label)).toEqual(expect.arrayContaining(['Title', 'Sent to search']));
  });

  it('caches per tab until the tab navigates', async () => {
    const { mgr, extractFn } = setup(WATCH_TAB);
    await mgr.current({});
    await mgr.current({});
    expect(extractFn).toHaveBeenCalledTimes(1);
    await mgr.invalidate(7);
    await mgr.current({});
    expect(extractFn).toHaveBeenCalledTimes(2);
    await mgr.current({ refresh: true });
    expect(extractFn).toHaveBeenCalledTimes(3);
  });

  it('never reads any other site — not YouTube, Reddit, Substack or anything else', async () => {
    for (const url of ['https://bank.example/account', 'https://www.youtube.com/watch?v=abc', 'https://www.reddit.com/r/television/comments/abc/x/', 'https://pub.substack.com/p/post']) {
      const { mgr, extractFn } = setup({ id: 1, url });
      expect(await mgr.current({})).toMatchObject({ state: 'idle' });
      expect(extractFn).not.toHaveBeenCalled();
    }
  });

  it('respects the privacy switches', async () => {
    const off = setup(WATCH_TAB);
    await off.services.settings.update({ privacy: { netflixDetection: false } });
    expect(await off.mgr.current({})).toMatchObject({ state: 'disabled', platform: 'netflix' });
    const master = setup(WATCH_TAB);
    await master.services.settings.update({ privacy: { detectionEnabled: false } });
    expect((await master.mgr.current({})).state).toBe('disabled');
    expect(off.extractFn).not.toHaveBeenCalled();
    expect(master.extractFn).not.toHaveBeenCalled();
  });

  it('reports "undetected" so the UI can offer the title search', async () => {
    const none = setup(WATCH_TAB, null);
    expect(await none.mgr.current({})).toMatchObject({ state: 'undetected', platform: 'netflix', reason: expect.stringContaining("couldn't automatically identify") });
    const blocked = setup(WATCH_TAB, new AppError('PERMISSION', 'nope'));
    expect((await blocked.mgr.current({})).state).toBe('undetected');
  });

  it('handles "no tab", the Netflix home page, and title pages', async () => {
    expect((await setup(undefined).mgr.current({})).state).toBe('no-tab');
    expect((await setup({ id: 3, url: 'https://www.netflix.com/browse' }).mgr.current({})).state).toBe('idle');
    const titlePage = setup({ id: 4, url: 'https://www.netflix.com/title/70136120' });
    expect((await titlePage.mgr.current({})).state).toBe('ready');
    expect(titlePage.extractFn).toHaveBeenCalledOnce();
  });
});

describe('toolbar badge', () => {
  it('shows only on Netflix watch pages, and only with detection on', () => {
    expect(badgeFor('https://www.netflix.com/watch/1', true)).toBe(true);
    expect(badgeFor('https://www.netflix.com/watch/1', false)).toBe(false);
    expect(badgeFor('https://www.netflix.com/browse', true)).toBe(false);
    expect(badgeFor('https://www.youtube.com/watch?v=abc', true)).toBe(false);
    expect(badgeFor(undefined, true)).toBe(false);
  });
});
