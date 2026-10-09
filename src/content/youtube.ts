/** Runs on youtube.com: answers "what is playing?" on request, nothing else. */
import { extractYouTube } from '../services/context/extractors/youtube';
import { registerExtractor } from './runtime';

registerExtractor(extractYouTube);
