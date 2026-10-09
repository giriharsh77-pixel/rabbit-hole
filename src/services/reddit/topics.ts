/**
 * Topic filters for the Trending tab.  Each maps to a multireddit (a single
 * request covers all its subreddits), so adding a category later is just
 * adding a row here.
 */
import type { TopicFilter } from '../../types/reddit';

export const CUSTOM_TOPIC_ID = 'custom';

export const TOPIC_FILTERS: readonly TopicFilter[] = [
  { id: 'all', label: 'All Reddit', emoji: '🌐', subreddits: [] },
  {
    id: 'technology',
    label: 'Technology',
    emoji: '💻',
    subreddits: ['technology', 'gadgets', 'Futurology', 'programming', 'cybersecurity', 'apple', 'Android'],
  },
  {
    id: 'business',
    label: 'Business',
    emoji: '💼',
    subreddits: ['business', 'entrepreneur', 'startups', 'Economics', 'smallbusiness', 'marketing'],
  },
  {
    id: 'ai',
    label: 'AI',
    emoji: '🤖',
    subreddits: ['artificial', 'MachineLearning', 'OpenAI', 'singularity', 'LocalLLaMA', 'ClaudeAI', 'ChatGPT'],
  },
  {
    id: 'science',
    label: 'Science',
    emoji: '🔬',
    subreddits: ['science', 'space', 'askscience', 'Physics', 'biology', 'EverythingScience'],
  },
  {
    id: 'gaming',
    label: 'Gaming',
    emoji: '🎮',
    subreddits: ['gaming', 'Games', 'pcgaming', 'PS5', 'nintendo', 'gamedev'],
  },
  {
    id: 'movies-tv',
    label: 'Movies & TV',
    emoji: '🎬',
    subreddits: ['movies', 'television', 'netflix', 'MovieDetails', 'boxoffice', 'anime'],
  },
  {
    id: 'sports',
    label: 'Sports',
    emoji: '🏅',
    subreddits: ['sports', 'nba', 'soccer', 'nfl', 'formula1', 'cricket', 'tennis'],
  },
  {
    id: 'finance',
    label: 'Finance',
    emoji: '📈',
    subreddits: ['finance', 'investing', 'stocks', 'personalfinance', 'wallstreetbets', 'CryptoCurrency'],
  },
  {
    id: 'world-news',
    label: 'World News',
    emoji: '🌍',
    subreddits: ['worldnews', 'news', 'geopolitics', 'europe', 'inthenews'],
  },
  { id: CUSTOM_TOPIC_ID, label: 'Custom', emoji: '⭐', subreddits: [] },
];

export function findTopic(id: string): TopicFilter {
  return TOPIC_FILTERS.find((t) => t.id === id) ?? TOPIC_FILTERS[0]!;
}

/** Subreddits to query for a topic.  `custom` uses the user's preferred list. */
export function subredditsFor(topicId: string, preferred: readonly string[]): string[] {
  if (topicId === CUSTOM_TOPIC_ID) return [...preferred];
  return [...findTopic(topicId).subreddits];
}
