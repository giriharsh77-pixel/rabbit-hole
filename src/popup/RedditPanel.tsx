import { useMemo } from 'react';
import { EmptyState, ErrorState } from '../components/States';
import { ArrowRightIcon, CloseIcon, RefreshIcon, SearchIcon } from '../components/icons';
import { ListSkeleton } from '../components/Skeleton';
import { RedditCard } from '../components/RedditCard';
import { generateRedditQueries } from '../services/context/queries';
import type { ContentContext } from '../types/context';
import type { RedditFetchMeta, ScoredRedditPost } from '../types/reddit';
import type { Settings } from '../types/settings';
import { useRedditSearch } from './data';

export interface RedditFocus {
  /** Shown as: Reddit discussions about “label” */
  label: string;
  queries: string[];
  kind: 'search' | 'article';
}

export interface PageBridge {
  title: string;
  onSee: () => void;
}

interface Props {
  idPrefix: string;
  settings: Settings;
  active: boolean;
  now: number;
  focus: RedditFocus | null;
  onClearFocus: () => void;
  /** What the user is watching right now (YouTube / Netflix) — the tab shows threads about it. */
  watching: ContentContext | null;
  pageBridge: PageBridge | null;
  onFindReading: (post: ScoredRedditPost) => void;
  /** Put the cursor in the search box. */
  onSearch: () => void;
}

const providerName = (meta: RedditFetchMeta) =>
  meta.provider === 'oauth' ? 'Reddit API' : meta.provider === 'json' ? 'public Reddit data' : 'public feed';

/**
 * The Reddit tab: discussions about what's playing, search results, or
 * "What Reddit thinks" about an article. There is no general trending feed —
 * everything shown here is about something the user is looking at or asked for.
 */
export function RedditPanel(props: Props) {
  const { settings, active, now, focus, watching } = props;
  const focusResults = useRedditSearch(focus ? focus.queries : null, 12);

  const relatedQueries = useMemo(
    () => (watching && active && !focus ? generateRedditQueries(watching, 3) : null),
    [watching, active, focus],
  );
  // All time: episode and video discussions are often years old — and still the best ones.
  // Strict: only threads that clearly match; never padded with Reddit's loose matches.
  const related = useRedditSearch(relatedQueries, 15, { time: 'all', strict: true });

  const panelProps = {
    className: 'panel',
    role: 'tabpanel',
    id: `${props.idPrefix}-panel-reddit`,
    'aria-labelledby': `${props.idPrefix}-tab-reddit`,
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
          <h2>Reddit</h2>
        </div>
        <div className="panel-title">
          <h2>{focus.kind === 'article' ? 'What Reddit thinks' : 'Reddit results'}</h2>
          <button type="button" className="btn small ghost" onClick={props.onClearFocus}>
            <CloseIcon /> {watching ? 'Back to this video' : 'Clear'}
          </button>
        </div>
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
          <h2>Reddit</h2>
        </div>
        <div className="panel-title">
          <h2>
            <span aria-hidden="true">{watching.platform === 'netflix' ? '🍿' : '🎬'}</span> About {subject}
          </h2>
        </div>
        <p className="status-line" aria-live="polite">
          {related.status === 'success' ? (
            results.length > 0 && (
              <span>
                Found <strong className="num">{results.length}</strong> {results.length === 1 ? 'thread' : 'threads'} about <strong>{watching.title}</strong>
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
        {relatedQueries && relatedQueries.length > 0 && (
          <div className="tag-row" aria-label="Searched Reddit for">
            {relatedQueries.map((q) => (
              <span key={q} className="chip chip-static">
                {q.replace(/["“”]/g, '')}
              </span>
            ))}
          </div>
        )}
        {(related.status === 'loading' || related.status === 'idle') && (
          <ListSkeleton count={3} withAside={settings.reddit.showThumbnails} label="Finding related threads" />
        )}
        {related.status === 'error' && <ErrorState error={related.error} subject="reddit" onRetry={related.reload} />}
        {related.status === 'success' && results.length === 0 && (
          <EmptyState
            title="No Reddit threads about this yet"
            actions={
              <button type="button" className="btn primary" onClick={props.onSearch}>
                <SearchIcon /> Search Reddit
              </button>
            }
          >
            Reddit doesn’t seem to have discussed {subject}. Try a broader topic in the search box.
          </EmptyState>
        )}
        {results.length > 0 && cards(results)}
        {related.status === 'success' && related.data && (
          <div className="panel-title" style={{ marginTop: 14 }}>
            <span className="meta" aria-live="polite">
              Reddit search · all time · {providerName(related.data.meta)}
            </span>
            <button type="button" className="btn small ghost" onClick={related.reload} aria-label="Search Reddit again">
              <RefreshIcon /> Refresh
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── nothing playing: offer the article bridge, or explain the tab ──────────
  return (
    <div {...panelProps}>
      <div className="panel-title split-heading">
        <h2>Reddit</h2>
      </div>
      {props.pageBridge ? (
        <div className="bridge">
          <div className="bridge-text">
            <small>You're reading</small>
            <span title={props.pageBridge.title}>{props.pageBridge.title}</span>
          </div>
          <button type="button" className="btn primary small" onClick={props.pageBridge.onSee}>
            See what Reddit thinks <ArrowRightIcon />
          </button>
        </div>
      ) : (
        <EmptyState
          title="Reddit threads about what you watch"
          actions={
            <button type="button" className="btn" onClick={props.onSearch}>
              <SearchIcon /> Search Reddit
            </button>
          }
        >
          Open a YouTube video or a Netflix title and this tab shows Reddit’s discussions about it — or search any topic.
        </EmptyState>
      )}
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
    case 'short':
      return 'this Short';
    default:
      return 'this video';
  }
}
