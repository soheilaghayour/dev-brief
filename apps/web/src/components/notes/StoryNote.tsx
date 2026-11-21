'use client';

import { Suspense } from 'react';
import { useSaves } from '@/components/saves/useSaves';
import { LazyNoteEditor } from './LazyNoteEditor';

/** The note editor on the story page; the page is public and cached, so it appears on the client once the story is known to be saved. */
export function StoryNote({ storyId }: { storyId: string }) {
  const { canNote, isSaved } = useSaves();
  if (!canNote || !isSaved(storyId)) return null;
  return (
    <section aria-labelledby="story-note-heading" className="flex flex-col gap-2">
      <h2 id="story-note-heading" className="text-base font-semibold">
        Your note
      </h2>
      <Suspense fallback={null}>
        <LazyNoteEditor storyId={storyId} />
      </Suspense>
    </section>
  );
}
