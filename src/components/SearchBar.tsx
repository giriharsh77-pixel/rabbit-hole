import type { KeyboardEvent, RefObject } from 'react';
import { CloseIcon, SearchIcon } from './icons';

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onClear: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
}

/** `⌕ Search Reddit, Substack or Medium…` — "/" focuses it, Enter searches now, Esc clears. */
export function SearchBar({ value, onChange, onSubmit, onClear, inputRef }: Props) {
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onSubmit(value);
    } else if (e.key === 'Escape' && value) {
      e.preventDefault();
      onClear();
    }
  };

  return (
    <div className="search-wrap">
      <div className="search" role="search">
        <SearchIcon />
        <input
          ref={inputRef}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search Reddit, Substack or Medium…"
          aria-label="Search Reddit, Substack or Medium"
          autoComplete="off"
          spellCheck={false}
          maxLength={120}
        />
        <div className="search-end">
          {value ? (
            <button type="button" className="icon-btn clear-btn" onClick={onClear} aria-label="Clear search">
              <CloseIcon />
            </button>
          ) : (
            <span className="kbd" aria-hidden="true">
              /
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
