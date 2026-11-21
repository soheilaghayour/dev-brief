import type { ReactNode } from 'react';
import { LazyToaster } from '@/components/layout/LazyToaster';
import { HotkeysProvider } from '@/lib/hotkeys/HotkeysProvider';
import { QueryProvider } from '@/components/layout/QueryProvider';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { LazyAccountSlot } from '@/components/account/LazyAccountSlot';
import { AddToCollectionProvider } from '@/components/collections/AddToCollection';
import { LazyUnsaveNoteConfirm } from '@/components/notes/LazyNotes';
import { isFeatureEnabled } from '@/config/features';
import { GuestStoreHydrator } from '@/components/saves/GuestStoreHydrator';
import { AppShell } from '@/components/layout/AppShell';
import { FeedFilters } from '@/components/feed/FeedFilters';
import { FeedOnly } from '@/components/feed/FeedOnly';
import { MobileFeedBar } from '@/components/feed/MobileFeedBar';
import { SearchInput } from '@/components/feed/SearchInput';
import { SortToggle } from '@/components/feed/SortToggle';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <HotkeysProvider>
      <QueryProvider>
        <NuqsAdapter>
          <GuestStoreHydrator />
          {isFeatureEnabled('collections') && <LazyUnsaveNoteConfirm />}
          <AddToCollectionProvider>
            <AppShell
              searchSlot={
                <FeedOnly>
                  <SearchInput />
                </FeedOnly>
              }
              accountSlot={<LazyAccountSlot />}
              sortSlot={
                <FeedOnly>
                  <SortToggle className="max-md:hidden" />
                </FeedOnly>
              }
              filtersSlot={
                <FeedOnly>
                  <FeedFilters />
                </FeedOnly>
              }
              mobileBarSlot={
                <FeedOnly>
                  <MobileFeedBar />
                </FeedOnly>
              }
            >
              {children}
            </AppShell>
          </AddToCollectionProvider>
        </NuqsAdapter>
      </QueryProvider>
      <LazyToaster />
    </HotkeysProvider>
  );
}
