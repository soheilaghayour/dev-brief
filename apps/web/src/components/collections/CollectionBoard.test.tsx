// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoryCard as StoryCardData } from '@devbrief/shared';
import { useGuestStore } from '@/lib/guest/guestStore';
import { HotkeysProvider } from '@/lib/hotkeys/HotkeysProvider';
import { CollectionBoard } from './CollectionBoard';
import {
  byRole,
  click,
  collection,
  mount,
  NoopResizeObserver,
  pressKey,
  seedGuestStore,
  settle,
  storyId,
} from './collectionsHarness';

const auth = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock('@/lib/auth/useMe', () => ({
  useMe: () => ({ data: auth.user, isPending: false }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
// next/dynamic's lazy load is the browser's business; the test mounts the sidebar itself.
vi.mock('./LazyCollectionsSidebar', async () => ({
  LazyCollectionsSidebar: (await import('./CollectionsSidebar')).CollectionsSidebar,
}));
vi.mock('@/lib/toast/notify', () => ({ notify: vi.fn() }));
const lookup = vi.hoisted(() => ({ stories: [] as StoryCardData[] }));
vi.mock('@/lib/api/endpoints', () => ({
  lookupStories: async () => ({ items: lookup.stories, missingIds: [] }),
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

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
  // jsdom has no layout, so it has no scrollIntoView.
  Element.prototype.scrollIntoView = vi.fn();
  auth.user = null;
  // Not in collection order, so the test sees the board sort them.
  lookup.stories = [story(2), story(3), story(1)];
});

afterEach(() => {
  unmount();
  vi.unstubAllGlobals();
});

async function showBoard(slug: string) {
  const mounted = await mount(
    <HotkeysProvider>
      <CollectionBoard slug={slug} />
    </HotkeysProvider>,
  );
  unmount = mounted.unmount;
  await vi.waitFor(() => expect(document.documentElement.dataset.hotkeysReady).toBe(''), {
    timeout: 5000,
  });
  await settle();
}

const titles = () =>
  [...document.querySelectorAll('article[data-story-id] h2 a')].map((link) => link.textContent);

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
    expect(titles()).toEqual(['Story 3', 'Story 1', 'Story 2']);
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

    await click(byRole('button', 'Remove from Reading list'));

    expect(titles()).toEqual(['Story 1', 'Story 2']);
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
    const card = document.querySelector(`article[data-story-id="${storyId(1)}"]`);

    await click(card?.querySelector('button[aria-label="Save story"]'));

    expect(titles()).toEqual(['Story 3', 'Story 2']);
    expect(useGuestStore.getState().collections.map((c) => c.items.length)).toEqual([2, 0]);
  });

  it('AC-3.4.3 j moves the active card and s unsaves it, like /saved', async () => {
    await seedBoard();
    await showBoard('reading-list');

    await pressKey(document, 'j');
    const active = () =>
      document.querySelector('article[data-active="true"] h2 a')?.textContent ?? null;
    expect(active()).toBe('Story 3');
    await pressKey(document, 'j');
    expect(active()).toBe('Story 1');

    await pressKey(document, 's');
    expect(titles()).toEqual(['Story 3', 'Story 2']);
    expect(active()).toBe('Story 2');
  });

  it('shows an empty board with a hint', async () => {
    await seedGuestStore([collection('a', 'Empty one', 0)]);
    await showBoard('empty-one');
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

  it('shows the not-found state to a signed-in user, whose collections are unavailable', async () => {
    auth.user = { id: 'u1' };
    await seedBoard();
    await showBoard('reading-list');
    expect(document.body.textContent).toContain('Collection not found');
    expect(titles()).toEqual([]);
  });
});
