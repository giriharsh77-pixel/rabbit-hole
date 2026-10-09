import type { ContentContext, UsedInfoField } from '../types/context';
import { platformLabel } from '../services/context/platform';
import { CloseIcon, EyeIcon } from './icons';

interface Props {
  context: ContentContext;
  used?: UsedInfoField[];
  /** "Watching" for video/film, "Reading" for threads and articles. */
  verb?: 'Watching' | 'Reading' | 'Exploring';
  onDismiss?: (() => void) | undefined;
}

/** `● Watching — <title> — YouTube · Fireship` */
export function ContextBar({ context, used = [], verb = 'Watching', onDismiss }: Props) {
  const source = [
    platformLabel(context.platform),
    context.platform === 'reddit' && context.subreddit ? `r/${context.subreddit}` : context.creator,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <section className="context-bar" aria-label={`Currently ${verb.toLowerCase()}`}>
      <div className="context-head">
        <span className={`watching${verb === 'Watching' ? '' : ' reading'}`}>{verb}</span>
        {onDismiss && (
          <button type="button" className="icon-btn clear-btn" onClick={onDismiss} aria-label="Dismiss and return to the current page">
            <CloseIcon />
          </button>
        )}
      </div>
      <h2 className="context-title">{context.title}</h2>
      <p className="context-source">{source}</p>
      {context.episode && <p className="context-source">{context.episode}</p>}

      {used.length > 0 && (
        <details className="used">
          <summary>
            <EyeIcon width={13} height={13} /> What Rabbit Hole used
          </summary>
          <dl>
            {used.map((f) => (
              <div key={f.label} style={{ display: 'contents' }}>
                <dt>{f.label}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </section>
  );
}
