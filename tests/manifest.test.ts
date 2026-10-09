import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain-JS module shared with the build script
import { createManifest, customFeedOrigins } from '../manifest.config.mjs';

type Manifest = ReturnType<typeof createManifest>;
const m: Manifest = createManifest();

describe('manifest (Manifest V3)', () => {
  it('is MV3 with a module service worker, popup and options page', () => {
    expect(m.manifest_version).toBe(3);
    expect(m.background).toEqual({ service_worker: 'background.js', type: 'module' });
    expect(m.action.default_popup).toBe('popup.html');
    expect(m.options_ui.page).toBe('options.html');
  });

  it('requests only the permissions that are genuinely needed', () => {
    expect([...m.permissions].sort()).toEqual(['activeTab', 'alarms', 'scripting', 'storage']);
    expect(m.permissions).not.toContain('tabs');
    expect(m.permissions).not.toContain('history');
    expect(m.permissions).not.toContain('webRequest');
  });

  it('never asks for broad host access', () => {
    const all = [...m.host_permissions, ...m.optional_host_permissions, ...m.content_scripts.flatMap((c: { matches: string[] }) => c.matches)];
    for (const pattern of all) {
      expect(pattern).not.toMatch(/<all_urls>|^\*:\/\/\*\/\*$|^https?:\/\/\*\/\*$/);
      expect(pattern.startsWith('https://') || pattern.startsWith('http://localhost')).toBe(true);
    }
  });

  it('only injects content scripts on the supported sites', () => {
    const matches = m.content_scripts.flatMap((c: { matches: string[] }) => c.matches).sort();
    expect(matches).toEqual(['https://*.substack.com/*', 'https://m.youtube.com/*', 'https://www.netflix.com/*', 'https://www.reddit.com/*', 'https://www.youtube.com/*']);
    for (const c of m.content_scripts) {
      expect(c.run_at).toBe('document_idle');
      expect(c.all_frames).toBeUndefined();
    }
    // every statically matched host is covered by a declared host permission
    for (const pattern of matches) expect(m.host_permissions).toContain(pattern);
  });

  it('puts API hosts and custom-domain feeds behind optional permissions', () => {
    expect(m.optional_host_permissions).toEqual(expect.arrayContaining(['https://api.search.brave.com/*', 'https://api.anthropic.com/*']));
    expect(m.host_permissions).not.toContain('https://api.anthropic.com/*');
    expect(customFeedOrigins().length).toBeGreaterThan(5);
    for (const o of customFeedOrigins()) expect(m.optional_host_permissions).toContain(o);
    for (const o of customFeedOrigins()) expect(o).not.toMatch(/substack\.com/);
  });

  it('has a strict CSP: no eval, no inline script, no remote script', () => {
    const csp = m.content_security_policy.extension_pages as string;
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toMatch(/unsafe-eval|unsafe-inline|https?:\/\/[^ ;]*(?=.*script-src)/);
    expect(csp.split(';').find((d: string) => d.trim().startsWith('script-src'))).toBe("script-src 'self'");
    expect(csp).toContain("object-src 'self'");
    expect(csp).toContain("base-uri 'none'");
  });

  it('adds the build-time backend origin to host permissions — and nothing broader', () => {
    const withBackend = createManifest({ backendUrl: 'https://api.example.workers.dev/some/path' });
    expect(withBackend.host_permissions).toContain('https://api.example.workers.dev/*');
    expect(withBackend.host_permissions.length).toBe(m.host_permissions.length + 1);
    expect(() => createManifest({ backendUrl: 'not a url' })).toThrow();
  });

  it('marks development builds distinctly', () => {
    expect(createManifest({ dev: true }).name).toContain('dev');
    expect(m.name).toBe('Rabbit Hole');
  });
});

// Runs only after `npm run build` has produced dist/.
const built = existsSync('dist/manifest.json');
describe.skipIf(!built)('built extension (dist/)', () => {
  const manifest = built ? (JSON.parse(readFileSync('dist/manifest.json', 'utf8')) as Manifest) : undefined;

  it('every file the manifest references exists', () => {
    const files = [
      manifest!.background.service_worker,
      manifest!.action.default_popup,
      manifest!.options_ui.page,
      ...Object.values(manifest!.icons as Record<string, string>),
      ...manifest!.content_scripts.flatMap((c: { js: string[] }) => c.js),
    ];
    for (const f of files) expect(existsSync(`dist/${f}`), f).toBe(true);
  });

  it('content scripts are self-contained (no module syntax)', () => {
    for (const c of manifest!.content_scripts) {
      for (const js of c.js) expect(readFileSync(`dist/${js}`, 'utf8')).not.toMatch(/^\s*(import|export)\s/m);
    }
  });

  it('contains no eval / Function-constructor / remote script tags in extension pages', () => {
    for (const html of ['dist/popup.html', 'dist/options.html']) {
      const text = readFileSync(html, 'utf8');
      expect(text).not.toMatch(/<script[^>]+src="https?:/);
      expect(text).not.toMatch(/<script(?![^>]*src)[^>]*>[^<]+<\/script>/); // no inline script bodies
    }
  });
});
