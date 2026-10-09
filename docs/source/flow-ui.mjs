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

export const UI_FLOW_SIZE = { w: 2780, h: 3040 };

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
  d.text(60, 90, 'Popup 480 × 600 (Chrome’s maximum popup height) · dark theme default · every screen is a real capture of the built UI', { size: 15, fill: T.ink2 });
  d.text(60, 118, 'Reddit threads in screenshots are illustrative sample data; Substack articles come from real public RSS feeds.', { size: 13, fill: T.ink3 });

  // legend
  d.rect(1900, 30, 820, 112, { rx: 14, fill: '#fff', stroke: T.border });
  d.text(1922, 44, 'HOW TO READ', { size: 11, weight: 700, fill: T.ink3, letterSpacing: '0.12em' });
  d.polyline([[1924, 84], [2004, 84]], { stroke: T.line });
  d.text(2016, 84, 'User action', { size: 13, valign: 'middle', fill: T.ink2 });
  d.polyline([[2130, 84], [2210, 84]], { stroke: T.accent, dash: '7 5' });
  d.text(2222, 84, 'Error / fallback', { size: 13, valign: 'middle', fill: T.ink2 });
  connector(2392, 84, 'A');
  d.text(2414, 84, 'Jump to the same letter', { size: 13, valign: 'middle', fill: T.ink2 });
  d.rect(1924, 108, 46, 22, { rx: 4, fill: '#fff3a3', stroke: '#e9d860' });
  d.text(1982, 119, 'Design note', { size: 13, valign: 'middle', fill: T.ink2 });
  d.rect(2130, 108, 46, 22, { rx: 11, fill: T.accentSoft, stroke: T.accent });
  d.text(2188, 119, 'Entry / start state', { size: 13, valign: 'middle', fill: T.ink2 });

  // global controls
  d.rect(60, 160, 2660, 64, { rx: 14, fill: T.dark, stroke: T.dark });
  d.text(86, 192, 'ON EVERY SCREEN', { size: 11, weight: 700, fill: T.accentMid, valign: 'middle', letterSpacing: '0.14em' });
  d.text(250, 192, 'Search  ( / focuses · Enter runs · Esc clears )    ·    Tabs: Trending Reddit ⇄ Related Reading  ( ← → )    ·    ⚙ Settings    ·    ⤢ Full dashboard    ·    “Private by design” footer → Privacy settings', { size: 14.5, fill: '#e8e8ee', valign: 'middle' });

  // ── sections ──────────────────────────────────────────────────────────────
  section(30, 250, 1000, 2760, 'A · ENTRY & DETECTION');
  section(1050, 250, 760, 2760, 'B · DISCOVERY');
  section(1830, 250, 400, 2760, 'C · EXTERNAL');
  section(2250, 250, 500, 2760, 'D · SETTINGS & DASHBOARD');

  // ── A: entry ──────────────────────────────────────────────────────────────
  d.node('start', 'terminator', 70, 320, 230, 78, 'User clicks the Rabbit Hole toolbar icon', { fill: T.dark, stroke: T.dark, color: '#fff', size: 14 });
  d.text(70, 410, '● badge appears on YouTube / Netflix watch pages', { size: 12, fill: T.ink3, maxWidth: 230 });
  d.node('dec', 'decision', 70, 470, 230, 170, 'What is on the page?', { fill: T.warnSoft, stroke: T.warn, size: 14 });
  d.edge('start', 'bottom', 'dec', 'top');

  const ROW = (i) => 340 + i * 440;
  const LX = 540;
  const s1 = screen('s1', LX, ROW(0), '01-reading-youtube.png', 'S1 · Related Reading (watching)', 'Context bar “Watching”, topics searched, article cards with relevance label.', { tag: 'ENTRY' });
  const s2 = screen('s2', LX, ROW(1), '07-netflix-undetected.png', 'S2 · Netflix not detected', 'Honest fallback: explains why and offers a manual search box.', { tag: 'ENTRY' });
  const s3 = screen('s3', LX, ROW(2), '14-detection-off.png', 'S3 · Detection switched off', 'Privacy control respected: nothing is read until the user turns it on.', { tag: 'ENTRY' });
  const s4 = screen('s4', LX, ROW(3), '12-bridge-reddit-thread.png', 'S4 · On a Reddit thread', 'Bridge call-to-action: find deeper reading.', { tag: 'ENTRY' });
  const s5 = screen('s5', LX, ROW(4), '13-bridge-substack-article.png', 'S5 · On a Substack article', 'Bridge call-to-action: see what Reddit thinks.', { tag: 'ENTRY' });
  const s6 = screen('s6', LX, ROW(5), '08-idle-use-this-page.png', 'S6 · Any other website', 'Nothing is read. “Use this page” only on click; or search a topic.', { tag: 'ENTRY' });

  // decision → screens: a vertical bus with labelled branches
  const busX = 360;
  d.polyline([[300, 555], [busX, 555]], { arrow: false });
  d.polyline([[busX, ROW(0) + s1.h / 2], [busX, ROW(5) + s6.h / 2]], { arrow: false });
  [
    [s1, 'YouTube video / Short or Netflix title found'],
    [s2, 'Netflix, player label hidden'],
    [s3, 'Detection off in Settings → Privacy'],
    [s4, 'Reddit thread'],
    [s5, 'Substack article'],
    [s6, 'Any other website'],
  ].forEach(([s, text], i) => {
    const y = s.y + s.h / 2;
    d.polyline([[busX, y], [s.x - 4, y]]);
    d.label(450, y - 30, text, { size: 11, fill: T.ink2, bg: T.canvas, maxWidth: 116 });
  });

  // ── B: discovery ──────────────────────────────────────────────────────────
  const BX = 1100;
  const m0 = screen('m0', BX, ROW(0), '03-trending-watching.png', 'Trending Reddit', '“Because you’re watching” rows, topic filters, four sections. Cache-first: paints instantly, then refreshes.');
  const m1 = screen('m1', BX, ROW(1), '09-search-loading.png', 'Searching…', 'Skeletons + “Finding related writing…” — never a blank screen.');
  const m2 = screen('m2', BX + 280, ROW(1), '10-search-results.png', 'Search results', 'Found N relevant posts. Topics searched are shown.');
  const m2b = screen('m2b', BX + 280, ROW(2), '11-search-reddit-results.png', 'Reddit results (query)', 'Same query on the Trending tab; “Back to trending” returns.');
  const m3 = screen('m3', BX, ROW(3), '21-bridge-thread-result.png', 'Reading — from the thread', 'The thread headline becomes the search; context bar says “Reading”.');
  const m4 = screen('m4', BX, ROW(4), '22-bridge-article-result.png', 'What Reddit thinks', 'Discussions about the article’s topic.');
  const m5 = screen('m5', BX, ROW(5), '23-use-this-page-result.png', 'Reading — this page', 'Context shows “Web”; user-initiated only.');

  // S1 → Trending
  d.edge('s1', 'right', 'm0', 'left', { label: 'Tab: Trending Reddit', labelAt: [(s1.x + s1.w + m0.x) / 2, ROW(0) + s1.h / 2 - 24], labelOpts: { bg: T.canvas, maxWidth: 110, size: 11 } });
  // S2 → search chain
  d.edge('s2', 'right', 'm1', 'left', { label: 'Type title → Find related writing', labelAt: [(s2.x + s2.w + m1.x) / 2, ROW(1) + s2.h / 2 - 28], labelOpts: { bg: T.canvas, maxWidth: 112, size: 11 } });
  d.edge('m1', 'right', 'm2', 'left', { label: 'Results arrive', labelAt: [(m1.x + m1.w + m2.x) / 2, ROW(1) + m1.h / 2 - 18], labelOpts: { bg: T.canvas, maxWidth: 50, size: 10.5 } });
  d.edge('m2', 'bottom', 'm2b', 'top', { label: 'Trending Reddit tab', labelAt: [m2.x + m2.w / 2, ROW(1) + m2.h + 88], labelOpts: { bg: T.canvas, maxWidth: 110, size: 11 } });
  // S3 → search or back to S1
  d.edge('s3', 'right', 'm1', 'left', { via: [[s3.x + s3.w + 40, ROW(2) + s3.h / 2], [s3.x + s3.w + 40, ROW(1) + m1.h / 2]], label: 'Or search a topic', labelAt: [s3.x + s3.w + 40, ROW(2) + s3.h / 2 - 28], labelOpts: { bg: T.canvas, size: 11, maxWidth: 96 } });
  connector(s3.x - 28, s3.y + 40, 'A');
  connector(s1.x - 28, s1.y + 40, 'A');
  lab(450, s3.y + 40, 'Turn on detection\n→ back to S1', { size: 11, maxWidth: 100 });
  // S4, S5, S6
  d.edge('s4', 'right', 'm3', 'left', { label: 'Find deeper reading →', labelAt: [(s4.x + s4.w + m3.x) / 2, ROW(3) + s4.h / 2 - 28], labelOpts: { bg: T.canvas, maxWidth: 112, size: 11 } });
  d.edge('s5', 'right', 'm4', 'left', { label: 'See what Reddit thinks →', labelAt: [(s5.x + s5.w + m4.x) / 2, ROW(4) + s5.h / 2 - 28], labelOpts: { bg: T.canvas, maxWidth: 112, size: 11 } });
  d.edge('s6', 'right', 'm5', 'left', { label: '“Use this page”', labelAt: [(s6.x + s6.w + m5.x) / 2, ROW(5) + s6.h / 2 - 24], labelOpts: { bg: T.canvas, maxWidth: 108, size: 11 } });
  connector(s6.x + s6.w + 20, s6.y + 28, 'B');
  connector(m1.x - 20, m1.y + 28, 'B');
  lab(s6.x + s6.w + 70, s6.y + 28, 'or type a topic →', { size: 11, maxWidth: 100 });

  // article ⇄ thread bridges from every card
  sticky(BX + 280, ROW(3) + 20, 330, 'Bridges are available on every card: article → “See what Reddit thinks →”, thread → “Find deeper reading →”. The two products feel like one loop.', -1.5);
  sticky(BX + 280, ROW(4) + 40, 330, 'Detection off? Two exits: turn it back on, or simply search. Rabbit Hole never reads a page without consent.', 1.2);
  sticky(BX + 280, ROW(5) + 30, 330, 'Because “Use this page” needs the temporary activeTab grant, it is offered only from the popup — not from the full dashboard.', -1);

  // ── C: external ───────────────────────────────────────────────────────────
  d.node('e1', 'terminator', 1870, ROW(0) + 40, 320, 86, 'Substack article', { fill: '#fff', stroke: T.ink, size: 16, weight: 700, sub: 'opens in a new tab (Read on Substack →)' });
  d.node('e2', 'terminator', 1870, ROW(0) + 190, 320, 86, 'Reddit thread', { fill: '#fff', stroke: T.ink, size: 16, weight: 700, sub: 'opens in a new tab (Open Reddit →)' });
  connector(1893, ROW(0) + 40 - 20, 'E', T.cool);
  connector(1893, ROW(0) + 190 - 20, 'E', T.cool);
  d.text(1920, ROW(0) + 20, 'from every article card', { size: 11.5, fill: T.ink3, valign: 'middle' });
  d.text(1920, ROW(0) + 170, 'from every Reddit card', { size: 11.5, fill: T.ink3, valign: 'middle' });
  [m2, m3, m5].forEach((m, i) => {
    connector(m.x + m.w + 22, m.y + 120 + i * 0, 'E', T.cool);
  });
  d.edge('m0', 'right', 'e2', 'left', { offsetFrom: -30, via: [[BX + m0.w + 4, ROW(0) + m0.h / 2 - 30], [1790, ROW(0) + m0.h / 2 - 30], [1790, ROW(0) + 233], [1870, ROW(0) + 233]], label: 'Open Reddit →', labelAt: [1560, ROW(0) + m0.h / 2 - 30], labelOpts: { bg: T.canvas, size: 11, maxWidth: 90 } });

  const err = screen('err', 1870, ROW(1), '15-error-reddit.png', 'Error state — Reddit unavailable', 'Plain-language cause, one clear action. Stale data is shown (flagged) when available.', { width: 280, px: 560 });
  d.polyline([[BX + m0.w + 4, ROW(0) + m0.h / 2 + 110], [1840, ROW(0) + m0.h / 2 + 110], [1840, err.y + err.h / 2], [err.x - 4, err.y + err.h / 2]], { stroke: T.accent, dash: '7 5' });
  d.label(1590, ROW(0) + m0.h / 2 + 110, 'All Reddit providers fail', { size: 11, fill: T.accent, bg: T.canvas, maxWidth: 118 });
  sticky(1870, ROW(2) + 110, 330, 'Every failure has a message, a next step and a way out: Try again · manual search · Settings · Open Reddit.', 1);

  // ── D: settings & dashboard ───────────────────────────────────────────────
  d.node('gear', 'terminator', 2290, 320, 420, 56, '⚙ Header icon  or  footer “Private by design”', { fill: T.dark, stroke: T.dark, color: '#fff', size: 14 });
  const st1 = screen('st1', 2290, 460, '17-settings-overview.png', 'Settings', 'Reddit · Related Reading; autosaves.', { width: 180, px: 360 });
  const st2 = screen('st2', 2550, 460, '18-settings-privacy.png', 'Privacy', 'Read / stored / sent; detection switches.', { width: 180, px: 360 });
  const st3 = screen('st3', 2290, 880, '19-settings-integrations.png', 'API & Integrations', 'Keys are write-only (masked).', { width: 180, px: 360 });
  const st4 = screen('st4', 2550, 880, '16-light-theme.png', 'Appearance → Light', 'Dark default; Light / System.', { width: 180, px: 360 });
  d.edge('gear', 'bottom', 'st1', 'top', { via: [[2380, 376], [2380, 460]] });
  d.edge('st1', 'right', 'st2', 'left', { label: 'Privacy', labelOpts: { bg: T.canvas, size: 11, maxWidth: 60 } });
  d.edge('st1', 'bottom', 'st3', 'top', { label: 'Integrations', labelAt: [2380, 800], labelOpts: { bg: T.canvas, size: 11, maxWidth: 80 } });
  d.edge('st2', 'bottom', 'st4', 'top', { label: 'Theme', labelAt: [2640, 800], labelOpts: { bg: T.canvas, size: 11, maxWidth: 60 } });

  d.node('expand', 'terminator', 2290, 1340, 420, 56, '⤢ Header icon: open the full dashboard', { fill: T.dark, stroke: T.dark, color: '#fff', size: 14 });
  const dash = screen('dash', 2290, 1450, '20-dashboard.png', 'Full dashboard (tab)', 'Two columns when wide: Reddit left, Related Reading right. Same app, same state.', { width: 420, px: 840 });
  d.edge('expand', 'bottom', 'dash', 'top');
  sticky(2290, 1850, 400, 'The dashboard exists because Chrome caps popups at 600 px tall. It receives the source tab id so it can still read “what’s playing”.', 1);
  sticky(2290, 2060, 400, 'Heuristic evaluation focus areas: status visibility (skeletons), error recovery (S2, Error), user control (× / Esc / Back to trending), and privacy clarity (S3, Privacy).', -1);

  return d;
}
