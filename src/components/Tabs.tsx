import { useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface TabDef<T extends string> {
  id: T;
  label: string;
  count?: number | undefined;
  /** Small attention dot (e.g. something is playing on the page). */
  dot?: boolean | undefined;
}

interface Props<T extends string> {
  tabs: readonly TabDef<T>[];
  /** `null` while the initial tab is still being decided. */
  value: T | null;
  onChange: (id: T) => void;
  idPrefix: string;
}

/** Accessible tablist (roving tabindex, ←/→/Home/End) with an animated indicator. */
export function Tabs<T extends string>({ tabs, value, onChange, idPrefix }: Props<T>): ReactNode {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const found = tabs.findIndex((t) => t.id === value);
  const index = Math.max(0, found);

  const onKeyDown = (e: KeyboardEvent) => {
    let next = index;
    if (e.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    else return;
    e.preventDefault();
    const target = tabs[next];
    if (target) {
      onChange(target.id);
      refs.current[next]?.focus();
    }
  };

  return (
    <div className={`tabs${found < 0 ? ' undecided' : ''}`} role="tablist" aria-label="Rabbit Hole sections" onKeyDown={onKeyDown} style={{ ['--i' as string]: index }}>
      {tabs.map((t, i) => (
        <button
          key={t.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          id={`${idPrefix}-tab-${t.id}`}
          role="tab"
          type="button"
          className="tab"
          aria-selected={t.id === value}
          aria-controls={`${idPrefix}-panel-${t.id}`}
          tabIndex={t.id === value || (found < 0 && i === 0) ? 0 : -1}
          onClick={() => onChange(t.id)}
        >
          {t.dot && <span className="tab-dot" aria-label="Active on this page" />}
          {t.label}
          {t.count !== undefined && t.count > 0 && <span className="tab-count num">{t.count}</span>}
        </button>
      ))}
      <span className="tab-indicator" aria-hidden="true" />
    </div>
  );
}
