'use client';

import type { ComponentProps, ReactNode } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/Sheet';

type SheetPanelProps = {
  side: ComponentProps<typeof SheetContent>['side'];
  title: string;
  description: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus: (event: Event) => void;
  children: ReactNode;
};

export function SheetPanel({
  side,
  title,
  description,
  open,
  onOpenChange,
  onCloseAutoFocus,
  children,
}: SheetPanelProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={side} onCloseAutoFocus={onCloseAutoFocus}>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription className="sr-only">{description}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
