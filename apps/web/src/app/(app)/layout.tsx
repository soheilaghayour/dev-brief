import type { ReactNode } from 'react';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { AppShell } from '@/components/layout/AppShell';
import { FeedFilters } from '@/components/feed/FeedFilters';
import { FeedOnly } from '@/components/feed/FeedOnly';
import { MobileFeedBar } from '@/components/feed/MobileFeedBar';
import { SearchInput } from '@/components/feed/SearchInput';
import { SortToggle } from '@/components/feed/SortToggle';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <NuqsAdapter>
      <AppShell
        searchSlot={
          <FeedOnly>
            <SearchInput />
          </FeedOnly>
        }
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
  );
}
