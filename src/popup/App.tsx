import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Logo } from '../components/Logo';
import { SearchBar } from '../components/SearchBar';
import { ExpandIcon, SettingsIcon, ShieldIcon } from '../components/icons';
import { Tabs, type TabDef } from '../components/Tabs';
import { buildContext, generateQueries } from '../services/contextService';
import type { ContentContext, RawPageMetadata, UsedInfoField } from '../types/context';
import type { ScoredRedditPost } from '../types/reddit';
import type { RankedArticle } from '../types/substack';
import { applyTheme } from './theme';
import { useAnalyzed, useCurrentContext, useDiscovery, useSettingsState } from './data';
import { useDebounced, useMediaQuery, useNow } from './hooks';
import { ReadingPanel, type ReadingSource } from './ReadingPanel';
import { RedditPanel, type PageBridge, type RedditFocus } from './RedditPanel';

export interface AppProps {
  /** `popup`: the toolbar popup.  `tab`: the full dashboard page. */
  mode: 'popup' | 'tab';
  /** The page tab the dashboard was opened from. */
  sourceTabId: number | undefined;
}

type TabId = 'reddit' | 'reading';

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

  // ── navigation state ───────────────────────────────────────────────────────
  // Related Reading leads; the user's explicit choice wins.
  const [userTab, setUserTab] = useState<TabId | null>(null);
  const chooseTab = useCallback((t: TabId) => setUserTab(t), []);

  // ── search ─────────────────────────────────────────────────────────────────
  const [typed, setTyped] = useState('');
  const [query, setQuery] = useState('');
  const debounced = useDebounced(typed, 450);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const [threadBridge, setThreadBridge] = useState<RawPageMetadata | null>(null);
  const [pageBridgeActive, setPageBridgeActive] = useState(false);
  const [articleFocus, setArticleFocus] = useState<RedditFocus | null>(null);
  const [usedPage, setUsedPage] = useState(false);

  useEffect(() => {
    const q = debounced.trim();
    if (q.length >= 2) setQuery(q);
    else if (q.length === 0) setQuery('');
  }, [debounced]);

  const commitQuery = useCallback((value: string) => {
    const q = value.trim();
    setTyped(value);
    setQuery(q);
    if (q) {
      setThreadBridge(null);
      setArticleFocus(null);
    }
  }, []);

  const clearQuery = useCallback(() => {
    setTyped('');
    setQuery('');
  }, []);

  // "/" jumps to search from anywhere
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── what is the user looking at? ───────────────────────────────────────────
  const page = useCurrentContext(sourceTabId);
  const response = page.response;
  const currentContext = response?.state === 'ready' ? (response.context ?? null) : null;
  const isWatching = !!currentContext && (currentContext.platform === 'youtube' || currentContext.platform === 'netflix');

  const tab: TabId = userTab ?? 'reading';

  useEffect(() => {
    if (page.response?.state === 'ready' && page.response.context && page.response.platform === 'unknown') setUsedPage(true);
  }, [page.response]);

  // ── reading source (priority: search > Reddit card > this page) ────────────
  const manualRaw = useMemo<RawPageMetadata | null>(
    () => (query ? { platform: 'manual', kind: 'query', url: '', title: query, source: 'your search', confidence: 'high' } : null),
    [query],
  );
  const bridgeRaw = !query ? threadBridge : null;
  const useCurrent = !query && !threadBridge && !!currentContext && (isWatching || usedPage || pageBridgeActive);

  const analyzed = useAnalyzed(manualRaw ?? bridgeRaw);
  const context: ContentContext | null = useCurrent ? currentContext : (analyzed.data ?? null);

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
    if (useCurrent) {
      const used: UsedInfoField[] = response?.used ?? [];
      return { kind: 'current', verb: isWatching ? 'Watching' : 'Reading', used };
    }
    return { kind: 'none', verb: 'Exploring', used: [] };
  }, [manualRaw, bridgeRaw, useCurrent, response?.used, isWatching]);

  const readingActive = split || tab === 'reading';
  const discovery = useDiscovery(readingActive ? context : null);

  // ── cross-links: Reddit ⇄ Substack ─────────────────────────────────────────
  const onFindReading = useCallback(
    (post: ScoredRedditPost) => {
      clearQuery();
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
      chooseTab('reading');
    },
    [chooseTab, clearQuery],
  );

  const onSeeReddit = useCallback(
    (article: RankedArticle) => {
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
      chooseTab('reddit');
    },
    [chooseTab],
  );

  const redditFocus: RedditFocus | null = articleFocus ?? (query ? { label: query, queries: [query], kind: 'search' } : null);

  const pageBridge: PageBridge | null =
    !redditFocus && currentContext && response?.platform === 'substack' && currentContext.kind === 'article'
      ? {
          title: currentContext.title,
          onSee: () => {
            const queries = generateQueries(currentContext, { max: 2 }).map((q) => q.text);
            setArticleFocus({ label: currentContext.title, queries: queries.length ? queries : [currentContext.title], kind: 'article' });
          },
        }
      : null;

  const onDismissSource = useCallback(() => {
    clearQuery();
    setThreadBridge(null);
    setPageBridgeActive(false);
  }, [clearQuery]);

  const tabs: TabDef<TabId>[] = [
    // threads about what's playing (see RedditPanel)
    { id: 'reddit', label: 'Reddit', dot: isWatching },
    {
      id: 'reading',
      label: 'Related Reading',
      count: discovery.status === 'success' ? (discovery.data?.articles.length ?? 0) : undefined,
      dot: isWatching,
    },
  ];

  const detectionOn = () => update({ privacy: { detectionEnabled: true, youtubeDetection: true, netflixDetection: true } });

  return (
    <div className={`app mode-${mode}${split ? ' split' : ''}`}>
      <header className="header">
        <div className="brand">
          <Logo />
          <div className="brand-text">
            <h1 className="brand-title">Rabbit Hole</h1>
            <p className="brand-sub">See what the internet is talking about — and go deeper.</p>
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

      <SearchBar value={typed} onChange={setTyped} onSubmit={commitQuery} onClear={clearQuery} inputRef={searchRef} />

      {!split && <Tabs tabs={tabs} value={tab} onChange={chooseTab} idPrefix={idPrefix} />}

      <main className="panels">
        <RedditPanel
          idPrefix={idPrefix}
          settings={settings}
          active={split || tab === 'reddit'}
          now={now}
          focus={redditFocus}
          onClearFocus={() => (articleFocus ? setArticleFocus(null) : clearQuery())}
          watching={isWatching ? currentContext : null}
          pageBridge={pageBridge}
          onFindReading={onFindReading}
          onSearch={() => searchRef.current?.focus()}
        />
        <ReadingPanel
          idPrefix={idPrefix}
          active={readingActive}
          source={source}
          context={context}
          contextLoading={source.kind !== 'current' && source.kind !== 'none' && analyzed.status === 'loading'}
          contextError={source.kind !== 'current' && source.kind !== 'none' ? analyzed.error : undefined}
          page={{ loading: page.status === 'loading' || page.status === 'idle', response, error: page.error }}
          discovery={discovery}
          onManual={commitQuery}
          onUsePage={() => void page.usePage()}
          usingPage={page.usingPage}
          usePageError={page.usePageError}
          onStartBridge={() => setPageBridgeActive(true)}
          onSeeReddit={onSeeReddit}
          onDismissSource={onDismissSource}
          onOpenSettings={() => openSettings()}
          onEnableDetection={detectionOn}
        />
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
