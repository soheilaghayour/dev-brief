import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { StoryCard as StoryCardData } from '@devbrief/shared';
import { PreferenceMenu } from '@/components/preferences/PreferenceMenu';
import { StoryCard } from './StoryCard';

const features = vi.hoisted(() => ({ preferences: false, summaries: false }));
vi.mock('@/config/features', () => ({
  isFeatureEnabled: (flag: 'preferences' | 'summaries') => features[flag],
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
  props: { isSaved?: boolean; compact?: boolean; preferenceMenu?: typeof PreferenceMenu } = {},
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
    features.preferences = true;
    const html = render(STORY, { preferenceMenu: PreferenceMenu });
    // Two tags and three sources; the badges keep their data attributes on the trigger.
    expect(menuTriggers(html)).toHaveLength(5);
    expect(html).toMatch(/<button[^>]*aria-haspopup="menu"[^>]*data-tag="typescript"/);
    expect(html).toMatch(/<button[^>]*aria-haspopup="menu"[^>]*data-source-kind="hn"/);
    features.preferences = false;
  });

  it('keeps the badges plain without a preferenceMenu, as in the landing preview', () => {
    features.preferences = true;
    expect(menuTriggers(render(STORY))).toHaveLength(0);
    features.preferences = false;
  });

  it('AC-2.5.1 renders the badges without a menu while the preferences flag is off', () => {
    const html = render(STORY, { preferenceMenu: PreferenceMenu });
    expect(menuTriggers(html)).toHaveLength(0);
    expect(html.match(/data-tag=/g)).toHaveLength(2);
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
});
