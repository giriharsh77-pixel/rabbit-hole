import { ArticleCard } from '../components/ArticleCard';
import { ContextBar } from '../components/ContextBar';
import { BookIcon, SearchIcon } from '../components/icons';
import { ContextSkeleton, ListSkeleton } from '../components/Skeleton';
import { Banner, EmptyState, ErrorState } from '../components/States';
import type { ContentContext, UsedInfoField } from '../types/context';
import type { SerializedError } from '../types/errors';
import type { DiscoveryResponse, RankedArticle } from '../types/substack';
import { plural } from '../utils/format';
import { newsOutletSummary } from './permissions';
import type { AsyncState } from './hooks';

export interface ReadingSource {
  /** `current`: the movie / show every tab is about.  `query` / `bridge`: a search or a Reddit thread, for this tab only. */
  kind: 'query' | 'bridge' | 'current' | 'none';
  verb: 'Watching' | 'Reading' | 'Exploring';
  used: UsedInfoField[];
}

interface Props {
  idPrefix: string;
  active: boolean;
  source: ReadingSource;
  context: ContentContext | null;
  contextLoading: boolean;
  contextError: SerializedError | undefined;
  /** A picked title is still loading its facts. */
  subjectLoading: boolean;
  discovery: AsyncState<DiscoveryResponse> & { reload: () => void };
  onSearch: (prefill?: string) => void;
  onSeeReddit: (article: RankedArticle) => void;
  onDismissSource: () => void;
  onOpenSettings: () => void;
  /** News sites are off: offer to add them (asks Chrome for those sites). */
  newsOn: boolean;
  onEnableNews: () => void;
}

export function ReadingPanel(p: Props) {
  const { source, context, discovery } = p;
  const articles = discovery.data?.articles ?? [];

  const panelProps = {
    className: 'panel',
    role: 'tabpanel',
    id: `${p.idPrefix}-panel-read`,
    'aria-labelledby': `${p.idPrefix}-tab-read`,
    hidden: !p.active,
  } as const;
  const heading = (
    <div className="panel-title split-heading">
      <h2>Read</h2>
    </div>
  );

  // ── nothing to search from yet ─────────────────────────────────────────────
  if (source.kind === 'none') {
    return (
      <div {...panelProps}>
        {heading}
        {p.subjectLoading ? (
          <ListSkeleton count={3} label="Finding related writing" />
        ) : (
          <EmptyState
            icon={<BookIcon />}
            title="Writing about what you watch"
            actions={
              <button type="button" className="btn" onClick={() => p.onSearch()}>
                <SearchIcon /> Search for a movie or show
              </button>
            }
          >
            Essays, reviews and analysis from Substack and Medium about the movie or show you’re on.
          </EmptyState>
        )}
      </div>
    );
  }

  // ── we have something to search from ───────────────────────────────────────
  const searching = p.contextLoading || discovery.status === 'loading';
  const found = discovery.status === 'success' ? articles.length : 0;
  const limited = discovery.data?.limitedCoverage;
  const withMedium = discovery.data?.providers.some((r) => r.id === 'medium' && r.ok) ?? false;
  const withNews = discovery.data?.providers.some((r) => r.id === 'news' && r.ok) ?? false;
  const places = ['Substack', withMedium ? 'Medium' : '', withNews ? 'news sites' : ''].filter(Boolean);
  const where = places.join(places.length > 2 ? ', ' : ' or ').replace(/, ([^,]*)$/, ' or $1');
  const foundOn = places.join(places.length > 2 ? ', ' : ' and ').replace(/, ([^,]*)$/, ' and $1');
  const searched = (context?.concepts ?? []).filter((c) => c.origin !== 'ontology').slice(0, 5);

  return (
    <div {...panelProps}>
      {heading}
      {source.kind !== 'current' &&
        (context ? <ContextBar context={context} used={source.used} verb={source.verb} onDismiss={p.onDismissSource} /> : <ContextSkeleton />)}

      <p className="status-line" aria-live="polite">
        {searching ? (
          <>
            <span className="spinner" /> Finding related writing…
          </>
        ) : discovery.status === 'success' ? (
          articles.length > 0 ? (
            <span>
              Found <strong className="num">{found}</strong> related {plural(found, 'article')} on {foundOn}
              {discovery.data?.aiUsed ? ' · refined with AI' : ''}
            </span>
          ) : (
            <span>No strong matches found</span>
          )
        ) : null}
      </p>

      {searched.length > 0 && !searching && (
        <div className="tag-row" aria-label="Topics searched">
          {searched.map((c) => (
            <span key={c.text} className="chip chip-static">
              {c.text}
            </span>
          ))}
        </div>
      )}

      {!p.newsOn && discovery.status === 'success' && source.kind !== 'bridge' && (
        <Banner tone="info">
          <b>Add news coverage?</b> {newsOutletSummary()} — from their public feeds.{' '}
          <button type="button" className="link" onClick={p.onEnableNews}>
            Add news sites
          </button>
        </Banner>
      )}

      {/* one banner at a time: the news offer first, then the coverage note */}
      {limited && discovery.status === 'success' && (p.newsOn || source.kind === 'bridge') && (
        <Banner tone="info">
          <b>Searching curated Substack publications{withMedium ? ' and Medium' : ''}.</b> For all of Substack, connect a search provider in{' '}
          <button type="button" className="link" onClick={p.onOpenSettings}>
            Settings
          </button>
          .
        </Banner>
      )}

      {(p.contextError || discovery.status === 'error') && (
        <ErrorState error={p.contextError ?? discovery.error} subject="substack" onRetry={discovery.reload}>
          <p className="meta" style={{ margin: '12px 0 4px' }}>
            Couldn't find related writing right now.
          </p>
        </ErrorState>
      )}

      {searching && !discovery.data && <ListSkeleton count={3} label="Searching Substack and Medium" />}

      {discovery.status === 'success' && articles.length === 0 && (
        <EmptyState title="Couldn't find related writing.">
          Nothing on {where} matched closely enough{discovery.data?.totalCandidates ? ` (${discovery.data.totalCandidates} weaker matches hidden — lower the minimum relevance in Settings to see them)` : ''}.
        </EmptyState>
      )}

      {articles.length > 0 && (
        <ul className="list">
          {articles.map((a) => (
            <ArticleCard key={a.id} article={a} onSeeReddit={p.onSeeReddit} />
          ))}
        </ul>
      )}

      {context && source.kind !== 'current' && (
        <p className="meta" style={{ marginTop: 12 }}>
          {source.kind === 'query' ? 'From your search' : 'From a Reddit thread'}
        </p>
      )}
    </div>
  );
}
