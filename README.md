# 🐇 Rabbit Hole

> **Go deeper on what you watch.**

Rabbit Hole is a Chrome (Manifest V3) extension for **Netflix** — movies and series. It follows what you're watching (or any title you search for) and gives you four tabs:

- **Discuss** — Reddit threads *about this title*: the show's own subreddit first (e.g. r/DunderMifflin), then TV / film communities, then all of Reddit — and only threads that are clearly about the show, so "The Office" never brings up office-politics rants.
- **Read** — essays, reviews and coverage from **Substack**, **Medium** and (opt-in) **22 news & entertainment outlets** — The Indian Express, Hindustan Times, The Hindu, The New York Times, The Guardian, Variety, Deadline… — with a plain-language *"why this is relevant"* for every pick. You choose which sources you prefer or never want to see.
- **About** — the cast in billing order with their **X and Instagram** accounts, links to **IMDb**, **Letterboxd**, **Rotten Tomatoes** and Wikipedia — and, with the backend, the **ratings**, a few **viewer reviews** and whether it's **on Netflix India**.
- **Watch next** — movies and shows with the **same cast** or the **same director / creator**, each with the real connection ("With Steve Carell and Ed Helms"); with the backend, also TMDB's **similar titles**, each marked **On Netflix India** when it is. Filter by type, decade and Netflix India.

Off Netflix, the search box — **"Search a movie or show…"** — makes all four tabs work for any title. Tabs are bridged: **Find deeper reading →** on any Reddit thread, **See what Reddit thinks →** on any article, **Explore** on any Watch next pick.

```
I'm watching something → Rabbit Hole knows exactly which title it is → what Reddit says
about it → what's been written about it → who's in it → what to watch next
```

It is built privacy-first: it reads only Netflix, only when you open it, and only the title and short search terms ever leave your browser.

---

## Contents

1. [Quick start](#quick-start)
2. [Credentials & the optional backend](#credentials--the-optional-backend)
3. [How it works](#how-it-works)
4. [Honest notes on data sources](#honest-notes-on-data-sources)
5. [Permissions, explained](#permissions-explained)
6. [Privacy & security](#privacy--security)
7. [The ranking algorithms](#the-ranking-algorithms)
8. [Project layout](#project-layout)
9. [Testing](#testing)
10. [Documentation & usability evaluation](#documentation--usability-evaluation)
11. [Extending it](#extending-it)
12. [Known limitations](#known-limitations)
13. [Troubleshooting](#troubleshooting)

---

## Quick start

Requires **Node.js ≥ 20.12** and Chrome ≥ 116.

```bash
# 1 · install dependencies
npm install

# 2 · (optional) create your environment file — everything works without it
cp .env.example .env

# 3 · build the extension  →  dist/
npm run build

# …or develop with rebuild-on-save (reload the extension after each rebuild)
npm run dev
```

Load it into Chrome:

1. Open **`chrome://extensions`**
2. Switch on **Developer mode** (top right)
3. Click **Load unpacked** and choose the **`dist/`** folder
4. Pin Rabbit Hole from the puzzle-piece menu. A **●** badge appears on its icon whenever you're on a Netflix watch page.

| Command | What it does |
| --- | --- |
| `npm run build` | Typecheck (`tsc`), then a production build into `dist/` |
| `npm run dev` | Development build in watch mode (embeds dev-only keys from `.env`) |
| `npm run dev:ui` | UI-only preview at <http://127.0.0.1:5199/popup.html> with fixtures — see below |
| `npm test` | Run the 261-test suite (Vitest) |
| `npm run verify` | typecheck → build → tests → release gate (below) |
| `npm run test:e2e` | **Real-Chrome smoke test** (needs `CHROME_PATH`; see [Testing](#testing)) |
| `npm run verify:release` | Proves dev keys can't reach a production bundle; scans the build for `eval`, inline/remote scripts, module syntax in content scripts |
| `npm run icons` | Regenerate the toolbar icons |
| `npm run seeds:verify` | Re-check every publication feed in the curated directory |
| `npm run server:dev` | Run the optional backend locally |

### UI preview (`npm run dev:ui`)

Designing the interface doesn't require reloading the extension. The preview serves the real UI with the real background services running in-page, a mocked Reddit / Substack / Medium network, the **real** (keyless) Wikidata, and a fake "current tab":

```
http://127.0.0.1:5199/popup.html?demo=office       # The Office (U.S.) S1E5 on Netflix
http://127.0.0.1:5199/popup.html?demo=netflix      # a Black Mirror episode
http://127.0.0.1:5199/popup.html?demo=movie        # Glass Onion
http://127.0.0.1:5199/popup.html?demo=undetected   # Netflix, label hidden → search fallback
http://127.0.0.1:5199/popup.html?demo=idle         # any other site
http://127.0.0.1:5199/popup.html?mode=tab          # the full dashboard (three columns when wide)
http://127.0.0.1:5199/popup.html?fail=reddit       # simulate Reddit blocking us
http://127.0.0.1:5199/popup.html?demo=office&backend=demo   # + the real backend handler over SAMPLE TMDB/OMDb data
http://127.0.0.1:5199/options.html                 # Settings
```

Reddit numbers in the preview are **synthetic** (real titles from a captured public feed, invented scores); Substack data is real RSS captured on 2026‑10‑07; Medium stories are labelled samples. The shim is compiled out of the extension build.

---

## Credentials & the optional backend

**Nothing is required.** Out of the box Rabbit Hole uses Wikidata (title facts, cast, links), public Reddit data, a curated list of Substack publications' public RSS feeds, Medium's tag feeds and — if you allow them — news outlets' RSS feeds. Add credentials to unlock more:

| Credential | Unlocks | Where it goes |
| --- | --- | --- |
| **Reddit client ID** (public identifier, not a secret) | Reddit's official OAuth API: full counts, documented rate limits | `.env` → `VITE_REDDIT_CLIENT_ID`, or Settings |
| **Brave Search API key** | Searching *all* of Substack (via `site:substack.com`) | Settings, or a backend (recommended) |
| **Anthropic API key** | Optional AI layer: better topics/queries, semantic scoring, explanations | Settings, or a backend (recommended) |

| **TMDB key** *(backend)* | About: viewer reviews · Watch next: *Similar titles* and *On Netflix India* (watch providers, data by JustWatch) | the backend's `TMDB_API_KEY` |
| **OMDb key** *(backend)* | About: IMDb, Rotten Tomatoes and Metacritic ratings | the backend's `OMDB_API_KEY` |
| **NYT / Guardian keys** *(backend)* | Read: those papers' archives — coverage of older titles | `NYT_API_KEY`, `GUARDIAN_API_KEY` |

The last three exist **only** on the backend (there is no bring-your-own-key option for them). Without them About shows the facts and links from Wikidata, Watch next shows same-cast / same-creator picks, and each tab says what a backend would add. Where to get every key: [`server/README.md`](server/README.md).

### Reddit client ID

1. Go to <https://www.reddit.com/prefs/apps> → **create another app** → type **installed app**, any redirect URI (e.g. `http://localhost`).
2. Copy the string under the app name (the client ID).
3. Paste it into **Settings → API & Integrations**, or set `VITE_REDDIT_CLIENT_ID` and rebuild.

Rabbit Hole uses the `installed_client` grant: no secret, no user login, read-only public data. *(Reddit has been tightening API access; new apps may need approval. Without a client ID the extension degrades gracefully — see [Honest notes](#honest-notes-on-data-sources).)*

### Brave Search & Anthropic keys — two ways

**A. Bring your own key (simplest).** Paste it into **Settings → API & Integrations**. It's stored in `chrome.storage.local`, read only by the background service worker (content scripts are denied access), never displayed back, and Chrome asks you to grant access to just that one API host.

**B. Deploy the backend (best for distributing the extension).** Keys live on a server, not on users' machines. The extension sends only queries.

```bash
cd server
npx wrangler login
npx wrangler secret put BRAVE_API_KEY
npx wrangler secret put ANTHROPIC_API_KEY      # optional
npx wrangler deploy                            # → https://rabbit-hole-api.<you>.workers.dev
```

Then put the URL in `.env` and rebuild:

```
VITE_BACKEND_URL=https://rabbit-hole-api.<you>.workers.dev
```

The URL's origin is added to the manifest's `host_permissions` at build time — nothing broader. Full details (Cloudflare, Node, Docker, CORS, rate limits): [`server/README.md`](server/README.md).

> ⚠️ **Every `VITE_*` variable is compiled into the bundle.** Only the backend URL, client ID and model name are safe in a release. The `VITE_DEV_*` keys are embedded *only* by `npm run dev` and are stripped from `npm run build` (this is tested).

### AI model

The optional AI layer uses the official Anthropic SDK and defaults to **`claude-opus-5-5`**. For lower cost/latency set `VITE_AI_MODEL=claude-haiku-4-5` (extension) or `ANTHROPIC_MODEL` (backend). Requests ask for structured JSON, run at low effort, and opt into server-side refusal fallbacks.

---

## How it works

```
                  ┌─────────────── popup / dashboard / settings (React) ───────────────┐
                  │  Tabs · search · cards · skeletons · errors · privacy controls      │
                  └──────────────────────────────┬──────────────────────────────────────┘
                                                 │ typed RPC over a chrome.runtime port
                                                 │ (cancellable; aborts work if the popup closes)
        ┌────────────────────────────────────────▼───────────────────────────────────────┐
        │                      background service worker (MV3)                            │
        │  contextManager ─ titleService ─ redditService ─ substackService ─ cacheService │
        │  tab tracking · badge · de-duplicated in-flight requests                       │
        └───────┬───────────────────────┬──────────────────────┬──────────────────────────┘
                │ on demand             │ Reddit               │ Substack
     ┌──────────▼──────────┐   OAuth → public JSON → Atom   search API / backend / RSS feeds
     │ content script      │   Wikidata: title search, cast, ids (titleService)
     │ netflix only        │   News outlets' RSS (opt-in) · Medium tag feeds
     └─────────────────────┘   It only answers "what is on this page?" — no observers,
                               no polling, no injected UI, no playback interference.
```

### The context pipeline

```
Current webpage
   ↓  detectPlatform()         services/context/platform.ts        (pure URL logic)
   ↓  PlatformExtractor        services/context/extractors/*       (DOM → RawPageMetadata, in the page)
   ↓  extractTopics()          services/context/topics.ts          (phrases · entities · ontology expansion)
   ↓  generateQueries()        services/context/queries.ts         (3–5 focused queries, not the title)
   ↓  Substack discovery       services/substackService.ts         (search + feeds, merged & validated)
   ↓  Relevance ranking        services/ranking/relevance.ts       (the 0–100 formula + diversity)
   ↓  Results                  with a grounded "why this is relevant"
```

Everything is typed (`ContentContext`, `RawPageMetadata`, `PlatformExtractor` in `src/types/context.ts`), so a new platform is one extractor + one URL rule — see [Extending it](#extending-it).

For the spec's examples:

| Watching | Derived concepts (on-device, no AI) |
| --- | --- |
| Netflix: *Black Mirror* — S7:E2 | Black Mirror · Charlie Brooker · dystopian fiction · technology and society · surveillance · science fiction · artificial intelligence · digital culture |
| Netflix: *The Office (U.S.)* — S1:E5 | The Office · Steve Carell · sitcom · mockumentary · workplace comedy · television |

With the AI layer on, a model replaces the ontology expansion and also writes the search queries.

### Which title is it? (Wikidata)

Every tab works from one exact title, resolved on [Wikidata](https://www.wikidata.org) (free, keyless, CC0) by `src/services/titleService.ts`:

- **Search** — `wbsearchentities`, then one SPARQL query keeps only items that are movies or series (by their *instance of* class) and adds the year. If the query service is down, Wikidata's own descriptions ("2022 film directed by …") are used instead.
- **Resolve a Netflix page** — "The Office (U.S.)" is matched by exact name, kind (series vs movie), Netflix's catalogue tag (*U.S.* → "American sitcom"), year, and — for remakes and same-name films — overlap with the cast Netflix lists. Below a confidence threshold it shows nothing rather than guess.
- **Facts** — `wbgetentities` gives the cast in billing order (statement order, or an explicit ordinal), characters, director / creator, genres, the show's subreddit, IMDb / Letterboxd / Rotten Tomatoes / TMDB ids and the Wikipedia article; SPARQL adds the cast's current X and Instagram usernames. Links are built only from those validated ids (Letterboxd via its `/imdb/<id>/` redirect when it has no slug).
- **Watch next** — SPARQL finds movies and series that share the leading six cast members, or the director / creator, ranked by how many people they share, then how well known they are. "Similar titles" and Netflix India availability need TMDB (planned, backend).

Wikidata requests send only the title being looked up, identify the extension with an `Api-User-Agent` header as Wikimedia asks, and are cached (search 1 h, facts 24 h).

### Netflix

Detection is strictly limited to what the page already shows the signed-in viewer: the player's title label (`S7:E2 · Episode name`), the Media Session if the page sets one, and the public title page's JSON-LD / Open Graph tags (a same-origin request for the page you could open yourself). It **never** touches the `<video>` element, DRM/EME, network streams, or credentials. Netflix hides its player labels while you watch and changes its markup without notice, so every step is optional; when nothing can be established you get *"Couldn't identify what's playing"* and the title search.

---

## Honest notes on data sources

These are real constraints, found while building this. The extension is designed around them rather than pretending they don't exist.

**Reddit.** Anonymous requests to Reddit's `.json` endpoints are increasingly blocked or rate-limited ("whoa there, pardner" pages). Rabbit Hole therefore tries three providers in order and remembers which are failing (a circuit breaker, so it never hammers a blocked endpoint):

| Provider | Data | When |
| --- | --- | --- |
| **OAuth** (official API) | full | if you set a client ID |
| **Public JSON** | full | default; may be blocked |
| **Official Atom feeds** | titles/links/time **only** | fallback |

In feed mode there are no upvote/comment counts, so ranking uses Reddit's own order and the UI says so ("Live counts aren't available…") instead of inventing numbers. The optional *"Use my Reddit browser session"* setting sends your reddit.com cookies so requests look like normal browsing (off by default).

**Substack has no public search API.** Rabbit Hole never scrapes Substack's site. Instead:

- **Search** is delegated to a documented search API (Brave, `site:substack.com`), through your key or the backend.
- **Keyless fallback:** a curated, health-checked directory of **61 publications** (`src/services/substack/seeds.json`) whose public RSS feeds are read (only the newest ~12 items, streamed and cut off early — some feeds are megabytes). The ranker then picks the best matches. Coverage is deliberately limited and the UI says "Searching a curated publication list". Custom-domain newsletters (Astral Codex Ten, Noahpinion, …) need an opt-in Chrome permission for those specific sites. Re-verify the list with `npm run seeds:verify`.

**News outlets publish RSS feeds; they don't offer search.** Read uses two kinds of feed per outlet (`src/services/news/outlets.json`, all checked live): *topic* feeds, one per title, where the site has them (Variety, The Hollywood Reporter, Deadline, IndieWire, Rolling Stone, Decider, The Guardian) — these cover older titles too; and recent *section* feeds (The Indian Express, Hindustan Times, The Hindu, NDTV, The Times of India, Firstpost, NYT, BBC, …), from which only articles that name the title — in quotes, as a capitalised name, or next to its cast — are kept. Indian outlets offer only section feeds, so their coverage is limited to recent articles. News is opt-in: Chrome asks for those 22 sites once.

**Wikidata is community-edited.** Cast order, handles and ids are as good as Wikidata's data; a missing subreddit or handle simply isn't shown.

**Never fabricated.** Titles, publications, authors, dates and URLs come only from the feed/search response and are validated (HTTPS, allowed hosts, plausible dates). A missing author or date stays missing; the UI never invents one.

**"Semantic" relevance without an LLM** is a concept-weighted cosine similarity over stemmed terms, using the expanded concept graph — a lexical approximation, not embeddings. It is good at ranking obvious matches and honest about weak ones; the AI layer is the upgrade path.

---

## Permissions, explained

Declared in `manifest.config.mjs` (the manifest is generated; `tests/manifest.test.ts` pins these invariants).

| Permission | Why it is needed |
| --- | --- |
| `storage` | Settings (local), API keys you add (local, background-only), and RAM-only caches (`storage.session`). |
| `scripting` | Injects the small reader into a Netflix tab that was open before the extension was installed. |
| Host: `www.reddit.com`, `oauth.reddit.com` | Reddit's feeds/JSON and the official API (Discuss). |
| Host: `www.netflix.com` | The one content script, which answers "what's playing?"; lets the extension see Netflix tabs' URLs for the ● badge. |
| Host: `www.wikidata.org`, `query.wikidata.org` | Title search, cast, subreddit and IMDb / Letterboxd / Rotten Tomatoes ids (About, Watch next). |
| Host: `*.substack.com` | Publication RSS feeds (Read). |
| Host: `medium.com` | Medium's public tag feeds (`medium.com/feed/tag/<topic>`) for Read. Switch off under Settings → Read → *Include Medium*. |
| Host: *your backend's origin* | Added at build time only if `VITE_BACKEND_URL` is set. |
| **Optional** hosts: `api.search.brave.com`, `api.anthropic.com` | Requested at runtime when you add that key. |
| **Optional** hosts: 33 custom-domain newsletter feeds | Requested at runtime when you turn on *Include custom-domain newsletters*. |
| **Optional** hosts: 22 news outlets' feed origins | Requested at runtime when you turn on *News sites* (Settings → Read, or *Add news sites* in the Read tab). |

**Not requested:** `tabs`, `activeTab`, `history`, `webRequest`, `cookies`, `<all_urls>`, or any `*://*/*` pattern.

---

## Privacy & security

**What it reads.** Only the Netflix page you have open, only when you open Rabbit Hole — the title, episode, genres and cast it shows. No other site is ever read (the extension can't even see other tabs' URLs). Detection can be switched off in **Settings → Privacy**; title search still works. The popup shows a *"What Rabbit Hole used"* panel listing exactly the fields extracted and what was sent.

**What it stores.** Your settings and any keys you add — in `chrome.storage.local`, never synced. Caches and the per-tab page context live in `chrome.storage.session` (RAM; wiped when the browser closes) and are dropped when the tab navigates. **No browsing history is kept.** *Clear cached data* and *Delete everything* are in Settings.

**What it sends.** The title to Wikidata; the title, episode name and short topic queries to Reddit, Medium and a search provider; with news on, the title as a slug ("the-office") to the seven outlets that have per-title pages (the other feeds are fetched without it); with AI enabled (off by default) a title and ≤500 characters of description. Never page contents, URLs you visit, history, cookies (unless you opt in for Reddit) or any identifier. No analytics, no tracking, no data sold.

**Hardening.**

- **Strict CSP:** `script-src 'self'; object-src 'self'; base-uri 'none'` plus an image allow-list for Reddit's CDN. No `eval`, no inline scripts, no remote code (verified on the build output).
- **All external text is inert.** Everything from the network or a web page is rendered only through React text nodes — there is no `innerHTML` (or any other HTML sink) in the shipped code; the one place HTML is parsed, Netflix's public title page, goes through `DOMParser` into a detached document where nothing executes — after control/bidi-character stripping and length caps.
- **Every URL is validated** before it is shown or followed: HTTPS only, no embedded credentials, host allow-lists (Reddit, Substack, each news outlet's own site), look-alike hosts rejected. About and Watch next links are built only from ids that pass strict patterns (`tt\d+`, `[a-z0-9-]+`, X / Instagram username rules).
- **Every response is validated** (Reddit JSON/Atom, RSS, search results, backend and LLM output); malformed items are dropped, never trusted.
- **Keys:** write-only from the UI (masked status only), stored apart from settings, `storage.local` access level locked to trusted contexts, never in URLs, dev keys stripped from production builds.
- **RPC:** the background only accepts connections from its own extension pages; a content script running in a website is refused. Method names are checked with `hasOwn`.
- **Prompt-injection hygiene** for the AI layer: page metadata is fenced and declared untrusted, outputs are schema-constrained and re-validated, explanations must be grounded in the provided title/excerpt.

---

## The ranking algorithms

### Discuss: is this thread about the show? (`src/services/reddit/aboutTitle.ts`)

For a known title, up to four searches run (all time): the show's **own subreddit** (the episode by name, or its top threads), **TV or film subreddits**, then **all of Reddit** (title + episode, and the title). A thread is kept only if:

```
in the show's own subreddit                                       → keep
in a work / career / office-furniture / Microsoft-Office subreddit → only if it also names the cast or a character
otherwise it must contain the title as a phrase AND
    be in a TV / film community,  OR  write it as a name ("The Office", not "the office"),
    OR mention a cast / character name (full name or a distinctive surname),  OR  talk like a viewer
    ("episode", "season", "rewatch", "finale", …)
```

Ranking multiplies by where it was posted (own subreddit × 1.5, TV/film × 1.2) and rewards mentions of the episode. Tested on live data: of 22 all-of-Reddit results for "The Office", it kept the r/DunderMifflin, r/theoffice and r/television threads and dropped police-"officer" videos, return-to-office complaints and Oval Office news. Without a Wikidata match it falls back to strict phrase search.

### Reddit thread ranking (`src/services/redditService.ts`, `src/services/ranking/reddit.ts`)

Free-text searches and "See what Reddit thinks" use Reddit's search (all time, sorted by relevance), then:

```
match  = best query match: quoted names ("The Office") must appear as a phrase, other words by stem;
         title counts fully, preview half; r/<show> (e.g. r/blackmirror) counts as a full match
sort   = (0.4 + match) × (1 + log10(1 + momentum) + 0.25·log10(1 + upvotes))
strict = only threads with match ≥ 0.34 are shown — never padded with Reddit's loose results
```

`momentum` is the velocity score below — fresh, fast-moving threads rise; for older discussions plain popularity takes over.

```
momentum = recency × engagementVelocity × commentVelocity × popularityMultiplier

recency              = 0.25 + 0.5^(ageHours / 10)
engagementVelocity   = 1 + log10(1 + score    / (ageHours + 1))   upvotes per hour
commentVelocity      = 1 + log10(1 + comments / (ageHours + 1))   discussion per hour
popularityMultiplier = 1 + 0.12·log10(1+score) + 0.12·min(crossSubreddit, 5) + 0.15 if a preferred subreddit
```

All constants are in `WEIGHTS`; the formula's *shape* is what's tested.

### Article relevance (`src/services/ranking/relevance.ts`)

```
relevanceScore = 100 × ( semanticSimilarity × 0.45 + keywordMatch × 0.20
                       + entityMatch        × 0.15 + recency      × 0.10
                       + sourceQuality      × 0.10 )
```

Each term is normalised to 0–1. When the content has no named entities, that 15 % is redistributed proportionally so a perfect match can still reach 100. Labels: **Highly relevant** ≥ 70 · **Very relevant** ≥ 52 · **Related** ≥ 36 · **Somewhat related**. The top two labels *also* require genuine content overlap, so source quality and freshness alone can never earn "Highly relevant". The UI shows labels only (the number is a tooltip, explicitly "not an accuracy claim").

**Your sources** (Settings → Read): *Hide* removes a source before ranking (a hidden news outlet isn't even fetched); *Prefer* ranks it as a top-tier publication; *Only my preferred sources* shows nothing else once you've preferred one; *English only* (on by default) drops articles in other languages and scripts.

Details worth knowing: ubiquitous stems ("ai", "data", "new") are down-weighted like a cheap IDF; a publication's topic tags choose *which feeds to read* but never inflate an article's score; unknown dates get a neutral recency (never a guess); results are re-ranked for **diversity** (max 2 per publication); the AI layer, when on, blends its judgement into the semantic term and supplies the explanation.

---

## Project layout

```
manifest.config.mjs        MV3 manifest generator (permissions explained above)
scripts/                   build.mjs · generate-icons.mjs · verify-seeds.mjs
popup.html · options.html  Vite entry pages
src/
  background/              service worker: container (composition root), handlers (RPC),
                           contextManager, tabs, index (listeners, badge)
  content/                 netflix.ts (+ runtime.ts)
  popup/                   App, RedditPanel (Discuss), ReadingPanel (Read), AboutPanel, WatchNextPanel,
                           data hooks, permissions, theme
  options/                 Settings page (incl. Your sources)
  components/              TitleSearch · SubjectBar · RedditCard · ArticleCard · ContextBar · Tabs · skeletons · states
  services/
    titleService.ts        Wikidata: title search, resolve, facts, Watch next
    redditService.ts       provider chain, breaker, search + Discuss         → reddit/* (aboutTitle.ts)
    news/                  outlets.json · newsProvider.ts (Read → news)
    substackService.ts     discovery orchestration                        → substack/*, search/brave.ts
    contextService.ts      the pipeline facade                            → context/*
    rankingService.ts      facade over ranking/reddit.ts + ranking/relevance.ts
    aiService.ts           optional LLM layer                             → ai/*
    cacheService.ts        TTL cache · stale-if-error · in-flight dedupe
    settingsService.ts · secretsService.ts · backend/client.ts
  utils/                   http (timeouts, mapping) · rpc · sanitize · text · errors · format
  types/                   all shared contracts
  dev/                     UI preview shim + fixtures (not shipped)
server/                    optional backend (Cloudflare Worker / Node) — see server/README.md
tests/                     261 tests
docs/                      project report, usability evaluation form, flowcharts, screens (+ generators)
```

---

## Testing

```bash
npm test            # 261 tests across 21 files
npm run verify      # typecheck → build → tests → release gate
```

### Real-Chrome end-to-end test

`npm run test:e2e` loads the built `dist/` into a real Chrome, serves fixture pages at the **real** Netflix / YouTube / Reddit URLs (so the real content script injects where it should), and drives the real popup and Settings pages against the real service worker — 31 checks: Netflix episode extraction and the ● badge; that YouTube, Reddit and an ordinary website are **not read** (no content script, URL not even visible); the four tabs; Discuss (or its friendly blocked state); Read with live Substack / Medium feeds and the news offer; **About and Watch next from live Wikidata**; the hidden-controls fallback; title search (type → pick → every tab follows); free-text search; the privacy switch; and zero CSP violations / uncaught errors.

```bash
npx @puppeteer/browsers install chrome@stable     # Chrome for Testing; prints the executable path
CHROME_PATH="<that path>" npm run test:e2e
```

Use Chrome for Testing or Chromium — branded Chrome 137+ ignores `--load-extension`. Reddit results depend on your network (see [Honest notes](#honest-notes-on-data-sources)); a block is reported rather than failed on.

### Automated unit/integration coverage

Automated coverage: the backend's title-insights and press endpoints (TMDB v3 / v4 auth, IMDb → TMDB lookup, Netflix India from watch providers, review clean-up, caching, unconfigured / bad-key behaviour) and the extension's re-validation of them · Wikidata title search / resolve / facts (incl. the query service being down) · the Discuss filter and plan · news feeds, title matching and source preferences · English detection · Reddit ranking · topic extraction · query generation · relevance scoring · platform detection · Netflix metadata extraction (episode, movie, JSON-LD, Media Session, enrichment, fallback) · cache behaviour (TTLs, stale-if-error, de-duplication, ref-counted cancellation, eviction, quota failure) · API failure handling (rate limits, blocks, timeouts, offline, invalid responses, provider fallback, circuit breaker, empty results, cancellation) · sanitisation · settings/secrets · RPC security · the backend (CORS, rate limit, validation, no leaks) · manifest invariants · and a smoke test that **boots the built `dist/background.js` with no DOM** and drives it over its RPC port.

### Manual test checklist

Run `npm run build`, load `dist/`, then:

| Scenario | Expect |
| --- | --- |
| **Netflix TV episode** | ● badge; "Watching" bar: show + "Season 1, Episode 5 — Basketball"; **Discuss** opens with r/<show> chip and threads about the episode |
| **Netflix movie** | Title detected (open the popup while the player controls are visible); Discuss searches film subreddits |
| **About** | Cast in billing order with X / Instagram; IMDb, Letterboxd (movies), Rotten Tomatoes, Wikipedia links |
| **Watch next** | Picks "With <cast>" / "From <creator>"; filters by type, decade, sort; *Explore* switches every tab to that title |
| **Netflix, controls hidden** | "Couldn't identify what's playing" + the title search |
| **Title search** | Type "sacred ga" → *Sacred Games (2018) · Series · Indian web series*; Enter → every tab follows it; × returns to Netflix |
| **Free-text search** | The dropdown's last row, *Search Reddit and articles for "…"*, works as before |
| **Read → Add news sites** | Chrome asks for the 22 sites once; then Read shows NYT / Variety / Indian Express … articles naming the title |
| **Settings → Your sources** | Hide Medium → no Medium cards; prefer The Guardian → it ranks higher; *Only my preferred sources* |
| **Any normal site** | Nothing is read; the site is unaffected |
| **Offline** (DevTools → Network → Offline) | "You appear to be offline" + Try again; previously cached Reddit data still shown, flagged |
| **Empty results** (search `zxqvbnm`) | "Couldn't find related writing." + manual search |
| **Detection off** (Settings → Privacy) | "Netflix detection is off"; no content script is asked anything; title search still works |
| **Keyboard** | `/` focuses search · ↑/↓ + Enter pick a title · Esc closes, twice clears · ←/→ switch tabs · everything reachable by Tab with visible focus |

---

## Documentation & usability evaluation

Everything below lives in [`docs/`](docs/README.md):

| Deliverable | File |
| --- | --- |
| Project report (29 pages: goals, design, architecture, flowcharts, privacy, testing, evaluation plan) | [`docs/Rabbit-Hole-Project-Report.pdf`](docs/Rabbit-Hole-Project-Report.pdf) |
| **Heuristic & usability evaluation form** — fillable PDF with 8 methods (Nielsen's 10, cognitive walkthrough, think-aloud, SUS, relevance & trust survey, WCAG 2.2 audit, error/performance matrix, A/B plan) | [`docs/Rabbit-Hole-Heuristic-Evaluation-Form.pdf`](docs/Rabbit-Hole-Heuristic-Evaluation-Form.pdf) |
| **Figma-ready UI flowchart** (SVG with the real screens) + Mermaid source | [`docs/flowcharts/figma-ui-flow.svg`](docs/flowcharts/figma-ui-flow.svg), [`ui-flow.mmd`](docs/flowcharts/ui-flow.mmd) |
| Project flowchart and system architecture | [`docs/flowcharts/`](docs/flowcharts/) |

The evaluation form is a **template**: it contains no results, and the extension has not yet been evaluated with it. Regenerate any deliverable with `npm run docs:flow | docs:report | docs:form` (details in [`docs/README.md`](docs/README.md)).

---

## Extending it

- **New news outlet:** add it to `src/services/news/outlets.json` (its RSS feeds, article hosts and — if it has one — its per-title feed URL with `{slug}`); the manifest's optional permissions follow automatically.
- **New platform (e.g. Prime Video):** add a `PlatformExtractor` in `src/services/context/extractors/`, a URL rule in `platform.ts`, a 3-line content script in `src/content/`, an entry in `scripts/build.mjs`'s `CONTENT_SCRIPTS`, and its match pattern in `manifest.config.mjs`. Nothing downstream changes.
- **New concepts:** `src/services/context/ontology.ts` is plain data.
- **New Reddit/Substack data source:** implement `RedditProvider` (`reddit/providers.ts`) or add a search provider in `substackService.searchProviders()`; the validation gate (`substack/candidates.ts`) is shared.
- **New curated publication:** add it to `seeds.json`, then `npm run seeds:verify`.
- **Tune ranking:** `WEIGHTS` (Reddit), `RELEVANCE_WEIGHTS` / `LABEL_THRESHOLDS` (articles).

---

## Known limitations

- **Popup height is capped by Chrome at 600 px** (width 800). The popup is 480 × 600; for the roomy three-column layout (Discuss | Read | About + Watch next) use the dashboard button (⤢), which opens the same app in a tab.
- **Ratings, reviews, similar titles, Netflix India and the NYT / Guardian archives need the backend and its keys.** They are built and tested against each provider's documented responses, but **not yet verified live** — no TMDB / OMDb / NYT / Guardian key was available (the Guardian's old public `test` key now returns 401). The preview (`?backend=demo`) shows them with sample data.
- **Netflix availability is India only**, and is checked for the top 10 similar titles (one TMDB call each), not for the same-cast / same-creator picks.
- **Watch next is first-time slow** (5–8 s; Wikidata's query service), then cached for 24 h. It only runs when you open that tab.
- **Netflix markup is not under our control.** Selectors are best-effort and tested against fixtures, not against live Netflix (it requires a subscription). Expect to adjust `readPlayerLabel` if Netflix changes its player.
- **Keyless Substack coverage is limited** to the curated list; add a Brave key or the backend for all of Substack. Posts on custom domains can't be found through `site:substack.com`.
- **Lexical semantics.** Without the AI layer, relevance is term-based; it can't know that two differently-worded ideas are the same.
- **What was and wasn't verified live.** Verified in **Chrome for Testing 155** (the e2e above), including the real service worker, real content scripts on fixture pages at the real URLs, live Substack / Medium RSS and live Wikidata (12 real Netflix titles resolved correctly, incl. The Office (U.S.) vs the British one, Sacred Games, RRR, Heeramandi); news feeds were checked live from Node. **Not verified live: Reddit data** — from the machine this was built on, Reddit answered `403` to its JSON endpoints and `429` to its feeds (anonymous traffic, helped along by heavy testing), so the Reddit paths were verified against a captured real Atom feed, mocked JSON/OAuth responses and the unit/failure tests, and in the real browser only as the friendly error state. **Netflix** was verified against fixture pages that mirror its markup, not a live subscription. **The optional AI layer** is unit-tested against a stubbed SDK transport only — no Anthropic key was available, so a live model call has not been made.
- **Reddit's terms.** Using the public endpoints/feeds from a user's own browser at low volume is common practice, but if you distribute this widely, register an app and ship a client ID or use the backend.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Reddit tab says *"Reddit blocked the request"* | Reddit is rejecting anonymous traffic. Add a client ID (Settings), or turn on *Use my Reddit browser session*. The extension already falls back to feed mode automatically. |
| *"Searching a curated publication list"* | No search provider yet. Add a Brave key in Settings or deploy the backend. |
| Netflix isn't detected | Move the mouse over the player (so the title label appears), then reopen Rabbit Hole; or search for the title. |
| About says *"Couldn't pin down which … this is"* | Wikidata had no confident match. Search for the title and pick the right one. |
| Nothing detected on a tab that was open before you installed | Reload the tab once. |
| Changes don't appear after `npm run dev` | Click the reload icon on the extension card at `chrome://extensions`. |
| `npm run build` fails on types | `npm run typecheck` shows the exact error. |
| npm prints `install-scripts … not yet covered by allowScripts` | Harmless: newer npm versions gate dependency install scripts (esbuild, fsevents). Everything here builds and tests without approving them. |

*Rabbit Hole is not affiliated with Netflix, Reddit, Substack, Medium, Wikidata / the Wikimedia Foundation, IMDb, Letterboxd, Rotten Tomatoes, any news outlet listed, or Anthropic.*
