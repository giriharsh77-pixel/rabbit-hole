#!/usr/bin/env node
/**
 * Builds docs/Rabbit-Hole-Project-Report.pdf
 *
 *   CHROME_PATH="<chrome for testing>" PYTHON="<python with pypdf>" node docs/source/make-report.mjs
 *
 * HTML (print CSS) → Chrome → PDF, two passes so the table of contents gets real page numbers.
 * Live numbers (tests, bundle size, permissions, versions) are read from the repository.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { sections } from './report-content.mjs';
import { sections2 } from './report-content2.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const CHROME = process.env.CHROME_PATH;
const PYTHON = process.env.PYTHON ?? 'python3';
if (!CHROME || !existsSync(CHROME)) throw new Error('Set CHROME_PATH');

// ── live facts ───────────────────────────────────────────────────────────────
const vitestOut = join(tmpdir(), `rh-vitest-${process.pid}.json`);
try {
  execFileSync('npx', ['vitest', 'run', '--reporter=json', `--outputFile=${vitestOut}`], { cwd: root, stdio: 'ignore' });
} catch {
  /* a failing run still writes the report; we assert below */
}
const vt = JSON.parse(readFileSync(vitestOut, 'utf8'));
if (vt.numFailedTests) throw new Error(`${vt.numFailedTests} tests are failing — fix before generating the report`);
const perFile = vt.testResults.map((r) => ({ file: r.name.split('/tests/')[1], n: r.assertionResults.length }));
const manifest = JSON.parse(readFileSync(join(root, 'dist', 'manifest.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const seeds = JSON.parse(readFileSync(join(root, 'src/services/substack/seeds.json'), 'utf8')).publications.length;
const origins = manifest.optional_host_permissions.filter((o) => !/brave|anthropic/.test(o)).length;
const dirSize = (d) => readdirSync(d).reduce((a, n) => a + (statSync(join(d, n)).isDirectory() ? dirSize(join(d, n)) : statSync(join(d, n)).size), 0);
const bundle = { total: `${Math.round(dirSize(join(root, 'dist')) / 1024)} KB` };
let e2e = 28;
try {
  e2e = JSON.parse(readFileSync(join(tmpdir(), 'rabbit-hole-e2e', 'report.json'), 'utf8')).filter((r) => r.pass).length;
} catch {
  /* keep the documented count */
}
const dateLong = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const facts = { tests: vt.numTotalTests, files: vt.testResults.length, e2e, perFile, manifest, pkg, seeds, origins, bundle, dateLong };

// ── diagrams ─────────────────────────────────────────────────────────────────
const readSvg = (name) => readFileSync(join(root, 'docs', 'flowcharts', `${name}.svg`), 'utf8');
const crop = (svg, x, y, w, h) =>
  svg.replace(/<svg([^>]*?) width="\d+" height="\d+" viewBox="[^"]*"/, `<svg$1 width="100%" viewBox="${x} ${y} ${w} ${h}" preserveAspectRatio="xMidYMid meet"`);
const project = readSvg('project-flowchart');
const arch = readSvg('system-architecture');
const UI_W = 2780;
/** Crop a region of the UI-flow SVG using an <img> offset (keeps the embedded images shared & vector text crisp). */
const uiCrop = (x, y, w, h, widthMm, cls = '') => {
  const s = widthMm / w; // mm per svg px
  return `<div class="uicrop ${cls}" style="width:${widthMm}mm;height:${(h * s).toFixed(1)}mm"><img src="../flowcharts/figma-ui-flow.svg" style="width:${(UI_W * s).toFixed(1)}mm;left:${(-x * s).toFixed(1)}mm;top:${(-y * s).toFixed(1)}mm"/></div>`;
};

// ── page content ─────────────────────────────────────────────────────────────
const main = [...sections(facts), ...sections2(facts)];
const CHAPTERS = [
  ['summary', 'Executive summary', null],
  ['problem', 'Problem, goals and users', 1],
  ['tour', 'Product tour', 2],
  ['design', 'UX and visual design', 3],
  ['system', 'System design', 4],
  ['flowcharts', 'Flowcharts', 5],
  ['privacy', 'Privacy and security', 6],
  ['testing', 'Testing and quality assurance', 7],
  ['usability', 'Usability evaluation plan', 8],
  ['limits', 'Limitations, risks and future work', 9],
  ['appendix', 'Appendices', null],
];
const meta = Object.fromEntries(CHAPTERS.map(([id, title, n]) => [id, { title, n }]));

const logo = `<svg width="86" height="86" viewBox="0 0 32 32"><defs><linearGradient id="lg" x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ff8a4c"/><stop offset="1" stop-color="#e0400d"/></linearGradient></defs><rect x="1" y="1" width="30" height="30" rx="9" fill="url(#lg)"/><g fill="none" stroke="#0b0b0d" stroke-linecap="round"><ellipse cx="16" cy="16.5" rx="10" ry="6.6" stroke-width="1.7" opacity="0.28"/><ellipse cx="16" cy="17.2" rx="6.6" ry="4.3" stroke-width="1.8" opacity="0.55"/><ellipse cx="16" cy="18" rx="3.2" ry="2" stroke-width="2" opacity="0.9" fill="#0b0b0d"/></g><ellipse cx="11.2" cy="10" rx="3.6" ry="1.4" fill="#fff" opacity="0.28" transform="rotate(-18 11.2 10)"/></svg>`;

const css = `
@page { size: A4; margin: 15mm 16mm 18mm; }
@page { @bottom-left { content: 'Rabbit Hole — Project Report'; font: 7.6pt Helvetica, Arial, sans-serif; color: #85858f; vertical-align: top; padding-top: 4mm; } @bottom-right { content: 'Page ' counter(page) ' of ' counter(pages); font: 7.6pt Helvetica, Arial, sans-serif; color: #85858f; vertical-align: top; padding-top: 4mm; } }
@page cover { size: A4; margin: 0; @bottom-left { content: none; } @bottom-right { content: none; } }
@page wide { size: A4 landscape; margin: 10mm 12mm 14mm; }
:root { --ink:#16161a; --ink2:#4f4f59; --ink3:#85858f; --line:#dedbd4; --accent:#d63a0b; --soft:#fdeee8; --paper:#fff; }
* { box-sizing: border-box; }
html { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: var(--ink); font-size: 9.7pt; line-height: 1.5; -webkit-font-smoothing: antialiased; }
body { margin: 0; }
code { font-family: 'SF Mono', Menlo, Consolas, monospace; font-size: .86em; background: #f3f1ec; padding: .08em .35em; border-radius: 4px; }
pre { font-family: 'SF Mono', Menlo, monospace; }
a { color: inherit; }
em, i { font-style: italic; }
p { margin: 0 0 .7em; text-wrap: pretty; }
.lead { font-size: 11.2pt; line-height: 1.55; color: #26262c; }
.note { font-size: 8.8pt; color: var(--ink2); }
.num { font-variant-numeric: tabular-nums; }

/* cover */
.cover { page: cover; width: 210mm; height: 297mm; position: relative; overflow: hidden; color: #f4f4f6; background: #0b0b0d; break-after: page; }
.cover::before { content: ''; position: absolute; inset: 0; background: radial-gradient(900px 520px at 18% 6%, rgba(255,90,36,.34), transparent 62%), radial-gradient(700px 420px at 92% 78%, rgba(255,90,36,.16), transparent 60%); }
.cover .in { position: relative; padding: 26mm 20mm 0; }
.cover .brand { display: flex; align-items: center; gap: 6mm; }
.cover .kicker { margin-top: 20mm; font-size: 10pt; letter-spacing: .26em; text-transform: uppercase; color: #ff7a3d; font-weight: 700; }
.cover h1 { margin: 4mm 0 0; font-size: 58pt; line-height: 1; letter-spacing: -.035em; font-weight: 750; }
.cover .tag { margin-top: 6mm; font-size: 15pt; color: #c8c8d0; max-width: 125mm; line-height: 1.4; }
.cover .chips { margin-top: 10mm; display: flex; flex-wrap: wrap; gap: 3mm; }
.cover .chips span { border: 1px solid rgba(255,255,255,.2); border-radius: 99px; padding: 1.2mm 4mm; font-size: 8.6pt; color: #d6d6dc; }
.cover .phones { position: absolute; left: 0; right: 0; bottom: 38mm; height: 112mm; }
.cover .phones img { position: absolute; width: 58mm; border-radius: 5mm; border: 1px solid rgba(255,255,255,.14); box-shadow: 0 8mm 20mm rgba(0,0,0,.6); }
.cover .foot { position: absolute; left: 20mm; right: 20mm; bottom: 14mm; display: flex; justify-content: space-between; font-size: 9pt; color: #9a9aa4; border-top: 1px solid rgba(255,255,255,.14); padding-top: 4mm; }
.cover .foot b { color: #f4f4f6; font-weight: 600; }

/* headings */
h1.ch { break-before: page; margin: 0 0 5mm; font-size: 24pt; line-height: 1.1; letter-spacing: -.02em; font-weight: 750; padding-bottom: 3mm; border-bottom: 2px solid var(--ink); }
h1.ch small { display: block; font-size: 8.6pt; letter-spacing: .2em; text-transform: uppercase; color: var(--accent); font-weight: 700; margin-bottom: 2mm; }
h1.toc-title { margin: 0 0 8mm; font-size: 24pt; letter-spacing: -.02em; border-bottom: 2px solid var(--ink); padding-bottom: 4mm; }
h3 { margin: 6mm 0 2.5mm; font-size: 12pt; letter-spacing: -.01em; break-after: avoid; }
h3:first-child { margin-top: 0; }

/* toc */
.toc { list-style: none; margin: 0; padding: 0; }
.toc li { display: flex; align-items: baseline; gap: 3mm; padding: 2.6mm 0; border-bottom: 1px solid var(--line); font-size: 11pt; }
.toc li b { color: var(--accent); width: 14mm; font-weight: 700; font-size: 9pt; letter-spacing: .08em; }
.toc li span.t { flex: 1; font-weight: 550; }
.toc li span.p { font-variant-numeric: tabular-nums; color: var(--ink2); }
.toc-sub { margin-top: 9mm; color: var(--ink2); font-size: 9.2pt; }
.toc-sub b { color: var(--ink); }

/* tables */
table { width: 100%; border-collapse: collapse; margin: 0 0 4mm; font-size: 8.7pt; break-inside: auto; }
thead { display: table-header-group; }
th { text-align: left; background: #f3f1ec; font-weight: 650; color: #2a2a31; padding: 1.7mm 2.6mm; border-bottom: 1.5px solid #cfcbc2; font-size: 8.2pt; letter-spacing: .02em; }
td { padding: 1.45mm 2.6mm; border-bottom: 1px solid var(--line); vertical-align: top; }
tr { break-inside: avoid; }
table.compact td { padding: 1.5mm 2.4mm; }

/* callouts, stats, personas */
.callout { border: 1px solid var(--line); border-left: 4px solid var(--accent); background: #faf9f6; border-radius: 3px; padding: 3mm 4mm; margin: 5mm 0; break-inside: avoid; }
.callout.warn { border-left-color: #c98a00; background: #fffaf0; }
.callout b { display: block; margin-bottom: 1mm; }
.callout p { margin: 0; font-size: 9pt; color: var(--ink2); }
.stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3mm; margin: 6mm 0; }
.stats div { border: 1px solid var(--line); border-radius: 3mm; padding: 4mm 3.5mm; background: linear-gradient(180deg,#fff,#faf8f5); }
.stats b { display: block; font-size: 20pt; letter-spacing: -.02em; color: var(--accent); line-height: 1.05; }
.stats span { font-size: 8pt; color: var(--ink2); line-height: 1.3; display: block; margin-top: 1.5mm; }
.personas { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; margin-bottom: 4mm; }
.personas > div { border: 1px solid var(--line); border-radius: 3mm; padding: 3.5mm; break-inside: avoid; }
.personas b { font-size: 10pt; } .personas i { display: block; color: var(--accent); font-size: 8.2pt; margin: .5mm 0 2mm; font-style: normal; font-weight: 600; }
.personas p { font-size: 8.6pt; margin-bottom: 2mm; } .personas span { font-size: 8pt; color: var(--ink2); }
.journey { display: flex; align-items: stretch; gap: 1.5mm; margin: 2mm 0 4mm; }
.journey div { flex: 1; background: var(--soft); border: 1px solid #f3c9b8; border-radius: 3mm; padding: 3mm; font-size: 8.8pt; font-weight: 600; }
.journey b { display: block; width: 6mm; height: 6mm; line-height: 6mm; text-align: center; border-radius: 50%; background: var(--accent); color: #fff; font-size: 8pt; margin-bottom: 2mm; }
.journey i { align-self: center; color: var(--accent); font-style: normal; font-weight: 700; }
ol.principles li { margin-bottom: 1.8mm; } ol.hyp { padding-left: 0; list-style: none; } ol.hyp li { margin-bottom: 1.6mm; padding-left: 0; }
ul.limits li, ul.two li { margin-bottom: 1.6mm; }
ul.two { columns: 2; column-gap: 8mm; }
ol.refs { font-size: 8.6pt; color: var(--ink2); padding-left: 5mm; } ol.refs li { margin-bottom: 1.2mm; }

/* swatches + formulas */
.swatches { display: grid; grid-template-columns: repeat(5, 1fr); gap: 2.5mm; margin-bottom: 4mm; }
.sw { border: 1px solid var(--line); border-radius: 2.5mm; overflow: hidden; font-size: 7.8pt; line-height: 1.3; padding-bottom: 2mm; }
.sw i { display: block; height: 11mm; border-bottom: 1px solid var(--line); margin-bottom: 1.5mm; }
.sw b, .sw span, .sw em { display: block; padding: 0 2mm; } .sw span { font-family: Menlo, monospace; color: var(--ink2); } .sw em { color: var(--ink3); font-style: normal; font-size: 7.2pt; }
.formula { border: 1px solid var(--line); border-radius: 3mm; padding: 3.5mm 4.5mm; margin: 3mm 0; background: #faf9f6; break-inside: avoid; }
.formula > code { display: block; margin: 1.6mm 0 2mm; padding: 2mm 3mm; background: #fff; border: 1px solid var(--line); font-size: 8.8pt; }
.formula ul { margin: 0; padding-left: 4.5mm; font-size: 8.7pt; } .formula li { margin-bottom: 1mm; }
pre.tree { background: #f3f1ec; border-radius: 3mm; padding: 4mm; font-size: 8pt; line-height: 1.45; white-space: pre-wrap; }

/* screenshots */
figure { margin: 0; break-inside: avoid; }
figure.shot img { width: 100%; display: block; border-radius: 3.2mm; border: 1px solid #cfcbc2; box-shadow: 0 1.4mm 3.4mm rgba(0,0,0,.14); }
figure.shot figcaption { font-size: 7.9pt; color: var(--ink2); margin-top: 2mm; line-height: 1.38; }
.row2, .row3 { display: grid; gap: 4mm; margin-bottom: 5mm; align-items: start; justify-items: center; }
.row2 { grid-template-columns: repeat(2, 1fr); } .row2 > figure { width: 76mm; }
.row2.settings > figure { width: 82mm; }
.row3 { grid-template-columns: repeat(3, 1fr); } .row3 > figure { width: 52mm; }
.wide-shot { margin: 3mm 0; } .wide-shot img { max-width: 100%; }

/* diagrams */
.diagram { margin: 3mm 0 4mm; } .diagram svg { display: block; width: 100%; height: auto; max-height: 205mm; }
.diagram.strip svg { max-height: 40mm; }
.portrait-full svg { max-height: 190mm; }
.wide { page: wide; break-before: page; }
.wide .diagram svg { max-height: 165mm; }
.uicrop { position: relative; overflow: hidden; border: 1px solid var(--line); border-radius: 3mm; background: #f4f2ee; margin: 0 auto; }
.uicrop img { position: absolute; max-width: none; display: block; }
h1.wide-title { font-size: 15pt; margin: 0 0 3mm; letter-spacing: -.01em; }
.wide h3 { margin: 0 0 2.5mm; font-size: 11pt; } .wide h3 .note { font-weight: 400; font-size: 8.4pt; }
`;

function chapterHtml(sec) {
  const m = meta[sec.id];
  const head = `<h1 class="ch">${m.n ? `<small>Chapter ${m.n}</small>` : ''}${m.title}</h1>`;
  return `<section id="${sec.id}">${head}${sec.html}</section>`;
}
function subHtml(sec) {
  return `<section class="${sec.wide ? 'wide' : 'sub'}" style="${sec.wide ? '' : 'break-before:page'}">${sec.html}</section>`;
}

function build(pageMap = {}) {
  const diagrams = {
    '{{FLOW_FULL}}': crop(project, 0, 110, 2260, 2650),
    '{{FLOW_P1}}': crop(project, 760, 105, 1440, 1107),
    '{{FLOW_P2}}': crop(project, 10, 1272, 950, 1190),
    '{{FLOW_P3}}': crop(project, 1060, 1272, 1190, 1200),
    '{{FLOW_P3B}}': crop(project, 200, 2430, 2060, 330),
  };
  const body = [];
  for (const sec of main) {
    let html = sec.hidden ? subHtml(sec) : chapterHtml(sec);
    for (const [k, v] of Object.entries(diagrams)) html = html.replace(k, v);
    body.push(html);
    if (sec.id === 'system') {
      body.push(`<section class="wide"><h1 class="wide-title">4.6 System architecture diagram</h1><div class="diagram">${arch}</div></section>`);
    }
    if (sec.id === 'flow3') {
      // Figma-ready UI flow: three crops of docs/flowcharts/figma-ui-flow.svg (the file itself is one canvas).
      const W = 232;
      body.push(`<section class="wide"><h3>5.5 UI flow (Figma-ready) — A · entry &amp; detection, B · discovery <span class="note">· rows S1–S3 · file: <code>docs/flowcharts/figma-ui-flow.svg</code></span></h3>${uiCrop(20, 255, 1795, 1340, W)}</section>`);
      body.push(`<section class="wide"><h3>5.5 UI flow — rows S4–S6: bridges between Reddit and Substack, and “Use this page” <span class="note">· always user-initiated</span></h3>${uiCrop(20, 1600, 1795, 1365, W)}</section>`);
      body.push(`<section class="sub" style="break-before:page"><h3>5.5 UI flow — C · external results, D · settings &amp; dashboard</h3>${uiCrop(1827, 255, 933, 1545, 132)}<p class="note" style="margin-top:3mm"><b>Using it in Figma:</b> drag <code>figma-ui-flow.svg</code> onto a Figma or FigJam canvas (or File → Import). Frames, labels and arrows arrive as separate layers and the screenshots as image fills. <code>ui-flow.mmd</code> is a Mermaid version for native FigJam diagrams.</p></section>`);
    }
  }

  const tocRows = CHAPTERS.map(([id, title, n]) => `<li><b>${n ? `CH ${n}` : id === 'appendix' ? 'APP' : ''}</b><span class="t">${title}</span><span class="p">${pageMap[id] ?? ''}</span></li>`).join('');
  const phones = [
    ['01-reading-youtube.png', 'left:12mm;bottom:8mm;transform:rotate(-7deg)'],
    ['03-trending-watching.png', 'left:66mm;bottom:0;transform:rotate(0deg);z-index:2'],
    ['02-article-why-relevant.png', 'left:120mm;bottom:8mm;transform:rotate(7deg)'],
  ]
    .map(([f, st]) => `<img src="../screens/${f}" style="${st}"/>`)
    .join('');

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Rabbit Hole — Project Report</title><style>${css}</style></head><body>
<section class="cover"><div class="in">
  <div class="brand">${logo}</div>
  <div class="kicker">Project report</div>
  <h1>Rabbit Hole</h1>
  <p class="tag">See what the internet is talking about — and go deeper.</p>
  <div class="chips"><span>Chrome · Manifest V3</span><span>TypeScript · React 19</span><span>Reddit × Substack</span><span>Privacy-first</span></div>
</div>
<div class="phones">${phones}</div>
<div class="foot"><span><b>Harsh Giri</b> &nbsp;·&nbsp; Version ${pkg.version}</span><span>${dateLong}</span></div></section>

<section><h1 class="toc-title">Contents</h1><ul class="toc">${tocRows}</ul>
<p class="toc-sub"><b>Companion deliverables</b> (in <code>docs/</code>): <code>Rabbit-Hole-Heuristic-Evaluation-Form.pdf</code> — fillable usability &amp; heuristic evaluation pack · <code>flowcharts/</code> — project flowchart, system architecture, Figma-ready UI flow (SVG/PNG/Mermaid) · <code>screens/</code> — every UI state as PNG.</p></section>
${body.join('\n')}
</body></html>`;
}

// ── render (two passes) ──────────────────────────────────────────────────────
mkdirSync(join(root, 'docs'), { recursive: true });
const htmlPath = join(here, 'report.html');
const pdfPath = join(root, 'docs', 'Rabbit-Hole-Project-Report.pdf');
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });

async function render() {
  const page = await browser.newPage();
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' });
  await page.evaluateHandle('document.fonts.ready');
  await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, preferCSSPageSize: true, outline: true, tagged: true });
  await page.close();
}

writeFileSync(htmlPath, build());
await render();
const pages = JSON.parse(
  execFileSync(PYTHON, [join(here, 'find-pages.py'), pdfPath, JSON.stringify(CHAPTERS.map(([id, title]) => [id, title]))], { encoding: 'utf8' }),
);
const pageMap = Object.fromEntries(CHAPTERS.map(([id]) => [id, pages[id] ?? '']));
if (CHAPTERS.some(([id]) => !pageMap[id])) throw new Error('TOC: could not locate chapters ' + JSON.stringify(pageMap));
writeFileSync(htmlPath, build(pageMap));
await render();
await browser.close();
if (!process.env.KEEP_HTML) rmSync(htmlPath, { force: true });
console.log('✓', pdfPath, '| pages for chapters:', JSON.stringify(pageMap));
