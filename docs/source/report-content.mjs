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
  const { tests, files, e2e, bundle, seeds, outlets, customOrigins } = f;
  const swatch = (hex, name, use) => `<div class="sw"><i style="background:${hex}"></i><b>${name}</b><span>${hex}</span><em>${use}</em></div>`;

  return [
    // ───────────────────────────────────────────────────────────────────────
    {
      id: 'summary',
      title: 'Executive summary',
      html: `
<p class="lead">Rabbit Hole is a Chrome extension (Manifest V3) for people who watch <b>Netflix</b>. It works out exactly which movie or show is playing — or lets you search for any title — and gives four views of it: what <b>Reddit</b> is saying (<b>Discuss</b>), thoughtful writing and press coverage (<b>Read</b>), the cast and where to find reviews (<b>About</b>), and what to watch next (<b>Watch next</b>).</p>

<div class="stats">
  <div><b>${tests}</b><span>automated tests<br/>in ${files} files, all passing</span></div>
  <div><b>${e2e}/${e2e}</b><span>real-Chrome end-to-end<br/>checks (Chrome 155)</span></div>
  <div><b>12/12</b><span>real Netflix titles resolved<br/>to the right Wikidata item</span></div>
  <div><b>${outlets}</b><span>news outlets via public RSS<br/>(+ ${seeds} Substack publications)</span></div>
</div>

<h3>What was built</h3>
<ul>
  <li><b>One exact title.</b> “The Office (U.S.)” on Netflix is matched to the American sitcom on Wikidata — not the British original — using the catalogue tag, kind, year and cast. Off Netflix, a title search (“Search a movie or show…”) does the same for anything.</li>
  <li><b>Discuss</b> — Reddit threads about that title: the show’s own subreddit first, then TV/film communities, then all of Reddit, keeping only threads that are clearly about the show. Sort by <i>Most relevant</i> or <i>Newest</i>.</li>
  <li><b>Read</b> — Substack, Medium and (opt-in) ${outlets} news outlets such as The Indian Express, Hindustan Times, The New York Times, The Guardian and Variety, ranked with a transparent 0–100 relevance score and a plain-language <i>“Why this is relevant”</i>. Users choose which sources they prefer or never want to see.</li>
  <li><b>About</b> and <b>Watch next</b> — cast in billing order with their X and Instagram, links to IMDb, Letterboxd and Rotten Tomatoes, and titles that share the cast or creator. With the optional backend: ratings, viewer reviews, similar titles and whether a title is <b>on Netflix India</b>.</li>
  <li><b>Privacy as a feature</b> — only Netflix is ever read, only when the extension is opened; API keys live only on the backend; caches are RAM-only; nothing is tracked.</li>
</ul>

<h3>How it was verified</h3>
<p>Unit and integration tests cover title resolution, the Discuss filter, ranking, news parsing, caching, the backend and failure handling; a release gate proves development keys cannot reach a production bundle; and an end-to-end suite loads the <em>built</em> extension in a real Chrome and drives the real popup against the real service worker — including live Wikidata, Substack and Medium. The design went through two rounds of feedback (§1.6); a usability-evaluation pack accompanies this report.</p>
${callout('Scope note', 'Reddit blocks the build machine’s network, so Discuss is verified with Reddit’s live RSS from Node, captured feeds and mocked responses. The backend’s TMDB, OMDb, NYT and Guardian integrations are tested against their documented response formats — no keys were available for a live call. Netflix detection is verified against fixtures that mirror its markup. See §9.1.', 'warn')}`,
    },

    // ───────────────────────────────────────────────────────────────────────
    {
      id: 'problem',
      title: 'Problem, goals and users',
      html: `
<h3>1.1 Problem statement</h3>
<p>Curiosity strikes while watching: a character, an actor, a scene, a question. Following it means leaving Netflix, guessing a search query and sorting through results built for clicks. The conversation (Reddit), considered writing (essays and reviews), the press, and the facts (cast, ratings, what else to watch) all live in different places — and generic searches mix them up with things that merely share the name (“The Office” brings up office politics).</p>

<h3>1.2 Goals and non-goals</h3>
${table(
  ['#', 'Goal', 'Measure of success'],
  [
    ['G1', 'Know exactly which movie or show is playing on Netflix, or let the user pick one', '12/12 real Netflix titles resolve correctly; “don’t guess” when unsure (tested)'],
    ['G2', 'Show Reddit discussion about <em>that</em> title only', 'Off-topic threads (office politics, “officer”) dropped on live data; own subreddit first'],
    ['G3', 'Recommend relevant reading from many sources and explain every pick', 'Relevance 0–100 with labels; “Why this is relevant”; Substack · Medium · news'],
    ['G4', 'Give the cast, reviews and what to watch next', 'Cast in billing order with socials; IMDb / Letterboxd / RT links; same-cast picks'],
    ['G5', 'Let users choose their sources', 'Prefer / Normal / Hide per source; only-my-sources; English only'],
    ['G6', 'Privacy first: read only Netflix, no history, keys off the client', 'Permission audit; real-Chrome check that other sites are unreadable; release gate'],
    ['G7', 'Keep working when sources are blocked, limited or offline', 'Provider chains, circuit breaker, stale-if-error, fallbacks for Wikidata’s query service'],
  ],
)}
<p class="note"><b>Non-goals:</b> scraping websites; bypassing Netflix DRM or authentication; reading any site except Netflix; collecting browsing history; guessing facts that no source provided.</p>

<h3>1.3 Target users (illustrative personas)</h3>
<div class="personas">
  <div><b>The curious viewer</b><i>Aanya, 20 · undergraduate</i><p>Watches series on Netflix and wants the conversation and the “why” behind them — fan theories, reviews, interviews — without a research detour.</p><span>Needs: instant, on-topic results, low effort</span></div>
  <div><b>The film buff</b><i>Rahul, 34 · product manager</i><p>Checks Letterboxd and IMDb before committing, follows actors, and wants to know what else is on Netflix India from the same people.</p><span>Needs: ratings, cast, what to watch next</span></div>
  <div><b>The privacy-conscious reader</b><i>Meera, 41 · journalist</i><p>Reluctant to install extensions that “read every page”. Will adopt only if she can see and control exactly what is read and sent — and pick her own news sources.</p><span>Needs: transparency, control, source choice</span></div>
</div>

<h3>1.4 The core journey</h3>
<div class="journey">
  <div><b>1</b>Watching on Netflix (or search a title)</div><i>→</i>
  <div><b>2</b>Rabbit Hole knows exactly which title</div><i>→</i>
  <div><b>3</b>What Reddit says about it</div><i>→</i>
  <div><b>4</b>What’s been written about it</div><i>→</i>
  <div><b>5</b>Who’s in it · what to watch next</div>
</div>

<h3>1.5 Requirements</h3>
${table(
  ['ID', 'Requirement', 'Status', 'Evidence'],
  [
    ['FR1', 'Detect a Netflix episode or movie; resolve it to one exact title', 'Done', 'netflixExtractor, titleService tests; e2e'],
    ['FR2', 'Title search for any movie or show (Wikidata)', 'Done', 'titleService tests; e2e (type → pick)'],
    ['FR3', 'Discuss: Reddit threads about the title; relevant / newest sort', 'Done', 'discuss tests; live RSS check'],
    ['FR4', 'Read: Substack, Medium, news outlets, press archives; relevance + explanation', 'Done', 'relevance, medium, news, insights tests'],
    ['FR5', 'Your sources: prefer / hide / only preferred / English only', 'Done', 'news tests'],
    ['FR6', 'About: cast with X / Instagram; IMDb, Letterboxd, RT, Wikipedia links', 'Done', 'titleService tests; e2e (live Wikidata)'],
    ['FR7', 'Watch next: same cast / creator; filters; similar + Netflix India with backend', 'Done', 'e2e (live Wikidata); insights tests'],
    ['FR8', 'Backend: TMDB, OMDb, NYT, Guardian with keys server-side', 'Done — not run live', 'insights tests (documented formats)'],
    ['NFR1', 'Cache aggressively; de-duplicate; cancel stale requests', 'Done', 'cache tests'],
    ['NFR2', 'Strict CSP; validated, sanitised external data', 'Done', 'manifest + release gate + e2e'],
    ['NFR3', 'Minimal permissions; news sites only when allowed', 'Done', 'manifest tests; e2e'],
    ['NFR4', 'Keyboard and screen-reader support', 'Done — audit pending', 'Usability form, Method F'],
  ],
  'compact',
)}

<h3>1.6 Iterations from feedback</h3>
<p>The product changed substantially across two rounds of reviewer feedback. Each point was discussed before implementation; the decisions are summarised below.</p>
${table(
  ['Round', 'Feedback', 'Response'],
  [
    ['1', '“Trending now” is not needed', 'Removed everywhere: no generic trending feed; everything shown is about something the user is watching or asked for'],
    ['1', 'No Reddit results for “The Office” S1E5', 'Discuss searches all time, by show and episode name'],
    ['1', 'Related reading too narrow (Substack only)', 'Medium tag feeds added (keyless)'],
    ['2', 'Focus on movies and series on Netflix only', 'YouTube, Reddit and generic page reading removed; only Netflix is read'],
    ['2', '“The Office” returned office-politics subreddits', 'Show’s own subreddit first; TV/film communities; an “is it about the show?” filter (§4.4)'],
    ['2', 'Cast social links; reviews from IMDb / Letterboxd', 'About tab: cast with X / Instagram; review links; ratings and reviews via the backend'],
    ['2', 'Similar titles, same cast or genre; IMDb-style filters', 'Watch next: same cast / creator (Wikidata), TMDB similar titles, type · decade · sort filters'],
    ['2', 'More news publications; let users pick sources', `${outlets} outlets (India, US, UK) via RSS; Your sources: prefer / hide / only preferred`],
    ['2', 'Netflix availability for India', 'On Netflix India from TMDB watch providers (JustWatch), via the backend'],
    ['2b', 'Discuss needs a relevancy / recency filter', 'Most relevant ⇄ Newest switch, remembered; Newest asks Reddit for its newest matches'],
  ],
  'compact',
)}`,
    },

    // ───────────────────────────────────────────────────────────────────────
    {
      id: 'tour',
      title: 'Product tour',
      html: `
<p>Every screen below is a capture of the built interface (480 × 600 px, Chrome’s maximum popup height). Reddit threads are <b>illustrative sample data</b>; news articles are real (captured from the outlets’ feeds on 10 October 2026); Substack articles come from real public RSS; title facts are live Wikidata. Screens marked <i>backend</i> use placeholder ratings and availability.</p>

<h3>2.1 Discuss — Reddit, about this title only</h3>
<div class="row2">
${fig('01-discuss.png', '<b>Watching The Office S1E5.</b> The subject bar shows exactly what was identified. Discuss searched the show’s own subreddit (r/DunderMifflin chip), the episode and the show; an off-topic r/antiwork thread in the sample was dropped.')}
${fig('02-discuss-newest.png', '<b>Most relevant ⇄ Newest.</b> “Newest” asks Reddit for its newest matches — not a re-shuffle — and keeps the same “about the show” filter. The choice is remembered.')}
</div>

<h3>2.2 Read — writing and press coverage</h3>
<div class="row3">
${fig('03-read-news.png', '<b>Read</b> with news sites on: Variety, Deadline, Decider… alongside Substack and Medium. Topics searched are shown.')}
${fig('04-read-card.png', '<b>Card:</b> relevance label, outlet · author · date, excerpt and a grounded <i>Why this is relevant</i>.')}
${fig('05-read-news-offer.png', '<b>News is opt-in:</b> a one-time offer; Chrome asks for those sites only then.')}
</div>

<h3>2.3 About and Watch next</h3>
<div class="row3">
${fig('06-about.png', '<b>About:</b> facts and review links (IMDb, Letterboxd for films, Rotten Tomatoes, Wikipedia) built from Wikidata ids.')}
${fig('07-about-cast.png', '<b>Cast</b> in billing order with characters and their X / Instagram accounts.')}
${fig('08-watch-next.png', '<b>Watch next:</b> titles with the same cast or creator, each with the real link; filters for type, decade and sort.')}
</div>

<h3>2.4 Title search — any movie or show</h3>
<div class="row3">
${fig('09-title-search.png', '<b>Search a movie or show:</b> Wikidata movies and series with year and kind; ↑ ↓ Enter. The last row searches the words themselves.')}
${fig('10-picked-title.png', '<b>A picked title</b> (“Exploring Sacred Games”): every tab follows it; × returns to what’s playing.')}
${fig('20-free-search.png', '<b>Free-text search</b> (“mockumentary”) drives Discuss and Read only.')}
</div>

<h3>2.5 With the backend (placeholder data)</h3>
<div class="row2">
${fig('11-about-backend.png', '<b>About + backend:</b> IMDb, Rotten Tomatoes, Metacritic and TMDB ratings, viewer reviews and an <i>On Netflix India</i> badge. <b>The numbers in this capture are placeholders</b> from the preview’s sample backend.')}
${fig('12-next-backend.png', '<b>Watch next + backend:</b> TMDB similar titles, each checked for Netflix India, with an <i>On Netflix India</i> filter. <b>Availability here is placeholder data.</b>')}
</div>

<h3>2.6 Other entry states, errors and appearance</h3>
<div class="row3">
${fig('14-netflix-undetected.png', '<b>Netflix hides its labels:</b> says why and how to fix it — or search. Never guesses.')}
${fig('15-idle.png', '<b>Any other site:</b> nothing is read; the extension cannot even see the URL.')}
${fig('16-detection-off.png', '<b>Detection off:</b> the privacy choice is respected; turn it on or search.')}
</div>
<div class="row3">
${fig('17-error-reddit.png', '<b>Error state:</b> plain cause, one clear action; stale data is shown (flagged) when available.')}
${fig('19-bridge-thread.png', '<b>Bridge:</b> “Find deeper reading →” on a thread turns its headline into a Read search.')}
${fig('18-light-theme.png', '<b>Light theme:</b> dark by default; Light and System available.')}
</div>

<h3>2.7 Settings and the full dashboard</h3>
<div class="row2 settings">
${fig('21-settings-read.png', '<b>Settings → Read:</b> news sites (asks Chrome for those sites), English only, Medium, relevance threshold.')}
${fig('21b-settings-sources.png', '<b>Your sources:</b> Prefer · Normal · Hide for Substack, Medium and every outlet, grouped India / US / UK; <i>Only my preferred sources</i>.')}
</div>
<div class="row2 settings">
${fig('22-settings-privacy.png', '<b>Privacy</b> spells out what is read, stored and sent; one Netflix detection switch; AI is opt-in.')}
${fig('23-settings-reddit.png', '<b>Reddit:</b> Sort Discuss by (relevant / newest), preferred subreddits, browser-session option.')}
</div>
<figure class="shot wide-shot"><img src="../screens/24-dashboard.png" alt="Dashboard"/><figcaption><b>Full dashboard</b> (⤢): the same app in a tab — three columns when wide: Discuss | Read | About + Watch next. It exists because Chrome caps popups at 600 px tall.</figcaption></figure>`,
    },

    // ───────────────────────────────────────────────────────────────────────
    {
      id: 'design',
      title: 'UX and visual design',
      html: `
<h3>3.1 Design principles</h3>
<ol class="principles">
  <li><b>Say what was understood.</b> The subject bar (“Watching — The Office (2005) · Netflix · Season 1, Episode 5”) is always visible above the tabs, so every tab is visibly about the same thing — and users can correct it with the search.</li>
  <li><b>One subject, four questions.</b> Discuss · Read · About · Watch next answer “what are people saying, what’s been written, who’s in it, what next” about the same title.</li>
  <li><b>Never blank, never silent.</b> Skeleton loaders, a live status line and an explanation for every empty or failed state.</li>
  <li><b>Honest by default.</b> Missing data stays missing; when a title can’t be pinned down the tab says so rather than guessing; every Watch next pick states its real connection; relevance is a label, not a fake percentage.</li>
  <li><b>User in control.</b> Most relevant ⇄ Newest, Prefer / Hide sources, × back to Netflix, Esc to close, per-feature permissions, delete-everything.</li>
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
  ${swatch('#3fdc97', 'Good', 'watching · On Netflix India')}
  ${swatch('#ffb633', 'Warn', 'warnings')}
  ${swatch('#7aa2ff', 'Cool', 'exploring · series')}
</div>
${table(
  ['Aspect', 'Decision'],
  [
    ['Typography', 'System UI sans stack — no remote fonts (privacy, CSP, speed); 13.5 px base; tabular numerals for counts and ratings'],
    ['Layout', '480 × 600 popup: header, title search, subject bar, four tabs, scrolling panel, pinned privacy footer. Dashboard: three columns ≥ 980 px'],
    ['Components', 'Combobox (title search), subject bar, segmented controls (sort, type), rating chips, link tiles, cast rows with social buttons, kind pills (Movie / Series)'],
    ['Shape &amp; depth', '10–18 px radii, 1 px hairline borders, no heavy shadows; hover raises border contrast'],
    ['Motion', '150–280 ms transitions; cards “rise” in; pulsing live dot; all disabled under <code>prefers-reduced-motion</code>'],
    ['Theming', 'CSS custom properties; dark default; Light and System; theme applied before first paint (no flash)'],
  ],
  'compact',
)}

<h3>3.3 Accessibility measures built in</h3>
${table(
  ['Area', 'Implementation'],
  [
    ['Keyboard', '“/” focuses search; ↑ ↓ Enter pick a title, Esc closes (twice: clears); ←/→/Home/End move between tabs (roving tabindex); every control is a real button or link'],
    ['Screen readers', 'WAI-ARIA 1.2 combobox with <code>aria-activedescendant</code> and a live result count; tablist/tabpanel roles; radio groups for sort and filters; labelled social links (“Steve Carell on X (@SteveCarell)”)'],
    ['Focus', 'Visible 2 px accent focus ring on all interactive elements'],
    ['Colour', 'Filled buttons use #d63a0b (4.7:1 with white); availability and kind are conveyed by text, never colour alone'],
    ['Motion', 'Animations disabled for reduced-motion users'],
    ['Target size', 'Buttons 28–38 px tall; social buttons 30 × 30 (WCAG 2.2 minimum 24 px)'],
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
<p>Three runtime contexts. A single <b>content script</b>, on Netflix only, does nothing until asked, then reads the player label and the title page’s metadata once. <b>Extension pages</b> (popup, dashboard, settings) are a React app that never touches the network. The <b>background service worker</b> owns everything else — Wikidata, Reddit, feeds, the backend, caching, ranking — and talks to the pages over a typed, cancellable RPC port. An optional <b>backend</b> holds every API key. The full diagram is in §4.7.</p>

<h3>4.2 Identifying the exact title (Wikidata)</h3>
${table(
  ['Step', 'How'],
  [
    ['Search', '<code>wbsearchentities</code> (labels and aliases), then one SPARQL query keeps only items whose <i>instance of</i> is a film or series class and adds the year. If the query service is down, Wikidata’s own descriptions (“2022 film directed by …”) classify instead'],
    ['Resolve a Netflix page', 'Score candidates by exact name (+3), kind — series vs movie (+3), Netflix’s catalogue tag (“(U.S.)” → “American …”, +2), year (+2) and Wikidata’s rank; for remaining ties, overlap with the cast Netflix lists (+2 each). Below a threshold: <b>no match</b> rather than a guess'],
    ['Facts', '<code>wbgetentities</code>: cast in statement (billing) order with characters, director / creator, genres, own subreddit, IMDb / Letterboxd / Rotten Tomatoes / TMDB ids, Wikipedia; SPARQL adds current X / Instagram usernames'],
    ['Links', 'Built only from ids that pass strict patterns (<code>tt\\d+</code>, slugs, username rules); Letterboxd via its <code>/imdb/&lt;id&gt;/</code> redirect when it has no slug'],
    ['Verified live', '12 real Netflix titles — The Office (U.S.), Black Mirror, Glass Onion, Sacred Games, RRR, Money Heist, Stranger Things, Delhi Crime, Squid Game, 3 Body Problem, Wednesday, Heeramandi — all resolved correctly'],
  ],
  'compact',
)}

<h3>4.3 The context pipeline</h3>
${table(
  ['Stage', 'Module', 'What it does'],
  [
    ['1 · Platform', '<code>context/platform.ts</code>', 'Pure URL logic: Netflix watch / title pages only; every other site is “unknown” and never read'],
    ['2 · Metadata', '<code>context/extractors/netflix.ts</code>', 'Player label (“S1:E5 · Basketball”), Media Session, title-page JSON-LD: title, episode, genres, cast'],
    ['3 · Topics &amp; entities', '<code>context/topics.ts</code>', 'Clean title (strips “(U.S.)”, keeps it as the catalogue tag) → phrases → entities → genre themes'],
    ['4 · Exact title', '<code>titleService.ts</code>', 'Wikidata resolve (§4.2) — or the user’s pick from the title search'],
    ['5 · Queries', '<code>context/queries.ts</code>', '3–5 focused queries for Read; Discuss builds its own plan (§4.4)'],
    ['6 · Four tabs', 'services', 'Discuss · Read · About · Watch next, each cached and cancellable'],
  ],
  'compact',
)}

<h3>4.4 Algorithms</h3>
<div class="formula"><b>Discuss — is this thread about the show?</b> <span class="note">(<code>reddit/aboutTitle.ts</code>)</span>
<code>plan: own subreddit (episode, or top / newest threads) → TV or film subreddits → all of Reddit  (≤ 4 searches, all time)</code>
<ul>
<li><b>Keep</b> if in the show’s own subreddit; otherwise the title must appear as a phrase <i>and</i> the thread must be in a TV / film community, write the title as a name (“The Office”, not “the office”), mention a cast or character name, or talk like a viewer (“episode”, “season”, “rewatch”…)</li>
<li><b>Work, career, office-furniture and Microsoft-Office subreddits</b> need a cast or character name to get in at all</li>
<li><b>Rank</b> = (0.4 + match) × where (own subreddit 1.5, TV/film 1.2) × (1 + log<sub>10</sub>(1 + momentum) + 0.25·log<sub>10</sub>(1 + upvotes)); or <b>newest first</b> when the user chooses it</li>
<li>On live data, of 22 all-of-Reddit results for “The Office” it kept the r/DunderMifflin, r/theoffice and r/television threads and dropped police-“officer” videos, return-to-office complaints and Oval Office news</li>
</ul></div>
<div class="formula"><b>Read — article relevance (0–100)</b>
<code>relevance = 100 × (0.45·semantic + 0.20·keyword + 0.15·entity + 0.10·recency + 0.10·sourceQuality)</code>
<ul>
<li><b>semantic</b>: concept-weighted cosine similarity over stemmed terms; common stems down-weighted like a cheap IDF · <b>recency</b>: e<sup>−age/150 days</sup>, unknown dates neutral — never guessed</li>
<li><b>Labels</b>: Highly relevant ≥ 70 · Very relevant ≥ 52 · Related ≥ 36 — the top two also require genuine content overlap</li>
<li><b>Your sources</b> apply first: <i>Hide</i> removes a source (a hidden outlet isn’t even fetched), <i>Prefer</i> ranks it as a top-tier publication, <i>Only preferred</i> shows nothing else, <i>English only</i> drops other languages and scripts</li>
<li><b>News feeds</b>: per-title topic feeds are about the title by definition; recent-coverage feeds keep only articles that name it in quotes, as a capitalised name, or next to its cast</li>
</ul></div>
<div class="formula"><b>Watch next</b>
<code>Wikidata: works sharing the 6 leading cast members, or the director / creator → order by people shared, then fame (Wikipedia editions)</code>
<ul><li>With a TMDB key: TMDB’s recommendations and similar titles, each of the top 10 checked for Netflix India (subscription offers only), mapped back to Wikidata so <i>Explore</i> can open them</li></ul></div>

<h3>4.5 Data sources and graceful degradation</h3>
${table(
  ['Source', 'Providers', 'When something fails'],
  [
    ['Reddit', '① Official OAuth API (client id) · ② public JSON · ③ official Atom feeds', 'Circuit breaker skips a blocked / rate-limited provider; one failing scope doesn’t sink the others; feeds carry no counts and the UI says so'],
    ['Wikidata', 'MediaWiki API (search, facts) · SPARQL query service (types, socials, Watch next)', 'Query service down → descriptions classify search results; socials simply missing; About still works'],
    ['Substack', 'Backend / Brave key (<code>site:substack.com</code>), else ' + `${seeds} curated publications’ RSS (${customOrigins} custom domains opt-in)`, 'Per-feed failures ignored; error only if all fail'],
    ['Medium · news', `Medium tag feeds · ${outlets} outlets’ RSS (opt-in permission)`, 'An unknown topic page (404) means “no stories”, not an error'],
    ['Backend (optional)', 'TMDB · OMDb · NYT · Guardian · Brave · Anthropic — keys server-side', 'Each feature only with its key; tabs say what a backend would add; nothing is guessed'],
  ],
  'compact',
)}

<h3>4.6 Caching and performance</h3>
${table(
  ['Data', 'TTL', 'Behaviour'],
  [
    ['Reddit searches (Discuss)', '5 min', 'Keyed by plan and sort; stale-if-error (flagged)'],
    ['Read results · feeds', '10 min · 30 min', 'Only the newest items of each feed are downloaded (streamed, cut off early)'],
    ['Title search · title facts', '1 h · 24 h', 'Wikidata changes slowly'],
    ['Watch next · insights', '24 h · 6 h', 'Watch next queries take 5–8 s cold, so they run only when the tab is opened'],
    ['Page context', 'Until the tab navigates', 'Per-tab, RAM only (<code>storage.session</code>)'],
    ['In-flight requests', '—', 'Identical concurrent calls share one fetch; cancellation is reference-counted'],
  ],
  'compact',
)}
<p>Other measures: 250 ms debounced typeahead; Enter pressed before results arrive picks the first one when they do; stale requests cancelled on every change; skeleton paint before data; no polling; a ${bundle.total} production build with a single small content script.</p>`,
    },
  ];
};

export const facts = ({ perFile, tests, files, manifest, root }) => {
  const pkg = JSON.parse(readFileSync(`${root}/package.json`, 'utf8'));
  return { pkg, manifest, perFile, tests, files };
};
export { esc, kb, callout };
