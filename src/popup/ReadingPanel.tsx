import { ArticleCard } from '../components/ArticleCard';
import { ContextBar } from '../components/ContextBar';
import { ArrowRightIcon, EyeIcon, LockIcon, PlayIcon } from '../components/icons';
import { ContextSkeleton, ListSkeleton } from '../components/Skeleton';
import { Banner, EmptyState, ErrorState, ManualSearchForm } from '../components/States';
import { platformLabel } from '../services/context/platform';
import type { ContentContext, CurrentContextResponse, UsedInfoField } from '../types/context';
import type { SerializedError } from '../types/errors';
import type { DiscoveryResponse, RankedArticle } from '../types/substack';
import { plural } from '../utils/format';
import type { AsyncState } from './hooks';

export interface ReadingSource {
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
  /** The page-detection result (drives the fallback / disabled / idle states). */
  page: { loading: boolean; response: CurrentContextResponse | undefined; error: SerializedError | undefined };
  discovery: AsyncState<DiscoveryResponse> & { reload: () => void };
  onManual: (query: string) => void;
  onUsePage: () => void;
  usingPage: boolean;
  usePageError: SerializedError | undefined;
  onStartBridge: () => void;
  onSeeReddit: (article: RankedArticle) => void;
  onDismissSource: () => void;
  onOpenSettings: () => void;
  onEnableDetection: () => void;
}

export function ReadingPanel(p: Props) {
  const { source, context, discovery, page } = p;
  const response = page.response;
  const articles = discovery.data?.articles ?? [];

  const panelProps = {
    className: 'panel',
    role: 'tabpanel',
    id: `${p.idPrefix}-panel-reading`,
    'aria-labelledby': `${p.idPrefix}-tab-reading`,
    hidden: !p.active,
  } as const;
  const heading = (
    <div className="panel-title split-heading">
      <h2>Related Reading</h2>
    </div>
  );

  // ── nothing to search from: explain why, offer the manual route ────────────
  if (source.kind === 'none') {
    if (page.loading) {
      return (
        <div {...panelProps}>
          {heading}
          <ContextSkeleton />
          <ListSkeleton count={2} label="Reading the current page" />
        </div>
      );
    }
    const platform = response?.platform;
    const bridgeable = response?.state === 'ready' && response.context && (response.platform === 'reddit' || response.platform === 'substack');

    return (
      <div {...panelProps}>
        {heading}
        {bridgeable && response.context && (
          <div className="bridge">
            <div className="bridge-text">
              <small>{response.platform === 'reddit' ? 'Reddit thread' : 'Substack article'}</small>
              <span title={response.context.title}>{response.context.title}</span>
            </div>
            <button type="button" className="btn primary small" onClick={p.onStartBridge}>
              Find deeper reading <ArrowRightIcon />
            </button>
          </div>
        )}

        {response?.state === 'undetected' ? (
          <EmptyState icon={<PlayIcon />} title="We couldn't automatically identify what you're watching.">
            {platform === 'netflix'
              ? 'Netflix hides its player labels while you watch. Move your mouse over the player and reopen Rabbit Hole, or tell us below.'
              : response.reason}
            <ManualSearchForm onSubmit={p.onManual} />
          </EmptyState>
        ) : response?.state === 'disabled' ? (
          <EmptyState icon={<LockIcon />} title="Page detection is off">
            {response.reason ?? 'Turn it on to detect what you’re watching.'}
            <span className="actions" style={{ display: 'flex', justifyContent: 'center', margin: '10px 0' }}>
              <button type="button" className="btn" onClick={p.onEnableDetection}>
                Turn on detection
              </button>
              <button type="button" className="btn ghost" onClick={p.onOpenSettings}>
                Privacy settings
              </button>
            </span>
            <ManualSearchForm label="Or search a topic" placeholder="e.g. Black Mirror" onSubmit={p.onManual} />
          </EmptyState>
        ) : page.error ? (
          <ErrorState error={page.error} subject="context">
            <ManualSearchForm onSubmit={p.onManual} />
          </ErrorState>
        ) : (
          <EmptyState icon={<EyeIcon />} title={bridgeable ? 'Or search any topic' : 'Go deeper on anything'}>
            {bridgeable
              ? 'Rabbit Hole finds writing related to the thread or article you’re on.'
              : 'Open a YouTube video or a Netflix title and Rabbit Hole finds related Substack writing. Or search a topic.'}
            <ManualSearchForm label="What are you watching?" onSubmit={p.onManual} />
            {response?.canUsePage && (
              <span className="actions" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, marginTop: 12 }}>
                <button type="button" className="btn" onClick={p.onUsePage} disabled={p.usingPage}>
                  {p.usingPage ? 'Reading…' : `Use this page${response.hostname ? ` (${response.hostname})` : ''}`}
                </button>
                <small className="meta">Only reads the page when you click — never automatically.</small>
              </span>
            )}
            {p.usePageError && (
              <span className="meta" role="alert">
                Couldn’t read this page. Open Rabbit Hole from that page’s toolbar and try again.
              </span>
            )}
          </EmptyState>
        )}
      </div>
    );
  }

  // ── we have something to search from ───────────────────────────────────────
  const searching = p.contextLoading || discovery.status === 'loading';
  const found = discovery.status === 'success' ? articles.length : 0;
  const limited = discovery.data?.limitedCoverage;
  const searched = (context?.concepts ?? []).filter((c) => c.origin !== 'ontology').slice(0, 5);

  return (
    <div {...panelProps}>
      {heading}
      {context ? (
        <ContextBar
          context={context}
          used={source.used}
          verb={source.verb}
          onDismiss={source.kind === 'current' ? undefined : p.onDismissSource}
        />
      ) : (
        <ContextSkeleton />
      )}

      <p className="status-line" aria-live="polite">
        {searching ? (
          <>
            <span className="spinner" /> Finding related writing…
          </>
        ) : discovery.status === 'success' ? (
          articles.length > 0 ? (
            <span>
              Found <strong className="num">{found}</strong> relevant Substack {plural(found, 'post')}
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

      {limited && discovery.status === 'success' && (
        <Banner tone="info">
          <b>Searching a curated publication list.</b> For all of Substack, connect a search provider in{' '}
          <button type="button" className="link" onClick={p.onOpenSettings}>
            Settings
          </button>
          .
        </Banner>
      )}

      {(p.contextError || discovery.status === 'error') && (
        <ErrorState error={p.contextError ?? discovery.error} subject="substack" onRetry={discovery.reload}>
          <p className="meta" style={{ margin: '12px 0 4px' }}>
            Couldn't find related writing. Try searching manually:
          </p>
          <ManualSearchForm label="Search topic" placeholder="Search topic…" button="Search" onSubmit={p.onManual} />
        </ErrorState>
      )}

      {searching && !discovery.data && <ListSkeleton count={3} label="Searching Substack" />}

      {discovery.status === 'success' && articles.length === 0 && (
        <EmptyState title="Couldn't find related writing.">
          Nothing on Substack matched closely enough{discovery.data?.totalCandidates ? ` (${discovery.data.totalCandidates} weaker matches hidden — lower the minimum relevance in Settings to see them)` : ''}.
          <ManualSearchForm label="Try searching manually" placeholder="Search topic…" button="Search" onSubmit={p.onManual} />
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
          {platformLabel(context.platform) === 'Search' ? 'From your search' : `From ${platformLabel(context.platform)}`}
        </p>
      )}
    </div>
  );
}
