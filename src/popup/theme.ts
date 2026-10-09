import type { ThemeMode } from '../types/settings';

const HINT_KEY = 'rh-theme';

/** Applies the theme to <html> and keeps it in sync with the OS when set to "system". */
export function applyTheme(mode: ThemeMode): () => void {
  const root = document.documentElement;
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const apply = () => {
    const resolved = mode === 'system' ? (mq.matches ? 'dark' : 'light') : mode;
    root.dataset.theme = resolved;
  };
  apply();
  try {
    localStorage.setItem(HINT_KEY, mode);
  } catch {
    /* storage can be unavailable; the hint is only a flash-of-wrong-theme optimisation */
  }
  if (mode === 'system') {
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }
  return () => undefined;
}

/** Called before first paint so light-theme users never see a dark flash. */
export function applyThemeHint(): void {
  let mode: ThemeMode = 'dark';
  try {
    const hint = localStorage.getItem(HINT_KEY);
    if (hint === 'light' || hint === 'dark' || hint === 'system') mode = hint;
  } catch {
    /* ignore */
  }
  const dark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}
