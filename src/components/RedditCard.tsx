import { memo } from 'react';
import type { RedditCategoryId, ScoredRedditPost } from '../types/reddit';
import { formatCount, timeAgo } from '../utils/format';
import { safeImageUrl, safeRedditUrl } from '../utils/sanitize';
import { ArrowRightIcon, CommentIcon, UpIcon } from './icons';

export type CardBadge = RedditCategoryId | 'search';

const BADGES: Record<CardBadge, string> = {
  hot: '🔥 Trending',
  rising: '📈 Rising',
  discussed: '💬 Discussed',
  across: '🌎 Across Reddit',
  search: '🔎 Related thread',
};

interface Props {
  post: ScoredRedditPost;
  badge: CardBadge;
  showThumbnail: boolean;
  /** Called by "Find deeper reading →". */
  onFindReading: (post: ScoredRedditPost) => void;
  now: number;
}

export const RedditCard = memo(function RedditCard({ post, badge, showThumbnail, onFindReading, now }: Props) {
  const thread = safeRedditUrl(post.permalink);
  const subredditUrl = safeRedditUrl(`https://www.reddit.com/r/${post.subreddit}/`);
  const thumb = showThumbnail ? safeImageUrl(post.thumbnail) : undefined;
  const hasStats = !post.statsEstimated;
  const delta = post.delta && post.delta.score > 0 ? post.delta : undefined;

  return (
    <li className="card" aria-label={post.title}>
      <div className="card-top">
        <span className="badge">{BADGES[badge]}</span>
        <span className="meta">{timeAgo(post.createdUtc, now)}</span>
      </div>

      <h3 className="card-title">
        {thread ? (
          <a href={thread} target="_blank" rel="noopener noreferrer">
            {post.title}
          </a>
        ) : (
          post.title
        )}
      </h3>

      <div className="card-sub">
        {subredditUrl ? (
          <a className="sub-link" href={subredditUrl} target="_blank" rel="noopener noreferrer">
            r/{post.subreddit}
          </a>
        ) : (
          <span className="sub-link">r/{post.subreddit}</span>
        )}
        {post.flair && <span>· {post.flair}</span>}
        {post.crossSubredditCount > 0 && <span>· also in {post.crossSubredditCount} other {post.crossSubredditCount === 1 ? 'community' : 'communities'}</span>}
      </div>

      <div className="card-body">
        <div>
          {post.preview && <p className="preview">{post.preview}</p>}

          <div className="stats">
            {hasStats ? (
              <>
                <span className="stat up num" aria-label={`${post.score ?? 0} upvotes`}>
                  <UpIcon /> {formatCount(post.score)}
                </span>
                <span className="stat num" aria-label={`${post.numComments ?? 0} comments`}>
                  <CommentIcon /> {formatCount(post.numComments)}
                </span>
              </>
            ) : (
              <span className="meta">Live counts aren’t available from Reddit’s public feed</span>
            )}
            <span className="growth" data-level={post.growth}>
              {post.growthLabel}
              {delta && (
                <span className="delta num">
                  {' '}
                  · +{formatCount(delta.score)} in {Math.max(1, Math.round(delta.minutes))}m
                </span>
              )}
            </span>
          </div>
        </div>
        {thumb && <img className="thumb" src={thumb} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />}
      </div>

      <div className="actions">
        {thread && (
          <a className="btn primary" href={thread} target="_blank" rel="noopener noreferrer">
            Open Reddit <ArrowRightIcon />
          </a>
        )}
        <button type="button" className="btn" onClick={() => onFindReading(post)}>
          Find deeper reading <ArrowRightIcon />
        </button>
      </div>
    </li>
  );
});
