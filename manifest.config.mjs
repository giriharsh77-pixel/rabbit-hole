// @ts-check
/**
 * Manifest V3 generator.
 *
 * The manifest is generated (rather than hand-written JSON) for two reasons:
 *   1. Optional host permissions for custom-domain Substack feeds are derived
 *      from the single source of truth in src/services/substack/seeds.json.
 *   2. The origin of the (optional) build-time backend URL is added to
 *      `host_permissions` — and nothing broader.
 *
 * Every permission is explained in README.md → "Permissions".
 */
import { readFileSync } from 'node:fs';

const seeds = JSON.parse(
  readFileSync(new URL('./src/services/substack/seeds.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

/** Hostnames of seed feeds that are not served from *.substack.com. */
export function customFeedOrigins() {
  const origins = new Set();
  for (const pub of seeds.publications) {
    const { hostname, protocol } = new URL(pub.feedUrl);
    if (!hostname.endsWith('.substack.com')) origins.add(`${protocol}//${hostname}/*`);
  }
  return [...origins].sort();
}

/**
 * @param {{ backendUrl?: string, dev?: boolean }} [opts]
 * @returns {chrome.runtime.ManifestV3}
 */
export function createManifest({ backendUrl = '', dev = false } = {}) {
  /** @type {string[]} */
  const hostPermissions = [
    // Reddit: public JSON/RSS endpoints + the official OAuth API
    'https://www.reddit.com/*',
    'https://oauth.reddit.com/*',
    // Platforms we can detect "what you're watching" on (content scripts + tab URLs)
    'https://www.youtube.com/*',
    'https://m.youtube.com/*',
    'https://www.netflix.com/*',
    // Substack publications hosted on substack.com (RSS feeds + article pages)
    'https://*.substack.com/*',
    'https://medium.com/*', // Medium's public tag feeds (Related Reading)
  ];

  if (backendUrl) {
    try {
      const url = new URL(backendUrl);
      hostPermissions.push(`${url.protocol}//${url.host}/*`);
    } catch {
      throw new Error(`VITE_BACKEND_URL is not a valid URL: ${backendUrl}`);
    }
  }

  return {
    manifest_version: 3,
    name: dev ? 'Rabbit Hole (dev)' : 'Rabbit Hole',
    version: pkg.version,
    description:
      'See what the internet is talking about — and go deeper. Trending Reddit threads plus thoughtful Substack reading related to what you watch.',
    minimum_chrome_version: '116',
    icons: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
    action: {
      default_title: 'Rabbit Hole',
      default_popup: 'popup.html',
      default_icon: {
        16: 'icons/icon-16.png',
        32: 'icons/icon-32.png',
        48: 'icons/icon-48.png',
      },
    },
    options_ui: { page: 'options.html', open_in_tab: true },
    background: { service_worker: 'background.js', type: 'module' },
    permissions: ['storage', 'activeTab', 'scripting'],
    host_permissions: hostPermissions,
    // Requested at runtime, per feature, only when the user turns the feature on.
    optional_host_permissions: [
      'https://api.search.brave.com/*', // bring-your-own Brave Search key
      'https://api.anthropic.com/*', //    bring-your-own Anthropic key (AI layer)
      ...customFeedOrigins(), //           custom-domain Substack publications
    ],
    content_scripts: [
      {
        matches: ['https://www.youtube.com/*', 'https://m.youtube.com/*'],
        js: ['content/youtube.js'],
        run_at: 'document_idle',
      },
      {
        matches: ['https://www.netflix.com/*'],
        js: ['content/netflix.js'],
        run_at: 'document_idle',
      },
      {
        matches: ['https://www.reddit.com/*'],
        js: ['content/reddit.js'],
        run_at: 'document_idle',
      },
      {
        // Substack-hosted publications.  Custom-domain Substacks (and every other
        // site) are only ever inspected on demand via activeTab + scripting.
        matches: ['https://*.substack.com/*'],
        js: ['content/generic.js'],
        run_at: 'document_idle',
      },
    ],
    content_security_policy: {
      extension_pages:
        "script-src 'self'; object-src 'self'; base-uri 'none'; img-src 'self' data: https://*.redd.it https://*.redditmedia.com",
    },
  };
}
