/**
 * Tiny, defensive DOM helpers shared by the platform extractors.
 * Everything returns `undefined` rather than throwing: a site redesign must
 * degrade to "couldn't detect" — never to an exception inside someone's page.
 */
import { cleanText } from '../../../utils/sanitize';

export function attr(el: Element | null | undefined, name: string): string | undefined {
  const v = el?.getAttribute(name);
  return v ? v : undefined;
}

export function textOf(el: Element | null | undefined, max = 600): string | undefined {
  if (!el) return undefined;
  const t = cleanText(el.textContent ?? '', max);
  return t || undefined;
}

export function meta(doc: Document, key: string): string | undefined {
  const sel = `meta[property="${key}"], meta[name="${key}"], meta[itemprop="${key}"]`;
  const content = doc.querySelector(sel)?.getAttribute('content');
  const t = cleanText(content ?? '', 1200);
  return t || undefined;
}

export function metaAll(doc: Document, key: string): string[] {
  const sel = `meta[property="${key}"], meta[name="${key}"]`;
  return [...doc.querySelectorAll(sel)]
    .map((m) => cleanText(m.getAttribute('content') ?? '', 120))
    .filter(Boolean);
}

/** First selector that yields non-empty text. */
export function firstText(root: ParentNode, selectors: readonly string[], max = 600): { text: string; selector: string } | undefined {
  for (const selector of selectors) {
    let el: Element | null = null;
    try {
      el = root.querySelector(selector);
    } catch {
      continue; // invalid selector in an old engine — skip
    }
    const text = textOf(el, max);
    if (text) return { text, selector };
  }
  return undefined;
}

type JsonObject = Record<string, unknown>;

/** Parses every <script type="application/ld+json"> block, flattening @graph. */
export function jsonLd(doc: Document): JsonObject[] {
  const out: JsonObject[] = [];
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    const raw = script.textContent;
    if (!raw || raw.length > 400_000) continue;
    try {
      const parsed: unknown = JSON.parse(raw);
      const queue: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of queue) {
        if (!item || typeof item !== 'object') continue;
        const obj = item as JsonObject;
        if (Array.isArray(obj['@graph'])) {
          for (const g of obj['@graph'] as unknown[]) if (g && typeof g === 'object') out.push(g as JsonObject);
        } else {
          out.push(obj);
        }
      }
    } catch {
      /* malformed JSON-LD is common; ignore */
    }
  }
  return out;
}

export function ldType(obj: JsonObject): string[] {
  const t = obj['@type'];
  return (Array.isArray(t) ? t : [t]).filter((x): x is string => typeof x === 'string');
}

export function str(v: unknown, max = 600): string | undefined {
  if (typeof v === 'string') return cleanText(v, max) || undefined;
  if (v && typeof v === 'object' && 'name' in v) return str((v as { name: unknown }).name, max);
  return undefined;
}

export function strList(v: unknown, max = 8): string[] {
  const arr = Array.isArray(v) ? v : v === undefined || v === null ? [] : [v];
  const out: string[] = [];
  for (const item of arr) {
    const s = str(item, 80);
    if (s && !out.includes(s)) out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

export function splitList(value: string | undefined, sep = /[,;|]/): string[] {
  if (!value) return [];
  return value
    .split(sep)
    .map((s) => cleanText(s, 60))
    .filter(Boolean);
}

export function stripSiteSuffix(title: string, ...suffixes: RegExp[]): string {
  let t = title;
  for (const re of suffixes) t = t.replace(re, '');
  return cleanText(t, 300);
}
