/** Shared by the extension and the backend: does an article really name a movie / show? */
import type { ArticleCandidate } from '../../types/substack';
import { normalizeText } from '../../utils/text';
import { searchName } from '../reddit/aboutTitle';

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Does this article name the title?  Entertainment desks write titles in quotes
 * (‘The Office’, "RRR"); otherwise it must be written as a name or sit next to
 * one of the cast.  "Back to the office" never counts.
 */
export function namesTitle(title: string, people: readonly string[], article: Pick<ArticleCandidate, 'title' | 'excerpt'>): boolean {
  const name = searchName(title).trim();
  if (!name) return false;
  const raw = `${article.title} ${article.excerpt}`;
  const norm = ` ${normalizeText(raw)} `;
  if (!norm.includes(` ${normalizeText(name)} `)) return false;
  const quoted = new RegExp(`[‘'"“]${escapeRe(name)}[’'"”:,]`, 'iu').test(raw);
  if (quoted) return true;
  const multiword = name.includes(' ');
  const capitalised = new RegExp(`(^|[^\\p{L}])${escapeRe(name)}($|[^\\p{L}])`, 'u').test(raw);
  if ((multiword || /^[A-Z0-9]{3,}$/.test(name)) && capitalised) return true;
  return people.some((p) => p.includes(' ') && norm.includes(` ${normalizeText(p)} `));
}

