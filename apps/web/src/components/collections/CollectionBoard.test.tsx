// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoryCard as StoryCardData } from '@devbrief/shared';
import { useGuestStore } from '@/lib/guest/guestStore';
import { CollectionBoard } from './CollectionBoard';
import {
  byRole,
  click,
  collection,
  mount,
  NoopResizeObserver,
  preloadLazyModules,
  seedGuestStore,
  storyId,
} from './collectionsHarness';

const auth = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock('@/lib/auth/useMe', () => ({
  useMe: () => ({ data: auth.user, isPending: false }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/toast/notify', () => ({ notify: vi.fn() }));
const lookup = vi.hoisted(() => ({ stories: [] as StoryCardData[], missingIds: [] as string[] }));
vi.mock('@/lib/api/endpoints', () => ({
  lookupStories: async ({ ids }: { ids: string[] }) => ({
    items: lookup.stories.filter(({ id }) => ids.includes(id)),
    missingIds: lookup.missingIds,
  }),
}));

function story(n: number): StoryCardData {
  return {
    id: storyId(n),
    title: `Story ${n}`,
    url: `https://example.com/${n}`,
    domain: 'example.com',
    excerpt: null,
    author: null,
    publishedAt: '2026-05-01T09:00:00.000Z',
    tags: [],
    readingTimeMinutes: null,
    rankScore: 1,
    sources: [],
    hasSummary: false,
    cluster: null,
  } as StoryCardData;
}

let unmount = () => {};

beforeAll(preloadLazyModules);

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
  // jsdom has no layout, so it has no scrollIntoView.
  Element.prototype.scrollIntoView = vi.fn();
  auth.user = null;
  // Not in collection order, so the test sees the board sort them.
  lookup.stories = [story(2), story(3), story(1), story(4)];
  lookup.missingIds = [];
});

afterEach(() => {
  unmount();
  vi.unstubAllGlobals();
});

async function showBoard(slug: string) {
  const mounted = await mount(<CollectionBoard slug={slug} />);
  unmount = mounted.unmount;
}

const titles = () =>
  [...document.querySelectorAll('article[data-story-id] h2 a')].map((link) => link.textContent);

async function showsTitles(expected: string[]) {
  await vi.waitFor(() => expect(titles()).toEqual(expected));
}

async function seedBoard() {
  await seedGuestStore(
    [
      collection('a', 'Reading list', 0, [storyId(3), storyId(1), storyId(2)]),
      collection('b', 'Other', 1, [storyId(1)]),
    ],
    [storyId(1), storyId(2), storyId(3)],
  );
}

describe('CollectionBoard', () => {
  it('AC-3.4.3 lists the collection items in collection order', async () => {
    await seedBoard();
    await showBoard('reading-list');
    expect(document.querySelector('h1')?.textContent).toBe('Reading list');
    await showsTitles(['Story 3', 'Story 1', 'Story 2']);
    expect(document.querySelector('[role="feed"]')?.getAttribute('aria-label')).toBe(
      'Stories in Reading list',
    );
  });

  it('AC-3.4.3 shows the sidebar with this board current', async () => {
    await seedBoard();
    await showBoard('reading-list');
    const current = document.querySelector('nav[aria-label="Collections"] [aria-current="page"]');
    expect(current?.getAttribute('href')).toBe('/collections/reading-list');
  });

  it('AC-3.4.1 Remove from collection takes the card off the board and keeps the save', async () => {
    await seedBoard();
    await showBoard('reading-list');

    await showsTitles(['Story 3', 'Story 1', 'Story 2']);

    await click(byRole('button', 'Remove from Reading list'));

    await showsTitles(['Story 1', 'Story 2']);
    const state = useGuestStore.getState();
    expect(state.collections[0]?.items.map((item) => item.storyId)).toEqual([
      storyId(1),
      storyId(2),
    ]);
    expect(state.collections[1]?.items).toHaveLength(1);
    expect(state.saves).toHaveLength(3);
  });

  it('AC-3.4.1 unsaving on the board removes the story from every collection', async () => {
    await seedBoard();
    await showBoard('reading-list');
    await showsTitles(['Story 3', 'Story 1', 'Story 2']);
    const card = document.querySelector(`article[data-story-id="${storyId(1)}"]`);

    await click(card?.querySelector('button[aria-label="Save story"]'));

    await showsTitles(['Story 3', 'Story 2']);
    expect(useGuestStore.getState().collections.map((c) => c.items.length)).toEqual([2, 0]);
  });

  it('AC-3.4.3 a story another tab adds to the collection appears on the open board', async () => {
    await seedBoard();
    await showBoard('reading-list');
    await showsTitles(['Story 3', 'Story 1', 'Story 2']);

    await act(async () => {
      const { collections, saves } = useGuestStore.getState();
      useGuestStore.setState({
        saves: [...saves, { storyId: storyId(4), savedAt: '2026-05-01T10:00:00.000Z' }],
        collections: collections.map((board, index) =>
          index === 0
            ? {
                ...board,
                items: [
                  ...board.items,
                  { storyId: storyId(4), position: 3, addedAt: '2026-05-02T10:00:00.000Z' },
                ],
              }
            : board,
        ),
      });
    });

    await showsTitles(['Story 3', 'Story 1', 'Story 2', 'Story 4']);
  });

  it('AC-3.4.3 a story that no longer exists leaves this collection, and the count follows', async () => {
    lookup.missingIds = [storyId(2)];
    await seedBoard();
    await showBoard('reading-list');

    await showsTitles(['Story 3', 'Story 1']);
    await vi.waitFor(() =>
      expect(useGuestStore.getState().collections[0]?.items.map((item) => item.storyId)).toEqual([
        storyId(3),
        storyId(1),
      ]),
    );
    expect(
      document.querySelector('nav[aria-label="Collections"] a[href="/collections/reading-list"]')
        ?.textContent,
    ).toBe('Reading list2');
  });

  it('shows an empty board with a hint', async () => {
    await seedGuestStore([collection('a', 'Empty one', 0)]);
    await showBoard('empty-one');
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain('Nothing in this collection yet'),
    );
    expect(document.body.textContent).toContain('Nothing in this collection yet');
  });

  it('AC-3.4.3 an unknown slug shows a not-found state linking back to /saved', async () => {
    await seedBoard();
    await showBoard('nope');
    expect(document.body.textContent).toContain('Collection not found');
    expect(
      [...document.querySelectorAll('a')]
        .find((link) => link.textContent === 'Back to Saved')
        ?.getAttribute('href'),
    ).toBe('/saved');
  });
});
