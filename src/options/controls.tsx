import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { CloseIcon } from '../components/icons';

export function Row({
  title,
  help,
  children,
  stack = false,
}: {
  title: string;
  help?: ReactNode;
  children: ReactNode;
  stack?: boolean;
}) {
  return (
    <div className={`row${stack ? ' stack' : ''}`}>
      <div className="row-text">
        <strong>{title}</strong>
        {help && <span>{help}</span>}
      </div>
      <div className={`row-control${stack ? ' wide' : ''}`}>{children}</div>
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      className="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    />
  );
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onCommit,
  label,
  format = String,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onCommit: (v: number) => void;
  label: string;
  format?: (v: number) => string;
}) {
  const [draft, setDraft] = useState<number | undefined>();
  const shown = draft ?? value;
  return (
    <div className="range-wrap">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={shown}
        aria-label={label}
        onChange={(e) => setDraft(Number(e.target.value))}
        onPointerUp={() => {
          if (draft !== undefined) onCommit(draft);
          setDraft(undefined);
        }}
        onKeyUp={() => {
          if (draft !== undefined) onCommit(draft);
          setDraft(undefined);
        }}
      />
      <span className="range-value num">{format(shown)}</span>
    </div>
  );
}

export function RadioGroup<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="radio-group" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Chip-style list editor: Enter / comma adds, Backspace on empty removes the last. */
export function TagInput({
  values,
  onChange,
  placeholder,
  label,
  prefix = '',
  max = 20,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  label: string;
  prefix?: string;
  max?: number;
}) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim().replace(/,+$/, '');
    if (!v) return;
    if (!values.some((x) => x.toLowerCase() === v.toLowerCase()) && values.length < max) onChange([...values, v]);
    setDraft('');
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add();
    } else if (e.key === 'Backspace' && !draft && values.length) {
      onChange(values.slice(0, -1));
    }
  };
  return (
    <div className="tag-input">
      {values.map((v) => (
        <span key={v} className="chip">
          {prefix}
          {v}
          <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))}>
            <CloseIcon width={10} height={10} />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        onBlur={add}
        placeholder={values.length ? '' : placeholder}
        aria-label={label}
        maxLength={60}
        autoComplete="off"
        spellCheck={false}
      />
    </div>
  );
}
