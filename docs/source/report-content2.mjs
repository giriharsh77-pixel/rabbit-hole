import { callout, table } from './report-content.mjs';

const AREAS = {
  'titleService.test.ts': ['Title identification (Wikidata)', 'search, facts in billing order, “The Office (U.S.)” vs UK, cast tie-break, query service down'],
  'discuss.test.ts': ['Discuss filter and plan', 'own subreddit first, office-politics dropped, newest-first, sort setting'],
  'news.test.ts': ['News & your sources', 'feed parsing, title-naming rule, opt-in, hidden outlets not fetched, prefer / only preferred, English only'],
  'insights.test.ts': ['Backend: ratings, reviews, Netflix India, press', 'TMDB v3/v4 auth, IMDb lookup, watch providers, caching, NYT / Guardian, re-validation'],
  'redditRanking.test.ts': ['Reddit ranking', 'momentum score, growth, cross-community counts, feed-only mode'],
  'topicExtraction.test.ts': ['Topic extraction & query generation', 'titles, catalogue tags, entities, Netflix themes, manual searches, AI-first queries'],
  'relevance.test.ts': ['Relevance scoring', 'formula weights, 0–100 bounds, labels, content gating, explanations, diversity'],
  'platform.test.ts': ['Platform detection', 'Netflix watch / title pages; every other site unknown; junk input'],
  'netflixExtractor.test.ts': ['Netflix metadata extraction', 'player label, movie vs episode, JSON-LD, Media Session, title-page enrichment, fallback'],
  'medium.test.ts': ['Medium', 'tag slugs, story detection, feed parsing, Substack + Medium together'],
  'cache.test.ts': ['Cache behaviour', 'TTLs, stale-if-error, in-flight de-duplication, ref-counted cancel, eviction, quota failure'],
  'http.test.ts': ['API failure handling (HTTP)', '401/403/404/429/5xx mapping, Retry-After, offline, timeout, cancel, size limits'],
  'failureHandling.test.ts': ['API failure handling (services)', 'Reddit OAuth → JSON → RSS chain, circuit breaker, stale data, degradation, empty results'],
  'parsers.test.ts': ['Parsing & validation', 'Reddit JSON/Atom, RSS, search results, URL/date/author sanitising'],
  'settingsAndSanitize.test.ts': ['Settings, secrets, sanitising', 'clamping, write-only keys, URL allow-lists, HTML → inert text'],
  'contextManager.test.ts': ['Context manager', 'Netflix only, per-tab cache, privacy switches, undetected/idle states, badge'],
  'rpc.test.ts': ['RPC security', 'typed round-trips, cancellation, worker loss, foreign senders refused'],
  'backend.test.ts': ['Backend proxy', 'CORS, rate limit, validation, no key leakage, extension ⇄ backend contract'],
  'anthropicProvider.test.ts': ['AI provider', 'request shape, prompt-injection fencing, structured output, refusals'],
  'manifest.test.ts': ['Manifest & build artefact', 'minimal permissions, Wikidata hosts, news sites optional, strict CSP'],
  'builtBackground.test.ts': ['Built service worker smoke', 'boots dist/background.js with no DOM and serves RPC'],
};

export const sections2 = (f) => {
  const { tests, files, e2e, seeds, perFile, manifest, pkg, outlets, customOrigins, newsOrigins } = f;
  const dep = (n) => pkg.dependencies?.[n] ?? pkg.devDependencies?.[n] ?? '';
  const why = {
    storage: 'Settings (local), API keys you add (local, background-only) and RAM-only caches (session).',
    scripting: 'Injects the Netflix reader into a Netflix tab opened before the extension was installed.',
  };

  return [
    {
      id: 'flowcharts',
      title: 'Flowcharts',
      html: `
<p>Three diagrams document the project; each exists as a vector SVG in <code>docs/flowcharts/</code> (plus PNG previews and Mermaid sources). The project flowchart (this section) follows standard flowchart symbols; the architecture diagram is in §4.7; the UI flow — built from the real screens and ready to import into Figma — closes this section.</p>
<h3>5.1 Project flowchart — overview</h3>
<div class="diagram portrait-full">{{FLOW_FULL}}</div>
<p class="note">The next pages zoom into each part at a readable size.</p>`,
    },
    { id: 'flow1', hidden: true, html: `<h3>5.2 Part 1 — Identifying the title</h3><div class="diagram">{{FLOW_P1}}</div><p>The popup paints skeletons immediately while the background resolves the active tab. A page is read <b>only</b> if detection is on <em>and</em> it is a Netflix watch or title page. The title is then resolved to one exact Wikidata item — or, when that can’t be done with confidence, nothing is shown. Every fallback (any other site, hidden labels, detection off) leads to the title search, which rejoins at the same <i>subject</i> node; a free-text search feeds Discuss and Read only.</p>` },
    { id: 'flow2', hidden: true, html: `<h3>5.3 Part 2 — Discuss and Read</h3><div class="diagram">{{FLOW_P2}}</div><p><b>Discuss</b> plans at most four Reddit searches — the show’s own subreddit first — runs them through the provider chain in the chosen order (most relevant or newest) and keeps only threads that are clearly about the show. <b>Read</b> queries Substack, Medium, news outlets and (with the backend) the NYT and Guardian archives in parallel, applies the user’s source preferences and the English-only filter, then scores every article 0–100 and explains it.</p>` },
    { id: 'flow3', hidden: true, html: `<h3>5.4 Part 3 — About, Watch next, and what the user does next</h3><div class="diagram">{{FLOW_P3}}</div><div class="diagram strip">{{FLOW_P3B}}</div><p><b>About</b> and <b>Watch next</b> always work from Wikidata; with a backend holding TMDB / OMDb keys they add ratings, viewer reviews, similar titles and Netflix India availability. The dashed loop shows how Explore, picking another title, the bridges and the sort switch give the tabs a new subject or order.</p>` },

    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'privacy',
      title: 'Privacy and security',
      html: `
<h3>6.1 Privacy by design</h3>
${table(
  ['Question', 'Answer'],
  [
    ['What is read?', 'Only the Netflix page the user has open, only when the extension is opened — the title, episode, genres and cast it shows. No other site is ever read: there is no content script elsewhere and the extension cannot even see other tabs’ URLs (verified in real Chrome).'],
    ['What is stored?', 'Settings (incl. source preferences) and any key the user adds (<code>storage.local</code>, never synced). Caches live in <code>storage.session</code> — RAM only. <b>No browsing history is kept.</b> Provider keys (TMDB, OMDb, NYT, Guardian) exist only on the backend.'],
    ['What is sent?', 'The title to Wikidata; the title, episode name and short search terms to Reddit and Medium; with news on, the title as a slug (“the-office”) to the seven outlets that have per-title pages; to the optional backend, the title’s ids or name. Never page contents, URLs, history or identifiers.'],
    ['Tracking / analytics?', 'None. No third-party scripts, fonts or telemetry. Nothing is sold.'],
    ['User control', 'Netflix detection switch; “What Rabbit Hole used” on the subject bar; Your sources; news sites opt-in (and revocable); clear cache; delete everything.'],
  ],
  'compact',
)}

<h3>6.2 Security controls</h3>
${table(
  ['Threat', 'Control', 'Verified by'],
  [
    ['Malicious page text (XSS)', 'No HTML sinks: external text is rendered as React text nodes after control-character stripping and length caps', 'Source scan; sanitise tests'],
    ['Script injection / remote code', 'CSP <code>script-src \'self\'; object-src \'self\'; base-uri \'none\'</code>; no eval, inline or remote scripts', 'Release gate; real-Chrome run: 0 CSP violations'],
    ['Malicious or compromised data source', 'Every response validated; article links must be HTTPS on the publisher’s own host; About links built only from pattern-checked ids; backend output re-validated in the extension', 'parsers, news, insights tests'],
    ['Key theft', 'Provider keys on the backend; user keys write-only (masked status), <code>storage.local</code> locked to trusted contexts; dev keys stripped from production builds', 'Release gate with sentinel keys; secrets tests'],
    ['Hostile web page talking to the extension', 'Background accepts RPC only from the extension’s own pages; the content script replies only to the extension and only to one message type', 'rpc tests (foreign sender refused)'],
    ['Over-broad permissions', `Two permissions (<code>storage</code>, <code>scripting</code>); hosts limited to Netflix, Reddit, Substack, Medium and Wikidata; ${newsOrigins} news and ${customOrigins} newsletter origins only as <i>optional</i>, user-granted permissions`, 'manifest tests; real-Chrome check'],
    ['Backend abuse', 'Origin allow-list, per-client rate limit, size caps, per-instance caching (quota protection), no upstream error or key echo', 'backend, insights tests'],
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
<p><b>Real-Chrome end-to-end</b> (<code>npm run test:e2e</code>, Chrome for Testing 155): loads the built <code>dist/</code>, serves fixture pages at the <em>real</em> Netflix, YouTube and Reddit URLs, and drives the real popup and Settings against the real service worker — <b>${e2e} of ${e2e} checks pass</b>. Highlights:</p>
<ul class="two">
  <li>Netflix episode extracted; ● badge on watch pages, cleared when detection is off</li>
  <li>YouTube, Reddit and an ordinary website are <b>not read</b>: no content script runs and the URL isn’t even visible</li>
  <li>Four tabs, leading with Discuss; Discuss shows threads or its friendly blocked state</li>
  <li>Read: live Substack and Medium feeds through host permissions; the news offer appears</li>
  <li>About and Watch next from <b>live Wikidata</b>: Black Mirror’s cast with social links, IMDb / RT links, “Cunk on Earth — From Charlie Brooker”</li>
  <li>Title search: “Sacred Games” → pick → every tab follows; free-text search still works</li>
  <li>Zero Content-Security-Policy violations; zero uncaught errors</li>
</ul>

<h3>7.3 Defects found and fixed during development</h3>
<p>Reviewing real captures and live data surfaced genuine defects — each now has a fix and, where practical, a regression test.</p>
${table(
  ['#', 'Finding', 'Found by', 'Resolution'],
  [
    ['1', '“The Office” on Reddit returned office-politics and Microsoft Office threads', 'Reviewer feedback (round 2)', 'Own subreddit first + “about the show” filter; live check: off-topic threads dropped'],
    ['2', '“The Office (U.S.)” could match the British series', 'Wikidata probing', 'Catalogue tag, kind, year and cast break ties; below a threshold, no match'],
    ['3', 'Cast ordered by fame put cameos first (Serena Williams in Glass Onion)', 'Live Wikidata check', 'Billing order from statement order (wbgetentities)'],
    ['4', 'A Portuguese Medium post slipped into English reading', 'Real-Chrome e2e', 'English-only filter, incl. Medium’s English footer; test with the real text'],
    ['5', 'Enter pressed before search results arrived did nothing', 'Real-Chrome e2e', 'Enter is remembered and picks the first result when it arrives'],
    ['6', 'Discuss briefly flashed fallback results before the exact title was known', 'Screenshot automation', 'Discuss waits for the title lookup'],
    ['7', 'Long footer / note lines caused sideways scrolling in the popup', 'Preview inspection', 'Notes wrap; overflow checked in the preview'],
    ['8', 'Publication topic tags leaked into article scoring', 'Ranking review', 'Tags only select feeds; test asserts no effect on score'],
    ['9', '“Highly relevant” reachable from source quality + freshness alone', 'Ranking review', 'Top labels require content overlap'],
    ['10', 'Reddit JSON blocked (403) and feeds rate-limited (429) from the build network', 'Live probing', 'Three-provider chain, circuit breaker, per-scope failures tolerated'],
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
  <li><b>H-1</b> New users won’t know what “Highly relevant” is based on; the explanation is only in a tooltip.</li>
  <li><b>H-2</b> There is no first-run explanation of what the extension reads; privacy clarity depends on the footer and Settings.</li>
  <li><b>H-3</b> Users may not realise the search box finds <em>titles</em>, or miss its last row (“Search Reddit and articles for …”).</li>
  <li><b>H-4</b> Four tabs in 480 px: “Watch next” may be overlooked, and users may not expect Discuss to be the first tab.</li>
  <li><b>H-5</b> Netflix users whose labels are hidden may not see that the search is the way forward.</li>
  <li><b>H-6</b> Without a backend, users may expect ratings and Netflix availability and not notice the note explaining why they’re missing.</li>
  <li><b>H-7</b> The <i>Your sources</i> list (24 rows) is long; users may not find <i>Only my preferred sources</i>.</li>
  <li><b>H-8</b> “Newest” may surprise users when it shows fewer threads than “Most relevant”.</li>
</ol>

<h3>8.2 Success criteria (proposed)</h3>
${table(
  ['Metric', 'Target'],
  [
    ['Task completion (core tasks T1–T5)', '≥ 80 % unassisted'],
    ['T1 time (open on a Netflix title → open a related thread or article)', '≤ 30 s median'],
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
  <li><b>Reddit access is outside our control.</b> Reddit blocks the build machine’s network in the browser; Discuss was verified with Reddit’s live RSS from Node (r/DunderMifflin threads about the Basketball episode), captured feeds and mocked responses. Without a client id, feeds carry no vote counts.</li>
  <li><b>The backend features are not yet verified live.</b> TMDB, OMDb, NYT and Guardian integrations are tested against their documented response formats; no keys were available (the Guardian’s former public <code>test</code> key now returns 401).</li>
  <li><b>Netflix markup changes without notice</b> and hides its labels during playback; detection was verified against fixtures, not a live subscription. Availability is checked for <b>India only</b>, and only for the top 10 similar titles.</li>
  <li><b>Wikidata is community-edited.</b> Cast order, handles and ids are as good as its data; Indian titles often have no subreddit; a missing handle is simply not shown.</li>
  <li><b>News coverage is uneven.</b> Indian outlets offer only recent section feeds (no per-title pages), so older Indian titles get little news; Western outlets with per-title feeds cover older titles too.</li>
  <li><b>Watch next is slow the first time</b> (5–8 s per title on Wikidata’s query service), then cached for 24 hours.</li>
  <li><b>Popup height is capped at 600 px</b> by Chrome; the dashboard provides the roomy layout.</li>
  <li><b>Usability is untested with users.</b> The evaluation pack exists to close that gap.</li>
</ul>

<h3>9.2 Future work</h3>
${table(
  ['Priority', 'Item', 'Why'],
  [
    ['High', 'Deploy the backend with TMDB / OMDb / NYT / Guardian keys and verify each live', 'Closes the biggest verification gap'],
    ['High', 'Run the evaluation pack with real users; iterate on severity ≥ 3 findings', 'Closes the usability evidence gap'],
    ['High', 'First-run onboarding (what is read / sent; what the backend adds)', 'Addresses H-2, H-6'],
    ['Medium', 'Reddit client-id onboarding; Chrome Web Store packaging and privacy policy', 'Reliable data + distribution'],
    ['Medium', 'More regions for availability; more Indian sources with per-title pages', 'Reach'],
    ['Medium', 'Embedding-based semantic scoring behind the backend', 'Replace the lexical approximation'],
    ['Low', 'Other streaming services (Prime Video, Hotstar) via the extractor interface', 'One extractor + one URL rule each'],
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
    ...manifest.host_permissions.map((h) => [`<code>${h}</code>`, h.includes('reddit') ? 'Reddit data (feeds / JSON / official API) — Discuss' : h.includes('substack') ? 'Publication RSS feeds — Read' : h.includes('medium') ? 'Medium tag feeds — Read' : h.includes('wikidata') ? 'Title search, facts, cast, Watch next' : h.includes('netflix') ? 'Content script: “what is playing?”; ● badge' : 'Optional backend origin']),
    ['<code>optional:</code> Brave, Anthropic', 'Requested at runtime only when the user adds that key'],
    [`<code>optional:</code> ${newsOrigins} news-outlet origins`, 'Requested once, when the user turns on news sites'],
    [`<code>optional:</code> ${customOrigins} custom-domain feeds`, 'Requested only when “Include custom-domain newsletters” is turned on'],
  ],
  'compact',
)}
<p class="note">Not requested: <code>tabs</code>, <code>activeTab</code>, <code>history</code>, <code>cookies</code>, <code>webRequest</code>, <code>&lt;all_urls&gt;</code>.</p>

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
    ['Data', 'Wikidata (MediaWiki API + SPARQL) · Reddit · RSS (Substack, Medium, 22 outlets)', '—'],
    ['Backend (optional)', 'Web-standard handler on Cloudflare Workers / Node · TMDB · OMDb · NYT · Guardian', '—'],
  ],
  'compact',
)}

<h3>C · Repository layout</h3>
<pre class="tree">manifest.config.mjs    MV3 manifest generator (news origins from outlets.json)
src/
  background/          service worker: container, RPC handlers, contextManager, tabs
  content/             netflix.ts — the only content script
  popup/               App · Discuss · Read · About · Watch next panels · data hooks
  options/             Settings (incl. Your sources)
  components/          TitleSearch · SubjectBar · cards · tabs · skeletons · states
  services/            titleService (Wikidata) · reddit (+ aboutTitle) · news · substack
                       · context · ranking · cache · ai · settings · secrets · backend client
  utils/ types/        http, rpc, sanitize, text, errors · shared contracts
server/                optional backend: Brave · Anthropic · TMDB · OMDb · NYT · Guardian
tests/                 ${files} test files (+ e2e/)
docs/                  this report, evaluation form + results, flowcharts, screens</pre>

<h3>D · Glossary</h3>
${table(
  ['Term', 'Meaning'],
  [
    ['Subject', 'The one movie or show every tab is about — identified on Netflix or picked in the title search'],
    ['Context', 'The normalised description of what the user is looking at (<code>ContentContext</code>)'],
    ['Wikidata / QID', 'The free knowledge base used to identify titles; each item has an id such as Q23831 (The Office, U.S.)'],
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
  <li>Wikimedia. <i>Wikidata Query Service</i> and <i>Wikibase API.</i> wikidata.org/wiki/Wikidata:Data_access</li>
  <li>TMDB. <i>API documentation.</i> developer.themoviedb.org &nbsp;·&nbsp; OMDb API. omdbapi.com &nbsp;·&nbsp; NYT Article Search API. developer.nytimes.com &nbsp;·&nbsp; The Guardian Open Platform. open-platform.theguardian.com</li>
  <li>Anthropic. <i>Claude API documentation.</i> docs.anthropic.com</li>
</ol>`,
    },
  ];
};

void callout;
