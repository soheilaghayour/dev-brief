'use client';

import { lazy, Suspense, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PlusIcon } from 'lucide-react';
import { useSaves } from '@/components/saves/useSaves';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import type { CollectionAction } from './CollectionMenuDropdown';
import { CollectionMenu } from './CollectionMenu';
import type { CollectionDialog } from './CollectionDialogs';
import { useCollections, type CollectionView } from './useCollections';

// The dialogs (and Radix Dialog with them) are fetched the first time one opens, keeping them out of /saved's first-load JS.
const CollectionDialogs = lazy(() =>
  import('./CollectionDialogs').then((module) => ({ default: module.CollectionDialogs })),
);

const rowLinkClass =
  'text-muted-foreground hover:bg-accent hover:text-accent-foreground flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 font-medium transition-colors';

function RowLink({
  href,
  label,
  count,
  isActive,
}: {
  href: string;
  label: string;
  count: number;
  isActive: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={isActive ? 'page' : undefined}
      className={cn(rowLinkClass, isActive && 'bg-accent text-accent-foreground')}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="text-xs tabular-nums">{count}</span>
    </Link>
  );
}

// A moved row is re-inserted, which can drop focus; the menu button of the same collection takes it back.
function focusRowMenu(collectionId: string) {
  requestAnimationFrame(() => {
    document
      .querySelector<HTMLElement>(`[data-collection-id="${CSS.escape(collectionId)}"] button`)
      ?.focus({ preventScroll: true });
  });
}

type CollectionsSidebarProps = {
  /** The slug of the board being shown; absent on /saved, where "All saved" is current. */
  activeSlug?: string;
};

/** "All saved", the guest's collections with their counts, and "+ New", with a menu to rename, reorder and delete. */
export function CollectionsSidebar({ activeSlug }: CollectionsSidebarProps) {
  const collections = useCollections();
  const saves = useSaves();
  const router = useRouter();
  const newButton = useRef<HTMLButtonElement>(null);
  const [dialog, setDialog] = useState<CollectionDialog | null>(null);
  const [announcement, setAnnouncement] = useState('');

  if (collections.status !== 'ready') return null;
  const { collections: list, move: moveInList } = collections;

  function closeDialog() {
    setDialog(null);
  }
  function openCreate() {
    setDialog({ kind: 'create' });
  }
  // The deleted row's controls are gone, so "+ New" is the nearest place to continue from.
  function afterDelete(collection: CollectionView) {
    setDialog(null);
    setAnnouncement(`Deleted collection ${collection.name}. Its stories stay saved.`);
    if (collection.slug === activeSlug) router.push('/saved');
    else requestAnimationFrame(() => newButton.current?.focus());
  }
  async function move(collection: CollectionView, direction: 'up' | 'down') {
    await moveInList(collection.id, direction);
    const from = list.findIndex(({ id }) => id === collection.id);
    const position = direction === 'up' ? from : from + 2;
    setAnnouncement(
      `Moved ${collection.name} ${direction}, position ${position} of ${list.length}.`,
    );
    focusRowMenu(collection.id);
  }
  function runAction(collection: CollectionView, action: CollectionAction) {
    if (action === 'rename') setDialog({ kind: 'rename', id: collection.id });
    else if (action === 'delete') setDialog({ kind: 'delete', id: collection.id });
    else void move(collection, action === 'moveUp' ? 'up' : 'down');
  }

  return (
    <nav aria-label="Collections" className="grid content-start gap-1 md:w-56 md:shrink-0">
      <h2 className="text-muted-foreground px-2 text-xs font-semibold tracking-wide uppercase">
        Collections
      </h2>
      <ul className="grid gap-0.5">
        <li className="flex items-center">
          <RowLink
            href="/saved"
            label="All saved"
            count={saves.ids.length}
            isActive={activeSlug === undefined}
          />
        </li>
        {list.map((collection, index) => (
          <li key={collection.id} data-collection-id={collection.id} className="flex items-center">
            <RowLink
              href={`/collections/${collection.slug}`}
              label={collection.name}
              count={collection.items.length}
              isActive={collection.slug === activeSlug}
            />
            <CollectionMenu
              name={collection.name}
              isFirst={index === 0}
              isLast={index === list.length - 1}
              onAction={(action) => runAction(collection, action)}
            />
          </li>
        ))}
      </ul>
      <Button
        ref={newButton}
        variant="ghost"
        size="sm"
        className="justify-start"
        onClick={openCreate}
      >
        <PlusIcon aria-hidden="true" />
        New
      </Button>
      <p role="status" className="sr-only">
        {announcement}
      </p>
      {dialog && (
        <Suspense fallback={null}>
          <CollectionDialogs dialog={dialog} onDeleted={afterDelete} onClose={closeDialog} />
        </Suspense>
      )}
    </nav>
  );
}
