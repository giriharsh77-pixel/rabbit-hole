import { callout, table } from './report-content.mjs';

const AREAS = {
  'redditRanking.test.ts': ['Reddit ranking', 'trending score, growth classification, cross-community counts, four categories, feed-only mode'],
  'topicExtraction.test.ts': ['Topic extraction & query generation', 'spec examples, Title-Case entities, tag stripping, Netflix themes, manual searches, AI-first queries'],
  'relevance.test.ts': ['Relevance scoring', 'formula weights, 0–100 bounds, labels, content gating, explanations, diversity, AI blending'],
  'platform.test.ts': ['Platform detection', 'YouTube/Netflix/Reddit/Substack URL rules, look-alike hosts, junk input'],
  'youtubeExtractor.test.ts': ['YouTube metadata extraction', 'watch page, Shorts, stale SPA <meta>, tab-title fallback, registry safety'],
  'netflixExtractor.test.ts': ['Netflix metadata extraction', 'player label, movie vs episode, JSON-LD, Media Session, title-page enrichment, hidden-controls fallback'],
  'cache.test.ts': ['Cache behaviour', 'TTLs, stale-if-error, in-flight de-duplication, ref-counted cancel, eviction, quota failure'],
  'http.test.ts': ['API failure handling (HTTP)', '401/403/404/429/5xx mapping, Retry-After, offline, timeout, cancel, invalid JSON, size limits, partial feed reads'],
  'failureHandling.test.ts': ['API failure handling (services)', 'Reddit OAuth → JSON → RSS chain, circuit breaker, stale data, Substack degradation, empty results'],
  'parsers.test.ts': ['Parsing & validation', 'Reddit JSON/Atom, RSS, search results, URL/date/author sanitising, merge & de-duplicate'],
  'settingsAndSanitize.test.ts': ['Settings, secrets, sanitising', 'clamping, write-only keys, URL allow-lists, HTML → inert text, stemming, formatting'],
  'contextManager.test.ts': ['Context manager', 'consent rules, per-tab cache, privacy switches, undetected/idle states, badge logic'],
  'rpc.test.ts': ['RPC security', 'typed round-trips, cancellation, worker loss, prototype-method tricks, foreign senders refused'],
  'backend.test.ts': ['Backend proxy', 'CORS, rate-limit, validation, no key leakage, extension ⇄ backend contract'],
  'anthropicProvider.test.ts': ['AI provider', 'request shape, prompt-injection fencing, structured output, refusals, error mapping'],
  'manifest.test.ts': ['Manifest & build artefact', 'minimal permissions, no broad hosts, strict CSP, referenced files exist'],
  'builtBackground.test.ts': ['Built service worker smoke', 'boots dist/background.js with no DOM and serves RPC'],
};

export const sections2 = (f) => {
  const { tests, files, e2e, seeds, perFile, manifest, pkg, origins } = f;
  const dep = (n) => pkg.dependencies?.[n] ?? pkg.devDependencies?.[n] ?? '';
  const why = {
    storage: 'Settings (local), API keys you add (local, background-only) and RAM-only caches (session).',
    activeTab: 'Lets “Use this page” read one tab on any site, only after a click.',
    scripting: 'Injects the small reader on demand (tabs opened before install; “Use this page”).',
    alarms: 'Optional background refresh of trending data, paused after two idle hours.',
  };

  return [
    {
      id: 'flowcharts',
      title: 'Flowcharts',
      html: `
<p>Three diagrams document the project; each exists as a vector SVG in <code>docs/flowcharts/</code>. The project flowchart (this section) follows standard flowchart symbols; the architecture diagram is in §4; the UI flow — built from the real screens and ready to import into Figma — closes this section.</p>
<h3>5.1 Project flowchart — overview</h3>
<div class="diagram portrait-full">{{FLOW_FULL}}</div>
<p class="note">The next three pages zoom into each part at a readable size.</p>`,
    },
    { id: 'flow1', hidden: true, html: `<h3>5.2 Part 1 — Capturing the context</h3><div class="diagram">{{FLOW_P1}}</div><p>The popup paints skeletons immediately while the background resolves the active tab. A page is read <b>only</b> if detection is on <em>and</em> the platform is supported; otherwise the user gets manual search and an explicit “Use this page” button. Both fallbacks rejoin the pipeline at the same <code>ContentContext</code> node, so downstream code never cares how the context was obtained.</p>` },
    { id: 'flow2', hidden: true, html: `<h3>5.3 Part 2 — Branch A: Related Reading</h3><div class="diagram">{{FLOW_P2}}</div><p>With a search key or backend, queries run against a search API; without one, curated RSS feeds are read (and also used to supplement thin results). Everything is merged, validated and scored; the optional AI layer judges the front-runners and writes the explanation, otherwise a template names the topics that actually matched.</p>` },
    { id: 'flow3', hidden: true, html: `<h3>5.4 Part 3 — Branch B: Trending Reddit, and what the user does next</h3><div class="diagram">{{FLOW_P3}}</div><div class="diagram strip">{{FLOW_P3B}}</div><p>Cached data renders instantly and is re-ranked with the current time. On a miss the provider chain runs behind a circuit breaker; if every provider fails, the last good data is shown (flagged stale) or a friendly error with a retry. The dashed loop-back shows the bridge buttons and new searches starting a fresh context.</p>` },

    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'privacy',
      title: 'Privacy and security',
      html: `
<h3>6.1 Privacy by design</h3>
${table(
  ['Question', 'Answer'],
  [
    ['What is read?', 'Only the page the user has open, only when the extension is opened, and only on YouTube, Netflix, Reddit threads and Substack. On any other site nothing is read unless the user clicks “Use this page” (using the temporary <code>activeTab</code> grant).'],
    ['What is stored?', 'Settings and any API keys the user adds (<code>storage.local</code>, never synced). Caches and per-tab context live in <code>storage.session</code> — RAM only, gone when the browser closes. <b>No browsing history is kept.</b>'],
    ['What is sent?', 'Short topic queries (“AI agents”) to Reddit and a search provider. With the AI layer on (off by default): a title, channel and ≤ 500 characters of description. Never page contents, URLs, history or identifiers.'],
    ['Tracking / analytics?', 'None. No third-party scripts, fonts or telemetry. Nothing is sold.'],
    ['User control', 'Master and per-platform detection switches; “What Rabbit Hole used” disclosure on the context bar; clear cache; delete everything; revoke optional permissions.'],
  ],
  'compact',
)}

<h3>6.2 Security controls</h3>
${table(
  ['Threat', 'Control', 'Verified by'],
  [
    ['Malicious page text (XSS)', 'No HTML sinks: all external text is rendered as React text nodes after control/bidi-character stripping and length caps; HTML is converted to inert text', 'Source scan; parser/sanitise tests'],
    ['Script injection / remote code', 'CSP <code>script-src \'self\'; object-src \'self\'; base-uri \'none\'</code>; no eval, inline or remote scripts', 'Release gate scans build; real-Chrome run: 0 CSP violations'],
    ['Malicious or compromised data source', 'Every response validated; links must be HTTPS on allow-listed hosts; look-alike hosts rejected; implausible dates dropped', 'parsers, sanitise, backend tests'],
    ['Key theft', 'Keys write-only from the UI (masked status), stored apart from settings, <code>storage.local</code> locked to trusted contexts, never in URLs; dev keys stripped from production builds', 'Release gate with sentinel keys; secrets tests'],
    ['Hostile web page talking to the extension', 'Background accepts RPC only from the extension’s own pages; content scripts reply only to the extension and only to one message type', 'rpc tests (foreign sender refused)'],
    ['Prompt injection (AI layer)', 'Page metadata fenced and declared untrusted; schema-constrained output re-validated; explanations must be grounded in the supplied excerpt', 'anthropicProvider tests'],
    ['Over-broad permissions', `Four permissions; hosts limited to five sites; APIs and ${origins} custom-domain feeds only as <i>optional</i>, per-feature, user-granted permissions`, 'manifest tests; real-Chrome check'],
    ['Backend abuse', 'Origin allow-list, per-client rate limit, size caps, no key echo; honest note that origin checks are not authentication', 'backend tests'],
  ],
  'compact',
)}`,
    },

    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'testing',
      title: 'Testing and quality assurance',
      html: `
<h3>7.1 Automated tests — ${tests} passing in ${files} files</h3>
${table(
  ['Area', 'Tests', 'What is covered'],
  perFile
    .map(({ file, n }) => {
      const [area, what] = AREAS[file] ?? [file, ''];
      return [`<b>${area}</b>`, `<span class="num">${n}</span>`, what];
    })
    .sort((a, b) => Number(b[1].replace(/\D/g, '')) - Number(a[1].replace(/\D/g, ''))),
  'compact',
)}

<h3>7.2 Release gate and real-browser end-to-end</h3>
<p><b>Release gate</b> (<code>npm run verify:release</code>): builds with sentinel secrets in the environment and proves they cannot appear in a production bundle; confirms the public client id and backend origin <em>are</em> compiled in; scans for <code>eval</code>, <code>new Function</code>, <code>document.write</code>, inline/remote scripts and source maps; checks content scripts are self-contained.</p>
<p><b>Real-Chrome end-to-end</b> (<code>npm run test:e2e</code>, Chrome for Testing 155): loads the built <code>dist/</code>, serves fixture pages at the <em>real</em> YouTube/Netflix/Reddit URLs so the real content scripts inject, and drives the real popup and Settings against the real service worker — <b>${e2e} of ${e2e} checks pass</b> (stable over repeated runs). Highlights:</p>
<ul class="two">
  <li>Service worker boots from the built manifest; permissions are exactly the minimal four</li>
  <li>Extraction on a video, a Short, a Netflix episode and a Reddit thread; hidden Netflix labels degrade to “unknown”</li>
  <li>● badge appears on watch pages and clears when detection is turned off</li>
  <li>Live Substack feeds fetched from the service worker through host permissions (12 real posts)</li>
  <li>The extension <b>cannot see the URL</b> of an ordinary website’s tab and no content script runs there</li>
  <li>Settings toggles persist; with detection off the page is not read; secrets RPC returns masked status only</li>
  <li>Zero Content-Security-Policy violations; zero uncaught errors</li>
</ul>

<h3>7.3 Defects found and fixed during development</h3>
<p>Reviewing real captures of the UI and running the real-browser suite surfaced genuine defects — each now has a fix and, where practical, a regression test.</p>
${table(
  ['#', 'Finding', 'Found by', 'Resolution'],
  [
    ['1', 'Publication topic tags leaked into article scoring, handing every post from an “AI” newsletter a free match', 'Ranking review of real results', 'Tags now only select feeds; test asserts no effect on score'],
    ['2', '“Highly relevant” reachable from source quality + freshness alone', 'Same review', 'Top labels require content overlap (gated)'],
    ['3', 'Generic stem “ai” dominated matching; roundups outranked on-topic posts', 'Ranking review', 'Ubiquitous stems down-weighted (cheap IDF)'],
    ['4', 'Reddit JSON blocked (403) and feeds rate-limited (429) from the build network', 'Live probing', 'Three-provider chain, circuit breaker, stale-if-error, honest feed mode'],
    ['5', 'Two “×” buttons in the search box (native + custom)', 'Screenshot review', 'Native cancel button hidden'],
    ['6', 'Reddit tag “[D] …” shown as “D …” in the context bar', 'Screenshot review', 'Leading post tags stripped; test added'],
    ['7', 'Toolbar ● badge stayed on open tabs after detection was switched off', 'Real-Chrome e2e', 'Badge recomputed for every open tab on settings change'],
    ['8', '<code>&lt;b&gt;agents&lt;/b&gt;.</code> became “agents .” (inline tags added spaces)', 'Parser tests', 'Inline tags removed without a space'],
    ['9', '“code” and “coding” stemmed differently, hurting matching', 'Text tests', 'Stemmer fixed; test added'],
    ['10', 'Popup opened on Trending, then flipped to Reading ~100 ms later on video pages', 'Screenshot timing', 'First paint held on a skeleton until the tab is decided'],
    ['11', 'Substack feeds up to 2 MB each downloaded in full', 'Network inspection', 'Streamed read stops after 12 items'],
    ['12', '“AI Agents” in a Title-Case headline detected as a named entity', 'Topic probe on the spec’s example', 'Title-Case-aware entity rules; known-entity list'],
  ],
  'compact',
)}`,
    },

    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'usability',
      title: 'Usability evaluation plan',
      html: `
<p>The product has been verified technically; whether people <em>understand and enjoy</em> it needs usability evidence. The accompanying <b>Heuristic &amp; Usability Evaluation Form</b> (a fillable PDF, <code>docs/Rabbit-Hole-Heuristic-Evaluation-Form.pdf</code>) operationalises the plan below.</p>
${table(
  ['Method', 'Participants', 'Output', 'Primary measure'],
  [
    ['<b>A · Heuristic evaluation</b> (Nielsen’s 10)', '3–5 evaluators (UX / dev / peers)', 'Severity-rated problems per heuristic', 'Mean severity 0–4; # major problems'],
    ['<b>B · Cognitive walkthrough</b>', '2–3 evaluators', 'Step-level learnability failures', '4 questions × steps for 7 tasks'],
    ['<b>C · Moderated think-aloud test</b>', '5 target users', 'Observer log per task', 'Completion, time, errors, SEQ (1–7)'],
    ['<b>D · SUS questionnaire</b>', 'Same 5 users', 'Standardised usability score', 'SUS 0–100 (average ≈ 68)'],
    ['<b>E · Relevance &amp; trust survey</b>', 'Same 5 users', 'Precision of recommendations; trust/understanding of privacy', 'Precision@5; Likert 1–5; NPS'],
    ['<b>F · Accessibility audit</b> (WCAG 2.2 AA)', '1–2 evaluators + tools', 'Pass/fail checklist', '# failed criteria'],
    ['<b>G · Error-state &amp; performance matrix</b>', '1–2 evaluators', 'Expected vs observed behaviour', 'Pass rate; time to first paint / results'],
    ['<b>H · A/B experiment plan</b>', '≥ 20 users per variant (future)', 'Decisions on four open design questions', 'Click-through; time to first click'],
  ],
  'compact',
)}

<h3>8.1 Design hypotheses to test</h3>
<p>The design team enters the evaluation with explicit, falsifiable suspicions (listed in the form’s facilitator notes and withheld from evaluators until they have finished independently, to avoid bias):</p>
<ol class="hyp">
  <li><b>H-1</b> New users will not know what “Highly relevant” is based on; the tooltip that explains it is hidden.</li>
  <li><b>H-2</b> There is no first-run explanation of what the extension reads; privacy clarity depends on discovering the footer and Settings.</li>
  <li><b>H-3</b> Cards are dense at 480 × 600; the “Why this is relevant” box may be skipped.</li>
  <li><b>H-4</b> Netflix users whose labels are hidden may not notice that the fallback box is the way forward.</li>
  <li><b>H-5</b> Emoji-based section names (🔥 📈 💬 🌎) may be ambiguous or noisy for screen-reader users.</li>
  <li><b>H-6</b> The automatic tab choice (Related Reading when a video is detected) may surprise users who expect Reddit first.</li>
  <li><b>H-7</b> “Because you’re watching” rows can show weak matches, harming trust in the whole tab.</li>
  <li><b>H-8</b> The Settings page (six sections) is long; users may not find “Delete everything” or the key fields.</li>
</ol>

<h3>8.2 Success criteria (proposed)</h3>
${table(
  ['Metric', 'Target'],
  [
    ['Task completion (core tasks T1–T5)', '≥ 80 % unassisted'],
    ['T1 time (open on a video → open a related article)', '≤ 30 s median'],
    ['SUS', '≥ 75 (“good”)'],
    ['Precision@5 of recommended articles (judged “relevant” or “partly”)', '≥ 70 %'],
    ['Heuristic evaluation: major (3) or catastrophic (4) problems', '0 unresolved before release'],
    ['Accessibility audit: failed WCAG 2.2 AA criteria', '0 critical'],
    ['“I understand what Rabbit Hole reads and sends” (Likert 1–5)', '≥ 4.0 mean'],
  ],
  'compact',
)}`,
    },

    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'limits',
      title: 'Limitations, risks and future work',
      html: `
<h3>9.1 Known limitations (stated plainly)</h3>
<ul class="limits">
  <li><b>Popup height is capped by Chrome at 600 px</b> (the brief suggested 650–750); the full dashboard tab provides the roomy layout.</li>
  <li><b>Reddit access is outside our control.</b> Anonymous JSON may be blocked; without a client id the extension falls back to Atom feeds that carry <em>no</em> counts. Live Reddit data could not be verified from the build machine.</li>
  <li><b>Substack has no public search API.</b> Without a search key or backend, coverage is a curated list of ${seeds} publications; posts on custom domains cannot be found through <code>site:substack.com</code>.</li>
  <li><b>Netflix markup changes without notice</b> and hides its labels during playback. Detection is best-effort and falls back to manual search; selectors were verified against fixtures, not a live subscription.</li>
  <li><b>Semantic relevance is lexical</b> without the AI layer; it cannot know two differently-worded ideas are the same. The AI layer is unit-tested against a stubbed transport only (no key was available for a live call).</li>
  <li><b>Usability is untested with users.</b> The evaluation form exists precisely to close that gap.</li>
</ul>

<h3>9.2 Future work</h3>
${table(
  ['Priority', 'Item', 'Why'],
  [
    ['High', 'First-run onboarding (what is read / sent) and a visible explanation of relevance labels', 'Addresses H-1, H-2'],
    ['High', 'Run the evaluation pack with real users; iterate on severity ≥ 3 findings', 'Closes the usability evidence gap'],
    ['High', 'Reddit client-id onboarding flow and Chrome Web Store packaging / privacy policy page', 'Reliable data + distribution'],
    ['Medium', '“Not relevant” feedback stored locally to personalise ranking', 'Better precision without tracking'],
    ['Medium', 'Embedding-based semantic scoring behind the backend', 'Replace lexical approximation'],
    ['Medium', 'More platforms (podcasts, Spotify, Twitch) via the extractor interface', 'One extractor + one URL rule each'],
    ['Low', 'Firefox / Safari builds (WebExtensions), localisation, notifications for followed topics', 'Reach'],
  ],
  'compact',
)}`,
    },

    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'appendix',
      title: 'Appendices',
      html: `
<h3>A · Permissions, explained</h3>
${table(
  ['Permission', 'Why'],
  [
    ...manifest.permissions.map((p) => [`<code>${p}</code>`, why[p] ?? '']),
    ...manifest.host_permissions.map((h) => [`<code>${h}</code>`, h.includes('reddit') ? 'Reddit data (feeds / JSON / official API)' : h.includes('substack') ? 'Publication RSS feeds; content script on Substack pages' : h.includes('youtube') ? 'Content script: “what is playing?”' : h.includes('netflix') ? 'Content script: “what is playing?”' : 'Optional backend origin']),
    ['<code>optional:</code> Brave, Anthropic', 'Requested at runtime only when the user adds that key'],
    [`<code>optional:</code> ${origins} custom-domain feeds`, 'Requested at runtime only when “Include custom-domain newsletters” is turned on'],
  ],
  'compact',
)}
<p class="note">Not requested: <code>tabs</code>, <code>history</code>, <code>cookies</code>, <code>webRequest</code>, <code>&lt;all_urls&gt;</code>.</p>

<h3>B · Technology stack</h3>
${table(
  ['Layer', 'Technology', 'Version'],
  [
    ['Platform', 'Chrome Extension, Manifest V3 (ES-module service worker)', 'Chrome ≥ 116'],
    ['Language', 'TypeScript (strict, noUncheckedIndexedAccess)', dep('typescript')],
    ['UI', 'React · plain CSS design tokens (no CSS framework)', `${dep('react')}`],
    ['Build', 'Vite (app) + per-script IIFE builds for content scripts', dep('vite')],
    ['Tests', 'Vitest · jsdom · puppeteer-core (e2e)', `${dep('vitest')} · ${dep('jsdom')} · ${dep('puppeteer-core')}`],
    ['Parsing', 'fast-xml-parser (RSS / Atom)', dep('fast-xml-parser')],
    ['AI (optional)', '@anthropic-ai/sdk — structured JSON output', dep('@anthropic-ai/sdk')],
    ['Backend (optional)', 'Web-standard handler on Cloudflare Workers / Node', '—'],
  ],
  'compact',
)}

<h3>C · Repository layout</h3>
<pre class="tree">manifest.config.mjs    MV3 manifest generator
src/
  background/          service worker: container, RPC handlers, contextManager, tabs
  content/             youtube.ts · netflix.ts · reddit.ts · generic.ts
  popup/ options/      React app + Settings page
  components/          cards, tabs, search, skeletons, states
  services/            reddit · substack · context · ranking · cache · ai · settings · secrets
  utils/ types/        http, rpc, sanitize, text, errors · shared contracts
server/                optional backend proxy
tests/                 ${files} test files (+ e2e/)
docs/                  this report, evaluation form, flowcharts, screens</pre>

<h3>D · Glossary</h3>
${table(
  ['Term', 'Meaning'],
  [
    ['Context', 'The normalised description of what the user is looking at (<code>ContentContext</code>)'],
    ['Provider', 'One interchangeable data source (e.g. Reddit OAuth, Reddit JSON, Reddit Atom)'],
    ['Circuit breaker', 'Temporarily skipping a provider that just failed so it is not hammered'],
    ['Stale-if-error', 'Serving expired cached data (flagged) when a refresh fails'],
    ['Heuristic evaluation', 'Expert inspection of a UI against usability principles'],
    ['SUS', 'System Usability Scale — 10-item questionnaire scored 0–100'],
    ['SEQ', 'Single Ease Question — 1–7 rating after each task'],
  ],
  'compact',
)}

<h3>E · References</h3>
<ol class="refs">
  <li>Nielsen, J. (1994). <i>10 Usability Heuristics for User Interface Design.</i> Nielsen Norman Group. nngroup.com/articles/ten-usability-heuristics</li>
  <li>Nielsen, J., &amp; Molich, R. (1990). Heuristic evaluation of user interfaces. <i>Proc. ACM CHI ’90</i>, 249–256.</li>
  <li>Nielsen, J. (1994). Severity ratings for usability problems. Nielsen Norman Group.</li>
  <li>Lewis, C., &amp; Wharton, C. (1997). Cognitive walkthroughs. In <i>Handbook of Human-Computer Interaction</i> (2nd ed.). Elsevier.</li>
  <li>Brooke, J. (1996). SUS: A “quick and dirty” usability scale. In <i>Usability Evaluation in Industry.</i> Taylor &amp; Francis.</li>
  <li>Sauro, J., &amp; Lewis, J. R. (2016). <i>Quantifying the User Experience</i> (2nd ed.). Morgan Kaufmann.</li>
  <li>W3C (2023). <i>Web Content Accessibility Guidelines (WCAG) 2.2.</i> w3.org/TR/WCAG22</li>
  <li>Google. <i>Chrome Extensions — Manifest V3.</i> developer.chrome.com/docs/extensions</li>
  <li>Reddit. <i>Data API documentation.</i> reddit.com/dev/api &nbsp;·&nbsp; Brave. <i>Search API.</i> brave.com/search/api</li>
  <li>Anthropic. <i>Claude API documentation.</i> docs.anthropic.com</li>
</ol>`,
    },
  ];
};

void callout;
