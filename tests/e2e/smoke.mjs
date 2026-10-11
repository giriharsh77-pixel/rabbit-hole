/**
 * End-to-end smoke test in a REAL Chrome.
 *
 *   npx @puppeteer/browsers install chrome@stable        # prints the executable path
 *   CHROME_PATH="<that path>" npm run test:e2e
 *
 * Use Chrome for Testing or Chromium: branded Chrome 137+ ignores --load-extension.
 *
 * It loads the built extension (dist/), serves fixture pages at the REAL Netflix
 * URLs through request interception (so the real content script injects), checks
 * that YouTube, Reddit and ordinary pages are never read, and drives the real
 * popup + settings pages against the real service worker.  Substack feeds are fetched live; Reddit is whatever Reddit allows from
 * your network (a block is reported, and the friendly error state is asserted).
 */
import puppeteer from 'puppeteer-core';
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const EXT = resolve(process.env.EXT_DIR ?? 'dist');
const CHROME = process.env.CHROME_PATH;
const OUT = resolve(process.env.E2E_OUT ?? join(tmpdir(), 'rabbit-hole-e2e'));
if (!CHROME || !existsSync(CHROME)) {
  console.error('Set CHROME_PATH to a Chrome for Testing / Chromium executable (see the header of this file).');
  process.exit(2);
}
if (!existsSync(join(EXT, 'manifest.json'))) {
  console.error('dist/ not found - run "npm run build" first.');
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

const report = [];
const ok = (name, pass, detail = '') => {
  report.push({ name, pass, detail });
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const FIXTURES = {
  'https://www.youtube.com/watch?v=abc123XYZ': `<!doctype html><html><head><title>How AI Agents Will Change Software Development - YouTube</title>
    <link rel="canonical" href="https://www.youtube.com/watch?v=abc123XYZ">
    <meta name="keywords" content="ai agents, software development, coding, fireship">
    <meta name="description" content="AI agents are about to change how we write code."></head>
    <body><ytd-watch-metadata><h1><yt-formatted-string>How AI Agents Will Change Software Development</yt-formatted-string></h1>
    <ytd-channel-name><a href="/@fireship">Fireship</a></ytd-channel-name>
    <div id="description-inline-expander"><span id="snippet-text">AI agents are about to change how we write code and what developer tools look like.</span></div>
    </ytd-watch-metadata></body></html>`,
  'https://www.netflix.com/watch/81234567': `<!doctype html><html><head><title>Netflix</title></head><body>
    <div data-uia="video-title"><h4>Black Mirror</h4><span>S7:E2</span><span>Common People</span></div></body></html>`,
  'https://www.netflix.com/title/81234567': `<!doctype html><html><head><title>Black Mirror | Netflix Official Site</title>
    <script type="application/ld+json">{"@type":"TVSeries","name":"Black Mirror","description":"Twisted tales of tech and society.","genre":["Sci-Fi","Thriller"]}</script></head><body></body></html>`,
  'https://www.netflix.com/watch/81234568': `<!doctype html><html><head><title>Netflix</title></head><body><div class="watch-video"></div></body></html>`,
  'https://www.reddit.com/r/technology/comments/abc123/congress_has_another_site_blocking_bill/': `<!doctype html><html><head><title>Congress Has Another Site-Blocking Bill : technology</title></head><body>
    <shreddit-post post-title="Congress Has Another Site-Blocking Bill, And This One Targets VPNs" subreddit-prefixed-name="r/technology" author="someone"></shreddit-post></body></html>`,
  'https://example.com/private-page': `<!doctype html><html><head><title>My private bank page</title></head><body>secret</body></html>`,
};

const userDataDir = mkdtempSync(join(tmpdir(), 'rh-chrome-'));
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  userDataDir,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-first-run', '--no-default-browser-check', '--disable-search-engine-choice-screen'],
  enableExtensions: true,
});

try {
  // ── 1. the extension loads and its service worker boots ────────────────────
  const swTarget = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().endsWith('/background.js'), { timeout: 20000 });
  const sw = await swTarget.worker();
  const extId = new URL(swTarget.url()).host;
  ok('service worker started from the built extension', true, extId);
  const manifestName = await sw.evaluate(() => chrome.runtime.getManifest().name);
  ok('manifest loaded by Chrome', manifestName === 'Rabbit Hole', manifestName);

  const perms = await sw.evaluate(() => chrome.runtime.getManifest().permissions);
  ok('permissions are minimal', JSON.stringify([...perms].sort()) === JSON.stringify(['scripting', 'storage']), perms.join(','));
  const lockOk = await sw.evaluate(async () => { try { await chrome.storage.local.set({ probe: 1 }); await chrome.storage.local.remove('probe'); return true; } catch { return false; } });
  ok('background can use chrome.storage.local', lockOk);

  // ── 2. fixture pages at the REAL URLs → real content scripts inject ────────
  async function openFixture(url) {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const body = FIXTURES[req.url()];
      if (body && req.resourceType() === 'document') req.respond({ status: 200, contentType: 'text/html; charset=utf-8', body });
      else if (body) req.respond({ status: 200, contentType: 'text/html; charset=utf-8', body }); // same-origin fetch()
      else if (/^https:\/\/(www\.)?(youtube|netflix|reddit)\.com\//.test(req.url()) || req.url().startsWith('https://example.com')) req.respond({ status: 404, body: 'nf' });
      else req.continue();
    });
    await page.goto(url, { waitUntil: 'load' });
    return page;
  }

  const tabIdFor = (urlPrefix) => sw.evaluate(async (p) => (await chrome.tabs.query({})).find((t) => t.url?.startsWith(p))?.id, urlPrefix);
  const ask = (tabId) => sw.evaluate((id) => chrome.tabs.sendMessage(id, { type: 'rh/extract' }).catch((e) => ({ error: String(e) })), tabId);

  const nf = await openFixture('https://www.netflix.com/watch/81234567');
  const nfId = await tabIdFor('https://www.netflix.com/watch/81234567');
  await new Promise((r) => setTimeout(r, 800));
  const nfRes = await ask(nfId);
  ok('Netflix episode extracted (label + title-page enrichment)', nfRes?.ok && nfRes.data?.episode?.includes('Season 7, Episode 2') && nfRes.data?.genres?.includes('Sci-Fi'), JSON.stringify(nfRes?.data && { t: nfRes.data.title, e: nfRes.data.episode, g: nfRes.data.genres, s: nfRes.data.source }));
  const badge = await sw.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), nfId);
  ok('toolbar badge ● shows on a Netflix watch page', badge === '●', JSON.stringify(badge));

  const nfHidden = await openFixture('https://www.netflix.com/watch/81234568');
  const nfHiddenRes = await ask(await tabIdFor('https://www.netflix.com/watch/81234568'));
  ok('Netflix with hidden controls degrades to "unknown" (null), not a guess', nfHiddenRes?.ok && nfHiddenRes.data === null, JSON.stringify(nfHiddenRes));

  // Netflix is the only site Rabbit Hole reads: YouTube, Reddit and everything else get no content script.
  const yt = await openFixture('https://www.youtube.com/watch?v=abc123XYZ');
  await yt.bringToFront();
  const ytInfo = await sw.evaluate(async () => { const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); return { id: t?.id, urlVisible: t?.url !== undefined }; });
  const ytRes = await ask(ytInfo.id);
  ok('YouTube is no longer read: no content script, URL not even visible', ytInfo.urlVisible === false && typeof ytRes?.error === 'string', JSON.stringify({ ...ytInfo, err: ytRes?.error?.slice(0, 40) }));

  const rd = await openFixture('https://www.reddit.com/r/technology/comments/abc123/congress_has_another_site_blocking_bill/');
  const rdRes = await ask(await tabIdFor('https://www.reddit.com/r/technology'));
  ok('NO content script runs on Reddit pages', typeof rdRes?.error === 'string' && /Receiving end|Could not establish/i.test(rdRes.error), rdRes?.error?.slice(0, 60));

  const ex = await openFixture('https://example.com/private-page');
  // The extension cannot even *see* this tab's URL (no host permission) — find it by focus instead.
  await ex.bringToFront();
  const exInfo = await sw.evaluate(async () => { const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); return { id: t?.id, urlVisible: t?.url !== undefined }; });
  const exId = exInfo.id;
  ok('extension cannot see the URL of an ordinary site\'s tab', exInfo.urlVisible === false, JSON.stringify(exInfo));
  const exRes = await ask(exId);
  ok('NO content script runs on an ordinary website', typeof exRes?.error === 'string' && /Receiving end|Could not establish/i.test(exRes.error), exRes?.error?.slice(0, 80));
  const exBadge = await sw.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), exId);
  ok('no badge on an ordinary website', exBadge === '', JSON.stringify(exBadge));

  // ── 3. the real popup UI against the real service worker ──────────────────
  const problems = [];
  async function openUi(path) {
    const page = await browser.newPage();
    page.on('console', (m) => { if (m.type() === 'error') problems.push(`[console.error] ${m.text()}`); });
    page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
    const cdp = await page.createCDPSession();
    await cdp.send('Log.enable');
    cdp.on('Log.entryAdded', ({ entry }) => { if (entry.level === 'error') problems.push(`[log] ${entry.text} ${entry.url ?? ''}`); });
    await page.setViewport({ width: 480, height: 600 });
    await page.goto(`chrome-extension://${extId}/${path}`, { waitUntil: 'load' });
    return page;
  }

  const ui = await openUi(`popup.html?tab=${nfId}`);
  await ui.waitForSelector('.subject-title', { timeout: 15000 });
  const ctxText = await ui.$eval('.subject-bar', (e) => e.innerText.replace(/\n+/g, ' | '));
  ok('popup shows Netflix: Black Mirror · Season 7, Episode 2', /WATCHING/i.test(ctxText) && /Black Mirror/.test(ctxText) && /Netflix/.test(ctxText) && /Season 7, Episode 2/.test(ctxText), ctxText);
  const tabNames = await ui.$$eval('[role=tab]', (t) => t.map((e) => e.textContent.trim()));
  const selected = await ui.$eval('[role=tab][aria-selected=true]', (e) => e.id);
  ok('four tabs — Discuss · Read · About · Watch next — leading with Discuss', tabNames.join(' · ') === 'Discuss · Read · About · Watch next' && selected === 'rh-tab-discuss', `${tabNames.join(' · ')} (selected ${selected})`);

  // Discuss in real Chrome: threads about the episode (real network → JSON, or degraded to feeds)
  await ui.waitForFunction(() => document.querySelectorAll('#rh-panel-discuss li.card').length > 0 || document.querySelector('#rh-panel-discuss .state'), { timeout: 40000 }).catch(() => undefined);
  const redditCards = await ui.$$eval('#rh-panel-discuss li.card', (c) => c.length);
  const redditMeta = await ui.$eval('#rh-panel-discuss', (p) => (p.querySelector('.state h3') ? `state: ${p.querySelector('.state h3').textContent}` : (p.querySelector('.panel-title .meta')?.innerText ?? '')));
  const aboutEpisode = await ui.$eval('#rh-panel-discuss', (p) => /Reddit on this episode/i.test(p.innerText)).catch(() => false);
  const ownSub = await ui.$eval('#rh-panel-discuss', (p) => p.querySelector('.chip-sub')?.textContent ?? '').catch(() => '');
  ok('Discuss shows threads about the episode, starting with the show’s own subreddit (or a friendly state)', aboutEpisode && (redditCards > 0 || redditMeta.startsWith('state')), `${redditCards} cards — ${ownSub || 'no subreddit chip'} — ${redditMeta}`);
  await ui.screenshot({ path: join(OUT, 'popup-discuss.png') });

  await ui.click('#rh-tab-read');
  await ui.waitForFunction(() => /Found \d+ related|No strong matches|Couldn't find/.test(document.querySelector('#rh-panel-read')?.innerText ?? ''), { timeout: 40000 }).catch(() => undefined);
  const status = await ui.$eval('#rh-panel-read .status-line', (e) => e.innerText).catch(() => '');
  const articles = await ui.$$eval('#rh-panel-read li.card', (cards) => cards.slice(0, 5).map((c) => ({ title: c.querySelector('.card-title')?.textContent, pub: c.querySelector('.sub-link')?.textContent, label: c.querySelector('.relevance')?.textContent, why: c.querySelector('.why')?.innerText.replace(/\n/g, ' ').slice(0, 120), href: c.querySelector('.card-title a')?.href })));
  ok('Read: real Substack / Medium feeds fetched from the service worker (no CORS, via host permissions)', articles.length > 0, `${status.trim()} — e.g. "${articles[0]?.title}" (${articles[0]?.pub})`);
  ok('every article link is an https URL', articles.every((a) => a.href?.startsWith('https://')), articles.map((a) => new URL(a.href).host).join(', '));
  const newsOffer = await ui.$eval('#rh-panel-read', (p) => /Add news coverage/.test(p.innerText)).catch(() => false);
  ok('Read offers news sites (opt-in: nothing is fetched from them until allowed)', newsOffer);
  writeFileSync(join(OUT, 'articles.json'), JSON.stringify(articles, null, 2));
  await ui.screenshot({ path: join(OUT, 'popup-read.png') });

  // About: Wikidata, live — the exact title, its cast and review links
  await ui.click('#rh-tab-about');
  await ui.waitForFunction(() => document.querySelectorAll('#rh-panel-about .cast-row').length > 0 || document.querySelector('#rh-panel-about .state'), { timeout: 30000 }).catch(() => undefined);
  const about = await ui.$eval('#rh-panel-about', (p) => ({
    title: p.querySelector('.about-title')?.textContent ?? p.querySelector('.state h3')?.textContent,
    cast: [...p.querySelectorAll('.cast-row')].slice(0, 4).map((r) => r.querySelector('.cast-name')?.textContent),
    social: p.querySelectorAll('.cast-row a.social').length,
    links: [...p.querySelectorAll('a.link-tile')].map((a) => new URL(a.href).hostname),
  }));
  ok('About: Wikidata names the exact title, its cast (with X / Instagram) and IMDb / Rotten Tomatoes links', /Black Mirror/.test(about.title ?? '') && about.cast.length > 0 && about.links.includes('www.imdb.com'), `${about.title} — ${about.cast.join(', ')} — ${about.social} social links — ${about.links.join(', ')}`);
  await ui.screenshot({ path: join(OUT, 'popup-about.png') });

  await ui.click('#rh-tab-next');
  await ui.waitForFunction(() => document.querySelectorAll('#rh-panel-next li.next-card').length > 0 || document.querySelector('#rh-panel-next .state'), { timeout: 45000 }).catch(() => undefined);
  const next = await ui.$$eval('#rh-panel-next li.next-card', (c) => c.slice(0, 3).map((e) => `${e.querySelector('.card-title')?.textContent} — ${e.querySelector('.next-why')?.textContent}`));
  ok('Watch next: titles with the same cast or creator, each with its real connection', next.length > 0 && next.every((t) => /With |From /.test(t)), next.join(' | '));
  await ui.screenshot({ path: join(OUT, 'popup-next.png') });

  const ui3 = await openUi(`popup.html?tab=${await tabIdFor('https://www.netflix.com/watch/81234568')}`);
  await ui3.waitForSelector('.subject-bar.notice', { timeout: 15000 }).catch(() => undefined);
  const fallback = await ui3.$eval('.subject-wrap', (p) => p.innerText).catch(() => '');
  ok('hidden Netflix label → "Couldn’t identify what’s playing" + search', /identify what.s playing/i.test(fallback) && /search above/i.test(fallback), fallback.replace(/\n+/g, ' | ').slice(0, 110));

  const ui4 = await openUi(`popup.html?tab=${exId}`);
  await ui4.waitForSelector('.subject-bar.notice', { timeout: 15000 });
  const idle = await ui4.$eval('.app', (p) => p.innerText.replace(/\n+/g, ' | ')).catch(() => '');
  ok('ordinary site: nothing is read ("Open a Netflix title"; no page content leaks into the UI)', /Open a Netflix title/i.test(idle) && !/bank|secret/i.test(idle), idle.slice(0, 140));

  // title search: pick a show, every tab follows it
  await ui4.type('.search input', 'Sacred Games');
  await ui4.waitForSelector('.title-list:not([hidden]) .title-option:not(.search-all)', { timeout: 20000 });
  const firstOption = await ui4.$eval('.title-list .title-option', (e) => e.innerText.replace(/\n+/g, ' '));
  await ui4.keyboard.press('Enter');
  await ui4.waitForFunction(() => /EXPLORING/i.test(document.querySelector('.subject-bar')?.innerText ?? ''), { timeout: 15000 });
  const picked = await ui4.$eval('.subject-bar', (e) => e.innerText.replace(/\n+/g, ' | '));
  ok('title search: typing shows movies & series from Wikidata; Enter picks one', /Sacred Games/.test(firstOption) && /Series/i.test(firstOption) && /Sacred Games/.test(picked), `${firstOption} → ${picked}`);
  await ui4.click('#rh-tab-about');
  await ui4.waitForSelector('#rh-panel-about .cast-row', { timeout: 30000 }).catch(() => undefined);
  const pickedCast = await ui4.$$eval('#rh-panel-about .cast-row .cast-name strong', (c) => c.slice(0, 3).map((e) => e.textContent));
  ok('…and About follows the picked title (Indian Netflix original)', pickedCast.length > 0, pickedCast.join(', '));
  await ui4.screenshot({ path: join(OUT, 'popup-picked.png') });

  // free-text search: the last row of the dropdown
  await ui4.click('.search input');
  await ui4.type('.search input', 'Nvidia');
  await ui4.waitForSelector('.title-list:not([hidden]) .search-all', { timeout: 20000 });
  await ui4.click('.title-option.search-all');
  await ui4.click('#rh-tab-read');
  await ui4.waitForFunction(() => /Found \d+|No strong matches/.test(document.querySelector('#rh-panel-read .status-line')?.innerText ?? ''), { timeout: 40000 }).catch(() => undefined);
  const nvidia = await ui4.$eval('#rh-panel-read', (p) => `${p.querySelector('.context-bar')?.innerText.replace(/\n+/g, ' | ')} :: ${p.querySelector('.status-line')?.innerText}`);
  ok('free-text search ("Search Reddit and articles for “Nvidia”") still works', /EXPLORING/i.test(nvidia) && /Nvidia/.test(nvidia), nvidia.slice(0, 140));

  // ── 4. settings page + persistence + detection switch ─────────────────────
  const opts = await openUi('options.html#privacy');
  await opts.waitForSelector('.section', { timeout: 15000 });
  await opts.click('button[aria-label="Detect what you’re watching on Netflix"]');
  await new Promise((r) => setTimeout(r, 600));
  const stored = await sw.evaluate(async () => (await chrome.storage.local.get('rh.settings'))['rh.settings']?.privacy);
  ok('Settings toggle persists to chrome.storage.local', stored?.netflixDetection === false && stored?.detectionEnabled === false, JSON.stringify(stored));

  const ui5 = await openUi(`popup.html?tab=${nfId}`);
  await ui5.waitForSelector('.subject-bar.notice', { timeout: 15000 }).catch(() => undefined);
  const disabled = await ui5.$eval('.app', (p) => p.innerText.replace(/\n+/g, ' | ')).catch(() => '');
  ok('with Netflix detection OFF the page is not read ("Netflix detection is off")', /detection is off/i.test(disabled) && !/Black Mirror/.test(disabled), disabled.slice(0, 120));
  const badgeOff = await (async () => { await new Promise((r) => setTimeout(r, 500)); return sw.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), nfId); })();
  ok('badge cleared when detection is turned off', badgeOff === '', JSON.stringify(badgeOff));

  // secrets are write-only
  const secretRes = await opts.evaluate(async () => {
    const port = chrome.runtime.connect({ name: 'rabbit-hole:rpc' });
    return await new Promise((resolve) => {
      port.onMessage.addListener((m) => resolve(m));
      port.postMessage({ kind: 'rpc', id: 1, method: 'secrets/status' });
    });
  });
  ok('secrets RPC exposes masked status only', secretRes?.ok === true && typeof secretRes.data?.braveApiKey?.configured === 'boolean' && !JSON.stringify(secretRes).includes('apiKey":"'));

  // what does real Reddit say to this extension from this machine?
  const reddit = await opts.evaluate(async () => {
    const port = chrome.runtime.connect({ name: 'rabbit-hole:rpc' });
    return await new Promise((resolve) => {
      port.onMessage.addListener((m) => resolve(m));
      port.postMessage({ kind: 'rpc', id: 2, method: 'reddit/search', params: { queries: ['"The Office"'], time: 'all', strict: true } });
    });
  });
  console.log('  reddit/search "The Office" →', reddit.ok ? `provider=${reddit.data.meta.provider} degradedFrom=${JSON.stringify(reddit.data.meta.degradedFrom ?? [])} threads=${reddit.data.posts.length}` : `error ${JSON.stringify(reddit.error)}`);

  // ── 5. console health ─────────────────────────────────────────────────────
  const csp = problems.filter((p) => /Content Security Policy|Refused to/i.test(p));
  ok('no Content-Security-Policy violations in any extension page', csp.length === 0, csp.join(' ; ').slice(0, 300));
  const other = problems.filter((p) => !/Content Security Policy|Refused to/i.test(p) && !/Failed to load resource.*(40[34]|net::)/i.test(p));
  ok('no uncaught errors in extension pages', other.length === 0, other.join(' ; ').slice(0, 400));
  if (problems.length) console.log('  (all console problems:)\n  ' + problems.join('\n  '));
} catch (err) {
  ok('smoke test aborted by an exception', false, String(err?.stack ?? err));
} finally {
  await browser.close();
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  const failed = report.filter((r) => !r.pass).length;
  console.log(`\n${report.length - failed}/${report.length} checks passed`);
  process.exit(failed ? 1 : 0);
}
