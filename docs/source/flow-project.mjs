/** The end-to-end project flowchart (standard flowchart symbols). */
import { Diagram, THEME as T } from './svg.mjs';

export const PROJECT_FLOW_SIZE = { w: 2260, h: 2520 };

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
  d.text(60, 82, 'From the toolbar click to one exact movie or show — then four tabs about it, until the user opens something', { size: 15, fill: T.ink2 });

  // ── identify the title (centre column, x = 1000) ─────────────────────────
  d.node('start', 'terminator', 820, 130, 360, 74, 'START — user clicks the Rabbit Hole toolbar icon (or opens the dashboard)', { ...END, size: 13 });
  d.node('p1', 'process', 805, 238, 390, 74, 'Popup renders instantly with skeletons and opens an RPC port to the background service worker', P);
  d.node('p2', 'process', 825, 346, 350, 66, 'Background worker reads settings and resolves the active tab', P);
  d.node('d1', 'decision', 790, 446, 420, 150, 'Detection on AND the tab is a Netflix watch or title page?', { ...WARN, size: 13 });
  d.node('p3', 'process', 825, 636, 350, 78, 'Content script (idle until asked) reads the page once: player label, JSON-LD, Media Session', COOL);
  d.node('d2', 'decision', 835, 748, 330, 128, 'Title identified?', WARN);
  d.node('p4', 'process', 825, 914, 350, 70, 'Topics, entities and search queries from the title, episode, genres and cast', P);
  d.node('p5', 'subprocess', 805, 1018, 390, 92, 'Resolve the exact title on Wikidata: name · kind · catalogue tag “(U.S.)” · year · cast overlap — or show nothing', { ...ACC, size: 12 });
  d.node('ctx', 'io', 790, 1144, 420, 76, 'Subject: one exact movie or show (cast, subreddit, IMDb / TMDB ids …)', ACC);

  d.node('idle', 'process', 1330, 477, 340, 88, 'Nothing is read. The notice points to the title search', { ...P, fill: '#f6f5f2' });
  d.node('undetected', 'process', 1330, 768, 340, 88, '“Couldn’t identify what’s playing” — hover the player and reopen, or search', { ...P, fill: '#f6f5f2' });
  d.node('search', 'subprocess', 1330, 1010, 340, 110, 'Title search: type → Wikidata movies & series (with year, kind) → ↑ ↓ Enter to pick', { ...COOL, size: 12.5 });

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
  d.edge('idle', 'bottom', 'undetected', 'top', { dash: '5 4' });
  d.edge('undetected', 'bottom', 'search', 'top', { dash: '5 4' });
  d.edge('search', 'bottom', 'ctx', 'right', { via: [[1500, 1182]] });
  d.label(1500, 1150, 'picked', { size: 11, fill: T.cool, weight: 700, maxWidth: 80 });
  d.node('free', 'process', 1760, 1010, 300, 110, 'Or “Search Reddit and articles for …” — a free-text topic, for Discuss and Read only', { ...P, fill: '#f6f5f2', size: 12 });
  d.edge('search', 'right', 'free', 'left', { dash: '5 4' });

  // ── fork ──────────────────────────────────────────────────────────────────
  const COLS = [45, 595, 1145, 1695];
  const CW = 520;
  const cx = (i) => COLS[i] + CW / 2;
  d.rect(cx(0), 1272, cx(3) - cx(0), 8, { rx: 4, fill: T.ink });
  d.polyline([[1000, 1220], [1000, 1272]], { arrow: false });
  d.label(1000, 1250, 'four tabs about the same subject', { size: 11, fill: T.ink2, maxWidth: 300 });
  const head = (i, text) => d.text(COLS[i], 1300, text, { size: 13, weight: 700, fill: T.accent, letterSpacing: '0.1em' });
  head(0, 'A — DISCUSS (Reddit)');
  head(1, 'B — READ');
  head(2, 'C — ABOUT');
  head(3, 'D — WATCH NEXT');
  const box = (id, kind, i, y, h, text, st, o = {}) => d.node(id, kind, COLS[i] + 30, y, CW - 60, h, text, { ...st, ...o });
  [0, 1, 2, 3].forEach((i) => d.polyline([[cx(i), 1280], [cx(i), 1330]]));

  // A — Discuss
  box('a1', 'process', 0, 1330, 92, 'Plan ≤ 4 searches: the show’s own subreddit (episode, or top threads) → TV / film subreddits → all of Reddit', P, { size: 12 });
  box('a2', 'decision', 0, 1452, 130, 'Sort: most relevant or newest?', WARN, { size: 12 });
  box('a3', 'process', 0, 1612, 92, 'Provider chain with circuit breaker: OAuth API → public JSON → official Atom feed (sort = relevance / new)', P, { size: 12 });
  box('a4', 'subprocess', 0, 1734, 130, 'Keep only threads about the show: own subreddit · TV/film community · title as a name · cast / character · viewer words. Work & office subs need a cast name', { ...ACC, size: 11.5 });
  box('a5', 'process', 0, 1894, 80, 'Rank: match × where (own sub 1.5, TV 1.2) × momentum — or newest first', P, { size: 12 });
  box('a6', 'io', 0, 2004, 84, 'Thread cards: subreddit · votes · comments · “Find deeper reading →”', OK, { size: 12 });
  ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'].reduce((prev, cur) => (d.edge(prev, 'bottom', cur, 'top'), cur));

  // B — Read
  box('b1', 'process', 1, 1330, 80, '3–5 focused queries from the title, cast and themes', P, { size: 12 });
  box('b2', 'process', 1, 1440, 130, 'In parallel: Substack (search API or curated RSS) · Medium tag feeds · news outlets’ RSS (opt-in: per-title + recent) · NYT / Guardian (backend)', P, { size: 11.5 });
  box('b3', 'process', 1, 1600, 92, 'Merge · validate (HTTPS, publisher’s own host, dates) · de-duplicate', P, { size: 12 });
  box('b4', 'subprocess', 1, 1722, 100, 'Your sources: hide · prefer (ranks as top tier) · only preferred · English only', { ...ACC, size: 12 });
  box('b5', 'subprocess', 1, 1852, 112, 'Relevance 0–100 = 0.45 semantic + 0.20 keyword + 0.15 entity + 0.10 recency + 0.10 source', { ...ACC, size: 11.5 });
  box('b6', 'io', 1, 1994, 94, 'Article cards: label · excerpt · “Why this is relevant” · “See what Reddit thinks →”', OK, { size: 12 });
  ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'].reduce((prev, cur) => (d.edge(prev, 'bottom', cur, 'top'), cur));

  // C — About
  box('c1', 'process', 2, 1330, 110, 'Wikidata facts: cast in billing order with characters, X / Instagram, creators, genres, Wikipedia', P, { size: 12 });
  box('c2', 'process', 2, 1470, 92, 'Review links from validated ids: IMDb (+ reviews) · Letterboxd · Rotten Tomatoes', P, { size: 12 });
  box('c3', 'decision', 2, 1592, 140, 'Backend with TMDB / OMDb keys?', WARN, { size: 12 });
  box('c4', 'process', 2, 1772, 100, 'Ratings (IMDb · RT · Metacritic · TMDB) · viewer reviews · On Netflix India? (JustWatch via TMDB)', COOL, { size: 11.5 });
  box('c5', 'io', 2, 2004, 84, 'About: facts · ratings · review links · cast with social links', OK, { size: 12 });
  ['c1', 'c2', 'c3'].reduce((prev, cur) => (d.edge(prev, 'bottom', cur, 'top'), cur));
  d.edge('c3', 'bottom', 'c4', 'top', { label: 'Yes', labelAt: [cx(2), 1752], labelOpts: { fill: T.good, weight: 700 } });
  d.edge('c4', 'bottom', 'c5', 'top');
  d.edge('c3', 'right', 'c5', 'right', { via: [[COLS[2] + CW - 6, 1662], [COLS[2] + CW - 6, 2046]], dash: '5 4' });
  d.label(COLS[2] + CW - 6, 1900, 'No: facts + links only', { size: 10.5, fill: T.accent, maxWidth: 90 });

  // D — Watch next
  box('w1', 'process', 3, 1330, 110, 'Wikidata: titles sharing the six leading cast members, or the director / creator — ranked by people shared, then fame', P, { size: 11.5 });
  box('w2', 'decision', 3, 1470, 140, 'Backend with a TMDB key?', WARN, { size: 12 });
  box('w3', 'process', 3, 1650, 100, 'TMDB similar titles + Netflix India check for the top 10 · mapped back to Wikidata so “Explore” works', COOL, { size: 11.5 });
  box('w4', 'process', 3, 1780, 100, 'Filters: Movies / Series · decade · sort (closest link · best known · newest) · On Netflix India', P, { size: 11.5 });
  box('w5', 'io', 3, 2004, 84, 'Picks with the real link (“With Steve Carell”) · Explore · Find on Netflix', OK, { size: 12 });
  d.edge('w1', 'bottom', 'w2', 'top');
  d.edge('w2', 'bottom', 'w3', 'top', { label: 'Yes', labelAt: [cx(3), 1630], labelOpts: { fill: T.good, weight: 700 } });
  d.edge('w3', 'bottom', 'w4', 'top');
  d.edge('w4', 'bottom', 'w5', 'top');
  d.edge('w2', 'right', 'w4', 'right', { via: [[COLS[3] + CW - 6, 1540], [COLS[3] + CW - 6, 1830]], dash: '5 4' });
  d.label(COLS[3] + CW - 6, 1700, 'No', { size: 10.5, fill: T.accent, weight: 700, maxWidth: 40 });

  // ── user action ───────────────────────────────────────────────────────────
  d.node('d7', 'decision', 810, 2190, 380, 170, 'What does the user do next?', { ...WARN, size: 14 });
  d.polyline([[cx(0), 2088], [cx(0), 2150], [cx(3), 2150], [cx(3), 2088]], { arrow: false });
  [1, 2].forEach((i) => d.polyline([[cx(i), 2088], [cx(i), 2150]], { arrow: false }));
  d.polyline([[1000, 2150], [1000, 2190]]);

  d.node('end1', 'terminator', 160, 2248, 440, 54, 'END — thread, article, review page or profile opens in a new tab', END);
  d.node('end2', 'terminator', 820, 2420, 360, 54, 'END — popup closed; in-flight requests cancelled', END);
  d.edge('d7', 'left', 'end1', 'right', { label: 'Open a link', labelAt: [705, 2275], labelOpts: { fill: T.ink2, maxWidth: 90 } });
  d.edge('d7', 'bottom', 'end2', 'top', { label: 'Close', labelAt: [1000, 2398], labelOpts: { fill: T.ink2 } });

  // loop-back: bridges, Explore and new searches give a new subject
  d.polyline([[1190, 2275], [2238, 2275], [2238, 1182], [1210, 1182]], { stroke: T.accent, dash: '7 5', sw: 2 });
  d.label(1720, 2335, 'Loop: Explore a Watch next pick · pick another title · “Find deeper reading →” · “See what Reddit thinks →” · Most relevant ⇄ Newest', { size: 11.5, fill: T.accent, weight: 600, maxWidth: 520, border: T.accent });

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
