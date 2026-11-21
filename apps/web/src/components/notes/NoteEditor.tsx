'use client';

import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react';
import { NOTE_MAX_LENGTH } from '@devbrief/shared';
import { useSaves } from '@/components/saves/useSaves';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';

// react-markdown is fetched the first time the reader previews.
const NotePreview = lazy(() =>
  import('./NotePreview').then((module) => ({ default: module.NotePreview })),
);

export const NOTE_SAVE_DELAY_MS = 800;

type NoteEditorProps = {
  storyId: string;
  /** Moves focus into the text when the editor opens from a click or `n`. */
  focusOnOpen?: boolean;
  /** Called on Esc and on the Done button; absent where the editor stays open. */
  onDone?: () => void;
};

type SaveStatus = 'idle' | 'saving' | 'saved';

const STATUS_TEXT = { idle: '', saving: 'Saving…', saved: 'Saved' } satisfies Record<
  SaveStatus,
  string
>;

/** Write and Preview for one story's note, saved 800 ms after the last keystroke, on blur and on unmount. */
export function NoteEditor({ storyId, focusOnOpen = false, onDone }: NoteEditorProps) {
  const { note, setNote } = useSaves();
  const [text, setText] = useState(() => note(storyId) ?? '');
  const [view, setView] = useState<'write' | 'preview'>('write');
  const [status, setStatus] = useState<SaveStatus>('idle');
  // The text not written yet, or null; kept in refs so blur and unmount flush what the last render didn't see.
  const unsaved = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const write = useRef(setNote);
  useEffect(() => {
    write.current = setNote;
  });

  async function flush() {
    clearTimeout(timer.current);
    const value = unsaved.current;
    if (value === null) return;
    unsaved.current = null;
    await write.current(storyId, value === '' ? null : value);
    setStatus(unsaved.current === null ? 'saved' : 'saving');
  }

  useEffect(() => {
    if (focusOnOpen) textarea.current?.focus();
  }, [focusOnOpen]);

  // Unmounting (leaving the page, closing the editor) must not lose the last keystrokes.
  useEffect(
    () => () => {
      void flush();
    },
    [storyId],
  );

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const value = event.target.value.slice(0, NOTE_MAX_LENGTH);
    setText(value);
    unsaved.current = value;
    setStatus('saving');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), NOTE_SAVE_DELAY_MS);
  }
  function handleBlur() {
    void flush();
  }
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Escape' && onDone) onDone();
  }
  function showWrite() {
    setView('write');
  }
  function showPreview() {
    setView('preview');
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div
          role="group"
          aria-label="Note view"
          className="bg-muted inline-flex rounded-md border p-0.5"
        >
          <Button variant="segment" size="sm" aria-pressed={view === 'write'} onClick={showWrite}>
            Write
          </Button>
          <Button
            variant="segment"
            size="sm"
            aria-pressed={view === 'preview'}
            onClick={showPreview}
          >
            Preview
          </Button>
        </div>
        <span role="status" aria-live="polite" className="text-muted-foreground text-xs">
          {STATUS_TEXT[status]}
        </span>
      </div>
      {view === 'write' ? (
        <Textarea
          aria-label="Note"
          placeholder="Write a note in Markdown…"
          value={text}
          maxLength={NOTE_MAX_LENGTH}
          ref={textarea}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
        />
      ) : (
        <div className="min-h-28 rounded-md border px-3 py-2" aria-label="Note preview">
          {text === '' ? (
            <p className="text-muted-foreground text-sm">Nothing to preview.</p>
          ) : (
            <Suspense fallback={null}>
              <NotePreview note={text} />
            </Suspense>
          )}
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-xs">
          {text.length.toLocaleString('en-US')} / {NOTE_MAX_LENGTH.toLocaleString('en-US')}
        </span>
        {onDone && (
          <Button variant="outline" size="sm" onClick={onDone}>
            Done
          </Button>
        )}
      </div>
    </div>
  );
}
