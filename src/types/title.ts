/**
 * A movie or series, resolved to one Wikidata item — the shared identity every
 * tab works from (Discuss, Read, About, Watch next).
 */
export type TitleKind = 'movie' | 'series';

/** One row of the title search. */
export interface TitleCandidate {
  /** Wikidata item id, e.g. "Q23831". */
  qid: string;
  title: string;
  /** Wikidata's own one-liner, e.g. "American sitcom broadcast on NBC". */
  description?: string;
  kind: TitleKind;
  /** First release / first aired. */
  year?: number;
}

export interface CastMember {
  qid: string;
  name: string;
  /** Character played, when Wikidata records it. */
  character?: string;
  /** X (Twitter) username, without "@". */
  x?: string;
  /** Instagram username. */
  instagram?: string;
}

export interface Person {
  qid: string;
  name: string;
}

export interface TitleInfo extends TitleCandidate {
  genres: string[];
  /** In billing order. */
  cast: CastMember[];
  /** Directors (films) or creators (series). */
  creators: Person[];
  /** English Wikipedia article. */
  wikipediaUrl?: string;
  /** The show's own community, e.g. "DunderMifflin". */
  subreddit?: string;
  /** IMDb id, e.g. "tt0386676". */
  imdbId?: string;
  /** Letterboxd film slug (films only). */
  letterboxdId?: string;
  /** Rotten Tomatoes path, e.g. "tv/the_office" or "m/rrr". */
  rottenTomatoesId?: string;
  /** For the backend (phase 2): TMDB id and type. */
  tmdb?: { type: 'movie' | 'tv'; id: string };
  source: 'wikidata';
}

/** A Watch next suggestion, and the real connection behind it. */
export interface RelatedTitle extends TitleCandidate {
  /** People it shares with the title you're on, e.g. ["Steve Carell", "Ed Helms"]. */
  sharedCast: string[];
  /** The director / creator it shares, if any. */
  sharedCreator?: string;
  /** Wikipedia language editions covering it — a rough "how well known". */
  popularity: number;
}

export interface RelatedTitles {
  qid: string;
  withCast: RelatedTitle[];
  byCreators: RelatedTitle[];
  source: 'wikidata';
}

// ─── from the backend (TMDB · OMDb), when it has the keys ───────────────────

export interface TitleRatings {
  /** "8.9/10" */
  imdb?: string;
  imdbVotes?: string;
  /** "81%" (Tomatometer) */
  rottenTomatoes?: string;
  /** "68/100" */
  metacritic?: string;
  /** TMDB user score, 0–10, and how many votes it rests on. */
  tmdb?: { score: number; votes: number };
}

export interface TitleReview {
  author: string;
  /** The reviewer's own score, 0–10, when they gave one. */
  rating?: number;
  /** Plain text, trimmed. */
  excerpt: string;
  url: string;
  date?: string;
}

/** Where to watch it in India (TMDB watch providers, data by JustWatch). */
export interface WatchAvailability {
  region: 'IN';
  onNetflix: boolean;
  /** Other subscription services carrying it there, e.g. ["Prime Video"]. */
  elsewhere: string[];
  /** TMDB's "where to watch" page for the title. */
  link?: string;
}

export interface SimilarTitle {
  tmdb: { type: 'movie' | 'tv'; id: string };
  title: string;
  year?: number;
  overview?: string;
  /** Netflix India — only checked for the top suggestions. */
  onNetflixIndia?: boolean;
  /** Filled in by the extension when Wikidata knows the title, so "Explore" can open it. */
  qid?: string;
}

export interface TitleInsights {
  ratings?: TitleRatings;
  reviews: TitleReview[];
  similar: SimilarTitle[];
  availability?: WatchAvailability;
  /** Pages to credit, as the providers' terms require. */
  attribution: ('TMDB' | 'JustWatch' | 'OMDb')[];
  tmdbUrl?: string;
}
