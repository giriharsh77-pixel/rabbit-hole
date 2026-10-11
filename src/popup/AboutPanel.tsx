import { useState } from 'react';
import { EmptyState, ErrorState } from '../components/States';
import { ListSkeleton } from '../components/Skeleton';
import { ExternalIcon, FilmIcon, InstagramIcon, SearchIcon, XLogoIcon } from '../components/icons';
import type { ContentContext } from '../types/context';
import type { SerializedError } from '../types/errors';
import type { CastMember, TitleInfo, TitleInsights, TitleRatings } from '../types/title';
import { formatDate } from '../utils/format';

interface Props {
  idPrefix: string;
  active: boolean;
  /** What the tabs are about (Netflix or a picked title). */
  subject: ContentContext | null;
  info: TitleInfo | null | undefined;
  loading: boolean;
  error: SerializedError | undefined;
  onRetry: () => void;
  /** Put the cursor in the search box (optionally pre-filled). */
  onSearch: (prefill?: string) => void;
  /** From the backend (TMDB / OMDb); null = not available without one. */
  insights: TitleInsights | null | undefined;
  insightsLoading: boolean;
}

interface Link {
  label: string;
  href: string;
  hint: string;
}

/** Deep links built only from ids Wikidata holds — no scraping, nothing guessed. */
export function reviewLinks(t: TitleInfo): Link[] {
  const out: Link[] = [];
  if (t.imdbId) {
    out.push({ label: 'IMDb', href: `https://www.imdb.com/title/${t.imdbId}/`, hint: 'Rating, cast & crew' });
    out.push({ label: 'IMDb reviews', href: `https://www.imdb.com/title/${t.imdbId}/reviews/`, hint: 'User reviews' });
  }
  if (t.kind === 'movie') {
    const lb = t.letterboxdId ? `https://letterboxd.com/film/${t.letterboxdId}/` : t.imdbId ? `https://letterboxd.com/imdb/${t.imdbId}/` : undefined;
    if (lb) out.push({ label: 'Letterboxd', href: lb, hint: 'Reviews & ratings' });
  }
  if (t.rottenTomatoesId) out.push({ label: 'Rotten Tomatoes', href: `https://www.rottentomatoes.com/${t.rottenTomatoesId}`, hint: 'Critics & audience' });
  if (t.wikipediaUrl) out.push({ label: 'Wikipedia', href: t.wikipediaUrl, hint: 'Background & reception' });
  return out;
}

const CAST_PREVIEW = 8;

/** The About tab: what it is, where to read reviews, and the cast on social media. */
/** "IMDb 8.9/10", "Rotten Tomatoes 81%", … — only what the providers actually returned. */
export function ratingChips(r: TitleRatings | undefined): { label: string; value: string; hint?: string }[] {
  if (!r) return [];
  const out: { label: string; value: string; hint?: string }[] = [];
  if (r.imdb) out.push({ label: 'IMDb', value: r.imdb, ...(r.imdbVotes ? { hint: `${r.imdbVotes} votes` } : {}) });
  if (r.rottenTomatoes) out.push({ label: 'Rotten Tomatoes', value: r.rottenTomatoes, hint: 'critics' });
  if (r.metacritic) out.push({ label: 'Metacritic', value: r.metacritic });
  if (r.tmdb) out.push({ label: 'TMDB', value: `${r.tmdb.score}/10`, hint: `${r.tmdb.votes.toLocaleString('en-IN')} votes` });
  return out;
}

export function AboutPanel({ idPrefix, active, subject, info, loading, error, onRetry, onSearch, insights, insightsLoading }: Props) {
  const [allCast, setAllCast] = useState(false);
  const panelProps = {
    className: 'panel',
    role: 'tabpanel',
    id: `${idPrefix}-panel-about`,
    'aria-labelledby': `${idPrefix}-tab-about`,
    hidden: !active,
  } as const;
  const heading = (
    <div className="panel-title split-heading">
      <h2>About</h2>
    </div>
  );

  if (!subject) {
    return (
      <div {...panelProps}>
        {heading}
        <EmptyState
          icon={<FilmIcon />}
          title="Cast, reviews and where to read more"
          actions={
            <button type="button" className="btn" onClick={() => onSearch()}>
              <SearchIcon /> Search for a movie or show
            </button>
          }
        >
          Open a Netflix title, or search for any movie or show, to see its cast — with their X and Instagram — and links to IMDb, Letterboxd and Rotten Tomatoes.
        </EmptyState>
      </div>
    );
  }

  if (loading) {
    return (
      <div {...panelProps}>
        {heading}
        <p className="status-line" aria-live="polite">
          <span className="spinner" /> Looking up <strong>{subject.title}</strong>…
        </p>
        <ListSkeleton count={3} label="Looking up the cast" />
      </div>
    );
  }

  if (error) {
    return (
      <div {...panelProps}>
        {heading}
        <ErrorState error={error} subject="wikidata" onRetry={onRetry} />
      </div>
    );
  }

  if (!info) {
    return (
      <div {...panelProps}>
        {heading}
        <EmptyState
          icon={<FilmIcon />}
          title={`Couldn’t pin down which “${subject.title}” this is`}
          actions={
            <button type="button" className="btn" onClick={() => onSearch(subject.title)}>
              <SearchIcon /> Pick it from the search
            </button>
          }
        >
          Rather than guess, Rabbit Hole shows nothing here. Search for the title and pick the right one.
        </EmptyState>
      </div>
    );
  }

  const links = reviewLinks(info);
  const cast = allCast ? info.cast : info.cast.slice(0, CAST_PREVIEW);
  const facts = [info.kind === 'movie' ? 'Movie' : 'Series', ...info.genres.slice(0, 3)];

  return (
    <div {...panelProps}>
      {heading}
      <section className="about-head" aria-label="About this title">
        <h2 className="about-title">
          {info.title}
          {info.year && <span className="title-option-year num"> ({info.year})</span>}
        </h2>
        <p className="about-facts">{facts.join(' · ')}</p>
        {insights?.availability && (
          <p className={`availability${insights.availability.onNetflix ? ' yes' : ''}`}>
            {insights.availability.onNetflix ? 'On Netflix India' : 'Not on Netflix India'}
            {!insights.availability.onNetflix && insights.availability.elsewhere.length > 0 && (
              <span className="availability-more"> · streaming on {insights.availability.elsewhere.slice(0, 2).join(', ')}</span>
            )}
          </p>
        )}
        {info.description && <p className="about-desc">{info.description}</p>}
        {info.creators.length > 0 && (
          <p className="about-desc">
            {info.kind === 'movie' ? 'Directed by' : 'Created by'} {info.creators.map((c) => c.name).join(', ')}
          </p>
        )}
      </section>

      {links.length > 0 && (
        <section aria-labelledby={`${idPrefix}-reviews`}>
          <div className="panel-title">
            <h2 id={`${idPrefix}-reviews`}>Reviews &amp; ratings</h2>
            {insightsLoading && <span className="spinner" aria-label="Loading ratings" />}
          </div>
          {ratingChips(insights?.ratings).length > 0 && (
            <ul className="rating-row" aria-label="Ratings">
              {ratingChips(insights?.ratings).map((c) => (
                <li key={c.label} className="rating-chip" title={c.hint}>
                  <span className="rating-label">{c.label}</span>
                  <strong className="num">{c.value}</strong>
                </li>
              ))}
            </ul>
          )}
          <ul className="link-grid">
            {links.map((l) => (
              <li key={l.label}>
                <a className="link-tile" href={l.href} target="_blank" rel="noopener noreferrer">
                  <span className="link-tile-name">
                    {l.label} <ExternalIcon width={12} height={12} />
                  </span>
                  <span className="link-tile-hint">{l.hint}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {insights && insights.reviews.length > 0 && (
        <section aria-labelledby={`${idPrefix}-viewers`}>
          <div className="panel-title" style={{ marginTop: 14 }}>
            <h2 id={`${idPrefix}-viewers`}>What viewers say</h2>
            <span className="meta">TMDB reviews</span>
          </div>
          <ul className="list">
            {insights.reviews.slice(0, 3).map((r) => (
              <li key={r.url} className="card review-card">
                <div className="review-head">
                  <strong>{r.author}</strong>
                  {r.rating !== undefined && <span className="num review-score">★ {r.rating}/10</span>}
                  {r.date && <span className="meta">{formatDate(r.date)}</span>}
                </div>
                <p className="excerpt">{r.excerpt}</p>
                <a className="link" href={r.url} target="_blank" rel="noopener noreferrer">
                  Read the full review <ExternalIcon width={11} height={11} />
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby={`${idPrefix}-cast`}>
        <div className="panel-title" style={{ marginTop: 14 }}>
          <h2 id={`${idPrefix}-cast`}>Cast</h2>
          {info.cast.length > 0 && <span className="meta num">{info.cast.length} listed</span>}
        </div>
        {info.cast.length === 0 ? (
          <p className="meta note">Wikidata doesn’t list the cast for this title yet.</p>
        ) : (
          <ul className="cast-list">
            {cast.map((m) => (
              <CastRow key={m.qid} member={m} />
            ))}
          </ul>
        )}
        {info.cast.length > CAST_PREVIEW && (
          <button type="button" className="btn small ghost" style={{ marginTop: 6 }} onClick={() => setAllCast((v) => !v)} aria-expanded={allCast}>
            {allCast ? 'Show fewer' : `Show all ${info.cast.length}`}
          </button>
        )}
      </section>

      <p className="meta note" style={{ marginTop: 16 }}>
        Facts from{' '}
        <a href={`https://www.wikidata.org/wiki/${info.qid}`} target="_blank" rel="noopener noreferrer">
          Wikidata
        </a>{' '}
        (CC0). Social accounts are the ones listed there.
        {insights?.attribution.includes('OMDb') && ' Ratings via OMDb.'}
        {insights?.attribution.includes('TMDB') && (
          <>
            {' '}
            Reviews and availability from{' '}
            <a href={insights.tmdbUrl ?? 'https://www.themoviedb.org/'} target="_blank" rel="noopener noreferrer">
              TMDB
            </a>{' '}
            (this product uses the TMDB API but is not endorsed or certified by TMDB); where-to-watch data by JustWatch.
          </>
        )}
        {insights === null && ' Ratings, viewer reviews and Netflix India availability appear when a Rabbit Hole backend with TMDB / OMDb keys is connected.'}
      </p>
    </div>
  );
}

function CastRow({ member: m }: { member: CastMember }) {
  return (
    <li className="cast-row">
      <span className="cast-name">
        <strong>{m.name}</strong>
        {m.character && <span className="cast-char"> as {m.character}</span>}
      </span>
      <span className="cast-links">
        {m.x && (
          <a className="social" href={`https://x.com/${m.x}`} target="_blank" rel="noopener noreferrer" aria-label={`${m.name} on X (@${m.x})`} title={`@${m.x} on X`}>
            <XLogoIcon width={13} height={13} />
          </a>
        )}
        {m.instagram && (
          <a
            className="social"
            href={`https://www.instagram.com/${m.instagram}/`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${m.name} on Instagram (@${m.instagram})`}
            title={`@${m.instagram} on Instagram`}
          >
            <InstagramIcon width={14} height={14} />
          </a>
        )}
      </span>
    </li>
  );
}
