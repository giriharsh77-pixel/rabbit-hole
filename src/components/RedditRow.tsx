import { memo } from 'react';
import type { ScoredRedditPost } from '../types/reddit';
import { formatCount, timeAgo } from '../utils/format';
import { safeRedditUrl } from '../utils/sanitize';
import { CommentIcon, UpIcon } from './icons';

/** A one-line thread link, used where space is tight ("Because you're watching"). */
export const RedditRow = memo(function RedditRow({ post, now }: { post: ScoredRedditPost; now: number }) {
  const href = safeRedditUrl(post.permalink);
  const hasStats = !post.statsEstimated;
  const body = (
    <>
      <span className="row-link-title">{post.title}</span>
      <span className="row-link-meta">
        <span className="sub-link">r/{post.subreddit}</span>
        {hasStats && (
          <>
            <span className="stat up num" aria-label={`${post.score ?? 0} upvotes`}>
              <UpIcon /> {formatCount(post.score)}
            </span>
            <span className="stat num" aria-label={`${post.numComments ?? 0} comments`}>
              <CommentIcon /> {formatCount(post.numComments)}
            </span>
          </>
        )}
        <span>{timeAgo(post.createdUtc, now)}</span>
      </span>
    </>
  );
  return (
    <li>
      {href ? (
        <a className="row-link" href={href} target="_blank" rel="noopener noreferrer">
          {body}
        </a>
      ) : (
        <div className="row-link">{body}</div>
      )}
    </li>
  );
});
