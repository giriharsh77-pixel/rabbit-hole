/** Compile-time constants injected by Vite `define` (see vite.config.ts). */
declare const __RH_DEV__: boolean;
declare const __RH_PREVIEW__: boolean;

interface ImportMetaEnv {
  readonly VITE_BACKEND_URL?: string;
  readonly VITE_REDDIT_CLIENT_ID?: string;
  readonly VITE_AI_MODEL?: string;
  readonly VITE_DEV_BRAVE_API_KEY?: string;
  readonly VITE_DEV_ANTHROPIC_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
