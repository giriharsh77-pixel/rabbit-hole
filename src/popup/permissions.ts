/** Optional host permissions, asked for only when the user turns a feature on. */
import { OUTLETS, outletOrigins } from '../services/news/outlets';

/** chrome.permissions only exists in the real extension; the UI preview just says yes. */
export async function requestOrigins(origins: string[]): Promise<boolean> {
  if (typeof chrome === 'undefined' || !chrome.permissions) return true;
  try {
    return await chrome.permissions.request({ origins });
  } catch {
    return false;
  }
}

export async function removeOrigins(origins: string[]): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.permissions) return;
  await chrome.permissions.remove({ origins }).catch(() => undefined);
}

export const NEWS_ORIGINS = outletOrigins();

/** "The Indian Express, Hindustan Times, The Hindu, The New York Times, The Guardian, Variety and 16 more" */
export function newsOutletSummary(): string {
  const lead = ['indian-express', 'hindustan-times', 'the-hindu', 'nyt', 'guardian', 'variety'].map((id) => OUTLETS.find((o) => o.id === id)?.name).filter(Boolean);
  return `${lead.join(', ')} and ${OUTLETS.length - lead.length} more`;
}
