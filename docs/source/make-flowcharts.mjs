#!/usr/bin/env node
/**
 * Generates every diagram deliverable into docs/flowcharts/:
 *
 *   figma-ui-flow.svg       UI flow with the real screens — drag into Figma / FigJam
 *   project-flowchart.svg   end-to-end process flowchart
 *   system-architecture.svg layered architecture diagram
 *   *.png                   previews of the above
 *   ui-flow.mmd, project-flow.mmd   Mermaid sources (FigJam "Mermaid → FigJam", mermaid.live, Figma MCP)
 *
 *   CHROME_PATH="<chrome for testing>" node docs/source/make-flowcharts.mjs
 *   (needs ImageMagick `magick` to shrink the embedded screenshots)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { architectureDiagram } from './flow-architecture.mjs';
import { projectFlowchart } from './flow-project.mjs';
import { uiFlow } from './flow-ui.mjs';
import { renderSvgToPng } from './render-svg.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = join(root, 'docs', 'flowcharts');
mkdirSync(out, { recursive: true });

const files = {
  'figma-ui-flow': uiFlow(join(root, 'docs', 'screens')),
  'project-flowchart': projectFlowchart(),
  'system-architecture': architectureDiagram(),
};
for (const [name, diagram] of Object.entries(files)) {
  writeFileSync(join(out, `${name}.svg`), diagram.toString());
  console.log('✓', `${name}.svg`, `(${(diagram.toString().length / 1024).toFixed(0)} KB)`);
}

// ── Mermaid sources (native FigJam / mermaid.live import) ───────────────────
writeFileSync(
  join(out, 'ui-flow.mmd'),
  `%% Rabbit Hole — UI flow. Paste into mermaid.live, or use FigJam's "Mermaid to FigJam" / the Figma MCP generate_diagram.
flowchart LR
  start([User clicks the toolbar icon]) --> page{What is on the page?}
  page -->|Netflix episode or movie identified| S1[S1 Watching - Discuss]
  page -->|Netflix, player label hidden| S2[S2 Couldn't identify what's playing]
  page -->|Detection off in Settings| S3[S3 Detection switched off]
  page -->|Any other website| S4[S4 Nothing is read]
  S2 & S3 & S4 -->|Click the search box| S5[S5 Title search - Wikidata]
  S5 -->|Pick a title| PICK[Exploring - every tab follows]
  S5 -->|Last row: search the words| FREE[Free-text - Discuss and Read only]

  S1 -->|Most relevant / Newest| DN[Discuss - newest first]
  S1 -->|Tab| READ[Read - Substack, Medium, news]
  S1 -->|Tab| ABOUT[About - facts, review links, cast + X / Instagram]
  S1 -->|Tab| NEXT[Watch next - same cast and creators]
  NEXT -->|with a TMDB key| SIM[Similar titles + On Netflix India]
  DN -->|Find deeper reading| BR[Read - from the thread]
  READ -->|See what Reddit thinks| RT[Discuss - what Reddit thinks]
  READ -.->|Add news sites, once| NEWS[Chrome asks for the 22 news sites]
  NEXT -->|Explore| PICK
  PICK -->|x on the subject bar| S1

  S1 -->|Open Reddit| X1([Reddit thread in a new tab])
  READ -->|Read on ...| X2([Article in a new tab])
  ABOUT -->|IMDb, Letterboxd, RT, Wikipedia, X, Instagram| X3([Opens in a new tab])
  NEXT -->|Find on Netflix| X4([Netflix search in a new tab])
  S1 -.->|All Reddit providers fail| ERR[Error state - Try again]

  gear([Header gear or footer link]) --> SET[Settings - Read: news sites, English only]
  SET --> SRC[Your sources - prefer / normal / hide]
  SET --> PRIV[Privacy]
  SET --> RED[Reddit - Sort Discuss by]
  SET --> THEME[Appearance - Dark / Light / System]
  expand([Header expand icon]) --> DASH[Full dashboard - three columns]
`,
);
writeFileSync(
  join(out, 'project-flow.mmd'),
  `%% Rabbit Hole — project flowchart
flowchart TD
  A([START: user clicks the toolbar icon]) --> B[Popup renders skeletons and opens an RPC port]
  B --> C[Background reads settings and resolves the active tab]
  C --> D{Detection on and a Netflix watch or title page?}
  D -- No --> I[Nothing is read: notice points to the title search] --> TS
  D -- Yes --> E[Content script reads the page once]
  E --> F{Title identified?}
  F -- No --> U[Could not identify what is playing] --> TS
  F -- Yes --> G[Topics, entities and queries from title, episode, genres, cast]
  G --> W[Resolve the exact title on Wikidata: name, kind, catalogue tag, year, cast]
  TS[Title search: Wikidata movies and series, pick one] --> SUBJ
  W --> SUBJ[/Subject: one exact movie or show/]

  SUBJ --> A1[Discuss: own subreddit, TV/film subs, all of Reddit]
  A1 --> A2{Most relevant or newest?}
  A2 --> A3[Provider chain: OAuth, public JSON, Atom feed]
  A3 --> A4[Keep only threads about the show]
  A4 --> A5[/Thread cards/]

  SUBJ --> B1[Read: Substack, Medium, news feeds, NYT / Guardian]
  B1 --> B2[Your sources: hide, prefer, only preferred, English only]
  B2 --> B3[Relevance 0-100 and why-relevant] --> B4[/Article cards/]

  SUBJ --> C1[About: Wikidata facts, cast + X / Instagram, review links]
  C1 --> C2{Backend with TMDB / OMDb keys?}
  C2 -- Yes --> C3[Ratings, viewer reviews, On Netflix India] --> C4[/About/]
  C2 -- No --> C4

  SUBJ --> D1[Watch next: same cast, same creator]
  D1 --> D2{Backend with a TMDB key?}
  D2 -- Yes --> D3[TMDB similar titles + Netflix India] --> D4[Filters: type, decade, sort, Netflix India]
  D2 -- No --> D4 --> D5[/Picks with the real link/]

  A5 & B4 & C4 & D5 --> N{What next?}
  N -->|Open a link| E1([END: new tab])
  N -->|Explore, pick another title, bridges, sort| SUBJ
  N -->|Close popup| E2([END: requests cancelled])
`,
);
console.log('✓ ui-flow.mmd, project-flow.mmd');

// ── PNG previews ────────────────────────────────────────────────────────────
if (process.env.CHROME_PATH) {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, headless: true });
  const scales = { 'figma-ui-flow': 0.6, 'project-flowchart': 0.7, 'system-architecture': 1 };
  for (const [name, scale] of Object.entries(scales)) {
    await renderSvgToPng(join(out, `${name}.svg`), join(out, `${name}.png`), { scale, browser });
    console.log('✓', `${name}.png`);
  }
  await browser.close();
} else {
  console.log('(set CHROME_PATH to also render PNG previews)');
}
