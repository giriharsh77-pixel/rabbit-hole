import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/services/cacheService';
import { SecretsService } from '../src/services/secretsService';
import { DEFAULT_SETTINGS, mergeSettings, SettingsService, validateSettings } from '../src/services/settingsService';
import { canonicalizeUrl, cleanText, maskSecret, safeImageUrl, safeRedditUrl, safeUrl, sanitizePublicationSlug, sanitizeSubreddit, sanitizeSubredditList } from '../src/utils/sanitize';
import { contentStems, decodeEntities, displayPhrase, phraseKey, stem, stripHtml, truncate } from '../src/utils/text';
import { clampInt, formatCount, timeAgo } from '../src/utils/format';

describe('settings validation', () => {
  it('fills defaults and clamps hostile or corrupt values', () => {
    const s = validateSettings({
      appearance: { theme: 'neon' },
      reddit: { postCount: 9999, refreshIntervalMinutes: 1, preferredSubreddits: ['r/rust', 'rust', 'not valid!', '/r/golang/', 42], defaultTopic: '../../etc' },
      reading: { recommendationCount: -4, minRelevance: 500, preferredTopics: ['  AI  ', 'ai', '', 7], extraPublications: ['https://importai.substack.com', 'BAD SLUG', 'x'] },
      privacy: { detectionEnabled: 'yes' },
    });
    expect(s.appearance.theme).toBe('dark');
    expect(s.reddit.postCount).toBe(50);
    expect(s.reddit.refreshIntervalMinutes).toBe(2); // never polls faster than every 2 minutes
    expect(s.reddit.preferredSubreddits).toEqual(['rust', 'golang']);
    expect(s.reddit.defaultTopic).toBe(DEFAULT_SETTINGS.reddit.defaultTopic);
    expect(s.reading.recommendationCount).toBe(5);
    expect(s.reading.minRelevance).toBe(90);
    expect(s.reading.preferredTopics).toEqual(['AI']);
    expect(s.reading.extraPublications).toEqual(['importai']);
    expect(s.privacy.detectionEnabled).toBe(true);
  });

  it('keeps 0 to mean "refresh off"', () => {
    expect(validateSettings({ reddit: { refreshIntervalMinutes: 0 } }).reddit.refreshIntervalMinutes).toBe(0);
  });

  it('ships privacy-first defaults: dark, NSFW off, anonymous Reddit, AI off', () => {
    expect(DEFAULT_SETTINGS.appearance.theme).toBe('dark');
    expect(DEFAULT_SETTINGS.reddit.includeNsfw).toBe(false);
    expect(DEFAULT_SETTINGS.reddit.useBrowserSession).toBe(false);
    expect(DEFAULT_SETTINGS.privacy.aiEnabled).toBe(false);
    expect(DEFAULT_SETTINGS.reading.includeCustomDomains).toBe(false);
  });

  it('merges partial updates without losing siblings', () => {
    const next = mergeSettings(DEFAULT_SETTINGS, { privacy: { youtubeDetection: false }, reddit: { postCount: 30 } });
    expect(next.privacy).toMatchObject({ youtubeDetection: false, netflixDetection: true, detectionEnabled: true });
    expect(next.reddit.postCount).toBe(30);
    expect(next.reddit.showThumbnails).toBe(true);
  });

  it('persists, reloads and resets', async () => {
    const store = new MemoryStore();
    const a = new SettingsService(store);
    await a.update({ appearance: { theme: 'light' } });
    expect((await new SettingsService(store).get()).appearance.theme).toBe('light');
    expect((await a.reset()).appearance.theme).toBe('dark');
  });

  it('survives a corrupted store', async () => {
    const store = new MemoryStore();
    await store.setMany({ 'rh.settings': 'garbage' });
    expect(await new SettingsService(store).get()).toEqual(DEFAULT_SETTINGS);
  });
});

describe('secrets', () => {
  it('never exposes values: only a masked status', async () => {
    const svc = new SecretsService(new MemoryStore(), {});
    const status = await svc.set('braveApiKey', 'BSA1234567890abcdef');
    expect(status.braveApiKey).toEqual({ configured: true, masked: '••••cdef', origin: 'user' });
    expect(JSON.stringify(status)).not.toContain('BSA1234567890');
    expect(await svc.get('braveApiKey')).toBe('BSA1234567890abcdef'); // background-only accessor
  });

  it('rejects malformed keys and whitespace/header-injection attempts', async () => {
    const svc = new SecretsService(new MemoryStore(), {});
    await expect(svc.set('braveApiKey', 'short')).rejects.toThrow();
    await expect(svc.set('anthropicApiKey', 'sk-ant-abc\nx-evil: 1')).rejects.toThrow();
    await expect(svc.set('braveApiKey', 'has space in it')).rejects.toThrow();
  });

  it('prefers the user’s key over a build-time one, and can remove it', async () => {
    const svc = new SecretsService(new MemoryStore(), { braveApiKey: 'BUILD_KEY_12345' });
    expect((await svc.status()).braveApiKey.origin).toBe('build');
    await svc.set('braveApiKey', 'USER_KEY_123456');
    expect(await svc.get('braveApiKey')).toBe('USER_KEY_123456');
    await svc.clear('braveApiKey');
    expect(await svc.get('braveApiKey')).toBe('BUILD_KEY_12345');
  });

  it('wipes everything', async () => {
    const store = new MemoryStore();
    const svc = new SecretsService(store, {});
    await svc.set('anthropicApiKey', 'sk-ant-abcdefghij');
    await svc.clearAll();
    expect((await svc.status()).anthropicApiKey.configured).toBe(false);
    expect(store.data.size).toBe(0);
  });

  it('masks short values entirely', () => {
    expect(maskSecret('abc')).toBe('••••');
  });
});

describe('sanitising untrusted input', () => {
  it('cleans control characters, bidi overrides and excess whitespace', () => {
    expect(cleanText('he\u0000llo\u202Eevil  \n\n world')).toBe('helloevil\n\nworld');
    expect(cleanText(42)).toBe('');
    expect(cleanText('x'.repeat(1000), 50).length).toBeLessThanOrEqual(50);
  });

  it('only accepts https URLs on allow-listed hosts and refuses credential tricks', () => {
    expect(safeUrl('https://example.com/a')).toBe('https://example.com/a');
    expect(safeUrl('http://example.com/a')).toBeUndefined();
    expect(safeUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeUrl('data:text/html,<script>1</script>')).toBeUndefined();
    expect(safeUrl('https://reddit.com@evil.example/')).toBeUndefined();
    expect(safeUrl('//evil.example')).toBeUndefined();
    expect(safeUrl('http://localhost:8787/x', { allowHttp: true })).toBeDefined();
    expect(safeRedditUrl('https://www.reddit.com/r/x/')).toBeDefined();
    expect(safeRedditUrl('https://reddit.com.evil.example/r/x/')).toBeUndefined();
    expect(safeRedditUrl('https://notreddit.com/')).toBeUndefined();
    expect(safeImageUrl('https://preview.redd.it/a.png')).toBeDefined();
    expect(safeImageUrl('https://evil.example/a.png')).toBeUndefined();
  });

  it('canonicalises URLs by dropping tracking noise', () => {
    expect(canonicalizeUrl('https://X.substack.com/p/post/?utm_source=a&utm_medium=b&r=9&keep=1#frag')).toBe('https://x.substack.com/p/post?keep=1');
  });

  it('validates subreddit names and Substack slugs', () => {
    expect(sanitizeSubreddit('r/MachineLearning')).toBe('MachineLearning');
    expect(sanitizeSubreddit('a')).toBeUndefined();
    expect(sanitizeSubreddit('drop table;')).toBeUndefined();
    expect(sanitizeSubredditList(['rust', 'Rust', 'go'], 5)).toEqual(['rust', 'go']);
    expect(sanitizePublicationSlug('https://importai.substack.com/p/x')).toBe('importai');
    expect(sanitizePublicationSlug('Not A Slug')).toBeUndefined();
  });

  it('turns HTML into inert text', () => {
    const dirty = '<p>Hi <script>alert(1)</script><b>there</b>.</p><img src=x onerror=alert(1)><style>p{}</style>&lt;b&gt; &amp; &#8212; &#x1F600;';
    const clean = stripHtml(dirty);
    expect(clean).not.toMatch(/script|alert|onerror|style/);
    expect(clean).toContain('Hi there.');
    expect(clean).toContain('—');
    expect(decodeEntities('&nbsp;&bogus;&#0;')).toBe(' &bogus; ');
  });
});

describe('text helpers', () => {
  it('stems consistently across inflections', () => {
    for (const [a, b] of [['agent', 'agents'], ['develop', 'developers'], ['coding', 'code'], ['automate', 'automation'], ['startup', 'startups'], ['company', 'companies'], ['program', 'programming']] as const) {
      expect(stem(a)).toBe(stem(b));
    }
    expect(stem('ai')).toBe('ai');
  });

  it('builds comparable phrase keys', () => {
    expect(phraseKey('AI Agents')).toBe(phraseKey('ai agent'));
    expect(contentStems('The Rise of AI agents')).not.toContain('the');
  });

  it('formats display phrases and truncates on word boundaries', () => {
    expect(displayPhrase('ai agents')).toBe('AI agents');
    expect(displayPhrase('openai models')).toBe('OpenAI models');
    expect(truncate('The quick brown fox jumps over the lazy dog', 20)).toMatch(/…$/);
    expect(truncate('short', 20)).toBe('short');
  });

  it('formats counts and times for the cards', () => {
    expect(formatCount(12400)).toBe('12.4K');
    expect(formatCount(2100)).toBe('2.1K');
    expect(formatCount(999)).toBe('999');
    expect(formatCount(1_250_000)).toBe('1.3M');
    expect(formatCount(undefined)).toBe('—');
    const now = Date.UTC(2026, 9, 7, 12);
    expect(timeAgo(now - 5 * 60_000, now)).toBe('5m ago');
    expect(timeAgo((now - 3 * 3600_000) / 1000, now)).toBe('3h ago');
    expect(timeAgo(now - 40_000, now)).toBe('just now');
    expect(clampInt('abc', 1, 5, 3)).toBe(3);
  });
});
