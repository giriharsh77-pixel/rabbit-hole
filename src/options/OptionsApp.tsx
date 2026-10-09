import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Logo } from '../components/Logo';
import { customDomainOrigins } from '../services/substack/seeds';
import type { AppStatus } from '../types/messages';
import type { SecretName, SecretsStatus } from '../types/settings';
import { useSettingsState } from '../popup/data';
import { call } from '../popup/rpc';
import { applyTheme } from '../popup/theme';
import { Row, RadioGroup, Slider, Switch, TagInput } from './controls';

const SECTIONS = [
  { id: 'reddit', label: 'Reddit' },
  { id: 'reading', label: 'Related Reading' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'integrations', label: 'API & Integrations' },
  { id: 'data', label: 'Your data' },
] as const;

const BRAVE_HOST = 'https://api.search.brave.com/*';
const ANTHROPIC_HOST = 'https://api.anthropic.com/*';

/** chrome.permissions only exists in the real extension; the UI preview just says yes. */
async function requestOrigins(origins: string[]): Promise<boolean> {
  if (typeof chrome === 'undefined' || !chrome.permissions) return true;
  try {
    return await chrome.permissions.request({ origins });
  } catch {
    return false;
  }
}

async function removeOrigins(origins: string[]): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.permissions) return;
  await chrome.permissions.remove({ origins }).catch(() => undefined);
}

export function OptionsApp() {
  const { settings, loaded, update } = useSettingsState();
  const [saved, setSaved] = useState(false);
  const [status, setStatus] = useState<AppStatus | undefined>();
  const [secrets, setSecrets] = useState<SecretsStatus | undefined>();
  const [notice, setNotice] = useState<string | undefined>();

  useEffect(() => applyTheme(settings.appearance.theme), [settings.appearance.theme]);

  const refreshStatus = useCallback(() => {
    void call('status/get').then(setStatus).catch(() => undefined);
    void call('secrets/status').then(setSecrets).catch(() => undefined);
  }, []);
  useEffect(refreshStatus, [refreshStatus]);

  useEffect(() => {
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
  }, [loaded]);

  const change: typeof update = useCallback(
    (patch) => {
      update(patch);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1400);
      window.setTimeout(refreshStatus, 250);
    },
    [update, refreshStatus],
  );

  const r = settings.reddit;
  const rd = settings.reading;
  const pv = settings.privacy;

  return (
    <div className="options">
      <header className="options-head">
        <Logo size={40} />
        <div>
          <h1>Rabbit Hole settings</h1>
          <p>
            See what the internet is talking about — and go deeper.
            <span className={`saved${saved ? ' show' : ''}`} role="status" style={{ marginLeft: 10 }}>
              ✓ Saved
            </span>
          </p>
        </div>
      </header>

      <nav className="options-nav" aria-label="Settings sections">
        {SECTIONS.map((s) => (
          <a key={s.id} className="chip" href={`#${s.id}`}>
            {s.label}
          </a>
        ))}
      </nav>

      {/* ── Reddit ─────────────────────────────────────────────────────────── */}
      <section className="section" id="reddit" aria-labelledby="h-reddit">
        <h2 id="h-reddit">Reddit</h2>
        <p className="lead">Threads about what you’re watching — how they’re found and shown.</p>

        <Row stack title="Preferred subreddits" help="Threads from these communities rank a little higher.">
          <TagInput
            values={r.preferredSubreddits}
            onChange={(v) => change({ reddit: { preferredSubreddits: v } })}
            placeholder="Type a subreddit and press Enter, e.g. MachineLearning"
            label="Preferred subreddits"
            prefix="r/"
            max={40}
          />
        </Row>

        <Row title="Show thumbnails" help="Loads small preview images from Reddit's image servers.">
          <Switch checked={r.showThumbnails} onChange={(v) => change({ reddit: { showThumbnails: v } })} label="Show thumbnails" />
        </Row>
        <Row title="Include NSFW threads" help="Off by default.">
          <Switch checked={r.includeNsfw} onChange={(v) => change({ reddit: { includeNsfw: v } })} label="Include NSFW threads" />
        </Row>
        <Row
          title="Use my Reddit browser session"
          help="Reddit sometimes blocks anonymous requests. Turning this on sends your reddit.com cookies with requests so they look like normal browsing. Off keeps requests anonymous."
        >
          <Switch checked={r.useBrowserSession} onChange={(v) => change({ reddit: { useBrowserSession: v } })} label="Use my Reddit browser session" />
        </Row>
      </section>

      {/* ── Related reading ────────────────────────────────────────────────── */}
      <section className="section" id="reading" aria-labelledby="h-reading">
        <h2 id="h-reading">Related Reading</h2>
        <p className="lead">How Substack and Medium recommendations are chosen and filtered.</p>

        <Row title="Recommendations" help="Maximum articles shown.">
          <Slider value={rd.recommendationCount} min={5} max={30} label="Number of recommendations" onCommit={(v) => change({ reading: { recommendationCount: v } })} />
        </Row>
        <Row title="Minimum relevance" help="Hide articles that match less closely. Raise it for fewer, tighter results.">
          <Slider
            value={rd.minRelevance}
            min={0}
            max={90}
            step={5}
            label="Minimum relevance"
            onCommit={(v) => change({ reading: { minRelevance: v } })}
            format={(v) => (v < 20 ? 'Any' : v < 40 ? 'Loose' : v < 60 ? 'Close' : 'Tight')}
          />
        </Row>
        <Row stack title="Preferred topics" help="Topics you always care about nudge the ranking toward them.">
          <TagInput
            values={rd.preferredTopics}
            onChange={(v) => change({ reading: { preferredTopics: v } })}
            placeholder="e.g. AI policy, climate, film criticism"
            label="Preferred topics"
            max={12}
          />
        </Row>
        <Row stack title="Extra publications" help="Substack newsletters to always check by RSS (the part before .substack.com).">
          <TagInput
            values={rd.extraPublications}
            onChange={(v) => change({ reading: { extraPublications: v } })}
            placeholder="e.g. importai"
            label="Extra publications"
            max={20}
          />
        </Row>
        <Row title="Include Medium" help="Also searches Medium’s public topic feeds (recent stories), so you still get reading when Substack has nothing. Sends only topic words, like “the-office”, to medium.com.">
          <Switch checked={rd.includeMedium} onChange={(v) => change({ reading: { includeMedium: v } })} label="Include Medium" />
        </Row>
        <Row
          title="Include custom-domain newsletters"
          help={`Adds popular publications that live on their own domains (${customDomainOrigins().length} sites). Chrome will ask you to allow access to those specific sites.`}
        >
          <Switch
            checked={rd.includeCustomDomains}
            label="Include custom-domain newsletters"
            onChange={(v) => {
              void (async () => {
                if (v) {
                  const ok = await requestOrigins(customDomainOrigins());
                  if (!ok) {
                    setNotice('Permission was not granted, so custom-domain newsletters stay off.');
                    return;
                  }
                } else {
                  await removeOrigins(customDomainOrigins());
                }
                setNotice(undefined);
                change({ reading: { includeCustomDomains: v } });
              })();
            }}
          />
        </Row>
        {notice && (
          <p className="callout" role="alert">
            {notice}
          </p>
        )}
      </section>

      {/* ── Privacy ────────────────────────────────────────────────────────── */}
      <section className="section" id="privacy" aria-labelledby="h-privacy">
        <h2 id="h-privacy">Privacy</h2>
        <p className="lead">Rabbit Hole is built to know as little about you as possible.</p>

        <div className="callout">
          <strong>Exactly what happens</strong>
          <ul>
            <li>
              <b>Reads:</b> only the page you have open, only when you open Rabbit Hole — and only on YouTube, Netflix, Reddit threads and Substack. Anywhere else it reads nothing unless you click “Use this page”.
            </li>
            <li>
              <b>Stores locally:</b> your settings (and any API keys you add). Caches live in memory only and are wiped when the browser closes. No browsing history, ever.
            </li>
            <li>
              <b>Sends:</b> short topic queries (like “AI agents”) to Reddit, Medium and a search provider. Never the page, your history, your account or an identifier. No analytics, no tracking, no selling data.
            </li>
          </ul>
        </div>

        <Row title="Current-page detection" help="Master switch. Off means Rabbit Hole never reads any page; search still works.">
          <Switch checked={pv.detectionEnabled} onChange={(v) => change({ privacy: { detectionEnabled: v } })} label="Enable current-page detection" />
        </Row>
        <Row title="Detect YouTube videos & Shorts" help="Title, channel, description and keywords shown on the page.">
          <Switch checked={pv.youtubeDetection} disabled={!pv.detectionEnabled} onChange={(v) => change({ privacy: { youtubeDetection: v } })} label="Detect YouTube" />
        </Row>
        <Row title="Detect Netflix titles" help="The title shown in the player and public title-page metadata. Never the video or DRM.">
          <Switch checked={pv.netflixDetection} disabled={!pv.detectionEnabled} onChange={(v) => change({ privacy: { netflixDetection: v } })} label="Detect Netflix" />
        </Row>
        <Row
          title="AI enhancements (optional)"
          help={
            status?.ai.available
              ? `Uses Claude to understand topics and explain matches. Sends only the title, channel and a short description. Provider: ${status.ai.via === 'backend' ? 'your backend' : 'your API key'}.`
              : 'Needs a backend with an Anthropic key, or your own Anthropic key under API & Integrations. Off by default.'
          }
        >
          <Switch
            checked={pv.aiEnabled}
            disabled={!status?.ai.available}
            onChange={(v) => change({ privacy: { aiEnabled: v } })}
            label="Enable AI enhancements"
          />
        </Row>
      </section>

      {/* ── Appearance ─────────────────────────────────────────────────────── */}
      <section className="section" id="appearance" aria-labelledby="h-appearance">
        <h2 id="h-appearance">Appearance</h2>
        <p className="lead">Dark by default.</p>
        <Row title="Theme">
          <RadioGroup
            label="Theme"
            value={settings.appearance.theme}
            onChange={(v) => change({ appearance: { theme: v } })}
            options={[
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' },
              { value: 'system', label: 'System' },
            ]}
          />
        </Row>
      </section>

      {/* ── Integrations ───────────────────────────────────────────────────── */}
      <section className="section" id="integrations" aria-labelledby="h-integrations">
        <h2 id="h-integrations">API &amp; Integrations</h2>
        <p className="lead">
          Everything works without these. They unlock fuller data. Keys stay on this device, are readable only by the extension’s background worker, and are never shown back to you.
        </p>

        <SecretRow
          name="redditClientId"
          title="Reddit client ID"
          help={
            <>
              Enables Reddit’s official API with documented rate limits. Create an “installed app” at{' '}
              <a href="https://www.reddit.com/prefs/apps" target="_blank" rel="noopener noreferrer">
                reddit.com/prefs/apps
              </a>{' '}
              and paste its client ID. (Reddit may require approval for new apps.)
            </>
          }
          placeholder="Client ID"
          status={secrets?.redditClientId}
          onChanged={(s) => {
            setSecrets(s);
            refreshStatus();
          }}
        />
        <SecretRow
          name="braveApiKey"
          title="Brave Search API key"
          help={
            <>
              Searches all of Substack (a documented search API — Substack has no public search of its own).{' '}
              <a href="https://brave.com/search/api/" target="_blank" rel="noopener noreferrer">
                Get a key
              </a>
              .
            </>
          }
          placeholder="BSA…"
          host={BRAVE_HOST}
          status={secrets?.braveApiKey}
          onChanged={(s) => {
            setSecrets(s);
            refreshStatus();
          }}
        />
        <SecretRow
          name="anthropicApiKey"
          title="Anthropic API key"
          help={
            <>
              Optional AI layer for topic extraction and “why this is relevant”. Requests go straight from this extension to api.anthropic.com.{' '}
              <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer">
                Get a key
              </a>
              .
            </>
          }
          placeholder="sk-ant-…"
          host={ANTHROPIC_HOST}
          status={secrets?.anthropicApiKey}
          onChanged={(s) => {
            setSecrets(s);
            refreshStatus();
          }}
        />

        <div className="row">
          <div className="row-text">
            <strong>Backend proxy</strong>
            <span>
              {status?.backendConfigured
                ? 'A backend URL is compiled into this build; search and AI requests can use its server-held keys.'
                : 'None configured. To keep keys off user devices entirely, deploy the small backend in /server and rebuild with VITE_BACKEND_URL.'}
            </span>
          </div>
          <span className="meta">{status?.backendConfigured ? 'Connected' : 'Not set'}</span>
        </div>
        <div className="row">
          <div className="row-text">
            <strong>Active data sources</strong>
            <span>
              Reddit: {status?.reddit.providers.join(' → ') ?? '…'} · Reading: {status?.substack.providers.join(' + ') ?? '…'}
            </span>
          </div>
          <span className="meta">v{status?.version ?? '…'}</span>
        </div>
      </section>

      {/* ── Data ───────────────────────────────────────────────────────────── */}
      <section className="section danger-zone" id="data" aria-labelledby="h-data">
        <h2 id="h-data">Your data</h2>
        <p className="lead">Remove what Rabbit Hole holds on this device.</p>
        <DataRow
          title="Clear cached data"
          help="Forgets cached Reddit results, Substack searches, page context and growth snapshots. Your settings and keys stay."
          action="Clear cache"
          onRun={async () => {
            const { removed } = await call('cache/clear');
            return `Cleared ${removed} cached ${removed === 1 ? 'item' : 'items'}.`;
          }}
        />
        <DataRow
          title="Clear all local data"
          help="Resets settings to defaults and deletes saved API keys and every cache. Chrome permissions you granted are revoked."
          action="Delete everything"
          confirm="This resets all settings and removes saved keys. Continue?"
          onRun={async () => {
            await call('data/clearAll');
            await removeOrigins([BRAVE_HOST, ANTHROPIC_HOST, ...customDomainOrigins()]);
            refreshStatus();
            return 'All local data deleted.';
          }}
        />
      </section>
    </div>
  );
}

function SecretRow({
  name,
  title,
  help,
  placeholder,
  host,
  status,
  onChanged,
}: {
  name: SecretName;
  title: string;
  help: ReactNode;
  placeholder: string;
  host?: string;
  status: SecretsStatus[SecretName] | undefined;
  onChanged: (s: SecretsStatus) => void;
}) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | undefined>();

  const save = async () => {
    setBusy(true);
    setMessage(undefined);
    try {
      if (host && !(await requestOrigins([host]))) {
        setMessage('Chrome permission was not granted, so the key was not saved.');
        return;
      }
      onChanged(await call('secrets/set', { name, value: value.trim() }));
      setValue('');
      setMessage('Saved.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'That key was not accepted.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      onChanged(await call('secrets/clear', { name }));
      if (host) await removeOrigins([host]);
      setMessage('Removed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="row stack">
      <div className="row-text">
        <strong>
          {title}{' '}
          {status?.configured && (
            <span className="meta">
              · {status.masked} ({status.origin === 'build' ? 'from build' : 'saved'})
            </span>
          )}
        </strong>
        <span>{help}</span>
      </div>
      <form
        className="field"
        style={{ display: 'flex', gap: 8 }}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={status?.configured ? 'Enter a new value to replace' : placeholder}
          aria-label={title}
          autoComplete="off"
          spellCheck={false}
        />
        <button type="submit" className="btn primary" disabled={busy || value.trim().length < 6}>
          Save
        </button>
        {status?.configured && status.origin === 'user' && (
          <button type="button" className="btn" onClick={() => void remove()} disabled={busy}>
            Remove
          </button>
        )}
      </form>
      {message && (
        <span className="meta" role="status">
          {message}
        </span>
      )}
    </div>
  );
}

function DataRow({
  title,
  help,
  action,
  confirm,
  onRun,
}: {
  title: string;
  help: string;
  action: string;
  confirm?: string;
  onRun: () => Promise<string>;
}) {
  const [message, setMessage] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  return (
    <div className="row">
      <div className="row-text">
        <strong>{title}</strong>
        <span>{message ?? help}</span>
      </div>
      <button
        type="button"
        className="btn"
        disabled={busy}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          setBusy(true);
          onRun()
            .then(setMessage)
            .catch(() => setMessage('Something went wrong — nothing was changed.'))
            .finally(() => setBusy(false));
        }}
      >
        {action}
      </button>
    </div>
  );
}
