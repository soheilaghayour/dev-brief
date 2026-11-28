'use client';

import { createContext, lazy, Suspense, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { isFeatureEnabled } from '@/config/features';
import { preloadCollectionWriters, useCollections } from './useCollections';

// The dialog (and Radix Dialog with it) is fetched the first time it opens.
const loadDialog = () => import('./AddToCollectionDialog');
const AddToCollectionDialog = lazy(() =>
  loadDialog().then((module) => ({ default: module.AddToCollectionDialog })),
);

// Fetched when the browser is idle, so the dialog opens without waiting for its code.
function preloadWhenIdle() {
  function preload() {
    void loadDialog();
    preloadCollectionWriters();
  }
  if (typeof window.requestIdleCallback === 'function') {
    const handle = window.requestIdleCallback(preload);
    return () => window.cancelIdleCallback(handle);
  }
  const handle = window.setTimeout(preload, 200);
  return () => window.clearTimeout(handle);
}

type AddToCollectionState = { canAdd: boolean; open: (storyId: string) => void };

const AddToCollectionContext = createContext<AddToCollectionState>({
  canAdd: false,
  open: () => {},
});

function CollectionsEnabledProvider({ children }: { children: ReactNode }) {
  const collections = useCollections();
  const [storyId, setStoryId] = useState<string | null>(null);
  const canAdd = collections.status === 'ready';
  const state = useMemo(() => ({ canAdd, open: setStoryId }), [canAdd]);

  useEffect(() => (canAdd ? preloadWhenIdle() : undefined), [canAdd]);

  function close() {
    setStoryId(null);
  }

  return (
    <AddToCollectionContext value={state}>
      {children}
      {canAdd && storyId && (
        <Suspense fallback={null}>
          <AddToCollectionDialog storyId={storyId} onClose={close} />
        </Suspense>
      )}
    </AddToCollectionContext>
  );
}

/** Owns the "Add to collection" dialog for the whole app; with the collections flag off it renders its children alone. */
export function AddToCollectionProvider({ children }: { children: ReactNode }) {
  if (!isFeatureEnabled('collections')) return children;
  return <CollectionsEnabledProvider>{children}</CollectionsEnabledProvider>;
}

/** `canAdd` is false with the flag off and while the collections load, so cards then show no entry. */
export function useAddToCollection() {
  return useContext(AddToCollectionContext);
}
