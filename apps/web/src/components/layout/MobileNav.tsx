'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { MenuIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/Sheet';

/** Below 768 px the sidebar content moves into this sheet. */
export function MobileNav({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // Remembering the path the sheet opened on closes it after any navigation, without an effect.
  const [openedOn, setOpenedOn] = useState<string | null>(null);

  function changeOpen(open: boolean) {
    setOpenedOn(open ? pathname : null);
  }

  return (
    <Sheet open={openedOn === pathname} onOpenChange={changeOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
          <MenuIcon />
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Menu</SheetTitle>
          <SheetDescription className="sr-only">Navigation and filters</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
