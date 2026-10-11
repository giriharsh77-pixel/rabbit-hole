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
 * articles come from real public RSS captured for the preview, news articles
 * from real per-title feeds captured 2026-10-10 (?news=1), title facts from live
 * Wikidata.  Screens 11–12 use the preview's SAMPLE backend (?backend=demo):
 * their ratings, reviews and availability are placeholders.
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
async function shot(name, title, { path, width = 480, height = 600, scale = 2, settings, before, after, element, clip, clipFn }) {
  manifest.push({ file: `${name}.png`, title, path });
  // ONLY=01-discuss,07-about-cast re-captures just those screens
  if (process.env.ONLY && !process.env.ONLY.split(',').includes(name)) return;
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
  else if (clipFn) await page.screenshot({ path: file, clip: await clipFn(page), captureBeyondViewport: true });
  else await page.screenshot({ path: file, ...(clip ? { clip } : {}) });
  console.log('✓', name);
  await ctx.close();
}

const found = (page, panel = '#rh-panel-read') =>
  page.waitForFunction((p) => /Found \d+/.test(document.querySelector(`${p} .status-line`)?.innerText ?? ''), { timeout: 30000 }, panel);
const clickTab = (page, id) => page.click(`#rh-tab-${id}`);
const scrollPanel = (page, panel, selector, pad = 8) =>
  page.evaluate((p, sel, pad) => {
    const el = document.querySelector(`${p} ${sel}`);
    const panelEl = document.querySelector(p);
    if (el && panelEl) panelEl.scrollTop += el.getBoundingClientRect().top - panelEl.getBoundingClientRect().top - pad;
  }, panel, selector, pad);
/** Cards fade in; wait until they've settled. */
const settle = () => sleep(700);
const D = 'data=docs';
const NEWS = { reading: { includeNews: true } };
const threads = (p) => p.waitForSelector('#rh-panel-discuss li.card[aria-label] .btn', { timeout: 30000 });
const cast = (p) => p.waitForSelector('#rh-panel-about .cast-row', { timeout: 30000 });

// ── Discuss ──────────────────────────────────────────────────────────────────
await shot('01-discuss', 'Discuss — Reddit threads about the episode', {
  path: `popup.html?demo=office&${D}`,
  before: async (p) => {
    await threads(p);
    await settle();
  },
});
await shot('02-discuss-newest', 'Discuss — sorted newest first', {
  path: `popup.html?demo=office&${D}`,
  before: async (p) => {
    await threads(p);
    await p.evaluate(() => document.querySelectorAll('#rh-panel-discuss .sort-control .seg')[1].click());
    await sleep(600);
    await threads(p);
    await settle();
  },
});

// ── Read ─────────────────────────────────────────────────────────────────────
await shot('03-read-news', 'Read — news, Substack and Medium about the title', {
  path: `popup.html?demo=office&${D}&news=1`,
  settings: NEWS,
  before: async (p) => {
    await clickTab(p, 'read');
    await found(p);
    await settle();
  },
});
await shot('04-read-card', 'Read — article card with “Why this is relevant”', {
  path: `popup.html?demo=office&${D}&news=1`,
  settings: NEWS,
  before: async (p) => {
    await clickTab(p, 'read');
    await found(p);
    await settle();
  },
  after: (p) => scrollPanel(p, '#rh-panel-read', 'li.card', 10),
});
await shot('05-read-news-offer', 'Read — the one-time offer to add news sites', {
  path: `popup.html?demo=office&${D}`,
  before: async (p) => {
    await clickTab(p, 'read');
    await found(p);
    await settle();
  },
});

// ── About & Watch next (live Wikidata) ───────────────────────────────────────
await shot('06-about', 'About — facts and review links (Wikidata)', {
  path: `popup.html?demo=office&${D}`,
  before: async (p) => {
    await clickTab(p, 'about');
    await cast(p);
  },
});
await shot('07-about-cast', 'About — cast with X and Instagram', {
  path: `popup.html?demo=office&${D}`,
  before: async (p) => {
    await clickTab(p, 'about');
    await cast(p);
  },
  after: (p) => scrollPanel(p, '#rh-panel-about', '.cast-list', 40),
});
await shot('08-watch-next', 'Watch next — same cast and creators (Wikidata)', {
  path: `popup.html?demo=office&${D}`,
  before: async (p) => {
    await clickTab(p, 'next');
    await p.waitForSelector('#rh-panel-next li.next-card', { timeout: 60000 });
    await settle();
  },
});

// ── title search ─────────────────────────────────────────────────────────────
await shot('09-title-search', 'Title search — movies and series from Wikidata', {
  path: `popup.html?demo=idle&${D}`,
  before: async (p) => {
    await p.waitForSelector('.search input');
    await p.type('.search input', 'sacred ga');
    await p.waitForSelector('.title-list:not([hidden]) .title-option:not(.search-all)', { timeout: 30000 });
    await sleep(400);
  },
});
await shot('10-picked-title', 'A picked title — every tab follows it', {
  path: `popup.html?demo=idle&${D}`,
  before: async (p) => {
    await p.waitForSelector('.search input');
    await p.type('.search input', 'sacred ga');
    await p.waitForSelector('.title-list:not([hidden]) .title-option:not(.search-all)', { timeout: 30000 });
    await p.keyboard.press('Enter');
    await clickTab(p, 'about');
    await cast(p);
  },
});

// ── with the backend (SAMPLE data — see the captions) ────────────────────────
await shot('11-about-backend', 'About with the backend — ratings and Netflix India (sample data)', {
  path: `popup.html?demo=office&${D}&backend=demo`,
  before: async (p) => {
    await clickTab(p, 'about');
    await p.waitForSelector('#rh-panel-about .rating-chip', { timeout: 30000 });
  },
});
await shot('12-next-backend', 'Watch next with the backend — similar titles, On Netflix India (sample data)', {
  path: `popup.html?demo=office&${D}&backend=demo`,
  before: async (p) => {
    await clickTab(p, 'next');
    await p.waitForFunction(() => /Similar titles/.test(document.querySelector('#rh-panel-next')?.innerText ?? ''), { timeout: 60000 });
    await settle();
  },
});

// ── other entry states ───────────────────────────────────────────────────────
await shot('13-movie-read', 'A Netflix movie — Read', {
  path: `popup.html?demo=movie&${D}&news=1`,
  settings: NEWS,
  before: async (p) => {
    await clickTab(p, 'read');
    await found(p);
    await settle();
  },
});
await shot('14-netflix-undetected', 'Netflix title not detected — search fallback', {
  path: `popup.html?demo=undetected&${D}`,
  before: async (p) => {
    await p.waitForSelector('.subject-bar.notice');
    await sleep(600);
  },
});
await shot('15-idle', 'Any other website — nothing is read', {
  path: `popup.html?demo=idle&${D}`,
  before: async (p) => {
    await p.waitForSelector('.subject-bar.notice');
    await sleep(600);
  },
});
await shot('16-detection-off', 'Netflix detection switched off (privacy control)', {
  path: `popup.html?demo=netflix&${D}`,
  settings: { privacy: { detectionEnabled: false, netflixDetection: false } },
  before: async (p) => {
    await p.waitForSelector('.subject-bar.notice');
    await sleep(600);
  },
});
await shot('17-error-reddit', 'Error state — Reddit unavailable', {
  path: `popup.html?demo=office&fail=reddit&${D}`,
  before: (p) => p.waitForSelector('#rh-panel-discuss .state', { timeout: 30000 }),
});
await shot('18-light-theme', 'Light theme', {
  path: `popup.html?demo=office&${D}`,
  settings: { appearance: { theme: 'light' } },
  before: async (p) => {
    await clickTab(p, 'about');
    await cast(p);
  },
});

// ── bridges and free-text search ─────────────────────────────────────────────
await shot('19-bridge-thread', 'Reddit thread → “Find deeper reading”', {
  path: `popup.html?demo=office&${D}`,
  before: async (p) => {
    await threads(p);
    await p.evaluate(() => [...document.querySelectorAll('#rh-panel-discuss .btn')].find((b) => /deeper reading/i.test(b.textContent)).click());
    await found(p);
    await settle();
  },
});
await shot('20-free-search', 'Free-text search — the last row of the dropdown', {
  path: `popup.html?demo=idle&${D}`,
  before: async (p) => {
    await p.waitForSelector('.search input');
    await p.type('.search input', 'mockumentary');
    await p.waitForSelector('.title-list:not([hidden]) .search-all', { timeout: 30000 });
    await p.click('.title-option.search-all');
    await clickTab(p, 'read');
    await p.waitForFunction(() => /Found \d+|No strong/.test(document.querySelector('#rh-panel-read .status-line')?.innerText ?? ''), { timeout: 30000 });
    await settle();
  },
});

// ── Settings & dashboard ─────────────────────────────────────────────────────
/** From an element's top to another element's bottom (page coordinates). */
const span = (fromSel, toSel) => (p) =>
  p.evaluate((a, b) => {
    const r1 = document.querySelector(a).getBoundingClientRect();
    const r2 = document.querySelector(b).getBoundingClientRect();
    const x = Math.min(r1.left, r2.left);
    return { x, y: r1.top + scrollY, width: Math.max(r1.right, r2.right) - x, height: r2.bottom - r1.top };
  }, fromSel, toSel);
await shot('21-settings-read', 'Settings — Read (sources, news sites, English only)', {
  path: 'options.html#reading',
  width: 860,
  height: 1000,
  before: (p) => p.waitForSelector('#reading'),
  clipFn: async (p) => {
    const c = await span('#reading', '#reading .row:nth-of-type(9)')(p);
    return { ...c, height: Math.min(c.height, 1450) };
  },
});
await shot('21b-settings-sources', 'Settings — Your sources (prefer / normal / hide)', {
  path: 'options.html#reading',
  width: 860,
  height: 1000,
  before: (p) => p.waitForSelector('#sources'),
  clipFn: async (p) => {
    const c = await span('#sources', '.source-list .source-group:nth-of-type(2)')(p);
    return { ...c, x: c.x - 4, width: c.width + 8, height: c.height + 6 };
  },
});
await shot('22-settings-privacy', 'Settings — Privacy', {
  path: 'options.html#privacy',
  width: 860,
  height: 1000,
  before: (p) => p.waitForSelector('#privacy'),
  element: '#privacy',
});
await shot('23-settings-reddit', 'Settings — Reddit (incl. Discuss sort)', {
  path: 'options.html#reddit',
  width: 860,
  height: 1000,
  before: (p) => p.waitForSelector('#reddit'),
  element: '#reddit',
});
await shot('24-dashboard', 'Full dashboard (three columns)', {
  path: `popup.html?demo=office&mode=tab&${D}&news=1`,
  settings: NEWS,
  width: 1280,
  height: 800,
  scale: 1.5,
  before: async (p) => {
    await found(p);
    await threads(p);
    await cast(p);
    await settle();
  },
});

writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
await browser.close();
console.log(`\n${manifest.length} screens → ${OUT}`);
