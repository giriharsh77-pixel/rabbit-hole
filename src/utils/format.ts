export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(clamp(n, min, max));
}

/** 12400 → "12.4K", 2100 → "2.1K", 999 → "999", 1_250_000 → "1.3M" */
export function formatCount(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${trim(n / 1_000_000)}M`;
  if (abs >= 10_000) return `${trim(n / 1_000, 1)}K`;
  if (abs >= 1_000) return `${trim(n / 1_000, 1)}K`;
  return String(Math.round(n));
}

function trim(n: number, digits = 1): string {
  return n.toFixed(digits).replace(/\.0+$/, '');
}

/** Accepts ms (≥1e11) or seconds since epoch. */
export function toMs(ts: number): number {
  return ts < 1e11 ? ts * 1000 : ts;
}

export function timeAgo(ts: number, now = Date.now()): string {
  const diff = Math.max(0, now - toMs(ts));
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

export function formatDate(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return undefined;
  return new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many;
}
