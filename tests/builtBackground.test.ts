import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { RPC_PORT_NAME } from '../src/types/messages';

/**
 * Boots the *built* service worker (dist/background.js) against a fake `chrome`
 * and talks to it over its RPC port, exactly like the popup does.  Catches
 * what unit tests cannot: bundling mistakes, import-time crashes (e.g. code
 * touching `window` in a worker), and listener-registration regressions.
 *
 * Runs only after `npm run build`.
 */
const dist = resolve('dist/background.js');

function fakeArea() {
  const data = new Map<string, unknown>();
  return {
    data,
    get: vi.fn(async (keys?: string | string[] | null) => {
      const list = keys === null || keys === undefined ? [...data.keys()] : Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(list.filter((k) => data.has(k)).map((k) => [k, structuredClone(data.get(k))]));
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(items)) data.set(k, structuredClone(v));
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      for (const k of Array.isArray(keys) ? keys : [keys]) data.delete(k);
    }),
    clear: vi.fn(async () => data.clear()),
    setAccessLevel: vi.fn(async () => undefined),
  };
}

const event = () => {
  const listeners: ((...a: unknown[]) => unknown)[] = [];
  return { addListener: (f: (...a: unknown[]) => unknown) => void listeners.push(f), listeners };
};

describe.skipIf(!existsSync(dist))('built service worker (dist/background.js)', () => {
  it('boots with no DOM, registers its listeners, and serves RPC', async () => {
    const ext = 'chrome-extension://testid/';
    const events = { onConnect: event(), onInstalled: event(), onStartup: event(), tabsActivated: event(), tabsUpdated: event(), tabsRemoved: event(), alarm: event(), storageChanged: event() };
    const local = fakeArea();
    const session = fakeArea();
    vi.stubGlobal('chrome', {
      runtime: { id: 'testid', getURL: (p: string) => `${ext}${p}`, getManifest: () => ({ version: '1.0.0' }), onConnect: events.onConnect, onInstalled: events.onInstalled, onStartup: events.onStartup },
      storage: { local, session, onChanged: events.storageChanged },
      tabs: { onActivated: events.tabsActivated, onUpdated: events.tabsUpdated, onRemoved: events.tabsRemoved, get: vi.fn(), query: vi.fn(async () => []) },
      alarms: { onAlarm: events.alarm, create: vi.fn(), clear: vi.fn() },
      action: { setBadgeText: vi.fn(), setBadgeBackgroundColor: vi.fn() },
      permissions: { contains: vi.fn(async () => false) },
      scripting: { executeScript: vi.fn() },
    });
    // a service worker has no window/document
    expect(typeof (globalThis as { window?: unknown }).window).toBe('undefined');

    await import(/* @vite-ignore */ pathToFileURL(dist).href);

    // top-level, synchronous listener registration (an MV3 requirement)
    for (const e of [events.onConnect, events.onInstalled, events.onStartup, events.tabsActivated, events.tabsUpdated, events.tabsRemoved, events.alarm, events.storageChanged]) {
      expect(e.listeners.length).toBeGreaterThan(0);
    }

    // connect like the popup does
    const sent: unknown[] = [];
    const messageListeners: ((m: unknown) => void)[] = [];
    const port = {
      name: RPC_PORT_NAME,
      sender: { url: `${ext}popup.html` },
      postMessage: (m: unknown) => void sent.push(m),
      onMessage: { addListener: (f: (m: unknown) => void) => void messageListeners.push(f) },
      onDisconnect: { addListener: vi.fn() },
      disconnect: vi.fn(),
    };
    events.onConnect.listeners.forEach((f) => f(port));
    expect(port.disconnect).not.toHaveBeenCalled();

    const ask = async (id: number, method: string, params?: unknown) => {
      messageListeners.forEach((f) => f({ kind: 'rpc', id, method, params }));
      await vi.waitFor(() => expect(sent.some((m) => (m as { id: number }).id === id)).toBe(true), { timeout: 3000 });
      return sent.find((m) => (m as { id: number }).id === id) as { ok: boolean; data?: Record<string, unknown>; error?: { code: string } };
    };

    const settings = await ask(1, 'settings/get');
    expect(settings.ok).toBe(true);
    expect(settings.data).toMatchObject({ appearance: { theme: 'dark' }, privacy: { detectionEnabled: true } });

    const updated = await ask(2, 'settings/update', { appearance: { theme: 'light' } });
    expect(updated.data).toMatchObject({ appearance: { theme: 'light' } });
    expect(local.data.get('rh.settings')).toMatchObject({ appearance: { theme: 'light' } });

    // secrets are write-only through the UI
    const secret = await ask(3, 'secrets/set', { name: 'braveApiKey', value: 'BSA_test_key_123456' });
    expect(JSON.stringify(secret)).not.toContain('BSA_test_key_123456');
    expect(secret.data).toMatchObject({ braveApiKey: { configured: true, masked: '••••3456' } });

    const status = await ask(4, 'status/get');
    expect(status.data).toMatchObject({ substack: { providers: ['brave', 'feeds'], limitedCoverage: false } });

    // a page that isn't ours gets nothing
    const evil = { ...port, sender: { url: 'https://evil.example/' }, disconnect: vi.fn() };
    events.onConnect.listeners.forEach((f) => f(evil));
    expect(evil.disconnect).toHaveBeenCalled();

    // clearing everything really clears
    await ask(5, 'data/clearAll');
    expect(local.clear).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
