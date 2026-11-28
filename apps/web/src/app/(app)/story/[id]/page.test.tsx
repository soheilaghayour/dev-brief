import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SourceKind, StoryCard, StoryDetail } from '@devbrief/shared';
import StoryPage from './page';

const features = vi.hoisted(() => ({ summaries: false, clusters: false }));
vi.mock('@/config/features', () => ({
  isFeatureEnabled: (flag: 'summaries' | 'clusters') => features[flag],
}));
vi.mock('@/components/story/SummarizeButton', () => ({ SummarizeButton: () => null }));
const api = vi.hoisted(() => ({ getStory: vi.fn() }));
vi.mock('@/lib/api/endpoints', () => api);
vi.mock('@/components/story/StorySaveButton', () => ({ StorySaveButton: () => null }));
vi.mock('next/navigation', () => ({ notFound: vi.fn() }));

function card(id: string, title: string): StoryCard {
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
    sources: [],
  };
}

const STORY: StoryDetail = {
  ...card('s1', 'Zephyr lands'),
  firstSeenAt: '2026-11-20T09:00:00.000Z',
  items: [],
  clusterMembers: [card('s2', 'Zephyr, explained')],
};

async function render() {
  const page = await StoryPage({
    params: Promise.resolve({ id: 's1' }),
  });
  return renderToStaticMarkup(page);
}

function sourceRef(kind: SourceKind, name: string) {
  return {
    kind,
    slug: kind,
    name,
    itemUrl: `https://example.com/${kind}`,
    points: null,
    comments: null,
    reactions: null,
    stars: null,
  };
}

beforeEach(() => {
  features.summaries = false;
  features.clusters = false;
  api.getStory.mockResolvedValue(STORY);
});

describe('StoryPage', () => {
  it("AC-2.3.11 links the summary to the story's own url and names the cluster's summary sources, not GitHub", async () => {
    features.summaries = true;
    api.getStory.mockResolvedValue({
      ...STORY,
      sources: [sourceRef('hn', 'Hacker News')],
      cluster: {
        id: 'c1',
        memberCount: 3,
        sources: [
          sourceRef('hn', 'Hacker News'),
          sourceRef('devto', 'Dev.to'),
          sourceRef('github', 'GitHub Trending'),
        ],
      },
      summary: {
        storyId: 's1',
        tldr: ['One', 'Two', 'Three'],
        consensus: null,
        model: 'm',
        createdAt: '2026-11-20T10:00:00.000Z',
      },
    });

    const html = await render();

    expect(html).toContain('href="https://example.com/s1"');
    expect(html).toContain('Source: Hacker News, Dev.to');
    expect(html).not.toContain('GitHub Trending');
  });

  it('AC-2.2.2 shows "Related coverage" while the clusters flag is on', async () => {
    features.clusters = true;
    expect(await render()).toContain('Related coverage');
  });

  it('AC-2.2.2 renders no "Related coverage" while the clusters flag is off', async () => {
    expect(await render()).not.toContain('Related coverage');
  });
});
