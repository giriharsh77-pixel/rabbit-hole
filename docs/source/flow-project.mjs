/** The end-to-end project flowchart (standard flowchart symbols). */
import { Diagram, THEME as T } from './svg.mjs';

export const PROJECT_FLOW_SIZE = { w: 2260, h: 2760 };

export function projectFlowchart() {
  const d = new Diagram(PROJECT_FLOW_SIZE.w, PROJECT_FLOW_SIZE.h);
  const P = { fill: T.surface, stroke: T.ink };
  const ACC = { fill: T.accentSoft, stroke: T.accent };
  const OK = { fill: T.goodSoft, stroke: T.good };
  const COOL = { fill: T.coolSoft, stroke: T.cool };
  const WARN = { fill: T.warnSoft, stroke: T.warn };
  const END = { fill: T.dark, stroke: T.dark, color: '#fff' };

  // ── title ─────────────────────────────────────────────────────────────────
  d.text(60, 40, 'Rabbit Hole — project flowchart', { size: 30, weight: 700 });
  d.text(60, 82, 'What happens from the moment the toolbar icon is clicked until the user opens an article or thread', { size: 15, fill: T.ink2 });

  // ── common pipeline (centre column, x = 1000) ─────────────────────────────
  d.node('start', 'terminator', 820, 130, 360, 74, 'START — user clicks the Rabbit Hole toolbar icon (or opens the dashboard)', { ...END, size: 13 });
  d.node('p1', 'process', 805, 238, 390, 74, 'Popup renders instantly with skeleton loaders and opens an RPC port to the background service worker', P);
  d.node('p2', 'process', 825, 346, 350, 66, 'Background worker reads settings and resolves the active tab', P);
  d.node('d1', 'decision', 790, 446, 420, 150, 'Detection enabled AND page is YouTube / Netflix / Reddit thread / Substack?', { ...WARN, size: 13 });
  d.node('p3', 'process', 825, 636, 350, 78, 'Content script (idle until asked) reads the page once: DOM, JSON-LD, Media Session', { ...COOL });
  d.node('d2', 'decision', 835, 748, 330, 128, 'Metadata identified?', { ...WARN });
  d.node('p4', 'process', 825, 914, 350, 78, 'Topic, entity & keyword extraction; expand concepts with the ontology (or the AI layer)', P);
  d.node('p5', 'subprocess', 825, 1026, 350, 66, 'Build ContentContext + 3–5 search queries', P);
  d.node('ctx', 'io', 800, 1128, 400, 70, 'ContentContext ready (or a manual search query)', { ...ACC });

  d.node('idle', 'process', 1330, 477, 340, 88, 'Idle: nothing is read. Offer manual search and “Use this page” (only on the user’s click)', { ...P, fill: '#f6f5f2' });
  d.node('undetected', 'process', 1330, 768, 340, 88, 'Show “We couldn’t automatically identify what you’re watching” + manual search box', { ...P, fill: '#f6f5f2' });

  d.edge('start', 'bottom', 'p1', 'top');
  d.edge('p1', 'bottom', 'p2', 'top');
  d.edge('p2', 'bottom', 'd1', 'top');
  d.edge('d1', 'bottom', 'p3', 'top', { label: 'Yes', labelAt: [1000, 616], labelOpts: { fill: T.good, weight: 700 } });
  d.edge('d1', 'right', 'idle', 'left', { label: 'No', labelOpts: { fill: T.accent, weight: 700 } });
  d.edge('p3', 'bottom', 'd2', 'top');
  d.edge('d2', 'bottom', 'p4', 'top', { label: 'Yes', labelAt: [1000, 896], labelOpts: { fill: T.good, weight: 700 } });
  d.edge('d2', 'right', 'undetected', 'left', { label: 'No', labelOpts: { fill: T.accent, weight: 700 } });
  d.edge('p4', 'bottom', 'p5', 'top');
  d.edge('p5', 'bottom', 'ctx', 'top');
  // the two "fallback" boxes rejoin the pipeline at the context node
  d.edge('idle', 'right', 'ctx', 'right', { via: [[1730, 521], [1730, 1163]], dash: '5 4' });
  d.edge('undetected', 'right', 'ctx', 'right', { via: [[1700, 812], [1700, 1163]], dash: '5 4' });

  // ── fork ──────────────────────────────────────────────────────────────────
  d.rect(470, 1252, 1060, 8, { rx: 4, fill: T.ink });
  d.label(1000, 1226, 'two independent branches run in parallel', { size: 11, fill: T.ink2, maxWidth: 300 });

  // ── LEFT: related reading ────────────────────────────────────────────────
  d.text(40, 1282, 'BRANCH A — RELATED READING (Substack)', { size: 13, weight: 700, fill: T.accent, letterSpacing: '0.1em' });
  d.node('l1', 'process', 320, 1310, 300, 74, 'Generate 3–5 focused queries (entity + topic + concept; AI queries first when enabled)', P);
  d.node('l2', 'decision', 310, 1414, 320, 126, 'Search provider configured? (backend or Brave key)', { ...WARN, size: 12 });
  d.node('l3a', 'process', 40, 1580, 290, 78, 'Query the search API with site:substack.com (several queries in parallel)', P);
  d.node('l3b', 'process', 610, 1580, 290, 78, 'Read curated Substack RSS feeds (newest 12 items each, streamed)', P);
  d.node('l4', 'process', 320, 1700, 300, 78, 'Merge · validate (HTTPS, hosts, dates) · de-duplicate by canonical URL', P);
  d.node('l5', 'subprocess', 300, 1812, 340, 110, 'Relevance 0–100 = 0.45 semantic + 0.20 keyword + 0.15 entity + 0.10 recency + 0.10 source quality', { ...ACC, size: 12 });
  d.node('l6', 'decision', 310, 1956, 320, 120, 'AI layer enabled?', { ...WARN });
  d.node('l7a', 'process', 40, 2112, 290, 74, 'LLM judges relevance and writes “Why this is relevant” (grounded in title/excerpt)', COOL);
  d.node('l7b', 'process', 610, 2112, 290, 74, 'Template explanation built from the topics that actually matched', P);
  d.node('l8', 'process', 320, 2220, 300, 74, 'Apply minimum relevance, diversity cap (≤ 2 per publication) and result limit', P);
  d.node('l9', 'io', 300, 2328, 340, 80, 'Render article cards: label · excerpt · tags · “Why this is relevant”', OK);

  d.edge('ctx', 'bottom', 'l1', 'top', { via: [[1000, 1252], [470, 1252]], stroke: T.line });
  d.edge('l1', 'bottom', 'l2', 'top');
  d.edge('l2', 'left', 'l3a', 'top', { label: 'Yes', labelOpts: { fill: T.good, weight: 700 }, labelAt: [250, 1477] });
  d.edge('l2', 'right', 'l3b', 'top', { label: 'No (keyless)', labelOpts: { fill: T.accent, weight: 700 }, labelAt: [690, 1477] });
  d.edge('l3a', 'bottom', 'l4', 'left', { via: [[185, 1739]] });
  d.edge('l3b', 'bottom', 'l4', 'right', { via: [[755, 1739]] });
  d.label(185, 1700, 'thin results (< 8)? also read feeds', { size: 10.5, fill: T.ink3, maxWidth: 150 });
  d.edge('l4', 'bottom', 'l5', 'top');
  d.edge('l5', 'bottom', 'l6', 'top');
  d.edge('l6', 'left', 'l7a', 'top', { label: 'Yes', labelOpts: { fill: T.good, weight: 700 }, labelAt: [250, 2016] });
  d.edge('l6', 'right', 'l7b', 'top', { label: 'No', labelOpts: { fill: T.accent, weight: 700 }, labelAt: [690, 2016] });
  d.edge('l7a', 'bottom', 'l8', 'left', { via: [[185, 2257]] });
  d.edge('l7b', 'bottom', 'l8', 'right', { via: [[755, 2257]] });
  d.edge('l8', 'bottom', 'l9', 'top');

  // ── RIGHT: trending reddit ────────────────────────────────────────────────
  d.text(1100, 1282, 'BRANCH B — TRENDING REDDIT', { size: 13, weight: 700, fill: T.accent, letterSpacing: '0.1em' });
  d.node('r1', 'decision', 1360, 1310, 340, 128, 'Fresh cache (< 5 min) for this topic?', { ...WARN, size: 12 });
  d.node('r2a', 'process', 1760, 1341, 250, 66, 'Serve cached threads instantly', OK);
  d.node('r2', 'process', 1370, 1478, 320, 92, 'Provider chain with circuit breaker: 1 OAuth API → 2 public JSON → 3 official Atom feed', P);
  d.node('r3', 'decision', 1360, 1608, 340, 124, 'Any provider succeeded?', { ...WARN });
  d.node('r3n', 'process', 1760, 1624, 250, 92, 'Show last cached data (flagged stale) or a friendly error with “Try again”', { ...P, fill: '#fdf1ee', stroke: T.accent });
  d.node('r4', 'process', 1370, 1770, 320, 80, 'Merge listings · drop NSFW / stickied · measure Δ upvotes vs. last snapshot', P);
  d.node('r5', 'subprocess', 1350, 1888, 360, 100, 'Trending = recency × upvote velocity × comment velocity × popularity × growth', { ...ACC, size: 12 });
  d.node('r6', 'process', 1370, 2026, 320, 70, 'Rank into 4 sections: Hot · Rising · Discussed · Across', P);
  d.node('r7', 'io', 1350, 2134, 360, 82, 'Render thread cards: ↑ comments · growth label · “Find deeper reading →”', OK);

  d.edge('ctx', 'bottom', 'r1', 'top', { via: [[1000, 1252], [1530, 1252]] });
  d.edge('r1', 'right', 'r2a', 'left', { label: 'Yes', labelOpts: { fill: T.good, weight: 700 } });
  d.edge('r1', 'bottom', 'r2', 'top', { label: 'No', labelAt: [1530, 1458], labelOpts: { fill: T.accent, weight: 700 } });
  d.edge('r2', 'bottom', 'r3', 'top');
  d.edge('r3', 'right', 'r3n', 'left', { label: 'No', labelOpts: { fill: T.accent, weight: 700 } });
  d.edge('r3', 'bottom', 'r4', 'top', { label: 'Yes', labelAt: [1530, 1752], labelOpts: { fill: T.good, weight: 700 } });
  d.edge('r4', 'bottom', 'r5', 'top');
  d.edge('r5', 'bottom', 'r6', 'top');
  d.edge('r6', 'bottom', 'r7', 'top');
  // cached threads skip the network but are re-ranked with the current time
  d.edge('r2a', 'right', 'r5', 'right', { via: [[2050, 1374], [2050, 1938]], dash: '5 4' });
  d.label(2050, 1520, 're-ranked with the current time', { size: 10.5, fill: T.ink3, maxWidth: 110 });
  d.edge('r3n', 'right', 'r7', 'right', { via: [[2090, 1670], [2090, 2175]], dash: '5 4' });

  // ── user action ───────────────────────────────────────────────────────────
  d.node('d7', 'decision', 810, 2470, 380, 170, 'What does the user do next?', { ...WARN, size: 14 });
  d.polyline([[470, 2408], [470, 2440], [1000, 2440]], { arrow: false });
  d.polyline([[1530, 2216], [1530, 2440], [1000, 2440]], { arrow: false });
  d.polyline([[1000, 2440], [1000, 2470]]);

  d.node('end1', 'terminator', 240, 2528, 360, 54, 'END — article / thread opens in a new tab', END);
  d.node('end2', 'terminator', 820, 2672, 360, 54, 'END — popup closed; in-flight requests cancelled', END);
  d.edge('d7', 'left', 'end1', 'right', { label: 'Open article or thread', labelAt: [705, 2555], labelOpts: { fill: T.ink2, maxWidth: 90 } });
  d.edge('d7', 'bottom', 'end2', 'top', { label: 'Close', labelAt: [1000, 2656], labelOpts: { fill: T.ink2 } });

  // loop-back: bridge buttons and new searches start a new context
  d.polyline([[1190, 2555], [2160, 2555], [2160, 1163], [1200, 1163]], { stroke: T.accent, dash: '7 5', sw: 2 });
  d.label(2160, 1500, '“Find deeper reading →”\n“See what Reddit thinks →”\nnew search · topic filter', { size: 11.5, fill: T.accent, weight: 600, maxWidth: 160, border: T.accent });

  // ── legend ────────────────────────────────────────────────────────────────
  const lx = 60, ly = 150;
  d.rect(lx, ly, 330, 258, { rx: 14, fill: '#faf9f6', stroke: T.border });
  d.text(lx + 18, ly + 16, 'LEGEND', { size: 11, weight: 700, fill: T.ink3, letterSpacing: '0.12em' });
  const items = [
    ['terminator', 'Start / end', END],
    ['process', 'Process step', P],
    ['decision', 'Decision', WARN],
    ['io', 'User-visible output', OK],
    ['subprocess', 'Algorithm / sub-process', ACC],
  ];
  items.forEach(([kind, text, st], i) => {
    const y = ly + 44 + i * 40;
    d.node(`lg${i}`, kind, lx + 20, y, 88, 28, '', { ...st, sw: 1.3 });
    d.text(lx + 124, y + 14, text, { size: 13, valign: 'middle', fill: T.ink2 });
  });
  d.add(`<path d="M${lx + 20},${ly + 250} L${lx + 108},${ly + 250}" stroke="${T.accent}" stroke-width="2" stroke-dasharray="7 5"/>`);
  d.text(lx + 124, ly + 244, 'Loop / fallback path', { size: 13, fill: T.ink2 });
  return d;
}
