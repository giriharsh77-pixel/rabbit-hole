// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { extractFromDocument, extractYouTube } from '../src/services/context/extractors';

function page(html: string, title = 'YouTube'): Document {
  const doc = document.implementation.createHTMLDocument(title);
  doc.documentElement.innerHTML = `<head><title>${title}</title>${html.split('<!--body-->')[0]}</head><body>${html.split('<!--body-->')[1] ?? ''}</body>`;
  return doc;
}

const WATCH = new URL('https://www.youtube.com/watch?v=abc123XYZ');

const watchPage = `
  <link rel="canonical" href="https://www.youtube.com/watch?v=abc123XYZ">
  <meta name="keywords" content="ai agents, software development, coding, fireship">
  <meta name="description" content="AI agents are about to change how we write code.">
  <meta itemprop="genre" content="Science &amp; Technology">
  <meta itemprop="datePublished" content="2026-09-01">
  <!--body-->
  <ytd-watch-metadata>
    <h1><yt-formatted-string>How AI Agents Will Change Software Development</yt-formatted-string></h1>
    <ytd-channel-name><a href="/@fireship">Fireship</a></ytd-channel-name>
    <div id="description-inline-expander"><span id="snippet-text">AI agents are about to change how we write code. #AI #coding</span></div>
    <a href="/hashtag/devtools">#devtools</a>
  </ytd-watch-metadata>`;

describe('YouTube extractor', () => {
  it('reads title, channel, description, keywords, category and hashtags from a watch page', () => {
    const raw = extractYouTube(page(watchPage, 'How AI Agents Will Change Software Development - YouTube'), WATCH)!;
    expect(raw).toMatchObject({
      platform: 'youtube',
      kind: 'video',
      title: 'How AI Agents Will Change Software Development',
      creator: 'Fireship',
      videoId: 'abc123XYZ',
      confidence: 'high',
      category: 'Science & Technology',
      publishedAt: '2026-09-01',
    });
    expect(raw.description).toContain('AI agents are about to change');
    expect(raw.keywords).toEqual(['ai agents', 'software development', 'coding', 'fireship']);
    expect(raw.hashtags).toEqual(expect.arrayContaining(['devtools', 'AI', 'coding']));
  });

  it('falls back to the tab title when the visible title is not in the DOM yet', () => {
    const raw = extractYouTube(page('<!--body--><div></div>', '(3) How black holes work - YouTube'), WATCH)!;
    expect(raw.title).toBe('How black holes work');
    expect(raw.confidence).toBe('medium');
    expect(raw.source).toBe('browser tab title');
  });

  it('does not trust <meta> tags left over from the previous video (SPA navigation)', () => {
    const stale = `
      <link rel="canonical" href="https://www.youtube.com/watch?v=PREVIOUSvid">
      <meta name="keywords" content="cats, funny, viral">
      <meta name="description" content="Previous video description">
      <!--body-->
      <ytd-watch-metadata><h1><yt-formatted-string>The new video</yt-formatted-string></h1></ytd-watch-metadata>`;
    const raw = extractYouTube(page(stale), WATCH)!;
    expect(raw.title).toBe('The new video');
    expect(raw.keywords).toBeUndefined();
    expect(raw.description).toBeUndefined();
  });

  it('handles Shorts', () => {
    const shorts = `<!--body-->
      <ytd-reel-video-renderer is-active>
        <yt-shorts-video-title-view-model><h2>This is how a black hole forms #space</h2></yt-shorts-video-title-view-model>
        <ytd-channel-name><a href="/@physicsgirl">PhysicsGirl</a></ytd-channel-name>
      </ytd-reel-video-renderer>`;
    const raw = extractYouTube(page(shorts), new URL('https://www.youtube.com/shorts/SHORT12345'))!;
    expect(raw.kind).toBe('short');
    expect(raw.title).toContain('black hole');
    expect(raw.creator).toBe('PhysicsGirl');
    expect(raw.videoId).toBe('SHORT12345');
  });

  it('returns null off watch pages and when nothing identifies the video', () => {
    expect(extractYouTube(page(watchPage), new URL('https://www.youtube.com/'))).toBeNull();
    expect(extractYouTube(page('<!--body--><div></div>', 'YouTube'), WATCH)).toBeNull();
  });

  it('is reachable through the extractor registry and never throws on odd markup', async () => {
    const raw = await extractFromDocument(page(watchPage), WATCH);
    expect(raw?.platform).toBe('youtube');
    const weird = page('<!--body--><ytd-watch-metadata><h1></h1></ytd-watch-metadata><script type="application/ld+json">{oops</script>', 'x - YouTube');
    await expect(extractFromDocument(weird, WATCH)).resolves.toBeDefined();
  });
});
