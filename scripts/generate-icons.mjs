#!/usr/bin/env node
/**
 * Generates public/icons/icon-{16,32,48,128}.png — the Rabbit Hole mark (an
 * orange tile with a tunnel of concentric rings).  Dependency-free: a tiny
 * supersampled rasteriser plus a hand-rolled PNG encoder.
 *
 *   npm run icons
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';

const SIZES = [16, 32, 48, 128];
const SS = 4; // supersampling per axis

const lerp = (a, b, t) => a + (b - a) * t;
const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const TOP = hex(0xff8a4c);
const BOTTOM = hex(0xe0400d);
const INK = hex(0x0b0b0d);

/** Coverage helpers work in the 32×32 design space used by <Logo/>. */
function insideRoundedRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = x < x0 + r ? x0 + r : x > x1 - r ? x1 - r : x;
  const cy = y < y0 + r ? y0 + r : y > y1 - r ? y1 - r : y;
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function ringCoverage(x, y, cx, cy, rx, ry, width) {
  const nx = (x - cx) / rx;
  const ny = (y - cy) / ry;
  const d = Math.abs(Math.sqrt(nx * nx + ny * ny) - 1) * Math.min(rx, ry);
  return d <= width / 2;
}

function insideEllipse(x, y, cx, cy, rx, ry, rotDeg = 0) {
  const a = (rotDeg * Math.PI) / 180;
  const dx = x - cx;
  const dy = y - cy;
  const u = dx * Math.cos(a) + dy * Math.sin(a);
  const v = -dx * Math.sin(a) + dy * Math.cos(a);
  return (u / rx) ** 2 + (v / ry) ** 2 <= 1;
}

/** Colour + alpha (0–1) of the design at a point in 32×32 space. */
function shade(x, y) {
  if (!insideRoundedRect(x, y, 1, 1, 31, 31, 9)) return [0, 0, 0, 0];
  const t = Math.min(1, Math.max(0, (x + y * 0.9 - 6) / 52));
  let c = [lerp(TOP[0], BOTTOM[0], t), lerp(TOP[1], BOTTOM[1], t), lerp(TOP[2], BOTTOM[2], t)];
  const mix = (ink, a) => {
    c = [lerp(c[0], ink[0], a), lerp(c[1], ink[1], a), lerp(c[2], ink[2], a)];
  };
  if (ringCoverage(x, y, 16, 16.5, 10, 6.6, 1.7)) mix(INK, 0.28);
  if (ringCoverage(x, y, 16, 17.2, 6.6, 4.3, 1.8)) mix(INK, 0.55);
  if (insideEllipse(x, y, 16, 18, 3.2, 2.0)) mix(INK, 0.92);
  if (insideEllipse(x, y, 11.2, 10, 3.6, 1.4, -18)) mix([255, 255, 255], 0.28);
  return [c[0], c[1], c[2], 1];
}

function render(size) {
  const scale = 32 / size;
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const [cr, cg, cb, ca] = shade((x + (sx + 0.5) / SS) * scale, (y + (sy + 0.5) / SS) * scale);
          r += cr * ca; g += cg * ca; b += cb * ca; a += ca;
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 4;
      px[i] = a ? Math.round(r / a) : 0;
      px[i + 1] = a ? Math.round(g / a) : 0;
      px[i + 2] = a ? Math.round(b / a) : 0;
      px[i + 3] = Math.round((a / n) * 255);
    }
  }
  return px;
}

// ── PNG encoding ────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = new URL('../public/icons/', import.meta.url);
await mkdir(outDir, { recursive: true });
for (const size of SIZES) {
  await writeFile(new URL(`icon-${size}.png`, outDir), encodePng(size, render(size)));
  console.log(`✓ icon-${size}.png`);
}
