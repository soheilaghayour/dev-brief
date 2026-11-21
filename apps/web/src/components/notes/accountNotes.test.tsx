// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  byRole,
  click,
  mount,
  NoopResizeObserver,
  storyId,
} from '@/components/collections/collectionsHarness';
import { useSaves } from '@/components/saves/useSaves';
import { StoryNote } from './StoryNote';
import { UnsaveNoteConfirm } from './UnsaveNoteConfirm';

vi.mock('@/lib/auth/useMe', () => ({ useMe: () => ({ data: { id: 'u1' }, isPending: false }) }));
const notify = vi.hoisted(() => vi.fn());
vi.mock('@/lib/toast/notify', () => ({ notify }));
vi.mock('@/config/features', () => ({ FEATURES: {}, isFeatureEnabled: () => true }));

const STORY = storyId(1);
const SAVED_AT = '2026-11-18T10:00:00.000Z';

// A fake account: the endpoints answer from this state, and a test can fail the PATCH.
const server = vi.hoisted(() => ({
  note: null as string | null,
  failPatch: false,
  getGate: null as Promise<void> | null,
  calls: [] as string[],
}));

vi.mock('@/lib/api/endpoints', () => ({
  getSaveIds: async () => ({ ids: [STORY] }),
  getSave: async () => {
    server.calls.push('GET');
    await server.getGate;
    return { storyId: STORY, savedAt: SAVED_AT, note: server.note, noteUpdatedAt: null };
  },
  patchSaveNote: async (_id: string, body: { note: string | null }) => {
    server.calls.push(`PATCH ${JSON.stringify(body.note)}`);
    if (server.failPatch) throw new Error('500');
    server.note = body.note;
    return { storyId: STORY, savedAt: SAVED_AT, note: body.note, noteUpdatedAt: SAVED_AT };
  },
  putSave: async () => ({ storyId: STORY, savedAt: SAVED_AT }),
  deleteSave: async () => {
    server.calls.push('DELETE');
  },
}));

let unmount = () => {};

beforeAll(async () => {
  await Promise.all([import('./NoteEditor'), import('./UnsaveNoteDialog')]);
});

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
  server.note = null;
  server.failPatch = false;
  server.getGate = null;
  server.calls = [];
});

afterEach(() => {
  unmount();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const textarea = () => document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Note"]');
const statusText = () => document.body.textContent ?? '';

async function showStoryNote() {
  const mounted = await mount(<StoryNote storyId={STORY} />);
  unmount = mounted.unmount;
}

async function type(text: string) {
  await act(async () => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    setValue?.call(textarea(), text);
    textarea()?.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function blur() {
  await act(async () => {
    textarea()?.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
}

describe('an account note on the story page', () => {
  it('AC-3.4.2 loads the story’s note with one GET, and shows it in the editor', async () => {
    server.note = 'from the account';
    await showStoryNote();
    await vi.waitFor(() => expect(textarea()?.value).toBe('from the account'));
    expect(server.calls).toEqual(['GET']);
  });

  it('AC-3.4.2 does not open an empty editor over a note that has not loaded yet', async () => {
    server.note = 'from the account';
    let answer = () => {};
    server.getGate = new Promise<void>((resolve) => {
      answer = resolve;
    });
    await showStoryNote();
    await vi.waitFor(() => expect(server.calls).toEqual(['GET']));
    // Before the GET answers there is no textarea to type over the real note.
    expect(textarea()).toBeNull();

    answer();
    await vi.waitFor(() => expect(textarea()?.value).toBe('from the account'));
  });

  it('AC-3.4.2 sends one PATCH per debounce, with the last text', async () => {
    await showStoryNote();
    await vi.waitFor(() => expect(textarea()).not.toBeNull());

    await type('a');
    await type('ab');
    await type('abc');
    expect(server.calls).toEqual(['GET']);

    await vi.waitFor(() => expect(server.calls).toEqual(['GET', 'PATCH "abc"']), { timeout: 3000 });
    await vi.waitFor(() => expect(statusText()).toContain('Saved'));
    // Nothing more follows: the one write was the whole burst.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(server.calls).toEqual(['GET', 'PATCH "abc"']);
  });

  it('AC-3.4.2 clearing the text sends null, so the account holds no note', async () => {
    server.note = 'old';
    await showStoryNote();
    await vi.waitFor(() => expect(textarea()?.value).toBe('old'));

    await type('');
    await blur();

    await vi.waitFor(() => expect(server.calls).toContain('PATCH null'));
    expect(server.note).toBeNull();
  });

  it('AC-3.4.2 a failed PATCH keeps the typed text, says it is retrying, and sends again on blur', async () => {
    server.failPatch = true;
    await showStoryNote();
    await vi.waitFor(() => expect(textarea()).not.toBeNull());

    await type('typed text');
    await blur();
    await vi.waitFor(() => expect(statusText()).toContain('Couldn’t save note — retrying'));
    expect(textarea()?.value).toBe('typed text');
    expect(server.note).toBeNull();

    server.failPatch = false;
    await blur();
    await vi.waitFor(() => expect(server.note).toBe('typed text'));
    await vi.waitFor(() => expect(statusText()).not.toContain('retrying'));
    expect(server.calls.filter((call) => call.startsWith('PATCH'))).toEqual([
      'PATCH "typed text"',
      'PATCH "typed text"',
    ]);
  });

  it('AC-3.4.2 a failed PATCH is also sent again with the next change', async () => {
    server.failPatch = true;
    await showStoryNote();
    await vi.waitFor(() => expect(textarea()).not.toBeNull());
    await type('first');
    await blur();
    await vi.waitFor(() => expect(statusText()).toContain('retrying'));

    server.failPatch = false;
    await type('first, then more');
    await vi.waitFor(() => expect(server.note).toBe('first, then more'), { timeout: 3000 });
  });
});

describe('unsaving an account story with a note', () => {
  function Card() {
    const saves = useSaves();
    return (
      <div>
        <button
          type="button"
          aria-label="Unsave"
          onClick={() => saves.toggle(STORY, { title: 'Story one' })}
        />
        <UnsaveNoteConfirm />
      </div>
    );
  }
  async function showCard() {
    const mounted = await mount(<Card />);
    unmount = mounted.unmount;
    await vi.waitFor(() => expect(byRole('button', 'Unsave')).not.toBeNull());
    // The ids load first: a toggle before them would count as a save.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
  }

  it('AC-3.4.1 asks first when the account holds a note, and cancelling keeps the save', async () => {
    server.note = 'worth keeping';
    await showCard();
    await click(byRole('button', 'Unsave'));
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
    expect(server.calls).toEqual(['GET']);

    await click(byRole('button', 'Cancel'));
    expect(server.calls).toEqual(['GET']);
  });

  it('AC-3.4.1 confirming removes the story, with its note', async () => {
    server.note = 'worth keeping';
    await showCard();
    await click(byRole('button', 'Unsave'));
    await vi.waitFor(() => expect(byRole('button', 'Remove story and note')).not.toBeNull());

    await click(byRole('button', 'Remove story and note'));

    await vi.waitFor(() => expect(server.calls).toContain('DELETE'));
  });

  it('AC-3.4.1 without a note, unsave is instant and asks nothing', async () => {
    await showCard();
    await click(byRole('button', 'Unsave'));
    await vi.waitFor(() => expect(server.calls).toContain('DELETE'));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});
