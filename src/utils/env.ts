/**
 * Build-time configuration (from `.env`, via Vite).
 *
 * Anything read from `import.meta.env` is compiled into the bundle, so only
 * values that are safe to publish may be used in production builds: the
 * backend URL and the Reddit installed-app client id (both public by design).
 * API keys are only honoured in development builds (`__RH_DEV__`); in a
 * production build the dead branch — and the literal key — is eliminated.
 */
function clean(value: string | undefined): string {
  return (value ?? '').trim();
}

const rawBackend = clean(import.meta.env.VITE_BACKEND_URL);

export const BUILD_ENV = {
  /** Origin+path of the deployed backend proxy, no trailing slash. */
  backendUrl: rawBackend.replace(/\/+$/, ''),
  redditClientId: clean(import.meta.env.VITE_REDDIT_CLIENT_ID),
  /** Claude model used by the optional AI layer (public identifier, not a secret). */
  aiModel: clean(import.meta.env.VITE_AI_MODEL),
  devKeys: {
    braveApiKey: __RH_DEV__ ? clean(import.meta.env.VITE_DEV_BRAVE_API_KEY) : '',
    anthropicApiKey: __RH_DEV__ ? clean(import.meta.env.VITE_DEV_ANTHROPIC_API_KEY) : '',
  },
} as const;

export const EXTENSION_VERSION: string =
  (typeof chrome !== 'undefined' && chrome.runtime?.getManifest?.().version) || '1.0.0';
