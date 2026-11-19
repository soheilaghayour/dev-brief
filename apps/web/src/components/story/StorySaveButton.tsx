'use client';

import { SaveButton } from '@/components/saves/SaveButton';
import { useSaves } from '@/components/saves/useSaves';

/** The story page's Save button; the client boundary exists because it reads the saves. */
export function StorySaveButton({ storyId }: { storyId: string }) {
  const saves = useSaves();

  function toggleSave() {
    saves.toggle(storyId);
  }

  return <SaveButton isSaved={saves.isSaved(storyId)} onToggleSave={toggleSave} withLabel />;
}
