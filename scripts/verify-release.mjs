#!/usr/bin/env node
/**
 * Release gate — builds the extension with *sentinel secrets in the environment*
 * and proves they cannot reach a production bundle, then scans the output for
 * patterns Chrome's CSP / Web Store review forbid.  Finishes with a clean build
 * so dist/ is always left in a releasable state.
 *
 *   npm run verify:release
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');

function build(env = {}, extraArgs = []) {
  const r = spawnSync(process.execPath, ['scripts/build.mjs', ...extraArgs], {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    console.error(r.stdout, r.stderr);
    throw new Error('build failed');
  }
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

const failures = [];
const check = (ok, message) => {
  console.log(`${ok ? '✓' : '✗'} ${message}`);
  if (!ok) failures.push(message);
};

const SENTINELS = { VITE_DEV_BRAVE_API_KEY: 'SENTINEL_BRAVE_9f3a1c', VITE_DEV_ANTHROPIC_API_KEY: 'SENTINEL_ANTHROPIC_77b2e0' };

// 1 ─ production build with secrets in the environment
build({ ...SENTINELS, VITE_REDDIT_CLIENT_ID: 'PUBLIC_CLIENT_ID_5c1d', VITE_BACKEND_URL: 'https://api.example.workers.dev' });
const files = [...walk(dist)].filter((f) => /\.(js|html|css|json|map)$/.test(f));
const all = files.map((f) => [f, readFileSync(f, 'utf8')]);
const found = (needle) => all.filter(([, text]) => text.includes(needle)).map(([f]) => f.replace(dist, 'dist'));

check(found('SENTINEL_').length === 0, 'development API keys are stripped from production builds');
check(found('PUBLIC_CLIENT_ID_5c1d').length > 0, 'the public Reddit client id is compiled in');
check(JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8')).host_permissions.includes('https://api.example.workers.dev/*'), 'the backend origin (and only it) is added to host_permissions');
check(!files.some((f) => f.endsWith('.map')), 'no source maps are shipped');
for (const pattern of ['eval(', 'new Function(', 'document.write(', 'unsafe-eval', 'unsafe-inline']) {
  check(found(pattern).length === 0, `no \`${pattern}\` in the build`);
}
for (const [f, text] of all.filter(([f]) => f.endsWith('.html'))) {
  check(!/<script[^>]+src=["']https?:/.test(text) && !/<script(?![^>]*\bsrc)[^>]*>[^<]+<\/script>/.test(text), `${f.replace(dist, 'dist')} loads no remote or inline script`);
}
for (const [f, text] of all.filter(([f]) => f.includes('/content/'))) {
  check(!/^\s*(import|export)\s/m.test(text), `${f.replace(dist, 'dist')} is a self-contained script`);
}

// 2 ─ development build is the *only* place keys are embedded
build({ ...SENTINELS }, ['--mode', 'development']);
check(
  readdirSync(dist).length > 0 && [...walk(dist)].some((f) => /\.(js)$/.test(f) && readFileSync(f, 'utf8').includes('SENTINEL_BRAVE_9f3a1c')),
  'development builds do embed dev keys (that is their purpose)',
);

// 3 ─ leave a clean production build behind
build();
const leftover = [...walk(dist)].filter((f) => /\.(js|html|json)$/.test(f)).some((f) => readFileSync(f, 'utf8').includes('SENTINEL_'));
check(!leftover, 'final dist/ is a clean production build');

console.log(failures.length ? `\n${failures.length} release check(s) failed` : '\nAll release checks passed');
process.exit(failures.length ? 1 : 0);
