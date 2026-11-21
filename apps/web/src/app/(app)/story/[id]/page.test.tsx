import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoryCard, StoryDetail } from '@devbrief/shared';
import StoryPage from './page';

const features = vi.hoisted(() => ({ summaries: false, clusters: false }));
vi.mock('@/config/features', () => ({
  isFeatureEnabled: (flag: 'summaries' | 'clusters') => features[flag],
}));
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
    searchParams: Promise.resolve({}),
  });
  return renderToStaticMarkup(page);
}

beforeEach(() => {
  features.clusters = false;
  api.getStory.mockResolvedValue(STORY);
});

describe('StoryPage', () => {
  it('AC-2.2.2 shows "Related coverage" while the clusters flag is on', async () => {
    features.clusters = true;
    expect(await render()).toContain('Related coverage');
  });

  it('AC-2.2.2 renders no "Related coverage" while the clusters flag is off', async () => {
    expect(await render()).not.toContain('Related coverage');
  });
});
