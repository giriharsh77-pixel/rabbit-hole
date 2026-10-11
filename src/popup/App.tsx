import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Logo } from '../components/Logo';
import { SubjectBar, SubjectNotice } from '../components/SubjectBar';
import { TitleSearch } from '../components/TitleSearch';
import { ExpandIcon, EyeIcon, LockIcon, PlayIcon, SettingsIcon, ShieldIcon } from '../components/icons';
import { Tabs, type TabDef } from '../components/Tabs';
import { buildContext, generateQueries } from '../services/contextService';
import type { ContentContext, RawPageMetadata, UsedInfoField } from '../types/context';
import type { ScoredRedditPost } from '../types/reddit';
import type { RankedArticle } from '../types/substack';
import type { TitleCandidate } from '../types/title';
import { applyTheme } from './theme';
import { AboutPanel } from './AboutPanel';
import { useAnalyzed, useCurrentContext, useDiscovery, useSettingsState, useTitleContext, useTitleInsights, useTitleResolve, useTitleSearch } from './data';
import { useDebounced, useMediaQuery, useNow } from './hooks';
import { ReadingPanel, type ReadingSource } from './ReadingPanel';
import { RedditPanel, type RedditFocus } from './RedditPanel';
import { WatchNextPanel } from './WatchNextPanel';
import { NEWS_ORIGINS, requestOrigins } from './permissions';

export interface AppProps {
  /** `popup`: the toolbar popup.  `tab`: the full dashboard page. */
  mode: 'popup' | 'tab';
  /** The page tab the dashboard was opened from. */
  sourceTabId: number | undefined;
}

type TabId = 'discuss' | 'read' | 'about' | 'next';

const PRIVACY_NOTE = 'Only short search terms leave your browser.';

function openSettings(hash = ''): void {
  if (typeof chrome !== 'undefined' && chrome.runtime?.openOptionsPage && !hash) {
    void chrome.runtime.openOptionsPage();
    return;
  }
  const url = typeof chrome !== 'undefined' && chrome.runtime?.getURL ? chrome.runtime.getURL(`options.html${hash}`) : `options.html${hash}`;
  if (typeof chrome !== 'undefined' && chrome.tabs?.create) void chrome.tabs.create({ url });
  else window.open(url, '_blank');
}

async function openDashboard(): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.tabs?.create) {
    window.open('?mode=tab', '_blank');
    return;
  }
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  const suffix = active?.id !== undefined ? `&tab=${active.id}` : '';
  await chrome.tabs.create({ url: chrome.runtime.getURL(`popup.html?mode=tab${suffix}`) });
  window.close();
}

export function App({ mode, sourceTabId }: AppProps) {
  const { settings, update } = useSettingsState();
  const now = useNow();
  const wide = useMediaQuery('(min-width: 980px)');
  const split = mode === 'tab' && wide;
  const idPrefix = 'rh';

  useEffect(() => applyTheme(settings.appearance.theme), [settings.appearance.theme]);

  const [tab, setTab] = useState<TabId>('discuss');

  // ── search: pick a title, or search the words themselves ───────────────────
  const [typed, setTyped] = useState('');
  const debounced = useDebounced(typed, 250);
  const titleSearch = useTitleSearch(debounced);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const [picked, setPicked] = useState<TitleCandidate | null>(null);
  const [query, setQuery] = useState('');
  const [threadBridge, setThreadBridge] = useState<RawPageMetadata | null>(null);
  const [articleFocus, setArticleFocus] = useState<RedditFocus | null>(null);

  const focusSearch = useCallback((prefill?: string) => {
    if (prefill !== undefined) setTyped(prefill);
    searchRef.current?.focus();
  }, []);

  const pickTitle = useCallback((t: TitleCandidate) => {
    setPicked(t);
    setTyped('');
    setQuery('');
    setThreadBridge(null);
    setArticleFocus(null);
    searchRef.current?.blur();
  }, []);

  const searchAll = useCallback((q: string) => {
    setQuery(q.trim());
    setThreadBridge(null);
    setArticleFocus(null);
    searchRef.current?.blur();
  }, []);

  // "/" jumps to search from anywhere
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
      if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── what are the tabs about? a picked title, else what's playing on Netflix ─
  const page = useCurrentContext(sourceTabId);
  const response = page.response;
  const netflixContext = response?.state === 'ready' && response.context?.platform === 'netflix' ? response.context : null;

  const pickedTitle = useTitleContext(picked?.qid ?? null);
  const resolved = useTitleResolve(picked ? null : netflixContext);

  const subject: ContentContext | null = picked ? (pickedTitle.data?.context ?? null) : netflixContext;
  const titleInfo = picked ? pickedTitle.data?.info : resolved.data;
  // 'idle' with a Netflix title means the lookup is about to start — treat it as loading, so Discuss
  // doesn't flash a fallback search before the exact title is known
  const titleLoading = picked
    ? pickedTitle.status === 'loading' || pickedTitle.status === 'idle'
    : !!netflixContext && (resolved.status === 'loading' || resolved.status === 'idle');
  const titleError = picked ? pickedTitle.error : resolved.error;
  const reloadTitle = picked ? pickedTitle.reload : resolved.reload;
  // ratings, reviews, similar titles, Netflix India — only with a backend (null otherwise)
  const insights = useTitleInsights(titleInfo?.qid ?? null);

  // ── Read: a free-text search > a Reddit thread > the subject ───────────────
  const manualRaw = useMemo<RawPageMetadata | null>(
    () => (query ? { platform: 'manual', kind: 'query', url: '', title: query, source: 'your search', confidence: 'high' } : null),
    [query],
  );
  const bridgeRaw = !query ? threadBridge : null;
  const analyzed = useAnalyzed(manualRaw ?? bridgeRaw);
  const readContext: ContentContext | null = manualRaw || bridgeRaw ? (analyzed.data ?? null) : subject;

  const source: ReadingSource = useMemo(() => {
    if (manualRaw) return { kind: 'query', verb: 'Exploring', used: [{ label: 'Your search', value: manualRaw.title }] };
    if (bridgeRaw) {
      return {
        kind: 'bridge',
        verb: 'Reading',
        used: [
          { label: 'Reddit thread', value: bridgeRaw.title },
          { label: 'Sent to search', value: 'Short topic queries derived from that headline.' },
        ],
      };
    }
    if (subject) return { kind: 'current', verb: 'Watching', used: [] };
    return { kind: 'none', verb: 'Exploring', used: [] };
  }, [manualRaw, bridgeRaw, subject]);

  const readingActive = split || tab === 'read';
  const discovery = useDiscovery(readingActive ? readContext : null);

  // ── cross-links: Reddit ⇄ articles ─────────────────────────────────────────
  const onFindReading = useCallback((post: ScoredRedditPost) => {
    setQuery('');
    setArticleFocus(null);
    setThreadBridge({
      platform: 'reddit',
      kind: 'thread',
      url: post.permalink,
      title: post.title,
      subreddit: post.subreddit,
      ...(post.preview ? { description: post.preview } : {}),
      source: 'Reddit thread card',
      confidence: 'high',
    });
    setTab('read');
  }, []);

  const onSeeReddit = useCallback((article: RankedArticle) => {
    const ctx = buildContext({
      platform: 'substack',
      kind: 'article',
      url: article.url,
      title: article.title,
      description: article.excerpt,
      source: 'article card',
      confidence: 'high',
    });
    const queries = generateQueries(ctx, { max: 2 }).map((q) => q.text);
    setArticleFocus({ label: article.title, queries: queries.length ? queries : [article.title], kind: 'article' });
    setTab('discuss');
  }, []);

  const redditFocus: RedditFocus | null = articleFocus ?? (query ? { label: query, queries: [query], kind: 'search' } : null);

  const onDismissSource = useCallback(() => {
    setQuery('');
    setThreadBridge(null);
  }, []);

  const tabs: TabDef<TabId>[] = [
    { id: 'discuss', label: 'Discuss', dot: !!subject },
    { id: 'read', label: 'Read', count: discovery.status === 'success' ? (discovery.data?.articles.length ?? 0) : undefined },
    { id: 'about', label: 'About' },
    { id: 'next', label: 'Watch next' },
  ];

  const detectionOn = () => update({ privacy: { detectionEnabled: true, netflixDetection: true } });

  // ── the subject slot ───────────────────────────────────────────────────────
  const pageUsed: UsedInfoField[] = response?.used ?? [];
  let subjectSlot: ReactNode = null;
  if (picked) {
    subjectSlot = (
      <SubjectBar
        verb="Exploring"
        title={picked.title}
        year={picked.year}
        meta={[picked.kind === 'movie' ? 'Movie' : 'Series', picked.description ?? '']}
        used={[
          { label: 'Picked in', value: 'Title search (Wikidata)' },
          { label: 'Sent to search', value: `The title “${picked.title}” and short topic queries — nothing from your browser.` },
        ]}
        onDismiss={() => setPicked(null)}
        dismissLabel={netflixContext ? 'Back to what’s playing on Netflix' : 'Clear the picked title'}
      />
    );
  } else if (netflixContext) {
    subjectSlot = (
      <SubjectBar
        verb="Watching"
        title={netflixContext.title}
        year={titleInfo?.year}
        meta={['Netflix', netflixContext.episode ?? (netflixContext.kind === 'movie' ? 'Movie' : '')]}
        used={pageUsed}
      />
    );
  } else if (page.status === 'loading' || page.status === 'idle') {
    subjectSlot = <div className="subject-bar skeleton-bar" aria-hidden="true" />;
  } else if (response?.state === 'undetected') {
    subjectSlot = (
      <SubjectNotice icon={<PlayIcon />}>
        Couldn’t identify what’s playing — Netflix hides its labels during playback. Move your mouse over the player and reopen, or search above.
      </SubjectNotice>
    );
  } else if (response?.state === 'disabled') {
    subjectSlot = (
      <SubjectNotice
        icon={<LockIcon />}
        actions={
          <>
            <button type="button" className="btn small" onClick={detectionOn}>
              Turn on detection
            </button>
            <button type="button" className="btn small ghost" onClick={() => openSettings('#privacy')}>
              Privacy settings
            </button>
          </>
        }
      >
        Netflix detection is off. Search for a movie or show above, or turn it on.
      </SubjectNotice>
    );
  } else {
    subjectSlot = (
      <SubjectNotice icon={<EyeIcon />}>
        Open a Netflix title and Rabbit Hole follows along — or search any movie or show above.
      </SubjectNotice>
    );
  }

  // About / Watch next follow titles only, not a free-text topic search
  const titleSubject = query ? null : subject;
  // Until the tab has been read, show skeletons — not the "open a Netflix title" empty states
  const pageLoading = !picked && !query && (page.status === 'loading' || page.status === 'idle');

  return (
    <div className={`app mode-${mode}${split ? ' split' : ''}`}>
      <header className="header">
        <div className="brand">
          <Logo />
          <div className="brand-text">
            <h1 className="brand-title">Rabbit Hole</h1>
            <p className="brand-sub">Go deeper on what you watch.</p>
          </div>
        </div>
        <div className="header-actions">
          {mode === 'popup' && (
            <button type="button" className="icon-btn" onClick={() => void openDashboard()} aria-label="Open the full dashboard in a tab" title="Open full dashboard">
              <ExpandIcon />
            </button>
          )}
          <button type="button" className="icon-btn" onClick={() => openSettings()} aria-label="Settings" title="Settings">
            <SettingsIcon />
          </button>
        </div>
      </header>

      <TitleSearch
        value={typed}
        onChange={setTyped}
        results={titleSearch.data}
        loading={titleSearch.status === 'loading' || debounced.trim() !== typed.trim()}
        error={titleSearch.error}
        onPick={pickTitle}
        onSearchAll={searchAll}
        onClear={() => setTyped('')}
        inputRef={searchRef}
      />

      <div className="subject-wrap">{subjectSlot}</div>

      {!split && <Tabs tabs={tabs} value={tab} onChange={setTab} idPrefix={idPrefix} />}

      <main className="panels">
        <RedditPanel
          idPrefix={idPrefix}
          settings={settings}
          active={split || tab === 'discuss'}
          now={now}
          focus={redditFocus}
          onClearFocus={() => (articleFocus ? setArticleFocus(null) : setQuery(''))}
          watching={subject}
          title={titleSubject ? (titleInfo ?? null) : null}
          titleLoading={!!titleSubject && titleLoading}
          pageLoading={pageLoading}
          onFindReading={onFindReading}
          onSearch={focusSearch}
          onSortChange={(sort) => update({ reddit: { sort } })}
        />
        <ReadingPanel
          idPrefix={idPrefix}
          active={readingActive}
          source={source}
          context={readContext}
          contextLoading={(source.kind === 'query' || source.kind === 'bridge') && analyzed.status === 'loading'}
          contextError={source.kind === 'query' || source.kind === 'bridge' ? analyzed.error : undefined}
          subjectLoading={(!!picked && pickedTitle.status === 'loading') || pageLoading}
          discovery={discovery}
          onSearch={focusSearch}
          onSeeReddit={onSeeReddit}
          onDismissSource={onDismissSource}
          onOpenSettings={() => openSettings()}
          newsOn={settings.reading.includeNews}
          onEnableNews={() => {
            void requestOrigins(NEWS_ORIGINS).then((ok) => ok && update({ reading: { includeNews: true } }));
          }}
        />
        <div className="panel-stack">
          <AboutPanel
            idPrefix={idPrefix}
            active={split || tab === 'about'}
            subject={titleSubject}
            info={titleInfo}
            loading={titleLoading}
            error={titleError}
            onRetry={reloadTitle}
            onSearch={focusSearch}
            pageLoading={pageLoading}
            insights={insights.data}
            insightsLoading={insights.status === 'loading'}
          />
          <WatchNextPanel
            idPrefix={idPrefix}
            active={split || tab === 'next'}
            subject={titleSubject}
            info={titleInfo}
            infoLoading={titleLoading}
            pageLoading={pageLoading}
            insights={insights.data}
            insightsLoading={insights.status === 'loading'}
            onPick={(t) => {
              pickTitle(t);
              setTab('about');
            }}
            onSearch={focusSearch}
          />
        </div>
      </main>

      <footer className="footer">
        <button type="button" onClick={() => openSettings('#privacy')} title="What Rabbit Hole reads, stores and sends">
          <ShieldIcon /> Private by design
        </button>
        <span>{PRIVACY_NOTE}</span>
      </footer>
    </div>
  );
}
