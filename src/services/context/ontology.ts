/**
 * A small hand-written concept graph used to broaden what we search for.
 *
 * "AI agents" → also look for "AI coding", "developer tools", "automation" …
 *
 * This is the on-device stand-in for LLM concept expansion.  It is data, not
 * logic: extend it freely.  Keys are matched on *stems* (see utils/text.ts), so
 * "startup" also matches "startups".  When the optional AI layer is enabled it
 * supersedes these expansions with model-generated concepts.
 */
import { phraseKey } from '../../utils/text';

type Table = Record<string, string[]>;

const TECH: Table = {
  'ai agents': ['autonomous agents', 'AI automation', 'AI coding', 'developer tools', 'agentic workflows'],
  agentic: ['AI agents', 'AI automation', 'autonomous systems'],
  openai: ['frontier AI', 'AI models', 'AI industry', 'model competition', 'reasoning models'],
  chatgpt: ['OpenAI', 'large language models', 'generative AI', 'AI assistants'],
  gpt: ['OpenAI', 'large language models', 'AI models'],
  claude: ['Anthropic', 'large language models', 'AI assistants', 'AI safety'],
  anthropic: ['Claude', 'AI safety', 'frontier AI', 'AI industry'],
  gemini: ['Google', 'AI models', 'large language models', 'multimodal AI'],
  deepseek: ['open-weight models', 'AI models', 'China AI', 'AI competition'],
  llm: ['large language models', 'generative AI', 'AI models', 'machine learning'],
  'large language model': ['LLMs', 'generative AI', 'AI models', 'machine learning'],
  'generative ai': ['large language models', 'AI tools', 'creative AI', 'AI industry'],
  'artificial intelligence': ['machine learning', 'AI industry', 'AI policy', 'automation'],
  'machine learning': ['deep learning', 'AI research', 'data science', 'neural networks'],
  'deep learning': ['neural networks', 'machine learning', 'AI research'],
  'neural network': ['deep learning', 'machine learning', 'AI research'],
  'ai safety': ['AI alignment', 'AI policy', 'AI risk', 'AI governance'],
  agi: ['artificial general intelligence', 'AI timelines', 'AI safety', 'frontier AI'],
  'vibe coding': ['AI coding', 'developer tools', 'software development', 'AI agents'],
  'ai coding': ['developer tools', 'software development', 'AI agents', 'programming'],
  copilot: ['AI coding', 'developer tools', 'software development'],
  cursor: ['AI coding', 'developer tools', 'AI agents'],
  'prompt engineering': ['large language models', 'AI tools', 'AI workflows'],
  robotics: ['automation', 'humanoid robots', 'AI', 'manufacturing'],
  'self-driving': ['autonomous vehicles', 'Waymo', 'Tesla', 'AI'],
  tesla: ['electric vehicles', 'autonomous vehicles', 'Elon Musk', 'self-driving'],
  nvidia: ['GPUs', 'AI hardware', 'semiconductors', 'AI infrastructure', 'datacenters'],
  gpu: ['AI hardware', 'Nvidia', 'semiconductors', 'AI infrastructure'],
  semiconductor: ['chips', 'TSMC', 'supply chains', 'geopolitics', 'Nvidia'],
  tsmc: ['semiconductors', 'Taiwan', 'chip manufacturing', 'supply chains'],
  'quantum computing': ['quantum computers', 'cryptography', 'physics', 'computing'],
  cybersecurity: ['hacking', 'data breaches', 'privacy', 'security'],
  privacy: ['surveillance', 'data protection', 'tech policy'],
  surveillance: ['privacy', 'civil liberties', 'technology and society'],
  'social media': ['algorithms', 'attention economy', 'platforms', 'digital culture'],
  algorithm: ['recommendation systems', 'social media', 'machine learning'],
  tiktok: ['social media', 'short-form video', 'platform policy', 'China tech'],
  'elon musk': ['Tesla', 'SpaceX', 'X (Twitter)', 'tech industry'],
  apple: ['iPhone', 'Apple Intelligence', 'consumer technology', 'big tech'],
  google: ['search', 'big tech', 'AI', 'antitrust'],
  microsoft: ['Azure', 'OpenAI', 'enterprise software', 'big tech'],
  'software development': ['software engineering', 'programming', 'developer productivity', 'developer tools'],
  'software engineering': ['programming', 'software development', 'engineering management', 'developer tools'],
  programming: ['software development', 'coding', 'developer tools', 'computer science'],
  python: ['programming', 'data science', 'machine learning', 'software development'],
  javascript: ['web development', 'programming', 'frontend', 'Node.js'],
  typescript: ['JavaScript', 'web development', 'programming'],
  react: ['frontend', 'JavaScript', 'web development'],
  kubernetes: ['cloud infrastructure', 'devops', 'containers', 'software engineering'],
  devops: ['cloud infrastructure', 'software engineering', 'automation'],
  'open source': ['software development', 'developer communities', 'licensing'],
  startup: ['venture capital', 'entrepreneurship', 'product-market fit', 'founders'],
  'venture capital': ['startups', 'investing', 'funding', 'entrepreneurship'],
  saas: ['software business', 'startups', 'enterprise software', 'subscriptions'],
  'product management': ['product strategy', 'startups', 'software development', 'user research'],
  layoffs: ['tech industry', 'labor market', 'careers', 'economy'],
  'remote work': ['future of work', 'productivity', 'careers', 'workplace culture'],
};

const FINANCE_POLITICS: Table = {
  'stock market': ['investing', 'markets', 'economy', 'interest rates'],
  bitcoin: ['cryptocurrency', 'digital assets', 'markets', 'blockchain'],
  crypto: ['bitcoin', 'blockchain', 'digital assets', 'regulation'],
  cryptocurrency: ['bitcoin', 'blockchain', 'digital assets', 'regulation'],
  ethereum: ['cryptocurrency', 'blockchain', 'smart contracts'],
  inflation: ['economy', 'interest rates', 'cost of living', 'monetary policy'],
  'interest rate': ['Federal Reserve', 'inflation', 'monetary policy', 'economy'],
  'federal reserve': ['interest rates', 'monetary policy', 'inflation', 'economy'],
  recession: ['economy', 'unemployment', 'markets', 'monetary policy'],
  'housing market': ['real estate', 'interest rates', 'affordability', 'economy'],
  'real estate': ['housing market', 'investing', 'mortgage rates'],
  investing: ['markets', 'index funds', 'personal finance', 'portfolio'],
  tariff: ['trade war', 'international trade', 'economy', 'supply chains'],
  'trade war': ['tariffs', 'China', 'supply chains', 'geopolitics'],
  'wall street': ['markets', 'finance', 'banking', 'investing'],
  ukraine: ['Russia', 'war', 'geopolitics', 'Europe', 'NATO'],
  russia: ['Ukraine', 'geopolitics', 'sanctions', 'Europe'],
  china: ['geopolitics', 'trade', 'technology competition', 'Asia'],
  taiwan: ['China', 'semiconductors', 'geopolitics', 'TSMC'],
  gaza: ['Middle East', 'Israel', 'humanitarian crisis', 'geopolitics'],
  election: ['politics', 'democracy', 'voting', 'polling'],
  democracy: ['politics', 'institutions', 'elections', 'governance'],
  immigration: ['policy', 'border', 'labor', 'politics'],
  india: ['South Asia', 'economy', 'politics', 'technology'],
  'european union': ['Europe', 'regulation', 'policy', 'trade'],
  nato: ['geopolitics', 'defense', 'Europe', 'Russia'],
};

const SCIENCE_HEALTH: Table = {
  'climate change': ['global warming', 'renewable energy', 'climate policy', 'emissions'],
  'renewable energy': ['solar power', 'wind power', 'energy transition', 'climate change'],
  solar: ['renewable energy', 'energy transition', 'batteries'],
  nuclear: ['nuclear energy', 'energy policy', 'geopolitics'],
  fusion: ['nuclear fusion', 'energy', 'physics'],
  nasa: ['space exploration', 'spaceflight', 'science'],
  spacex: ['space exploration', 'rockets', 'Starship', 'Elon Musk'],
  'space exploration': ['NASA', 'SpaceX', 'spaceflight', 'astronomy'],
  mars: ['space exploration', 'NASA', 'SpaceX', 'planetary science'],
  'black hole': ['astrophysics', 'physics', 'cosmology', 'space'],
  physics: ['science', 'cosmology', 'quantum mechanics', 'research'],
  quantum: ['quantum physics', 'quantum computing', 'physics'],
  crispr: ['gene editing', 'biotechnology', 'genetics', 'medicine'],
  longevity: ['aging', 'health', 'biotechnology', 'medicine'],
  neuroscience: ['brain', 'psychology', 'cognition', 'science'],
  psychology: ['behavior', 'mental health', 'neuroscience', 'society'],
  vaccine: ['public health', 'medicine', 'immunology', 'pandemic'],
  pandemic: ['public health', 'epidemiology', 'covid-19', 'policy'],
  evolution: ['biology', 'genetics', 'science', 'anthropology'],
  'mental health': ['psychology', 'wellbeing', 'therapy', 'society'],
  nutrition: ['diet', 'health', 'metabolism', 'science'],
  sleep: ['health', 'neuroscience', 'productivity', 'wellbeing'],
  fitness: ['exercise', 'health', 'strength training', 'wellbeing'],
};

const CULTURE: Table = {
  'black mirror': [
    'dystopian fiction',
    'technology and society',
    'surveillance',
    'artificial intelligence',
    'digital culture',
    'science fiction',
  ],
  'star wars': ['science fiction', 'franchises', 'Disney', 'fandom'],
  marvel: ['superhero films', 'Disney', 'franchises', 'blockbusters'],
  netflix: ['streaming', 'television', 'media industry', 'entertainment'],
  streaming: ['media industry', 'television', 'entertainment', 'subscriptions'],
  hollywood: ['film industry', 'entertainment', 'studios', 'box office'],
  anime: ['Japanese animation', 'manga', 'fandom', 'pop culture'],
  'video game': ['gaming industry', 'game design', 'esports', 'culture'],
  gaming: ['video games', 'game design', 'esports', 'industry'],
  esports: ['gaming', 'competitive gaming', 'streaming', 'industry'],
  music: ['music industry', 'streaming', 'artists', 'culture'],
  podcast: ['media', 'creators', 'audio', 'attention economy'],
  'formula 1': ['motorsport', 'racing', 'sports business', 'engineering'],
  soccer: ['football', 'premier league', 'transfers', 'sports'],
  nba: ['basketball', 'sports', 'analytics', 'league'],
  cricket: ['sports', 'IPL', 'test cricket', 'India'],
  nfl: ['American football', 'sports', 'analytics', 'league'],
  olympics: ['sports', 'athletics', 'international competition'],
  chess: ['strategy', 'games', 'artificial intelligence'],
};

/** Genres (Netflix `genre`, YouTube category, JSON-LD) → themes writers actually discuss. */
export const GENRE_CONCEPTS: Table = {
  'sci-fi': ['science fiction', 'speculative fiction', 'technology and society', 'future society'],
  'science fiction': ['speculative fiction', 'technology and society', 'future society', 'worldbuilding'],
  dystopian: ['dystopian fiction', 'authoritarianism', 'surveillance', 'future society'],
  thriller: ['suspense', 'psychological thriller', 'crime fiction'],
  crime: ['true crime', 'criminal justice', 'crime fiction', 'policing'],
  'true crime': ['criminal justice', 'investigative journalism', 'crime', 'society'],
  documentary: ['nonfiction', 'investigative journalism', 'society', 'history'],
  horror: ['horror fiction', 'psychological horror', 'genre film'],
  comedy: ['humor', 'satire', 'culture', 'television'],
  drama: ['character study', 'television', 'storytelling'],
  romance: ['relationships', 'love', 'storytelling'],
  fantasy: ['fantasy fiction', 'worldbuilding', 'mythology', 'storytelling'],
  reality: ['reality television', 'media', 'culture', 'celebrity'],
  historical: ['history', 'period drama', 'historical fiction'],
  war: ['military history', 'conflict', 'geopolitics'],
  biopic: ['biography', 'history', 'film'],
  mystery: ['detective fiction', 'whodunit', 'crime fiction'],
  action: ['action cinema', 'blockbusters', 'film'],
  animation: ['animated film', 'storytelling', 'art'],
  anime: ['Japanese animation', 'manga', 'pop culture'],
  food: ['food culture', 'cooking', 'restaurants', 'nutrition'],
  psychological: ['psychology', 'human behavior', 'the mind'],
  'coming of age': ['adolescence', 'young adult', 'growing up'],
  'science & technology': ['technology', 'science', 'innovation'],
  education: ['learning', 'teaching', 'education'],
  gaming: ['video games', 'game design', 'industry'],
  'news & politics': ['politics', 'current events', 'policy'],
};

export const ONTOLOGY: Table = { ...TECH, ...FINANCE_POLITICS, ...SCIENCE_HEALTH, ...CULTURE };

/** Generic acronyms that describe a field rather than name a thing. */
export const GENERIC_ACRONYMS: ReadonlySet<string> = new Set([
  'AI', 'LLM', 'LLMS', 'GPU', 'GPUS', 'CPU', 'API', 'APIS', 'UI', 'UX', 'ML', 'TV', 'VR', 'AR', 'IT', 'QA', 'PC', 'OS', 'USA', 'US', 'UK', 'EU', 'CEO', 'CTO', 'SEO', 'DIY', 'FAQ', 'HD', 'ASMR', 'AMA', 'ELI5',
]);

/** Single words too vague to search on their own. */
export const VAGUE_SINGLE_WORDS: ReadonlySet<string> = new Set([
  'model', 'models', 'game', 'games', 'story', 'world', 'life', 'work', 'future', 'power', 'system', 'systems', 'story', 'season', 'series', 'movie', 'film', 'show', 'show', 'news', 'update', 'story', 'internet', 'online', 'tech', 'data', 'code', 'free', 'money', 'online', 'story', 'plan', 'case', 'study', 'problem', 'problems', 'question', 'questions', 'answer', 'answers', 'idea', 'ideas', 'secret', 'secrets', 'truth', 'story', 'history', 'future',
]);

interface IndexedEntry {
  key: string;
  stemKey: string;
  related: string[];
}

let index: IndexedEntry[] | undefined;

function buildIndex(): IndexedEntry[] {
  index ??= Object.entries(ONTOLOGY).map(([key, related]) => ({ key, stemKey: phraseKey(key), related }));
  return index;
}

export interface OntologyHit {
  key: string;
  related: string[];
}

/** Which ontology entries are mentioned in `text` (stem-aware, whole-phrase match). */
export function matchOntology(text: string): OntologyHit[] {
  const haystack = ` ${phraseKey(text)} `;
  const hits: OntologyHit[] = [];
  for (const entry of buildIndex()) {
    if (entry.stemKey && haystack.includes(` ${entry.stemKey} `)) hits.push({ key: entry.key, related: entry.related });
  }
  // longest keys first so "ai agents" outranks "agentic"
  return hits.sort((a, b) => b.key.length - a.key.length);
}

export function genreConcepts(genre: string): string[] {
  const key = genre.trim().toLowerCase();
  const direct = GENRE_CONCEPTS[key];
  if (direct) return direct;
  const hit = Object.keys(GENRE_CONCEPTS).find((g) => key.includes(g));
  return hit ? (GENRE_CONCEPTS[hit] ?? []) : [];
}
