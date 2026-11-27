import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { StoryCard as StoryCardData } from '@devbrief/shared';
import { splitSearchPieces } from '@devbrief/shared';
import { PreferenceMenu } from '@/components/preferences/PreferenceMenu';
import { ClusterSourceLine } from './ClusterSourceLine';
import { RelatedToggle } from './RelatedToggle';
import { StoryCard } from './StoryCard';

const features = vi.hoisted(() => ({ summaries: false, clusters: false }));
vi.mock('@/config/features', () => ({
  isFeatureEnabled: (flag: 'summaries' | 'clusters') => features[flag],
}));

const STORY: StoryCardData = {
  id: 'story-1',
  title: 'Native TS compiler preview ships',
  url: 'https://devblogs.microsoft.com/typescript/native-preview',
  domain: 'devblogs.microsoft.com',
  excerpt: null,
  author: null,
  publishedAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
  tags: ['typescript', 'performance'],
  readingTimeMinutes: 6,
  rankScore: 10,
  sources: [
    {
      kind: 'hn',
      slug: 'hn',
      name: 'Hacker News',
      itemUrl: 'https://news.ycombinator.com/item?id=1',
      points: 320,
      comments: 141,
      reactions: null,
      stars: null,
    },
    {
      kind: 'devto',
      slug: 'devto',
      name: 'Dev.to',
      itemUrl: 'https://dev.to/post',
      points: null,
      comments: 12,
      reactions: 95,
      stars: null,
    },
    {
      kind: 'rss',
      slug: 'rss-typescript-blog',
      name: 'TypeScript Blog',
      itemUrl: 'https://devblogs.microsoft.com/typescript/native-preview',
      points: null,
      comments: null,
      reactions: null,
      stars: null,
    },
  ],
};

function render(
  story: StoryCardData,
  props: {
    isSaved?: boolean;
    compact?: boolean;
    preferenceMenu?: typeof PreferenceMenu;
    relatedToggle?: typeof RelatedToggle;
    sourceLine?: typeof ClusterSourceLine;
  } = {},
) {
  return renderToStaticMarkup(
    <StoryCard story={story} isSaved={props.isSaved ?? false} onToggleSave={() => {}} {...props} />,
  );
}

describe('StoryCard', () => {
  it('AC-1.3.7 links the title to the original in a new tab with noopener noreferrer', () => {
    const html = render(STORY);
    expect(html).toMatch(
      /<a[^>]*href="https:\/\/devblogs\.microsoft\.com\/typescript\/native-preview"[^>]*>Native TS compiler preview ships<\/a>/,
    );
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('devblogs.microsoft.com</span>');
  });

  it('AC-L5 links the title to titleHref in the same tab when one is passed', () => {
    const html = renderToStaticMarkup(
      <StoryCard
        story={STORY}
        isSaved={false}
        onToggleSave={() => {}}
        titleHref="/story/story-1"
      />,
    );
    expect(html).toMatch(
      /<a[^>]*href="\/story\/story-1"[^>]*>Native TS compiler preview ships<\/a>/,
    );
    expect(html).not.toMatch(/<a[^>]*target="_blank"[^>]*>Native TS compiler preview ships/);
  });

  it('AC-1.3.7 shows one badge per source with its numbers and the relative time', () => {
    const html = render(STORY);
    expect(html).toContain('data-source-kind="hn"');
    expect(html).toContain('▲</span><span class="tabular-nums" title="Points">320');
    expect(html).toContain('♥</span><span class="tabular-nums" title="Reactions">95');
    expect(html).toContain('TypeScript Blog');
    expect(html).toMatch(/<time[^>]*>3h<\/time>/);
  });

  it('AC-1.3.7 shows up to 3 tags and a +n for the rest', () => {
    const many = { ...STORY, tags: ['react', 'vue', 'css', 'rust', 'go'] } satisfies StoryCardData;
    const html = render(many);
    expect(html.match(/data-tag=/g)).toHaveLength(3);
    expect(html).toContain('+2');
    expect(render(STORY)).not.toContain('+');
  });

  it('AC-1.3.7 shows the reading time only when known', () => {
    expect(render(STORY)).toContain('6 min read');
    expect(render({ ...STORY, readingTimeMinutes: null })).not.toContain('min read');
  });

  it('AC-1.3.7 renders a Save button whose aria-pressed follows isSaved', () => {
    expect(render(STORY, { isSaved: false })).toMatch(/<button[^>]*aria-pressed="false"/);
    expect(render(STORY, { isSaved: true })).toMatch(/<button[^>]*aria-pressed="true"/);
  });

  it('AC-3.4.3 shows the Add to collection entry only where a handler is passed', () => {
    expect(render(STORY)).not.toContain('Add to collection');
    const html = renderToStaticMarkup(
      <StoryCard
        story={STORY}
        isSaved={false}
        onToggleSave={() => {}}
        onAddToCollection={() => {}}
      />,
    );
    expect(html).toMatch(/<button[^>]*aria-label="Add to collection"/);
  });

  it('keeps the tags but drops the reading time in the compact density', () => {
    const html = render(STORY, { compact: true });
    expect(html).toContain('data-tag=');
    expect(html).not.toContain('min read');
  });

  it('AC-1.3.8 marks the active card', () => {
    const html = renderToStaticMarkup(
      <StoryCard story={STORY} isSaved={false} onToggleSave={() => {}} isActive />,
    );
    expect(html).toContain('data-active="true"');
  });

  it('keys two items of the same source apart, as an HN repost produces', () => {
    const [hn] = STORY.sources;
    if (!hn) throw new Error('fixture has sources');
    const repost = { ...hn, itemUrl: 'https://news.ycombinator.com/item?id=2' };
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    render({ ...STORY, sources: [hn, repost] });

    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  const menuTriggers = (html: string) => html.match(/<button[^>]*aria-haspopup="menu"/g) ?? [];

  it('AC-2.5.1 makes every tag and source badge a menu trigger where preferences apply', () => {
    const html = render(STORY, { preferenceMenu: PreferenceMenu });
    // Two tags and three sources; the badges keep their data attributes on the trigger.
    expect(menuTriggers(html)).toHaveLength(5);
    expect(html).toMatch(/<button[^>]*aria-haspopup="menu"[^>]*data-tag="typescript"/);
    expect(html).toMatch(/<button[^>]*aria-haspopup="menu"[^>]*data-source-kind="hn"/);
  });

  it('keeps the badges plain without a preferenceMenu, as in the landing preview', () => {
    expect(menuTriggers(render(STORY))).toHaveLength(0);
  });

  it('links a TL;DR badge to the story page when the story has a summary', () => {
    features.summaries = true;
    const html = render({ ...STORY, hasSummary: true });
    features.summaries = false;
    expect(html).toMatch(/<a[^>]*href="\/story\/story-1"[^>]*><span[^>]*>TL;DR<\/span><\/a>/);
  });

  it('shows no TL;DR badge without a summary or while the summaries flag is off', () => {
    features.summaries = true;
    expect(render({ ...STORY, hasSummary: false })).not.toContain('TL;DR');
    features.summaries = false;
    expect(render({ ...STORY, hasSummary: true })).not.toContain('TL;DR');
  });

  it('AC-2.3.9 renders the summary line under the title as clamped plain text, in both densities', () => {
    features.summaries = true;
    const story = { ...STORY, hasSummary: true, summaryLine: 'Uses <b>Go</b> for speed' };
    const html = render(story);
    const compact = render(story, { compact: true });
    features.summaries = false;
    for (const markup of [html, compact]) {
      expect(markup).toContain('Uses &lt;b&gt;Go&lt;/b&gt; for speed');
      expect(markup).toMatch(/<p[^>]*class="[^"]*line-clamp-2[^"]*"/);
      expect(markup.indexOf('Native TS compiler')).toBeLessThan(markup.indexOf('Uses &lt;b'));
    }
    expect(html).toContain('TL;DR');
  });

  it('AC-2.3.11 puts the line after the title heading, which still links to the original in a new tab', () => {
    features.summaries = true;
    const html = render({ ...STORY, hasSummary: true, summaryLine: 'The gist' });
    features.summaries = false;
    const headingEnd = html.indexOf('</h2>');
    expect(headingEnd).toBeGreaterThan(-1);
    expect(html.indexOf('The gist')).toBeGreaterThan(headingEnd);
    expect(html.slice(0, headingEnd)).toMatch(
      new RegExp(
        `<a[^>]*href="${STORY.url}"[^>]*target="_blank"|<a[^>]*target="_blank"[^>]*href="${STORY.url}"`,
      ),
    );
    expect(html).toContain('AI summary: </span>The gist');
  });

  it('AC-2.3.9 shows no line and no placeholder without a summary line or while the flag is off', () => {
    features.summaries = true;
    const none = render({ ...STORY, summaryLine: null });
    features.summaries = false;
    const off = render({ ...STORY, summaryLine: 'Hidden while off' });
    expect(none).not.toContain('line-clamp-2');
    expect(none).not.toMatch(/unavailable/i);
    expect(off).not.toContain('Hidden while off');
  });

  const CLUSTERED: StoryCardData = {
    ...STORY,
    cluster: { id: 'cluster-1', memberCount: 3, sources: STORY.sources },
  };

  it('AC-2.2.1 shows the combined source line and the "+N related" control on a cluster card', () => {
    features.clusters = true;
    const html = render(CLUSTERED, { relatedToggle: RelatedToggle, sourceLine: ClusterSourceLine });
    features.clusters = false;
    expect(html).toContain('Trending on ');
    expect(html).toContain(
      'HN (<span aria-hidden="true">▲ </span>320<span class="sr-only"> points</span>)',
    );
    expect(html).toContain(' &amp; ');
    expect(html).toContain('Dev.to (<span aria-hidden="true">♥ </span>95');
    expect(html).toContain('1 blog');
    expect(html).toContain('+2 related');
    expect(html).toMatch(/<button[^>]*aria-expanded="false"/);
    // The per-source badges give way to the line.
    expect(html).not.toContain('title="Points"');
  });

  it('AC-2.2.1 leaves a card without cluster as it is, with or without the toggle passed', () => {
    features.clusters = true;
    const html = render(STORY, { relatedToggle: RelatedToggle });
    features.clusters = false;
    expect(html).toBe(render(STORY));
    expect(html).not.toContain('related');
  });

  it('AC-2.2.1 shows no line or toggle while the clusters flag is off', () => {
    const html = render(CLUSTERED, { relatedToggle: RelatedToggle });
    expect(html).toBe(render(STORY));
  });

  it('AC-2.2.1 renders a plain card where the page passes no line or toggle, as on /saved', () => {
    features.clusters = true;
    const html = render(CLUSTERED);
    features.clusters = false;
    expect(html).toBe(render(STORY));
  });
});

describe('StoryCard search highlight', () => {
  const ANGULAR = { ...STORY, title: 'Angular 20 <ships> & more' } satisfies StoryCardData;

  function renderSearch(story: StoryCardData, query: string, excerpt: string | null = null) {
    return renderToStaticMarkup(
      <StoryCard
        story={story}
        isSaved={false}
        onToggleSave={() => {}}
        search={{ pieces: splitSearchPieces(query), excerpt }}
      />,
    );
  }
  const marks = (html: string) => [...html.matchAll(/<mark[^>]*>(.*?)<\/mark>/g)].map((m) => m[1]);

  it('AC-1.3.14 with q=ai marks "ai" in Maintaining and "AI"', () => {
    const html = renderSearch({ ...STORY, title: 'Maintaining AI agents' }, 'ai');
    expect(marks(html)).toEqual(['ai', 'ai', 'AI']);
  });

  it('AC-1.3.14 with q=angu react marks Angu in the title and React in the excerpt line', () => {
    const html = renderSearch(ANGULAR, 'angu react', 'A guide to React hooks.');
    expect(html).toContain('<mark class="bg-primary/25 text-foreground rounded-sm">Angu</mark>lar');
    expect(marks(html)).toEqual(['Angu', 'React']);
    expect(html).toContain('A guide to ');
  });

  it('AC-1.3.14 shows no excerpt line when the title holds every piece', () => {
    const html = renderSearch(ANGULAR, 'angu 20', 'React everywhere');
    expect(html).not.toContain('React everywhere');
    expect(html).not.toContain('truncate');
  });

  it('AC-1.3.14 shows no excerpt line for a null excerpt', () => {
    expect(renderSearch(ANGULAR, 'angu react', null)).not.toContain('truncate');
  });

  it('AC-1.3.14 without q the card has no mark and no excerpt line, as before', () => {
    expect(render(ANGULAR)).not.toContain('<mark');
    expect(render(ANGULAR)).not.toContain('truncate');
  });

  it('AC-1.3.14 merges overlapping pieces into one mark', () => {
    const html = renderSearch({ ...STORY, title: 'Angular' }, 'ang gul');
    expect(marks(html)).toEqual(['Angul']);
    expect(html).not.toMatch(/<mark[^>]*>[^<]*<mark/);
  });

  it('AC-1.3.14 escapes HTML characters in a marked title', () => {
    const html = renderSearch(ANGULAR, 'ships');
    expect(html).toContain('&lt;<mark');
    expect(html).toContain('&gt; &amp; more');
  });

  it('AC-1.3.14 keeps the title link accessible name the plain title', () => {
    const html = renderSearch(ANGULAR, 'angu');
    const link = /<a[^>]*target="_blank"[^>]*>(.*?)<\/a>/.exec(html)?.[1] ?? '';
    expect(link.replaceAll(/<[^>]+>/g, '')).toBe('Angular 20 &lt;ships&gt; &amp; more');
    expect(link).not.toContain('aria-label');
    expect(html).not.toMatch(/<mark[^>]*aria-/);
  });

  it('AC-1.3.14 does not crash on a q cut in the middle of an emoji', () => {
    const lone = '😀'.slice(0, 1);
    expect(marks(renderSearch({ ...STORY, title: 'Hi 😀' }, lone))).toEqual(['😀']);
  });
});
