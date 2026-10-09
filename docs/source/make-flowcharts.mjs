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
  page -->|YouTube video / Short or Netflix title found| S1[S1 Related Reading - watching]
  page -->|Netflix, player label hidden| S2[S2 Netflix not detected + manual search]
  page -->|Detection off in Settings| S3[S3 Detection switched off]
  page -->|Reddit thread| S4[S4 Reddit thread - Find deeper reading]
  page -->|Substack article| S5[S5 Substack article - See what Reddit thinks]
  page -->|Any other website| S6[S6 Idle - Use this page]

  S1 -->|Tab: Trending Reddit| T[Trending Reddit]
  S1 -->|Read on Substack| X1([Substack article in a new tab])
  S1 -->|See what Reddit thinks| RR[What Reddit thinks]
  S2 -->|Type title + Find related writing| L[Searching - skeleton loading]
  S3 -->|Turn on detection| S1
  S3 -->|Or search a topic| L
  S6 -->|Type a topic| L
  S6 -->|Use this page| PG[Reading - this page]
  S4 -->|Find deeper reading| BR[Reading - from the thread]
  S5 -->|See what Reddit thinks| RR
  L -->|Results arrive| R[Search results]
  R -->|Trending Reddit tab| RQ[Reddit results for the query]
  R -->|Read on Substack| X1
  T -->|Open Reddit| X2([Reddit thread in a new tab])
  T -->|Find deeper reading| BR
  T -.->|All Reddit providers fail| ERR[Error state - Try again]
  ERR -->|Try again| T

  gear([Header gear or footer link]) --> SET[Settings]
  SET --> PRIV[Privacy]
  SET --> INT[API and Integrations]
  SET --> THEME[Appearance - Dark / Light / System]
  expand([Header expand icon]) --> DASH[Full dashboard - two columns]
`,
);
writeFileSync(
  join(out, 'project-flow.mmd'),
  `%% Rabbit Hole — project flowchart
flowchart TD
  A([START: user clicks the toolbar icon]) --> B[Popup renders skeletons and opens an RPC port]
  B --> C[Background reads settings and resolves the active tab]
  C --> D{Detection on and page supported?}
  D -- No --> I[Idle: manual search / Use this page on click] --> CTX
  D -- Yes --> E[Content script reads the page once]
  E --> F{Metadata identified?}
  F -- No --> U[Could not identify + manual search box] --> CTX
  F -- Yes --> G[Topic, entity and keyword extraction + concept expansion]
  G --> H[Build ContentContext and 3-5 queries] --> CTX[/ContentContext or manual query/]

  CTX --> L1[Generate focused queries]
  L1 --> L2{Search provider configured?}
  L2 -- Yes --> L3[Query search API with site:substack.com]
  L2 -- No --> L4[Read curated Substack RSS feeds]
  L3 --> L5[Merge, validate, de-duplicate]
  L4 --> L5
  L5 --> L6[Relevance 0-100: semantic .45, keyword .20, entity .15, recency .10, source .10]
  L6 --> L7{AI layer enabled?}
  L7 -- Yes --> L8[LLM judges relevance and writes why-relevant]
  L7 -- No --> L9[Template explanation from matched topics]
  L8 --> L10[Min relevance, diversity cap, limit N]
  L9 --> L10 --> L11[/Render article cards/]

  CTX --> R1{Fresh cache under 5 min?}
  R1 -- Yes --> R2[Serve cached threads, re-rank]
  R1 -- No --> R3[Provider chain: OAuth, public JSON, Atom feed]
  R3 --> R4{Any provider succeeded?}
  R4 -- No --> R5[Stale cache flagged or friendly error] --> R9
  R4 -- Yes --> R6[Merge, drop NSFW, measure growth delta]
  R2 --> R7
  R6 --> R7[Trending score = recency x velocity x comments x popularity x growth]
  R7 --> R8[Hot / Rising / Discussed / Across] --> R9[/Render thread cards/]

  L11 --> N{What next?}
  R9 --> N
  N -->|Open article or thread| E1([END: new tab])
  N -->|Find deeper reading / See what Reddit thinks / new search| CTX
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
