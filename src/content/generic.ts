/**
 * Generic page reader.  Statically present only on *.substack.com; on every
 * other site it is injected on demand (activeTab) when the user clicks
 * "Use this page" — never automatically.
 */
import { extractGeneric } from '../services/context/extractors/generic';
import { registerExtractor } from './runtime';

registerExtractor(extractGeneric);
