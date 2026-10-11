import { useMemo, useState } from 'react';
import { EmptyState, ErrorState } from '../components/States';
import { ListSkeleton } from '../components/Skeleton';
import { ArrowRightIcon, ExternalIcon, PlayIcon, SearchIcon } from '../components/icons';
import type { ContentContext } from '../types/context';
import type { RelatedTitle, SimilarTitle, TitleCandidate, TitleInfo, TitleInsights, TitleKind } from '../types/title';
import { listToSentence } from '../utils/text';
import { useRelatedTitles } from './data';

interface Props {
  idPrefix: string;
  active: boolean;
  subject: ContentContext | null;
  info: TitleInfo | null | undefined;
  infoLoading: boolean;
  /** TMDB's similar titles + Netflix India, when a backend provides them (null otherwise). */
  insights: TitleInsights | null | undefined;
  insightsLoading: boolean;
  /** The tab hasn't been read yet. */
  pageLoading?: boolean;
  onPick: (title: TitleCandidate) => void;
  onSearch: (prefill?: string) => void;
}

type Kind = 'all' | 'movie' | 'series';
type Era = 'any' | '2020' | '2010' | '2000' | 'older';
type Sort = 'connected' | 'newest' | 'known';

const ERAS: { id: Era; label: string }[] = [
  { id: 'any', label: 'Any year' },
  { id: '2020', label: '2020s' },
  { id: '2010', label: '2010s' },
  { id: '2000', label: '2000s' },
  { id: 'older', label: 'Earlier' },
];

function inEra(year: number | undefined, era: Era): boolean {
  if (era === 'any') return true;
  if (!year) return false;
  if (era === 'older') return year < 2000;
  const start = Number(era);
  return year >= start && year < start + 10;
}

/** Netflix's own search for a title, on the user's account — Rabbit Hole reads nothing back. */
const netflixSearch = (title: string) => `https://www.netflix.com/search?q=${encodeURIComponent(title)}`;

/** One card for either kind of suggestion. */
interface Pick {
  key: string;
  title: string;
  kind: TitleKind;
  year?: number | undefined;
  why: string;
  blurb?: string | undefined;
  onNetflixIndia?: boolean | undefined;
  /** Wikidata item, when known — Explore opens it; otherwise Explore searches for it. */
  qid?: string | undefined;
  popularity: number;
  strength: number;
}

const fromSimilar = (s: SimilarTitle, i: number): Pick => ({
  key: `tmdb:${s.tmdb.type}:${s.tmdb.id}`,
  title: s.title,
  kind: s.tmdb.type === 'tv' ? 'series' : 'movie',
  year: s.year,
  why: 'Similar — viewers of this also watch it (TMDB)',
  blurb: s.overview,
  onNetflixIndia: s.onNetflixIndia,
  qid: s.qid,
  popularity: 100 - i, // TMDB's own order
  strength: 3 - i * 0.05,
});

const fromRelated = (t: RelatedTitle): Pick => ({
  key: `wd:${t.qid}`,
  title: t.title,
  kind: t.kind,
  year: t.year,
  why: [t.sharedCreator ? `From ${t.sharedCreator}` : '', t.sharedCast.length ? `With ${listToSentence(t.sharedCast.slice(0, 3))}` : ''].filter(Boolean).join(' · '),
  blurb: t.description,
  qid: t.qid,
  popularity: t.popularity,
  strength: t.sharedCast.length + (t.sharedCreator ? 1.5 : 0),
});

/** Watch next: similar titles (TMDB, with a backend), same leading cast or creator (Wikidata) — filterable. */
export function WatchNextPanel({ idPrefix, active, subject, info, infoLoading, insights, insightsLoading, pageLoading, onPick, onSearch }: Props) {
  const related = useRelatedTitles(active && info ? info.qid : null);
  const [kind, setKind] = useState<Kind>('all');
  const [era, setEra] = useState<Era>('any');
  const [sort, setSort] = useState<Sort>('connected');
  const [netflixOnly, setNetflixOnly] = useState(false);
  const hasAvailability = !!insights?.similar.some((s) => s.onNetflixIndia !== undefined);

  const panelProps = {
    className: 'panel',
    role: 'tabpanel',
    id: `${idPrefix}-panel-next`,
    'aria-labelledby': `${idPrefix}-tab-next`,
    hidden: !active,
  } as const;
  const heading = (
    <div className="panel-title split-heading">
      <h2>Watch next</h2>
    </div>
  );

  const shape = useMemo(() => {
    const keep = (p: Pick) => (kind === 'all' || p.kind === kind) && inEra(p.year, era) && (!netflixOnly || p.onNetflixIndia === true);
    const order = (a: Pick, b: Pick) =>
      sort === 'newest' ? (b.year ?? 0) - (a.year ?? 0) : sort === 'known' ? b.popularity - a.popularity : b.strength - a.strength || b.popularity - a.popularity;
    const similar = (insights?.similar ?? []).map(fromSimilar);
    const seen = new Set(similar.flatMap((p) => (p.qid ? [p.qid] : [])));
    // creators first when both apply: "From Rian Johnson" is the stronger link
    const wd: Pick[] = [];
    for (const t of [...(related.data?.byCreators ?? []), ...(related.data?.withCast ?? [])]) {
      const prev = wd.find((m) => m.qid === t.qid);
      if (prev || seen.has(t.qid)) continue;
      const merged = { ...t, sharedCast: [...new Set([...t.sharedCast, ...(related.data?.withCast.find((w) => w.qid === t.qid)?.sharedCast ?? [])])] };
      wd.push(fromRelated(merged));
    }
    return {
      similar: similar.filter(keep).sort(order),
      linked: wd.filter(keep).sort(order),
      totals: similar.length + wd.length,
    };
  }, [insights, related.data, kind, era, sort, netflixOnly]);

  if (!subject && pageLoading) {
    return (
      <div {...panelProps}>
        {heading}
        <ListSkeleton count={3} label="Reading the current tab" />
      </div>
    );
  }

  if (!subject) {
    return (
      <div {...panelProps}>
        {heading}
        <EmptyState
          icon={<PlayIcon />}
          title="What to watch next"
          actions={
            <button type="button" className="btn" onClick={() => onSearch()}>
              <SearchIcon /> Search for a movie or show
            </button>
          }
        >
          Similar titles, and movies and shows with the same cast or from the same director or creator, as what you’re watching.
        </EmptyState>
      </div>
    );
  }

  if (!info) {
    return (
      <div {...panelProps}>
        {heading}
        {infoLoading ? (
          <ListSkeleton count={3} label="Finding what to watch next" />
        ) : (
          <EmptyState
            icon={<PlayIcon />}
            title={`Couldn’t pin down which “${subject.title}” this is`}
            actions={
              <button type="button" className="btn" onClick={() => onSearch(subject.title)}>
                <SearchIcon /> Pick it from the search
              </button>
            }
          >
            Pick the exact title in the search and Watch next will follow it.
          </EmptyState>
        )}
      </div>
    );
  }

  const explore = (p: Pick) =>
    p.qid ? onPick({ qid: p.qid, title: p.title, kind: p.kind, ...(p.year ? { year: p.year } : {}) }) : onSearch(p.title);
  const card = (p: Pick) => (
    <li key={p.key} className="card next-card">
      <div className="next-head">
        <h3 className="card-title">
          {p.title}
          {p.year && <span className="title-option-year num"> ({p.year})</span>}
        </h3>
        <span className={`kind-pill ${p.kind}`}>{p.kind === 'movie' ? 'Movie' : 'Series'}</span>
      </div>
      <p className="next-why">
        {p.why}
        {p.onNetflixIndia && <span className="on-netflix"> · On Netflix India</span>}
      </p>
      {p.blurb && <p className="next-desc">{p.blurb}</p>}
      <div className="actions">
        <button type="button" className="btn small primary" onClick={() => explore(p)}>
          Explore <ArrowRightIcon />
        </button>
        <a className="btn small" href={netflixSearch(p.title)} target="_blank" rel="noopener noreferrer">
          Find on Netflix <ExternalIcon width={12} height={12} />
        </a>
      </div>
    </li>
  );
  const loadingAny = related.status === 'loading' || related.status === 'idle' || insightsLoading;
  const shown = shape.similar.length + shape.linked.length;

  return (
    <div {...panelProps}>
      {heading}
      <div className="filter-bar" role="group" aria-label="Filter suggestions">
        <div className="segmented" role="radiogroup" aria-label="Type">
          {(['all', 'movie', 'series'] as const).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} className="seg" onClick={() => setKind(k)}>
              {k === 'all' ? 'All' : k === 'movie' ? 'Movies' : 'Series'}
            </button>
          ))}
        </div>
        <label className="select-wrap">
          <span className="sr-only">Release years</span>
          <select value={era} onChange={(e) => setEra(e.target.value as Era)}>
            {ERAS.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
        </label>
        <label className="select-wrap">
          <span className="sr-only">Sort by</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="connected">Closest link</option>
            <option value="known">Best known</option>
            <option value="newest">Newest</option>
          </select>
        </label>
        {hasAvailability && (
          <button type="button" className="chip" aria-pressed={netflixOnly} onClick={() => setNetflixOnly((v) => !v)}>
            On Netflix India
          </button>
        )}
      </div>

      <p className="status-line" aria-live="polite">
        {!loadingAny ? (
          <span>
            <strong className="num">{shown}</strong> {shown === 1 ? 'pick' : 'picks'} for <strong>{info.title}</strong>
          </span>
        ) : (
          <>
            <span className="spinner" /> Finding similar titles, and titles with the same cast and creators…
          </>
        )}
      </p>

      {shape.similar.length > 0 && (
        <section aria-label="Similar titles">
          <div className="panel-title">
            <h2>Similar titles</h2>
          </div>
          <ul className="list">{shape.similar.slice(0, 12).map(card)}</ul>
        </section>
      )}

      {shape.linked.length > 0 && (
        <section aria-label="Same cast and creators">
          <div className="panel-title" style={shape.similar.length ? { marginTop: 14 } : undefined}>
            <h2>Same cast &amp; creators</h2>
          </div>
          <ul className="list">{shape.linked.slice(0, 30).map(card)}</ul>
        </section>
      )}

      {loadingAny && shown === 0 && <ListSkeleton count={3} label="Finding what to watch next" />}
      {related.status === 'error' && shown === 0 && <ErrorState error={related.error} subject="wikidata" onRetry={related.reload} />}
      {!loadingAny && shown === 0 && related.status !== 'error' && (
        <EmptyState title={shape.totals ? 'Nothing matches these filters' : 'No linked titles yet'}>
          {shape.totals
            ? netflixOnly
              ? 'None of the suggestions is on Netflix India right now. Availability is checked for the similar titles only.'
              : 'Try another type or decade.'
            : 'Wikidata doesn’t link this title’s cast or creators to other titles yet.'}
        </EmptyState>
      )}

      <p className="meta note" style={{ marginTop: 14 }}>
        {insights?.attribution.includes('TMDB')
          ? 'Similar titles and Netflix India availability from TMDB (not endorsed or certified by TMDB; where-to-watch data by JustWatch). '
          : 'Similar titles and Netflix India availability need a Rabbit Hole backend with a TMDB key. '}
        “Same cast & creators” links come from Wikidata — real connections, not an algorithm’s guess.
      </p>
    </div>
  );
}
