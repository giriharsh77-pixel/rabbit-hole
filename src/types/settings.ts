export type ThemeMode = 'dark' | 'light' | 'system';

export interface Settings {
  schemaVersion: 1;

  appearance: {
    theme: ThemeMode;
  };

  reddit: {
    /** Threads from these subreddits rank a little higher. */
    preferredSubreddits: string[];
    showThumbnails: boolean;
    includeNsfw: boolean;
    /**
     * Send requests with the user's own reddit.com cookies.  Off by default
     * (anonymous requests).  Turning it on helps when Reddit blocks anonymous
     * traffic, at the cost of tying requests to the user's Reddit account.
     */
    useBrowserSession: boolean;
  };

  reading: {
    /** Articles shown (5–30). */
    recommendationCount: number;
    /** Minimum relevance score (0–100) to display an article. */
    minRelevance: number;
    /** Topics the user always cares about; biases queries and ranking. */
    preferredTopics: string[];
    /** Extra Substack publication slugs to search by feed (keyless mode). */
    extraPublications: string[];
    /** Search custom-domain Substack publications from the built-in list. */
    includeCustomDomains: boolean;
    /** Also search Medium's public tag feeds (sends topic words to medium.com). */
    includeMedium: boolean;
  };

  privacy: {
    /** Master switch for reading the current page. */
    detectionEnabled: boolean;
    youtubeDetection: boolean;
    netflixDetection: boolean;
    /** Opt-in: use an LLM for topic extraction / relevance explanations. */
    aiEnabled: boolean;
  };
}

/** Credentials are stored apart from settings and never leave the background worker. */
export interface Secrets {
  braveApiKey?: string;
  anthropicApiKey?: string;
  redditClientId?: string;
}

export type SecretName = keyof Secrets;

/** What the UI is allowed to know about a stored secret. */
export interface SecretStatus {
  configured: boolean;
  /** e.g. "••••3f9a" */
  masked?: string;
  /** `build` = compiled in via env (dev), `user` = typed into Settings. */
  origin?: 'build' | 'user';
}

export type SecretsStatus = Record<SecretName, SecretStatus>;

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };
