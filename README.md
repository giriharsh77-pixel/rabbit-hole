# 🐇 Rabbit Hole

> **See what the internet is talking about — and go deeper.**

Rabbit Hole is a Chrome (Manifest V3) extension with two tabs:

- **Reddit** — the Reddit threads *about what you're watching*: searched across all time by the show and episode (e.g. "The Office" + "Basketball"), or by the video's headline and topic — never its URL. Only threads that clearly match are shown; there is no generic trending feed.
- **Related Reading** — detects what you're watching on **YouTube** or **Netflix**, works out what it's really about, and finds thoughtful writing on **Substack** and **Medium** on the same ideas — with a plain-language *"why this is relevant"* for every pick.

The two are bridged: **Find deeper reading →** on any Reddit thread, **See what Reddit thinks →** on any article.

```
I'm watching something → Rabbit Hole understands the topic → it finds what Reddit is
discussing → it finds thoughtful writing → I discover something → I go deeper
```

It is built privacy-first: nothing is read until you open it, only on a handful of sites, and only short topic queries ever leave your browser.

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
4. Pin Rabbit Hole from the puzzle-piece menu. A **●** badge appears on its icon whenever you're on a YouTube/Netflix watch page.

| Command | What it does |
| --- | --- |
| `npm run build` | Typecheck (`tsc`), then a production build into `dist/` |
| `npm run dev` | Development build in watch mode (embeds dev-only keys from `.env`) |
| `npm run dev:ui` | UI-only preview at <http://127.0.0.1:5199/popup.html> with fixtures — see below |
| `npm test` | Run the 242-test suite (Vitest) |
| `npm run verify` | typecheck → build → tests → release gate (below) |
| `npm run test:e2e` | **Real-Chrome smoke test** (needs `CHROME_PATH`; see [Testing](#testing)) |
| `npm run verify:release` | Proves dev keys can't reach a production bundle; scans the build for `eval`, inline/remote scripts, module syntax in content scripts |
| `npm run icons` | Regenerate the toolbar icons |
| `npm run seeds:verify` | Re-check every publication feed in the curated directory |
| `npm run server:dev` | Run the optional backend locally |

### UI preview (`npm run dev:ui`)

Designing the interface doesn't require reloading the extension. The preview serves the real UI with the real background services running in-page, a mocked network and a fake "current tab":

```
http://127.0.0.1:5199/popup.html?demo=youtube      # a YouTube video is playing
http://127.0.0.1:5199/popup.html?demo=netflix      # a Black Mirror episode
http://127.0.0.1:5199/popup.html?demo=undetected   # Netflix, label hidden → manual fallback
http://127.0.0.1:5199/popup.html?demo=reddit       # on a Reddit thread
http://127.0.0.1:5199/popup.html?demo=substack     # on a Substack article
http://127.0.0.1:5199/popup.html?demo=idle         # any other site
http://127.0.0.1:5199/popup.html?mode=tab          # the full dashboard (two columns when wide)
http://127.0.0.1:5199/popup.html?fail=reddit       # simulate Reddit blocking us
http://127.0.0.1:5199/options.html                 # Settings
```

Reddit numbers in the preview are **synthetic** (real titles from a captured public feed, invented scores); Substack data is real RSS captured on 2026‑10‑07. The shim is compiled out of the extension build.

---

## Credentials & the optional backend

**Nothing is required.** Out of the box Rabbit Hole uses public Reddit data and a curated list of Substack publications' public RSS feeds. Add credentials to unlock more:

| Credential | Unlocks | Where it goes |
| --- | --- | --- |
| **Reddit client ID** (public identifier, not a secret) | Reddit's official OAuth API: full counts, documented rate limits | `.env` → `VITE_REDDIT_CLIENT_ID`, or Settings |
| **Brave Search API key** | Searching *all* of Substack (via `site:substack.com`) | Settings, or a backend (recommended) |
| **Anthropic API key** | Optional AI layer: better topics/queries, semantic scoring, explanations | Settings, or a backend (recommended) |

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
        │  contextManager ─ redditService ─ substackService ─ aiService ─ cacheService    │
        │  tab tracking · badge · de-duplicated in-flight requests                       │
        └───────┬───────────────────────┬──────────────────────┬──────────────────────────┘
                │ on demand             │ Reddit               │ Substack
     ┌──────────▼──────────┐   OAuth → public JSON → Atom   search API / backend / RSS feeds
     │ content scripts     │
     │ youtube · netflix · │
     │ reddit · generic    │   They only answer "what is on this page?" — no observers,
     └─────────────────────┘   no polling, no injected UI, no playback interference.
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
| *How AI Agents Will Change Software Development* — Fireship | AI agents · software development · future of AI agents · software engineering · AI automation · AI coding · developer tools · agentic workflows |
| *Why OpenAI's New Model Changes Everything* | OpenAI · frontier AI · AI models · AI industry · model competition · reasoning models |
| Netflix: *Black Mirror* — S7:E2 | Black Mirror · Charlie Brooker · dystopian fiction · technology and society · surveillance · science fiction · artificial intelligence · digital culture |

With the AI layer on, a model replaces the ontology expansion and also writes the search queries.

### Netflix

Detection is strictly limited to what the page already shows the signed-in viewer: the player's title label (`S7:E2 · Episode name`), the Media Session if the page sets one, and the public title page's JSON-LD / Open Graph tags (a same-origin request for the page you could open yourself). It **never** touches the `<video>` element, DRM/EME, network streams, or credentials. Netflix hides its player labels while you watch and changes its markup without notice, so every step is optional; when nothing can be established you get *"We couldn't automatically identify what you're watching."* and a manual search box.

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

**Never fabricated.** Titles, publications, authors, dates and URLs come only from the feed/search response and are validated (HTTPS, allowed hosts, plausible dates). A missing author or date stays missing; the UI never invents one.

**"Semantic" relevance without an LLM** is a concept-weighted cosine similarity over stemmed terms, using the expanded concept graph — a lexical approximation, not embeddings. It is good at ranking obvious matches and honest about weak ones; the AI layer is the upgrade path.

---

## Permissions, explained

Declared in `manifest.config.mjs` (the manifest is generated; `tests/manifest.test.ts` pins these invariants).

| Permission | Why it is needed |
| --- | --- |
| `storage` | Settings (local), API keys you add (local, background-only), and RAM-only caches (`storage.session`). |
| `activeTab` | Lets you click **"Use this page"** to read a page on *any* site, only for that tab, only after you click. Replaces broad host access. |
| `scripting` | Injects the small reader into a tab on demand (tabs opened before install; "Use this page"). |
| Host: `www.reddit.com`, `oauth.reddit.com` | Reddit's feeds/JSON and the official API. |
| Host: `www.youtube.com`, `m.youtube.com`, `www.netflix.com` | Content scripts that answer "what's playing?"; lets the extension see those tabs' URLs for the ● badge. |
| Host: `*.substack.com` | Publication RSS feeds and the content script for Substack article pages. |
| Host: `medium.com` | Medium's public tag feeds (`medium.com/feed/tag/<topic>`) for Related Reading. Switch off under Settings → Related Reading → *Include Medium*. |
| Host: *your backend's origin* | Added at build time only if `VITE_BACKEND_URL` is set. |
| **Optional** hosts: `api.search.brave.com`, `api.anthropic.com` | Requested at runtime when you add that key. |
| **Optional** hosts: 33 custom-domain newsletter feeds | Requested at runtime when you turn on *Include custom-domain newsletters*. |

**Not requested:** `tabs`, `history`, `webRequest`, `cookies`, `<all_urls>`, or any `*://*/*` pattern.

---

## Privacy & security

**What it reads.** Only the page you have open, only when you open Rabbit Hole, and only on YouTube, Netflix, Reddit threads and Substack. On any other site it reads nothing unless you click *Use this page*. YouTube and Netflix detection can each be switched off (or all detection, in **Settings → Privacy**). The popup shows a *"What Rabbit Hole used"* panel listing exactly the fields extracted and what was sent.

**What it stores.** Your settings and any keys you add — in `chrome.storage.local`, never synced. Caches and the per-tab page context live in `chrome.storage.session` (RAM; wiped when the browser closes) and are dropped when the tab navigates. **No browsing history is kept.** *Clear cached data* and *Delete everything* are in Settings.

**What it sends.** Short topic queries ("AI agents") to Reddit and a search provider; with AI enabled (off by default) a title, channel and ≤500 characters of description. Never page contents, URLs you visit, history, cookies (unless you opt in for Reddit) or any identifier. No analytics, no tracking, no data sold.

**Hardening.**

- **Strict CSP:** `script-src 'self'; object-src 'self'; base-uri 'none'` plus an image allow-list for Reddit's CDN. No `eval`, no inline scripts, no remote code (verified on the build output).
- **All external text is inert.** Everything from the network or a web page is rendered only through React text nodes — there is no `innerHTML` (or any other HTML sink) in the shipped code; the one place HTML is parsed, Netflix's public title page, goes through `DOMParser` into a detached document where nothing executes — after control/bidi-character stripping and length caps.
- **Every URL is validated** before it is shown or followed: HTTPS only, no embedded credentials, host allow-lists (Reddit, Substack), look-alike hosts rejected.
- **Every response is validated** (Reddit JSON/Atom, RSS, search results, backend and LLM output); malformed items are dropped, never trusted.
- **Keys:** write-only from the UI (masked status only), stored apart from settings, `storage.local` access level locked to trusted contexts, never in URLs, dev keys stripped from production builds.
- **RPC:** the background only accepts connections from its own extension pages; a content script running in a website is refused. Method names are checked with `hasOwn`.
- **Prompt-injection hygiene** for the AI layer: page metadata is fenced and declared untrusted, outputs are schema-constrained and re-validated, explanations must be grounded in the provided title/excerpt.

---

## The ranking algorithms

### Reddit thread ranking (`src/services/redditService.ts`, `src/services/ranking/reddit.ts`)

Threads about what you're watching come from Reddit's search (all time, sorted by relevance), then:

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
  content/                 youtube.ts · netflix.ts · reddit.ts · generic.ts (+ runtime.ts)
  popup/                   App, RedditPanel, ReadingPanel, data hooks, theme
  options/                 Settings page
  components/              RedditCard · ArticleCard · ContextBar · Tabs · SearchBar · skeletons · states
  services/
    redditService.ts       provider chain, breaker, search + ranking        → reddit/*
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
tests/                     242 tests
docs/                      project report, usability evaluation form, flowcharts, screens (+ generators)
```

---

## Testing

```bash
npm test            # 242 tests across 18 files
npm run verify      # typecheck → build → tests → release gate
```

### Real-Chrome end-to-end test

`npm run test:e2e` loads the built `dist/` into a real Chrome, serves fixture pages at the **real** YouTube / Netflix / Reddit URLs (so the real content scripts inject), and drives the real popup and Settings pages against the real service worker — 28 checks: extraction on a video, a Short, a Netflix episode and a Reddit thread; the ● badge; Substack feeds fetched live through host permissions; the Netflix hidden-controls fallback; manual search; the privacy switch (detection off ⇒ nothing is read, badge cleared); that **no content script runs on, and the extension cannot even see the URL of, an ordinary website**; and zero CSP violations / uncaught errors.

```bash
npx @puppeteer/browsers install chrome@stable     # Chrome for Testing; prints the executable path
CHROME_PATH="<that path>" npm run test:e2e
```

Use Chrome for Testing or Chromium — branded Chrome 137+ ignores `--load-extension`. Reddit results depend on your network (see [Honest notes](#honest-notes-on-data-sources)); a block is reported rather than failed on.

### Automated unit/integration coverage

Automated coverage: Reddit ranking · topic extraction · query generation · relevance scoring · platform detection · YouTube metadata extraction (watch, Shorts, stale-SPA-meta) · Netflix metadata extraction (episode, movie, JSON-LD, Media Session, enrichment, fallback) · cache behaviour (TTLs, stale-if-error, de-duplication, ref-counted cancellation, eviction, quota failure) · API failure handling (rate limits, blocks, timeouts, offline, invalid responses, provider fallback, circuit breaker, empty results, cancellation) · sanitisation · settings/secrets · RPC security · the backend (CORS, rate limit, validation, no leaks) · manifest invariants · and a smoke test that **boots the built `dist/background.js` with no DOM** and drives it over its RPC port.

### Manual test checklist

Run `npm run build`, load `dist/`, then:

| Scenario | Expect |
| --- | --- |
| **YouTube video** (`/watch?v=…`) | ● badge; popup opens on *Related Reading*; "Watching" bar with title + channel; "Found N related articles on Substack and Medium"; the **Reddit** tab shows "About this video" threads |
| **YouTube Short** (`/shorts/…`) | Same, with the Short's title/channel; hashtags stripped from the title |
| **YouTube, navigate to another video without reloading** | Reopen → the new video (not the previous one) |
| **Netflix movie** | Title detected (open the popup while the player controls are visible) |
| **Netflix TV episode** | Show + "Season 7, Episode 2 — Common People" |
| **Netflix, controls hidden** | "We couldn't automatically identify what you're watching." + manual box |
| **Reddit thread** | "Reddit thread — Find deeper reading →" on the Reading tab |
| **A Substack article** | "You're reading … — See what Reddit thinks →" on the Reddit tab |
| **Any normal site** | Nothing is read; "Use this page" is offered; the site is unaffected |
| **Offline** (DevTools → Network → Offline) | "You appear to be offline" + Try again; previously cached Reddit data still shown, flagged |
| **Empty results** (search `zxqvbnm`) | "Couldn't find related writing." + manual search |
| **Detection off** (Settings → Privacy) | "Page detection is off"; no content script is asked anything |
| **Keyboard** | `/` focuses search · ←/→ switch tabs · Enter submits · Esc clears · everything reachable by Tab with visible focus |

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

- **New platform (e.g. Spotify, Twitch):** add a `PlatformExtractor` in `src/services/context/extractors/`, a URL rule in `platform.ts`, a 3-line content script in `src/content/`, an entry in `scripts/build.mjs`'s `CONTENT_SCRIPTS`, and its match pattern in `manifest.config.mjs`. Nothing downstream changes.
- **New concepts:** `src/services/context/ontology.ts` is plain data.
- **New Reddit/Substack data source:** implement `RedditProvider` (`reddit/providers.ts`) or add a search provider in `substackService.searchProviders()`; the validation gate (`substack/candidates.ts`) is shared.
- **New curated publication:** add it to `seeds.json`, then `npm run seeds:verify`.
- **Tune ranking:** `WEIGHTS` (Reddit), `RELEVANCE_WEIGHTS` / `LABEL_THRESHOLDS` (articles).

---

## Known limitations

- **Popup height is capped by Chrome at 600 px** (width 800). The popup is 480 × 600; for the roomy two-column layout use the dashboard button (⤢), which opens the same app in a tab.
- **Netflix markup is not under our control.** Selectors are best-effort and tested against fixtures, not against live Netflix (it requires a subscription). Expect to adjust `readPlayerLabel` if Netflix changes its player.
- **Keyless Substack coverage is limited** to the curated list; add a Brave key or the backend for all of Substack. Posts on custom domains can't be found through `site:substack.com`.
- **Lexical semantics.** Without the AI layer, relevance is term-based; it can't know that two differently-worded ideas are the same.
- **What was and wasn't verified live.** Verified in **Chrome for Testing 155** (the e2e above), including the real service worker, real content scripts on fixture pages at the real URLs, and live Substack RSS. **Not verified live: Reddit data** — from the machine this was built on, Reddit answered `403` to its JSON endpoints and `429` to its feeds (anonymous traffic, helped along by heavy testing), so the Reddit paths were verified against a captured real Atom feed, mocked JSON/OAuth responses and the unit/failure tests, and in the real browser only as the friendly error state. **Netflix** was verified against fixture pages that mirror its markup, not a live subscription. **The optional AI layer** is unit-tested against a stubbed SDK transport only — no Anthropic key was available, so a live model call has not been made.
- **Reddit's terms.** Using the public endpoints/feeds from a user's own browser at low volume is common practice, but if you distribute this widely, register an app and ship a client ID or use the backend.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Reddit tab says *"Reddit blocked the request"* | Reddit is rejecting anonymous traffic. Add a client ID (Settings), or turn on *Use my Reddit browser session*. The extension already falls back to feed mode automatically. |
| *"Searching a curated publication list"* | No search provider yet. Add a Brave key in Settings or deploy the backend. |
| Netflix isn't detected | Move the mouse over the player (so the title label appears), then reopen Rabbit Hole; or type the title. |
| Nothing detected on a tab that was open before you installed | Reload the tab once. |
| Changes don't appear after `npm run dev` | Click the reload icon on the extension card at `chrome://extensions`. |
| `npm run build` fails on types | `npm run typecheck` shows the exact error. |
| npm prints `install-scripts … not yet covered by allowScripts` | Harmless: newer npm versions gate dependency install scripts (esbuild, fsevents). Everything here builds and tests without approving them. |

*Rabbit Hole is not affiliated with Reddit, Substack, YouTube, Netflix or Anthropic.*
