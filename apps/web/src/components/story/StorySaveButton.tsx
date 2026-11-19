'use client';

import { SaveButton } from '@/components/feed/SaveButton';

// Saving arrives with the saves module; until then the story is unsaved and the button does nothing.
function ignoreSave() {}

/** The story page's Save button; the client boundary exists because it hands the button a handler. */
export function StorySaveButton() {
  return <SaveButton isSaved={false} onToggleSave={ignoreSave} withLabel />;
}
