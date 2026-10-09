/** Runs on reddit.com: reports the open thread's title/subreddit on request. */
import { extractReddit } from '../services/context/extractors/reddit';
import { registerExtractor } from './runtime';

registerExtractor(extractReddit);
