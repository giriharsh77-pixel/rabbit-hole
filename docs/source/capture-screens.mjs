#!/usr/bin/env node
/**
 * Captures the UI screens used by the project report and the Figma UI flow.
 *
 *   npm run dev:ui                                   # in one terminal (serves the preview harness)
 *   CHROME_PATH="<chrome for testing>" node docs/source/capture-screens.mjs
 *
 * Output: docs/screens/*.png  (480×600 popup screens at 2×, plus Settings / dashboard)
 *
 * Reddit threads are the neutral ILLUSTRATIVE sample set (?data=docs); Substack
 * articles come from real public RSS captured for the preview.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(root, 'docs', 'screens');
const BASE = process.env.PREVIEW_URL ?? 'http://127.0.0.1:5199';
const CHROME = process.env.CHROME_PATH;
if (!CHROME || !existsSync(CHROME)) {
  console.error('Set CHROME_PATH to Chrome for Testing / Chromium.');
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-first-run'] });
const manifest = [];

/** Run one capture in a fresh, isolated browser context (own localStorage). */
async function shot(name, title, { path, width = 480, height = 600, scale = 2, settings, before, after, element, clip }) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: scale });
  if (settings) {
    await page.evaluateOnNewDocument((s, theme) => {
      localStorage.setItem('rh-preview:rh.settings', JSON.stringify(s));
      if (theme) localStorage.setItem('rh-theme', theme);
    }, settings, settings.appearance?.theme);
  }
  await page.goto(`${BASE}/${path}`, { waitUntil: 'load' });
  await page.waitForSelector('#root > *', { timeout: 15000 });
  if (before) await before(page);
  await sleep(450);
  if (after) await after(page);
  const file = join(OUT, `${name}.png`);
  if (element) await (await page.$(element)).screenshot({ path: file });
  else await page.screenshot({ path: file, ...(clip ? { clip } : {}) });
  manifest.push({ file: `${name}.png`, title, path });
  console.log('✓', name);
  await ctx.close();
}

const found = (page, panel = '#rh-panel-reading') =>
  page.waitForFunction((p) => /Found \d+/.test(document.querySelector(`${p} .status-line`)?.innerText ?? ''), { timeout: 20000 }, panel);
const clickTab = (page, id) => page.click(`#rh-tab-${id}`);
const scrollPanel = (page, panel, selector, pad = 8) =>
  page.evaluate((p, sel, pad) => {
    const el = document.querySelector(`${p} ${sel}`);
    const panelEl = document.querySelector(p);
    if (el && panelEl) panelEl.scrollTop = el.offsetTop - pad;
  }, panel, selector, pad);
const D = 'data=docs';

// ── the popup, state by state ────────────────────────────────────────────────
await shot('01-reading-youtube', 'Related Reading — watching a YouTube video', {
  path: `popup.html?demo=youtube&${D}`,
  before: (p) => found(p),
});
await shot('02-article-why-relevant', 'Article card with “Why this is relevant”', {
  path: `popup.html?demo=youtube&${D}`,
  before: (p) => found(p),
  after: (p) => scrollPanel(p, '#rh-panel-reading', 'li.card', 10),
});
await shot('03-trending-watching', 'Trending Reddit — “Because you’re watching” + topic filters', {
  path: `popup.html?demo=youtube&${D}`,
  before: async (p) => {
    await found(p);
    await clickTab(p, 'reddit');
    await p.waitForSelector('#rh-panel-reddit li.card', { timeout: 20000 });
  },
});
await shot('04-trending-cards', 'Trending Reddit — thread cards with stats and growth', {
  path: `popup.html?demo=idle&${D}`,
  before: (p) => p.waitForSelector('#rh-panel-reddit li.card', { timeout: 20000 }),
  after: (p) => scrollPanel(p, '#rh-panel-reddit', '.segmented', 4),
});
await shot('05-trending-rising', 'Trending Reddit — Rising Fast section', {
  path: `popup.html?demo=idle&${D}`,
  before: async (p) => {
    await p.waitForSelector('#rh-panel-reddit li.card', { timeout: 20000 });
    await p.evaluate(() => document.querySelectorAll('.seg')[1].click());
    await sleep(500);
  },
  after: (p) => scrollPanel(p, '#rh-panel-reddit', '.segmented', 4),
});
await shot('06-netflix-detected', 'Related Reading — watching a Netflix episode', {
  path: `popup.html?demo=netflix&${D}`,
  before: (p) => p.waitForSelector('#rh-panel-reading .status-line strong, #rh-panel-reading .state', { timeout: 20000 }),
});
await shot('07-netflix-undetected', 'Netflix title not detected — manual fallback', {
  path: `popup.html?demo=undetected&${D}`,
  before: async (p) => {
    await p.waitForSelector('#rh-tab-reading');
    await sleep(1200);
    await clickTab(p, 'reading');
  },
});
await shot('08-idle-use-this-page', 'Other website — nothing read; “Use this page” offered', {
  path: `popup.html?demo=idle&${D}`,
  before: async (p) => {
    await p.waitForSelector('#rh-tab-reading');
    await sleep(1200);
    await clickTab(p, 'reading');
  },
});
const search = async (p, q) => {
  await p.waitForSelector('.search input');
  await p.type('.search input', q);
  await p.keyboard.press('Enter');
};
await shot('09-search-loading', 'Searching — skeleton loading state', {
  path: `popup.html?demo=idle&slow=4000&${D}`,
  before: async (p) => {
    await p.waitForSelector('#rh-tab-reading');
    await sleep(1000);
    await clickTab(p, 'reading');
    await search(p, 'AI agents');
  },
  after: () => undefined,
});
await shot('10-search-results', 'Manual search — “Exploring” results', {
  path: `popup.html?demo=idle&${D}`,
  before: async (p) => {
    await p.waitForSelector('#rh-tab-reading');
    await sleep(1000);
    await clickTab(p, 'reading');
    await search(p, 'AI agents');
    await found(p);
  },
});
await shot('11-search-reddit-results', 'Manual search — Reddit results', {
  path: `popup.html?demo=idle&${D}`,
  before: async (p) => {
    await p.waitForSelector('#rh-tab-reddit');
    await search(p, 'AI agents');
    await sleep(900);
    await p.waitForSelector('#rh-panel-reddit li.card, #rh-panel-reddit .state', { timeout: 20000 });
  },
});
await shot('12-bridge-reddit-thread', 'On a Reddit thread — “Find deeper reading →”', {
  path: `popup.html?demo=reddit&${D}`,
  before: async (p) => {
    await p.waitForSelector('#rh-tab-reading');
    await sleep(1200);
    await clickTab(p, 'reading');
  },
});
await shot('13-bridge-substack-article', 'On a Substack article — “See what Reddit thinks →”', {
  path: `popup.html?demo=substack&${D}`,
  before: (p) => p.waitForSelector('#rh-panel-reddit .bridge', { timeout: 20000 }),
});
await shot('14-detection-off', 'Detection switched off (privacy control)', {
  path: `popup.html?demo=youtube&${D}`,
  settings: { privacy: { youtubeDetection: false } },
  before: async (p) => {
    await p.waitForSelector('#rh-tab-reading');
    await sleep(1200);
    await clickTab(p, 'reading');
  },
});
await shot('15-error-reddit', 'Error state — Reddit unavailable', {
  path: `popup.html?demo=idle&fail=reddit&${D}`,
  before: (p) => p.waitForSelector('#rh-panel-reddit .state', { timeout: 20000 }),
});
await shot('16-light-theme', 'Light theme', {
  path: `popup.html?demo=youtube&${D}`,
  settings: { appearance: { theme: 'light' } },
  before: (p) => found(p),
});

await shot('21-bridge-thread-result', 'Reddit thread → related Substack reading', {
  path: `popup.html?demo=reddit&${D}`,
  before: async (p) => {
    await p.waitForSelector('#rh-tab-reading');
    await sleep(1200);
    await clickTab(p, 'reading');
    await p.waitForSelector('#rh-panel-reading .bridge .btn');
    await p.click('#rh-panel-reading .bridge .btn');
    await found(p);
  },
});
await shot('22-bridge-article-result', 'Substack article → what Reddit thinks', {
  path: `popup.html?demo=substack&${D}`,
  before: async (p) => {
    await p.waitForSelector('#rh-panel-reddit .bridge .btn');
    await p.click('#rh-panel-reddit .bridge .btn');
    await p.waitForSelector('#rh-panel-reddit li.card', { timeout: 20000 });
  },
});
await shot('23-use-this-page-result', '“Use this page” → related reading', {
  path: `popup.html?demo=idle&${D}`,
  before: async (p) => {
    await p.waitForSelector('#rh-tab-reading');
    await sleep(1200);
    await clickTab(p, 'reading');
    await p.waitForFunction(() => [...document.querySelectorAll('#rh-panel-reading .btn')].some((b) => /Use this page/.test(b.textContent)));
    await p.evaluate(() => [...document.querySelectorAll('#rh-panel-reading .btn')].find((b) => /Use this page/.test(b.textContent)).click());
    await p.waitForSelector('#rh-panel-reading .context-title', { timeout: 20000 });
    await p.waitForFunction(() => /Found \d+|No strong/.test(document.querySelector('#rh-panel-reading .status-line')?.innerText ?? ''), { timeout: 20000 });
  },
});

// ── Settings & dashboard ─────────────────────────────────────────────────────
await shot('17-settings-overview', 'Settings — Reddit & Related Reading', {
  path: 'options.html',
  width: 860,
  height: 1000,
  before: (p) => p.waitForSelector('.section'),
});
await shot('18-settings-privacy', 'Settings — Privacy', {
  path: 'options.html#privacy',
  width: 860,
  height: 1000,
  before: (p) => p.waitForSelector('#privacy'),
  element: '#privacy',
});
await shot('19-settings-integrations', 'Settings — API & Integrations', {
  path: 'options.html#integrations',
  width: 860,
  height: 1000,
  before: (p) => p.waitForSelector('#integrations'),
  element: '#integrations',
});
await shot('20-dashboard', 'Full dashboard (two columns)', {
  path: `popup.html?demo=youtube&mode=tab&${D}`,
  width: 1280,
  height: 800,
  scale: 1.5,
  before: async (p) => {
    await found(p);
    await p.waitForSelector('#rh-panel-reddit li.card', { timeout: 20000 });
  },
});

writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
await browser.close();
console.log(`\n${manifest.length} screens → ${OUT}`);
