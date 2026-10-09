import { useState, type FormEvent, type ReactNode } from 'react';
import type { SerializedError } from '../types/errors';
import { describeError, type ErrorSubject } from '../utils/errors';
import { AlertIcon, BookIcon, OfflineIcon, SearchIcon } from './icons';

export function EmptyState({
  icon,
  title,
  children,
  actions,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="state" role="status">
      <div className="state-icon">{icon ?? <BookIcon />}</div>
      <h3>{title}</h3>
      {children && <div className="state-text">{children}</div>}
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

/** A friendly, actionable error — never a stack trace. */
export function ErrorState({
  error,
  subject = 'generic',
  onRetry,
  children,
}: {
  error?: Pick<SerializedError, 'code'> | undefined;
  subject?: ErrorSubject;
  onRetry?: (() => void) | undefined;
  children?: ReactNode;
}) {
  const { title, hint } = describeError(error, subject);
  const offline = error?.code === 'NETWORK';
  return (
    <div className="state" role="alert">
      <div className="state-icon">{offline ? <OfflineIcon /> : <AlertIcon />}</div>
      <h3>{title}</h3>
      {hint && <p>{hint}</p>}
      {(onRetry || children) && (
        <div className="actions">
          {onRetry && (
            <button type="button" className="btn" onClick={onRetry}>
              Try again
            </button>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

export function Banner({
  tone = 'warn',
  children,
}: {
  tone?: 'warn' | 'info';
  children: ReactNode;
}) {
  return (
    <div className={`banner ${tone}`} role="note">
      {tone === 'info' ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.8v.1" /></svg> : <AlertIcon />}
      <div>{children}</div>
    </div>
  );
}

/** "What are you watching? [ … ] [Find related writing]" — the universal fallback. */
export function ManualSearchForm({
  label = 'What are you watching?',
  placeholder = 'e.g. Black Mirror',
  button = 'Find related writing',
  initial = '',
  onSubmit,
}: {
  label?: string;
  placeholder?: string;
  button?: string;
  initial?: string;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = value.trim();
    if (v.length >= 2) onSubmit(v);
  };
  return (
    <form className="manual" onSubmit={submit}>
      <label htmlFor="manual-search">{label}</label>
      <input
        id="manual-search"
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
      <button type="submit" className="btn primary" disabled={value.trim().length < 2}>
        <SearchIcon /> {button}
      </button>
    </form>
  );
}
