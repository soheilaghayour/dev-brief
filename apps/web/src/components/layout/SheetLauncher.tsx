'use client';

import dynamic from 'next/dynamic';
import { useRef, useState } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/Button';

// Radix Dialog is only fetched the first time a sheet opens, keeping it out of first-load JS.
const SheetPanel = dynamic(() => import('./SheetPanel').then((module) => module.SheetPanel));

type SheetLauncherProps = {
  side: ComponentProps<typeof SheetPanel>['side'];
  title: string;
  description: string;
  /** The trigger button's content. */
  trigger: ReactNode;
  triggerProps: Omit<ComponentProps<typeof Button>, 'children' | 'onClick'>;
  /** The sheet body, rendered only while the sheet is open. */
  children: ReactNode;
};

/** A button that opens a sheet whose code loads on first use. */
export function SheetLauncher({
  side,
  title,
  description,
  trigger,
  triggerProps,
  children,
}: SheetLauncherProps) {
  const pathname = usePathname();
  // Remembering the path the sheet opened on closes it after any navigation, without an effect.
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const [hasOpened, setHasOpened] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function open() {
    setOpenedOn(pathname);
    setHasOpened(true);
  }

  function changeOpen(isOpen: boolean) {
    setOpenedOn(isOpen ? pathname : null);
  }

  function returnFocusToTrigger(event: Event) {
    event.preventDefault();
    triggerRef.current?.focus();
  }

  return (
    <>
      <Button ref={triggerRef} aria-haspopup="dialog" {...triggerProps} onClick={open}>
        {trigger}
      </Button>
      {hasOpened && (
        <SheetPanel
          side={side}
          title={title}
          description={description}
          open={openedOn === pathname}
          onOpenChange={changeOpen}
          onCloseAutoFocus={returnFocusToTrigger}
        >
          {children}
        </SheetPanel>
      )}
    </>
  );
}
