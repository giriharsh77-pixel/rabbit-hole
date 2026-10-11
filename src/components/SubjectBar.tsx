import type { ReactNode } from 'react';
import type { UsedInfoField } from '../types/context';
import { CloseIcon, EyeIcon } from './icons';

interface Props {
  verb: 'Watching' | 'Exploring';
  title: string;
  year?: number | undefined;
  /** e.g. ["Netflix", "Season 1, Episode 5 — Basketball"] */
  meta: string[];
  used?: UsedInfoField[];
  onDismiss?: (() => void) | undefined;
  dismissLabel?: string;
}

/** `● WATCHING  The Office — Netflix · Season 1, Episode 5` — what every tab is about. */
export function SubjectBar({ verb, title, year, meta, used = [], onDismiss, dismissLabel = 'Back to Netflix' }: Props) {
  return (
    <section className="subject-bar" aria-label={`${verb}: ${title}`}>
      <div className="subject-main">
        <div className="subject-line">
          <span className={`watching${verb === 'Watching' ? '' : ' reading'}`}>{verb}</span>
          <h2 className="subject-title">
            {title}
            {year && <span className="title-option-year num"> ({year})</span>}
          </h2>
        </div>
        {meta.length > 0 && <p className="subject-meta">{meta.filter(Boolean).join(' · ')}</p>}
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
      </div>
      {onDismiss && (
        <button type="button" className="icon-btn clear-btn" onClick={onDismiss} aria-label={dismissLabel} title={dismissLabel}>
          <CloseIcon />
        </button>
      )}
    </section>
  );
}

/** One-line notice in the subject slot when nothing is playing (or detection is off). */
export function SubjectNotice({ icon, children, actions }: { icon?: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="subject-bar notice" role="status">
      {icon && <span className="subject-icon">{icon}</span>}
      <div className="subject-main">
        <p className="subject-meta">{children}</p>
        {actions && <div className="subject-actions">{actions}</div>}
      </div>
    </section>
  );
}
