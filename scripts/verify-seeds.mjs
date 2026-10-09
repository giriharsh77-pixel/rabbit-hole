#!/usr/bin/env node
/**
 * Re-checks every publication in src/services/substack/seeds.json:
 *   - the feed answers HTTP 200 directly (no surprise redirect)
 *   - it contains items, and the newest one is reasonably recent
 *
 * Usage:  npm run seeds:verify
 * Exit code is non-zero when any feed is dead, so it can run in CI on a schedule.
 */
import { readFile } from 'node:fs/promises';

const seeds = JSON.parse(
  await readFile(new URL('../src/services/substack/seeds.json', import.meta.url), 'utf8'),
);
const STALE_DAYS = 120;
const now = Date.now();

async function check(pub) {
  try {
    const res = await fetch(pub.feedUrl, {
      redirect: 'manual',
      headers: { 'user-agent': 'RabbitHole-seed-check/1.0', accept: 'application/rss+xml, application/xml' },
      signal: AbortSignal.timeout(15000),
    });
    if (res.status >= 300 && res.status < 400) {
      return { pub, ok: false, note: `redirects to ${res.headers.get('location')}` };
    }
    if (res.status !== 200) return { pub, ok: false, note: `HTTP ${res.status}` };
    const xml = await res.text();
    const items = (xml.match(/<item>/g) ?? []).length;
    const last = xml.match(/<item>[\s\S]*?<pubDate>([^<]+)<\/pubDate>/)?.[1];
    if (!items) return { pub, ok: false, note: 'no items' };
    const ageDays = last ? Math.round((now - Date.parse(last)) / 86_400_000) : NaN;
    if (Number.isFinite(ageDays) && ageDays > STALE_DAYS) {
      return { pub, ok: false, note: `stale (${ageDays} days since last post)` };
    }
    return { pub, ok: true, note: `${items} items, newest ${Number.isFinite(ageDays) ? `${ageDays}d ago` : 'date n/a'}` };
  } catch (err) {
    return { pub, ok: false, note: `error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

const results = [];
const queue = [...seeds.publications];
await Promise.all(
  Array.from({ length: 6 }, async () => {
    for (let pub = queue.shift(); pub; pub = queue.shift()) results.push(await check(pub));
  }),
);

results.sort((a, b) => a.pub.id.localeCompare(b.pub.id));
for (const r of results) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.pub.id.padEnd(26)} ${r.note}`);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} feeds healthy`);
process.exit(failed.length ? 1 : 0);
