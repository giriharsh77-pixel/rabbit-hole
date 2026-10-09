/**
 * Content of the project report (HTML fragments).  Numbers that change with the
 * code (tests, bundle sizes, permissions, versions) are injected from `facts`
 * so the report cannot drift from the repository.
 */
import { readFileSync } from 'node:fs';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const kb = (n) => `${Math.round(n / 1024)} KB`;

export const table = (head, rows, cls = '') =>
  `<table class="${cls}"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`;

export const fig = (file, caption, { cls = '', w } = {}) =>
  `<figure class="shot ${cls}"${w ? ` style="width:${w}"` : ''}><img src="../screens/${file}" alt="${esc(caption)}"/><figcaption>${caption}</figcaption></figure>`;

const callout = (title, body, tone = '') => `<aside class="callout ${tone}"><b>${title}</b><p>${body}</p></aside>`;

export const sections = (f) => {
  const { tests, files, e2e, loc, bundle, perFile, manifest, pkg, seeds, origins, dateLong } = f;
  const swatch = (hex, name, use) => `<div class="sw"><i style="background:${hex}"></i><b>${name}</b><span>${hex}</span><em>${use}</em></div>`;

  return [
    // ───────────────────────────────────────────────────────────────────────
    {
      id: 'summary',
      title: 'Executive summary',
      html: `
<p class="lead">Rabbit Hole is a Chrome extension (Manifest V3) that turns <em>what you are watching</em> into <em>what to read next</em>. It pairs two views of the internet — what is moving on <b>Reddit</b> right now, and thoughtful long-form writing on <b>Substack</b> related to a YouTube video or Netflix title — and bridges them: any thread can lead to deeper reading, and any article can lead to the discussion around it.</p>

<div class="stats">
  <div><b>${tests}</b><span>automated tests<br/>in ${files} files, all passing</span></div>
  <div><b>${e2e}/${e2e}</b><span>real-Chrome end-to-end<br/>checks (Chrome 155)</span></div>
  <div><b>${seeds}</b><span>health-checked Substack<br/>publications (keyless mode)</span></div>
  <div><b>${bundle.total}</b><span>production build;<br/>content scripts 6–9 KB each</span></div>
</div>

<h3>What was built</h3>
<ul>
  <li><b>Trending Reddit</b> — threads ranked by <em>momentum</em> (upvote and comment velocity, recency, cross-community spread and measured growth), not total votes; four sections, ten topic filters, instant cache-first rendering.</li>
  <li><b>Related Reading</b> — a context pipeline detects the video or title, derives topics and entities, generates focused queries and ranks Substack posts with a transparent 0–100 relevance score, always with a plain-language <i>“Why this is relevant”</i>.</li>
  <li><b>Privacy as a feature</b> — nothing is read until the extension is opened, only on four sites, with per-platform switches, a “What Rabbit Hole used” disclosure, RAM-only caches and a minimal permission set.</li>
  <li><b>Resilience</b> — Reddit blocks anonymous traffic and Substack has no public search API, so each has a provider chain with graceful degradation and honest messaging instead of fabricated data.</li>
</ul>

<h3>How it was verified</h3>
<p>Unit and integration tests cover ranking, extraction, caching and failure handling; a release gate proves development keys cannot reach a production bundle; and an end-to-end suite loads the <em>built</em> extension in a real Chrome and drives the real popup against the real service worker. A usability-evaluation pack (heuristic evaluation, cognitive walkthrough, think-aloud test, SUS, accessibility audit, error-state matrix and A/B plan) accompanies this report as a fillable form.</p>
${callout('Scope note', 'Live Reddit data could not be verified from the build machine (Reddit answered 403 to JSON and 429 to feeds); that path is verified against a captured real feed and mocked responses. Netflix detection is verified against fixtures that mirror its markup, and the optional AI layer against a stubbed API transport. See §9.1.', 'warn')}`,
    },

    // ───────────────────────────────────────────────────────────────────────
    {
      id: 'problem',
      title: 'Problem, goals and users',
      html: `
<h3>1.1 Problem statement</h3>
<p>Curiosity strikes while watching: a video mentions a technology, a series raises an idea. Following it means leaving the page, guessing a search query, and sorting through results that are optimised for clicks. Meanwhile, social discussion (Reddit) and considered writing (Substack) live in separate places, and Reddit’s front pages reward <em>total votes</em> rather than what is <em>gaining momentum</em>. There is no lightweight bridge between “what everyone is discussing now” and “what thoughtful people have written about this”.</p>

<h3>1.2 Goals and non-goals</h3>
${table(
  ['#', 'Goal', 'Measure of success'],
  [
    ['G1', 'Surface what is trending on Reddit by momentum, with growth indicators', 'Fresh fast-growing threads outrank older high-total threads (tested)'],
    ['G2', 'Understand what the user is watching on YouTube / Netflix without breaking terms or playback', 'Extraction on watch pages, Shorts, episodes; graceful “can’t identify” fallback'],
    ['G3', 'Recommend relevant Substack writing and explain every pick', 'Relevance 0–100 with labels; grounded “Why this is relevant”'],
    ['G4', 'Bridge Reddit ⇄ Substack', '“Find deeper reading →” and “See what Reddit thinks →” on every card'],
    ['G5', 'Privacy first: no history, no tracking, minimal permissions, user control', 'Permission audit, per-platform switches, RAM-only caches, release gate'],
    ['G6', 'Keep working when data sources are blocked, limited or offline', 'Provider chain + circuit breaker; stale-if-error; friendly error states'],
    ['G7', 'Fast, accessible, polished', 'Instant skeleton paint; keyboard operable; WCAG-minded contrast; reduced motion'],
  ],
)}
<p class="note"><b>Non-goals:</b> scraping Reddit or Substack HTML; bypassing Netflix DRM or authentication; collecting browsing history; replacing a search engine; mobile browsers.</p>

<h3>1.3 Target users (illustrative personas)</h3>
<div class="personas">
  <div><b>The curious viewer</b><i>Aanya, 20 · CS undergraduate</i><p>Watches technical YouTube and series. Wants the “why” behind what she sees, in readable essays, without a research detour.</p><span>Needs: instant relevance, explanations, low effort</span></div>
  <div><b>The trend watcher</b><i>Rahul, 34 · product manager</i><p>Scans Reddit for what is gaining traction in his field. Distrusts raw vote counts; wants to know what is <em>rising</em>.</p><span>Needs: momentum signals, topic filters, speed</span></div>
  <div><b>The privacy-conscious reader</b><i>Meera, 41 · journalist</i><p>Reluctant to install extensions that “read every page”. Will adopt only if she can see and control exactly what is read and sent.</p><span>Needs: transparency, control, minimal permissions</span></div>
</div>

<h3>1.4 The core journey</h3>
<div class="journey">
  <div><b>1</b>Watching something</div><i>→</i>
  <div><b>2</b>Rabbit Hole understands the topic</div><i>→</i>
  <div><b>3</b>Shows what Reddit is discussing</div><i>→</i>
  <div><b>4</b>Finds thoughtful Substack writing</div><i>→</i>
  <div><b>5</b>Go further down the rabbit hole</div>
</div>

<h3>1.5 Requirements</h3>
${table(
  ['ID', 'Requirement', 'Status', 'Evidence'],
  [
    ['FR1', 'Trending Reddit with four sections and topic filters', 'Done', 'redditRanking tests; e2e'],
    ['FR2', 'Detect YouTube video / Short and Netflix title / episode', 'Done', 'extractor tests; e2e on fixture pages'],
    ['FR3', 'Manual search and “What are you watching?” fallback', 'Done', 'contextManager tests; e2e'],
    ['FR4', 'Substack discovery: search API + curated RSS fallback', 'Done', 'failureHandling, parsers tests'],
    ['FR5', 'Relevance 0–100 with labels and explanations', 'Done', 'relevance tests (18)'],
    ['FR6', 'Reddit ⇄ Substack bridges', 'Done', 'UI flow screens 12, 13, 21, 22'],
    ['FR7', 'Settings: Reddit, Related Reading, Privacy, Appearance, Integrations, Data', 'Done', 'e2e (toggle persists)'],
    ['FR8', 'Optional AI layer (topics, queries, judging)', 'Done (opt-in)', 'anthropicProvider tests (stubbed)'],
    ['NFR1', 'Cache aggressively; de-duplicate; cancel stale requests', 'Done', 'cache tests (17)'],
    ['NFR2', 'Strict CSP; validated, sanitised external data', 'Done', 'manifest + release gate + e2e'],
    ['NFR3', 'Minimal permissions', 'Done', 'manifest tests; e2e'],
    ['NFR4', 'Keyboard and screen-reader support', 'Done — audit pending', 'Usability form, Method F'],
  ],
  'compact',
)}`,
    },

    // ───────────────────────────────────────────────────────────────────────
    {
      id: 'tour',
      title: 'Product tour',
      html: `
<p>Every screen below is a capture of the built interface (480 × 600 px, Chrome’s maximum popup height). Reddit threads are <b>illustrative sample data</b>; Substack articles come from real public RSS feeds.</p>

<h3>2.1 Related Reading — the core experience</h3>
<div class="row2">
${fig('01-reading-youtube.png', '<b>Context bar</b> says what was detected (“Watching — YouTube · Fireship”). Topics searched are shown; a banner is honest that only a curated list is searched without a search key.')}
${fig('02-article-why-relevant.png', '<b>Article card:</b> relevance label, publication · author · date, excerpt, matched topics and a grounded <i>Why this is relevant</i>. Two actions: read, or see what Reddit thinks.')}
</div>

<h3>2.2 Trending Reddit — momentum, not just votes</h3>
<div class="row2">
${fig('03-trending-watching.png', '<b>Because you’re watching</b> shows threads related to the video as compact rows. Topic chips filter by community group; four sections rank by trending score.')}
${fig('04-trending-cards.png', '<b>Thread cards:</b> subreddit, preview, ↑ upvotes, comments and a <i>growth label</i> (e.g. “Growing rapidly”) derived from measured velocity.')}
</div>

<h3>2.3 Netflix and the honest fallback</h3>
<div class="row2">
${fig('06-netflix-detected.png', '<b>Episode detected</b> from the player label (Black Mirror · Season 7, Episode 2); themes expand to genre concepts.')}
${fig('07-netflix-undetected.png', '<b>When Netflix hides its labels</b> the extension says so and offers a manual box — it never guesses.')}
</div>

<h3>2.4 Search, loading and bridges</h3>
<div class="row3">
${fig('09-search-loading.png', '<b>Loading:</b> skeletons and “Finding related writing…” — never a blank screen.')}
${fig('10-search-results.png', '<b>Results:</b> “Exploring — AI agents”; N relevant posts.')}
${fig('11-search-reddit-results.png', '<b>Same query on Reddit</b> with “Back to trending”.')}
</div>
<div class="row3">
${fig('12-bridge-reddit-thread.png', '<b>On a Reddit thread:</b> “Find deeper reading →”.')}
${fig('21-bridge-thread-result.png', '<b>Result:</b> thread headline becomes the search (“Reading”).')}
${fig('13-bridge-substack-article.png', '<b>On a Substack article:</b> “See what Reddit thinks →”.')}
</div>

<h3>2.5 Privacy, errors and appearance</h3>
<div class="row3">
${fig('14-detection-off.png', '<b>Detection off:</b> the page is not read; offers to turn on or search.')}
${fig('15-error-reddit.png', '<b>Error state:</b> plain cause, one clear action.')}
${fig('16-light-theme.png', '<b>Light theme:</b> dark by default; Light/System available.')}
</div>

<h3>2.6 Settings and full dashboard</h3>
<div class="row2 settings">
${fig('18-settings-privacy.png', '<b>Settings → Privacy</b> spells out what is read, stored and sent, with switches per platform and an opt-in for AI.')}
${fig('19-settings-integrations.png', '<b>API &amp; Integrations</b>: keys are write-only; permissions requested only when a key is added.')}
</div>
<figure class="shot wide-shot"><img src="../screens/20-dashboard.png" alt="Dashboard"/><figcaption><b>Full dashboard</b> (⤢): the same app in a tab, two columns when wide — Reddit left, Related Reading right. It exists because Chrome caps popups at 600 px tall.</figcaption></figure>`,
    },

    // ───────────────────────────────────────────────────────────────────────
    {
      id: 'design',
      title: 'UX and visual design',
      html: `
<h3>3.1 Design principles</h3>
<ol class="principles">
  <li><b>Understand, then act.</b> The first thing shown is <em>what Rabbit Hole understood</em> (the context bar), so users can trust or correct it.</li>
  <li><b>Never blank, never silent.</b> Skeleton loaders, a live status line and an explanation for every empty or failed state.</li>
  <li><b>Honest by default.</b> Missing data stays missing; limited coverage and feed-mode are announced; relevance is shown as a label, not a fake percentage.</li>
  <li><b>User in control.</b> Dismiss (×), Esc to clear, “Back to trending”, per-platform detection switches, delete-everything.</li>
  <li><b>Minimal chrome, premium feel.</b> Charcoal surfaces, one electric-orange accent, generous spacing, subtle motion (Arc / Linear / Readwise sensibility).</li>
</ol>

<h3>3.2 Visual language</h3>
<div class="swatches">
  ${swatch('#0b0b0d', 'Background', 'dark base')}
  ${swatch('#141417', 'Surface', 'cards')}
  ${swatch('#1a1a1f', 'Surface 2', 'insets')}
  ${swatch('#f4f4f6', 'Text', 'primary')}
  ${swatch('#a8a8b3', 'Text 2', 'secondary')}
  ${swatch('#ff5a24', 'Accent', 'text / icons')}
  ${swatch('#d63a0b', 'Accent solid', 'fills · 4.7:1 on white text')}
  ${swatch('#3fdc97', 'Good', 'watching · success')}
  ${swatch('#ffb633', 'Warn', 'rising')}
  ${swatch('#7aa2ff', 'Cool', 'info · cooling')}
</div>
${table(
  ['Aspect', 'Decision'],
  [
    ['Typography', 'System UI sans stack (SF / Segoe / Roboto) — no remote fonts (privacy, CSP, speed); 13.5 px base; tabular numerals for counts; weights 560–700 for hierarchy'],
    ['Layout', '480 × 600 popup: fixed header + search + tabs, scrolling panel, pinned privacy footer. Dashboard: max-width 1240 px, two columns ≥ 980 px'],
    ['Shape &amp; depth', '10–18 px radii, 1 px hairline borders, no heavy shadows; hover raises border contrast'],
    ['Motion', '150–280 ms transitions; staggered-free “rise” on cards; pulsing live dot; all disabled under <code>prefers-reduced-motion</code>'],
    ['Theming', 'CSS custom properties; dark default; Light and System; theme hint applied before first paint (no flash)'],
    ['Iconography', 'Inline SVG line icons; emoji only for category labels (🔥 📈 💬 🌎) where they carry meaning'],
  ],
  'compact',
)}

<h3>3.3 Accessibility measures built in</h3>
${table(
  ['Area', 'Implementation'],
  [
    ['Keyboard', 'Every control is a real button/link; “/” focuses search; ←/→/Home/End move between tabs (roving tabindex); Enter submits; Esc clears'],
    ['Screen readers', 'Tablist/tabpanel roles; <code>aria-live</code> status line (“Found N relevant posts”); labelled icon buttons; stats have text alternatives (“63400 upvotes”)'],
    ['Focus', 'Visible 2 px accent focus ring on all interactive elements'],
    ['Colour', 'Filled buttons use #d63a0b (4.7:1 with white); growth state is conveyed by text <em>and</em> a dot, never colour alone'],
    ['Motion', 'Animations disabled for reduced-motion users'],
    ['Target size', 'Buttons 28–32 px tall; icon buttons 32 × 32 (WCAG 2.2 minimum 24 px)'],
  ],
  'compact',
)}
<p class="note">A formal WCAG 2.2 AA audit is part of the evaluation pack (Method F); the above are design intentions, not a certification.</p>`,
    },

    // ───────────────────────────────────────────────────────────────────────
    {
      id: 'system',
      title: 'System design',
      html: `
<h3>4.1 Architecture at a glance</h3>
<p>The extension has three runtime contexts. <b>Content scripts</b> are tiny and passive: they do nothing until asked, then read the page once and reply. <b>Extension pages</b> (popup, dashboard, settings) are a React app that never touches the network. The <b>background service worker</b> owns everything else — all network access, caching, key handling, ranking — and talks to the pages over a typed, cancellable RPC port. The full diagram is on the next page.</p>

<h3>4.2 The context pipeline</h3>
${table(
  ['Stage', 'Module', 'What it does'],
  [
    ['1 · Platform detector', '<code>context/platform.ts</code>', 'Pure URL logic: YouTube watch/Shorts/live, Netflix watch/title, Reddit thread, Substack article; look-alike hosts rejected'],
    ['2 · Metadata extractor', '<code>context/extractors/*</code>', 'DOM → <code>RawPageMetadata</code> in the page: visible title/channel/description/keywords (YouTube), player label + JSON-LD (Netflix), thread markup (Reddit)'],
    ['3 · Topic extraction', '<code>context/topics.ts</code>', 'Clean title → RAKE-style phrases (stop-words and filler verbs act as delimiters) → weighted by source (title 3, keywords ~1.9, description 1)'],
    ['4 · Entities', '<code>context/topics.ts</code>', 'Brands/people/titles; Title-Case aware so “AI Agents” is a topic, not a name; known-entity list; cast from JSON-LD'],
    ['5 · Concept expansion', '<code>context/ontology.ts</code>', 'On-device concept graph (“AI agents” → AI coding, developer tools, automation …); genre → themes; or the AI layer'],
    ['6 · Query generation', '<code>context/queries.ts</code>', '3–5 focused, de-duplicated queries (entity-anchored, topic-anchored, concept-anchored); AI queries first when enabled'],
    ['7 · Discovery', '<code>substackService.ts</code>', 'Search providers (backend / Brave key) in parallel; curated RSS feeds as keyless fallback and supplement'],
    ['8 · Ranking', '<code>ranking/relevance.ts</code>', 'Transparent 0–100 score, content-gated labels, diversity re-rank'],
    ['9 · Results', 'React UI', 'Cards with “Why this is relevant”'],
  ],
  'compact',
)}

<h3>4.3 Ranking algorithms</h3>
<div class="formula"><b>Reddit trending score</b>
<code>trending = recency × engagementVelocity × commentVelocity × popularity × growth</code>
<ul>
<li><b>recency</b> = 0.25 + 0.5<sup>(ageHours / 10)</sup> — fresh threads dominate, old ones fade</li>
<li><b>engagementVelocity</b> = 1 + log<sub>10</sub>(1 + score / (age + 1)) &nbsp;·&nbsp; <b>commentVelocity</b> = 1 + log<sub>10</sub>(1 + comments / (age + 1))</li>
<li><b>popularity</b> = 1 + 0.12·log<sub>10</sub>(1+score) + 0.12·min(cross-community, 5) + 0.08·(extra listings) + 0.15·(preferred subreddit)</li>
<li><b>growth</b> = 1 + 0.33·log<sub>10</sub>(1 + measured upvotes/hour ÷ 10), measured against the previous refresh snapshot</li>
</ul></div>
<div class="formula"><b>Article relevance (0–100)</b>
<code>relevance = 100 × (0.45·semantic + 0.20·keyword + 0.15·entity + 0.10·recency + 0.10·sourceQuality)</code>
<ul>
<li><b>semantic</b>: concept-weighted cosine similarity over stemmed terms, saturated to 0–1; common stems (“ai”, “data”) down-weighted like a cheap IDF</li>
<li><b>keyword / entity</b>: phrase and name matches, title matches weighted higher; entity weight is redistributed when the content has no named entities</li>
<li><b>recency</b>: e<sup>−age/150 days</sup>; unknown dates get a neutral value — never a guessed date</li>
<li><b>Labels</b>: Highly relevant ≥ 70 · Very relevant ≥ 52 · Related ≥ 36 · else Somewhat related — and the top two also require genuine content overlap, so freshness and source quality alone can never earn “Highly relevant”</li>
</ul></div>

<h3>4.4 Data sources and graceful degradation</h3>
${table(
  ['Source', 'Providers (tried in order)', 'When a provider fails'],
  [
    ['Reddit', '① Official OAuth API (client id) · ② public JSON · ③ official Atom feeds', 'Circuit breaker skips a blocked/rate-limited provider for minutes; feeds carry no counts, so the UI says so and ranks by Reddit’s own order'],
    ['Substack search', '① Optional backend proxy · ② Brave Search API key (<code>site:substack.com</code>)', 'Falls back to curated RSS; reports which providers failed'],
    ['Substack feeds', `${seeds} curated publications (${origins} custom-domain origins via opt-in permission); newest 12 items, streamed`, 'Per-feed failures ignored; error only if all fail'],
    ['AI (optional)', 'Backend or user’s Anthropic key; structured JSON, low effort, refusal fallbacks', 'Silently degrades to on-device heuristics'],
  ],
  'compact',
)}

<h3>4.5 Caching and performance</h3>
${table(
  ['Data', 'TTL', 'Behaviour'],
  [
    ['Reddit trending / search', '5 min', 'Cache-first paint; refresh in background; stale-if-error (up to 6 h, flagged)'],
    ['Substack search', '10 min', 'Keyed by context + settings'],
    ['Publication feeds', '30 min', 'Only the first 12 items are downloaded (feeds can be 2 MB+)'],
    ['AI analysis', '60 min', 'Keyed by the exact (truncated) input'],
    ['Page context', 'Until the tab navigates', 'Per-tab, RAM only (<code>storage.session</code>)'],
    ['In-flight requests', '—', 'Identical concurrent calls share one fetch; cancellation is reference-counted'],
  ],
  'compact',
)}
<p>Other performance measures: debounced search (450 ms), cancel-stale-request on every new search, skeleton paint before data, no polling (the only timer is an optional background refresh, paused after two idle hours), lazy per-tab fetching, 6–9 KB content scripts.</p>`,
    },
  ];
};

export const facts = ({ perFile, tests, files, manifest, root }) => {
  const pkg = JSON.parse(readFileSync(`${root}/package.json`, 'utf8'));
  return { pkg, manifest, perFile, tests, files };
};
export { esc, kb, callout };
