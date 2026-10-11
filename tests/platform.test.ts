import { describe, expect, it } from 'vitest';
import { detectPlatform, isAutoDetectable } from '../src/services/context/platform';

describe('platform detection (Netflix only)', () => {
  it.each([
    ['https://www.netflix.com/watch/80100172', 'netflix', 'show', true],
    ['https://www.netflix.com/title/70264888', 'netflix', 'show', false],
    ['https://www.netflix.com/browse', 'netflix', 'page', false],
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'unknown', 'page', false],
    ['https://www.reddit.com/r/television/comments/abc123/x/', 'unknown', 'page', false],
    ['https://importai.substack.com/p/import-ai-472', 'unknown', 'page', false],
  ] as const)('%s → %s/%s (watch=%s)', (url, platform, kind, watch) => {
    expect(detectPlatform(url)).toMatchObject({ platform, kind, isWatchPage: watch });
  });

  it('does not mistake look-alike hosts', () => {
    expect(detectPlatform('https://netflix.com.evil.example/watch/1').platform).toBe('unknown');
    expect(detectPlatform('https://notnetflix.com/watch/1').platform).toBe('unknown');
    expect(detectPlatform('https://example.com/').platform).toBe('unknown');
  });

  it('is safe on junk input', () => {
    expect(detectPlatform(undefined).platform).toBe('unknown');
    expect(detectPlatform('not a url').platform).toBe('unknown');
    expect(detectPlatform('chrome://extensions').platform).toBe('unknown');
    expect(detectPlatform('javascript:alert(1)').platform).toBe('unknown');
  });

  it('only ever reads Netflix', () => {
    expect(isAutoDetectable('netflix')).toBe(true);
    for (const p of ['reddit', 'substack', 'manual', 'unknown'] as const) expect(isAutoDetectable(p)).toBe(false);
  });
});
