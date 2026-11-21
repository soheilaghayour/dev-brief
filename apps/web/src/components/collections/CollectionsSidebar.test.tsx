// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGuestStore } from '@/lib/guest/guestStore';
import {
  byRole,
  click,
  collection,
  mount,
  NoopResizeObserver,
  openMenuByKeyboard,
  seedGuestStore,
  settle,
  storyId,
  typeInto,
} from './collectionsHarness';
import { CollectionsSidebar } from './CollectionsSidebar';

const auth = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock('@/lib/auth/useMe', () => ({
  useMe: () => ({ data: auth.user, isPending: false }),
}));
const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
const notify = vi.hoisted(() => vi.fn());
vi.mock('@/lib/toast/notify', () => ({ notify }));

let unmount = () => {};

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
  auth.user = null;
});

afterEach(() => {
  unmount();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function showSidebar(activeSlug?: string) {
  const mounted = await mount(<CollectionsSidebar activeSlug={activeSlug} />);
  unmount = mounted.unmount;
  await settle();
}

const links = () =>
  [...document.querySelectorAll<HTMLAnchorElement>('nav[aria-label="Collections"] a')].map(
    (link) => [link.textContent, link.getAttribute('href')],
  );

async function openMenu(collectionName: string, item: string) {
  const trigger = byRole('button', `Actions for ${collectionName}`);
  await click(trigger);
  // The first click opens the lazily loaded menu; later opens go through Radix's own handlers.
  if (!document.querySelector('[role="menu"]')) await openMenuByKeyboard(trigger);
  await click(byRole('[role="menuitem"]', item));
}

async function dialogInput() {
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"] input')).not.toBeNull(), {
    timeout: 5000,
  });
  return document.querySelector<HTMLInputElement>('[role="dialog"] input')!;
}

async function submitName(name: string) {
  await typeInto(await dialogInput(), name);
  await click(document.querySelector('[role="dialog"] button[type="submit"]'));
}

describe('CollectionsSidebar', () => {
  it('AC-3.4.1 lists All saved and each collection with its count', async () => {
    await seedGuestStore(
      [
        collection('a', 'Frontend Architecture', 0, [storyId(1), storyId(2)]),
        collection('b', 'Interview', 1),
      ],
      [storyId(1), storyId(2), storyId(3)],
    );
    await showSidebar();
    expect(links()).toEqual([
      ['All saved3', '/saved'],
      ['Frontend Architecture2', '/collections/frontend-architecture'],
      ['Interview0', '/collections/interview'],
    ]);
    expect(byRole('button', 'New')).not.toBeNull();
  });

  it('AC-3.4.1 renders nothing for a signed-in user, whose collections are unavailable', async () => {
    auth.user = { id: 'u1' };
    await seedGuestStore([collection('a', 'Mine', 0)]);
    await showSidebar();
    expect(document.querySelector('nav[aria-label="Collections"]')).toBeNull();
  });

  it('AC-3.4.1 creates a collection from the New dialog', async () => {
    await seedGuestStore([]);
    await showSidebar();
    await click(byRole('button', 'New'));
    await dialogInput();
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('New collection');

    await submitName('Reading list');

    expect(links()).toContainEqual(['Reading list0', '/collections/reading-list']);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('AC-3.4.1 refuses an empty name inside the dialog', async () => {
    await seedGuestStore([]);
    await showSidebar();
    await click(byRole('button', 'New'));
    await submitName('   ');
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('1 to 60');
    expect(useGuestStore.getState().collections).toEqual([]);
  });

  it('AC-3.4.1 renaming keeps the URL', async () => {
    await seedGuestStore([collection('a', 'Reading list', 0)]);
    await showSidebar();
    await openMenu('Reading list', 'Rename');
    expect((await dialogInput()).value).toBe('Reading list');

    await submitName('Backlog');

    expect(links()).toContainEqual(['Backlog0', '/collections/reading-list']);
  });

  it('AC-3.4.1 Move down and Move up reorder from the keyboard-reachable menu', async () => {
    await seedGuestStore([collection('a', 'Alpha', 0), collection('b', 'Beta', 1)]);
    await showSidebar();
    await openMenu('Alpha', 'Move down');
    expect(links().map(([text]) => text)).toEqual(['All saved0', 'Beta0', 'Alpha0']);
    expect(document.querySelector('nav [role="status"]')?.textContent).toBe(
      'Moved Alpha down, position 2 of 2.',
    );

    await openMenu('Alpha', 'Move up');
    expect(links().map(([text]) => text)).toEqual(['All saved0', 'Alpha0', 'Beta0']);
  });

  it('AC-3.4.1 disables Move up on the first collection and Move down on the last', async () => {
    await seedGuestStore([collection('a', 'Alpha', 0), collection('b', 'Beta', 1)]);
    await showSidebar();
    await click(byRole('button', 'Actions for Alpha'));
    expect(byRole('[role="menuitem"]', 'Move up')?.getAttribute('aria-disabled')).toBe('true');
    expect(byRole('[role="menuitem"]', 'Move down')?.getAttribute('aria-disabled')).toBeNull();
  });

  it('AC-3.4.1 deleting asks first, says the saves stay, and keeps the saved stories', async () => {
    await seedGuestStore([collection('a', 'Alpha', 0, [storyId(1)])], [storyId(1)]);
    await showSidebar();
    await openMenu('Alpha', 'Delete');
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull(), {
      timeout: 5000,
    });
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('stay saved');
    expect(useGuestStore.getState().collections).toHaveLength(1);

    await click(byRole('button', 'Delete collection'));

    expect(useGuestStore.getState().collections).toEqual([]);
    expect(useGuestStore.getState().saves.map((save) => save.storyId)).toEqual([storyId(1)]);
    expect(links()).toEqual([['All saved1', '/saved']]);
  });

  it('AC-3.4.1 deleting the open board returns to /saved', async () => {
    await seedGuestStore([collection('a', 'Alpha', 0)]);
    await showSidebar('alpha');
    await openMenu('Alpha', 'Delete');
    await click(byRole('button', 'Delete collection'));
    expect(router.push).toHaveBeenCalledWith('/saved');
  });

  it('refuses the 51st collection with a toast and keeps the 50', async () => {
    const fifty = Array.from({ length: 50 }, (_, index) =>
      collection(`id-${index}`, `Board ${index}`, index),
    );
    await seedGuestStore(fifty);
    await showSidebar();
    await click(byRole('button', 'New'));
    await submitName('One too many');
    expect(useGuestStore.getState().collections).toHaveLength(50);
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('50 collections'));
  });
});
