// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import {
  byRole,
  click,
  hotkeysReady,
  mount,
  NoopResizeObserver,
  pressKey,
  storyId,
} from '@/components/collections/collectionsHarness';
import { useSaves } from '@/components/saves/useSaves';
import { HotkeysProvider } from '@/lib/hotkeys/HotkeysProvider';
import { useGuestStore } from '@/lib/guest/guestStore';
import { hydrateGuestStore } from '@/lib/guest/hydrateGuestStore';
import { closeNoteEditor } from './noteEditing';
import { NoteShortcut } from './NoteShortcut';
import { NoteSlot } from './NoteSlot';
import { UnsaveNoteConfirm } from './UnsaveNoteConfirm';

vi.mock('@/lib/auth/useMe', () => ({ useMe: () => ({ data: null, isPending: false }) }));
vi.mock('@/lib/toast/notify', () => ({ notify: vi.fn() }));
const flag = vi.hoisted(() => ({ collections: true }));
vi.mock('@/config/features', () => ({
  FEATURES: {},
  isFeatureEnabled: (name: string) => name !== 'collections' || flag.collections,
}));

const STORY = storyId(1);
const SAVED_AT = '2026-11-18T10:00:00.000Z';

function Card() {
  const saves = useSaves();
  function toggle() {
    saves.toggle(STORY);
  }
  return (
    <article data-story-id={STORY}>
      <a href="https://example.com">title</a>
      <input aria-label="search" />
      <button type="button" aria-label="Save story" onClick={toggle} />
      <NoteShortcut storyId={STORY} />
      <NoteSlot storyId={STORY} />
    </article>
  );
}

let unmount = () => {};

beforeAll(async () => {
  await hydrateGuestStore();
  await Promise.all([
    import('./UnsaveNoteDialog'),
    import('./NoteEditor'),
    import('@/lib/hotkeys/ShortcutBindings'),
    import('@/lib/guest/guestNotes'),
  ]);
});

beforeEach(() => {
  flag.collections = true;
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
});

afterEach(() => {
  unmount();
  act(() => closeNoteEditor());
  vi.unstubAllGlobals();
});

async function showCard(note: string | null) {
  await act(async () => {
    useGuestStore.setState({
      collections: [],
      saves: [{ storyId: STORY, savedAt: SAVED_AT }],
      notes: note ? { [STORY]: { note, updatedAt: SAVED_AT } } : {},
    });
  });
  const mounted = await mount(
    <HotkeysProvider>
      <UnsaveNoteConfirm />
      <Card />
    </HotkeysProvider>,
  );
  unmount = mounted.unmount;
  await hotkeysReady();
}

const isStored = () => useGuestStore.getState().saves.some((save) => save.storyId === STORY);
const dialog = () => document.querySelector('[role="dialog"]');

describe('unsaving a story with a note', () => {
  it('AC-3.4.1 asks first, and cancelling keeps the story and its note', async () => {
    await showCard('keep me');

    await click(byRole('button', 'Save story'));
    await vi.waitFor(() => expect(dialog()).not.toBeNull());
    expect(dialog()?.textContent).toContain('Remove this story and its note?');
    expect(isStored()).toBe(true);

    await click(byRole('button', 'Cancel'));
    await vi.waitFor(() => expect(dialog()).toBeNull());
    expect(isStored()).toBe(true);
    expect(useGuestStore.getState().notes[STORY]?.note).toBe('keep me');
  });

  it('AC-3.4.1 confirming removes the story and its note', async () => {
    await showCard('keep me');

    await click(byRole('button', 'Save story'));
    await vi.waitFor(() => expect(dialog()).not.toBeNull());
    await click(byRole('button', 'Remove story and note'));

    await vi.waitFor(() => expect(isStored()).toBe(false));
    expect(useGuestStore.getState().notes).toEqual({});
  });

  it('AC-3.4.1 without a note, unsave is instant and asks nothing', async () => {
    await showCard(null);

    await click(byRole('button', 'Save story'));

    await vi.waitFor(() => expect(isStored()).toBe(false));
    expect(dialog()).toBeNull();
  });
});

describe('the note under a card', () => {
  it('AC-3.4.2 shows a one-line preview of the note', async () => {
    await showCard('\nFirst line\nsecond line');
    expect(document.body.textContent).toContain('📝 First line');
    expect(document.body.textContent).not.toContain('second line');
  });

  it('AC-3.4.2 offers "Add note" when there is none', async () => {
    await showCard(null);
    expect(byRole('button', 'Add note')).not.toBeNull();
  });

  it('AC-3.4.2 the preview opens the editor with the text focused', async () => {
    await showCard('hello');
    await click(document.querySelector('button[title^="Edit note"]'));
    await vi.waitFor(() => expect(document.querySelector('textarea')).not.toBeNull());
    expect(document.activeElement).toBe(document.querySelector('textarea'));
  });

  it('n opens the editor on the active card', async () => {
    await showCard(null);
    expect(document.querySelector('textarea')).toBeNull();

    await pressKey(document, 'n');

    await vi.waitFor(() => expect(document.querySelector('textarea')).not.toBeNull());
  });

  it('n does not fire inside an input', async () => {
    await showCard(null);

    await pressKey(document.querySelector('input[aria-label="search"]')!, 'n');

    expect(document.querySelector('textarea')).toBeNull();
  });

  it('shows no note UI with the collections flag off', async () => {
    flag.collections = false;
    await showCard('hello');
    expect(document.body.textContent).not.toContain('hello');
    expect(byRole('button', 'Add note')).toBeNull();
  });
});
