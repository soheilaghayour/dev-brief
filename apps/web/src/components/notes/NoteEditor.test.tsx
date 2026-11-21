// @vitest-environment jsdom
import { act } from 'react';
import { NOTE_MAX_LENGTH } from '@devbrief/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { byRole, click, mount } from '@/components/collections/collectionsHarness';
import { NoteEditor, NOTE_SAVE_DELAY_MS } from './NoteEditor';

const STORY = 'cstoryaaaaaaaaaaaaaaaaaa';
const saves = vi.hoisted(() => ({ setNote: vi.fn(), stored: null as string | null }));
vi.mock('@/components/saves/useSaves', () => ({
  useSaves: () => ({ note: () => saves.stored, setNote: saves.setNote }),
}));

let unmount = () => {};

beforeEach(() => {
  vi.useFakeTimers();
  saves.setNote.mockReset().mockResolvedValue('saved');
  saves.stored = null;
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
const status = () => document.querySelector('[role="status"]')!.textContent;

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

  it('AC-3.4.2 the indicator goes from "Saving…" to "Saved"', async () => {
    await showEditor();
    expect(status()).toBe('');

    await type('hello');
    expect(status()).toBe('Saving…');

    await advance(NOTE_SAVE_DELAY_MS);
    expect(status()).toBe('Saved');
    expect(document.querySelector('[role="status"]')?.getAttribute('aria-live')).toBe('polite');
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
    const view = await preview('# Title\n\nSome **bold** text');
    expect(view.querySelector('h1')?.textContent).toBe('Title');
    expect(view.querySelector('strong')?.textContent).toBe('bold');
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
