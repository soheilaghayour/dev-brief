// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HotkeysProvider } from '@/lib/hotkeys/HotkeysProvider';
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
  mount,
  NoopResizeObserver,
  pressKey,
  seedGuestStore,
  settle,
  storyId,
  typeInto,
} from './collectionsHarness';

const auth = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock('@/lib/auth/useMe', () => ({
  useMe: () => ({ data: auth.user, isPending: false }),
}));
vi.mock('@/lib/toast/notify', () => ({ notify: vi.fn() }));
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
  await vi.waitFor(() => expect(document.documentElement.dataset.hotkeysReady).toBe(''), {
    timeout: 5000,
  });
  await settle();
}

const dialog = () => document.querySelector('[role="dialog"]');
const dialogInput = () =>
  document.querySelector<HTMLInputElement>('[role="dialog"] input[type="text"]');
const checkboxes = () => [
  ...document.querySelectorAll<HTMLInputElement>('[role="dialog"] input[type="checkbox"]'),
];

async function openWithA() {
  await pressKey(document, 'a');
  await vi.waitFor(() => expect(dialog()).not.toBeNull(), { timeout: 5000 });
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
    await settle();

    expect(dialog()).toBeNull();
  });

  it('AC-3.4.3 the card entry opens the same dialog', async () => {
    await seedGuestStore([collection('a', 'Frontend', 0)]);
    await showCard();
    await click(byRole('button', 'Add to collection'));
    await vi.waitFor(() => expect(dialog()).not.toBeNull(), { timeout: 5000 });
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
    await click(checkboxes()[1] ?? null);

    const state = useGuestStore.getState();
    expect(state.collections.map((c) => c.items.map((item) => item.storyId))).toEqual([
      [STORY],
      [STORY],
    ]);
    expect(state.saves.map((save) => save.storyId)).toEqual([STORY]);
    expect(checkboxes().map((box) => box.checked)).toEqual([true, true]);
    expect(dialog()?.querySelector('[role="status"]')?.textContent).toBe('Added to Interview.');

    await click(checkboxes()[0] ?? null);
    expect(useGuestStore.getState().collections[0]?.items).toEqual([]);
    expect(useGuestStore.getState().saves).toHaveLength(1);
  });

  it('AC-3.4.3 Enter on a name with no match creates the collection and adds the story', async () => {
    await seedGuestStore([collection('a', 'Frontend', 0)]);
    await showCard();
    await openWithA();
    await typeInto(dialogInput()!, 'Rust reading');
    expect(dialog()?.textContent).toContain('Press Enter to create “Rust reading”');

    await pressKey(dialogInput()!, 'Enter');

    const created = useGuestStore.getState().collections.find((c) => c.name === 'Rust reading');
    expect(created?.slug).toBe('rust-reading');
    expect(created?.items.map((item) => item.storyId)).toEqual([STORY]);
    expect(useGuestStore.getState().saves.map((save) => save.storyId)).toEqual([STORY]);
    expect(dialogInput()?.value).toBe('');
  });

  it('AC-3.4.3 Enter on a name that matches creates nothing', async () => {
    await seedGuestStore([collection('a', 'Frontend', 0)]);
    await showCard();
    await openWithA();
    await typeInto(dialogInput()!, 'front');
    await pressKey(dialogInput()!, 'Enter');
    expect(useGuestStore.getState().collections).toHaveLength(1);
  });

  it('offers no entry and no shortcut to a signed-in user', async () => {
    auth.user = { id: 'u1' };
    await seedGuestStore([collection('a', 'Frontend', 0)]);
    await showCard();
    expect(byRole('button', 'Add to collection')).toBeNull();
    await pressKey(document, 'a');
    expect(dialog()).toBeNull();
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
