import type { ReactNode } from 'react';
import { Logo } from './Logo';
import { MobileNav } from './MobileNav';
import { SidebarContent } from './SidebarContent';
import { ThemeToggle } from './ThemeToggle';

type AppHeaderProps = {
  searchSlot?: ReactNode;
  sortSlot?: ReactNode;
  accountSlot?: ReactNode;
  filtersSlot?: ReactNode;
};

export function AppHeader({ searchSlot, sortSlot, accountSlot, filtersSlot }: AppHeaderProps) {
  return (
    <header className="bg-background/80 sticky top-0 z-40 border-b backdrop-blur">
      <div className="flex h-14 items-center gap-2 px-3 md:px-4">
        <MobileNav>
          <SidebarContent filters={filtersSlot} />
        </MobileNav>
        <div className="md:w-48">
          <Logo />
        </div>
        <div className="min-w-0 flex-1">{searchSlot}</div>
        {sortSlot}
        <ThemeToggle />
        {accountSlot}
      </div>
    </header>
  );
}
