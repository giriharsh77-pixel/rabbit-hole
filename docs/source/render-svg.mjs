/**
 * Renders an SVG file to PNG with headless Chrome (also used for quick visual checks).
 *   CHROME_PATH=… node docs/source/render-svg.mjs in.svg out.png [scale]
 */
import { existsSync, readFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

export async function renderSvgToPng(svgPath, pngPath, { scale = 1, chrome = process.env.CHROME_PATH, browser } = {}) {
  const svg = readFileSync(svgPath, 'utf8');
  const [, w, h] = svg.match(/<svg[^>]*width="(\d+)"[^>]*height="(\d+)"/) ?? [];
  const own = !browser;
  const b = browser ?? (await puppeteer.launch({ executablePath: chrome, headless: true }));
  const page = await b.newPage();
  await page.setViewport({ width: Number(w), height: Number(h), deviceScaleFactor: scale });
  await page.goto(`file://${svgPath}`);
  await page.screenshot({ path: pngPath, omitBackground: false });
  await page.close();
  if (own) await b.close();
}

if (process.argv[1].endsWith('render-svg.mjs')) {
  const [, , input, output, scale] = process.argv;
  if (!process.env.CHROME_PATH || !existsSync(process.env.CHROME_PATH)) throw new Error('Set CHROME_PATH');
  await renderSvgToPng(input, output, { scale: Number(scale ?? 1) });
  console.log('✓', output);
}
