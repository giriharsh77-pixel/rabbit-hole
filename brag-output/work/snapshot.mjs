// Freeze real popup states from the UI preview (npm run dev:ui) into static HTML:
// the product's own markup + stylesheet, scripts removed, images inlined.
// Reddit threads are the preview's invented sample threads; news headlines, cast and
// Watch next titles are the product's real output (see brag-plan.md).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, 'states');
mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:5199/popup.html';
const OFFICE = `${BASE}?demo=office&data=docs`;
const threads = (p) => p.waitForSelector('#rh-panel-discuss li.card[aria-label] .btn', { timeout: 30000 });
const year = (p) => p.waitForSelector('.subject-title .num', { timeout: 30000 });
const found = (p) => p.waitForFunction(() => /Found \d+/.test(document.querySelector('#rh-panel-read .status-line')?.innerText ?? ''), { timeout: 30000 });

const STATES = [
  { name: 'discuss', url: OFFICE, ready: async (p) => { await year(p); await threads(p); } },
  { name: 'newest', url: OFFICE, ready: async (p) => {
      await year(p); await threads(p);
      await p.evaluate(() => document.querySelectorAll('#rh-panel-discuss .sort-control .seg')[1].click());
      await new Promise((r) => setTimeout(r, 500)); await threads(p);
    } },
  { name: 'read', url: `${OFFICE}&news=1`, news: true, ready: async (p) => { await year(p); await p.click('#rh-tab-read'); await found(p); } },
  { name: 'about', url: OFFICE, ready: async (p) => { await year(p); await p.click('#rh-tab-about'); await p.waitForSelector('#rh-panel-about .cast-row', { timeout: 30000 }); } },
  { name: 'next', url: OFFICE, ready: async (p) => { await year(p); await p.click('#rh-tab-next'); await p.waitForSelector('#rh-panel-next li.next-card', { timeout: 60000 }); } },
  { name: 'search', url: `${BASE}?demo=idle&data=docs`, ready: async (p) => {
      await p.waitForSelector('.subject-bar.notice');
      await p.type('.search input', 'sacred ga');
      await p.waitForSelector('.title-list:not([hidden]) .title-option:not(.search-all)', { timeout: 30000 });
    } },
];

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, headless: true });
for (const s of STATES) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 480, height: 600 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  if (s.news) await page.evaluateOnNewDocument(() => localStorage.setItem('rh-preview:rh.settings', JSON.stringify({ reading: { includeNews: true } })));
  await page.goto(s.url, { waitUntil: 'load' });
  await s.ready(page);
  await new Promise((r) => setTimeout(r, 900));
  const html = await page.evaluate(async () => {
    // keep what was typed (a property, not an attribute)
    document.querySelectorAll('input').forEach((i) => i.setAttribute('value', i.value));
    document.querySelectorAll('a[href]').forEach((l) => l.setAttribute('href', '#'));
    for (const img of document.querySelectorAll('img')) {
      try {
        const blob = await (await fetch(img.src)).blob();
        img.src = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
      } catch { /* keep */ }
    }
    document.querySelectorAll('script').forEach((x) => x.remove());
    document.querySelectorAll('link[rel="modulepreload"], link[rel="preload"]').forEach((l) => l.remove());
    return '<!doctype html>\n' + document.documentElement.outerHTML;
  });
  writeFileSync(join(OUT, `${s.name}.html`), html);
  const summary = await page.evaluate(() => [...document.querySelectorAll('.panel:not([hidden]) li.card')].slice(0, 3).map((c) => c.innerText.replace(/\s+/g, ' ').slice(0, 90)));
  console.log(`✓ ${s.name}.html (${Math.round(html.length / 1024)} KB)`, summary);
  await ctx.close();
}
await browser.close();
