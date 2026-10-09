import { describe, expect, it } from 'vitest';
import { detectPlatform, isAutoDetectable } from '../src/services/context/platform';

describe('platform detection', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube', 'video', true],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube', 'video', true],
    ['https://www.youtube.com/shorts/abcDEF12345', 'youtube', 'short', true],
    ['https://www.youtube.com/live/abcDEF12345', 'youtube', 'video', true],
    ['https://youtu.be/dQw4w9WgXcQ', 'youtube', 'video', true],
    ['https://www.youtube.com/', 'youtube', 'page', false],
    ['https://www.youtube.com/results?search_query=x', 'youtube', 'page', false],
    ['https://www.youtube.com/watch', 'youtube', 'page', false],
    ['https://www.netflix.com/watch/80100172', 'netflix', 'show', true],
    ['https://www.netflix.com/title/70264888', 'netflix', 'show', false],
    ['https://www.netflix.com/browse', 'netflix', 'page', false],
  ] as const)('%s → %s/%s (watch=%s)', (url, platform, kind, watch) => {
    expect(detectPlatform(url)).toMatchObject({ platform, kind, isWatchPage: watch });
  });

  it('recognises Reddit threads and Substack articles as bridge points', () => {
    expect(detectPlatform('https://www.reddit.com/r/technology/comments/abc123/some_title/')).toMatchObject({ platform: 'reddit', kind: 'thread', bridge: 'reddit-thread' });
    expect(detectPlatform('https://www.reddit.com/r/technology/')).toMatchObject({ platform: 'reddit', bridge: null });
    expect(detectPlatform('https://importai.substack.com/p/import-ai-472')).toMatchObject({ platform: 'substack', kind: 'article', bridge: 'substack-article' });
    expect(detectPlatform('https://open.substack.com/pub/importai/p/x')).toMatchObject({ bridge: 'substack-article' });
    expect(detectPlatform('https://importai.substack.com/archive')).toMatchObject({ platform: 'substack', bridge: null });
  });

  it('does not mistake look-alike hosts', () => {
    expect(detectPlatform('https://youtube.com.evil.example/watch?v=abc').platform).toBe('unknown');
    expect(detectPlatform('https://notnetflix.com/watch/1').platform).toBe('unknown');
    expect(detectPlatform('https://example.com/').platform).toBe('unknown');
  });

  it('is safe on junk input', () => {
    expect(detectPlatform(undefined).platform).toBe('unknown');
    expect(detectPlatform('not a url').platform).toBe('unknown');
    expect(detectPlatform('chrome://extensions').platform).toBe('unknown');
    expect(detectPlatform('javascript:alert(1)').platform).toBe('unknown');
  });

  it('only auto-reads the supported platforms', () => {
    expect(isAutoDetectable('youtube')).toBe(true);
    expect(isAutoDetectable('netflix')).toBe(true);
    expect(isAutoDetectable('unknown')).toBe(false);
    expect(isAutoDetectable('manual')).toBe(false);
  });
});
