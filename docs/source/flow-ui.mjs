/**
 * UI flow ("user flow") diagram built from the real captured screens.
 * Exported as SVG with embedded PNGs: drag it into Figma / FigJam and every
 * frame, label and arrow arrives as an editable layer.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Diagram, THEME as T } from './svg.mjs';

export const UI_FLOW_SIZE = { w: 2780, h: 3020 };

const cache = new Map();
/** Resize with ImageMagick (kept small so the SVG stays a manageable size). */
function embed(file, width) {
  const key = `${file}@${width}`;
  if (cache.has(key)) return cache.get(key);
  const out = join(mkdtempSync(join(tmpdir(), 'rh-img-')), 'x.png');
  execFileSync('magick', [file, '-resize', `${width}x`, '-colors', '256', '-strip', '-define', 'png:compression-level=9', out]);
  const buf = readFileSync(out);
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  const r = { href: `data:image/png;base64,${buf.toString('base64')}`, w, h };
  cache.set(key, r);
  return r;
}

export function uiFlow(screensDir) {
  const d = new Diagram(UI_FLOW_SIZE.w, UI_FLOW_SIZE.h, { background: T.canvas });
  const IMG = (n) => join(screensDir, n);
  let clip = 0;

  /** A screen "frame": title above, rounded screenshot, optional caption below. */
  function screen(id, x, y, file, title, caption, { width = 240, px = 480, tag } = {}) {
    const img = embed(IMG(file), px);
    const h = Math.round((width * img.h) / img.w);
    d.registerNode(id, x, y, width, h);
    d.text(x, y - 32, title, { size: 14, weight: 700, fill: T.ink });
    if (tag) {
      d.rect(x, y - 62, 56, 20, { rx: 10, fill: T.accentSoft, stroke: T.accent, sw: 1 });
      d.text(x + 28, y - 52, tag, { size: 10.5, weight: 700, fill: T.accent, anchor: 'middle', valign: 'middle' });
    }
    const cid = `c${clip++}`;
    d.defs.push(`<clipPath id="${cid}"><rect x="${x}" y="${y}" width="${width}" height="${h}" rx="14"/></clipPath>`);
    d.rect(x - 3, y - 3, width + 6, h + 6, { rx: 17, fill: '#fff', stroke: T.border, sw: 1.5 });
    d.add(`<image href="${img.href}" xlink:href="${img.href}" x="${x}" y="${y}" width="${width}" height="${h}" clip-path="url(#${cid})" preserveAspectRatio="xMidYMid slice"/>`);
    if (caption) d.text(x, y + h + 16, caption, { size: 12, fill: T.ink2, maxWidth: width, lineHeight: 1.3 });
    return d.nodes.get(id);
  }

  function section(x, y, w, h, title, color = T.border) {
    d.rect(x, y, w, h, { rx: 22, fill: 'rgba(255,255,255,0.55)', stroke: color, sw: 1.5, dash: '8 6' });
    d.text(x + 24, y + 20, title, { size: 12, weight: 700, fill: T.ink3, letterSpacing: '0.14em' });
  }

  function sticky(x, y, w, text, rot = 0) {
    const lines = text.split('\n').length;
    const h = 24 + Math.max(lines, Math.ceil((text.length * 6.4) / (w - 28))) * 17;
    d.add(`<g transform="rotate(${rot} ${x + w / 2} ${y + h / 2})">`);
    d.rect(x + 3, y + 4, w, h, { rx: 4, fill: 'rgba(0,0,0,0.08)' });
    d.rect(x, y, w, h, { rx: 4, fill: '#fff3a3', stroke: '#e9d860', sw: 1 });
    d.text(x + 14, y + 12, text, { size: 12.5, fill: '#4a4320', maxWidth: w - 28, lineHeight: 1.35 });
    d.add('</g>');
  }

  function connector(x, y, letter, color = T.accent) {
    d.circle(x, y, 13, { fill: color, stroke: '#fff', sw: 2 });
    d.text(x, y, letter, { size: 12, weight: 800, fill: '#fff', anchor: 'middle', valign: 'middle' });
  }

  const lab = (x, y, s, o = {}) => d.label(x, y, s, { size: 11.5, fill: T.ink2, bg: T.canvas, maxWidth: 124, ...o });

  // ── header ────────────────────────────────────────────────────────────────
  d.text(60, 40, 'Rabbit Hole — UI flow', { size: 34, weight: 800 });
  d.text(60, 90, 'Popup 480 × 600 (Chrome’s maximum popup height) · dark theme default · every screen is a capture of the built UI', { size: 15, fill: T.ink2 });
  d.text(60, 118, 'Reddit threads are illustrative sample data · news articles are real (captured 2026-10-10) · title facts are live Wikidata · “with the backend” screens use placeholder ratings / availability.', { size: 13, fill: T.ink3 });

  // legend
  d.rect(1900, 30, 820, 112, { rx: 14, fill: '#fff', stroke: T.border });
  d.text(1922, 44, 'HOW TO READ', { size: 11, weight: 700, fill: T.ink3, letterSpacing: '0.12em' });
  d.polyline([[1924, 84], [2004, 84]], { stroke: T.line });
  d.text(2016, 84, 'User action', { size: 13, valign: 'middle', fill: T.ink2 });
  d.polyline([[2130, 84], [2210, 84]], { stroke: T.accent, dash: '7 5' });
  d.text(2222, 84, 'Error / fallback', { size: 13, valign: 'middle', fill: T.ink2 });
  connector(2392, 84, 'S');
  d.text(2414, 84, 'Jump to the same letter', { size: 13, valign: 'middle', fill: T.ink2 });
  d.rect(1924, 108, 46, 22, { rx: 4, fill: '#fff3a3', stroke: '#e9d860' });
  d.text(1982, 119, 'Design note', { size: 13, valign: 'middle', fill: T.ink2 });
  d.rect(2130, 108, 46, 22, { rx: 11, fill: T.accentSoft, stroke: T.accent });
  d.text(2188, 119, 'Entry / start state', { size: 13, valign: 'middle', fill: T.ink2 });

  // global controls
  d.rect(60, 160, 2660, 64, { rx: 14, fill: T.dark, stroke: T.dark });
  d.text(86, 192, 'ON EVERY SCREEN', { size: 11, weight: 700, fill: T.accentMid, valign: 'middle', letterSpacing: '0.14em' });
  d.text(250, 192, 'Search a movie or show  ( / focuses · ↑ ↓ Enter picks · Esc closes )   ·   Tabs: Discuss · Read · About · Watch next  ( ← → )   ·   ⚙ Settings   ·   ⤢ Full dashboard   ·   “Private by design” → Privacy', { size: 14.5, fill: '#e8e8ee', valign: 'middle' });

  // ── sections ──────────────────────────────────────────────────────────────
  const H = UI_FLOW_SIZE.h - 280;
  section(30, 250, 1000, H, 'A · ENTRY & TITLE');
  section(1050, 250, 760, H, 'B · THE FOUR TABS');
  section(1830, 250, 400, H, 'C · EXTERNAL');
  section(2250, 250, 500, H, 'D · SETTINGS & DASHBOARD');

  // ── A: entry ──────────────────────────────────────────────────────────────
  d.node('start', 'terminator', 70, 320, 230, 78, 'User clicks the Rabbit Hole toolbar icon', { fill: T.dark, stroke: T.dark, color: '#fff', size: 14 });
  d.text(70, 410, '● badge appears on Netflix watch pages', { size: 12, fill: T.ink3, maxWidth: 230 });
  d.node('dec', 'decision', 70, 470, 230, 170, 'What is on the page?', { fill: T.warnSoft, stroke: T.warn, size: 14 });
  d.edge('start', 'bottom', 'dec', 'top');

  const ROW = (i) => 340 + i * 500;
  const LX = 540;
  const s1 = screen('s1', LX, ROW(0), '01-discuss.png', 'S1 · Watching — Discuss', 'Subject bar “Watching”; Discuss opens on Reddit threads about the episode, own subreddit first.', { tag: 'ENTRY' });
  const s2 = screen('s2', LX, ROW(1), '14-netflix-undetected.png', 'S2 · Netflix label hidden', 'Says why, and how to fix it — or search. Never guesses.', { tag: 'ENTRY' });
  const s3 = screen('s3', LX, ROW(2), '16-detection-off.png', 'S3 · Detection switched off', 'Privacy respected: nothing is read. Turn it on, or search.', { tag: 'ENTRY' });
  const s4 = screen('s4', LX, ROW(3), '15-idle.png', 'S4 · Any other website', 'Nothing is read — the extension can’t even see the URL. Search any title.', { tag: 'ENTRY' });
  const s5 = screen('s5', LX, ROW(4), '09-title-search.png', 'S5 · Title search', 'Movies and series from Wikidata with year and kind. Last row: search the words themselves.', { tag: 'ENTRY' });

  const busX = 360;
  d.polyline([[300, 555], [busX, 555]], { arrow: false });
  d.polyline([[busX, ROW(0) + s1.h / 2], [busX, ROW(3) + s4.h / 2]], { arrow: false });
  [
    [s1, 'Netflix episode or movie identified'],
    [s2, 'Netflix, player label hidden'],
    [s3, 'Detection off in Settings → Privacy'],
    [s4, 'Any other website'],
  ].forEach(([s, text]) => {
    const y = s.y + s.h / 2;
    d.polyline([[busX, y], [s.x - 4, y]]);
    d.label(450, y - 30, text, { size: 11, fill: T.ink2, bg: T.canvas, maxWidth: 116 });
  });
  // every screen can start a title search
  [s2, s3, s4].forEach((s) => connector(s.x + s.w + 24, s.y + 40, 'S'));
  connector(s5.x - 28, s5.y + 40, 'S');
  lab(450, s5.y + 40, 'Click the search box (or press /) on any screen', { size: 11, maxWidth: 110 });
  sticky(110, ROW(4) + 180, 300, 'One exact title, everywhere: “The Office (U.S.)” is matched to the American sitcom on Wikidata (catalogue tag, kind, year, cast). Unsure? It shows nothing rather than guess.', -1.5);

  // ── B: the four tabs ──────────────────────────────────────────────────────
  const BX = 1100;
  const BX2 = BX + 300;
  const b0a = screen('b0a', BX, ROW(0), '02-discuss-newest.png', 'Discuss — Newest', 'Most relevant ⇄ Newest; still only threads about the show.');
  const b0b = screen('b0b', BX2, ROW(0), '19-bridge-thread.png', 'Reading — from a thread', '“Find deeper reading →” turns the thread into a Read search.');
  const b1a = screen('b1a', BX, ROW(1), '03-read-news.png', 'Read', 'Substack · Medium · news sites (opt-in) — your sources applied.');
  const b1b = screen('b1b', BX2, ROW(1), '04-read-card.png', 'Article card', 'Relevance label, “Why this is relevant”, See what Reddit thinks.');
  const b2a = screen('b2a', BX, ROW(2), '06-about.png', 'About', 'Facts and review links: IMDb, Letterboxd, Rotten Tomatoes, Wikipedia.');
  const b2b = screen('b2b', BX2, ROW(2), '07-about-cast.png', 'About — cast', 'Billing order, characters, X and Instagram.');
  const b3a = screen('b3a', BX, ROW(3), '08-watch-next.png', 'Watch next', 'Same cast & creators (Wikidata); filters: type, decade, sort.');
  const b3b = screen('b3b', BX2, ROW(3), '12-next-backend.png', 'Watch next + backend', 'TMDB similar titles · On Netflix India (placeholder data here).');
  const b4a = screen('b4a', BX, ROW(4), '10-picked-title.png', 'A picked title', '“Exploring Sacred Games” — every tab follows; × returns to Netflix.');
  const b4b = screen('b4b', BX2, ROW(4), '20-free-search.png', 'Free-text search', '“Search Reddit and articles for …” — Discuss and Read only.');

  // S1 → tabs bus
  const tabX = 1075;
  d.polyline([[s1.x + s1.w + 4, ROW(0) + 120], [tabX, ROW(0) + 120], [tabX, ROW(3) + 150]], { arrow: false });
  d.polyline([[s1.x + s1.w + 4, ROW(0) + 60], [b0a.x - 4, ROW(0) + 60]]);
  d.label((s1.x + s1.w + b0a.x) / 2, ROW(0) + 38, 'Newest', { size: 11, bg: T.canvas, maxWidth: 80 });
  [
    [b1a, 'Read'],
    [b2a, 'About'],
    [b3a, 'Watch next'],
  ].forEach(([b, t]) => {
    d.polyline([[tabX, b.y + 150], [b.x - 4, b.y + 150]]);
    d.label(tabX - 2, b.y + 120, t, { size: 11, bg: T.canvas, maxWidth: 80, fill: T.accent, weight: 700 });
  });
  d.label(820, ROW(0) + 120, 'Tabs', { size: 11, bg: T.canvas, maxWidth: 60 });
  d.edge('b0a', 'right', 'b0b', 'left', { label: 'Find deeper reading →', labelAt: [(b0a.x + b0a.w + b0b.x) / 2, ROW(0) + b0a.h / 2 - 30], labelOpts: { bg: T.canvas, size: 10.5, maxWidth: 60 } });
  d.edge('b1a', 'right', 'b1b', 'left', { label: 'scroll', labelAt: [(b1a.x + b1a.w + b1b.x) / 2, ROW(1) + b1a.h / 2 - 20], labelOpts: { bg: T.canvas, size: 10.5, maxWidth: 60 } });
  d.edge('b2a', 'right', 'b2b', 'left', { label: 'scroll', labelAt: [(b2a.x + b2a.w + b2b.x) / 2, ROW(2) + b2a.h / 2 - 20], labelOpts: { bg: T.canvas, size: 10.5, maxWidth: 60 } });
  d.edge('b3a', 'right', 'b3b', 'left', { label: 'with a TMDB key', labelAt: [(b3a.x + b3a.w + b3b.x) / 2, ROW(3) + b3a.h / 2 - 30], labelOpts: { bg: T.canvas, size: 10.5, maxWidth: 60 } });
  // title search → picked / free text
  d.edge('s5', 'right', 'b4a', 'left', { label: 'Enter / click a title', labelAt: [(s5.x + s5.w + b4a.x) / 2 - 20, ROW(4) + s5.h / 2 - 28], labelOpts: { bg: T.canvas, maxWidth: 100, size: 11 } });
  const lowY = ROW(4) + s5.h + 100;
  d.polyline([[s5.x + s5.w + 4, ROW(4) + s5.h - 40], [1060, ROW(4) + s5.h - 40], [1060, lowY], [b4b.x + b4b.w + 24, lowY], [b4b.x + b4b.w + 24, ROW(4) + 150], [b4b.x + b4b.w + 4, ROW(4) + 150]]);
  d.label(1300, lowY, 'last row: search the words themselves', { size: 10.5, bg: T.canvas, maxWidth: 220 });
  // Explore loops back
  sticky(BX, ROW(5) + 30, 330, '“Explore” on any Watch next pick, or picking another title, makes it the subject of all four tabs. × on the subject bar goes back to what’s playing.', -1.2);
  sticky(BX2 + 60, ROW(5) + 70, 300, 'Read offers news sites once (“Add news sites”); Chrome asks for those 22 sites only then.', 1.2);

  // ── C: external ───────────────────────────────────────────────────────────
  const ext = [
    ['Reddit thread', 'Open Reddit → (new tab)'],
    ['Article', 'Substack · Medium · news site'],
    ['Review sites', 'IMDb · Letterboxd · Rotten Tomatoes · Wikipedia'],
    ['Cast profiles', 'X · Instagram'],
    ['Netflix search', '“Find on Netflix” for a pick'],
  ];
  ext.forEach(([t, sub], i) => {
    const y = ROW(0) + 30 + i * 150;
    d.node(`e${i}`, 'terminator', 1870, y, 320, 86, t, { fill: '#fff', stroke: T.ink, size: 16, weight: 700, sub });
    connector(1893, y - 6, 'E', T.cool);
  });
  d.text(1870, ROW(0) - 10, 'Every card and link opens in a new tab', { size: 11.5, fill: T.ink3 });
  [b0a, b1b, b2a, b2b, b3a].forEach((b) => connector(b.x + b.w + 22, b.y + 210, 'E', T.cool));

  const err = screen('err', 1870, ROW(4) - 220, '17-error-reddit.png', 'Error — Reddit unavailable', 'Plain cause, one action. Stale data is shown (flagged) when there is some.', { width: 280, px: 560 });
  d.polyline([[b0b.x + b0b.w + 4, ROW(0) + 260], [1845, ROW(0) + 260], [1845, err.y + err.h / 2], [err.x - 4, err.y + err.h / 2]], { stroke: T.accent, dash: '7 5' });
  d.label(1845, ROW(1) + 30, 'All Reddit providers fail', { size: 11, fill: T.accent, bg: T.canvas, maxWidth: 90 });
  sticky(1870, err.y + err.h + 90, 330, 'Every failure has a message, a next step and a way out: Try again · search · Settings · Open Reddit.', 1);

  // ── D: settings & dashboard ───────────────────────────────────────────────
  d.node('gear', 'terminator', 2290, 320, 420, 56, '⚙ Header icon  or  footer “Private by design”', { fill: T.dark, stroke: T.dark, color: '#fff', size: 14 });
  const st1 = screen('st1', 2290, 460, '21-settings-read.png', 'Settings → Read', 'News sites, English only, Medium.', { width: 180, px: 360 });
  const st2 = screen('st2', 2550, 460, '21b-settings-sources.png', 'Your sources', 'Prefer · Normal · Hide per source.', { width: 180, px: 360 });
  const st3 = screen('st3', 2290, 860, '22-settings-privacy.png', 'Privacy', 'Read / stored / sent; one Netflix switch.', { width: 180, px: 360 });
  const st4 = screen('st4', 2550, 860, '23-settings-reddit.png', 'Reddit', 'Sort Discuss by: relevant / newest.', { width: 180, px: 360 });
  d.edge('gear', 'bottom', 'st1', 'top', { via: [[2380, 376], [2380, 460]] });
  d.edge('st1', 'right', 'st2', 'left', { label: 'scroll', labelOpts: { bg: T.canvas, size: 11, maxWidth: 60 } });
  const light = screen('light', 2290, 1160, '18-light-theme.png', 'Appearance → Light', 'Dark default; Light / System.', { width: 180, px: 360 });
  void st3;
  void st4;
  void light;

  d.node('expand', 'terminator', 2290, 1620, 420, 56, '⤢ Header icon: open the full dashboard', { fill: T.dark, stroke: T.dark, color: '#fff', size: 14 });
  const dash = screen('dash', 2290, 1730, '24-dashboard.png', 'Full dashboard (tab)', 'Three columns when wide: Discuss | Read | About + Watch next. Same app, same state.', { width: 420, px: 840 });
  d.edge('expand', 'bottom', 'dash', 'top');
  sticky(2290, 2120, 400, 'The dashboard exists because Chrome caps popups at 600 px tall. It receives the source tab id so it can still read what’s playing.', 1);
  sticky(2290, 2330, 400, 'Evaluation focus: status visibility (skeletons, live status line), error recovery (S2, Error), user control (×, Esc, Newest), privacy clarity (S3, Privacy).', -1);

  return d;
}
