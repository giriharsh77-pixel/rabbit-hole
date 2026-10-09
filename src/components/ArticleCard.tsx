import { memo } from 'react';
import type { RankedArticle } from '../types/substack';
import { LABEL_TEXT } from '../services/ranking/relevance';
import { formatDate } from '../utils/format';
import { safeUrl } from '../utils/sanitize';
import { ArrowRightIcon, StarIcon } from './icons';

interface Props {
  article: RankedArticle;
  onSeeReddit: (article: RankedArticle) => void;
}

export const ArticleCard = memo(function ArticleCard({ article, onSeeReddit }: Props) {
  const url = safeUrl(article.url);
  const date = formatDate(article.publishedAt);
  const strong = article.label === 'highly-relevant' || article.label === 'very-relevant';

  return (
    <li className="card" aria-label={article.title}>
      <div className="card-top">
        <span className="badge muted">Article</span>
        <span
          className="relevance"
          data-label={article.label}
          title={`Relevance ${article.relevanceScore}/100 — an internal ranking signal, not an accuracy claim`}
        >
          {strong && <StarIcon />}
          {LABEL_TEXT[article.label]}
        </span>
      </div>

      <h3 className="card-title">
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer">
            {article.title}
          </a>
        ) : (
          article.title
        )}
      </h3>

      <div className="card-sub">
        <span className="sub-link">{article.publicationName}</span>
        {article.authorName && article.authorName !== article.publicationName && <span>· {article.authorName}</span>}
        {date && <span>· {date}</span>}
      </div>

      {article.excerpt && <p className="excerpt">{article.excerpt}</p>}

      {article.matchedTopics.length > 0 && (
        <div className="tag-row" aria-label="Matched topics">
          {article.matchedTopics.map((t) => (
            <span key={t} className="chip chip-static">
              {t}
            </span>
          ))}
        </div>
      )}

      <p className="why">
        <span className="why-label">Why this is relevant{article.whyBy === 'ai' ? ' · AI' : ''}</span>
        {article.why}
      </p>

      <div className="actions">
        {url && (
          <a className="btn primary" href={url} target="_blank" rel="noopener noreferrer">
            Read on {article.provider === 'medium' ? 'Medium' : 'Substack'} <ArrowRightIcon />
          </a>
        )}
        <button type="button" className="btn" onClick={() => onSeeReddit(article)}>
          See what Reddit thinks <ArrowRightIcon />
        </button>
      </div>
    </li>
  );
});
