'use client';

import { FilterIcon } from 'lucide-react';
import { SheetLauncher } from '@/components/layout/SheetLauncher';
import { countActiveFilters } from './feedParams';
import { FeedFilters } from './FeedFilters';
import { SortToggle } from './SortToggle';
import { useFeedFilters } from './useFeedFilters';

/** Below 768 px: Top/Latest plus a "Filters (n)" button that opens the filters in a bottom sheet. */
export function MobileFeedBar() {
  const { filters } = useFeedFilters();
  const activeCount = countActiveFilters(filters);

  return (
    <div className="flex items-center justify-between border-b px-3 py-2 md:hidden">
      <SortToggle />
      <SheetLauncher
        side="bottom"
        title="Filters"
        description="Filter stories by tag and source"
        trigger={
          <>
            <FilterIcon /> Filters{activeCount > 0 && ` (${activeCount})`}
          </>
        }
        triggerProps={{ variant: 'outline', size: 'sm' }}
      >
        <div className="p-3">
          <FeedFilters />
        </div>
      </SheetLauncher>
    </div>
  );
}
