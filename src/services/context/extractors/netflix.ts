/**
 * Netflix metadata extractor.
 *
 * Strictly limited to information the page already presents to the signed-in
 * viewer — the player's title label, the Media Session (if the page sets one),
 * and the public title page's JSON-LD / Open Graph tags.  It never touches the
 * video element, DRM / EME, network streams or any authentication material.
 *
 * Netflix's markup changes without notice and the player UI auto-hides its
 * labels, so every step is optional; if nothing can be established the caller
 * shows "We couldn't automatically identify what you're watching" and a manual
 * search box instead of guessing.
 */
import type { PlatformExtractor, RawPageMetadata } from '../../../types/context';
import { cleanText } from '../../../utils/sanitize';
import { detectPlatform } from '../platform';
import { jsonLd, ldType, meta, str, strList, stripSiteSuffix, textOf } from './dom';

const TITLE_LABEL_SELECTORS = ['[data-uia="video-title"]', '[data-uia="player-title"]', '.video-title'] as const;

interface PlayerLabel {
  title: string;
  season?: number;
  episodeNumber?: number;
  episodeName?: string;
}

function parseEpisodeTag(text: string): { season?: number; episode?: number } | undefined {
  const compact = text.match(/\bS(\d{1,2})\s*[:.\s-]?\s*E(\d{1,3})\b/i);
  if (compact) return { season: Number(compact[1]), episode: Number(compact[2]) };
  const long = text.match(/season\s+(\d{1,2})\D{1,12}episode\s+(\d{1,3})/i);
  if (long) return { season: Number(long[1]), episode: Number(long[2]) };
  const epOnly = text.match(/^(?:E|Ep\.?|Episode)\s*(\d{1,3})$/i);
  if (epOnly) return { episode: Number(epOnly[1]) };
  return undefined;
}

/** Reads the player's visible label: `<h4>Show</h4><span>S7:E2</span><span>Episode name</span>`. */
export function readPlayerLabel(doc: Document): PlayerLabel | undefined {
  for (const selector of TITLE_LABEL_SELECTORS) {
    const el = doc.querySelector(selector);
    if (!el) continue;
    const heading = el.querySelector('h1, h2, h3, h4');
    const spans = [...el.querySelectorAll('span')].map((s) => textOf(s, 160)).filter((t): t is string => !!t);
    if (heading) {
      const title = textOf(heading, 160);
      if (!title) continue;
      const label: PlayerLabel = { title };
      for (const s of spans) {
        const tag = parseEpisodeTag(s);
        if (tag) {
          if (tag.season !== undefined) label.season = tag.season;
          if (tag.episode !== undefined) label.episodeNumber = tag.episode;
        } else if (!label.episodeName) {
          label.episodeName = s;
        }
      }
      return label;
    }
    const whole = textOf(el, 200);
    if (whole) {
      // No heading element: "Show S7:E2 Episode name" in one string
      const tag = whole.match(/^(.*?)\s+(S\d{1,2}\s*:?\s*E\d{1,3})\s*(.*)$/i);
      if (tag?.[1] && tag[2]) {
        const parsed = parseEpisodeTag(tag[2]);
        const label: PlayerLabel = { title: tag[1].trim() };
        if (parsed?.season !== undefined) label.season = parsed.season;
        if (parsed?.episode !== undefined) label.episodeNumber = parsed.episode;
        if (tag[3]) label.episodeName = tag[3].trim();
        return label;
      }
      return { title: whole };
    }
  }
  return undefined;
}

interface TitlePageInfo {
  name?: string;
  description?: string;
  genres: string[];
  people: string[];
  type?: 'movie' | 'show';
}

/** JSON-LD + Open Graph from a Netflix title page (current document or a fetched one). */
export function readTitlePage(doc: Document): TitlePageInfo {
  const info: TitlePageInfo = { genres: [], people: [] };
  for (const obj of jsonLd(doc)) {
    const types = ldType(obj);
    const isMovie = types.includes('Movie');
    const isShow = types.some((t) => t === 'TVSeries' || t === 'TVSeason' || t === 'TVEpisode');
    if (!isMovie && !isShow) continue;
    info.name ??= str(obj.name, 160);
    info.description ??= str(obj.description, 700);
    info.genres.push(...strList(obj.genre, 6));
    info.people.push(...strList(obj.actor, 5), ...strList(obj.creator, 3), ...strList(obj.director, 2));
    info.type ??= isMovie ? 'movie' : 'show';
  }
  const ogTitle = meta(doc, 'og:title');
  info.name ??= ogTitle ? stripSiteSuffix(ogTitle, /\s*[|\-–—]\s*Netflix.*$/i) : undefined;
  info.description ??= meta(doc, 'og:description') ?? meta(doc, 'description');
  info.genres = [...new Set(info.genres)].slice(0, 6);
  info.people = [...new Set(info.people)].slice(0, 6);
  return info;
}

export interface NetflixOptions {
  /** Fetch the public title page for synopsis/genres when the player gives only a name. */
  enrich?: boolean;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** DOMParser factory (tests). */
  parse?: (html: string) => Document;
}

function sameNormalizedName(a: string | undefined, b: string | undefined): boolean {
  const norm = (s: string | undefined) => (s ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  return !!a && !!b && norm(a) === norm(b);
}

async function fetchTitlePage(videoId: string, opts: NetflixOptions): Promise<TitlePageInfo | undefined> {
  const doFetch = opts.fetchImpl ?? (typeof fetch === 'function' ? fetch.bind(globalThis) : undefined);
  const parse = opts.parse ?? ((html: string) => new DOMParser().parseFromString(html, 'text/html'));
  if (!doFetch) return undefined;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 4000);
  try {
    // Same-origin request for the public title page, exactly what clicking the
    // title would load.  Cookies stay on netflix.com; nothing is sent elsewhere.
    const res = await doFetch(`https://www.netflix.com/title/${encodeURIComponent(videoId)}`, {
      credentials: 'same-origin',
      signal: controller.signal,
      headers: { accept: 'text/html' },
    });
    if (!res.ok) return undefined;
    const html = (await res.text()).slice(0, 1_500_000);
    return readTitlePage(parse(html));
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

export async function extractNetflix(doc: Document, url: URL, opts: NetflixOptions = {}): Promise<RawPageMetadata | null> {
  const info = detectPlatform(url);
  if (info.platform !== 'netflix') return null;
  const videoId = url.pathname.match(/^\/(?:watch|title)\/(\d+)/)?.[1] ?? url.searchParams.get('jbv') ?? undefined;
  if (!videoId && !info.isWatchPage) return null;

  let title: string | undefined;
  let season: number | undefined;
  let episodeNumber: number | undefined;
  let episodeName: string | undefined;
  let description: string | undefined;
  let genres: string[] = [];
  let people: string[] = [];
  let type: 'movie' | 'show' | undefined;
  let confidence: RawPageMetadata['confidence'] = 'low';
  const sources: string[] = [];

  // 1 ─ the player's visible label (only present while the controls are shown)
  const label = readPlayerLabel(doc);
  if (label) {
    title = label.title;
    season = label.season;
    episodeNumber = label.episodeNumber;
    episodeName = label.episodeName;
    confidence = 'high';
    sources.push('player title label');
  }

  // 2 ─ Media Session metadata, if the page publishes it
  const session = typeof navigator !== 'undefined' ? navigator.mediaSession?.metadata : undefined;
  if (!title && session?.title) {
    title = cleanText(session.title, 160);
    confidence = 'medium';
    sources.push('media session');
  }

  // 3 ─ JSON-LD / Open Graph on the current page (title pages, browse modals)
  const here = readTitlePage(doc);
  if (here.name && (!title || sameNormalizedName(title, here.name))) {
    title ??= here.name;
    description = here.description;
    genres = here.genres;
    people = here.people;
    type = here.type;
    if (confidence === 'low') confidence = 'medium';
    sources.push('page metadata (JSON-LD)');
  }

  // 4 ─ public title page for synopsis / genres
  if (opts.enrich !== false && videoId && (!description || genres.length === 0)) {
    const remote = await fetchTitlePage(videoId, opts);
    if (remote?.name) {
      const consistent = !title || sameNormalizedName(title, remote.name);
      if (consistent) {
        title ??= remote.name;
        description ??= remote.description;
        if (genres.length === 0) genres = remote.genres;
        if (people.length === 0) people = remote.people;
        type ??= remote.type;
        if (confidence === 'low') confidence = 'medium';
        sources.push('Netflix title page');
      }
    }
  }

  if (!title) return null;

  const hasEpisode = season !== undefined || episodeNumber !== undefined || !!episodeName;
  const episodeLabel = hasEpisode
    ? [
        season !== undefined ? `Season ${season}` : undefined,
        episodeNumber !== undefined ? `Episode ${episodeNumber}` : undefined,
      ]
        .filter(Boolean)
        .join(', ')
    : undefined;
  const episode = [episodeLabel, episodeName].filter(Boolean).join(' — ') || undefined;

  const result: RawPageMetadata = {
    platform: 'netflix',
    kind: hasEpisode ? 'episode' : type === 'movie' ? 'movie' : info.isWatchPage ? 'show' : 'show',
    url: url.href,
    title: cleanText(title, 200),
    source: sources.join(' + ') || 'page',
    confidence,
  };
  if (episode) result.episode = episode;
  if (season !== undefined) result.season = season;
  if (episodeNumber !== undefined) result.episodeNumber = episodeNumber;
  if (description) result.description = description;
  if (genres.length) result.genres = genres;
  if (people.length) result.people = people;
  if (videoId) result.videoId = videoId;
  return result;
}

export const netflixExtractor: PlatformExtractor = {
  id: 'netflix',
  matches: (url) => detectPlatform(url).platform === 'netflix',
  extract: (doc, url) => extractNetflix(doc, url),
};
