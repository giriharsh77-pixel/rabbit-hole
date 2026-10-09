# Rabbit Hole — documentation pack

| Deliverable | File | What it is |
| --- | --- | --- |
| **Project report** | [`Rabbit-Hole-Project-Report.pdf`](Rabbit-Hole-Project-Report.pdf) | 29-page report: problem and goals, personas, product tour (real screens), UX/visual design, system design and algorithms, flowcharts, privacy and security, testing, usability-evaluation plan, limitations, appendices. Numbers (tests, bundle size, permissions) are read from the repository when it is generated. |
| **Heuristic & usability evaluation form** | [`Rabbit-Hole-Heuristic-Evaluation-Form.pdf`](Rabbit-Hole-Heuristic-Evaluation-Form.pdf) | 24-page **fillable** PDF (≈1,000 form fields) with eight methods — A Nielsen's 10 heuristics · B cognitive walkthrough (7 tasks) · C moderated think-aloud · D SUS · E relevance & trust survey (precision@5, Likert, NPS) · F WCAG 2.2 AA audit · G error-state & performance matrix · H A/B experiment plan — plus a consolidation/sign-off section and facilitator notes. |
| **Figma UI flowchart** | [`flowcharts/figma-ui-flow.svg`](flowcharts/figma-ui-flow.svg) | Every screen as a real capture, grouped in lanes (entry & detection · discovery · external · settings & dashboard), with user-action arrows, error paths and design notes. PNG preview alongside. |
| **Project flowchart** | [`flowcharts/project-flowchart.svg`](flowcharts/project-flowchart.svg) | Standard flowchart symbols: from the toolbar click to opening an article or thread. |
| System architecture | [`flowcharts/system-architecture.svg`](flowcharts/system-architecture.svg) | Layers: pages → service worker → services → external sources. |
| Mermaid sources | [`flowcharts/ui-flow.mmd`](flowcharts/ui-flow.mmd), [`project-flow.mmd`](flowcharts/project-flow.mmd) | For FigJam / mermaid.live. Both parse and render with the Mermaid CLI. |
| Screens | [`screens/`](screens/) | 23 PNG captures of the built interface (+ `manifest.json`). Reddit threads are **illustrative sample data**; article cards come from real public feeds. |

## Using the flowcharts in Figma

1. Open Figma (or FigJam) and drag **`flowcharts/figma-ui-flow.svg`** onto the canvas (or *File → Import*).
2. Frames, text and arrows arrive as separate layers; the screenshots are image fills inside them. Ungroup or *Outline* as you like.
3. For a **native FigJam diagram** instead, paste `ui-flow.mmd` into FigJam's *Mermaid → FigJam* widget/plugin (or into <https://mermaid.live> to export).

The SVG is written for Figma's importer (arrowheads are shapes, not `marker`s; no `rgba()`/`dominant-baseline`), but it was not opened in Figma while it was produced — if something imports oddly, the drawing primitives are in `source/svg.mjs`.

## Using the evaluation form

* Open in Acrobat, Preview, Chrome or Edge. Blue boxes are fields: text, drop-downs (severity 0–4, task, heuristic), check boxes and radio groups.
* Give each evaluator their own copy (`RabbitHole-Eval-<initials>.pdf`); start with **Part 0**, do **A** and **B** independently *before* reading the last page (facilitator hypotheses), then hand the file to the facilitator for **Part 9**.
* It is a **template**: it holds no results, and the extension has not yet been evaluated with it. SUS/SEQ/NPS thresholds follow published conventions (see its references); with five users report counts, not percentages.
* The extension has **no analytics by design**, so the A/B plan (Method H) is written for moderated/unmoderated task studies or two builds, not telemetry.

## Rebuilding

Prerequisites: Node ≥ 20.12, Chrome or Chrome for Testing (`CHROME_PATH`), ImageMagick (`magick`, only for the UI-flow screenshots), and Python 3 with `pip install -r docs/source/requirements.txt` (`PYTHON` points `make-report` at the interpreter that has `pypdf`).

```bash
npm run build                      # the report reads dist/manifest.json and bundle sizes
npm run dev:ui &                   # preview server on :5199 — only needed to re-capture screens

CHROME_PATH="/path/to/chrome" npm run docs:screens   # 1 · capture docs/screens/*.png   (needs the preview server)
CHROME_PATH="/path/to/chrome" npm run docs:flow      # 2 · docs/flowcharts/*.svg|png|mmd (uses the screens)
CHROME_PATH="/path/to/chrome" PYTHON=python3 npm run docs:report   # 3 · the PDF report (runs the unit tests for live counts; fails if any fail)
npm run docs:form                                    # 4 · the fillable form
```

`docs/source/` holds the generators: `capture-screens.mjs`, `svg.mjs` + `flow-*.mjs` + `make-flowcharts.mjs` (diagrams), `report-content*.mjs` + `make-report.mjs` (HTML → PDF with a two-pass table of contents), and `form_lib.py` / `form_front.py` / `form_back.py` + `make-form.py` (reportlab AcroForm). Set `KEEP_HTML=1` to keep the intermediate `report.html`.
