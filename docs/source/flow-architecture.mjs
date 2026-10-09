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
  d.text(40, 76, 'Manifest V3 · all network access lives in the background worker · pages and content scripts never talk to the internet', { size: 15, fill: T.ink2 });

  // ── column 1: browser tabs ────────────────────────────────────────────────
  d.frame(40, 120, 380, 1000, 'Browser tabs', { fill: '#faf9f6' });
  const pages = [
    ['YouTube', 'watch pages and Shorts', 'content/youtube.ts'],
    ['Netflix', 'watch and title pages', 'content/netflix.ts'],
    ['Reddit', 'thread pages', 'content/reddit.ts'],
    ['Substack', '*.substack.com articles', 'content/generic.ts (static)'],
    ['Any other website', 'read only after “Use this page”', 'content/generic.ts (on demand)'],
  ];
  pages.forEach(([name, sub, script], i) => {
    const y = 170 + i * 188;
    d.registerNode(`page${i}`, 70, y, 320, 160);
    d.rect(70, y, 320, 160, { rx: 12, fill: T.surface, stroke: T.border, sw: 1.5 });
    d.text(90, y + 16, name, { size: 17, weight: 700 });
    d.text(90, y + 44, sub, { size: 12.5, fill: T.ink2 });
    d.rect(90, y + 76, 280, 62, { rx: 9, fill: T.accentSoft, stroke: T.accent, sw: 1.2 });
    d.text(104, y + 86, script, { size: 12.5, weight: 600, fill: T.accent });
    d.text(104, y + 108, i === 4 ? 'injected via activeTab + scripting' : 'idle: answers one message, no observers', { size: 11, fill: T.ink2 });
  });

  // ── column 2 top: extension pages ─────────────────────────────────────────
  d.frame(500, 120, 760, 190, 'Extension pages (React 19 · TypeScript · plain CSS)', { fill: T.coolSoft, stroke: T.cool });
  [['Popup', '480 × 600 · tabs · search · cards'], ['Dashboard', 'same app in a tab · two columns'], ['Settings', 'privacy · keys · data · theme']].forEach(([t, b], i) => {
    const x = 520 + i * 245;
    d.rect(x, 168, 225, 112, { rx: 12, fill: T.surface, stroke: T.cool, sw: 1.5 });
    d.text(x + 16, 182, t, { size: 16, weight: 700 });
    d.text(x + 16, 210, b, { size: 12.5, fill: T.ink2, maxWidth: 195 });
  });

  // ── column 2: background service worker ──────────────────────────────────
  d.frame(500, 370, 760, 600, 'Background service worker (Manifest V3, ES module)', { fill: '#fbfaf8' });
  d.registerNode('rpc', 520, 410, 720, 78);
  d.rect(520, 410, 720, 78, { rx: 12, fill: T.dark, stroke: T.dark });
  d.text(542, 424, 'RPC server — typed messages over a chrome.runtime port', { size: 15, weight: 700, fill: '#fff' });
  d.text(542, 450, 'cancellable · aborts work when the page closes · accepts connections from the extension’s own pages only', { size: 12.5, fill: '#cfcfd6' });

  const L = 520, R = 890, W = 350, H = 100;
  card(d, 'ctxm', L, 508, W, H, 'ContextManager', 'active tab → content script → ContentContext; per-tab RAM cache, dropped on navigation', { accent: T.accent });
  card(d, 'pipe', L, 618, W, H, 'Context pipeline', 'platform → metadata → topics → entities → concept expansion → search queries', { accent: T.accent });
  card(d, 'cache', L, 728, W, H, 'CacheService', 'TTL 5 / 10 / 30 min · stale-if-error · in-flight de-duplication · ref-counted cancel', { accent: T.good });
  card(d, 'sets', L, 838, W, H, 'Settings & Secrets', 'validated preferences; API keys are write-only (masked status only)', { accent: T.good });

  card(d, 'reddit', R, 508, W, H, 'RedditService', 'providers: OAuth → public JSON → Atom feed · circuit breaker · snapshots Δ · trending score', { accent: T.cool });
  card(d, 'sub', R, 618, W, H, 'SubstackService', 'search API / backend / RSS feeds → merge & validate → relevance score → diversity', { accent: T.cool });
  card(d, 'ai', R, 728, W, H, 'AiService (optional, opt-in)', 'topics, queries, relevance judging; structured JSON; refusal fallbacks', { accent: T.cool });
  card(d, 'bc', R, 838, W, H, 'Backend client', 'uses the optional proxy so keys never live in the extension', { accent: T.cool });
  d.text(520, 944, '+ tab tracker · ● toolbar badge · refresh alarm (only while the extension is in use)', { size: 11.5, fill: T.ink3 });

  // ── column 2 bottom: storage ──────────────────────────────────────────────
  d.frame(500, 1010, 760, 190, 'Storage (local to this browser)', { fill: '#faf9f6' });
  d.node('local', 'store', 530, 1056, 330, 124, 'chrome.storage.local', { fill: T.surface, size: 14, weight: 700, sub: 'settings · API keys you add (never synced)' });
  d.node('session', 'store', 900, 1056, 330, 124, 'chrome.storage.session', { fill: T.surface, size: 14, weight: 700, sub: 'RAM-only caches & snapshots (wiped on exit)' });

  // ── column 3: external services ───────────────────────────────────────────
  d.frame(1380, 120, 380, 1080, 'External services (HTTPS + host permissions)', { fill: T.warnSoft, stroke: T.warn });
  const ext = [
    ['Reddit', 'OAuth API (client id) · public JSON · official Atom feeds', 'ext0'],
    ['Substack', 'publication RSS feeds (newest 12 items) · article pages open in a new tab', 'ext1'],
    ['Brave Search API', 'site:substack.com queries — key in Settings or on the backend', 'ext2'],
    ['Anthropic API (optional)', 'claude-opus-5-5 by default; topics, judging, explanations', 'ext3'],
    ['Backend proxy (optional)', 'Cloudflare Worker / Node. Holds the Brave + Anthropic keys, validates, rate-limits', 'ext4'],
  ];
  ext.forEach(([t, b, id], i) => {
    const y = 170 + i * 200;
    d.registerNode(id, 1400, y, 340, 170);
    d.rect(1400, y, 340, 170, { rx: 12, fill: T.surface, stroke: T.warn, sw: 1.5 });
    d.text(1420, y + 16, t, { size: 16, weight: 700 });
    d.text(1420, y + 46, b, { size: 12.5, fill: T.ink2, maxWidth: 300 });
  });

  // ── arrows ────────────────────────────────────────────────────────────────
  // content scripts <-> ContextManager
  d.polyline([[420, 536], [520, 536]], { stroke: T.accent });
  d.polyline([[520, 580], [420, 580]], { stroke: T.good });
  d.label(462, 508, 'tabs.sendMessage\n“rh/extract”', { size: 10.5, fill: T.accent, maxWidth: 90, bg: '#faf9f6' });
  d.label(462, 612, 'RawPage-\nMetadata', { size: 10.5, fill: T.good, maxWidth: 80, bg: '#faf9f6' });

  // pages <-> rpc
  d.polyline([[1010, 310], [1010, 410]], { stroke: T.cool });
  d.polyline([[1040, 410], [1040, 310]], { stroke: T.cool });
  d.label(1180, 360, 'typed RPC (port)', { size: 11, fill: T.cool, maxWidth: 140, bg: '#fff' });
  d.polyline([[880, 488], [880, 508]], { stroke: T.line, arrow: false });

  // services -> externals
  d.edge('reddit', 'right', 'ext0', 'left', { via: [[1300, 558], [1300, 255]], stroke: T.cool });
  d.edge('sub', 'right', 'ext1', 'left', { via: [[1320, 650], [1320, 455]], stroke: T.cool, offsetFrom: -12 });
  d.edge('sub', 'right', 'ext2', 'left', { via: [[1340, 690], [1340, 655]], stroke: T.cool, offsetFrom: 14 });
  d.edge('ai', 'right', 'ext3', 'left', { via: [[1300, 778], [1300, 855]], stroke: T.cool });
  d.edge('bc', 'right', 'ext4', 'left', { via: [[1320, 888], [1320, 1055]], stroke: T.cool });
  d.label(1300, 405, 'fetch (HTTPS)', { size: 10.5, fill: T.cool, bg: '#fff', maxWidth: 80 });

  // storage
  d.polyline([[690, 970], [690, 1056]], { stroke: T.good });
  d.polyline([[1060, 970], [1060, 1056]], { stroke: T.good });
  d.label(690, 1006, 'settings · keys', { size: 10.5, fill: T.good, bg: '#fbfaf8', maxWidth: 120 });
  d.label(1060, 1006, 'caches · snapshots', { size: 10.5, fill: T.good, bg: '#fbfaf8', maxWidth: 130 });

  return d;
}
