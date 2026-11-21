// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { HotkeysProvider } from '@/lib/hotkeys/HotkeysProvider';
import { MAX_GUEST_SAVES } from '@/lib/guest/guestState';
import { useGuestStore } from '@/lib/guest/guestStore';
import {
  AddToCollectionProvider,
  AddToCollectionShortcut,
  useAddToCollection,
} from './AddToCollection';
import {
  byRole,
  click,
  collection,
  hotkeysReady,
  mount,
  NoopResizeObserver,
  pressKey,
  preloadLazyModules,
  seedGuestStore,
  storyId,
  typeInto,
} from './collectionsHarness';

const auth = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock('@/lib/auth/useMe', () => ({
  useMe: () => ({ data: auth.user, isPending: false }),
}));
const notify = vi.hoisted(() => vi.fn());
vi.mock('@/lib/toast/notify', () => ({ notify }));
// The phase flag is read when the module loads, so the test swaps the module.
const flag = vi.hoisted(() => ({ collections: true }));
vi.mock('@/config/features', () => ({
  FEATURES: {},
  isFeatureEnabled: (name: string) => name !== 'collections' || flag.collections,
}));

const STORY = storyId(1);

function Card() {
  const add = useAddToCollection();
  return (
    <div>
      <input aria-label="search" />
      <AddToCollectionShortcut storyId={STORY} />
      {add.canAdd && (
        <button type="button" aria-label="Add to collection" onClick={() => add.open(STORY)} />
      )}
    </div>
  );
}

let unmount = () => {};

beforeAll(preloadLazyModules);

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
  auth.user = null;
  flag.collections = true;
});

afterEach(() => {
  unmount();
  vi.unstubAllGlobals();
});

async function showCard() {
  const mounted = await mount(
    <HotkeysProvider>
      <AddToCollectionProvider>
        <Card />
      </AddToCollectionProvider>
    </HotkeysProvider>,
  );
  unmount = mounted.unmount;
  await hotkeysReady();
}

const dialog = () => document.querySelector('[role="dialog"]');
const dialogInput = () =>
  document.querySelector<HTMLInputElement>('[role="dialog"] input[type="text"]');
const checkboxes = () => [
  ...document.querySelectorAll<HTMLInputElement>('[role="dialog"] input[type="checkbox"]'),
];

async function openWithA() {
  await pressKey(document, 'a');
  await vi.waitFor(() => expect(dialogInput()).not.toBeNull());
}

describe('AddToCollection', () => {
  it('AC-3.4.3 a opens "Add to collection" for the active card', async () => {
    await seedGuestStore([collection('a', 'Frontend', 0)]);
    await showCard();
    expect(dialog()).toBeNull();

    await openWithA();

    expect(dialog()?.textContent).toContain('Add to collection');
    expect(document.activeElement).toBe(dialogInput());
  });

  it('AC-3.4.3 a does not fire inside an input', async () => {
    await seedGuestStore([collection('a', 'Frontend', 0)]);
    await showCard();
    const search = document.querySelector('input[aria-label="search"]')!;

    await pressKey(search, 'a');

    expect(dialog()).toBeNull();
  });

  it('AC-3.4.3 the card entry opens the same dialog', async () => {
    await seedGuestStore([collection('a', 'Frontend', 0)]);
    await showCard();
    await click(byRole('button', 'Add to collection'));
    await vi.waitFor(() => expect(dialog()).not.toBeNull());
  });

  it('AC-3.4.3 typing filters the collections', async () => {
    await seedGuestStore([
      collection('a', 'Frontend Architecture', 0),
      collection('b', 'Interview prep', 1),
      collection('c', 'Frontier tech', 2),
    ]);
    await showCard();
    await openWithA();
    expect(checkboxes()).toHaveLength(3);

    await typeInto(dialogInput()!, 'front');

    expect(checkboxes().map((box) => box.closest('label')?.textContent)).toEqual([
      'Frontend Architecture0',
      'Frontier tech0',
    ]);
  });

  it('AC-3.4.3 a checkbox adds the story to a collection and saves it first', async () => {
    await seedGuestStore([collection('a', 'Frontend', 0), collection('b', 'Interview', 1)]);
    await showCard();
    await openWithA();

    await click(checkboxes()[0] ?? null);
    // Ticked at once, before the write lands.
    expect(checkboxes()[0]?.checked).toBe(true);
    await click(checkboxes()[1] ?? null);

    await vi.waitFor(() => {
      const state = useGuestStore.getState();
      expect(state.collections.map((c) => c.items.map((item) => item.storyId))).toEqual([
        [STORY],
        [STORY],
      ]);
      expect(state.saves.map((save) => save.storyId)).toEqual([STORY]);
      expect(checkboxes().map((box) => box.checked)).toEqual([true, true]);
      expect(dialog()?.querySelector('[role="status"]')?.textContent).toBe('Added to Interview.');
    });

    await click(checkboxes()[0] ?? null);
    expect(checkboxes()[0]?.checked).toBe(false);
    await vi.waitFor(() => expect(useGuestStore.getState().collections[0]?.items).toEqual([]));
    expect(useGuestStore.getState().saves).toHaveLength(1);
  });

  it('AC-3.4.3 a refused add unticks the checkbox again and says why', async () => {
    const full = Array.from({ length: MAX_GUEST_SAVES }, (_, index) => storyId(1000 + index));
    await seedGuestStore([collection('a', 'Frontend', 0)], full);
    await showCard();
    await openWithA();

    await click(checkboxes()[0] ?? null);

    await vi.waitFor(() =>
      expect(notify).toHaveBeenCalledWith(expect.stringContaining('500 saves')),
    );
    await vi.waitFor(() => expect(checkboxes()[0]?.checked).toBe(false));
    expect(useGuestStore.getState().collections[0]?.items).toEqual([]);
  });

  it('AC-3.4.3 Enter on a name with no match creates the collection and adds the story', async () => {
    await seedGuestStore([collection('a', 'Frontend', 0)]);
    await showCard();
    await openWithA();
    await typeInto(dialogInput()!, 'Rust reading');
    expect(dialog()?.textContent).toContain('Press Enter to create “Rust reading”');

    await pressKey(dialogInput()!, 'Enter');

    await vi.waitFor(() => {
      const created = useGuestStore.getState().collections.find((c) => c.name === 'Rust reading');
      expect(created?.slug).toBe('rust-reading');
      expect(created?.items.map((item) => item.storyId)).toEqual([STORY]);
      expect(dialogInput()?.value).toBe('');
    });
    expect(useGuestStore.getState().saves.map((save) => save.storyId)).toEqual([STORY]);
  });

  it('AC-3.4.3 Enter on a name that only matches part of another collection still creates it', async () => {
    await seedGuestStore([collection('a', 'Frontend Architecture', 0)]);
    await showCard();
    await openWithA();
    await typeInto(dialogInput()!, 'Frontend');
    expect(dialog()?.querySelector('p[role="status"]:not(.sr-only)')?.textContent).toContain(
      'Press Enter to create “Frontend”',
    );

    await pressKey(dialogInput()!, 'Enter');

    await vi.waitFor(() =>
      expect(useGuestStore.getState().collections.map((c) => c.name)).toEqual([
        'Frontend Architecture',
        'Frontend',
      ]),
    );
  });

  it('a second Enter while the create is pending makes no duplicate', async () => {
    await seedGuestStore([]);
    await showCard();
    await openWithA();
    await typeInto(dialogInput()!, 'Rust reading');

    await act(async () => {
      for (let press = 0; press < 3; press += 1)
        dialogInput()!.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
        );
    });

    await vi.waitFor(() => expect(dialogInput()?.value).toBe(''));
    expect(useGuestStore.getState().collections.map((c) => c.name)).toEqual(['Rust reading']);
  });

  it('does not announce success when a created collection could not take the story', async () => {
    const full = Array.from({ length: MAX_GUEST_SAVES }, (_, index) => storyId(1000 + index));
    await seedGuestStore([], full);
    await showCard();
    await openWithA();
    await typeInto(dialogInput()!, 'Rust reading');

    await pressKey(dialogInput()!, 'Enter');

    await vi.waitFor(() =>
      expect(dialog()?.querySelector('[role="status"]')?.textContent).toBe(
        'Created Rust reading. The story was not added.',
      ),
    );
    expect(useGuestStore.getState().collections[0]?.items).toEqual([]);
  });

  it('AC-3.4.3 Enter on the name of an existing collection, in any case, creates nothing', async () => {
    await seedGuestStore([collection('a', 'Frontend', 0)]);
    await showCard();
    await openWithA();
    await typeInto(dialogInput()!, 'FRONTEND');
    expect(dialog()?.textContent).not.toContain('Press Enter to create');

    await pressKey(dialogInput()!, 'Enter');

    expect(useGuestStore.getState().collections).toHaveLength(1);
  });

  it('AC-3.4.3 Escape returns focus to the button that opened the dialog', async () => {
    await seedGuestStore([collection('a', 'Frontend', 0)]);
    await showCard();
    const opener = byRole('button', 'Add to collection')!;
    opener.focus();
    await click(opener);
    await vi.waitFor(() => expect(document.activeElement).toBe(dialogInput()));

    await pressKey(dialogInput()!, 'Escape');

    await vi.waitFor(() => expect(dialog()).toBeNull());
    await vi.waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it('offers no entry and no shortcut while the collections flag is off', async () => {
    flag.collections = false;
    await seedGuestStore([collection('a', 'Frontend', 0)]);
    await showCard();
    expect(byRole('button', 'Add to collection')).toBeNull();
    await pressKey(document, 'a');
    expect(dialog()).toBeNull();
  });
});
