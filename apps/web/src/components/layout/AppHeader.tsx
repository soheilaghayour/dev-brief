import type { ReactNode } from 'react';
import { FEATURES, isFeatureEnabled, type Features } from '@/config/features';
import { LazyCopilotLauncher } from '@/features/copilot/LazyCopilotLauncher';
import { Logo } from './Logo';
import { MenuIcon } from 'lucide-react';
import { SheetLauncher } from './SheetLauncher';
import { SidebarContent } from './SidebarContent';
import { ThemeToggle } from './ThemeToggle';

type AppHeaderProps = {
  searchSlot?: ReactNode;
  sortSlot?: ReactNode;
  accountSlot?: ReactNode;
  features?: Features;
};

export function AppHeader({
  searchSlot,
  sortSlot,
  accountSlot,
  features = FEATURES,
}: AppHeaderProps) {
  return (
    <header className="bg-background/80 sticky top-0 z-40 border-b backdrop-blur">
      <div className="flex h-14 items-center gap-2 px-3 md:px-4">
        <SheetLauncher
          side="left"
          title="Menu"
          description="Navigation"
          trigger={<MenuIcon />}
          triggerProps={{
            variant: 'ghost',
            size: 'icon',
            className: 'md:hidden',
            'aria-label': 'Open menu',
          }}
        >
          <SidebarContent />
        </SheetLauncher>
        <div className="md:w-48">
          <Logo />
        </div>
        <div className="min-w-0 flex-1">{searchSlot}</div>
        {sortSlot}
        {isFeatureEnabled('copilot', features) && <LazyCopilotLauncher />}
        <ThemeToggle />
        {accountSlot}
      </div>
    </header>
  );
}
