// node render.mjs stills 0.4,3.5,…   → work/stills/t-XX.XX.png
// node render.mjs video [posterT]     → ../brag.mp4 (frame 0 = poster frame), muxed with work/audio.wav if present
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const here = dirname(fileURLToPath(import.meta.url));
const FPS = 30, END = 23.0, W = 1920, H = 1080;
const [mode = 'stills', arg] = process.argv.slice(2);

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.wav': 'audio/wav' };
const server = createServer((req, res) => {
  const p = normalize(join(here, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
  if (!p.startsWith(here) || !existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[extname(p)] ?? 'application/octet-stream' });
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/composition.html`;

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ['--hide-scrollbars', '--force-color-profile=srgb'] });
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.goto(url, { waitUntil: 'load' });
await page.evaluate(() => window.ready);

async function frameAt(t, type = 'jpeg') {
  await page.evaluate((tt) => window.renderAt(tt), t);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  return page.screenshot(type === 'png' ? { type: 'png' } : { type: 'jpeg', quality: 94, optimizeForSpeed: true });
}

if (mode === 'stills') {
  const out = join(here, 'stills');
  mkdirSync(out, { recursive: true });
  for (const t of (arg ?? '0.5').split(',').map(Number)) {
    const buf = await frameAt(t, 'png');
    const file = join(out, `t-${t.toFixed(2).padStart(5, '0')}.png`);
    (await import('node:fs')).writeFileSync(file, buf);
    console.log('✓', file);
  }
} else {
  const posterT = Number(arg ?? 8.6);
  const audio = join(here, 'audio.wav');
  const outFile = join(here, '..', 'brag.mp4');
  const args = ['-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-'];
  if (existsSync(audio)) args.push('-i', audio);
  args.push('-map', '0:v');
  if (existsSync(audio)) args.push('-map', '1:a', '-c:a', 'aac', '-b:a', '192k');
  // JPEG frames are full-range BT.601; deliver standard limited-range BT.709 so every player shows the right colours
  args.push('-vf', 'scale=in_range=full:out_range=limited:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv');
  args.push('-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-profile:v', 'high', '-r', String(FPS),
    '-t', String(END), '-movflags', '+faststart', outFile);
  const ff = spawn('ffmpeg', args, { stdio: ['pipe', 'ignore', 'inherit'] });
  const N = Math.round(END * FPS);
  const t0 = Date.now();
  for (let f = 0; f < N; f++) {
    // frame 0 is the poster (same frame count and audio sync — it replaces, not adds)
    const buf = await frameAt(f === 0 ? posterT : f / FPS);
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (f % 60 === 0) console.log(`frame ${f}/${N}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end();
  await new Promise((r, j) => ff.on('close', (c) => (c === 0 ? r() : j(new Error('ffmpeg exited ' + c)))));
  console.log('✓', outFile);
}
await browser.close();
server.close();
