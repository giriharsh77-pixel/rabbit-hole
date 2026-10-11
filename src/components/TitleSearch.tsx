import { useEffect, useId, useState, type KeyboardEvent, type RefObject } from 'react';
import type { SerializedError } from '../types/errors';
import type { TitleCandidate } from '../types/title';
import { CloseIcon, SearchIcon } from './icons';

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Matching movies and shows (null until there is something to search). */
  results: TitleCandidate[] | undefined;
  loading: boolean;
  error: SerializedError | undefined;
  onPick: (title: TitleCandidate) => void;
  /** The last row: search Reddit and articles for the words themselves. */
  onSearchAll: (query: string) => void;
  onClear: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
}

const kindLabel = (t: TitleCandidate) => (t.kind === 'movie' ? 'Movie' : 'Series');

/**
 * `⌕ Search a movie or show…` — a combobox (WAI-ARIA 1.2 pattern).
 * ↑/↓ move, Enter picks, Esc closes (twice: clears), "/" focuses it from anywhere.
 */
export function TitleSearch({ value, onChange, results, loading, error, onPick, onSearchAll, onClear, inputRef }: Props) {
  const id = useId();
  const listId = `${id}-list`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  /** Enter pressed before results arrived: pick the first one when they do. */
  const [pending, setPending] = useState<string | null>(null);
  const q = value.trim();
  const titles = q.length >= 2 ? (results ?? []) : [];
  const rows = q.length >= 2 ? titles.length + 1 : 0; // + "search everything"
  const expanded = open && rows > 0;

  useEffect(() => setActive(0), [q, results]);
  useEffect(() => {
    if (pending === null) return;
    if (pending !== q) return setPending(null);
    if (!loading) {
      setPending(null);
      choose(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, q, loading, results]);

  const choose = (i: number) => {
    const t = titles[i];
    setOpen(false);
    if (t) onPick(t);
    else if (q.length >= 2) onSearchAll(q);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && rows > 0) {
      e.preventDefault();
      if (!open) setOpen(true);
      else setActive((a) => (a + 1) % rows);
    } else if (e.key === 'ArrowUp' && rows > 0) {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a - 1 + rows) % rows);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (q.length < 2) return;
      if (loading && titles.length === 0) setPending(q);
      else choose(expanded ? active : 0);
    } else if (e.key === 'Escape') {
      if (expanded) {
        e.preventDefault();
        setOpen(false);
      } else if (value) {
        e.preventDefault();
        onClear();
      }
    }
  };

  const optionId = (i: number) => `${id}-opt-${i}`;
  const status =
    q.length < 2 ? '' : loading && titles.length === 0 ? 'Searching…' : `${titles.length} ${titles.length === 1 ? 'title' : 'titles'} found`;

  return (
    <div className="search-wrap">
      <div className="search title-search">
        <SearchIcon />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={expanded ? optionId(active) : undefined}
          aria-label="Search a movie or show"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          placeholder="Search a movie or show…"
          autoComplete="off"
          spellCheck={false}
          maxLength={80}
        />
        <div className="search-end">
          {loading && q.length >= 2 && <span className="spinner" aria-hidden="true" />}
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
        <ul id={listId} role="listbox" aria-label="Movies and shows" className="title-list" hidden={!expanded}>
          {titles.map((t, i) => (
            <li
              key={t.qid}
              id={optionId(i)}
              role="option"
              aria-selected={i === active}
              className="title-option"
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(i)}
            >
              <span className="title-option-name">
                {t.title}
                {t.year && <span className="title-option-year num"> ({t.year})</span>}
              </span>
              <span className="title-option-meta">
                <span className={`kind-pill ${t.kind}`}>{kindLabel(t)}</span>
                {t.description && <span className="title-option-desc">{t.description}</span>}
              </span>
            </li>
          ))}
          {!loading && titles.length === 0 && !error && (
            <li className="title-empty" role="presentation">
              No movie or show called “{q}” on Wikidata.
            </li>
          )}
          {error && titles.length === 0 && (
            <li className="title-empty" role="presentation">
              Title search is unavailable right now.
            </li>
          )}
          <li
            id={optionId(titles.length)}
            role="option"
            aria-selected={active === titles.length}
            className="title-option search-all"
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => setActive(titles.length)}
            onClick={() => choose(titles.length)}
          >
            <SearchIcon width={14} height={14} />
            <span>
              Search Reddit and articles for “<strong>{q}</strong>”
            </span>
          </li>
        </ul>
        <span className="sr-only" aria-live="polite">
          {open ? status : ''}
        </span>
      </div>
    </div>
  );
}
