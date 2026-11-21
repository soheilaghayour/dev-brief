import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { SourceKind, StoryCard, StoryDetail } from '@devbrief/shared';
import { ClusterMembers } from './ClusterMembers';
import { groupClusterStories } from './groupClusterStories';

function card(id: string, title: string, kind: SourceKind): StoryCard {
  return {
    id,
    title,
    url: `https://example.com/${id}`,
    domain: 'example.com',
    excerpt: null,
    author: null,
    publishedAt: '2026-11-20T10:00:00.000Z',
    tags: [],
    readingTimeMinutes: null,
    rankScore: 1,
    sources: [
      {
        kind,
        slug: kind,
        name: kind,
        itemUrl: `https://example.com/item/${id}`,
        points: kind === 'hn' ? 320 : null,
        comments: null,
        reactions: kind === 'devto' ? 95 : null,
        stars: null,
      },
    ],
  };
}

function detail(current: StoryCard, clusterMembers?: StoryCard[]): StoryDetail {
  return { ...current, firstSeenAt: '2026-11-20T09:00:00.000Z', items: [], clusterMembers };
}

const HN = card('hn1', 'HN discussion', 'hn');
const DEVTO = card('dt1', 'Dev.to post', 'devto');
const BLOG = card('rss1', 'Blog post', 'rss');

describe('ClusterMembers', () => {
  it('AC-2.2.2 lists every member grouped by source kind, with the page own story marked', () => {
    const html = renderToStaticMarkup(<ClusterMembers story={detail(DEVTO, [BLOG, HN])} />);

    expect(html).toContain('Related coverage');
    const headings = [...html.matchAll(/<h3[^>]*>([^<]+)<\/h3>/g)].map((match) => match[1]);
    expect(headings).toEqual(['Hacker News', 'Dev.to', 'Blogs']);
    expect(html).toContain('href="/story/hn1"');
    expect(html).toContain('href="/story/rss1"');
    // The current story is not a link to itself.
    expect(html).not.toContain('href="/story/dt1"');
    expect(html).toMatch(/aria-current="page"[^>]*>Dev\.to post<\/span>/);
    expect(html).toContain('This story');
  });

  it('renders nothing for a story that is not clustered', () => {
    expect(renderToStaticMarkup(<ClusterMembers story={detail(HN)} />)).toBe('');
  });
});

describe('groupClusterStories', () => {
  it('AC-2.2.2 orders groups HN, Dev.to, blogs, GitHub and drops empty ones', () => {
    const github = card('gh1', 'Repo', 'github');
    const groups = groupClusterStories([github, BLOG, HN]);
    expect(groups.map((group) => group.kind)).toEqual(['hn', 'rss', 'github']);
  });
});
