/** System architecture: who talks to whom, over what. */
import { Diagram, THEME as T } from './svg.mjs';

export const ARCH_SIZE = { w: 1800, h: 1290 };

function card(d, id, x, y, w, h, title, body, { fill = T.surface, stroke = T.ink, accent = T.ink, tag } = {}) {
  d.registerNode(id, x, y, w, h);
  d.rect(x, y, w, h, { rx: 12, fill, stroke, sw: 1.6 });
  d.rect(x, y + 12, 5, h - 24, { rx: 2.5, fill: accent });
  d.text(x + 22, y + 14, title, { size: 15, weight: 700, fill: T.ink });
  d.text(x + 22, y + 40, body, { size: 12.5, fill: T.ink2, maxWidth: w - 38, lineHeight: 1.32 });
  if (tag) d.label(x + w - 16 - tag.length * 3, y + 16, tag, { size: 10, fill: accent, bg: '#fff', border: accent, maxWidth: 120 });
}

export function architectureDiagram() {
  const d = new Diagram(ARCH_SIZE.w, ARCH_SIZE.h);
  d.text(40, 34, 'Rabbit Hole — system architecture', { size: 30, weight: 700 });
  d.text(40, 76, 'Manifest V3 · Netflix is the only page ever read · all network access lives in the background worker · API keys only on the optional backend', { size: 15, fill: T.ink2 });

  // ── column 1: browser tabs ────────────────────────────────────────────────
  d.frame(40, 120, 380, 1080, 'Browser tabs', { fill: '#faf9f6' });
  d.registerNode('page0', 70, 170, 320, 210);
  d.rect(70, 170, 320, 210, { rx: 12, fill: T.surface, stroke: T.border, sw: 1.5 });
  d.text(90, 186, 'Netflix', { size: 17, weight: 700 });
  d.text(90, 214, 'watch pages (episode / movie) and title pages', { size: 12.5, fill: T.ink2, maxWidth: 280 });
  d.rect(90, 262, 280, 96, { rx: 9, fill: T.accentSoft, stroke: T.accent, sw: 1.2 });
  d.text(104, 272, 'content/netflix.ts', { size: 12.5, weight: 600, fill: T.accent });
  d.text(104, 294, 'idle until asked; reads the player label, JSON-LD and Media Session once — never the video or DRM', { size: 11, fill: T.ink2, maxWidth: 255 });

  d.rect(70, 410, 320, 170, { rx: 12, fill: '#f6f5f2', stroke: T.border, sw: 1.5, dash: '6 5' });
  d.text(90, 426, 'Every other website', { size: 17, weight: 700, fill: T.ink2 });
  d.text(90, 456, 'YouTube, Reddit, Substack, your bank… — never read. No content script runs there and the extension cannot even see those tabs’ URLs (verified in real Chrome).', { size: 12.5, fill: T.ink3, maxWidth: 280 });

  d.rect(70, 610, 320, 250, { rx: 12, fill: T.surface, stroke: T.border, sw: 1.5 });
  d.text(90, 626, 'Off Netflix', { size: 17, weight: 700 });
  d.text(90, 656, 'The title search in the popup (“Search a movie or show…”) makes every tab work for any title — nothing from the page is needed.', { size: 12.5, fill: T.ink2, maxWidth: 280 });
  d.text(90, 760, 'Results open in new tabs: Reddit threads, articles, IMDb / Letterboxd / Rotten Tomatoes, X / Instagram, Netflix search.', { size: 12, fill: T.ink3, maxWidth: 280 });

  // ── column 2 top: extension pages ─────────────────────────────────────────
  d.frame(500, 120, 760, 190, 'Extension pages (React 19 · TypeScript · plain CSS)', { fill: T.coolSoft, stroke: T.cool });
  [['Popup', '480 × 600 · title search · Discuss · Read · About · Watch next'], ['Dashboard', 'same app in a tab · three columns when wide'], ['Settings', 'privacy · your sources · Discuss sort · keys · data']].forEach(([t, b], i) => {
    const x = 520 + i * 245;
    d.rect(x, 168, 225, 112, { rx: 12, fill: T.surface, stroke: T.cool, sw: 1.5 });
    d.text(x + 16, 182, t, { size: 16, weight: 700 });
    d.text(x + 16, 210, b, { size: 12.5, fill: T.ink2, maxWidth: 195 });
  });

  // ── column 2: background service worker ──────────────────────────────────
  d.frame(500, 340, 760, 650, 'Background service worker (Manifest V3, ES module)', { fill: '#fbfaf8' });
  d.registerNode('rpc', 520, 380, 720, 70);
  d.rect(520, 380, 720, 70, { rx: 12, fill: T.dark, stroke: T.dark });
  d.text(542, 392, 'RPC server — typed messages over a chrome.runtime port', { size: 15, weight: 700, fill: '#fff' });
  d.text(542, 418, 'cancellable · aborts work when the page closes · accepts the extension’s own pages only', { size: 12.5, fill: '#cfcfd6' });

  const L = 520, R = 890, W = 350, H = 92, Y = (i) => 468 + i * 102;
  card(d, 'ctxm', L, Y(0), W, H, 'ContextManager', 'Netflix tab → content script → ContentContext; per-tab RAM cache, dropped on navigation', { accent: T.accent });
  card(d, 'pipe', L, Y(1), W, H, 'Context pipeline', 'title → topics → entities → concepts → focused search queries', { accent: T.accent });
  card(d, 'cache', L, Y(2), W, H, 'CacheService', 'TTLs 5 min – 24 h · stale-if-error · in-flight de-duplication · ref-counted cancel', { accent: T.good });
  card(d, 'sets', L, Y(3), W, H, 'Settings & Secrets', 'validated preferences (sources, sort…); keys write-only; news permission sync', { accent: T.good });
  card(d, 'ai', L, Y(4), W, H, 'AiService (optional, opt-in)', 'topics, queries, relevance judging; structured JSON — via the backend or your key', { accent: T.cool });

  card(d, 'reddit', R, Y(0), W, H, 'RedditService — Discuss', 'own subreddit → TV/film subs → all Reddit · “about the show” filter · relevant / newest', { accent: T.cool });
  card(d, 'title', R, Y(1), W, H, 'TitleService (Wikidata)', 'title search · exact-title resolve · cast in billing order · ids · Watch next links', { accent: T.accent });
  card(d, 'sub', R, Y(2), W, H, 'Read discovery + NewsProvider', 'Substack · Medium · 22 news feeds · NYT / Guardian → your sources → relevance', { accent: T.cool });
  card(d, 'bc', R, Y(3), W, H, 'Backend client', 'ratings, reviews, similar titles, Netflix India, press archives — re-validated', { accent: T.cool });
  card(d, 'badge', R, Y(4), W, H, 'Tab tracker', '● toolbar badge on Netflix watch pages; per-tab context dropped when a tab navigates', { accent: T.good });

  // ── column 2 bottom: storage ──────────────────────────────────────────────
  d.frame(500, 1010, 760, 190, 'Storage (local to this browser)', { fill: '#faf9f6' });
  d.node('local', 'store', 530, 1056, 330, 124, 'chrome.storage.local', { fill: T.surface, size: 14, weight: 700, sub: 'settings · API keys you add (never synced)' });
  d.node('session', 'store', 900, 1056, 330, 124, 'chrome.storage.session', { fill: T.surface, size: 14, weight: 700, sub: 'RAM-only caches (wiped on exit)' });

  // ── column 3: external services ───────────────────────────────────────────
  d.frame(1380, 120, 380, 1080, 'External services (HTTPS)', { fill: T.warnSoft, stroke: T.warn });
  const ext = [
    ['Reddit', 'OAuth API (client id) · public JSON · official Atom feeds', 'ext0'],
    ['Wikidata', 'wbsearchentities / wbgetentities API + SPARQL query service · keyless, CC0', 'ext1'],
    ['Substack · Medium', 'publication RSS (curated, newest 12) · Medium tag feeds', 'ext2'],
    ['News outlets (opt-in)', '22 sites’ RSS — Indian Express, HT, The Hindu, NYT, Guardian, Variety… · optional permission', 'ext3'],
    ['Backend proxy (optional)', 'Cloudflare Worker / Node holding the keys: TMDB · OMDb · NYT · Guardian · Brave · Anthropic', 'ext4'],
  ];
  ext.forEach(([t, b, id], i) => {
    const y = 170 + i * 200;
    d.registerNode(id, 1400, y, 340, 170);
    d.rect(1400, y, 340, 170, { rx: 12, fill: T.surface, stroke: T.warn, sw: 1.5 });
    d.text(1420, y + 16, t, { size: 16, weight: 700 });
    d.text(1420, y + 46, b, { size: 12.5, fill: T.ink2, maxWidth: 300 });
  });

  // ── arrows ────────────────────────────────────────────────────────────────
  d.polyline([[390, 300], [455, 300], [455, Y(0) + 30], [520, Y(0) + 30]], { stroke: T.accent });
  d.polyline([[520, Y(0) + 64], [440, Y(0) + 64], [440, 330], [390, 330]], { stroke: T.good });
  d.label(455, 254, 'rh/extract', { size: 10.5, fill: T.accent, maxWidth: 90, bg: '#faf9f6' });
  d.label(440, 390, 'RawPage-\nMetadata', { size: 10.5, fill: T.good, maxWidth: 80, bg: '#faf9f6' });

  // pages <-> rpc
  d.polyline([[1010, 310], [1010, 380]], { stroke: T.cool });
  d.polyline([[1040, 380], [1040, 310]], { stroke: T.cool });
  d.label(1130, 325, 'typed RPC (port)', { size: 11, fill: T.cool, maxWidth: 140, bg: '#fff' });

  // services -> externals (one lane each, no crossings)
  d.edge('reddit', 'right', 'ext0', 'left', { via: [[1290, Y(0) + 46], [1290, 255]], stroke: T.cool });
  d.edge('title', 'right', 'ext1', 'left', { via: [[1305, Y(1) + 46], [1305, 455]], stroke: T.accent });
  d.edge('sub', 'right', 'ext2', 'left', { via: [[1320, Y(2) + 32], [1320, 655]], stroke: T.cool, offsetFrom: -14 });
  d.edge('sub', 'right', 'ext3', 'left', { via: [[1335, Y(2) + 60], [1335, 855]], stroke: T.cool, offsetFrom: 14 });
  d.edge('bc', 'right', 'ext4', 'left', { via: [[1350, Y(3) + 46], [1350, 1040]], stroke: T.cool });
  d.edge('ai', 'left', 'ext4', 'bottom', { via: [[470, Y(4) + 46], [470, 1235], [1570, 1235]], stroke: T.cool, dash: '5 4' });
  d.label(1000, 1235, 'AI layer: through the backend, or the user’s own key', { size: 10.5, fill: T.cool, bg: '#fff', maxWidth: 320 });
  d.label(1300, 345, 'fetch (HTTPS)', { size: 10.5, fill: T.cool, bg: '#fff', maxWidth: 80 });

  // storage
  d.polyline([[620, 990], [620, 1056]], { stroke: T.good });
  d.polyline([[1100, 990], [1100, 1056]], { stroke: T.good });
  d.label(620, 1000, 'settings · keys', { size: 10.5, fill: T.good, bg: '#fff', maxWidth: 120 });
  d.label(1100, 1000, 'caches', { size: 10.5, fill: T.good, bg: '#fff', maxWidth: 130 });

  return d;
}
