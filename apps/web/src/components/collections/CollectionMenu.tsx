'use client';

import { lazy, Suspense, useState } from 'react';
import { MoreHorizontalIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { CollectionAction } from './CollectionMenuDropdown';

// Radix's dropdown is fetched on the first open, keeping it out of /saved's first-load JS.
const CollectionMenuDropdown = lazy(() =>
  import('./CollectionMenuDropdown').then((module) => ({ default: module.CollectionMenuDropdown })),
);

type CollectionMenuProps = {
  name: string;
  isFirst: boolean;
  isLast: boolean;
  /** A row the server hasn't answered for yet has no real id to act on. */
  isPending?: boolean;
  onAction: (action: CollectionAction) => void;
};

/** The "…" button of a collection row: Rename, Move up, Move down, Delete. */
export function CollectionMenu({
  name,
  isFirst,
  isLast,
  isPending = false,
  onAction,
}: CollectionMenuProps) {
  const [hasOpened, setHasOpened] = useState(false);

  function open() {
    setHasOpened(true);
  }

  // Also the Suspense fallback, so the button stays in place while the menu's chunk loads.
  const trigger = (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`Actions for ${name}`}
      aria-haspopup="menu"
      disabled={isPending}
      onClick={open}
    >
      <MoreHorizontalIcon aria-hidden="true" />
    </Button>
  );

  if (!hasOpened) return trigger;
  return (
    <Suspense fallback={trigger}>
      <CollectionMenuDropdown
        trigger={trigger}
        isFirst={isFirst}
        isLast={isLast}
        onAction={onAction}
      />
    </Suspense>
  );
}
