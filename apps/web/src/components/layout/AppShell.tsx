import type { ReactNode } from 'react';
import { FilterIcon } from 'lucide-react';
import { AppHeader } from './AppHeader';
import { GoToShortcuts } from './GoToShortcuts';
import { SheetLauncher } from './SheetLauncher';
import { SidebarContent } from './SidebarContent';

type AppShellProps = {
  children: ReactNode;
  /** Slots for the search, sort, account and filter components. */
  searchSlot?: ReactNode;
  sortSlot?: ReactNode;
  accountSlot?: ReactNode;
  filtersSlot?: ReactNode;
};

export function AppShell({ children, filtersSlot, ...headerSlots }: AppShellProps) {
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader {...headerSlots} />
      {filtersSlot && (
        <div className="border-b px-3 py-2 md:hidden">
          <SheetLauncher
            side="bottom"
            title="Filters"
            description="Filter stories by tag and source"
            trigger={
              <>
                <FilterIcon /> Filters
              </>
            }
            triggerProps={{ variant: 'outline', size: 'sm' }}
          >
            {filtersSlot}
          </SheetLauncher>
        </div>
      )}
      <div className="flex w-full flex-1">
        <aside
          aria-label="Sidebar"
          className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-60 shrink-0 overflow-y-auto border-r md:block"
        >
          <SidebarContent filters={filtersSlot} />
        </aside>
        <main className="min-w-0 flex-1 px-4 py-5 md:px-8">{children}</main>
      </div>
      <GoToShortcuts />
    </div>
  );
}
