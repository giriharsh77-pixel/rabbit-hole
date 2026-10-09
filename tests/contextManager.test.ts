import { describe, expect, it, vi } from 'vitest';
import { createServices } from '../src/background/container';
import { ContextManager } from '../src/background/contextManager';
import type { TabAdapter, TabInfo } from '../src/background/tabs';
import { badgeFor } from '../src/background/tabs';
import { MemoryStore } from '../src/services/cacheService';
import type { RawPageMetadata } from '../src/types/context';
import { AppError } from '../src/utils/errors';
import { mockFetch } from './helpers';

const youtube: RawPageMetadata = { platform: 'youtube', kind: 'video', url: 'https://www.youtube.com/watch?v=abc123XYZ', title: 'How AI Agents Will Change Software Development', creator: 'Fireship', source: 'visible video title', confidence: 'high' };

function setup(tab: TabInfo | undefined, extract: RawPageMetadata | null | Error = youtube) {
  const services = createServices({ local: new MemoryStore(), session: new MemoryStore(), fetchImpl: mockFetch() });
  const extractFn = vi.fn(async () => {
    if (extract instanceof Error) throw extract;
    return extract;
  });
  const tabs: TabAdapter = {
    resolve: async () => tab,
    extract: extractFn,
    extractGeneric: vi.fn(async () => ({ platform: 'unknown', kind: 'page', url: tab?.url ?? '', title: 'A page', source: 'page metadata', confidence: 'high' }) as RawPageMetadata),
  };
  return { services, tabs, extractFn, mgr: new ContextManager({ services, tabs }) };
}

const YT_TAB = { id: 7, url: youtube.url };

describe('current page context', () => {
  it('reads a YouTube watch page and explains what it used', async () => {
    const { mgr } = setup(YT_TAB);
    const r = await mgr.current({});
    expect(r.state).toBe('ready');
    expect(r.context).toMatchObject({ platform: 'youtube', creator: 'Fireship' });
    expect(r.used.map((u) => u.label)).toEqual(expect.arrayContaining(['Title', 'Sent to search']));
  });

  it('caches per tab until the tab navigates', async () => {
    const { mgr, extractFn } = setup(YT_TAB);
    await mgr.current({});
    await mgr.current({});
    expect(extractFn).toHaveBeenCalledTimes(1);
    await mgr.invalidate(7);
    await mgr.current({});
    expect(extractFn).toHaveBeenCalledTimes(2);
    await mgr.current({ refresh: true });
    expect(extractFn).toHaveBeenCalledTimes(3);
  });

  it('never reads an unsupported site automatically — only offers to', async () => {
    const { mgr, extractFn } = setup({ id: 1, url: 'https://bank.example/account' });
    const r = await mgr.current({});
    expect(r).toMatchObject({ state: 'idle', canUsePage: true });
    expect(extractFn).not.toHaveBeenCalled();
  });

  it('does not offer "use this page" when opened from the dashboard tab', async () => {
    const { mgr } = setup({ id: 1, url: 'https://example.com/' });
    expect((await mgr.current({ tabId: 1 })).canUsePage).toBe(false);
  });

  it('respects the privacy switches, per platform and globally', async () => {
    const { mgr, services, extractFn } = setup(YT_TAB);
    await services.settings.update({ privacy: { youtubeDetection: false } });
    expect(await mgr.current({})).toMatchObject({ state: 'disabled', platform: 'youtube' });
    await services.settings.update({ privacy: { youtubeDetection: true, detectionEnabled: false } });
    expect((await mgr.current({})).state).toBe('disabled');
    expect(extractFn).not.toHaveBeenCalled();

    const n = setup({ id: 2, url: 'https://www.netflix.com/watch/80100172' });
    await n.services.settings.update({ privacy: { netflixDetection: false } });
    expect((await n.mgr.current({})).state).toBe('disabled');
  });

  it('reports "undetected" so the UI can offer manual search', async () => {
    const none = setup({ id: 2, url: 'https://www.netflix.com/watch/80100172' }, null);
    expect(await none.mgr.current({})).toMatchObject({ state: 'undetected', platform: 'netflix', reason: expect.stringContaining("couldn't automatically identify") });

    const blocked = setup(YT_TAB, new AppError('PERMISSION', 'nope'));
    expect((await blocked.mgr.current({})).state).toBe('undetected');
  });

  it('handles "no tab" and non-watch pages on supported sites', async () => {
    expect((await setup(undefined).mgr.current({})).state).toBe('no-tab');
    expect((await setup({ id: 3, url: 'https://www.youtube.com/' }).mgr.current({})).state).toBe('idle');
  });

  it('recognises Reddit threads and Substack articles for the cross-links', async () => {
    const thread: RawPageMetadata = { platform: 'reddit', kind: 'thread', url: 'https://www.reddit.com/r/technology/comments/abc/x/', title: 'A VPN story', subreddit: 'technology', source: 'thread title', confidence: 'high' };
    const r = await setup({ id: 4, url: thread.url }, thread).mgr.current({});
    expect(r).toMatchObject({ state: 'ready', platform: 'reddit', context: { kind: 'thread', subreddit: 'technology' } });
  });

  it('reads an arbitrary page only on explicit request', async () => {
    const { mgr, tabs } = setup({ id: 5, url: 'https://example.com/post' });
    const r = await mgr.usePage({});
    expect(tabs.extractGeneric).toHaveBeenCalledOnce();
    expect(r).toMatchObject({ state: 'ready', context: { title: 'A page' } });
  });
});

describe('toolbar badge', () => {
  it('shows only on watch pages with detection enabled for that platform', () => {
    const on = { youtube: true, netflix: true };
    expect(badgeFor('https://www.youtube.com/watch?v=abc', on)).toBe(true);
    expect(badgeFor('https://www.youtube.com/', on)).toBe(false);
    expect(badgeFor('https://www.youtube.com/watch?v=abc', { ...on, youtube: false })).toBe(false);
    expect(badgeFor('https://www.netflix.com/watch/1', on)).toBe(true);
    expect(badgeFor('https://example.com/', on)).toBe(false);
    expect(badgeFor(undefined, on)).toBe(false);
  });
});
