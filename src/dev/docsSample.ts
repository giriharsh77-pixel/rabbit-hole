/**
 * Neutral, ILLUSTRATIVE Reddit threads for documentation screenshots
 * (`?data=docs` in the UI preview).  These are invented, not real posts — the
 * report and the UI flow caption them as sample data.  Dev-only; not shipped.
 */
import type { RedditPost } from '../types/reddit';

interface Seed {
  sub: string;
  title: string;
  hoursAgo: number;
  self?: string;
  domain?: string;
  flair?: string;
}

const SEEDS: Seed[] = [
  { sub: 'technology', title: 'Open-source coding model closes the gap with proprietary systems on a new benchmark', hoursAgo: 1.6, domain: 'example.org' },
  { sub: 'MachineLearning', title: '[D] How are teams evaluating AI agents beyond simple pass/fail benchmarks?', hoursAgo: 2.4, self: 'Curious what people use in practice: trace-level review, task-completion rubrics, or cost-adjusted scores? We have been trying a mix and would love to compare notes.', flair: 'Discussion' },
  { sub: 'programming', title: 'The case for boring technology: lessons from ten years of running a small platform', hoursAgo: 3.1, domain: 'example.org' },
  { sub: 'science', title: 'Researchers report a new method for mapping neural connections in fruit-fly brains', hoursAgo: 4.2, domain: 'example.org' },
  { sub: 'Futurology', title: 'What happens to junior developer roles when coding agents become routine?', hoursAgo: 2.9, self: 'Not asking whether jobs disappear, but how the first rung of the ladder changes: mentorship, code review, and the kinds of tasks juniors learn from.' },
  { sub: 'space', title: 'Orbital imaging reveals seasonal changes on a distant dwarf planet', hoursAgo: 6.3, domain: 'example.org' },
  { sub: 'gaming', title: 'Studio confirms a long-awaited sequel with a 2027 release window', hoursAgo: 1.1, domain: 'example.org' },
  { sub: 'movies', title: 'Behind the scenes: how practical effects were blended with AI-assisted compositing', hoursAgo: 5.4, domain: 'example.org' },
  { sub: 'television', title: 'Season finale discussion thread: that ending, explained', hoursAgo: 0.8, self: 'Spoilers ahead. Let us piece together the final scene and the three possible readings of the last line of dialogue.', flair: 'Discussion' },
  { sub: 'investing', title: 'Index funds vs. individual picks: what ten years of data shows', hoursAgo: 7.5, domain: 'example.org' },
  { sub: 'startups', title: 'We reached $1M ARR with a two-person team — what we would do differently', hoursAgo: 9.2, self: 'Long post on pricing experiments, the first ten customers, and the one channel that actually worked for us.' },
  { sub: 'cybersecurity', title: 'Browser vendors coordinate on a new privacy protection for extensions', hoursAgo: 3.8, domain: 'example.org' },
  { sub: 'OpenAI', title: 'Release notes: what changed in the latest reasoning update', hoursAgo: 2.0, domain: 'example.org' },
  { sub: 'LocalLLaMA', title: 'Running a 70B model on a single consumer GPU: a practical quantization guide', hoursAgo: 4.9, self: 'Step-by-step notes, memory numbers and the settings that mattered. Benchmarks included at the bottom.', flair: 'Guide' },
  { sub: 'askscience', title: 'Why do we get tired of a song after hearing it repeatedly?', hoursAgo: 11.6, self: 'Is there a neuroscience explanation for habituation to music, and why some songs resist it?' },
  { sub: 'personalfinance', title: 'A free spreadsheet template for tracking net worth over time', hoursAgo: 12.8, domain: 'example.org' },
  { sub: 'technology', title: 'Chipmakers report strong demand for AI accelerators in quarterly results', hoursAgo: 5.9, domain: 'example.org' },
  { sub: 'science', title: 'Study links regular sleep schedules to better memory consolidation', hoursAgo: 8.4, domain: 'example.org' },
  { sub: 'gadgets', title: 'Hands-on: a lightweight e-ink laptop that lasts a full week', hoursAgo: 10.1, domain: 'example.org' },
  { sub: 'artificial', title: 'Why “agentic” workflows need better observability, not just better models', hoursAgo: 3.4, self: 'A short essay on logging, replay and human review for long-running agents.' },
];

export function docsRedditPosts(now: number = Date.now()): RedditPost[] {
  return SEEDS.map((s, i): RedditPost => {
    const id = `docs${String(i).padStart(2, '0')}x`;
    const permalink = `https://www.reddit.com/r/${s.sub}/comments/${id}/sample_thread/`;
    const post: RedditPost = {
      id,
      title: s.title,
      subreddit: s.sub,
      author: 'sample_user',
      permalink,
      preview: s.self ?? (s.domain ? `Link · ${s.domain}` : ''),
      isSelf: !!s.self,
      numCrossposts: i % 7 === 0 ? 2 : 0,
      createdUtc: Math.floor(now / 1000 - s.hoursAgo * 3600),
      over18: false,
      stickied: false,
      feeds: ['hot'],
      rank: i,
    };
    if (!s.self) {
      post.url = `https://example.org/story-${i}`;
      post.domain = s.domain ?? 'example.org';
    }
    if (s.flair) post.flair = s.flair;
    return post;
  });
}
