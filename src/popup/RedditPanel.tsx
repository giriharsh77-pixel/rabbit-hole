import { useMemo } from 'react';
import { EmptyState, ErrorState } from '../components/States';
import { CloseIcon, RefreshIcon, SearchIcon } from '../components/icons';
import { ListSkeleton } from '../components/Skeleton';
import { RedditCard } from '../components/RedditCard';
import { generateRedditQueries, parseEpisode } from '../services/context/queries';
import type { ContentContext } from '../types/context';
import type { RpcParams } from '../types/messages';
import type { RedditFetchMeta, ScoredRedditPost } from '../types/reddit';
import type { RedditSort, Settings } from '../types/settings';
import type { TitleInfo } from '../types/title';
import { useRedditDiscuss, useRedditSearch } from './data';

export interface RedditFocus {
  /** Shown as: Reddit discussions about “label” */
  label: string;
  queries: string[];
  kind: 'search' | 'article';
}

interface Props {
  idPrefix: string;
  settings: Settings;
  active: boolean;
  now: number;
  focus: RedditFocus | null;
  onClearFocus: () => void;
  /** What the user is watching on Netflix (or picked in the title search) — the tab shows threads about it. */
  watching: ContentContext | null;
  /** The exact title (Wikidata): its subreddit, cast and characters sharpen the search. */
  title: TitleInfo | null;
  titleLoading: boolean;
  onFindReading: (post: ScoredRedditPost) => void;
  /** Put the cursor in the search box. */
  onSearch: (prefill?: string) => void;
  /** Most relevant / newest first (remembered in Settings). */
  onSortChange: (sort: RedditSort) => void;
}

/** `Most relevant | Newest` */
function SortControl({ value, onChange }: { value: RedditSort; onChange: (v: RedditSort) => void }) {
  return (
    <div className="segmented sort-control" role="radiogroup" aria-label="Sort threads">
      {(
        [
          ['relevance', 'Most relevant'],
          ['new', 'Newest'],
        ] as const
      ).map(([id, label]) => (
        <button key={id} type="button" role="radio" aria-checked={value === id} className="seg" onClick={() => onChange(id)}>
          {label}
        </button>
      ))}
    </div>
  );
}

const providerName = (meta: RedditFetchMeta) =>
  meta.provider === 'oauth' ? 'Reddit API' : meta.provider === 'json' ? 'public Reddit data' : 'public feed';

/** What to ask Reddit about a known title: its subreddit, the episode, cast and character names. */
export function discussParams(watching: ContentContext, title: TitleInfo): RpcParams<'reddit/discuss'> {
  const ep = parseEpisode(watching.episode);
  const names = [...title.cast.slice(0, 12).map((m) => m.name), ...title.cast.slice(0, 12).flatMap((m) => (m.character ? [m.character] : []))];
  return {
    // Netflix's name is the one viewers use ("Delhi Crime", not "Delhi Crime Story")
    title: watching.platform === 'netflix' ? watching.title : title.title,
    kind: title.kind,
    names,
    ...(title.subreddit ? { ownSubreddit: title.subreddit } : {}),
    ...(ep.name ? { episodeName: ep.name } : {}),
    ...(ep.season !== undefined ? { season: ep.season } : {}),
  };
}

/**
 * The Discuss tab: Reddit discussions about what's playing, search results, or
 * "What Reddit thinks" about an article. There is no general trending feed —
 * everything shown here is about something the user is looking at or asked for.
 */
export function RedditPanel(props: Props) {
  const { settings, active, now, focus, watching, title, titleLoading } = props;
  const order = settings.reddit.sort;
  const focusResults = useRedditSearch(focus ? focus.queries : null, 12, order === 'new' ? { order } : {});

  const wanted = !!watching && active && !focus;
  // A known title gets the precise search (its subreddit, cast, characters)…
  const discussQuery = useMemo(
    () => (wanted && watching && title ? { ...discussParams(watching, title), ...(order === 'new' ? { order } : {}) } : null),
    [wanted, watching, title, order],
  );
  const discuss = useRedditDiscuss(discussQuery);
  // …otherwise strict phrase search, all time (once we know Wikidata has no match).
  const relatedQueries = useMemo(
    () => (wanted && watching && !title && !titleLoading ? generateRedditQueries(watching, 3) : null),
    [wanted, watching, title, titleLoading],
  );
  const fallback = useRedditSearch(relatedQueries, 15, { time: 'all', strict: true, order });
  const related = discussQuery ? discuss : fallback;
  const chips = discussQuery ? (discuss.data?.searched ?? []) : (relatedQueries ?? []).map((q) => q.replace(/["“”]/g, ''));
  const scopes = discussQuery ? (discuss.data?.scopes ?? []) : ['all of Reddit'];

  const panelProps = {
    className: 'panel',
    role: 'tabpanel',
    id: `${props.idPrefix}-panel-discuss`,
    'aria-labelledby': `${props.idPrefix}-tab-discuss`,
    hidden: !active,
  } as const;

  const cards = (list: ScoredRedditPost[]) => (
    <ul className="list">
      {list.map((p) => (
        <RedditCard key={p.id} post={p} showThumbnail={settings.reddit.showThumbnails} onFindReading={props.onFindReading} now={now} />
      ))}
    </ul>
  );

  // ── search results / "what Reddit thinks" ──────────────────────────────────
  if (focus) {
    const results = focusResults.data?.posts ?? [];
    return (
      <div {...panelProps}>
        <div className="panel-title split-heading">
          <h2>Discuss</h2>
        </div>
        <div className="panel-title">
          <h2>{focus.kind === 'article' ? 'What Reddit thinks' : 'Reddit results'}</h2>
          <button type="button" className="btn small ghost" onClick={props.onClearFocus}>
            <CloseIcon /> {watching ? `Back to ${watching.title}` : 'Clear'}
          </button>
        </div>
        <SortControl value={order} onChange={props.onSortChange} />
        <p className="status-line" aria-live="polite">
          {focusResults.status === 'loading' ? (
            <>
              <span className="spinner" />
              <span>
                Searching Reddit for <strong>{focus.label}</strong>…
              </span>
            </>
          ) : (
            <span>
              Discussions about <strong>{focus.label}</strong>
            </span>
          )}
        </p>
        {focusResults.status === 'loading' && <ListSkeleton count={3} label="Searching Reddit" />}
        {focusResults.status === 'error' && <ErrorState error={focusResults.error} subject="reddit" onRetry={focusResults.reload} />}
        {focusResults.status === 'success' && results.length === 0 && (
          <EmptyState title="No threads found">Reddit has little on this. Try a broader search.</EmptyState>
        )}
        {results.length > 0 && cards(results)}
      </div>
    );
  }

  // ── threads about what's playing ───────────────────────────────────────────
  if (watching) {
    const results = related.data?.posts ?? [];
    const subject = subjectLabel(watching);
    return (
      <div {...panelProps}>
        <div className="panel-title split-heading">
          <h2>Discuss</h2>
        </div>
        <div className="panel-title">
          <h2>Reddit on {subject}</h2>
        </div>
        <SortControl value={order} onChange={props.onSortChange} />
        <p className="status-line" aria-live="polite">
          {related.status === 'success' ? (
            results.length > 0 && (
              <span>
                Found <strong className="num">{results.length}</strong> {results.length === 1 ? 'thread' : 'threads'} about <strong>{watching.title}</strong>
                {order === 'new' ? ' · newest first' : ''}
              </span>
            )
          ) : related.status === 'error' ? null : (
            <>
              <span className="spinner" />
              <span>
                Finding Reddit threads about <strong>{watching.title}</strong>…
              </span>
            </>
          )}
        </p>
        {chips.length > 0 && (
          <div className="tag-row" aria-label="Searched Reddit for">
            {scopes.includes(`r/${title?.subreddit ?? ''}`) && title?.subreddit && (
              <a className="chip chip-static chip-sub" href={`https://www.reddit.com/r/${title.subreddit}/`} target="_blank" rel="noopener noreferrer">
                r/{title.subreddit}
              </a>
            )}
            {chips.map((q) => (
              <span key={q} className="chip chip-static">
                {q}
              </span>
            ))}
          </div>
        )}
        {(related.status === 'loading' || related.status === 'idle' || titleLoading) && (
          <ListSkeleton count={3} withAside={settings.reddit.showThumbnails} label="Finding related threads" />
        )}
        {related.status === 'error' && <ErrorState error={related.error} subject="reddit" onRetry={related.reload} />}
        {related.status === 'success' && results.length === 0 && (
          <EmptyState
            title="No Reddit threads about this yet"
            actions={
              <button type="button" className="btn primary" onClick={() => props.onSearch()}>
                <SearchIcon /> Search Reddit
              </button>
            }
          >
            Reddit doesn’t seem to have discussed {subject} — or not in a way we could tell apart from other uses of the name. Try searching for something broader.
          </EmptyState>
        )}
        {results.length > 0 && cards(results)}
        {related.status === 'success' && related.data && (
          <div className="panel-title" style={{ marginTop: 14 }}>
            <span className="meta note" aria-live="polite">
              Searched {scopes.join(', ')} · all time · {order === 'new' ? 'newest first' : 'most relevant first'} · {providerName(related.data.meta)}
            </span>
            <button type="button" className="btn small ghost" onClick={related.reload} aria-label="Search Reddit again">
              <RefreshIcon /> Refresh
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── nothing playing: explain the tab ───────────────────────────────────────
  return (
    <div {...panelProps}>
      <div className="panel-title split-heading">
        <h2>Discuss</h2>
      </div>
      <EmptyState
        title="Reddit threads about what you watch"
        actions={
          <button type="button" className="btn" onClick={() => props.onSearch()}>
            <SearchIcon /> Search for a movie or show
          </button>
        }
      >
        Open a Netflix title and this tab shows Reddit’s discussions about it — or search for any movie or show.
      </EmptyState>
    </div>
  );
}

/** "this video" / "this episode" / "this movie" / "this show" */
function subjectLabel(ctx: ContentContext): string {
  switch (ctx.kind) {
    case 'episode':
      return 'this episode';
    case 'movie':
      return 'this movie';
    case 'show':
      return 'this show';
    default:
      return 'this title';
  }
}
