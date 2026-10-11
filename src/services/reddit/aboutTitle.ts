/**
 * "Is this Reddit thread actually about the show?"
 *
 * Searching Reddit for "The Office" also finds r/antiwork rants about the
 * office.  A title is a proper noun, so a thread only counts when it is in
 * the show's own subreddit, or names the title *and* shows it means the show:
 * it's in a TV / film community, writes the title as a name ("The Office", not
 * "the office"), mentions the cast or characters, or talks like a viewer
 * ("episode", "season", "rewatch"…).  Work / career / office-furniture
 * subreddits need a cast or character name to get in at all.
 */
import type { RedditPost } from '../../types/reddit';
import { normalizeText } from '../../utils/text';
import type { SearchRequest } from './providers';

export interface DiscussSubject {
  title: string;
  kind: 'movie' | 'series';
  /** The show's own community (Wikidata), e.g. "DunderMifflin". */
  ownSubreddit?: string | undefined;
  episodeName?: string | undefined;
  season?: number | undefined;
  /** Cast and character names, best-known first. */
  names: string[];
}

/** Communities about TV and film in general (lower-case). */
export const MEDIA_SUBREDDITS = new Set(
  [
    'television', 'netflix', 'tvdetails', 'netflixbestof', 'televisionsuggestions', 'sitcoms', 'tvplus', 'streaming',
    'movies', 'moviedetails', 'truefilm', 'flicks', 'moviesuggestions', 'boxoffice', 'criterion', 'letterboxd', 'imdb', 'cinema', 'film',
    'entertainment', 'fantheories', 'popculturechat', 'rewatchables', 'documentaries', 'horror', 'scifi', 'anime', 'kdrama', 'kdramarecommends',
    'bollywood', 'indiancinema', 'tollywood', 'kollywood', 'malayalammovies', 'indianstreams', 'indiantv', 'bollywoodmemes',
  ],
);

/** Where "the office", "suits", "friends"… almost never mean the show. */
export const OFF_TOPIC_SUBREDDITS = new Set(
  [
    'antiwork', 'careerguidance', 'jobs', 'managers', 'humanresources', 'askhr', 'recruitinghell', 'workreform', 'overemployed', 'askmanagers',
    'sysadmin', 'cscareerquestions', 'itcareerquestions', 'legaladvice', 'personalfinance', 'workfromhome', 'remotework', 'wfh', 'consulting',
    'accounting', 'nursing', 'teachers', 'smallbusiness', 'entrepreneur', 'realestate', 'commercialrealestate',
    'malelivingspace', 'femalelivingspace', 'battlestations', 'homeoffice', 'officechairs', 'interiordesign', 'desksetup',
    'excel', 'msoffice', 'office365', 'microsoftoffice', 'sharepoint', 'officedepot',
  ],
);

const TV_SCOPE = ['television', 'netflix', 'TVDetails', 'NetflixBestOf', 'sitcoms'];
const FILM_SCOPE = ['movies', 'MovieDetails', 'TrueFilm', 'netflix', 'flicks'];

/** Words viewers use when they talk about a show or film. */
const VIEWER_WORDS =
  /\b(episodes?|seasons?|series|show|shows|sitcom|movie|movies|film|films|watch(?:ed|ing)?|rewatch(?:ed|ing)?|binge(?:d)?|netflix|cast|actors?|actress|scenes?|finale|pilot|characters?|trailer|director|spoilers?|plot|ending|writers?|showrunner|cameo)\b/i;

/**
 * The name people actually use: "Glass Onion: A Knives Out Mystery" → "Glass Onion",
 * "Heeramandi: The Diamond Bazaar" → "Heeramandi" — but "Mission: Impossible" stays whole.
 */
export function searchName(title: string): string {
  const t = title.trim();
  const m = /^([^:–—]+?)\s*[:–—]\s+\S/.exec(t);
  if (!m) return t;
  const head = (m[1] ?? '').trim();
  const words = head.split(/\s+/);
  return words.length >= 2 || head.length >= 8 ? head : t;
}

const quote = (s: string) => (/\s/.test(s.trim()) ? `"${s.trim()}"` : s.trim());

/**
 * The searches to run (at most four requests):
 *   1. the show's own subreddit — the episode, or its best threads of all time
 *   2. TV (or film) subreddits — the title
 *   3. all of Reddit — title + episode, and the title
 */
export function discussPlan(s: DiscussSubject, order: 'relevance' | 'new' = 'relevance'): (Omit<SearchRequest, 'limit'> & { label: string })[] {
  const plan: (Omit<SearchRequest, 'limit'> & { label: string })[] = [];
  // "Newest" asks Reddit for its newest matches, not a re-shuffle of the most relevant ones
  const sort: SearchRequest['sort'] = order === 'new' ? 'new' : 'relevance';
  const title = quote(searchName(s.title));
  const own = s.ownSubreddit;
  if (own) {
    if (s.episodeName) plan.push({ label: `r/${own}`, query: quote(s.episodeName), subreddits: [own], sort, time: 'all' });
    else plan.push({ label: `r/${own}`, query: `subreddit:${own}`, subreddits: [], sort: order === 'new' ? 'new' : 'top', time: 'all' });
  }
  plan.push({ label: s.kind === 'movie' ? 'film subreddits' : 'TV subreddits', query: title, subreddits: s.kind === 'movie' ? FILM_SCOPE : TV_SCOPE, sort, time: 'all' });
  if (s.episodeName) plan.push({ label: 'all of Reddit', query: `${title} ${quote(s.episodeName)}`, subreddits: [], sort, time: 'all' });
  else if (s.season !== undefined) plan.push({ label: 'all of Reddit', query: `${title} season ${s.season}`, subreddits: [], sort, time: 'all' });
  plan.push({ label: 'all of Reddit', query: title, subreddits: [], sort, time: 'all' });
  return plan.slice(0, 4);
}

/** Full names, plus distinctive surnames ("Schrute", "Krasinski") — first names are too common to count. */
function nameMatchers(names: string[]): { full: string[]; surnames: string[] } {
  const full = names.map((n) => normalizeText(n)).filter((n) => n.includes(' '));
  const surnames = names
    .map((n) => n.trim().split(/\s+/))
    .filter((parts) => parts.length >= 2)
    .map((parts) => normalizeText(parts[parts.length - 1] ?? ''))
    .filter((w) => w.length >= 6);
  return { full: [...new Set(full)], surnames: [...new Set(surnames)] };
}

export interface TitleMatch {
  keep: boolean;
  /** 0–1: how clearly the thread is about this title (episode mentions score highest). */
  match: number;
  /** Ranking multiplier for where it was posted. */
  boost: number;
}

export function titleMatch(s: DiscussSubject, post: Pick<RedditPost, 'title' | 'subreddit' | 'preview'>): TitleMatch {
  const sub = post.subreddit.toLowerCase();
  const own = !!s.ownSubreddit && sub === s.ownSubreddit.toLowerCase();
  const media = MEDIA_SUBREDDITS.has(sub);
  const offTopic = OFF_TOPIC_SUBREDDITS.has(sub);

  const raw = `${post.title} ${post.preview.slice(0, 400)}`;
  const text = ` ${normalizeText(raw)} `;
  const has = (phrase: string) => !!phrase && text.includes(` ${phrase} `);

  const name = searchName(s.title);
  const titleNorm = normalizeText(name);
  const titleHit = has(titleNorm) || (titleNorm.startsWith('the ') && has(titleNorm.slice(4)) && titleNorm.split(' ').length > 2);
  // "The Office" as a name, not "the office" — only telling for multi-word titles
  const asName = name.includes(' ') && new RegExp(`(^|[^\\p{L}])${escapeRe(name)}($|[^\\p{L}])`, 'u').test(raw);
  const { full, surnames } = nameMatchers(s.names);
  const fullName = full.some(has);
  const nameHit = fullName || surnames.some(has);
  const viewer = VIEWER_WORDS.test(raw);
  const episodeHit = !!s.episodeName && has(normalizeText(s.episodeName));

  let keep: boolean;
  if (own) keep = true;
  else if (offTopic) keep = titleHit && nameHit;
  else if (titleHit) keep = media || asName || nameHit || viewer;
  else keep = media && fullName; // "Steve Carell on playing Michael Scott" in r/television

  let match = own ? 0.85 : titleHit ? (asName || nameHit || media ? 0.8 : 0.6) : 0.55;
  if (episodeHit) match += 0.15;
  if (own && titleHit) match += 0.05;
  return { keep, match: Math.min(1, match), boost: own ? 1.5 : media ? 1.2 : 1 };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
