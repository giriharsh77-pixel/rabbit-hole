/**
 * A tiny, dependency-free SVG diagram toolkit used by make-flowcharts.mjs.
 * Output is plain SVG 1.1 (no filters, no CSS classes, no scripts) so that
 * Figma / FigJam / Illustrator / browsers import it as editable shapes and text.
 */

export const THEME = {
  font: "Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif",
  ink: '#16161a',
  ink2: '#55555f',
  ink3: '#8a8a94',
  line: '#6b6b78',
  accent: '#d63a0b',
  accentSoft: '#fdeee8',
  accentMid: '#ff7a3d',
  surface: '#ffffff',
  canvas: '#f4f2ee',
  border: '#d9d6cf',
  good: '#0b8a55',
  goodSoft: '#e4f5ec',
  cool: '#2f5fd0',
  coolSoft: '#e8eefc',
  warn: '#a96400',
  warnSoft: '#fdf1dc',
  dark: '#0b0b0d',
  darkSoft: '#1b1b1f',
};

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Greedy word-wrap using an average glyph width (good enough for sans-serif). */
export function wrap(text, maxWidth, fontSize) {
  const perChar = fontSize * 0.54;
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (next.length * perChar > maxWidth && line) {
        out.push(line);
        line = word;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

export class Diagram {
  constructor(width, height, { background = THEME.surface } = {}) {
    this.w = width;
    this.h = height;
    this.background = background;
    this.parts = [];
    this.defs = [];
    this.nodes = new Map();
    this.markerId = 0;
    this.markers = new Map();
    this.clipId = 0;
  }

  add(svg) {
    this.parts.push(svg);
    return this;
  }

  rect(x, y, w, h, { rx = 0, fill = 'none', stroke = 'none', sw = 1, dash, opacity, id } = {}) {
    // SVG 1.1 has no rgba(): split it into fill + fill-opacity (Figma-safe)
    let fillAttr = `fill="${fill}"`;
    const m = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(fill);
    if (m) fillAttr = `fill="#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}" fill-opacity="${m[4]}"`;
    return this.add(
      `<rect ${id ? `id="${id}" ` : ''}x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" ${fillAttr} stroke="${stroke}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ''}${opacity !== undefined ? ` opacity="${opacity}"` : ''}/>`,
    );
  }

  /** Multi-line text. `anchor`: start | middle | end.  `valign`: top | middle. */
  text(x, y, str, { size = 14, weight = 400, fill = THEME.ink, anchor = 'start', lineHeight = 1.28, maxWidth, valign = 'top', italic = false, letterSpacing, id } = {}) {
    const lines = maxWidth ? wrap(str, maxWidth, size) : String(str).split('\n');
    const lh = size * lineHeight;
    // explicit baseline math instead of dominant-baseline (not honoured by every importer)
    const startY = valign === 'middle' ? y - ((lines.length - 1) * lh) / 2 + size * 0.35 : y + size * 0.82;
    const tspans = lines
      .map((l, i) => `<tspan x="${x}" y="${(startY + i * lh).toFixed(1)}">${esc(l)}</tspan>`)
      .join('');
    return this.add(
      `<text ${id ? `id="${id}" ` : ''}font-family="${THEME.font}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${italic ? ' font-style="italic"' : ''}${letterSpacing ? ` letter-spacing="${letterSpacing}"` : ''}>${tspans}</text>`,
    );
  }

  circle(cx, cy, r, { fill = 'none', stroke = 'none', sw = 1 } = {}) {
    return this.add(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`);
  }

  polyline(points, { stroke = THEME.line, sw = 2, dash, arrow = true, radius = 10 } = {}) {
    // rounded orthogonal corners; the arrowhead is a real shape (Figma drops SVG markers)
    let pts = points.filter((p, i) => i === 0 || p[0] !== points[i - 1][0] || p[1] !== points[i - 1][1]);
    let head = '';
    if (arrow && pts.length >= 2) {
      const [tx, ty] = pts[pts.length - 1];
      const [px, py] = pts[pts.length - 2];
      const len = Math.hypot(tx - px, ty - py) || 1;
      const ux = (tx - px) / len, uy = (ty - py) / len;
      const L = 11, Wd = 5.5;
      const bx = tx - ux * L, by = ty - uy * L;
      head = `<path d="M${tx},${ty} L${bx - uy * Wd},${by + ux * Wd} L${bx + uy * Wd},${by - ux * Wd} Z" fill="${stroke}"/>`;
      pts = [...pts.slice(0, -1), [bx, by]];
    }
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) {
      const [x, y] = pts[i];
      if (i < pts.length - 1) {
        const [px, py] = pts[i - 1];
        const [nx, ny] = pts[i + 1];
        const r = Math.min(radius, Math.hypot(x - px, y - py) / 2, Math.hypot(nx - x, ny - y) / 2);
        const ux = Math.sign(x - px), uy = Math.sign(y - py);
        const vx = Math.sign(nx - x), vy = Math.sign(ny - y);
        d += ` L${x - ux * r},${y - uy * r} Q${x},${y} ${x + vx * r},${y + vy * r}`;
      } else d += ` L${x},${y}`;
    }
    return this.add(
      `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"${dash ? ` stroke-dasharray="${dash}"` : ''}/>${head}`,
    );
  }

  /** Small label with a background "pill" so it stays legible on top of lines. */
  label(x, y, str, { size = 11, fill = THEME.ink2, bg = THEME.surface, border = 'none', weight = 500, maxWidth = 130, padX = 6, padY = 3 } = {}) {
    const lines = wrap(str, maxWidth, size);
    const w = Math.max(...lines.map((l) => l.length)) * size * 0.54 + padX * 2;
    const lh = size * 1.25;
    const h = lines.length * lh + padY * 2;
    this.rect(x - w / 2, y - h / 2, w, h, { rx: Math.min(8, h / 2), fill: bg, stroke: border, sw: 1 });
    this.text(x, y, lines.join('\n'), { size, fill, weight, anchor: 'middle', valign: 'middle', lineHeight: 1.25 });
    return this;
  }

  // ─── flowchart nodes ──────────────────────────────────────────────────────

  registerNode(id, x, y, w, h) {
    const n = { id, x, y, w, h, top: [x + w / 2, y], bottom: [x + w / 2, y + h], left: [x, y + h / 2], right: [x + w, y + h / 2] };
    this.nodes.set(id, n);
    return n;
  }

  /** kind: process | terminator | decision | io | store | subprocess */
  node(id, kind, x, y, w, h, label, { fill = THEME.surface, stroke = THEME.ink, color = THEME.ink, size = 13, weight = 500, sw = 1.6, sub } = {}) {
    const n = this.registerNode(id, x, y, w, h);
    const cx = x + w / 2;
    const cy = y + h / 2;
    switch (kind) {
      case 'terminator':
        this.rect(x, y, w, h, { rx: h / 2, fill, stroke, sw });
        break;
      case 'decision':
        this.add(`<polygon points="${cx},${y} ${x + w},${cy} ${cx},${y + h} ${x},${cy}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`);
        break;
      case 'io': {
        const k = 18;
        this.add(`<polygon points="${x + k},${y} ${x + w},${y} ${x + w - k},${y + h} ${x},${y + h}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`);
        break;
      }
      case 'store': {
        const e = 8;
        this.add(
          `<path d="M${x},${y + e} A${w / 2},${e} 0 0 1 ${x + w},${y + e} V${y + h - e} A${w / 2},${e} 0 0 1 ${x},${y + h - e} Z" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>` +
            `<path d="M${x},${y + e} A${w / 2},${e} 0 0 0 ${x + w},${y + e}" fill="none" stroke="${stroke}" stroke-width="${sw}"/>`,
        );
        break;
      }
      case 'subprocess':
        this.rect(x, y, w, h, { rx: 6, fill, stroke, sw });
        this.add(`<line x1="${x + 10}" y1="${y}" x2="${x + 10}" y2="${y + h}" stroke="${stroke}" stroke-width="${sw}"/><line x1="${x + w - 10}" y1="${y}" x2="${x + w - 10}" y2="${y + h}" stroke="${stroke}" stroke-width="${sw}"/>`);
        break;
      default:
        this.rect(x, y, w, h, { rx: 9, fill, stroke, sw });
    }
    const inset = kind === 'decision' ? w * 0.26 : kind === 'io' ? 30 : kind === 'subprocess' ? 22 : 14;
    const lines = wrap(label, w - inset * 2, size);
    this.text(cx, cy - (sub ? 7 : 0), lines.join('\n'), { size, weight, fill: color, anchor: 'middle', valign: 'middle' });
    if (sub) this.text(cx, cy + lines.length * size * 0.64 + 3, sub, { size: size - 3, fill: THEME.ink3, anchor: 'middle', valign: 'middle' });
    return n;
  }

  /**
   * Orthogonal connector between two registered nodes.
   * opts.via: extra waypoints [[x,y],…] inserted between the anchors.
   * opts.label / opts.labelAt: [x,y] absolute or fraction along first segment.
   */
  edge(from, fromSide, to, toSide, { via = [], label, labelAt, stroke = THEME.line, dash, sw = 2, midX, midY, offsetFrom = 0, offsetTo = 0, labelOpts = {} } = {}) {
    const a = this.nodes.get(from);
    const b = this.nodes.get(to);
    if (!a || !b) throw new Error(`unknown node in edge ${from}→${to}`);
    const shift = (pt, side, off) => (side === 'left' || side === 'right' ? [pt[0], pt[1] + off] : [pt[0] + off, pt[1]]);
    const p1 = shift(a[fromSide], fromSide, offsetFrom);
    const p2 = shift(b[toSide], toSide, offsetTo);
    let pts = [p1];
    if (via.length) pts.push(...via);
    else {
      const horizontalOut = fromSide === 'left' || fromSide === 'right';
      const horizontalIn = toSide === 'left' || toSide === 'right';
      if (horizontalOut && horizontalIn) {
        const mx = midX ?? (p1[0] + p2[0]) / 2;
        if (p1[1] !== p2[1]) pts.push([mx, p1[1]], [mx, p2[1]]);
      } else if (!horizontalOut && !horizontalIn) {
        const my = midY ?? (p1[1] + p2[1]) / 2;
        if (p1[0] !== p2[0]) pts.push([p1[0], my], [p2[0], my]);
      } else if (horizontalOut && !horizontalIn) {
        pts.push([p2[0], p1[1]]);
      } else {
        pts.push([p1[0], p2[1]]);
      }
    }
    pts.push(p2);
    this.polyline(pts, { stroke, sw, dash });
    if (label) {
      let pos = labelAt;
      if (!pos) {
        const [q, r] = [pts[0], pts[1]];
        pos = [(q[0] + r[0]) / 2, (q[1] + r[1]) / 2];
      }
      this.label(pos[0], pos[1], label, labelOpts);
    }
    return pts;
  }

  /** Rounded "frame" panel with a title tab, used to group related nodes. */
  frame(x, y, w, h, title, { fill = 'none', stroke = THEME.border, titleFill = THEME.ink3, dash = '6 5' } = {}) {
    this.rect(x, y, w, h, { rx: 16, fill, stroke, sw: 1.5, dash });
    this.text(x + 18, y + 14, title.toUpperCase(), { size: 11, weight: 700, fill: titleFill, letterSpacing: '0.12em' });
    return this;
  }

  toString() {
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${this.w}" height="${this.h}" viewBox="0 0 ${this.w} ${this.h}">` +
      (this.defs.length ? `<defs>${this.defs.join('')}</defs>` : '') +
      `<rect width="${this.w}" height="${this.h}" fill="${this.background}"/>` +
      this.parts.join('\n') +
      `</svg>`
    );
  }
}
