'use client';

import { lazy, Suspense, useState } from 'react';
import type { StoryCard } from '@devbrief/shared';
import { DownloadIcon } from 'lucide-react';
import { useSaves } from '@/components/saves/useSaves';
import { Button } from '@/components/ui/Button';
import { isFeatureEnabled } from '@/config/features';
import type { DigestScope } from './DigestExportDialog';

// The dialog, the digest builder and Radix Dialog load the first time the reader opens it.
const DigestExportDialog = lazy(() =>
  import('./DigestExportDialog').then((module) => ({ default: module.DigestExportDialog })),
);

type DigestExportMenuProps = {
  stories: readonly StoryCard[];
  fixedCollection?: DigestScope;
};

/** The "Export weekly digest" button of Saved and of a board; absent with the collections flag off and for a signed-in user. */
export function DigestExportMenu({ stories, fixedCollection }: DigestExportMenuProps) {
  const { canNote } = useSaves();
  const [isOpen, setIsOpen] = useState(false);
  if (!isFeatureEnabled('collections') || !canNote) return null;

  function open() {
    setIsOpen(true);
  }
  function close() {
    setIsOpen(false);
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={open}>
        <DownloadIcon aria-hidden="true" />
        Export weekly digest
      </Button>
      {isOpen && (
        <Suspense fallback={null}>
          <DigestExportDialog stories={stories} fixedCollection={fixedCollection} onClose={close} />
        </Suspense>
      )}
    </>
  );
}
