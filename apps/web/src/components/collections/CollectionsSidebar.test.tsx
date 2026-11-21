// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { useGuestStore } from '@/lib/guest/guestStore';
import {
  byRole,
  click,
  collection,
  mount,
  NoopResizeObserver,
  openMenuByKeyboard,
  pressKey,
  preloadLazyModules,
  seedGuestStore,
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

beforeAll(preloadLazyModules);

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
  await vi.waitFor(() =>
    expect(document.querySelector('nav[aria-label="Collections"]')).not.toBeNull(),
  );
}

const links = () =>
  [...document.querySelectorAll<HTMLAnchorElement>('nav[aria-label="Collections"] a')].map(
    (link) => [link.textContent, link.getAttribute('href')],
  );

async function openMenu(collectionName: string, item: string) {
  const trigger = byRole('button', `Actions for ${collectionName}`);
  // The first click mounts the lazily loaded menu, already open; once Radix owns the button it takes the keyboard.
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

  it('AC-3.4.1 creates a collection from the New dialog', async () => {
    await seedGuestStore([]);
    await showSidebar();
    await click(byRole('button', 'New'));
    await dialogInput();
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('New collection');

    await submitName('Reading list');

    await vi.waitFor(() => {
      expect(links()).toContainEqual(['Reading list0', '/collections/reading-list']);
      expect(document.querySelector('[role="dialog"]')).toBeNull();
    });
  });

  it('AC-3.4.1 refuses an empty name inside the dialog', async () => {
    await seedGuestStore([]);
    await showSidebar();
    await click(byRole('button', 'New'));
    await submitName('   ');
    await vi.waitFor(() =>
      expect(document.querySelector('[role="alert"]')?.textContent).toContain('1 to 60'),
    );
    expect(useGuestStore.getState().collections).toEqual([]);
  });

  it('AC-3.4.1 renaming keeps the URL', async () => {
    await seedGuestStore([collection('a', 'Reading list', 0)]);
    await showSidebar();
    await openMenu('Reading list', 'Rename');
    expect((await dialogInput()).value).toBe('Reading list');

    await submitName('Backlog');

    await vi.waitFor(() =>
      expect(links()).toContainEqual(['Backlog0', '/collections/reading-list']),
    );
  });

  it('AC-3.4.1 Move down and Move up reorder from the keyboard-reachable menu', async () => {
    await seedGuestStore([collection('a', 'Alpha', 0), collection('b', 'Beta', 1)]);
    await showSidebar();
    await openMenu('Alpha', 'Move down');
    await vi.waitFor(() => {
      expect(links().map(([text]) => text)).toEqual(['All saved0', 'Beta0', 'Alpha0']);
      expect(document.querySelector('nav [role="status"]')?.textContent).toBe(
        'Moved Alpha down, position 2 of 2.',
      );
    });

    await openMenu('Alpha', 'Move up');
    await vi.waitFor(() =>
      expect(links().map(([text]) => text)).toEqual(['All saved0', 'Alpha0', 'Beta0']),
    );
  });

  it('AC-3.4.1 focus follows a moved collection to its menu button and the move is announced', async () => {
    await seedGuestStore([collection('a', 'Alpha', 0), collection('b', 'Beta', 1)]);
    await showSidebar();

    await openMenu('Alpha', 'Move down');

    await vi.waitFor(() => {
      expect(document.activeElement).toBe(byRole('button', 'Actions for Alpha'));
      expect(document.querySelector('nav [role="status"]')?.textContent).toBe(
        'Moved Alpha down, position 2 of 2.',
      );
    });
    expect(
      byRole('button', 'Actions for Alpha')?.closest('li')?.previousElementSibling?.textContent,
    ).toContain('Beta');

    await openMenu('Alpha', 'Move up');
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(byRole('button', 'Actions for Alpha'));
      expect(document.querySelector('nav [role="status"]')?.textContent).toBe(
        'Moved Alpha up, position 1 of 2.',
      );
    });
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
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('stay saved');
    expect(useGuestStore.getState().collections).toHaveLength(1);

    await click(byRole('button', 'Delete collection'));

    await vi.waitFor(() => {
      expect(useGuestStore.getState().collections).toEqual([]);
      expect(links()).toEqual([['All saved1', '/saved']]);
    });
    expect(useGuestStore.getState().saves.map((save) => save.storyId)).toEqual([storyId(1)]);
  });

  it('AC-3.4.1 deleting the open board returns to /saved', async () => {
    await seedGuestStore([collection('a', 'Alpha', 0)]);
    await showSidebar('alpha');
    await openMenu('Alpha', 'Delete');
    // The board is left before its collection goes, so it never shows "Collection not found".
    router.push.mockImplementation(() =>
      expect(useGuestStore.getState().collections).toHaveLength(1),
    );
    await click(byRole('button', 'Delete collection'));
    await vi.waitFor(() => expect(useGuestStore.getState().collections).toEqual([]));
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith('/saved');
    expect(router.push.mock.invocationCallOrder[0]).toBeDefined();
  });

  it('refuses the 51st collection with a toast and keeps the 50', async () => {
    const fifty = Array.from({ length: 50 }, (_, index) =>
      collection(`id-${index}`, `Board ${index}`, index),
    );
    await seedGuestStore(fifty);
    await showSidebar();
    await click(byRole('button', 'New'));
    await submitName('One too many');
    await vi.waitFor(() =>
      expect(notify).toHaveBeenCalledWith(expect.stringContaining('50 collections')),
    );
    expect(useGuestStore.getState().collections).toHaveLength(50);
    // Only the limit is told: the name was fine.
    expect(document.querySelector('[role="alert"]')).toBeNull();
    expect(document.querySelector('[role="dialog"]')?.textContent ?? '').not.toContain(
      'Enter a name',
    );
  });

  it('a second Enter while a create is pending makes no duplicate', async () => {
    await seedGuestStore([]);
    await showSidebar();
    await click(byRole('button', 'New'));
    const input = await dialogInput();
    await typeInto(input, 'Reading list');

    await act(async () => {
      const form = input.closest('form')!;
      for (let submit = 0; submit < 3; submit += 1)
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
    expect(useGuestStore.getState().collections.map((c) => c.name)).toEqual(['Reading list']);
  });

  it.each([
    ['New', async () => click(byRole('button', 'New'))],
    ['Rename', async () => openMenu('Alpha', 'Rename')],
  ])('AC-3.4.1 Escape in the %s dialog returns focus to its opener', async (name, open) => {
    await seedGuestStore([collection('a', 'Alpha', 0)]);
    await showSidebar();
    if (name === 'New') byRole('button', 'New')?.focus();
    await open();
    const input = await dialogInput();

    await pressKey(input, 'Escape');

    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
    const opener = name === 'New' ? byRole('button', 'New') : byRole('button', 'Actions for Alpha');
    await vi.waitFor(() => expect(document.activeElement).toBe(opener));
  });
});
