import type { ReactNode } from 'react';
import { QueryProvider } from '@/components/layout/QueryProvider';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { LazyAccountSlot } from '@/components/account/LazyAccountSlot';
import { GuestStoreHydrator } from '@/components/saves/GuestStoreHydrator';
import { AppShell } from '@/components/layout/AppShell';
import { FeedFilters } from '@/components/feed/FeedFilters';
import { FeedOnly } from '@/components/feed/FeedOnly';
import { MobileFeedBar } from '@/components/feed/MobileFeedBar';
import { SearchInput } from '@/components/feed/SearchInput';
import { SortToggle } from '@/components/feed/SortToggle';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <NuqsAdapter>
        <GuestStoreHydrator />
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
      </NuqsAdapter>
    </QueryProvider>
  );
}
