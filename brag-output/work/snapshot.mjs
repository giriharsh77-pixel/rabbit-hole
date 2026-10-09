// Freeze real popup states from the UI preview (npm run dev:ui) into static HTML:
// the product's own markup + stylesheet, scripts removed, images inlined.
// Real third-party article content is swapped for fictional sample content (see brag-plan.md).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, 'states');
mkdirSync(OUT, { recursive: true });
const BASE = 'http://127.0.0.1:5199/popup.html';

const VIDEO_ARTICLES = [
  { title: 'Your next teammate is an agent: what actually changes for developers', pub: 'The Slow Build', author: 'M. Ortega', date: '4 Oct 2026',
    excerpt: 'Agents are moving from autocomplete to owning whole tasks. Here’s what that means for code review, testing and the junior developer pipeline.' },
  { title: 'We let an agent run our test suite for a month', pub: 'Field Notes', author: 'Priya Raman', date: '27 Sept 2026',
    excerpt: 'What it fixed, what it broke, and the one guardrail we would never remove.' },
  { title: 'The case for boring agents', pub: 'Second Order', author: 'J. Whitfield', date: '21 Sept 2026',
    excerpt: 'Reliable beats impressive. Notes on scoping agents to jobs you can actually verify.' },
  { title: 'Pairing with a machine: a year of agent-assisted code', pub: 'Compile Time', author: 'Dana Okafor', date: '12 Sept 2026',
    excerpt: 'The surprising part was not the speed. It was what we stopped writing down.' },
  { title: 'What agents mean for the next generation of engineers', pub: 'The Long View', author: 'R. Castillo', date: '2 Sept 2026',
    excerpt: 'Apprenticeship, judgement and taste in a world where the first draft is free.' },
  { title: 'Small tools, sharp edges: building agents that ship', pub: 'Field Notes', author: 'Priya Raman', date: '25 Aug 2026',
    excerpt: 'A practical checklist from teams who put agents into production.' },
];
const THREAD_ARTICLES = [
  { title: 'Beyond pass/fail: how to grade an AI agent’s work', pub: 'Second Order', author: 'J. Whitfield', date: '5 Oct 2026',
    excerpt: 'Partial credit, rubrics and replayable traces — what serious agent evaluation looks like.' },
  { title: 'Rubrics, not vibes: a practical eval stack for agents', pub: 'Field Notes', author: 'Priya Raman', date: '29 Sept 2026',
    excerpt: 'The four layers we use to tell a lucky agent from a reliable one.' },
  { title: 'What our agent benchmarks missed', pub: 'The Slow Build', author: 'M. Ortega', date: '18 Sept 2026',
    excerpt: 'Every task passed. Users still struggled. Here is the gap we found.' },
  { title: 'Measuring agents the way you would measure a new hire', pub: 'Compile Time', author: 'Dana Okafor', date: '9 Sept 2026',
    excerpt: 'Scope, supervision and the cost of a wrong answer.' },
  { title: 'Evals are the product', pub: 'The Long View', author: 'R. Castillo', date: '30 Aug 2026',
    excerpt: 'Why the teams shipping agents fastest spend most of their time on tests.' },
  { title: 'Trace first, score second', pub: 'Second Order', author: 'J. Whitfield', date: '20 Aug 2026',
    excerpt: 'A short guide to evaluating multi-step agent runs.' },
];

const STATES = [
  { name: 'reading', url: `${BASE}?demo=youtube&data=docs`, articles: VIDEO_ARTICLES,
    ready: (p) => p.waitForFunction(() => /Found \d+/.test(document.querySelector('#rh-panel-reading .status-line')?.innerText ?? ''), { timeout: 20000 }) },
  { name: 'trending', url: `${BASE}?demo=youtube&data=docs`, articles: VIDEO_ARTICLES,
    ready: async (p) => {
      await p.waitForFunction(() => /Found \d+/.test(document.querySelector('#rh-panel-reading .status-line')?.innerText ?? ''), { timeout: 20000 });
      await p.click('#rh-tab-reddit');
      await p.waitForSelector('#rh-panel-reddit li.card', { timeout: 20000 });
    } },
  { name: 'thread', url: `${BASE}?demo=reddit&data=docs`, articles: THREAD_ARTICLES,
    ready: async (p) => {
      await p.waitForSelector('#rh-tab-reading');
      await new Promise((r) => setTimeout(r, 1200));
      await p.click('#rh-tab-reading');
      await p.waitForSelector('#rh-panel-reading .bridge .btn');
    } },
  { name: 'thread-result', url: `${BASE}?demo=reddit&data=docs`, articles: THREAD_ARTICLES,
    ready: async (p) => {
      await p.waitForSelector('#rh-tab-reading');
      await new Promise((r) => setTimeout(r, 1200));
      await p.click('#rh-tab-reading');
      await p.waitForSelector('#rh-panel-reading .bridge .btn');
      await p.click('#rh-panel-reading .bridge .btn');
      await p.waitForFunction(() => /Found \d+/.test(document.querySelector('#rh-panel-reading .status-line')?.innerText ?? ''), { timeout: 20000 });
    } },
];

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, headless: true });
for (const s of STATES) {
  const page = await browser.newPage();
  await page.setViewport({ width: 480, height: 600 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.goto(s.url, { waitUntil: 'load' });
  await s.ready(page);
  await new Promise((r) => setTimeout(r, 700));
  const { html, report } = await page.evaluate(async (articles) => {
    const report = [];
    // fictional demo channel instead of a real one
    const swap = (str) => str.replace(/Fireship/g, 'Dev Horizons');
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n; (n = tw.nextNode()); ) if (/Fireship/.test(n.textContent)) n.textContent = swap(n.textContent);
    // sample articles in every Substack card
    document.querySelectorAll('#rh-panel-reading li.card').forEach((card, i) => {
      const a = articles[i % articles.length];
      const t = card.querySelector('.card-title a');
      if (t) { t.textContent = a.title; t.setAttribute('href', '#'); }
      const subs = card.querySelectorAll('.card-sub > span');
      if (subs[0]) subs[0].textContent = a.pub;
      if (subs[1]) subs[1].textContent = `· ${a.author}`;
      if (subs[2]) subs[2].textContent = `· ${a.date}`;
      const ex = card.querySelector('.excerpt');
      if (ex) ex.textContent = a.excerpt;
      card.querySelectorAll('a[href]').forEach((l) => l.setAttribute('href', '#'));
      if (i < 3) report.push(`card ${i + 1}: [${card.querySelector('.relevance')?.innerText}] tags=${[...card.querySelectorAll('.tag-row .chip')].map((c) => c.innerText).join(', ')} | why: ${card.querySelector('.why')?.innerText.replace(/\s+/g, ' ')}`);
    });
    document.querySelectorAll('#rh-panel-reddit li.card').forEach((card, i) => {
      if (i < 6) report.push(`reddit ${i + 1}: ${card.innerText.replace(/\s+/g, ' ').slice(0, 150)}`);
    });
    // inline images
    for (const img of document.querySelectorAll('img')) {
      try {
        const blob = await (await fetch(img.src)).blob();
        img.src = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
      } catch { /* keep */ }
    }
    document.querySelectorAll('script').forEach((s) => s.remove());
    document.querySelectorAll('link[rel="modulepreload"], link[rel="preload"]').forEach((l) => l.remove());
    return { html: '<!doctype html>\n' + document.documentElement.outerHTML, report };
  }, s.articles);
  writeFileSync(join(OUT, `${s.name}.html`), html);
  console.log(`✓ ${s.name}.html (${Math.round(html.length / 1024)} KB)`);
  for (const r of report) console.log('   ', r);
  await page.close();
}
await browser.close();
