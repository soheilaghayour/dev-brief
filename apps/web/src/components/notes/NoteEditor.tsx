'use client';

import {
  lazy,
  Suspense,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react';
import { NOTE_MAX_LENGTH } from '@devbrief/shared';
import {
  failedNote,
  forgetFailedNote,
  registerPendingNote,
  rememberFailedNote,
} from '@/components/saves/pendingNote';
import { useNoteLoaded } from '@/components/saves/useNoteLoaded';
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
  /** Moves focus into the text when the editor opens from a click. */
  focusOnOpen?: boolean;
  /** Called on Esc and on the Done button; absent where the editor stays open. */
  onDone?: () => void;
};

type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed' | 'retrying';

const STATUS_TEXT = {
  idle: '',
  saving: 'Saving…',
  saved: 'Saved',
  failed: 'Couldn’t save',
  retrying: 'Couldn’t save note — retrying',
} satisfies Record<SaveStatus, string>;

// "Saving…" is for the eyes only: announcing every pause in typing would talk over the reader.
const ANNOUNCEMENT = {
  idle: '',
  saving: '',
  saved: 'Saved',
  failed: 'Couldn’t save',
  retrying: 'Couldn’t save note — retrying',
} satisfies Record<SaveStatus, string>;

/** Write and Preview for one story's note, once the note is known (an account's may still be loading). */
export function NoteEditor(props: NoteEditorProps) {
  const isLoaded = useNoteLoaded(props.storyId);
  return isLoaded ? <NoteForm {...props} /> : null;
}

/** Saves 800 ms after the last keystroke, on blur and on unmount; a failed account write keeps the text and tries again on the next change or blur. */
function NoteForm({ storyId, focusOnOpen = false, onDone }: NoteEditorProps) {
  const { note, setNote, setNoteNow, prepareNoteWrites } = useSaves();
  const counterId = useId();
  // A write that failed before the editor was closed leaves its text behind: it shows again and is sent again.
  const [failedText] = useState(() => failedNote(storyId));
  const [text, setText] = useState(() => failedText ?? note(storyId) ?? '');
  const [view, setView] = useState<'write' | 'preview'>('write');
  const [status, setStatus] = useState<SaveStatus>(failedText === undefined ? 'idle' : 'retrying');
  // The text not written yet, or null; kept in refs so blur and unmount flush what the last render didn't see.
  const unsaved = useRef<string | null>(failedText ?? null);
  const writesInFlight = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const writers = useRef({ setNote, setNoteNow, prepareNoteWrites });
  useEffect(() => {
    writers.current = { setNote, setNoteNow, prepareNoteWrites };
  });

  async function flush() {
    clearTimeout(timer.current);
    const value = unsaved.current;
    if (value === null) return;
    unsaved.current = null;
    writesInFlight.current += 1;
    const outcome = await writers.current.setNote(storyId, value === '' ? null : value);
    writesInFlight.current -= 1;
    if (outcome === 'failed') {
      // Typed text is never dropped: unless newer text came in meanwhile, the next change or blur sends it again.
      if (unsaved.current === null) unsaved.current = value;
      rememberFailedNote(storyId, unsaved.current);
      setStatus('retrying');
    } else if (outcome === 'not-saved' || outcome === 'too-long') setStatus('failed');
    else {
      if (unsaved.current === null) forgetFailedNote(storyId);
      // "Saved" only once the newest text is confirmed: an older write answering says nothing about it.
      setStatus(unsaved.current === null && writesInFlight.current === 0 ? 'saved' : 'saving');
    }
  }

  useEffect(() => {
    if (focusOnOpen) textarea.current?.focus();
  }, [focusOnOpen]);

  // Load the writer now, so the write as the page closes can be synchronous.
  useEffect(() => {
    writers.current.prepareNoteWrites();
  }, []);

  // Unmounting (leaving the page, closing the editor) must not lose the last keystrokes.
  useEffect(
    () => () => {
      void flush();
    },
    [storyId],
  );

  // Lets a decision about the note (unsaving the story) see what is typed but not written yet.
  useEffect(() => registerPendingNote(flush), [storyId]);

  // A reload or a closing tab can't wait for an async write: write synchronously, with the writer loaded when the editor opened.
  useEffect(() => {
    function writeBeforeLeaving() {
      const value = unsaved.current;
      if (value === null) return;
      unsaved.current = null;
      clearTimeout(timer.current);
      writers.current.setNoteNow(storyId, value === '' ? null : value);
    }
    // A hidden page may come back, so it writes through the queue like any other write; only a closing page needs the request that outlives it.
    function writeWhenHidden() {
      if (document.visibilityState === 'hidden') void flush();
    }
    window.addEventListener('pagehide', writeBeforeLeaving);
    document.addEventListener('visibilitychange', writeWhenHidden);
    return () => {
      window.removeEventListener('pagehide', writeBeforeLeaving);
      document.removeEventListener('visibilitychange', writeWhenHidden);
    };
  }, [storyId]);

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
        <span aria-hidden="true" className="text-muted-foreground text-xs">
          {STATUS_TEXT[status]}
        </span>
        <span role="status" aria-live="polite" className="sr-only">
          {ANNOUNCEMENT[status]}
        </span>
      </div>
      {view === 'write' ? (
        <Textarea
          aria-label="Note"
          placeholder="Write a note in Markdown…"
          value={text}
          maxLength={NOTE_MAX_LENGTH}
          aria-describedby={counterId}
          ref={textarea}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
        />
      ) : (
        <div
          role="region"
          aria-label="Note preview"
          className="min-h-28 rounded-md border px-3 py-2"
        >
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
        <span id={counterId} className="text-muted-foreground text-xs">
          {text.length.toLocaleString('en-US')} / {NOTE_MAX_LENGTH.toLocaleString('en-US')}
        </span>
        <span role="status" aria-live="polite" className="sr-only">
          {text.length >= NOTE_MAX_LENGTH ? 'Note limit reached' : ''}
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
