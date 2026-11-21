// @vitest-environment jsdom
import { act } from 'react';
import { NOTE_MAX_LENGTH } from '@devbrief/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { byRole, click, mount } from '@/components/collections/collectionsHarness';
import { forgetAllFailedNotes } from '@/components/saves/pendingNote';
import { NoteEditor, NOTE_SAVE_DELAY_MS } from './NoteEditor';

const STORY = 'cstoryaaaaaaaaaaaaaaaaaa';
const saves = vi.hoisted(() => ({
  setNote: vi.fn(),
  setNoteNow: vi.fn(),
  prepareNoteWrites: vi.fn(),
  stored: null as string | null,
}));
vi.mock('@/components/saves/useSaves', () => ({
  useSaves: () => ({
    note: () => saves.stored,
    setNote: saves.setNote,
    setNoteNow: saves.setNoteNow,
    prepareNoteWrites: saves.prepareNoteWrites,
  }),
}));

let unmount = () => {};

beforeEach(() => {
  vi.useFakeTimers();
  saves.setNote.mockReset().mockResolvedValue('saved');
  saves.setNoteNow.mockReset();
  saves.prepareNoteWrites.mockReset();
  saves.stored = null;
  forgetAllFailedNotes();
});

afterEach(() => {
  unmount();
  vi.useRealTimers();
});

async function showEditor() {
  const mounted = await mount(<NoteEditor storyId={STORY} />);
  unmount = mounted.unmount;
}

const textarea = () => document.querySelector('textarea')!;
// What a screen reader is told, and what the eye sees.
const announced = () => document.querySelector('[role="status"]')!.textContent;
const indicator = () => document.querySelector('span[aria-hidden="true"]')!.textContent;

async function type(value: string) {
  await act(async () => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    setValue?.call(textarea(), value);
    textarea().dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('NoteEditor failed and overlapping writes', () => {
  it('AC-3.4.2 a failed write followed by close and reopen shows the unsaved text with "retrying"', async () => {
    saves.setNote.mockResolvedValue('failed');
    await showEditor();
    await type('typed text');
    await advance(NOTE_SAVE_DELAY_MS);
    expect(indicator()).toContain('retrying');

    unmount();
    unmount = () => {};
    saves.setNote.mockReset().mockResolvedValue('saved');
    await showEditor();

    expect(textarea().value).toBe('typed text');
    expect(indicator()).toContain('retrying');
  });

  it('AC-3.4.2 never shows "Saved" while a newer write is still unconfirmed', async () => {
    const answers: ((outcome: string) => void)[] = [];
    saves.setNote.mockImplementation(() => new Promise((resolve) => answers.push(resolve)));
    await showEditor();
    await type('first');
    await advance(NOTE_SAVE_DELAY_MS);
    await type('second');
    await advance(NOTE_SAVE_DELAY_MS);
    expect(answers).toHaveLength(2);

    await act(async () => answers[0]?.('saved'));
    expect(indicator()).not.toBe('Saved');
    await act(async () => answers[1]?.('saved'));
    expect(indicator()).toBe('Saved');
  });
});

describe('NoteEditor autosave', () => {
  it('AC-3.4.2 writes nothing before 800 ms and once after, from the last keystroke', async () => {
    await showEditor();

    await type('he');
    await advance(NOTE_SAVE_DELAY_MS - 1);
    await type('hello');
    await advance(NOTE_SAVE_DELAY_MS - 1);
    expect(saves.setNote).not.toHaveBeenCalled();

    await advance(1);
    expect(saves.setNote).toHaveBeenCalledTimes(1);
    expect(saves.setNote).toHaveBeenCalledWith(STORY, 'hello');
  });

  it('AC-3.4.2 flushes on blur without waiting', async () => {
    await showEditor();
    await type('hello');

    await act(async () => {
      textarea().dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });

    expect(saves.setNote).toHaveBeenCalledWith(STORY, 'hello');
    await advance(NOTE_SAVE_DELAY_MS * 2);
    expect(saves.setNote).toHaveBeenCalledTimes(1);
  });

  it('AC-3.4.2 flushes on unmount', async () => {
    await showEditor();
    await type('last words');

    unmount();

    expect(saves.setNote).toHaveBeenCalledWith(STORY, 'last words');
    unmount = () => {};
  });

  it('AC-3.4.2 the indicator goes from "Saving…" to "Saved", and only "Saved" is announced', async () => {
    await showEditor();
    expect(indicator()).toBe('');

    await type('hello');
    expect(indicator()).toBe('Saving…');
    expect(announced()).toBe('');

    await advance(NOTE_SAVE_DELAY_MS);
    expect(indicator()).toBe('Saved');
    expect(announced()).toBe('Saved');
    expect(document.querySelector('[role="status"]')?.getAttribute('aria-live')).toBe('polite');
  });

  it.each(['not-saved', 'too-long'])(
    'AC-3.4.2 a write that came back %s shows "Couldn’t save", never "Saved"',
    async (outcome) => {
      saves.setNote.mockResolvedValue(outcome);
      await showEditor();

      await type('hello');
      await advance(NOTE_SAVE_DELAY_MS);

      expect(indicator()).toBe('Couldn’t save');
      expect(announced()).toBe('Couldn’t save');
    },
  );

  it('AC-3.4.2 writes synchronously when the page is hidden or closing, with no timer wait', async () => {
    await showEditor();
    expect(saves.prepareNoteWrites).toHaveBeenCalled();

    await type('typed just now');
    await act(async () => {
      window.dispatchEvent(new Event('pagehide'));
    });

    expect(saves.setNoteNow).toHaveBeenCalledWith(STORY, 'typed just now');
    await advance(NOTE_SAVE_DELAY_MS * 2);
    expect(saves.setNote).not.toHaveBeenCalled();
  });

  it('AC-3.4.2 writes through the queue when the tab turns hidden, so it stays in order with earlier writes', async () => {
    await showEditor();
    await type('typed just now');
    const hidden = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(saves.setNote).toHaveBeenCalledWith(STORY, 'typed just now');
    expect(saves.setNoteNow).not.toHaveBeenCalled();
    hidden.mockRestore();
  });

  it('AC-3.4.2 the counter describes the note and the limit is announced', async () => {
    await showEditor();
    const describedBy = textarea().getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(describedBy)?.textContent).toContain('/ 20,000');
    const limit = document.querySelectorAll('[role="status"]')[1]!;
    expect(limit.textContent).toBe('');

    await type('x'.repeat(NOTE_MAX_LENGTH));

    expect(limit.textContent).toBe('Note limit reached');
  });

  it('AC-3.4.2 clearing the text writes null', async () => {
    saves.stored = 'old';
    await showEditor();
    expect(textarea().value).toBe('old');

    await type('');
    await advance(NOTE_SAVE_DELAY_MS);

    expect(saves.setNote).toHaveBeenCalledWith(STORY, null);
  });

  it('AC-3.4.2 input stops at 20,000 characters', async () => {
    await showEditor();

    await type('x'.repeat(NOTE_MAX_LENGTH + 5));

    expect(textarea().value).toHaveLength(NOTE_MAX_LENGTH);
    expect(textarea().maxLength).toBe(NOTE_MAX_LENGTH);
    expect(document.body.textContent).toContain('20,000 / 20,000');
    await advance(NOTE_SAVE_DELAY_MS);
    expect(saves.setNote.mock.calls[0]?.[1]).toHaveLength(NOTE_MAX_LENGTH);
  });
});

describe('NoteEditor preview', () => {
  async function preview(note: string) {
    saves.stored = note;
    await showEditor();
    await click(byRole('button', 'Preview'));
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Note preview"] div')).not.toBeNull(),
    );
    return document.querySelector('[aria-label="Note preview"]')!;
  }

  it('AC-3.4.2 renders Markdown', async () => {
    vi.useRealTimers();
    const view = await preview('Some **bold** text');
    expect(view.querySelector('strong')?.textContent).toBe('bold');
    expect(view.getAttribute('role')).toBe('region');
  });

  it('AC-3.4.2 a note heading is at most an h3, so the page outline stays intact', async () => {
    vi.useRealTimers();
    const view = await preview('# One\n\n## Two\n\n###### Six');
    expect(view.querySelector('h1, h2')).toBeNull();
    expect([...view.querySelectorAll('h3, h4, h5, h6')].map((h) => h.tagName)).toEqual([
      'H3',
      'H4',
      'H6',
    ]);
  });

  it('AC-3.4.2 an image shows its alt text instead of loading from a URL', async () => {
    vi.useRealTimers();
    const view = await preview('![a tracking pixel](https://tracker.example/p.gif)');
    expect(view.querySelector('img')).toBeNull();
    expect(view.textContent).toContain('a tracking pixel');
  });

  it('AC-3.4.2 a link with an unsafe protocol shows its text and no empty anchor', async () => {
    vi.useRealTimers();
    const view = await preview('[click me](javascript:alert(1))');
    expect(view.querySelector('a')).toBeNull();
    expect(view.textContent).toContain('click me');
  });

  it('AC-3.4.2 a note with <script>, an <img onerror> and a javascript: link renders inert', async () => {
    vi.useRealTimers();
    const view = await preview(
      [
        '<script>alert(1)</script>',
        '<img src=x onerror=alert(1)>',
        '[click](javascript:alert(1))',
        '[safe](https://example.com/a)',
      ].join('\n\n'),
    );

    expect(view.querySelector('script')).toBeNull();
    expect(view.querySelector('img')).toBeNull();
    expect(view.innerHTML).not.toContain('onerror');
    const links = [...view.querySelectorAll('a')];
    expect(links.some((link) => link.getAttribute('href')?.startsWith('javascript:'))).toBe(false);
    const safe = links.find((link) => link.getAttribute('href') === 'https://example.com/a');
    expect(safe?.getAttribute('rel')).toBe('noopener noreferrer nofollow');
    expect(safe?.getAttribute('target')).toBe('_blank');
  });

  it('AC-3.4.2 every link carries the rel values', async () => {
    vi.useRealTimers();
    const view = await preview('[a](https://a.example) and <https://b.example>');
    const links = [...view.querySelectorAll('a')];
    expect(links).toHaveLength(2);
    for (const link of links) expect(link.getAttribute('rel')).toBe('noopener noreferrer nofollow');
  });
});
