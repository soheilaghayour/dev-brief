// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Collection, StoryCard as StoryCardData } from '@devbrief/shared';
import { HotkeysProvider } from '@/lib/hotkeys/HotkeysProvider';
import { AddToCollectionProvider, useAddToCollection } from './AddToCollection';
import { CollectionBoard } from './CollectionBoard';
import { CollectionsSidebar } from './CollectionsSidebar';
import {
  byRole,
  click,
  hotkeysReady,
  mount,
  NoopResizeObserver,
  openMenuByKeyboard,
  storyId,
  typeInto,
} from './collectionsHarness';

vi.mock('@/lib/auth/useMe', () => ({ useMe: () => ({ data: { id: 'u1' }, isPending: false }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
const notify = vi.hoisted(() => vi.fn());
vi.mock('@/lib/toast/notify', () => ({ notify }));
vi.mock('@/config/features', () => ({ FEATURES: {}, isFeatureEnabled: () => true }));

type Row = Collection & { stories: StoryCardData[] };
// A fake account: the endpoints answer from this state, and a test can hold an answer back or fail it.
const server = vi.hoisted(() => ({
  rows: [] as unknown[],
  savedIds: [] as string[],
  failing: false,
  gate: null as Promise<void> | null,
  calls: [] as string[],
}));

function rows() {
  return server.rows as Row[];
}

async function answer(call: string) {
  server.calls.push(call);
  await server.gate;
  if (server.failing) throw new Error('500');
}

function asCollection({ stories, ...collection }: Row): Collection {
  return { ...collection, itemCount: stories.length };
}

vi.mock('@/lib/api/endpoints', () => ({
  getSaveIds: async () => ({ ids: server.savedIds }),
  getCollections: async () => ({ items: rows().map(asCollection) }),
  getCollection: async (id: string) => {
    const row = rows().find((candidate) => candidate.id === id);
    if (!row) throw new Error('404');
    return {
      collection: asCollection(row),
      items: row.stories.map((story, position) => ({
        story,
        position,
        addedAt: '2026-05-01T10:00:00.000Z',
        note: null,
        noteUpdatedAt: null,
      })),
    };
  },
  lookupStories: async ({ ids }: { ids: string[] }) => ({
    items: rows()
      .flatMap((row) => row.stories)
      .filter((story) => ids.includes(story.id)),
    missingIds: [],
  }),
  createCollection: async (body: { name: string }) => {
    await answer(`POST ${body.name}`);
    const row: Row = {
      id: `server-${rows().length + 1}`,
      slug: body.name.toLowerCase().replaceAll(' ', '-'),
      name: body.name,
      description: null,
      position: rows().length,
      itemCount: 0,
      createdAt: '2026-05-01T10:00:00.000Z',
      updatedAt: '2026-05-01T10:00:00.000Z',
      stories: [],
    };
    server.rows.push(row);
    return asCollection(row);
  },
  updateCollection: async (id: string, body: { name?: string; position?: number }) => {
    await answer(`PATCH ${id} ${JSON.stringify(body)}`);
    const row = rows().find((candidate) => candidate.id === id) as Row;
    if (body.name) row.name = body.name;
    if (body.position !== undefined) {
      server.rows = rows().filter((candidate) => candidate !== row);
      server.rows.splice(body.position, 0, row);
      rows().forEach((candidate, position) => (candidate.position = position));
    }
    return asCollection(row);
  },
  deleteCollection: async (id: string) => {
    await answer(`DELETE ${id}`);
    server.rows = rows().filter((row) => row.id !== id);
  },
  putCollectionItem: async (id: string, story: string) => {
    await answer(`PUT ${id} ${story}`);
    const row = rows().find((candidate) => candidate.id === id) as Row;
    row.stories.push(makeStory(Number(story.slice(-3))));
    if (!server.savedIds.includes(story)) server.savedIds.unshift(story);
    return asCollection(row);
  },
  deleteCollectionItem: async (id: string, story: string) => {
    await answer(`DELETE ${id} ${story}`);
    const row = rows().find((candidate) => candidate.id === id) as Row;
    row.stories = row.stories.filter((candidate) => candidate.id !== story);
  },
}));

function makeStory(n: number): StoryCardData {
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

function row(id: string, name: string, position: number, stories: number[] = []): Row {
  return {
    id,
    slug: name.toLowerCase().replaceAll(' ', '-'),
    name,
    description: null,
    position,
    itemCount: stories.length,
    createdAt: '2026-05-01T10:00:00.000Z',
    updatedAt: '2026-05-01T10:00:00.000Z',
    stories: stories.map(makeStory),
  };
}

/** Holds every answer back until `release` runs, so a test sees the optimistic state. */
function holdAnswers() {
  let release = () => {};
  server.gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return () => {
    server.gate = null;
    release();
  };
}

let unmount = () => {};

beforeAll(async () => {
  await Promise.all([
    import('./accountCollectionWriters'),
    import('./AddToCollectionDialog'),
    import('./CollectionDialogs'),
    import('./CollectionMenuDropdown'),
    import('./collectionNotice'),
    import('@/lib/hotkeys/ShortcutBindings'),
  ]);
});

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
  Element.prototype.scrollIntoView = vi.fn();
  server.rows = [];
  server.savedIds = [];
  server.failing = false;
  server.gate = null;
  server.calls = [];
});

afterEach(() => {
  unmount();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const links = () =>
  [...document.querySelectorAll<HTMLAnchorElement>('nav[aria-label="Collections"] a')].map(
    (link) => [link.textContent, link.getAttribute('href')],
  );
const names = () => links().map(([text]) => text);

async function showSidebar(activeSlug?: string) {
  const mounted = await mount(<CollectionsSidebar activeSlug={activeSlug} />);
  unmount = mounted.unmount;
  await vi.waitFor(() =>
    expect(document.querySelector('nav[aria-label="Collections"]')).not.toBeNull(),
  );
}

async function openMenu(collectionName: string, item: string) {
  const trigger = byRole('button', `Actions for ${collectionName}`);
  if (trigger?.hasAttribute('aria-expanded')) await openMenuByKeyboard(trigger);
  else await click(trigger);
  await vi.waitFor(() => expect(byRole('[role="menuitem"]', item)).not.toBeNull());
  await click(byRole('[role="menuitem"]', item));
}

async function dialogInput() {
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"] input')).not.toBeNull());
  return document.querySelector<HTMLInputElement>('[role="dialog"] input')!;
}

async function submitName(name: string) {
  await typeInto(await dialogInput(), name);
  await click(document.querySelector('[role="dialog"] button[type="submit"]'));
}

describe('account collections in the sidebar', () => {
  it('AC-3.4.1 lists the account collections with the server counts', async () => {
    server.rows = [row('a', 'Frontend', 0, [1, 2]), row('b', 'Interview', 1)];
    await showSidebar();
    await vi.waitFor(() =>
      expect(links()).toEqual([
        ['All saved0', '/saved'],
        ['Frontend2', '/collections/frontend'],
        ['Interview0', '/collections/interview'],
      ]),
    );
  });

  it('AC-3.4.1 create shows the collection before the server answers, and sends one POST', async () => {
    await showSidebar();
    const release = holdAnswers();
    await click(byRole('button', 'New'));
    await submitName('Reading list');

    await vi.waitFor(() => expect(names()).toContain('Reading list0'));
    expect(rows()).toHaveLength(0);

    release();
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
    expect(server.calls).toEqual(['POST Reading list']);
    expect(names()).toContain('Reading list0');
    expect(rows().map((candidate) => candidate.name)).toEqual(['Reading list']);
  });

  it('AC-3.4.1 create rolls back and toasts when the server answers 500', async () => {
    await showSidebar();
    server.failing = true;
    await click(byRole('button', 'New'));
    await submitName('Reading list');

    await vi.waitFor(() =>
      expect(notify).toHaveBeenCalledWith(expect.stringContaining("Couldn't")),
    );
    expect(names()).toEqual(['All saved0']);
    // The dialog stays open, so the typed name isn't lost.
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it('AC-3.4.1 rename shows the new name at once and keeps the URL', async () => {
    server.rows = [row('a', 'Reading list', 0)];
    await showSidebar();
    const release = holdAnswers();
    await openMenu('Reading list', 'Rename');
    await submitName('Backlog');

    await vi.waitFor(() =>
      expect(links()).toContainEqual(['Backlog0', '/collections/reading-list']),
    );
    release();
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
    expect(server.calls).toEqual(['PATCH a {"name":"Backlog"}']);
  });

  it('AC-3.4.1 rename rolls back to the old name on a 500', async () => {
    server.rows = [row('a', 'Reading list', 0)];
    await showSidebar();
    server.failing = true;
    await openMenu('Reading list', 'Rename');
    await submitName('Backlog');

    await vi.waitFor(() => expect(notify).toHaveBeenCalled());
    expect(names()).toEqual(['All saved0', 'Reading list0']);
  });

  it('AC-3.4.1 move down reorders at once and sends the new position', async () => {
    server.rows = [row('a', 'Alpha', 0), row('b', 'Beta', 1)];
    await showSidebar();
    await vi.waitFor(() => expect(names()).toContain('Beta0'));
    const release = holdAnswers();
    await openMenu('Alpha', 'Move down');

    await vi.waitFor(() => expect(names()).toEqual(['All saved0', 'Beta0', 'Alpha0']));
    release();
    await vi.waitFor(() => expect(server.calls).toEqual(['PATCH a {"position":1}']));
  });

  it('AC-3.4.1 move rolls back on a 500', async () => {
    server.rows = [row('a', 'Alpha', 0), row('b', 'Beta', 1)];
    await showSidebar();
    await vi.waitFor(() => expect(names()).toContain('Beta0'));
    server.failing = true;
    await openMenu('Alpha', 'Move down');

    await vi.waitFor(() => expect(notify).toHaveBeenCalled());
    expect(names()).toEqual(['All saved0', 'Alpha0', 'Beta0']);
  });

  it('AC-3.4.1 delete removes the row at once, and brings it back on a 500', async () => {
    server.rows = [row('a', 'Alpha', 0, [1])];
    await showSidebar();
    await vi.waitFor(() => expect(names()).toContain('Alpha1'));
    server.failing = true;
    const release = holdAnswers();
    await openMenu('Alpha', 'Delete');
    await vi.waitFor(() => expect(byRole('button', 'Delete collection')).not.toBeNull());
    await click(byRole('button', 'Delete collection'));

    await vi.waitFor(() => expect(names()).toEqual(['All saved0']));
    release();
    await vi.waitFor(() => expect(names()).toEqual(['All saved0', 'Alpha1']));
    expect(notify).toHaveBeenCalled();
  });

  it('AC-3.4.1 delete sends DELETE and the collection stays gone', async () => {
    server.rows = [row('a', 'Alpha', 0, [1])];
    await showSidebar();
    await vi.waitFor(() => expect(names()).toContain('Alpha1'));
    await openMenu('Alpha', 'Delete');
    await vi.waitFor(() => expect(byRole('button', 'Delete collection')).not.toBeNull());
    await click(byRole('button', 'Delete collection'));

    await vi.waitFor(() => expect(server.calls).toEqual(['DELETE a']));
    await vi.waitFor(() => expect(names()).toEqual(['All saved0']));
  });
});

describe('an account board', () => {
  async function showBoard(slug: string) {
    const mounted = await mount(
      <HotkeysProvider>
        <CollectionBoard slug={slug} />
      </HotkeysProvider>,
    );
    unmount = mounted.unmount;
    await hotkeysReady();
  }
  const titles = () =>
    [...document.querySelectorAll('article[data-story-id] h2 a')].map((link) => link.textContent);

  it('AC-3.4.3 shows the server items in board order, not the empty state while they load', async () => {
    server.rows = [row('a', 'Reading list', 0, [3, 1, 2])];
    await showBoard('reading-list');
    expect(document.body.textContent).not.toContain('Nothing in this collection yet');
    await vi.waitFor(() => expect(titles()).toEqual(['Story 3', 'Story 1', 'Story 2']));
  });

  it('AC-3.4.3 an unknown slug shows the not-found state', async () => {
    server.rows = [row('a', 'Reading list', 0, [1])];
    await showBoard('nope');
    await vi.waitFor(() => expect(document.body.textContent).toContain('Collection not found'));
  });

  it('AC-3.4.1 Remove from collection takes the card off at once and sends one DELETE', async () => {
    server.rows = [row('a', 'Reading list', 0, [3, 1, 2])];
    await showBoard('reading-list');
    await vi.waitFor(() => expect(titles()).toHaveLength(3));
    await click(byRole('button', 'Remove from Reading list'));

    await vi.waitFor(() => expect(titles()).toEqual(['Story 1', 'Story 2']));
    expect(server.calls).toEqual([`DELETE a ${storyId(3)}`]);
  });

  it('AC-3.4.1 Remove from collection puts the card back on a 500', async () => {
    server.rows = [row('a', 'Reading list', 0, [3, 1])];
    await showBoard('reading-list');
    await vi.waitFor(() => expect(titles()).toHaveLength(2));
    server.failing = true;
    await click(byRole('button', 'Remove from Reading list'));

    await vi.waitFor(() => expect(notify).toHaveBeenCalled());
    await vi.waitFor(() => expect(titles()).toEqual(['Story 3', 'Story 1']));
  });
});

describe('adding to an account collection', () => {
  const STORY = storyId(7);

  function Card() {
    const add = useAddToCollection();
    return (
      add.canAdd && (
        <button type="button" aria-label="Add to collection" onClick={() => add.open(STORY)} />
      )
    );
  }
  async function showCard() {
    const mounted = await mount(
      <HotkeysProvider>
        <AddToCollectionProvider>
          <Card />
        </AddToCollectionProvider>
      </HotkeysProvider>,
    );
    unmount = mounted.unmount;
    await vi.waitFor(() => expect(byRole('button', 'Add to collection')).not.toBeNull());
    await click(byRole('button', 'Add to collection'));
  }
  const checkboxes = () => [
    ...document.querySelectorAll<HTMLInputElement>('[role="dialog"] input[type="checkbox"]'),
  ];

  it('AC-3.4.3 ticks the boards that hold the story, once their items have loaded', async () => {
    server.rows = [row('a', 'Alpha', 0, [7]), row('b', 'Beta', 1, [1])];
    server.savedIds = [STORY];
    await showCard();
    await vi.waitFor(() => {
      expect(checkboxes()).toHaveLength(2);
      expect(checkboxes().some((box) => box.disabled)).toBe(false);
    });
    expect(checkboxes().map((box) => box.checked)).toEqual([true, false]);
  });

  it('AC-3.4.1 ticking a board adds the story with one PUT, and the story becomes saved', async () => {
    server.rows = [row('a', 'Alpha', 0), row('b', 'Beta', 1)];
    await showCard();
    await vi.waitFor(() => expect(checkboxes().some((box) => box.disabled)).toBe(false));

    await click(checkboxes()[1] ?? null);

    await vi.waitFor(() => expect(server.calls).toEqual([`PUT b ${STORY}`]));
    await vi.waitFor(() => expect(checkboxes()[1]?.checked).toBe(true));
    expect(server.savedIds).toContain(STORY);
  });

  it('AC-3.4.1 an add that fails with a 500 unticks the board and toasts', async () => {
    server.rows = [row('a', 'Alpha', 0)];
    await showCard();
    await vi.waitFor(() => expect(checkboxes().some((box) => box.disabled)).toBe(false));
    server.failing = true;

    await click(checkboxes()[0] ?? null);

    await vi.waitFor(() => expect(notify).toHaveBeenCalled());
    await vi.waitFor(() => expect(checkboxes()[0]?.checked).toBe(false));
  });
});
