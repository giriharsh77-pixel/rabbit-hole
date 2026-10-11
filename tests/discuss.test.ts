import { describe, expect, it } from 'vitest';
import { createServices } from '../src/background/container';
import { MemoryStore } from '../src/services/cacheService';
import { discussPlan, searchName, titleMatch, type DiscussSubject } from '../src/services/reddit/aboutTitle';
import { jsonResponse, listing, mockFetch } from './helpers';

const office: DiscussSubject = {
  title: 'The Office',
  kind: 'series',
  ownSubreddit: 'DunderMifflin',
  episodeName: 'Basketball',
  season: 1,
  names: ['Steve Carell', 'Rainn Wilson', 'John Krasinski', 'Jenna Fischer', 'Michael Scott', 'Dwight Schrute', 'Jim Halpert', 'Pam Beesly'],
};
const thread = (title: string, subreddit: string, preview = '') => ({ title, subreddit, preview });
const keep = (s: DiscussSubject, t: ReturnType<typeof thread>) => titleMatch(s, t).keep;

describe('is this thread about the show?', () => {
  it('keeps the show’s own subreddit, TV communities and viewers talking about it', () => {
    expect(keep(office, thread('The work schedule plot in S1E5 “Basketball” made no sense', 'DunderMifflin'))).toBe(true);
    expect(keep(office, thread('The Office is still the most rewatched show on Netflix', 'television'))).toBe(true);
    expect(keep(office, thread('Finished The Office for the third time', 'AskReddit'))).toBe(true); // written as a name
    expect(keep(office, thread('the office finale still makes me cry', 'CasualConversation'))).toBe(true); // viewer words
    expect(keep(office, thread('Steve Carell says he would not return as Michael Scott', 'television'))).toBe(true); // cast in a TV sub
  });

  it('drops office politics, office chairs and Microsoft Office', () => {
    expect(keep(office, thread('My manager keeps scheduling meetings in the office at 5pm', 'antiwork'))).toBe(false);
    expect(keep(office, thread('Is it normal to cry in the office?', 'careerguidance'))).toBe(false);
    expect(keep(office, thread('Best chair for the office under $300', 'officechairs'))).toBe(false);
    expect(keep(office, thread('the office called me back after the interview', 'jobs'))).toBe(false);
    expect(keep(office, thread('Excel keeps crashing at the office', 'excel'))).toBe(false);
    // …unless it really is about the show
    expect(keep(office, thread('My boss is a real Michael Scott — The Office was a documentary', 'antiwork'))).toBe(true);
  });

  it('needs more than the words to count elsewhere', () => {
    expect(keep(office, thread('back to the office after two years remote', 'AskReddit'))).toBe(false);
    expect(keep(office, thread('Dwight Schrute bobblehead found at a thrift store', 'ThriftStoreHauls'))).toBe(false); // no title
  });

  it('ranks the episode and the show’s own community first', () => {
    const own = titleMatch(office, thread('Basketball is the most cringe episode of season 1', 'DunderMifflin'));
    const tv = titleMatch(office, thread('The Office season 1 is underrated', 'television'));
    const anywhere = titleMatch(office, thread('rewatching the office again', 'CasualConversation'));
    expect(own.match * own.boost).toBeGreaterThan(tv.match * tv.boost);
    expect(tv.match * tv.boost).toBeGreaterThan(anywhere.match * anywhere.boost);
  });

  it('searches by the name people use', () => {
    expect(searchName('Glass Onion: A Knives Out Mystery')).toBe('Glass Onion');
    expect(searchName('Heeramandi: The Diamond Bazaar')).toBe('Heeramandi');
    expect(searchName('Mission: Impossible')).toBe('Mission: Impossible');
    expect(searchName('The Office')).toBe('The Office');
    const glass: DiscussSubject = { title: 'Glass Onion: A Knives Out Mystery', kind: 'movie', names: ['Daniel Craig', 'Benoit Blanc'] };
    expect(keep(glass, thread('Glass Onion was way better than I expected', 'movies'))).toBe(true);
  });
});

describe('where Discuss looks', () => {
  it('the show’s subreddit first, then TV subreddits, then all of Reddit', () => {
    const plan = discussPlan(office);
    expect(plan.map((p) => p.label)).toEqual(['r/DunderMifflin', 'TV subreddits', 'all of Reddit', 'all of Reddit']);
    expect(plan[0]).toMatchObject({ query: 'Basketball', subreddits: ['DunderMifflin'] });
    expect(plan[1]?.subreddits).toEqual(expect.arrayContaining(['television', 'netflix']));
    expect(plan[2]?.query).toBe('"The Office" Basketball');
    // a whole show: its subreddit's best threads of all time
    expect(discussPlan({ ...office, episodeName: undefined, season: undefined })[0]).toMatchObject({ query: 'subreddit:DunderMifflin', sort: 'top', time: 'all' });
    // films go to film communities; no subreddit known → no first step
    const film = discussPlan({ title: 'RRR', kind: 'movie', names: [] });
    expect(film[0]).toMatchObject({ label: 'film subreddits', query: 'RRR' });
    expect(film[0]?.subreddits).toEqual(expect.arrayContaining(['movies', 'MovieDetails']));
  });

  it('runs the plan and returns only threads about the show', async () => {
    const fetchImpl = mockFetch((url) => {
      if (!url.hostname.endsWith('reddit.com')) return undefined;
      if (url.pathname.startsWith('/r/DunderMifflin/')) return jsonResponse(listing([{ id: 'own001', title: 'The Basketball episode is peak season 1', subreddit: 'DunderMifflin', score: 900 }]));
      if (url.pathname.startsWith('/r/television+')) return jsonResponse(listing([{ id: 'tv0001', title: 'The Office cast reunion announced', subreddit: 'television', score: 5000 }]));
      return jsonResponse(
        listing([
          { id: 'work01', title: 'Coworker microwaves fish in the office every day', subreddit: 'antiwork', score: 20000 },
          { id: 'fans01', title: 'Rewatching The Office with my kids', subreddit: 'Parenting', score: 300 },
        ]),
      );
    });
    const services = createServices({ local: new MemoryStore(), session: new MemoryStore(), fetchImpl });
    const r = await services.reddit.discuss(office);
    expect(r.posts.map((p) => p.id).sort()).toEqual(['fans01', 'own001', 'tv0001']);
    expect(r.scopes).toEqual(['r/DunderMifflin', 'TV subreddits', 'all of Reddit']);
    expect(fetchImpl.calls.length).toBe(4);
  });

  it('"Newest" asks Reddit for its newest matches and lists them newest first — still only about the show', async () => {
    const plan = discussPlan(office, 'new');
    expect(plan.every((p) => p.sort === 'new')).toBe(true);
    expect(discussPlan({ ...office, episodeName: undefined, season: undefined }, 'new')[0]).toMatchObject({ query: 'subreddit:DunderMifflin', sort: 'new' });

    const fetchImpl = mockFetch((url) => {
      if (!url.hostname.endsWith('reddit.com')) return undefined;
      return jsonResponse(
        listing([
          { id: 'old001', title: 'The Basketball episode, ten years later', subreddit: 'DunderMifflin', score: 9000, ageHours: 24 * 365 },
          { id: 'new001', title: 'Just watched Basketball for the first time', subreddit: 'DunderMifflin', score: 12, ageHours: 2 },
          { id: 'mid001', title: 'The Office season 1 rewatch thread', subreddit: 'television', score: 300, ageHours: 24 * 30 },
          { id: 'work01', title: 'New hire keeps eating my lunch at the office', subreddit: 'antiwork', score: 5000, ageHours: 1 },
        ]),
      );
    });
    const services = createServices({ local: new MemoryStore(), session: new MemoryStore(), fetchImpl });
    const r = await services.reddit.discuss(office, { order: 'new' });
    expect(fetchImpl.calls.every((u) => new URL(u).searchParams.get('sort') === 'new')).toBe(true);
    expect(r.posts.map((p) => p.id)).toEqual(['new001', 'mid001', 'old001']);
    const relevant = await services.reddit.discuss(office); // a separate search, best match first
    expect(relevant.posts[0]?.id).toBe('old001');
  });

  it('the sort is a remembered setting', async () => {
    const services = createServices({ local: new MemoryStore(), session: new MemoryStore(), fetchImpl: mockFetch() });
    expect((await services.settings.get()).reddit.sort).toBe('relevance');
    expect((await services.settings.update({ reddit: { sort: 'new' } })).reddit.sort).toBe('new');
    expect((await services.settings.update({ reddit: { sort: 'top' as never } })).reddit.sort).toBe('relevance');
  });
});
