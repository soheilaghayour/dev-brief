'use client';

import type { ReactNode } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';

export type CollectionAction = 'rename' | 'moveUp' | 'moveDown' | 'delete';

type CollectionMenuDropdownProps = {
  trigger: ReactNode;
  isFirst: boolean;
  isLast: boolean;
  onAction: (action: CollectionAction) => void;
};

/** The open menu; Move up and Move down are the keyboard- and touch-friendly way to reorder. */
export function CollectionMenuDropdown({
  trigger,
  isFirst,
  isLast,
  onAction,
}: CollectionMenuDropdownProps) {
  return (
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onSelect={() => onAction('rename')}>Rename</DropdownMenuItem>
        <DropdownMenuItem disabled={isFirst} onSelect={() => onAction('moveUp')}>
          Move up
        </DropdownMenuItem>
        <DropdownMenuItem disabled={isLast} onSelect={() => onAction('moveDown')}>
          Move down
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onAction('delete')}>Delete</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
