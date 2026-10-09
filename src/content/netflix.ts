/**
 * Runs on netflix.com: answers "what is playing?" on request, nothing else.
 * Reads only visible player labels / public title metadata — never the video,
 * DRM, network streams or credentials.
 */
import { extractNetflix } from '../services/context/extractors/netflix';
import { registerExtractor } from './runtime';

registerExtractor((doc, url) => extractNetflix(doc, url));
