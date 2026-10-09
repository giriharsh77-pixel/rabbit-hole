import { useEffect, useMemo, useState } from 'react';
import { Banner, EmptyState, ErrorState } from '../components/States';
import { ArrowRightIcon, CloseIcon, RefreshIcon } from '../components/icons';
import { ListSkeleton } from '../components/Skeleton';
import { RedditCard, type CardBadge } from '../components/RedditCard';
import { generateRedditQueries } from '../services/context/queries';
import { TOPIC_FILTERS } from '../services/reddit/topics';
import type { ContentContext } from '../types/context';
import type { RedditCategoryId, ScoredRedditPost } from '../types/reddit';
import type { Settings } from '../types/settings';
import { timeAgo } from '../utils/format';
import { useRedditSearch, useTrending } from './data';

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

const CATEGORIES: { id: RedditCategoryId; emoji: string; label: string; short: string }[] = [
  { id: 'hot', emoji: '🔥', label: 'Hot Right Now', short: 'Hot' },
  { id: 'rising', emoji: '📈', label: 'Rising Fast', short: 'Rising' },
  { id: 'discussed', emoji: '💬', label: 'Most Discussed', short: 'Discussed' },
  { id: 'across', emoji: '🌎', label: 'Across Reddit', short: 'Across' },
];

interface Props {
  idPrefix: string;
  settings: Settings;
  active: boolean;
  now: number;
  topicId: string;
  onTopic: (id: string) => void;
  category: RedditCategoryId;
  onCategory: (c: RedditCategoryId) => void;
  focus: RedditFocus | null;
  onClearFocus: () => void;
  /** What the user is watching right now (YouTube / Netflix) — drives the "About this video" view. */
  watching: ContentContext | null;
  pageBridge: PageBridge | null;
  onFindReading: (post: ScoredRedditPost) => void;
  onOpenSettings: () => void;
}

export function TrendingPanel(props: Props) {
  const { settings, active, now, topicId, category, focus, watching } = props;

  // While something is playing the tab leads with threads about it; "Trending" is one click away.
  const [view, setView] = useState<'related' | 'trending'>('related');
  const watchKey = watching ? `${watching.platform}:${watching.title}:${watching.episode ?? ''}` : '';
  useEffect(() => setView('related'), [watchKey]);
  const showRelated = !!watching && view === 'related' && !focus;

  const trending = useTrending(topicId, active && focus === null && !showRelated);
  const focusResults = useRedditSearch(focus ? focus.queries : null, 12);

  const relatedQueries = useMemo(
    () => (watching && active && !focus ? generateRedditQueries(watching, 3) : null),
    [watching, active, focus],
  );
  // The past year: discussion threads for a show or a video often predate this week's trending page.
  const related = useRedditSearch(showRelated ? relatedQueries : null, 15, { time: 'year', strict: true });

  const posts = trending.data?.categories[category] ?? [];
  const meta = trending.data?.meta;
  const topic = TOPIC_FILTERS.find((t) => t.id === topicId);
  const customEmpty = topicId === 'custom' && settings.reddit.preferredSubreddits.length === 0;

  const cards = (list: ScoredRedditPost[], badge: CardBadge) => (
    <ul className="list">
      {list.map((p) => (
        <RedditCard
          key={`${badge}-${p.id}`}
          post={p}
          badge={badge}
          showThumbnail={settings.reddit.showThumbnails}
          onFindReading={props.onFindReading}
          now={now}
        />
      ))}
    </ul>
  );

  // ── focused view: search results / "what Reddit thinks" ────────────────────
  if (focus) {
    const results = focusResults.data?.posts ?? [];
    return (
      <div className="panel" role="tabpanel" id={`${props.idPrefix}-panel-reddit`} aria-labelledby={`${props.idPrefix}-tab-reddit`} hidden={!active}>
        <div className="panel-title split-heading">
          <h2>{watching ? 'Reddit' : 'Trending Reddit'}</h2>
        </div>
        <div className="panel-title">
          <h2>{focus.kind === 'article' ? 'What Reddit thinks' : 'Reddit results'}</h2>
          <button type="button" className="btn small ghost" onClick={props.onClearFocus}>
            <CloseIcon /> Back to trending
          </button>
        </div>
        <p className="status-line" aria-live="polite">
          {focusResults.status === 'loading' ? (
            <>
              <span className="spinner" /> Searching Reddit for <strong>{focus.label}</strong>…
            </>
          ) : (
            <>
              Discussions about <strong>{focus.label}</strong>
            </>
          )}
        </p>
        {focusResults.status === 'loading' && <ListSkeleton count={3} label="Searching Reddit" />}
        {focusResults.status === 'error' && <ErrorState error={focusResults.error} subject="reddit" onRetry={focusResults.reload} />}
        {focusResults.status === 'success' && results.length === 0 && (
          <EmptyState title="No recent threads found">Reddit has little on this right now. Try a broader search.</EmptyState>
        )}
        {results.length > 0 && cards(results, 'search')}
      </div>
    );
  }

  // ── "About this video": threads discussing what's playing ──────────────────
  const subject = watching ? subjectLabel(watching) : '';
  const viewSwitch = (
    <div className="segmented" role="tablist" aria-label="What to show">
      <button type="button" role="tab" className="seg" aria-selected={view === 'related'} onClick={() => setView('related')}>
        <span aria-hidden="true">{watching?.platform === 'netflix' ? '🍿' : '🎬'}</span>
        <span className="seg-label">About {subject}</span>
      </button>
      <button type="button" role="tab" className="seg" aria-selected={view === 'trending'} onClick={() => setView('trending')}>
        <span aria-hidden="true">🔥</span>
        <span className="seg-label">Trending now</span>
      </button>
    </div>
  );

  if (showRelated && watching) {
    const results = related.data?.posts ?? [];
    return (
      <div className="panel" role="tabpanel" id={`${props.idPrefix}-panel-reddit`} aria-labelledby={`${props.idPrefix}-tab-reddit`} hidden={!active}>
        <div className="panel-title split-heading">
          <h2>Reddit</h2>
        </div>
        {viewSwitch}
        <p className="status-line" aria-live="polite">
          {related.status === 'success' ? (
            results.length === 0 ? null : (
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
        {related.status === 'error' && (
          <ErrorState error={related.error} subject="reddit" onRetry={related.reload}>
            <div className="actions">
              <button type="button" className="btn" onClick={() => setView('trending')}>
                See what’s trending <ArrowRightIcon />
              </button>
            </div>
          </ErrorState>
        )}
        {related.status === 'success' && results.length === 0 && (
          <EmptyState
            title="No Reddit threads about this yet"
            actions={
              <button type="button" className="btn primary" onClick={() => setView('trending')}>
                See what’s trending
              </button>
            }
          >
            Reddit hasn’t discussed {subject} much in the past year. Try the search box with a broader topic.
          </EmptyState>
        )}
        {results.length > 0 && cards(results, 'search')}
        {related.status === 'success' && related.data && (
          <div className="panel-title" style={{ marginTop: 14 }}>
            <span className="meta" aria-live="polite">
              Reddit search · past year ·{' '}
              {related.data.meta.provider === 'oauth' ? 'Reddit API' : related.data.meta.provider === 'json' ? 'public Reddit data' : 'public feed'}
            </span>
            <button type="button" className="btn small ghost" onClick={related.reload} aria-label="Search Reddit again">
              <RefreshIcon /> Refresh
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── default view: trending ─────────────────────────────────────────────────
  const limited = meta?.provider === 'rss';
  const blocked = meta?.degradedFrom?.some((d) => d.code === 'BLOCKED' || d.code === 'UNAUTHORIZED');
  const rateLimited = meta?.degradedFrom?.some((d) => d.code === 'RATE_LIMITED');

  return (
    <div className="panel" role="tabpanel" id={`${props.idPrefix}-panel-reddit`} aria-labelledby={`${props.idPrefix}-tab-reddit`} hidden={!active}>
      <div className="panel-title split-heading">
        <h2>{watching ? 'Reddit' : 'Trending Reddit'}</h2>
      </div>
      {props.pageBridge && (
        <div className="bridge">
          <div className="bridge-text">
            <small>You're reading</small>
            <span title={props.pageBridge.title}>{props.pageBridge.title}</span>
          </div>
          <button type="button" className="btn primary small" onClick={props.pageBridge.onSee}>
            See what Reddit thinks <ArrowRightIcon />
          </button>
        </div>
      )}

      {watching && viewSwitch}

      <div className="chip-row" role="group" aria-label="Topic filter">
        {TOPIC_FILTERS.map((t) => (
          <button key={t.id} type="button" className="chip" aria-pressed={t.id === topicId} onClick={() => props.onTopic(t.id)}>
            <span aria-hidden="true">{t.emoji}</span> {t.label}
          </button>
        ))}
      </div>

      <div className="segmented" role="tablist" aria-label="Trending category">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            className="seg"
            aria-selected={c.id === category}
            onClick={() => props.onCategory(c.id)}
            title={c.label}
          >
            <span aria-hidden="true">{c.emoji}</span>
            <span className="seg-label">{c.id === category ? c.label : c.short}</span>
          </button>
        ))}
      </div>

      {limited && (
        <Banner tone="info">
          <b>Feed mode.</b> Reddit blocked its JSON endpoints, so ranking uses Reddit’s own order — upvote and comment counts aren’t available. Add a Reddit client ID in{' '}
          <button type="button" className="link" onClick={props.onOpenSettings}>
            Settings
          </button>{' '}
          for the full experience.
        </Banner>
      )}
      {!limited && blocked && (
        <Banner tone="info">
          Reddit’s official API couldn’t be used, so public data is being shown. Check your client ID in{' '}
          <button type="button" className="link" onClick={props.onOpenSettings}>
            Settings
          </button>
          .
        </Banner>
      )}
      {rateLimited && !limited && <Banner tone="info">Reddit is rate-limiting requests; showing the freshest data we could get.</Banner>}
      {trending.error && trending.data && (
        <Banner>
          <b>Couldn’t refresh.</b> Showing saved results from {meta ? timeAgo(meta.fetchedAt, now) : 'earlier'}.
        </Banner>
      )}

      {customEmpty ? (
        <EmptyState
          title="Add your subreddits"
          actions={
            <button type="button" className="btn primary" onClick={props.onOpenSettings}>
              Open Settings
            </button>
          }
        >
          The Custom filter shows threads from subreddits you choose. Add some in Settings → Reddit.
        </EmptyState>
      ) : trending.loading && !trending.data ? (
        <ListSkeleton count={3} withAside={settings.reddit.showThumbnails} label="Loading trending threads" />
      ) : trending.error && !trending.data ? (
        <ErrorState error={trending.error} subject="reddit" onRetry={trending.refresh}>
          <div className="actions">
            <a className="btn" href="https://www.reddit.com/r/all/" target="_blank" rel="noopener noreferrer">
              Open Reddit <ArrowRightIcon />
            </a>
          </div>
        </ErrorState>
      ) : posts.length === 0 ? (
        <EmptyState title={category === 'discussed' && limited ? 'Comment counts unavailable' : 'Nothing here yet'}>
          {category === 'discussed' && limited
            ? 'Reddit’s public feed doesn’t include comment counts. Try Hot or Rising, or add a Reddit client ID in Settings.'
            : `No ${CATEGORIES.find((c) => c.id === category)?.label.toLowerCase()} threads found for ${topic?.label ?? 'this topic'} right now.`}
        </EmptyState>
      ) : (
        cards(posts, category)
      )}

      {meta && trending.data && (
        <div className="panel-title" style={{ marginTop: 14 }}>
          <span className="meta" aria-live="polite">
            Updated {timeAgo(meta.fetchedAt, now)} ·{' '}
            {meta.provider === 'oauth' ? 'Reddit API' : meta.provider === 'json' ? 'public Reddit data' : 'public feed'}
          </span>
          <button type="button" className="btn small ghost" onClick={trending.refresh} disabled={trending.refreshing} aria-label="Refresh trending threads">
            <RefreshIcon className={trending.refreshing ? 'spinner-icon' : undefined} /> {trending.refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
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
